import { App, FileSystemAdapter, Notice } from "obsidian";
import {
	ElectronBrowserWindowInstance,
	ElectronRectangle,
	getRemote,
} from "./electron-utils";
import { buildEditorHTML } from "./editor-html";
import { MinimaSettings } from "./settings";

const POPOUT_WIDTH = 420;
const POPOUT_HEIGHT = 320;
const WINDOW_MARGIN = 8;

export class NativeWindow {
	private win: ElectronBrowserWindowInstance | null = null;
	private opening = false;
	private app: App;
	private readSettings: () => MinimaSettings;

	constructor(app: App, readSettings: () => MinimaSettings) {
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
		if (!this.win || this.win.isDestroyed()) {
			this.win = null;
			return;
		}
		this.win.close();
		this.win = null;
	}

	setAlwaysOnTop(flag: boolean): void {
		if (this.win && !this.win.isDestroyed()) {
			this.win.setAlwaysOnTop(flag, "floating");
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

	private async open(anchorBounds?: ElectronRectangle): Promise<void> {
		if (this.opening || this.isOpen()) {
			return;
		}

		this.opening = true;
		const filePath = this.resolveAbsolutePath();
		if (!filePath) {
			this.opening = false;
			return;
		}

		const remote = getRemote();
		if (!remote) {
			new Notice("Minima: electron remote is not available.");
			this.opening = false;
			return;
		}

		const settings = this.readSettings();
		const initialContent = await this.readInitialContent(settings.notePath);
		const basename =
			settings.notePath.split("/").pop()?.replace(/\.md$/, "") ??
			"Minima";

		try {
			const win = new remote.BrowserWindow({
				width: POPOUT_WIDTH,
				height: POPOUT_HEIGHT,
				alwaysOnTop: settings.alwaysOnTop,
				title: `${basename} — Minima`,
				frame: process.platform === "darwin" ? false : undefined,
				show: false,
				webPreferences: {
					nodeIntegration: true,
					contextIsolation: false,
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

			await win.loadURL("about:blank");

			const html = buildEditorHTML(filePath, initialContent, basename);
			await win.webContents.executeJavaScript(
				`document.open(); document.write(${JSON.stringify(html)}); document.close();`,
			);

			this.positionNearTray(win, remote, anchorBounds);
			win.show();
			win.focus();

			if (settings.alwaysOnTop) {
				win.setAlwaysOnTop(true, "floating");
			}
		} catch (err) {
			this.win = null;
			const errorMessage =
				err instanceof Error ? err.message : String(err);
			new Notice(`Minima: failed to open window — ${errorMessage}`);
			console.error("Minima: failed to open window", err);
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

	private resolveAbsolutePath(): string | null {
		const notePath = this.readSettings().notePath.trim();
		if (!notePath) {
			new Notice("Minima: select a note in plugin settings first.");
			return null;
		}

		if (!notePath.endsWith(".md")) {
			new Notice("Minima: selected note is not a Markdown file.");
			return null;
		}

		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			new Notice("Minima: only works on desktop with a local vault.");
			return null;
		}

		const basePath = adapter.getBasePath();
		const requireFn = (
			window as Window & {
				require?: (id: string) => unknown;
			}
		).require;
		const path = requireFn?.("path") as
			| {
					join: (...args: string[]) => string;
			  }
			| undefined;
		if (!path) return null;

		const absolutePath = path.join(basePath, notePath);

		const fs = requireFn?.("fs") as
			| {
					existsSync: (p: string) => boolean;
			  }
			| undefined;
		if (!fs?.existsSync(absolutePath)) {
			new Notice("Minima: selected note does not exist on disk.");
			return null;
		}

		return absolutePath;
	}

	private async readInitialContent(notePath: string): Promise<string> {
		try {
			return await this.app.vault.adapter.read(notePath);
		} catch {
			return "";
		}
	}
}
