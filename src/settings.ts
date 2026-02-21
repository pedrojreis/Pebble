import { App, PluginSettingTab, Setting, TFile } from "obsidian";
import type MinimaPlugin from "./main";

export interface MinimaSettings {
	notePath: string;
	alwaysOnTop: boolean;
	monochromeTrayIcon: boolean;
	showNoteTitle: boolean;
}

export const DEFAULT_SETTINGS: MinimaSettings = {
	notePath: "",
	alwaysOnTop: true,
	monochromeTrayIcon: false,
	showNoteTitle: true,
};

export class MinimaSettingTab extends PluginSettingTab {
	private plugin: MinimaPlugin;

	constructor(app: App, plugin: MinimaPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Note")
			.setDesc("The vault note that minima reads and writes to.")
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
					this.plugin.settings.notePath = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Always on top")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.alwaysOnTop)
					.onChange(async (value) => {
						this.plugin.settings.alwaysOnTop = value;
						await this.plugin.saveSettings();
						this.plugin.setAlwaysOnTop(value);
					});
			});

		new Setting(containerEl)
			.setName("Monochrome menu bar icon")
			.setDesc("Use a template icon in the macOS menu bar.")
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
			.setDesc("Show the note title as a subtle background watermark.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showNoteTitle)
					.onChange(async (value) => {
						this.plugin.settings.showNoteTitle = value;
						await this.plugin.saveSettings();
					});
			});

		const statusEl = containerEl.createDiv({ cls: "minima-note-status" });
		const file = this.getSelectedFile();
		statusEl.setText(
			file ? `Selected note: ${file.path}` : "Selected note: none",
		);
	}

	private getSelectedFile(): TFile | null {
		if (!this.plugin.settings.notePath) return null;
		const abstract = this.app.vault.getAbstractFileByPath(
			this.plugin.settings.notePath,
		);
		if (!(abstract instanceof TFile) || abstract.extension !== "md")
			return null;
		return abstract;
	}
}
