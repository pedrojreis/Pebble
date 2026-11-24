import { EditorState, Extension, Range } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { BulletWidget, CheckboxWidget, RuleWidget } from "./widgets";

/**
 * Live preview: markdown renders as formatted text, and the raw markers
 * (`#`, `**`, `- [ ]`, …) reappear on every line the cursor/selection touches.
 */

export interface LivePreviewOptions {
	openLink(url: string): void;
}

const hidden = Decoration.replace({});
const syntaxMark = Decoration.mark({ class: "pb-syntax" });
const bullet = Decoration.replace({ widget: new BulletWidget() });
const rule = Decoration.replace({ widget: new RuleWidget() });
const orderedMark = Decoration.mark({ class: "pb-list-num" });
const taskDone = Decoration.mark({ class: "pb-task-done" });
const plainLink = Decoration.mark({ class: "pb-link" });

const inlineStyles: Record<string, Decoration> = {
	Emphasis: Decoration.mark({ class: "pb-em" }),
	StrongEmphasis: Decoration.mark({ class: "pb-strong" }),
	Strikethrough: Decoration.mark({ class: "pb-strike" }),
	InlineCode: Decoration.mark({ class: "pb-code" }),
};

function activeLines(state: EditorState): Set<number> {
	const lines = new Set<number>();
	for (const range of state.selection.ranges) {
		const first = state.doc.lineAt(range.from).number;
		const last = state.doc.lineAt(range.to).number;
		for (let n = first; n <= last; n++) lines.add(n);
	}
	return lines;
}

function linkDecoration(href: string | null): Decoration {
	return href
		? Decoration.mark({ class: "pb-link", attributes: { "data-href": href } })
		: plainLink;
}

class DecorationCollector {
	readonly decorations: Range<Decoration>[] = [];
	private readonly active: Set<number>;

	constructor(readonly state: EditorState) {
		this.active = activeLines(state);
	}

	text(from: number, to: number): string {
		return this.state.doc.sliceString(from, to);
	}

	/** Extends `to` past a single following space, if any. */
	withSpace(to: number): number {
		return this.text(to, to + 1) === " " ? to + 1 : to;
	}

	isActive(from: number, to = from): boolean {
		const first = this.state.doc.lineAt(from).number;
		const last = this.state.doc.lineAt(to).number;
		for (let n = first; n <= last; n++) {
			if (this.active.has(n)) return true;
		}
		return false;
	}

	add(deco: Decoration, from: number, to: number): void {
		if (from < to) this.decorations.push(deco.range(from, to));
	}

	line(pos: number, cls: string): void {
		const line = this.state.doc.lineAt(pos);
		this.decorations.push(Decoration.line({ class: cls }).range(line.from));
	}

	/** Raw markup: dimmed on active lines, hidden elsewhere. */
	syntax(from: number, to: number, active: boolean): void {
		this.add(active ? syntaxMark : hidden, from, to);
	}
}

function visitHeaderMark(c: DecorationCollector, node: SyntaxNode): void {
	const heading = node.parent;
	if (!heading || !heading.name.startsWith("ATXHeading")) return;
	const active = c.isActive(node.from);
	if (node.from === heading.from) {
		c.syntax(node.from, c.withSpace(node.to), active);
	} else {
		// Optional closing marks: `# Title ##`
		const from = c.text(node.from - 1, node.from) === " " ? node.from - 1 : node.from;
		c.syntax(from, node.to, active);
	}
}

function visitListMark(c: DecorationCollector, node: SyntaxNode): void {
	const list = node.parent?.parent;
	if (list?.name === "OrderedList") {
		c.add(orderedMark, node.from, node.to);
		return;
	}

	const active = c.isActive(node.from);
	const task = node.nextSibling?.name === "Task" ? node.nextSibling : null;
	const marker = task?.getChild("TaskMarker");
	if (task && marker) {
		const checked = /x/i.test(c.text(marker.from, marker.to));
		const markupEnd = c.withSpace(marker.to);
		if (active) {
			c.add(syntaxMark, node.from, markupEnd);
		} else {
			c.add(
				Decoration.replace({ widget: new CheckboxWidget(checked) }),
				node.from,
				markupEnd,
			);
		}
		if (checked) {
			const lineEnd = c.state.doc.lineAt(marker.from).to;
			c.add(taskDone, markupEnd, Math.min(task.to, lineEnd));
		}
		return;
	}

	if (active) c.add(syntaxMark, node.from, node.to);
	else c.add(bullet, node.from, node.to);
}

function visitLink(c: DecorationCollector, node: SyntaxNode): void {
	const [open, close] = node.getChildren("LinkMark");
	if (!open || !close || c.text(open.from, open.to) !== "[") {
		c.add(plainLink, node.from, node.to);
		return;
	}
	const active = c.isActive(node.from, node.to);
	const url = node.getChild("URL");
	const href = url ? c.text(url.from, url.to) : null;
	c.syntax(open.from, open.to, active);
	c.syntax(close.from, node.to, active);
	c.add(linkDecoration(active ? null : href), open.to, close.from);
}

