import { Notice, Plugin } from "obsidian";
import { MinimaSettings, DEFAULT_SETTINGS, MinimaSettingTab } from "./settings";
import { MinimaTray } from "./tray";
import { MinimaWindow } from "./note-window";

export default class MinimaPlugin extends Plugin {
	settings: MinimaSettings;
	private tray: MinimaTray | null = null;
	private noteWindow: MinimaWindow | null = null;

	async onload() {
		await this.loadSettings();

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const vaultPath: string = (this.app.vault.adapter as any).basePath;

		// ── Note window ────────────────────────────────────────
		console.log("Minima: Creating note window…");
		this.noteWindow = new MinimaWindow(this.settings, vaultPath);
		const windowOk = this.noteWindow.create();
		console.log("Minima: Note window creation result:", windowOk);

		if (!windowOk) {
			new Notice("Minima: Could not create the note window — check the console (Ctrl+Shift+I) for details.");
		}

		// ── System tray ────────────────────────────────────────
		console.log("Minima: Creating system tray…");
		this.tray = new MinimaTray(
			() => this.noteWindow?.toggle(),
			() => this.noteWindow?.hide(),
		);

		const trayOk = this.tray.create();
		console.log("Minima: Tray creation result:", trayOk);

		if (!trayOk) {
			new Notice("Minima: Could not create the system tray icon — check the console (Ctrl+Shift+I) for details.");
		}

		// ── Commands ───────────────────────────────────────────
		this.addCommand({
			id: "toggle-minima-window",
			name: "Toggle Minima window",
			callback: () => this.noteWindow?.toggle(),
		});

		this.addCommand({
			id: "show-minima-window",
			name: "Show Minima window",
			callback: () => this.noteWindow?.show(),
		});

		// ── Ribbon icon ────────────────────────────────────────
		this.addRibbonIcon("pencil", "Toggle Minima", () => {
			this.noteWindow?.toggle();
		});

		// ── Settings tab ───────────────────────────────────────
		this.addSettingTab(new MinimaSettingTab(this.app, this));
	}

	onunload() {
		if (this.noteWindow) {
			const latest = this.noteWindow.getSettings();
			Object.assign(this.settings, latest);
		}

		this.noteWindow?.destroy();
		this.noteWindow = null;

		this.tray?.destroy();
		this.tray = null;

		this.saveSettings();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData() as Partial<MinimaSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/** Reload the note window content (e.g. after changing the selected note). */
	reloadNoteWindow(): void {
		this.noteWindow?.loadContent();
	}

	/** Called from the settings tab to live-update the window. */
	updateWindowAlwaysOnTop(value: boolean): void {
		this.noteWindow?.setAlwaysOnTop(value);
	}
}
