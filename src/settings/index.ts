import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	normalizePath,
} from "obsidian";

export type PebbleThemeMode = "light" | "dark";

export interface WindowPosition {
	x: number;
	y: number;
}

export interface PebbleSettings {
	notePath: string;
	monochromeTrayIcon: boolean;
	showNoteTitle: boolean;
	themeMode: PebbleThemeMode;
	/** Saved window position per OS platform — a position saved on one device
	 * (e.g. Windows) shouldn't be reused on another (e.g. macOS) when settings
	 * are synced across devices. */
	windowPositions: Partial<Record<NodeJS.Platform, WindowPosition>>;
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
	windowPositions: {},
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
				const notes = this.plugin.app.vault
					.getMarkdownFiles()
					.sort((a, b) => a.path.localeCompare(b.path));
				for (const note of notes) {
					dropdown.addOption(note.path, note.path);
				}
				dropdown
					.setValue(this.plugin.settings.notePath)
					.onChange(async (value) => {
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
						if (value !== "light" && value !== "dark") return;
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
						const parsed = Number(value);
						this.plugin.settings.trayOffsetX = Number.isFinite(
							parsed,
						)
							? parsed
							: 0;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Vertical tray offset")
			.setDesc(
				"Vertical offset in pixels applied when the window first opens near the tray icon. Positive moves down, negative moves up.",
			)
			.addText((text) => {
				text.setPlaceholder("0")
					.setValue(String(this.plugin.settings.trayOffsetY))
					.onChange(async (value) => {
						const parsed = Number(value);
						this.plugin.settings.trayOffsetY = Number.isFinite(
							parsed,
						)
							? parsed
							: 0;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Reset window position")
			.setDesc(
				"Clear the saved window position for this device so it recalculates near the tray icon on next open.",
			)
			.addButton((button) => {
				button.setButtonText("Reset").onClick(async () => {
					delete this.plugin.settings.windowPositions[
						process.platform
					];
					await this.plugin.saveSettings();
				});
			});
	}
}
