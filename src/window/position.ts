import type { ElectronRectangle } from "../electron/utils";

const TRAY_GAP = 8;
const SCREEN_MARGIN = 8;

export interface WindowPositionInput {
	anchor: ElectronRectangle | undefined;
	workArea: ElectronRectangle;
	winSize: { width: number; height: number };
	offsets: { x: number; y: number };
}

export function calculateWindowPosition({
	anchor,
	workArea,
	winSize: { width: winWidth, height: winHeight },
	offsets,
}: WindowPositionInput): { x: number; y: number } {
	if (!anchor) {
		return {
			x: Math.round(workArea.x + (workArea.width - winWidth) / 2),
			y: Math.round(workArea.y + (workArea.height - winHeight) / 2),
		};
	}

	const anchorCenterX = anchor.x + Math.round(anchor.width / 2);
	const anchorCenterY = anchor.y + Math.round(anchor.height / 2);

	const distTop = anchorCenterY - workArea.y;
	const distBottom = workArea.y + workArea.height - anchorCenterY;
	const distLeft = anchorCenterX - workArea.x;
	const distRight = workArea.x + workArea.width - anchorCenterX;
	const minDist = Math.min(distTop, distBottom, distLeft, distRight);

	let desiredX: number;
	let desiredY: number;

	if (minDist === distBottom) {
		// Tray on bottom → open above
		desiredX = Math.round(anchorCenterX - winWidth / 2);
		desiredY = Math.round(anchor.y - winHeight - TRAY_GAP);
	} else if (minDist === distTop) {
		// Tray on top → open below
		desiredX = Math.round(anchorCenterX - winWidth / 2);
		desiredY = Math.round(anchor.y + anchor.height + TRAY_GAP);
	} else if (minDist === distRight) {
		// Tray on right → open to the left
		desiredX = Math.round(anchor.x - winWidth - TRAY_GAP);
		desiredY = Math.round(anchorCenterY - winHeight / 2);
	} else {
		// Tray on left → open to the right
		desiredX = Math.round(anchor.x + anchor.width + TRAY_GAP);
		desiredY = Math.round(anchorCenterY - winHeight / 2);
	}

	desiredX += offsets.x;
	desiredY += offsets.y;

	const minX = workArea.x + SCREEN_MARGIN;
	const maxX = workArea.x + workArea.width - winWidth - SCREEN_MARGIN;
	const minY = workArea.y + SCREEN_MARGIN;
	const maxY = workArea.y + workArea.height - winHeight - SCREEN_MARGIN;

	return {
		x: Math.min(Math.max(desiredX, minX), Math.max(minX, maxX)),
		y: Math.min(Math.max(desiredY, minY), Math.max(minY, maxY)),
	};
}
