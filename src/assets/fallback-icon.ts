/**
 * Minimal 16×16 black-dot PNG used when canvas icon creation fails.
 * Exported as a data-URL so Electron's nativeImage can parse it directly.
 */
export const FALLBACK_ICON_DATA_URL =
	"data:image/png;base64," +
	"iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9h" +
	"AAAADklEQVQ4jWNgGAWDEwAAAhAAAbFav8YAAAAASUVORK5CYII=";
