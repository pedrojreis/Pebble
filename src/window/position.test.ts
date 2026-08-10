import { describe, expect, it } from "vitest";
import { calculateWindowPosition } from "./position";

const WORK_AREA = { x: 0, y: 0, width: 1920, height: 1080 };
const WIN_SIZE = { width: 420, height: 320 };
const NO_OFFSET = { x: 0, y: 0 };

describe("calculateWindowPosition", () => {
	it("centers the window when there is no anchor", () => {
		const result = calculateWindowPosition({
			anchor: undefined,
			workArea: WORK_AREA,
			winSize: WIN_SIZE,
			offsets: NO_OFFSET,
		});
		expect(result).toEqual({ x: 750, y: 380 });
	});

	it("opens above when tray is at the bottom edge", () => {
		// anchor bottom-center: anchorCenterY=1056, distBottom=24 is minimum
		const result = calculateWindowPosition({
			anchor: { x: 900, y: 1040, width: 40, height: 32 },
			workArea: WORK_AREA,
			winSize: WIN_SIZE,
			offsets: NO_OFFSET,
		});
		// desiredX = round(920 - 210) = 710, desiredY = round(1040 - 320 - 8) = 712
		expect(result).toEqual({ x: 710, y: 712 });
	});

	it("opens below when tray is at the top edge", () => {
		// anchor top-center: anchorCenterY=16, distTop=16 is minimum
		const result = calculateWindowPosition({
			anchor: { x: 900, y: 0, width: 40, height: 32 },
			workArea: WORK_AREA,
			winSize: WIN_SIZE,
			offsets: NO_OFFSET,
		});
		// desiredX = round(920 - 210) = 710, desiredY = round(0 + 32 + 8) = 40
		expect(result).toEqual({ x: 710, y: 40 });
	});

	it("opens to the left when tray is at the right edge", () => {
		// anchor right-center: anchorCenterX=1900, distRight=20 is minimum
		const result = calculateWindowPosition({
			anchor: { x: 1880, y: 500, width: 40, height: 32 },
			workArea: WORK_AREA,
			winSize: WIN_SIZE,
			offsets: NO_OFFSET,
		});
		// desiredX = round(1880 - 420 - 8) = 1452, desiredY = round(516 - 160) = 356
		expect(result).toEqual({ x: 1452, y: 356 });
	});

	it("opens to the right when tray is at the left edge", () => {
		// anchor left-center: anchorCenterX=20, distLeft=20 is minimum
		const result = calculateWindowPosition({
			anchor: { x: 0, y: 500, width: 40, height: 32 },
			workArea: WORK_AREA,
			winSize: WIN_SIZE,
			offsets: NO_OFFSET,
		});
		// desiredX = round(0 + 40 + 8) = 48, desiredY = round(516 - 160) = 356
		expect(result).toEqual({ x: 48, y: 356 });
	});

	it("clamps the window to stay within the work area", () => {
		// anchor bottom-right: distBottom=24 wins, but desiredX=1680 exceeds maxX=1492
		const result = calculateWindowPosition({
			anchor: { x: 1870, y: 1040, width: 40, height: 32 },
			workArea: WORK_AREA,
			winSize: WIN_SIZE,
			offsets: NO_OFFSET,
		});
		expect(result).toEqual({ x: 1492, y: 712 });
	});

	it("applies offsets before clamping", () => {
		const result = calculateWindowPosition({
			anchor: { x: 900, y: 1040, width: 40, height: 32 },
			workArea: WORK_AREA,
			winSize: WIN_SIZE,
			offsets: { x: 10, y: -5 },
		});
		// base desiredX=710, desiredY=712 → +10/-5 → 720, 707
		expect(result).toEqual({ x: 720, y: 707 });
	});
});
