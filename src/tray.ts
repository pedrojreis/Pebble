import { getRemote, ElectronRectangle, ElectronTray } from "./electron-utils";
import {
	OBSIDIAN_ICON_PATH,
	TRAY_ICON_COLOR_DATA_URL,
	TRAY_ICON_MONOCHROME_DATA_URL,
} from "./assets/icons";

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
			? TRAY_ICON_MONOCHROME_DATA_URL
			: TRAY_ICON_COLOR_DATA_URL;
		const alternateIconDataUrl: string = useTemplateIcon
			? TRAY_ICON_COLOR_DATA_URL
			: TRAY_ICON_MONOCHROME_DATA_URL;

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
