import { getRemote, ElectronRectangle, ElectronTray } from "./electron-utils";
import {
	TRAY_ICON_COLOR_DATA_URL,
	TRAY_ICON_MONOCHROME_DATA_URL,
} from "./assets/icons";

const OBSIDIAN_ICON_PATH =
	"M382.3 475.6c-3.1 23.4-26 41.6-48.7 35.3-32.4-8.9-69.9-22.8-103.6-25.4l-51.7-4a34 34 0 0 1-22-10.2l-89-91.7a34 34 0 0 1-6.7-37.7s55-121 57.1-127.3c2-6.3 9.6-61.2 14-90.6 1.2-7.9 5-15 11-20.3L248 8.9a34.1 34.1 0 0 1 49.6 4.3L386 125.6a37 37 0 0 1 7.6 22.4c0 21.3 1.8 65 13.6 93.2 11.5 27.3 32.5 57 43.5 71.5a17.3 17.3 0 0 1 1.3 19.2 1494 1494 0 0 1-44.8 70.6c-15 22.3-21.9 49.9-25 73.1z";

const GLOBAL_TRAY_KEY = "__minima_tray_instance__";

function getGlobalTray(): ElectronTray | null {
	const value = (
		window as Window & {
			[GLOBAL_TRAY_KEY]?: ElectronTray;
		}
	)[GLOBAL_TRAY_KEY];
	return value ?? null;
}

function setGlobalTray(tray: ElectronTray | null): void {
	const target = window as Window & {
		[GLOBAL_TRAY_KEY]?: ElectronTray;
	};
	if (tray) {
		target[GLOBAL_TRAY_KEY] = tray;
		return;
	}
	delete target[GLOBAL_TRAY_KEY];
}

export class MinimaTray {
	private tray: ElectronTray | null = null;

	private buildTrayIcon(
		remote: NonNullable<ReturnType<typeof getRemote>>,
		useTemplateIcon: boolean,
	) {
		const size = 32;
		let icon = null;
		const primaryIconDataUrl: string = useTemplateIcon
			? (TRAY_ICON_MONOCHROME_DATA_URL as string)
			: (TRAY_ICON_COLOR_DATA_URL as string);
		const alternateIconDataUrl: string = useTemplateIcon
			? (TRAY_ICON_COLOR_DATA_URL as string)
			: (TRAY_ICON_MONOCHROME_DATA_URL as string);

		try {
			const canvas = document.createElement("canvas");
			canvas.width = size;
			canvas.height = size;
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Canvas context unavailable");

			context.clearRect(0, 0, size, size);
			context.save();
			context.scale(size / 512, size / 512);
			context.fillStyle = useTemplateIcon ? "#ffffff" : "#9974F8";
			context.fill(new Path2D(OBSIDIAN_ICON_PATH));
			context.restore();

			icon = remote.nativeImage.createFromDataURL(
				canvas.toDataURL("image/png"),
			);
		} catch {
			icon = remote.nativeImage.createFromDataURL(primaryIconDataUrl);
		}

		const resized = icon.resize({ width: 18, height: 18 });
		if (!resized.isEmpty()) {
			return resized;
		}

		return remote.nativeImage
			.createFromDataURL(alternateIconDataUrl)
			.resize({ width: 18, height: 18 });
	}

	create(
		onClick: (bounds?: ElectronRectangle) => void,
		useTemplateIcon = false,
	): void {
		if (this.tray) return;

		const existingTray = getGlobalTray();
		if (existingTray) {
			existingTray.destroy();
			setGlobalTray(null);
		}

		const remote = getRemote();
		if (!remote) return;

		const trayIcon = this.buildTrayIcon(remote, useTemplateIcon);

		this.tray = new remote.Tray(trayIcon);
		setGlobalTray(this.tray);
		this.tray.setToolTip("Minima");
		this.tray.on("click", (_event, bounds) => {
			onClick(bounds ?? this.tray?.getBounds());
		});
	}

	destroy(): void {
		if (this.tray) {
			this.tray.destroy();
			setGlobalTray(null);
			this.tray = null;
		}
	}
}
