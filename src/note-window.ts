/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { getRemote } from "./electron-utils";
import { MinimaSettings } from "./settings";
import { Notice } from "obsidian";
import * as path from "path";
import * as fs from "fs";
import noteWindowCss from "./note-window.css";

/** Padding added around the panel for the arrow and drop-shadow. */
const ARROW_HEIGHT = 10;
const SHADOW_PADDING = 16;

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

/** Callback to retrieve the tray icon's screen bounds. */
type TrayBoundsGetter = () => {
	x: number;
	y: number;
	width: number;
	height: number;
} | null;

export class MinimaWindow {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private win: any = null;
	private settings: MinimaSettings;
	private vaultPath: string;
	private isDestroying = false;
	private getTrayBounds: TrayBoundsGetter | null;

	constructor(
		settings: MinimaSettings,
		vaultPath: string,
		getTrayBounds?: TrayBoundsGetter,
	) {
		this.settings = settings;
		this.vaultPath = vaultPath;
		this.getTrayBounds = getTrayBounds ?? null;
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
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			new Notice("Minima: Electron remote module is not available.");
			return false;
		}

		const { BrowserWindow } = remote;

		// The BrowserWindow is larger than the visible panel to make room
		// for the CSS arrow and drop-shadow rendered on a transparent canvas.
		const outerWidth = this.settings.windowWidth + 2 * SHADOW_PADDING;
		const outerHeight =
			this.settings.windowHeight + ARROW_HEIGHT + SHADOW_PADDING;

		this.win = new BrowserWindow({
			width: outerWidth,
			height: outerHeight,
			frame: false,
			transparent: true,
			hasShadow: false,
			alwaysOnTop: this.settings.alwaysOnTop,
			skipTaskbar: true,
			resizable: true,
			minimizable: false,
			maximizable: false,
			fullscreenable: false,
			show: false,
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
			console.debug(
				"Minima: Could not enable remote for child window:",
				e,
			);
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

		// Persist panel size on resize
		const debouncedSaveBounds = debounce(
			() => this.saveWindowBounds(),
			500,
		);
		this.win.on("resized", debouncedSaveBounds);

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
			// Store the logical panel size (minus the transparent padding)
			this.settings.windowWidth = bounds.width - 2 * SHADOW_PADDING;
			this.settings.windowHeight =
				bounds.height - ARROW_HEIGHT - SHADOW_PADDING;
		} catch {
			// Window may already be destroyed
		}
	}

	/**
	 * Position the window directly below the tray icon with the arrow
	 * pointing at it. Clamps to screen edges and adjusts the arrow
	 * offset so it always points at the icon centre.
	 */
	private positionNearTray(): void {
		if (!this.win || !this.getTrayBounds) return;

		const trayBounds = this.getTrayBounds();
		if (!trayBounds) return;

		const remote = getRemote();
		if (!remote) return;

		const { screen } = remote;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const display = screen.getDisplayNearestPoint({
			x: trayBounds.x,
			y: trayBounds.y,
		});
		const workArea = display.workArea;

		const winSize: number[] = this.win.getSize();
		const winWidth = winSize[0] ?? this.settings.windowWidth;

		// Centre horizontally under the tray icon
		const trayCenterX = Math.round(trayBounds.x + trayBounds.width / 2);
		let x = trayCenterX - Math.round(winWidth / 2);
		const y = trayBounds.y + trayBounds.height + 4; // small gap below menu bar

		// Clamp to screen edges
		const rightEdge = workArea.x + workArea.width;
		if (x + winWidth > rightEdge) x = rightEdge - winWidth;
		if (x < workArea.x) x = workArea.x;

		this.win.setPosition(x, y);

		// Adjust arrow so it still points at the tray icon center
		const arrowX = trayCenterX - x;
		const arrowPercent = Math.max(
			10,
			Math.min(90, (arrowX / winWidth) * 100),
		);

		this.win.webContents
			.executeJavaScript(
				`document.documentElement.style.setProperty('--arrow-offset','${arrowPercent}%')`,
			)
			.catch(() => {});
	}

	toggle(): void {
		if (!this.win) {
			console.debug("Minima: toggle() called but win is null");
			return;
		}
		console.debug("Minima: toggle(), visible:", this.win.isVisible());
		if (this.win.isVisible()) {
			this.win.hide();
		} else {
			// Re-read file content each time we show, in case it was edited in Obsidian
			this.loadContent();
			this.positionNearTray();
			this.win.show();
			this.win.focus();
		}
	}

	show(): void {
		if (this.win) {
			this.loadContent();
			this.positionNearTray();
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
<div class="window-frame">
	<div class="arrow"></div>
	<div class="panel">
		<div class="titlebar">
			<div class="title">Minima</div>
			<div class="titlebar-buttons">
				${hasNote ? `<button id="btn-md" class="tb-btn" title="Toggle markdown"><svg width="16" height="10" viewBox="0 0 208 128" fill="currentColor"><path d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0l-30-33h20V30h20v35h20z"/></svg></button>` : ""}
				<button id="btn-close" class="tb-btn btn-close" title="Close">&times;</button>
			</div>
		</div>
${
	hasNote
		? `		<textarea id="editor" placeholder="Start typing\u2026" spellcheck="true"></textarea>
		<div id="preview" class="preview hidden"></div>`
		: `		<div class="no-note">
			<p>No note selected.</p>
			<p class="hint">Go to <strong>Settings \u2192 Minima</strong> to pick a note.</p>
		</div>`
}
	</div>
</div>

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
