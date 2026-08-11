import {
	App,
	Plugin,
	PluginSettingTab,
	SettingDefinitionItem,
	TFile,
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

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: "Note",
				desc: "Choose the note that pebble opens and saves as you type.",
				control: {
					type: "file",
					key: "notePath",
					filter: (f: TFile) => f.extension === "md",
				},
			},
			{
				name: "Monochrome tray icon",
				desc: "Use a monochrome tray icon that blends with the system tray or menu bar.",
				control: { type: "toggle", key: "monochromeTrayIcon" },
			},
			{
				name: "Show note title",
				desc: "Show the current note title as a subtle watermark in the editor.",
				control: { type: "toggle", key: "showNoteTitle" },
			},
			{
				name: "Color mode",
				desc: "Choose whether the pebble editor uses a white or dark background.",
				control: {
					type: "dropdown",
					key: "themeMode",
					options: { light: "White mode", dark: "Dark mode" },
				},
			},
			{
				name: "Tray offset X",
				desc: "Horizontal offset in pixels applied when the window first opens near the tray icon. Positive moves right, negative moves left.",
				control: {
					type: "number",
					key: "trayOffsetX",
					placeholder: "0",
				},
			},
			{
				name: "Vertical tray offset",
				desc: "Vertical offset in pixels applied when the window first opens near the tray icon. Positive moves down, negative moves up.",
				control: {
					type: "number",
					key: "trayOffsetY",
					placeholder: "0",
				},
			},
			{
				name: "Reset window position",
				desc: "Clear the saved window position so it recalculates near the tray icon on next open.",
				action: (_el: HTMLElement, _index: number) => {
					this.plugin.settings.windowX = null;
					this.plugin.settings.windowY = null;
					void this.plugin.saveSettings();
				},
			},
		];
	}

	getControlValue(key: string): unknown {
		return this.plugin.settings[key as keyof PebbleSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const prev = this.plugin.settings[key as keyof PebbleSettings];
		if (key === "notePath" && typeof value === "string") {
			this.plugin.settings.notePath = normalizePath(value);
		} else {
			(this.plugin.settings as unknown as Record<string, unknown>)[key] =
				value;
		}
		await this.plugin.saveSettings();
		// Only refresh when the value actually changes to avoid spurious tray resets on init
		if (key === "monochromeTrayIcon" && value !== prev) {
			this.plugin.refreshTrayIcon();
		}
	}
}
