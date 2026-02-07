import { getRemote } from "./electron-utils";
import { Platform } from "obsidian";
import { FALLBACK_ICON_DATA_URL } from "./assets/fallback-icon";

/**
 * Keep a module-level reference to the tray so we can destroy
 * any leftover instance from a previous plugin load cycle
 * (e.g. Obsidian hot-reload, settings change, crash recovery).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeTray: any = null;

export class MinimaTray {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private tray: any = null;
	private onToggle: () => void;
	private onQuit: () => void;

	constructor(onToggle: () => void, onQuit: () => void) {
		this.onToggle = onToggle;
		this.onQuit = onQuit;
	}

	create(): boolean {
		const remote = getRemote();
		if (!remote) {
			console.error("Minima: getRemote() returned null — cannot create tray");
			return false;
		}

		const { Tray, Menu, nativeImage } = remote;

		// Destroy any leftover tray from a previous load cycle
		if (activeTray) {
			try { activeTray.destroy(); } catch { /* already gone */ }
			activeTray = null;
		}

		try {
			const icon = this.createIcon(nativeImage);
			this.tray = new Tray(icon);
			this.tray.setToolTip("Minima");
			activeTray = this.tray;
		} catch (e) {
			console.error("Minima: Failed to create tray:", e);
			return false;
		}

		this.tray.on("click", () => this.onToggle());

		const contextMenu = Menu.buildFromTemplate([
			{ label: "Toggle Minima", click: () => this.onToggle() },
			{ type: "separator" },
			{ label: "Hide", click: () => this.onQuit() },
		]);

		this.tray.on("right-click", () => {
			this.tray.popUpContextMenu(contextMenu);
		});

		if (Platform.isMacOS) {
			this.tray.setContextMenu(null);
		}

		return true;
	}

	/**
	 * Draw the Obsidian gem/crystal icon on a canvas and return it as a
	 * native Electron image. Drawn at 2× for retina; macOS template-image
	 * tinting handles light/dark automatically.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private createIcon(nativeImage: any): any {
		try {
			const size = 32;
			const canvas = document.createElement("canvas");
			canvas.width = size;
			canvas.height = size;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("Canvas context unavailable");

			ctx.fillStyle = "#000";
			ctx.strokeStyle = "#000";
			ctx.lineWidth = 1;
			ctx.lineJoin = "round";

			// Outer gem silhouette (Obsidian crystal shape)
			ctx.beginPath();
			ctx.moveTo(16, 1);   // top vertex
			ctx.lineTo(27, 9);   // upper-right
			ctx.lineTo(24, 25);  // lower-right
			ctx.lineTo(16, 31);  // bottom vertex
			ctx.lineTo(8, 25);   // lower-left
			ctx.lineTo(5, 9);    // upper-left
			ctx.closePath();
			ctx.fill();

			// Internal facet lines (lighter, to show the crystal facets)
			ctx.strokeStyle = "rgba(255,255,255,0.35)";
			ctx.lineWidth = 1;

			// Center vertical crease
			ctx.beginPath();
			ctx.moveTo(16, 1);
			ctx.lineTo(16, 31);
			ctx.stroke();

			// Upper facet edges
			ctx.beginPath();
			ctx.moveTo(5, 9);
			ctx.lineTo(16, 14);
			ctx.lineTo(27, 9);
			ctx.stroke();

			// Lower facet edges
			ctx.beginPath();
			ctx.moveTo(8, 25);
			ctx.lineTo(16, 14);
			ctx.lineTo(24, 25);
			ctx.stroke();

			const dataURL = canvas.toDataURL("image/png");
			const icon = nativeImage.createFromDataURL(dataURL);
			icon.setTemplateImage(true);
			return icon.resize({ width: 18, height: 18 });
		} catch (e) {
			console.error("Minima: Icon creation failed, using fallback:", e);
			const fallback = nativeImage.createFromDataURL(FALLBACK_ICON_DATA_URL);
			fallback.setTemplateImage(true);
			return fallback;
		}
	}

	destroy(): void {
		if (this.tray) {
			try { this.tray.destroy(); } catch { /* already gone */ }
			if (activeTray === this.tray) activeTray = null;
			this.tray = null;
		}
	}
}