function visitAutolink(c: DecorationCollector, node: SyntaxNode): void {
	const active = c.isActive(node.from);
	const url = node.getChild("URL");
	if (!url) return;
	c.syntax(node.from, url.from, active);
	c.syntax(url.to, node.to, active);
	c.add(linkDecoration(active ? null : c.text(url.from, url.to)), url.from, url.to);
}

function visitFencedCode(c: DecorationCollector, node: SyntaxNode): void {
	const doc = c.state.doc;
	const firstLine = doc.lineAt(node.from);
	const lastLine = doc.lineAt(node.to);
	const active = c.isActive(node.from, node.to);
	const [openMark, closeMark] = node.getChildren("CodeMark");
	const info = node.getChild("CodeInfo");
	const closed = !!closeMark && lastLine.number > firstLine.number;

	for (let n = firstLine.number; n <= lastLine.number; n++) {
		const line = doc.line(n);
		let cls = "pb-codeblock";
		if (n === firstLine.number) cls += " pb-codeblock-start";
		if (n === lastLine.number) cls += " pb-codeblock-end";
		const isFence = n === firstLine.number || (closed && n === lastLine.number);
		if (isFence && !active) cls += " pb-fence-hidden";
		c.line(line.from, cls);
	}

	if (openMark) c.syntax(openMark.from, info ? info.to : openMark.to, active);
	if (closed && closeMark) c.syntax(closeMark.from, closeMark.to, active);
}

function visit(c: DecorationCollector, node: SyntaxNode): boolean | void {
	const heading = /^ATXHeading(\d)$/.exec(node.name);
	if (heading) {
		c.line(node.from, `pb-h pb-h${heading[1]}`);
		return;
	}

	const style = inlineStyles[node.name];
	if (style) c.add(style, node.from, node.to);

	switch (node.name) {
		case "HeaderMark":
			visitHeaderMark(c, node);
			return;
		case "EmphasisMark":
		case "StrikethroughMark":
			c.syntax(node.from, node.to, c.isActive(node.from));
			return;
		case "CodeMark":
			if (node.parent?.name === "InlineCode") {
				c.syntax(node.from, node.to, c.isActive(node.from));
			}
			return;
		case "Link":
			visitLink(c, node);
			return;
		case "Autolink":
			visitAutolink(c, node);
			return false;
		case "URL": {
			const parent = node.parent?.name;
			if (parent !== "Link" && parent !== "Image" && parent !== "Autolink") {
				const active = c.isActive(node.from);
				c.add(linkDecoration(active ? null : c.text(node.from, node.to)), node.from, node.to);
			}
			return;
		}
		case "Blockquote":
			if (node.parent?.name !== "Blockquote") {
				const doc = c.state.doc;
				const last = doc.lineAt(node.to).number;
				for (let n = doc.lineAt(node.from).number; n <= last; n++) {
					c.line(doc.line(n).from, "pb-quote");
				}
			}
			return;
		case "QuoteMark":
			c.syntax(node.from, c.withSpace(node.to), c.isActive(node.from));
			return;
		case "ListMark":
			visitListMark(c, node);
			return;
		case "FencedCode":
			visitFencedCode(c, node);
			return false;
		case "HorizontalRule":
			if (c.isActive(node.from)) c.add(syntaxMark, node.from, node.to);
			else c.add(rule, node.from, node.to);
			return;
	}
}

function buildDecorations(view: EditorView): DecorationSet {
	const c = new DecorationCollector(view.state);
	syntaxTree(view.state).iterate({
		from: view.viewport.from,
		to: view.viewport.to,
		enter: (ref) => visit(c, ref.node),
	});
	return Decoration.set(c.decorations, true);
}

/** Flips the `[ ]` / `[x]` that follows `pos` on its line. */
function toggleTask(view: EditorView, pos: number): void {
	const line = view.state.doc.lineAt(pos);
	const offset = pos - line.from;
	const match = /\[( |x|X)\]/.exec(line.text.slice(offset));
	if (!match) return;
	const at = line.from + offset + match.index + 1;
	view.dispatch({
		changes: { from: at, to: at + 1, insert: match[1] === " " ? "x" : " " },
	});
}

export function livePreview(options: LivePreviewOptions): Extension {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view);
			}

			update(update: ViewUpdate): void {
				if (
					update.docChanged ||
					update.selectionSet ||
					update.viewportChanged ||
					syntaxTree(update.state) !== syntaxTree(update.startState)
				) {
					this.decorations = buildDecorations(update.view);
				}
			}
		},
		{
			decorations: (plugin) => plugin.decorations,
			eventHandlers: {
				mousedown(event, view) {
					if (event.button !== 0) return false;
					const target = event.target;
					if (!(target instanceof HTMLElement)) return false;

					if (target.classList.contains("pb-checkbox")) {
						event.preventDefault();
						toggleTask(view, view.posAtDOM(target));
						return true;
					}

					const link = target.closest<HTMLElement>("[data-href]");
					const href = link?.dataset.href;
					if (href) {
						event.preventDefault();
						options.openLink(href);
						return true;
					}
					return false;
				},
			},
		},
	);
}
