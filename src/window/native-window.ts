import { App, Notice, TAbstractFile, TFile, normalizePath } from "obsidian";
import {
	ElectronBrowserWindowInstance,
	ElectronRectangle,
	getRemote,
} from "../electron/utils";
import { buildEditorHTML } from "./editor-html";
import { PebbleSettings } from "../settings";

const POPOUT_WIDTH = 420;
const POPOUT_HEIGHT = 320;
const WINDOW_MARGIN = 8;

export class NativeWindow {
	private win: ElectronBrowserWindowInstance | null = null;
	private opening = false;
	private app: App;
	private readSettings: () => PebbleSettings;
	private noteFile: TFile | null = null;
	private syncInterval: number | null = null;
	private isSaving = false;
	private suppressModifyUntil = 0;
	private lastKnownContent = "";

	constructor(app: App, readSettings: () => PebbleSettings) {
		this.app = app;
		this.readSettings = readSettings;
	}

	async toggle(anchorBounds?: ElectronRectangle): Promise<void> {
		if (this.opening) {
			return;
		}

		if (this.isOpen()) {
			this.close();
			return;
		}
		await this.open(anchorBounds);
	}

	close(): void {
		this.stopSyncLoop();
		this.noteFile = null;
		this.lastKnownContent = "";
		this.suppressModifyUntil = 0;
		this.isSaving = false;

		if (!this.win || this.win.isDestroyed()) {
			this.win = null;
			return;
		}
		this.win.close();
		this.win = null;
	}

	isOpen(): boolean {
		if (!this.win) return false;
		if (this.win.isDestroyed()) {
			this.win = null;
			return false;
		}
		return true;
	}

	handleNotePathRenamed(oldPath: string, newPath: string): void {
		if (!this.noteFile || this.noteFile.path !== oldPath) {
			return;
		}

		const abstract = this.app.vault.getAbstractFileByPath(
			normalizePath(newPath),
		);
		if (abstract instanceof TFile && abstract.extension === "md") {
			this.noteFile = abstract;
		}
	}

	onVaultModify(file: TAbstractFile): void {
		if (
			!(file instanceof TFile) ||
			file.extension !== "md" ||
			!this.noteFile ||
			file.path !== this.noteFile.path ||
			!this.isOpen() ||
			this.isSaving ||
			Date.now() < this.suppressModifyUntil
		) {
			return;
		}

		void this.reloadEditorFromVault(file);
	}

