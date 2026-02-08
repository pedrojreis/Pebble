import { Notice, Plugin } from "obsidian";
import { MinimaSettings, DEFAULT_SETTINGS, MinimaSettingTab } from "./settings";
import { MinimaTray } from "./tray";
import { NativeWindow } from "./native-window";
import { getRemote } from "./electron-utils";

export default class MinimaPlugin extends Plugin {
	settings: MinimaSettings;
	private tray: MinimaTray | null = null;
	private noteWindow: NativeWindow | null = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private mainWindow: any = null;
	private boundHandlers: {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		target: any;
		event: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		handler: (...args: any[]) => void;
	}[] = [];

	async onload() {
		await this.loadSettings();

		// Get Electron main-window reference for lifecycle management
		const remote = getRemote();
		if (remote) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			this.mainWindow = remote.getCurrentWindow();
		}

		// ── Create plugin resources (note window + tray) ───────
		this.createPluginResources();

		// ── Electron lifecycle management ──────────────────────
		// On macOS, clicking the window's close button hides the main
		// window instead of quitting.  If our child BrowserWindow stays
		// alive it prevents the app from properly reactivating when the
		// user clicks the dock icon.  Fix: destroy our resources when
		// the main window closes/hides and recreate them when the main
		// window becomes visible again.
		if (this.mainWindow) {
			this.addElectronListener(this.mainWindow, "close", () => {
				console.debug(
					"Minima: Main window closing — destroying plugin resources",
				);
				this.destroyPluginResources();
			});

			this.addElectronListener(this.mainWindow, "show", () => {
				console.debug(
					"Minima: Main window shown — recreating plugin resources",
				);
				this.createPluginResources();
			});
		}

		// ── Commands ───────────────────────────────────────────
		this.addCommand({
			id: "toggle-window",
			name: "Toggle window",
			callback: () => {
				this.ensurePluginResources();
				void this.noteWindow?.toggle();
			},
		});

		this.addCommand({
			id: "show-window",
			name: "Show window",
			callback: () => {
				this.ensurePluginResources();
				void this.noteWindow?.show();
			},
		});

		// ── Ribbon icon ────────────────────────────────────────
		this.addRibbonIcon("pencil", "Toggle note window", () => {
			this.ensurePluginResources();
			void this.noteWindow?.toggle();
		});

		// ── Settings tab ───────────────────────────────────────
		this.addSettingTab(new MinimaSettingTab(this.app, this));
	}

	// ── Resource lifecycle helpers ─────────────────────────────

	/**
	 * Create the note window and system tray if they don't already exist.
	 * Safe to call multiple times — skips creation when resources are alive.
	 */
	private createPluginResources(): void {
		if (!this.tray) {
			console.debug("Minima: Creating system tray…");
			this.tray = new MinimaTray(
				() => {
					this.ensurePluginResources();
					void this.noteWindow?.toggle();
				},
				() => this.noteWindow?.hide(),
			);

			const trayOk = this.tray.create();
			console.debug("Minima: Tray creation result:", trayOk);

			if (!trayOk) {
				new Notice(
					"Minima: Could not create the system tray icon — check the console (Ctrl+Shift+I) for details.",
				);
			}
		}

		if (!this.noteWindow) {
			console.debug("Minima: Creating native note window…");
			this.noteWindow = new NativeWindow(
				this.app,
				this.settings,
				() => this.tray?.getBounds() ?? null,
			);
			// Close any stale popout from previous session (Obsidian may restore them)
			this.noteWindow.closeStalePopouts();
			console.debug("Minima: Native window instance created");
		}
	}

	/**
	 * Destroy the note window and system tray, persisting settings first.
	 */
	private destroyPluginResources(): void {
		if (this.noteWindow) {
			const latest = this.noteWindow.getSettings();
			Object.assign(this.settings, latest);
		}

		this.noteWindow?.destroy();
		this.noteWindow = null;

		this.tray?.destroy();
		this.tray = null;

		void this.saveSettings();
	}

	/**
	 * Ensure resources exist.  Called from commands / ribbon / tray
	 * callbacks because resources may have been torn down when the
	 * main Obsidian window was hidden (macOS close-button flow).
	 */
	private ensurePluginResources(): void {
		this.createPluginResources();
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private addElectronListener(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		target: any,
		event: string,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		handler: (...args: any[]) => void,
	): void {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
		target.on(event, handler);
		this.boundHandlers.push({ target, event, handler });
	}

	private removeAllElectronListeners(): void {
		for (const { target, event, handler } of this.boundHandlers) {
			try {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
				target.removeListener(event, handler);
			} catch {
				/* ignore */
			}
		}
		this.boundHandlers = [];
	}

	onunload() {
		this.removeAllElectronListeners();
		this.destroyPluginResources();
		this.mainWindow = null;
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<MinimaSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/** Reload the note window content (e.g. after changing the selected note). */
	reloadNoteWindow(): void {
		// Close the current window so the next toggle opens with the new note
		this.noteWindow?.destroy();
		this.noteWindow = null;
	}

	/** Called from the settings tab to live-update the window. */
	updateWindowAlwaysOnTop(value: boolean): void {
		this.noteWindow?.setAlwaysOnTop(value);
	}
}
