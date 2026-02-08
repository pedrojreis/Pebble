import { App, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { MinimaSettings } from "./settings";
import { getRemote } from "./electron-utils";
import { POPOUT_CSS } from "./popout-style";

type Bounds = { x: number; y: number; width: number; height: number };
type BrowserWindow = {
	id: number;
	hide(): void;
	show(): void;
	focus(): void;
	close(): void;
	destroy(): void;
	isVisible(): boolean;
	isFocused(): boolean;
	setAlwaysOnTop(v: boolean): void;
	setSize(w: number, h: number): void;
	setPosition(x: number, y: number): void;
	getSize(): [number, number];
	getBounds(): Bounds;
	on(event: string, cb: () => void): void;
	webContents: { executeJavaScript(js: string): Promise<void> };
};

const PADDING = 16;

export class NativeWindow {
	private app: App;
	private settings: MinimaSettings;
	private getTrayBounds: (() => Bounds | null) | null;
	private leaf: WorkspaceLeaf | null = null;
	private win: BrowserWindow | null = null;
	private styled = false;

	constructor(
		app: App,
		settings: MinimaSettings,
		getTrayBounds?: () => Bounds | null,
	) {
		this.app = app;
		this.settings = settings;
		this.getTrayBounds = getTrayBounds ?? null;
	}

	private getFile(): TFile | null {
		if (!this.settings.notePath) return null;
		const f = this.app.vault.getAbstractFileByPath(this.settings.notePath);
		return f instanceof TFile ? f : null;
	}

	isVisible(): boolean {
		try {
			return this.win?.isVisible() ?? false;
		} catch {
			return false;
		}
	}

	async toggle(): Promise<void> {
		this.isVisible() ? this.hide() : await this.show();
	}

	async show(): Promise<boolean> {
		const file = this.getFile();
		if (!file) {
			new Notice("Minima: Select a note in settings first");
			return false;
		}

		// Reuse existing window
		if (this.leaf && this.win) {
			try {
				this.position();
				this.win.show();
				this.win.focus();
				return true;
			} catch {
				this.leaf = null;
				this.win = null;
				this.styled = false;
			}
		}

		const remote = getRemote();
		if (!remote) return false;

		const before = new Set(
			(remote.BrowserWindow.getAllWindows() as BrowserWindow[]).map(
				(w) => w.id,
			),
		);

		// Create popout
		this.leaf = this.app.workspace.getLeaf("window");
		if (!this.leaf) return false;

		// Find new window quickly
		for (let i = 0; i < 50 && !this.win; i++) {
			const wins =
				remote.BrowserWindow.getAllWindows() as BrowserWindow[];
			this.win = wins.find((w) => !before.has(w.id)) ?? null;
			if (this.win) {
				this.win.hide();
				break;
			}
			await sleep(10);
		}
		if (!this.win) return false;

		// Configure
		this.win.setAlwaysOnTop(this.settings.alwaysOnTop);
		this.win.setSize(
			this.settings.windowWidth + 2 * PADDING,
			this.settings.windowHeight + PADDING,
		);
		this.position();

		await this.leaf.openFile(file);
		await this.injectStyle();
		this.setupEvents();

		await sleep(50);
		this.win.show();
		this.win.focus();
		return true;
	}

	hide(): void {
		try {
			this.win?.hide();
		} catch {
			/* destroyed */
		}
	}

	private position(): void {
		if (!this.win || !this.getTrayBounds) return;
		const tray = this.getTrayBounds();
		if (!tray) return;

		const remote = getRemote();
		if (!remote) return;

		const display = remote.screen.getDisplayNearestPoint({
			x: tray.x,
			y: tray.y,
		});
		const work = display.workArea as Bounds;
		const [w] = this.win.getSize();

		let x = Math.round(tray.x + tray.width / 2 - w / 2);
		const y = tray.y + tray.height + 4;

		if (x + w > work.x + work.width) x = work.x + work.width - w;
		if (x < work.x) x = work.x;

		this.win.setPosition(x, y);
	}

	private async injectStyle(): Promise<void> {
		if (!this.win || this.styled) return;
		const js = `(function(){
			var s = document.getElementById('minima-style');
			if (s) s.remove();
			s = document.createElement('style');
			s.id = 'minima-style';
			s.textContent = ${JSON.stringify(POPOUT_CSS)};
			document.head.appendChild(s);
		})();`;
		try {
			await this.win.webContents.executeJavaScript(js);
			this.styled = true;
		} catch {
			/* ignore */
		}
	}

	private setupEvents(): void {
		if (!this.win) return;
		this.win.on("blur", () => {
			setTimeout(() => {
				if (this.win && !this.win.isFocused()) this.hide();
			}, 100);
		});
		this.win.on("closed", () => {
			this.win = null;
			this.leaf = null;
			this.styled = false;
		});
		this.win.on("resized", () => this.saveBounds());
	}

	private saveBounds(): void {
		if (!this.win) return;
		try {
			const b = this.win.getBounds();
			this.settings.windowWidth = b.width - 2 * PADDING;
			this.settings.windowHeight = b.height - PADDING;
		} catch {
			/* destroyed */
		}
	}

	setAlwaysOnTop(v: boolean): void {
		try {
			this.win?.setAlwaysOnTop(v);
		} catch {
			/* destroyed */
		}
	}

	getSettings(): MinimaSettings {
		return this.settings;
	}

	destroy(): void {
		try {
			this.leaf?.detach();
		} catch {
			/* detached */
		}
		try {
			this.win?.destroy();
		} catch {
			/* destroyed */
		}
		this.leaf = null;
		this.win = null;
		this.styled = false;
	}

	/** Close leftover popout windows from previous session */
	closeStalePopouts(): void {
		const remote = getRemote();
		if (!remote) return;
		const mainId = remote.getCurrentWindow().id as number;
		for (const w of remote.BrowserWindow.getAllWindows() as BrowserWindow[]) {
			if (w.id !== mainId) {
				try {
					w.close();
				} catch {
					/* closed */
				}
			}
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
