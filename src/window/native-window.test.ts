import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type App, TFile } from "obsidian";
import type { PebbleSettings } from "../settings";
import { NativeWindow } from "./native-window";

const { win, BrowserWindow, screen } = vi.hoisted(() => {
	const win = {
		loadURL: vi.fn(),
		close: vi.fn(),
		getPosition: vi.fn(),
		getSize: vi.fn(),
		show: vi.fn(),
		focus: vi.fn(),
		on: vi.fn(),
		isDestroyed: vi.fn(),
		setPosition: vi.fn(),
		webContents: { on: vi.fn() },
	};
	return {
		win,
		screen: {
			getPrimaryDisplay: vi.fn(),
			getDisplayNearestPoint: vi.fn(),
		},
		BrowserWindow: vi.fn(),
	};
});

vi.mock("obsidian", () => ({
	TFile: class { extension = "md"; },
	normalizePath: (path: string) => path,
	Notice: vi.fn(),
}));
vi.mock("../electron/utils", () => ({
	getRemote: () => ({ BrowserWindow, screen }),
}));
vi.mock("./editor-html", () => ({
	buildEditorHTML: () => "<textarea></textarea>",
}));

describe("NativeWindow", () => {
	let settings: PebbleSettings;
	let editor: NativeWindow;
	const saveSettings = vi.fn();

	beforeEach(() => {
		vi.resetAllMocks();
		BrowserWindow.mockImplementation(function () { return win; });
		win.loadURL.mockResolvedValue(undefined);
		win.getPosition.mockReturnValue([100, 50]);
		win.getSize.mockReturnValue([420, 320]);
		win.isDestroyed.mockReturnValue(false);
		saveSettings.mockResolvedValue(undefined);

		const app = {
			vault: {
				getAbstractFileByPath: () => new TFile(),
				read: () => Promise.resolve("An idea"),
			},
		} as unknown as App;
		settings = {
			notePath: "Inbox.md",
			monochromeTrayIcon: false,
			showNoteTitle: true,
			themeMode: "dark",
			windowPositions: {},
			windowWidth: 420,
			windowHeight: 320,
			trayOffsetX: 0,
			trayOffsetY: 0,
		};
		editor = new NativeWindow(app, () => settings, saveSettings);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("follows tray clicks between displays after saving the previous position", async () => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		settings.windowPositions.darwin = { x: 100, y: 50 };
		const primary = { x: 0, y: 0, width: 1920, height: 1080 };
		const secondary = { x: 1920, y: -200, width: 1920, height: 1080 };
		const primaryTray = { x: 900, y: 0, width: 40, height: 32 };
		const secondaryTray = { x: 2820, y: -200, width: 40, height: 32 };
		screen.getDisplayNearestPoint
			.mockReturnValueOnce({ workArea: primary })
			.mockReturnValueOnce({ workArea: secondary })
			.mockReturnValueOnce({ workArea: primary });
		win.getPosition
			.mockReturnValueOnce([100, 50])
			.mockReturnValueOnce([2630, -160]);

		await editor.toggle(primaryTray);
		expect(win.setPosition).toHaveBeenLastCalledWith(100, 50, false);
		await editor.toggle(primaryTray);
		expect(BrowserWindow).toHaveBeenCalledTimes(1);
		expect(editor.isOpen()).toBe(false);

		await editor.toggle(secondaryTray);
		expect(win.setPosition).toHaveBeenLastCalledWith(2630, -160, false);
		await editor.close();
		expect(settings.windowPositions.darwin).toEqual({ x: 2630, y: -160 });

		await editor.toggle(primaryTray);
		expect(win.setPosition).toHaveBeenLastCalledWith(710, 40, false);
		expect(screen.getDisplayNearestPoint.mock.calls).toEqual([
			[{ x: 920, y: 16 }],
			[{ x: 2840, y: -184 }],
			[{ x: 920, y: 16 }],
		]);
		expect(BrowserWindow).toHaveBeenCalledTimes(3);
		expect(win.close).toHaveBeenCalledTimes(2);
		expect(saveSettings).toHaveBeenCalledTimes(2);
	});

	it.each([
		{ platform: "darwin", themeMode: "dark", type: "panel", backgroundColor: "#0f1114" },
		{ platform: "darwin", themeMode: "light", type: "panel", backgroundColor: "#ffffff" },
		{ platform: "win32", themeMode: "dark", type: undefined, backgroundColor: "#0f1114" },
		{ platform: "linux", themeMode: "dark", type: undefined, backgroundColor: "#0f1114" },
	] as const)(
		"opens a focused editor on $platform with the $themeMode theme",
		async ({ platform, themeMode, type, backgroundColor }) => {
			vi.spyOn(process, "platform", "get").mockReturnValue(platform);
			settings.themeMode = themeMode;
			settings.windowPositions[platform] = { x: 100, y: 50 };

			await editor.toggle();

			expect(BrowserWindow).toHaveBeenCalledOnce();
			expect(BrowserWindow).toHaveBeenCalledWith(
				expect.objectContaining({ type, backgroundColor }),
			);
			expect(win.setPosition).toHaveBeenCalledWith(100, 50, false);
			expect(win.show).toHaveBeenCalledOnce();
			expect(win.focus).toHaveBeenCalledOnce();
		},
	);
});
