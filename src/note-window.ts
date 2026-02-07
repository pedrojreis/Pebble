import { getRemote } from "./electron-utils";
import { MinimaSettings } from "./settings";
import { Notice } from "obsidian";
import * as path from "path";
import * as fs from "fs";
import noteWindowCss from "./note-window.css";

/** CSS variables extracted from the live Obsidian window. */
interface ObsidianThemeVars {
	backgroundPrimary: string;
	backgroundSecondary: string;
	textNormal: string;
	textFaint: string;
	textMuted: string;
	textAccent: string;
	fontText: string;
	fontTextSize: string;
	borderColor: string;
	scrollbarThumb: string;
	scrollbarActive: string;
}

export class MinimaWindow {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private win: any = null;
	private settings: MinimaSettings;
	private vaultPath: string;
	private isDestroying = false;
	private beforeQuitHandler: (() => void) | null = null;

	constructor(settings: MinimaSettings, vaultPath: string) {
		this.settings = settings;
		this.vaultPath = vaultPath;
	}

	/** Absolute path to the selected vault note. */
	private getNotePath(): string | null {
		if (!this.settings.notePath) return null;
		return path.join(this.vaultPath, this.settings.notePath);
	}

	private readNoteContent(): string {
		const notePath = this.getNotePath();
		if (!notePath) return "";
		try {
			if (fs.existsSync(notePath)) {
				return fs.readFileSync(notePath, "utf8");
			}
		} catch (e) {
			console.error("Minima: Failed to read note", e);
		}
		return "";
	}

	create(): boolean {
		const remote = getRemote();
		if (!remote) {
			new Notice("Minima: Electron remote module is not available.");
			return false;
		}

		const { BrowserWindow } = remote;

		const x = this.settings.windowX ?? undefined;
		const y = this.settings.windowY ?? undefined;

		this.win = new BrowserWindow({
			width: this.settings.windowWidth,
			height: this.settings.windowHeight,
			x,
			y,
			frame: false,
			alwaysOnTop: this.settings.alwaysOnTop,
			skipTaskbar: true,
			resizable: true,
			minimizable: false,
			maximizable: false,
			fullscreenable: false,
			show: false,
			hasShadow: true,
			roundedCorners: true,
			webPreferences: {
				nodeIntegration: true,
				contextIsolation: false,
			},
		});

		// Enable @electron/remote for the child window so it can hide itself
		try {
			const remoteMain = remote.require("@electron/remote/main");
			remoteMain.enable(this.win.webContents);
		} catch (e) {
			console.log("Minima: Could not enable remote for child window:", e);
		}

		this.loadContent();

		// Hide when the window loses focus (click outside)
		this.win.on("blur", () => {
			if (this.win && this.win.isVisible()) {
				this.win.webContents
					.executeJavaScript("__minimaSave()")
					.catch(() => {});
				this.win.hide();
			}
		});

		// Persist window bounds on move/resize
		const debouncedSaveBounds = debounce(
			() => this.saveWindowBounds(),
			500,
		);
		this.win.on("moved", debouncedSaveBounds);
		this.win.on("resized", debouncedSaveBounds);

		// Ensure the child window doesn't prevent Obsidian from quitting.
		// Without this, closing Obsidian leaves an orphan Electron process
		// that blocks reopening the app.
		const app = remote.app;
		this.beforeQuitHandler = () => {
			this.destroy();
		};
		app.on("before-quit", this.beforeQuitHandler);

		return true;
	}

	/** Read Obsidian's current CSS variables from the live DOM. */
	private getObsidianTheme(): ObsidianThemeVars {
		const cs = getComputedStyle(document.body);
		const v = (name: string, fallback: string) =>
			cs.getPropertyValue(name).trim() || fallback;

		return {
			backgroundPrimary: v("--background-primary", "#ffffff"),
			backgroundSecondary: v("--background-secondary", "#f5f5f5"),
			textNormal: v("--text-normal", "#333333"),
			textFaint: v("--text-faint", "#999999"),
			textMuted: v("--text-muted", "#666666"),
			textAccent: v("--text-accent", "#705dcf"),
			fontText: v(
				"--font-text",
				"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
			),
			fontTextSize: v("--font-text-size", "16px"),
			borderColor: v("--background-modifier-border", "#ddd"),
			scrollbarThumb: v("--scrollbar-thumb-bg", "rgba(128,128,128,0.2)"),
			scrollbarActive: v(
				"--scrollbar-active-thumb-bg",
				"rgba(128,128,128,0.35)",
			),
		};
	}

	/** (Re)load the HTML with current note content. Called on create and on note change. */
	loadContent(): void {
		if (!this.win) return;
		const html = this.buildHTML();
		this.win.loadURL(
			`data:text/html;base64,${Buffer.from(html).toString("base64")}`,
		);
	}

