import { EditorSelection, EditorState, Prec, Transaction } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import {
	defaultKeymap,
	history,
	historyKeymap,
	indentWithTab,
} from "@codemirror/commands";
import { LanguageSupport } from "@codemirror/language";
import { markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { livePreview } from "./live-preview";
import { markdownShortcuts } from "./shortcuts";

/**
 * Entry point of the standalone editor window (bundled separately and
 * inlined into the window's HTML). Talks to the plugin through console
 * messages (editor → plugin) and `window.__pebbleEditor` (plugin → editor).
 */

declare global {
	interface Window {
		__pebbleInitialContent?: string;
		__pebbleEditor?: {
			getContent(): string;
			setContent(content: string): void;
		};
	}
}

const SAVE_PREFIX = "__pebble_save:";
const OPEN_PREFIX = "__pebble_open:";

function send(prefix: string, payload: string): void {
	console.log(prefix + JSON.stringify(payload));
}

const parent = document.getElementById("editor");
if (parent) {
	const view = new EditorView({
		parent,
		state: EditorState.create({
			doc: window.__pebbleInitialContent ?? "",
			extensions: [
				history(),
				markdownShortcuts(),
				keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
				// Not markdown(): it pulls in HTML/CSS/JS parsers we don't need.
				new LanguageSupport(markdownLanguage),
				Prec.high(keymap.of(markdownKeymap)),
				livePreview({ openLink: (url) => send(OPEN_PREFIX, url) }),
				EditorView.lineWrapping,
				EditorView.contentAttributes.of({ spellcheck: "true" }),
				placeholder("Start writing..."),
				EditorView.updateListener.of((update) => {
					const fromPlugin = update.transactions.some((tr) =>
						tr.annotation(Transaction.remote),
					);
					if (update.docChanged && !fromPlugin) {
						send(SAVE_PREFIX, update.state.doc.toString());
					}
				}),
			],
		}),
	});

	window.__pebbleEditor = {
		getContent: () => view.state.doc.toString(),
		setContent: (content: string) => {
			if (typeof content !== "string") return;
			const { doc, selection } = view.state;
			if (content === doc.toString()) return;
			const clamp = (pos: number) => Math.min(pos, content.length);
			view.dispatch({
				changes: { from: 0, to: doc.length, insert: content },
				selection: EditorSelection.create(
					selection.ranges.map((r) =>
						EditorSelection.range(clamp(r.anchor), clamp(r.head)),
					),
					selection.mainIndex,
				),
				annotations: [
					Transaction.remote.of(true),
					Transaction.addToHistory.of(false),
				],
			});
		},
	};

	view.focus();
}
