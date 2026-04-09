/**
 * Helpers for accessing Electron's remote module inside an Obsidian plugin.
 * Electron remote is required for tray icons and BrowserWindow creation.
 */

let cachedRemote: ElectronRemote | null = null;

interface ElectronRemote {
	nativeImage: { createFromDataURL(url: string): ElectronNativeImage };
	Tray: new (image: ElectronNativeImage) => ElectronTray;
	BrowserWindow: new (
		opts: ElectronBrowserWindowOptions,
	) => ElectronBrowserWindowInstance;
	screen?: ElectronScreen;
}

export interface ElectronRectangle {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface ElectronScreen {
	getPrimaryDisplay(): ElectronDisplay;
	getDisplayNearestPoint(point: { x: number; y: number }): ElectronDisplay;
}

interface ElectronDisplay {
	workArea: ElectronRectangle;
}

interface ElectronBrowserWindowOptions {
	width?: number;
	height?: number;
	x?: number;
	y?: number;
	title?: string;
	show?: boolean;
	frame?: boolean;
	webPreferences?: {
		nodeIntegration?: boolean;
		contextIsolation?: boolean;
		sandbox?: boolean;
	};
}

export interface ElectronBrowserWindowInstance {
	loadURL(url: string): Promise<void>;
	close(): void;
	destroy(): void;
	isDestroyed(): boolean;
	show(): void;
	focus(): void;
	setPosition(x: number, y: number, animate?: boolean): void;
	on(event: string, callback: () => void): void;
	webContents: ElectronWebContents;
}

interface ElectronWebContents {
	executeJavaScript(code: string): Promise<unknown>;
	on(event: string, callback: (...args: unknown[]) => void): void;
}

interface ElectronNativeImage {
	setTemplateImage(flag: boolean): void;
	resize(options: { width: number; height: number }): ElectronNativeImage;
	isEmpty(): boolean;
}

export interface ElectronTray {
	setToolTip(text: string): void;
	setTitle?(text: string): void;
	getBounds(): ElectronRectangle;
	on(
		event: string,
		callback: (event: unknown, bounds: ElectronRectangle) => void,
	): void;
	destroy(): void;
}

function getRequire(win: Window = window): ((id: string) => unknown) | null {
	const req = (win as Window & { require?: (id: string) => unknown }).require;
	return typeof req === "function" ? req : null;
}

/**
 * Returns the Electron remote module from the main window context.
 * Cached after first successful load.
 */
export function getRemote(): ElectronRemote | null {
	if (cachedRemote) return cachedRemote;

	const req = getRequire(window);
	if (!req) return null;

	try {
		cachedRemote = req("@electron/remote") as ElectronRemote;
		return cachedRemote;
	} catch {
		/* not available */
	}

	try {
		const electron = req("electron") as
			| { remote?: ElectronRemote }
			| undefined;
		if (electron?.remote) {
			cachedRemote = electron.remote;
			return cachedRemote;
		}
	} catch {
		/* not available */
	}

	return null;
}
