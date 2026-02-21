import { getRemote, ElectronRectangle, ElectronTray } from "./electron-utils";
import { TRAY_ICON_DATA_URL } from "./assets/fallback-icon";

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

		const icon = remote.nativeImage.createFromDataURL(TRAY_ICON_DATA_URL);
		const trayIcon = icon.resize({ width: 18, height: 18 });
		if (process.platform === "darwin") {
			trayIcon.setTemplateImage(useTemplateIcon);
		}

		this.tray = new remote.Tray(trayIcon);
		setGlobalTray(this.tray);
		if (process.platform === "darwin") {
			const isEmpty = trayIcon.isEmpty();
			if (isEmpty) {
				this.tray.setTitle?.("◆");
			}
		}
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
