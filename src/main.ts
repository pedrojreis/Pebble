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
		mainWindow.webContents.once("did-finish-load", () => {
			if (!this.electronReady) {
				this.electronReady = true;
				this.createResources();
			}
		});

		if (mainWindow.webContents.isLoading()) return;
		this.electronReady = true;
		this.createResources();
	}

	private createResources(): void {
		this.tray = new MinimaTray(
			() => void this.noteWindow?.toggle(),
			() => this.noteWindow?.hide(),
		);
		this.tray.create();

		this.noteWindow = new NativeWindow(
			this.app,
			this.settings,
			() => this.tray?.getBounds() ?? null,
		);
		this.noteWindow.closeStalePopouts();
	}

	private destroyResources(): void {
		this.noteWindow?.destroy();
		this.noteWindow = null;
		this.tray?.destroy();
		this.tray = null;
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
