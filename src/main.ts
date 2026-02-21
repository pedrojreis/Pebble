import { Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, MinimaSettings, MinimaSettingTab } from "./settings";
import { NativeWindow } from "./native-window";
import { MinimaTray } from "./tray";

export default class MinimaPlugin extends Plugin {
	settings: MinimaSettings = { ...DEFAULT_SETTINGS };
	private overlayWindow: NativeWindow | null = null;
	private tray: MinimaTray | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.overlayWindow = new NativeWindow(this.app, () => this.settings);

		this.registerDomEvent(window, "beforeunload", () => {
			this.overlayWindow?.close();
			this.tray?.destroy();
		});

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (!(file instanceof TFile) || file.extension !== "md") {
					return;
				}

				if (this.settings.notePath !== oldPath) {
					return;
				}

				this.settings.notePath = file.path;
				void this.saveSettings();
			}),
		);

		this.createTray();

		this.addSettingTab(new MinimaSettingTab(this.app, this));
	}

	onunload(): void {
		this.overlayWindow?.close();
		this.overlayWindow = null;

		this.tray?.destroy();
		this.tray = null;
	}

	setAlwaysOnTop(flag: boolean): void {
		this.overlayWindow?.setAlwaysOnTop(flag);
	}

	refreshTrayIcon(): void {
		this.tray?.destroy();
		this.createTray();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private async loadSettings(): Promise<void> {
		const storedSettings =
			(await this.loadData()) as Partial<MinimaSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, storedSettings);
	}

	private createTray(): void {
		this.tray = new MinimaTray();
		this.tray.create((bounds) => {
			void this.overlayWindow?.toggle(bounds);
		}, this.settings.monochromeTrayIcon);
	}
}
