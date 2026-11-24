import editorTemplate from "../editor/editor-template.html";
import editorStyles from "../editor/editor.css";
import editorBundle from "pebble-editor-bundle";
import { PebbleThemeMode } from "../settings";

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/** JSON that is safe to place inside an inline `<script>`. */
function toScriptLiteral(value: string): string {
	return JSON.stringify(value).replace(/</g, "\u003c");
}

/**
 * Builds the complete HTML document string for the standalone Pebble editor.
 */
export function buildEditorHTML(
	initialContent: string,
	noteTitle: string,
	showNoteTitle: boolean,
	themeMode: PebbleThemeMode,
): string {
	const normalizedTheme = themeMode === "light" ? "light" : "dark";
	const tokens: Record<string, string> = {
		EDITOR_STYLE: editorStyles,
		THEME_BODY_ATTR: `data-pebble-theme="${normalizedTheme}"`,
		NOTE_TITLE_HIDDEN_ATTR: showNoteTitle ? "" : "hidden",
		NOTE_TITLE: escapeHtml(noteTitle),
		INITIAL_CONTENT: toScriptLiteral(initialContent),
		EDITOR_SCRIPT: editorBundle,
	};

	// Single pass, so token-like text inside the note or bundle is left alone.
	return editorTemplate.replace(
		/__([A-Z_]+)__/g,
		(token: string, name: string) => tokens[name] ?? token,
	);
}
