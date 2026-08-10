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
const TRAY_GAP = 8;
const SCREEN_MARGIN = 8;

export class NativeWindow {
	private win: ElectronBrowserWindowInstance | null = null;
	private opening = false;
	private app: App;
	private readSettings: () => PebbleSettings;
	private saveSettings: () => Promise<void>;
	private noteFile: TFile | null = null;
	private pendingContent: string | null = null;
	private closePromise: Promise<void> | null = null;
	private isSaving = false;
	private suppressModifyUntil = 0;
	private lastKnownContent = "";

	constructor(
		app: App,
		readSettings: () => PebbleSettings,
		saveSettings: () => Promise<void>,
	) {
		this.app = app;
		this.readSettings = readSettings;
		this.saveSettings = saveSettings;
	}

	async toggle(anchorBounds?: ElectronRectangle): Promise<void> {
		if (this.opening) {
			return;
		}

		if (this.closePromise) {
			await this.closePromise;
		}

		if (this.isOpen()) {
			await this.close();
			return;
		}
		await this.open(anchorBounds);
	}

	async close(): Promise<void> {
		if (this.closePromise) return this.closePromise;
		this.closePromise = this.doClose();
		try {
			await this.closePromise;
		} finally {
			this.closePromise = null;
		}
	}

	private async doClose(): Promise<void> {
		const file = this.noteFile;
		const content = this.pendingContent;
		if (file && content !== null && content !== this.lastKnownContent) {
			this.suppressModifyUntil = Date.now() + 1500;
			try {
				await this.app.vault.process(file, () => content);
			} catch {
				// Best effort on close
			}
		}

		this.noteFile = null;
		this.pendingContent = null;
		this.lastKnownContent = "";
		this.suppressModifyUntil = 0;
		this.isSaving = false;

		if (!this.win || this.win.isDestroyed()) {
			this.win = null;
			return;
		}

		this.persistWindowBounds(this.win);
		this.win.close();
		this.win = null;
	}

	private persistWindowBounds(win: ElectronBrowserWindowInstance): void {
		try {
			const [x, y] = win.getPosition();
			const [width, height] = win.getSize();
			const settings = this.readSettings();
			settings.windowX = x;
			settings.windowY = y;
			settings.windowWidth = width;
			settings.windowHeight = height;
			void this.saveSettings();
		} catch {
			// Non-critical — ignore if window is already destroyed
		}
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
		if (this.opening || this.isOpen() || this.closePromise) {
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
				width: settings.windowWidth,
				height: settings.windowHeight,
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
					void this.close();
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

			if (settings.windowX !== null && settings.windowY !== null) {
				win.setPosition(settings.windowX, settings.windowY, false);
			} else {
				this.positionNearTray(win, remote, anchorBounds, settings);
			}
			win.show();
			win.focus();
			this.listenForEditorChanges();
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
		anchorBounds: ElectronRectangle | undefined,
		settings: PebbleSettings,
	): void {
		if (!remote.screen) return;

		const [winWidth, winHeight] = win.getSize();

		// Fallback chain: click bounds → getBounds() → center on primary display
		if (!anchorBounds) {
			const primary = remote.screen.getPrimaryDisplay();
			const { workArea } = primary;
			win.setPosition(
				Math.round(workArea.x + (workArea.width - winWidth) / 2),
				Math.round(workArea.y + (workArea.height - winHeight) / 2),
				false,
			);
			return;
		}

		const anchorCenterX =
			anchorBounds.x + Math.round(anchorBounds.width / 2);
		const anchorCenterY =
			anchorBounds.y + Math.round(anchorBounds.height / 2);
		const display =
			remote.screen.getDisplayNearestPoint({
				x: anchorCenterX,
				y: anchorCenterY,
			}) ?? remote.screen.getPrimaryDisplay();
		const { workArea } = display;

		// Detect which edge the tray is on by proximity to work-area boundaries
		const distTop = anchorCenterY - workArea.y;
		const distBottom = workArea.y + workArea.height - anchorCenterY;
		const distLeft = anchorCenterX - workArea.x;
		const distRight = workArea.x + workArea.width - anchorCenterX;
		const minDist = Math.min(distTop, distBottom, distLeft, distRight);

		let desiredX: number;
		let desiredY: number;

		if (minDist === distBottom) {
			// Tray on bottom → open above
			desiredX = Math.round(anchorCenterX - winWidth / 2);
			desiredY = Math.round(anchorBounds.y - winHeight - TRAY_GAP);
		} else if (minDist === distTop) {
			// Tray on top → open below
			desiredX = Math.round(anchorCenterX - winWidth / 2);
			desiredY = Math.round(
				anchorBounds.y + anchorBounds.height + TRAY_GAP,
			);
		} else if (minDist === distRight) {
			// Tray on right → open to the left
			desiredX = Math.round(anchorBounds.x - winWidth - TRAY_GAP);
			desiredY = Math.round(anchorCenterY - winHeight / 2);
		} else {
			// Tray on left → open to the right
			desiredX = Math.round(
				anchorBounds.x + anchorBounds.width + TRAY_GAP,
			);
			desiredY = Math.round(anchorCenterY - winHeight / 2);
		}

		desiredX += settings.trayOffsetX;
		desiredY += settings.trayOffsetY;

		const minX = workArea.x + SCREEN_MARGIN;
		const maxX = workArea.x + workArea.width - winWidth - SCREEN_MARGIN;
		const minY = workArea.y + SCREEN_MARGIN;
		const maxY = workArea.y + workArea.height - winHeight - SCREEN_MARGIN;

		win.setPosition(
			Math.min(Math.max(desiredX, minX), Math.max(minX, maxX)),
			Math.min(Math.max(desiredY, minY), Math.max(minY, maxY)),
			false,
		);
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
			return await this.app.vault.read(file);
		} catch {
			return "";
		}
	}

	private listenForEditorChanges(): void {
		if (!this.win || this.win.isDestroyed()) return;

		const SAVE_PREFIX = "__pebble_save:";

		const webContents = this.win.webContents;
		(
			webContents as {
				on(e: string, cb: (...args: unknown[]) => void): void;
			}
		).on(
			"console-message",
			(_event: unknown, _level: unknown, message: unknown) => {
				if (
					typeof message !== "string" ||
					!message.startsWith(SAVE_PREFIX)
				) {
					return;
				}
				try {
					const content: unknown = JSON.parse(
						message.slice(SAVE_PREFIX.length),
					);
					if (typeof content === "string") {
						this.onEditorInput(content);
					}
				} catch {
					// Ignore malformed messages
				}
			},
		);
	}

	private onEditorInput(content: string): void {
		this.pendingContent = content;
		void this.flushPendingContent();
	}

	private async flushPendingContent(): Promise<void> {
		if (this.isSaving || !this.noteFile) return;

		const content = this.pendingContent;
		if (content === null || content === this.lastKnownContent) return;

		await this.saveToVault(this.noteFile, content);

		// Check if new content arrived while saving
		if (
			this.pendingContent !== null &&
			this.pendingContent !== this.lastKnownContent
		) {
			void this.flushPendingContent();
		}
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
		this.pendingContent = null;
		await this.writeEditorContent(content);
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