	private saveWindowBounds(): void {
		if (!this.win) return;
		try {
			const bounds = this.win.getBounds();
			this.settings.windowWidth = bounds.width;
			this.settings.windowHeight = bounds.height;
			this.settings.windowX = bounds.x;
			this.settings.windowY = bounds.y;
		} catch {
			// Window may already be destroyed
		}
	}

	toggle(): void {
		if (!this.win) {
			console.log("Minima: toggle() called but win is null");
			return;
		}
		console.log("Minima: toggle(), visible:", this.win.isVisible());
		if (this.win.isVisible()) {
			this.win.hide();
		} else {
			// Re-read file content each time we show, in case it was edited in Obsidian
			this.loadContent();
			this.win.show();
			this.win.focus();
		}
	}

	show(): void {
		if (this.win) {
			this.loadContent();
			this.win.show();
			this.win.focus();
		}
	}

	hide(): void {
		this.win?.hide();
	}

	setAlwaysOnTop(value: boolean): void {
		this.win?.setAlwaysOnTop(value);
	}

	getSettings(): MinimaSettings {
		return this.settings;
	}

	destroy(): void {
		if (this.isDestroying) return;
		this.isDestroying = true;

		// Remove the before-quit listener so we don't leak or re-enter
		if (this.beforeQuitHandler) {
			try {
				const remote = getRemote();
				if (remote) {
					remote.app.removeListener(
						"before-quit",
						this.beforeQuitHandler,
					);
				}
			} catch {
				/* ignore */
			}
			this.beforeQuitHandler = null;
		}

		if (this.win) {
			try {
				// Save before destroying
				this.win.webContents
					.executeJavaScript("__minimaSave && __minimaSave()")
					.catch(() => {});
			} catch {
				/* ignore */
			}
			try {
				this.win.removeAllListeners();
				this.win.destroy();
			} catch {
				/* ignore */
			}
			this.win = null;
		}
	}

	// ── HTML generation ──────────────────────────────────────────────