	private async open(anchorBounds?: ElectronRectangle): Promise<void> {
		if (this.opening || this.isOpen()) {
			return;
		}

		this.opening = true;
		const noteFile = this.resolveNoteFile();
		if (!noteFile) {
			this.opening = false;
			return;
		}
		this.noteFile = noteFile;

		const remote = getRemote();
		if (!remote) {
			new Notice("Pebble: electron remote is not available.");
			this.opening = false;
			return;
		}

		const settings = this.readSettings();
		const initialContent = await this.readInitialContent(noteFile);
		this.lastKnownContent = initialContent;
		const basename =
			settings.notePath.split("/").pop()?.replace(/\.md$/, "") ??
			"Pebble";

		try {
			const win = new remote.BrowserWindow({
				width: POPOUT_WIDTH,
				height: POPOUT_HEIGHT,
				title: `${basename} — Pebble`,
				frame: process.platform === "darwin" ? false : undefined,
				show: false,
				webPreferences: {
					nodeIntegration: false,
					contextIsolation: true,
				},
			});

			win.on("closed", () => {
				this.win = null;
			});

			win.on("blur", () => {
				window.setTimeout(() => {
					if (!this.win || this.win !== win || win.isDestroyed()) {
						return;
					}
					this.close();
				}, 80);
			});

			this.win = win;

			const html = buildEditorHTML(
				initialContent,
				basename,
				settings.showNoteTitle,
				settings.themeMode,
			);
			const editorDataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(
				html,
			)}`;
			await win.loadURL(editorDataUrl);

			this.positionNearTray(win, remote, anchorBounds);
			win.show();
			win.focus();
			this.startSyncLoop(noteFile);
		} catch (err) {
			this.win = null;
			const errorMessage =
				err instanceof Error ? err.message : String(err);
			new Notice(`Pebble: failed to open window — ${errorMessage}`);
			console.error("Pebble: failed to open window", err);
		} finally {
			this.opening = false;
		}
	}

	private positionNearTray(
		win: ElectronBrowserWindowInstance,
		remote: NonNullable<ReturnType<typeof getRemote>>,
		anchorBounds?: ElectronRectangle,
	): void {
		if (process.platform !== "darwin" || !anchorBounds || !remote.screen) {
			return;
		}

		const anchorCenterX =
			anchorBounds.x + Math.round(anchorBounds.width / 2);
		const anchorBottomY = anchorBounds.y + anchorBounds.height;
		const display =
			remote.screen.getDisplayNearestPoint({
				x: anchorCenterX,
				y: anchorBottomY,
			}) ?? remote.screen.getPrimaryDisplay();
		const { workArea } = display;

		const desiredX = Math.round(anchorCenterX - POPOUT_WIDTH / 2);
		const desiredY = Math.round(anchorBottomY + WINDOW_MARGIN);

		const minX = workArea.x + WINDOW_MARGIN;
		const maxX = workArea.x + workArea.width - POPOUT_WIDTH - WINDOW_MARGIN;
		const minY = workArea.y + WINDOW_MARGIN;
		const maxY =
			workArea.y + workArea.height - POPOUT_HEIGHT - WINDOW_MARGIN;

		const finalX = Math.min(Math.max(desiredX, minX), Math.max(minX, maxX));
		const finalY = Math.min(Math.max(desiredY, minY), Math.max(minY, maxY));

		win.setPosition(finalX, finalY, false);
	}

	private resolveNoteFile(): TFile | null {
		const notePath = this.readSettings().notePath.trim();
		if (!notePath) {
			new Notice("Pebble: select a note in plugin settings first.");
			return null;
		}

		const normalizedPath = normalizePath(notePath);
		if (!normalizedPath.endsWith(".md")) {
			new Notice("Pebble: selected note is not a Markdown file.");
			return null;
		}

		const abstract = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (!(abstract instanceof TFile) || abstract.extension !== "md") {
			new Notice("Pebble: selected note does not exist in the vault.");
			return null;
		}

		return abstract;
	}

	private async readInitialContent(file: TFile): Promise<string> {
		try {
			return await this.app.vault.cachedRead(file);
		} catch {
			return "";
		}
	}

	private startSyncLoop(file: TFile): void {
		this.stopSyncLoop();
		this.syncInterval = window.setInterval(() => {
			void this.syncEditorToVault(file);
		}, 300);
	}

	private stopSyncLoop(): void {
		if (this.syncInterval !== null) {
			window.clearInterval(this.syncInterval);
			this.syncInterval = null;
		}
	}

	private async syncEditorToVault(file: TFile): Promise<void> {
		if (!this.isOpen() || !this.noteFile || this.isSaving) {
			return;
		}

		const currentContent = await this.readEditorContent();
		if (
			currentContent === null ||
			currentContent === this.lastKnownContent
		) {
			return;
		}

		await this.saveToVault(file, currentContent);
	}

	private async saveToVault(file: TFile, content: string): Promise<void> {
		this.isSaving = true;
		this.suppressModifyUntil = Date.now() + 1500;

		try {
			const activeFile = this.app.workspace.getActiveFile();
			const activeEditor = this.app.workspace.activeEditor?.editor;
			if (activeFile?.path === file.path && activeEditor) {
				activeEditor.setValue(content);
				this.lastKnownContent = content;
				return;
			}

			await this.app.vault.process(file, () => content);
			this.lastKnownContent = content;
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : String(err);
			new Notice(`Pebble: failed to save note — ${errorMessage}`);
		} finally {
			this.isSaving = false;
		}
	}

	private async reloadEditorFromVault(file: TFile): Promise<void> {
		const content = await this.readInitialContent(file);
		if (content === this.lastKnownContent) {
			return;
		}

		this.lastKnownContent = content;
		await this.writeEditorContent(content);
	}

	private async readEditorContent(): Promise<string | null> {
		if (!this.win || this.win.isDestroyed()) {
			return null;
		}

		try {
			const content = await this.win.webContents.executeJavaScript(
				"window.__pebbleEditor?.getContent?.() ?? null",
			);
			return typeof content === "string" ? content : null;
		} catch {
			return null;
		}
	}

	private async writeEditorContent(content: string): Promise<void> {
		if (!this.win || this.win.isDestroyed()) {
			return;
		}

		try {
			await this.win.webContents.executeJavaScript(
				`window.__pebbleEditor?.setContent?.(${JSON.stringify(content)});`,
			);
		} catch {
			/* no-op */
		}
	}
}
