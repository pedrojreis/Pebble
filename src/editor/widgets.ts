import { WidgetType } from "@codemirror/view";

/** Rendered "•" in place of a `-`, `*` or `+` list marker. */
export class BulletWidget extends WidgetType {
	eq(): boolean {
		return true;
	}

	toDOM(): HTMLElement {
		const el = document.createElement("span");
		el.className = "pb-bullet";
		el.textContent = "•";
		return el;
	}
}

/** Clickable checkbox in place of a `- [ ]` / `- [x]` task marker. */
export class CheckboxWidget extends WidgetType {
	constructor(readonly checked: boolean) {
		super();
	}

	eq(other: CheckboxWidget): boolean {
		return other.checked === this.checked;
	}

	toDOM(): HTMLElement {
		const wrap = document.createElement("span");
		wrap.className = "pb-checkbox-wrap";
		const box = document.createElement("input");
		box.type = "checkbox";
		box.className = "pb-checkbox";
		box.checked = this.checked;
		box.tabIndex = -1;
		wrap.appendChild(box);
		return wrap;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

/** Horizontal line in place of `---`, `***` or `___`. */
export class RuleWidget extends WidgetType {
	eq(): boolean {
		return true;
	}

	toDOM(): HTMLElement {
		const el = document.createElement("span");
		el.className = "pb-hr";
		return el;
	}
}