	private buildHTML(): string {
		const notePath = this.getNotePath();
		const content = this.readNoteContent();
		const hasNote = !!notePath;
		const theme = this.getObsidianTheme();

		const config = {
			theme,
			notePath: notePath ?? "",
			initialContent: content,
			hasNote,
		};

		const configJSON = JSON.stringify(config).replace(/<\//g, "<\\/");

		return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${noteWindowCss}
</style>
</head>
<body>
<div class="titlebar">
	<div class="title">Minima</div>
	<div class="titlebar-buttons">
		${hasNote ? `<button id="btn-md" class="tb-btn" title="Toggle markdown"><svg width="16" height="10" viewBox="0 0 208 128" fill="currentColor"><path d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0l-30-33h20V30h20v35h20z"/></svg></button>` : ""}
		<button id="btn-close" class="tb-btn btn-close" title="Close">&times;</button>
	</div>
</div>
${
	hasNote
		? `<textarea id="editor" placeholder="Start typing\u2026" spellcheck="true"></textarea>
	   <div id="preview" class="preview hidden"></div>`
		: `<div class="no-note">
		<p>No note selected.</p>
		<p class="hint">Go to <strong>Settings \u2192 Minima</strong> to pick a note.</p>
	</div>`
}

<script>
${noteWindowScript(configJSON)}
</script>
</body>
</html>`;
	}
}

// ── JavaScript for the note window ─────────────────────────────────

function noteWindowScript(configJSON: string): string {
	return `(function() {
	"use strict";

	var CONFIG = ${configJSON};
	var fs = require("fs");

	var theme    = CONFIG.theme;
	var notePath = CONFIG.notePath;
	var hasNote  = CONFIG.hasNote;
	var saveTimer = null;

	applyTheme();

	// -- Apply Obsidian theme variables --
	function applyTheme() {
		var root = document.documentElement;
		root.style.setProperty("--bg", theme.backgroundPrimary);
		root.style.setProperty("--bg-secondary", theme.backgroundSecondary);
		root.style.setProperty("--text", theme.textNormal);
		root.style.setProperty("--text-faint", theme.textFaint);
		root.style.setProperty("--text-muted", theme.textMuted);
		root.style.setProperty("--text-accent", theme.textAccent);
		root.style.setProperty("--font-text", theme.fontText);
		root.style.setProperty("--font-size", theme.fontTextSize);
		root.style.setProperty("--border", theme.borderColor);
		root.style.setProperty("--scrollbar-thumb", theme.scrollbarThumb);
		root.style.setProperty("--scrollbar-active", theme.scrollbarActive);
	}

	// -- Close button --
	var btnClose = document.getElementById("btn-close");
	if (btnClose) {
		btnClose.addEventListener("click", function() {
			try {
				var remote = require("@electron/remote");
				remote.getCurrentWindow().hide();
			} catch(e) {
				window.close();
			}
		});
	}

	// -- No note selected: nothing more to do --
	if (!hasNote) {
		window.__minimaSave = function() {};
		return;
	}

	var editor = document.getElementById("editor");
	var preview = document.getElementById("preview");
	var btnMd = document.getElementById("btn-md");
	var isPreview = true;

	editor.value = CONFIG.initialContent;

	// Start in preview mode (rendered markdown)
	preview.innerHTML = renderMarkdown(editor.value);
	editor.style.display = "none";
	preview.classList.remove("hidden");

	// -- Markdown toggle --
	if (btnMd) {
		btnMd.addEventListener("click", function() {
			isPreview = !isPreview;
			if (isPreview) {
				// Switch to preview mode
				saveData();
				preview.innerHTML = renderMarkdown(editor.value);
				editor.style.display = "none";
				preview.classList.remove("hidden");
				btnMd.classList.remove("active");
			} else {
				// Switch to markdown edit mode
				preview.classList.add("hidden");
				editor.style.display = "";
				btnMd.classList.add("active");
				editor.focus();
			}
		});
	}

	// -- Simple markdown renderer --
	function renderMarkdown(src) {
		// Escape HTML
		function esc(s) {
			return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
		}

		// Code blocks
		src = src.replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, function(m, code) {
			return "<pre><code>" + esc(code.trim()) + "</code></pre>";
		});

		var lines = src.split("\\n");
		var html = [];
		var inList = false;
		var listType = "";

		for (var i = 0; i < lines.length; i++) {
			var line = lines[i];

			// Skip lines inside pre blocks (already handled)
			if (line.indexOf("<pre>") !== -1 || line.indexOf("</pre>") !== -1) {
				html.push(line);
				continue;
			}

			// Headings
			var hMatch = line.match(/^(#{1,6})\\s+(.*)/);
			if (hMatch) {
				if (inList) { html.push("</" + listType + ">"); inList = false; }
				var level = hMatch[1].length;
				html.push("<h" + level + ">" + inline(hMatch[2]) + "</h" + level + ">");
				continue;
			}

			// Horizontal rule
			if (/^([-*_]){3,}\\s*$/.test(line)) {
				if (inList) { html.push("</" + listType + ">"); inList = false; }
				html.push("<hr>");
				continue;
			}

			// Blockquote
			var bqMatch = line.match(/^>\\s?(.*)/);
			if (bqMatch) {
				if (inList) { html.push("</" + listType + ">"); inList = false; }
				html.push("<blockquote><p>" + inline(bqMatch[1]) + "</p></blockquote>");
				continue;
			}

			// Unordered list
			var ulMatch = line.match(/^[\\t ]*[-*+]\\s+(.*)/);
			if (ulMatch) {
				if (!inList || listType !== "ul") {
					if (inList) html.push("</" + listType + ">");
					html.push("<ul>"); inList = true; listType = "ul";
				}
				html.push("<li>" + inline(ulMatch[1]) + "</li>");
				continue;
			}

			// Ordered list
			var olMatch = line.match(/^[\\t ]*\\d+\\.\\s+(.*)/);
			if (olMatch) {
				if (!inList || listType !== "ol") {
					if (inList) html.push("</" + listType + ">");
					html.push("<ol>"); inList = true; listType = "ol";
				}
				html.push("<li>" + inline(olMatch[1]) + "</li>");
				continue;
			}

			// Close list if we hit a non-list line
			if (inList) { html.push("</" + listType + ">"); inList = false; }

			// Empty line
			if (line.trim() === "") {
				continue;
			}

			// Paragraph
			html.push("<p>" + inline(line) + "</p>");
		}

		if (inList) html.push("</" + listType + ">");
		return html.join("");
	}

	// Inline markdown: bold, italic, code, links, images
	function inline(text) {
		// Inline code
		text = text.replace(/\`([^\`]+)\`/g, function(m, c) {
			return "<code>" + c.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") + "</code>";
		});
		// Images
		text = text.replace(/!\\[([^\\]]*)]\\(([^)]+)\\)/g, '<img alt="$1" src="$2">');
		// Links
		text = text.replace(/\\[([^\\]]*)]\\(([^)]+)\\)/g, '<a href="$2">$1</a>');
		// Bold
		text = text.replace(/\\*\\*(.+?)\\*\\*/g, "<strong>$1</strong>");
		text = text.replace(/__(.+?)__/g, "<strong>$1</strong>");
		// Italic
		text = text.replace(/\\*(.+?)\\*/g, "<em>$1</em>");
		text = text.replace(/_(.+?)_/g, "<em>$1</em>");
		return text;
	}

	// -- Auto-save --
	editor.addEventListener("input", function() {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(saveData, 400);
	});

	function saveData() {
		try {
			fs.writeFileSync(notePath, editor.value, "utf8");
		} catch (e) {
			console.error("Minima: save failed", e);
		}
	}

	// Expose save so the main process can trigger it before hiding
	window.__minimaSave = saveData;

	// -- Save on blur --
	window.addEventListener("blur", function() {
		saveData();
	});


})();`;
}

// ── Helpers ────────────────────────────────────────────────────────

function debounce(fn: () => void, ms: number): () => void {
	let timer: ReturnType<typeof setTimeout> | null = null;
	return () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(fn, ms);
	};
}
