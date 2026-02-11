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
	minimize(): void;
	isVisible(): boolean;
	isFocused(): boolean;
	isDestroyed(): boolean;
	isMinimized(): boolean;
	setAlwaysOnTop(v: boolean): void;
	setSize(w: number, h: number): void;
	setPosition(x: number, y: number): void;
	setParentWindow(parent: BrowserWindow | null): void;
	getSize(): [number, number];
	getBounds(): Bounds;
	on(event: string, cb: () => void): void;
	webContents: { executeJavaScript(js: string): Promise<void> };
};

const PADDING = 16;

/** Snapshot of the Obsidian main window state before Minima opens. */
interface MainWindowState {
	wasVisible: boolean;
	wasMinimized: boolean;
}

export class NativeWindow {
	private app: App;
	private settings: MinimaSettings;
	private getTrayBounds: (() => Bounds | null) | null;
	private leaf: WorkspaceLeaf | null = null;
	private win: BrowserWindow | null = null;
	private styled = false;
	/** State of the Obsidian main window captured right before we open the popout. */
	private mainWindowState: MainWindowState | null = null;

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

	async toggle(fromTray = false): Promise<void> {
		if (this.isVisible()) {
			this.hide();
		} else {
			await this.show(fromTray);
		}
	}

	/**
	 * Capture the current visibility state of the Obsidian main window
	 * so we can restore it later (after opening/closing the popout).
	 */
	private snapshotMainWindow(): MainWindowState {
		const remote = getRemote();
		if (!remote) return { wasVisible: false, wasMinimized: false };
		try {
			const main = remote.getCurrentWindow() as BrowserWindow;
			return {
				wasVisible: main.isVisible() && !main.isMinimized(),
				wasMinimized: main.isMinimized(),
			};
		} catch {
			return { wasVisible: false, wasMinimized: false };
		}
	}

	/**
	 * Restore the Obsidian main window to the state captured by snapshotMainWindow.
	 * If it wasn't visible before, hide it again. If it was minimized, minimize it.
	 */
	private restoreMainWindow(state: MainWindowState): void {
		const remote = getRemote();
		if (!remote) return;
		try {
			const main = remote.getCurrentWindow() as BrowserWindow;
			if (!state.wasVisible && !state.wasMinimized) {
				// Main window was hidden — hide it again
				main.hide();
			} else if (state.wasMinimized) {
				// Main window was minimized — minimize it again
				main.minimize();
			}
			// If it was visible and not minimized, leave it alone
		} catch {
			/* ignore */
		}
	}

	async show(fromTray = false): Promise<boolean> {
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

		// Snapshot main window state BEFORE creating the popout.
		// getLeaf("window") activates the app which can show/un-minimize
		// the main window — we'll restore it afterwards.
		this.mainWindowState = this.snapshotMainWindow();

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

		// Make window independent of Obsidian main window.
		// This prevents macOS from focusing the main window when this one hides/closes.
		try {
			this.win.setParentWindow(null);
		} catch {
			/* not supported on this Electron version */
		}

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

		// Restore main window to its original state.
		// getLeaf("window") may have shown/activated it.
		if (this.mainWindowState) {
			this.restoreMainWindow(this.mainWindowState);
		}

		return true;
	}

	/**
	 * Fully tear down the popout: detach the Obsidian leaf (so workspace
	 * state won't restore it on next launch) and destroy the BrowserWindow.
	 *
	 * Restores the Obsidian main window to whatever state it was in before
	 * Minima was opened (hidden stays hidden, minimized stays minimized).
	 */
	hide(): void {
		const savedState = this.mainWindowState;

		// Detach leaf first — removes it from Obsidian's workspace state
		// so it won't be restored on next startup.
		try {
			this.leaf?.detach();
		} catch {
			/* already detached */
		}

		// Destroy the BrowserWindow
		try {
			this.win?.destroy();
		} catch {
			/* already destroyed */
		}

		this.leaf = null;
		this.win = null;
		this.styled = false;
		this.mainWindowState = null;

		// Restore main window to its pre-Minima state.
		// Destroying the popout may cause macOS to focus/show the main window.
		if (savedState) {
			setTimeout(() => {
				this.restoreMainWindow(savedState);
			}, 50);
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
				try {
					if (
						this.win &&
						!this.win.isDestroyed() &&
						!this.win.isFocused()
					) {
						this.hide();
					}
				} catch {
					/* destroyed between check */
				}
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

	/**
	 * Clean up any stale popout leaves from a previous session
	 * that show the Minima note. Called on startup after workspace is ready.
	 */
	cleanupStaleLeaves(): void {
		const notePath = this.settings.notePath;
		if (!notePath) return;

		const leavesToDetach: WorkspaceLeaf[] = [];
		this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
			try {
				// Only target leaves outside the main window (i.e. popout windows)
				if (leaf.getRoot() === this.app.workspace.rootSplit) return;

				const viewState = leaf.getViewState();
				if (viewState?.state?.file === notePath) {
					leavesToDetach.push(leaf);
				}
			} catch {
				/* ignore */
			}
		});

		// Detach outside the iteration to avoid modifying during traversal
		for (const leaf of leavesToDetach) {
			try {
				leaf.detach();
			} catch {
				/* ignore */
			}
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
