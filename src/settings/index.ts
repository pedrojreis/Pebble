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
}

export const DEFAULT_SETTINGS: PebbleSettings = {
	notePath: "",
	monochromeTrayIcon: false,
	showNoteTitle: true,
	themeMode: "dark",
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
			.setName("Monochrome menu bar icon")
			.setDesc(
				"Use a monochrome icon that blends with the macOS menu bar.",
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
	}
}
