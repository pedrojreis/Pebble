import editorTemplate from "./editor/editor-template.html";
import editorStyles from "./editor/editor.css";
import editorScriptTemplate from "./editor/editor-script.template.js";

function replaceToken(template: string, token: string, value: string): string {
	return template.split(token).join(value);
}

/**
 * Builds the complete HTML document string for the standalone Minima editor.
 * The returned HTML runs inside an Electron BrowserWindow with nodeIntegration
 * and uses Node's fs module for direct file I/O.
 */
export function buildEditorHTML(
	initialContent: string,
	noteTitle: string,
	showNoteTitle: boolean,
): string {
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

	return replaceToken(
		replaceToken(
			replaceToken(
				replaceToken(
					replaceToken(
						editorTemplate,
						"__EDITOR_STYLE__",
						editorStyles,
					),
					"__NOTE_TITLE_HIDDEN_ATTR__",
					showNoteTitle ? "" : "hidden",
				),
				"__INITIAL_CONTENT__",
				escapedInitialContentForTextarea,
			),
			"__NOTE_TITLE__",
			escapedNoteTitleForHtml,
		),
		"__EDITOR_SCRIPT__",
		editorScript,
	);
}
