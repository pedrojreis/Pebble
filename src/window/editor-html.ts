import editorTemplate from "../editor/editor-template.html";
import editorStyles from "../editor/editor.css";
import editorScriptTemplate from "../editor/editor-script.template.js";
import { PebbleThemeMode } from "../settings";

function replaceToken(template: string, token: string, value: string): string {
	return template.split(token).join(value);
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
	const themeBodyAttr = `data-pebble-theme="${normalizedTheme}"`;
	const escapedNoteTitleForHtml = noteTitle
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
	const serializedInitialContent = JSON.stringify(initialContent);
	const escapedInitialContentForTextarea = initialContent
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
	const editorScript = editorScriptTemplate
		.split("__INITIAL_CONTENT__")
		.join(serializedInitialContent);

	let html = editorTemplate;
	html = replaceToken(html, "__EDITOR_STYLE__", editorStyles);
	html = replaceToken(html, "__THEME_BODY_ATTR__", themeBodyAttr);
	html = replaceToken(
		html,
		"__NOTE_TITLE_HIDDEN_ATTR__",
		showNoteTitle ? "" : "hidden",
	);
	html = replaceToken(
		html,
		"__INITIAL_CONTENT__",
		escapedInitialContentForTextarea,
	);
	html = replaceToken(html, "__NOTE_TITLE__", escapedNoteTitleForHtml);
	html = replaceToken(html, "__EDITOR_SCRIPT__", editorScript);

	return html;
}
