import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	normalizePath,
} from "obsidian";

export type PebbleThemeMode = "light" | "dark";

export interface PebbleSettings {
	notePath: string;
	monochromeTrayIcon: boolean;
	showNoteTitle: boolean;
	themeMode: PebbleThemeMode;
	/** Saved window bounds — restored on next open */
	windowX: number | null;
	windowY: number | null;
	windowWidth: number;
	windowHeight: number;
	/** Extra offset applied on first open (before any saved position) */
	trayOffsetX: number;
	trayOffsetY: number;
}

export const DEFAULT_SETTINGS: PebbleSettings = {
	notePath: "",
	monochromeTrayIcon: false,
	showNoteTitle: true,
	themeMode: "dark",
	windowX: null,
	windowY: null,
	windowWidth: 420,
	windowHeight: 320,
	trayOffsetX: 0,
	trayOffsetY: 0,
};

type SettingsTabPluginHost = Plugin & {
	settings: PebbleSettings;
	saveSettings(): Promise<void>;
	refreshTrayIcon(): void;
};

export class PebbleSettingTab extends PluginSettingTab {
	private plugin: SettingsTabPluginHost;

	constructor(app: App, plugin: SettingsTabPluginHost) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Note")
			.setDesc("Choose the note that pebble opens and saves as you type.")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Select a note");

				const markdownFiles = this.app.vault
					.getMarkdownFiles()
					.sort((left, right) => left.path.localeCompare(right.path));

				for (const file of markdownFiles) {
					dropdown.addOption(file.path, file.path);
				}

				dropdown.setValue(this.plugin.settings.notePath);
				dropdown.onChange(async (value) => {
					this.plugin.settings.notePath = normalizePath(value);
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Monochrome tray icon")
			.setDesc(
				"Use a monochrome tray icon that blends with the system tray or menu bar.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.monochromeTrayIcon)
					.onChange(async (value) => {
						this.plugin.settings.monochromeTrayIcon = value;
						await this.plugin.saveSettings();
						this.plugin.refreshTrayIcon();
					});
			});

		new Setting(containerEl)
			.setName("Show note title")
			.setDesc(
				"Show the current note title as a subtle watermark in the editor.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showNoteTitle)
					.onChange(async (value) => {
						this.plugin.settings.showNoteTitle = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Color mode")
			.setDesc(
				"Choose whether the pebble editor uses a white or dark background.",
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOption("light", "White mode")
					.addOption("dark", "Dark mode")
					.setValue(this.plugin.settings.themeMode)
					.onChange(async (value) => {
						if (value !== "light" && value !== "dark") {
							return;
						}

						this.plugin.settings.themeMode = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Tray offset X")
			.setDesc(
				"Horizontal offset in pixels applied when the window first opens near the tray icon. Positive moves right, negative moves left.",
			)
			.addText((text) => {
				text.setPlaceholder("0")
					.setValue(String(this.plugin.settings.trayOffsetX))
					.onChange(async (value) => {
						const parsed = parseInt(value, 10);
						if (!isNaN(parsed)) {
							this.plugin.settings.trayOffsetX = parsed;
							await this.plugin.saveSettings();
						}
					});
			});

		new Setting(containerEl)
			.setName("Tray offset Y")
			.setDesc(
				"Vertical offset in pixels applied when the window first opens near the tray icon. Positive moves down, negative moves up.",
			)
			.addText((text) => {
				text.setPlaceholder("0")
					.setValue(String(this.plugin.settings.trayOffsetY))
					.onChange(async (value) => {
						const parsed = parseInt(value, 10);
						if (!isNaN(parsed)) {
							this.plugin.settings.trayOffsetY = parsed;
							await this.plugin.saveSettings();
						}
					});
			});

		new Setting(containerEl)
			.setName("Reset window position")
			.setDesc(
				"Clear the saved window position so it recalculates near the tray icon on next open.",
			)
			.addButton((button) => {
				button.setButtonText("Reset").onClick(async () => {
					this.plugin.settings.windowX = null;
					this.plugin.settings.windowY = null;
					await this.plugin.saveSettings();
				});
			});
	}
}
