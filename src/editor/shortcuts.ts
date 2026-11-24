import { EditorSelection, Extension, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

/**
 * Typing shortcuts on top of CodeMirror's markdown keymap (which already
 * continues lists/quotes on Enter and removes markup on Backspace).
 */

const FENCE = "```";

/** Line prefixes rewritten when followed by a space. */
const spaceRewrites: Array<[RegExp, (m: RegExpExecArray) => string]> = [
	[/^(\s*)[+*]$/, (m) => `${m[1]}- `],
	[/^(\s*)\[ ?\]$/, (m) => `${m[1]}- [ ] `],
	[/^(\s*)\[[xX]\]$/, (m) => `${m[1]}- [x] `],
	[/^(\s*)(>{2,})$/, (m) => `${m[1]}${(m[2] ?? "").split("").join(" ")} `],
	[/^(\s*)(\d+)\)$/, (m) => `${m[1]}${m[2]}. `],
];

function singleCursor(view: EditorView): number | null {
	const { ranges, main } = view.state.selection;
	return ranges.length === 1 && main.empty ? main.head : null;
}

const spaceShortcuts = EditorView.inputHandler.of((view, from, to, text) => {
	if (text !== " " || from !== to || singleCursor(view) !== from) return false;
	const line = view.state.doc.lineAt(from);
	const before = view.state.doc.sliceString(line.from, from);
	for (const [pattern, rewrite] of spaceRewrites) {
		const match = pattern.exec(before);
		if (!match) continue;
		const insert = rewrite(match);
		view.dispatch({
			changes: { from: line.from, to: from, insert },
			selection: EditorSelection.cursor(line.from + insert.length),
			userEvent: "input.type",
		});
		return true;
	}
	return false;
});

/** Enter after an opening ``` fence inserts the matching closing fence. */
function closeCodeFence(view: EditorView): boolean {
	const cursor = singleCursor(view);
	if (cursor === null) return false;
	const { doc } = view.state;
	const line = doc.lineAt(cursor);
	if (cursor !== line.to) return false;
	const match = /^(\s*)```[\w-]*$/.exec(line.text);
	if (!match) return false;

	// An odd number of fences before this line means this one closes a block.
	let fencesBefore = 0;
	for (let n = 1; n < line.number; n++) {
		if (doc.line(n).text.trimStart().startsWith(FENCE)) fencesBefore++;
	}
	if (fencesBefore % 2 === 1) return false;

	const indent = match[1] ?? "";
	view.dispatch({
		changes: { from: cursor, insert: `\n${indent}\n${indent}${FENCE}` },
		selection: EditorSelection.cursor(cursor + 1 + indent.length),
		userEvent: "input",
	});
	return true;
}

/** Backspace on an otherwise empty heading (`## `) removes the marker. */
function removeEmptyHeading(view: EditorView): boolean {
	const cursor = singleCursor(view);
	if (cursor === null) return false;
	const line = view.state.doc.lineAt(cursor);
	if (cursor !== line.to) return false;
	const match = /^(\s*)#{1,6} $/.exec(line.text);
	if (!match) return false;
	const indent = match[1] ?? "";
	view.dispatch({
		changes: { from: line.from, to: line.to, insert: indent },
		userEvent: "delete.backward",
	});
	return true;
}

export function markdownShortcuts(): Extension {
	return [
		spaceShortcuts,
		Prec.highest(
			keymap.of([
				{ key: "Enter", run: closeCodeFence },
				{ key: "Backspace", run: removeEmptyHeading },
			]),
		),
	];
}
