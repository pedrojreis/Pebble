import {
	App,
	PluginSettingTab,
	Setting,
	TFile,
	FuzzySuggestModal,
} from "obsidian";
import type MinimaPlugin from "./main";

export interface MinimaSettings {
	notePath: string;
	alwaysOnTop: boolean;
	windowWidth: number;
	windowHeight: number;
}

export const DEFAULT_SETTINGS: MinimaSettings = {
	notePath: "",
	alwaysOnTop: true,
	windowWidth: 340,
	windowHeight: 440,
};

/**
 * Fuzzy search modal to pick a markdown note from the vault.
 */
class NotePickerModal extends FuzzySuggestModal<TFile> {
	private onChoose: (file: TFile) => void;

	constructor(app: App, onChoose: (file: TFile) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder("Search for a note…");
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(item: TFile): string {
		return item.path;
	}

	onChooseItem(item: TFile): void {
		this.onChoose(item);
	}
}

export class MinimaSettingTab extends PluginSettingTab {
	plugin: MinimaPlugin;

	constructor(app: App, plugin: MinimaPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── Note picker ────────────────────────────────────────
		const noteSetting = new Setting(containerEl)
			.setName("Note")
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setDesc("The vault note that Minima reads and writes to.");

		const noteDisplay = noteSetting.controlEl.createEl("span", {
			text: this.plugin.settings.notePath || "None selected",
			cls: this.plugin.settings.notePath
				? "minima-note-path has-note"
				: "minima-note-path",
		});

		noteSetting.addButton((btn) =>
			btn.setButtonText("Choose").onClick(() => {
				new NotePickerModal(this.app, (file) => {
					this.plugin.settings.notePath = file.path;
					void this.plugin.saveSettings();
					this.plugin.reloadNoteWindow();
					noteDisplay.setText(file.path);
					noteDisplay.classList.add("has-note");
				}).open();
			}),
		);

		// ── Always on top ──────────────────────────────────────
		new Setting(containerEl)
			.setName("Always on top")
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setDesc("Keep the note window above other windows.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.alwaysOnTop)
					.onChange(async (value) => {
						this.plugin.settings.alwaysOnTop = value;
						await this.plugin.saveSettings();
						this.plugin.updateWindowAlwaysOnTop(value);
					}),
			);
	}
}
