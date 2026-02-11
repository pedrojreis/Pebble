import { Plugin } from "obsidian";
import { MinimaSettings, DEFAULT_SETTINGS, MinimaSettingTab } from "./settings";
import { NativeWindow } from "./native-window";
import { MinimaTray } from "./tray";
import { getRemote } from "./electron-utils";

export default class MinimaPlugin extends Plugin {
	settings: MinimaSettings = DEFAULT_SETTINGS;
	private noteWindow: NativeWindow | null = null;
	private tray: MinimaTray | null = null;
	private electronReady = false;
	private didFinishLoadHandler: (() => void) | null = null;
	private beforeUnloadHandler: (() => void) | null = null;
	private beforeQuitHandler: (() => void) | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new MinimaSettingTab(this.app, this));
		this.registerCommand();
		this.setupElectronLifecycle();
	}

	onunload(): void {
		this.destroyResources();
	}

	private registerCommand(): void {
		this.addCommand({
			id: "toggle-minima",
			name: "Toggle Minima",
			callback: () => void this.noteWindow?.toggle(),
		});
	}

	private setupElectronLifecycle(): void {
		const remote = getRemote();
		if (!remote) return;

		const mainWindow = remote.getCurrentWindow();

		// Store handler reference so we can remove it on unload
		this.didFinishLoadHandler = () => {
			if (!this.electronReady) {
				this.electronReady = true;
				this.createResources();
			}
		};
		mainWindow.webContents.once(
			"did-finish-load",
			this.didFinishLoadHandler,
		);

		if (mainWindow.webContents.isLoading()) return;
		this.electronReady = true;
		this.createResources();
	}

	private createResources(): void {
		// Guard against duplicate creation
		if (this.tray) return;

		this.tray = new MinimaTray(
			() => void this.noteWindow?.toggle(true),
			() => this.noteWindow?.hide(),
		);
		this.tray.create();

		// Register early cleanup handlers — onunload can fire too late for IPC
		this.beforeUnloadHandler = () => {
			this.tray?.destroy();
		};
		window.addEventListener("beforeunload", this.beforeUnloadHandler);

		try {
			const remote = getRemote();
			if (remote) {
				this.beforeQuitHandler = () => {
					this.tray?.destroy();
				};
				remote.app.on("before-quit", this.beforeQuitHandler);
			}
		} catch {
			/* ignore */
		}

		this.noteWindow = new NativeWindow(
			this.app,
			this.settings,
			() => this.tray?.getBounds() ?? null,
		);

		// Clean up stale popout leaves once workspace is ready
		this.app.workspace.onLayoutReady(() => {
			this.noteWindow?.cleanupStaleLeaves();
		});
	}

	private destroyResources(): void {
		// Remove event listener if it hasn't fired yet
		if (this.didFinishLoadHandler) {
			try {
				const remote = getRemote();
				if (remote) {
					const mainWindow = remote.getCurrentWindow();
					mainWindow.webContents.off(
						"did-finish-load",
						this.didFinishLoadHandler,
					);
				}
			} catch {
				/* ignore */
			}
			this.didFinishLoadHandler = null;
		}

		// Remove beforeunload handler
		if (this.beforeUnloadHandler) {
			window.removeEventListener(
				"beforeunload",
				this.beforeUnloadHandler,
			);
			this.beforeUnloadHandler = null;
		}

		// Remove before-quit handler
		if (this.beforeQuitHandler) {
			try {
				const remote = getRemote();
				if (remote) {
					remote.app.off("before-quit", this.beforeQuitHandler);
				}
			} catch {
				/* ignore */
			}
			this.beforeQuitHandler = null;
		}

		this.noteWindow?.destroy();
		this.noteWindow = null;
		this.tray?.destroy();
		this.tray = null;
		this.electronReady = false;
	}

	reloadNoteWindow(): void {
		this.noteWindow?.destroy();
		this.noteWindow = new NativeWindow(
			this.app,
			this.settings,
			() => this.tray?.getBounds() ?? null,
		);
	}

	updateWindowAlwaysOnTop(value: boolean): void {
		this.noteWindow?.setAlwaysOnTop(value);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
