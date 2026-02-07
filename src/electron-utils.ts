/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Safely access the Electron remote module from within an Obsidian plugin.
 * Tries @electron/remote first (newer Electron), then falls back to electron.remote.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedRemote: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getRemote(): any {
	if (cachedRemote) return cachedRemote;

	try {
		cachedRemote = require("@electron/remote");
		console.log("Minima: loaded @electron/remote successfully");
		return cachedRemote;
	} catch (e1) {
		console.log("Minima: @electron/remote not available:", e1);
		try {
			const electron = require("electron");
			if (electron.remote) {
				cachedRemote = electron.remote;
				console.log("Minima: loaded electron.remote fallback");
				return cachedRemote;
			}
			console.log("Minima: electron.remote is undefined");
		} catch (e2) {
			console.log("Minima: electron module also failed:", e2);
		}
	}

	console.error("Minima: No Electron remote module found. Tray/window features disabled.");
	return null;
}
