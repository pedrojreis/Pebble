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
				<button id="btn-close" class="tb-btn btn-close" title="Close">&times;</button>
			</div>
		</div>
${
	hasNote
		? `		<div id="live-editor" class="live-editor" contenteditable="true" spellcheck="true" data-placeholder="Start typing\u2026"></div>`
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
	var rawMarkdown = CONFIG.initialContent;

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

	var editor = document.getElementById("live-editor");

	// Render initial markdown content
	editor.innerHTML = renderMarkdown(rawMarkdown);
	updatePlaceholder();

	// -- Live markdown conversion patterns --
	var markdownPatterns = [
		// Bold: **text** or __text__
		{ pattern: /\\*\\*([^*]+)\\*\\*/, replacement: function(m, text) { return "<strong>" + text + "</strong>"; } },
		{ pattern: /__([^_]+)__/, replacement: function(m, text) { return "<strong>" + text + "</strong>"; } },
		// Italic: *text* or _text_ (but not inside words for underscore)
		{ pattern: /(?<!\\*)\\*([^*]+)\\*(?!\\*)/, replacement: function(m, text) { return "<em>" + text + "</em>"; } },
		{ pattern: /(?<![a-zA-Z0-9])_([^_]+)_(?![a-zA-Z0-9])/, replacement: function(m, text) { return "<em>" + text + "</em>"; } },
		// Inline code: \`code\`
		{ pattern: /\\\`([^\\\`]+)\\\`/, replacement: function(m, code) { return "<code>" + code + "</code>"; } },
		// Strikethrough: ~~text~~
		{ pattern: /~~([^~]+)~~/, replacement: function(m, text) { return "<s>" + text + "</s>"; } }
	];

	// -- Live editing with markdown rendering --
	editor.addEventListener("input", function(e) {
		// Try to convert markdown patterns in real-time
		convertLiveMarkdown();
		scheduleSave();
		updatePlaceholder();
	});

	// -- Convert markdown as you type --
	function convertLiveMarkdown() {
		var sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;
		
		var range = sel.getRangeAt(0);
		var node = range.startContainer;
		
		// Only process text nodes
		if (node.nodeType !== Node.TEXT_NODE) return;
		
		var text = node.textContent;
		var cursorOffset = range.startOffset;
		
		// Try each pattern
		for (var i = 0; i < markdownPatterns.length; i++) {
			var p = markdownPatterns[i];
			var match = text.match(p.pattern);
			
			if (match) {
				var matchStart = match.index;
				var matchEnd = matchStart + match[0].length;
				
				// Only convert if cursor is at or after the end of the match
				if (cursorOffset >= matchEnd) {
					var beforeMatch = text.substring(0, matchStart);
					var afterMatch = text.substring(matchEnd);
					var replacement = p.replacement(match[0], match[1]);
					
					// Create the new structure
					var parent = node.parentNode;
					var frag = document.createDocumentFragment();
					
					if (beforeMatch) {
						frag.appendChild(document.createTextNode(beforeMatch));
					}
					
					// Create element from replacement HTML
					var temp = document.createElement("span");
					temp.innerHTML = replacement;
					while (temp.firstChild) {
						frag.appendChild(temp.firstChild);
					}
					
					// Add a zero-width space after to allow typing after the formatted element
					var afterText = document.createTextNode(afterMatch || "\\u200B");
					frag.appendChild(afterText);
					
					// Replace the text node
					parent.replaceChild(frag, node);
					
					// Position cursor after the formatted element
					var newRange = document.createRange();
					newRange.setStart(afterText, afterMatch ? 0 : 1);
					newRange.collapse(true);
					sel.removeAllRanges();
					sel.addRange(newRange);
					
					return; // Only process one pattern per input
				}
			}
		}
	}

	function updatePlaceholder() {
		if (editor.textContent.trim() === "") {
			editor.classList.add("empty");
		} else {
			editor.classList.remove("empty");
		}
	}

	// Handle key events for better markdown experience
	editor.addEventListener("keydown", function(e) {
		if (e.key === "Enter") {
			e.preventDefault();
			
			// Check if we're at the start of a line for heading conversion
			var sel = window.getSelection();
			if (sel && sel.rangeCount > 0) {
				var range = sel.getRangeAt(0);
				var node = range.startContainer;
				
				// Check for heading pattern in current text node
				if (node.nodeType === Node.TEXT_NODE) {
					var text = node.textContent;
					var headingMatch = text.match(/^(#{1,6})\\s+(.*)$/);
					
					if (headingMatch) {
						var level = headingMatch[1].length;
						var content = headingMatch[2];
						
						// Create heading element
						var heading = document.createElement("h" + level);
						heading.textContent = content;
						
						// Replace text node with heading
						var parent = node.parentNode;
						parent.replaceChild(heading, node);
						
						// Add a new line after
						var br = document.createElement("br");
						if (heading.nextSibling) {
							parent.insertBefore(br, heading.nextSibling);
						} else {
							parent.appendChild(br);
						}
						
						// Position cursor on the new line
						var newRange = document.createRange();
						newRange.setStartAfter(br);
						newRange.collapse(true);
						sel.removeAllRanges();
						sel.addRange(newRange);
						return;
					}
					
					// Check for list pattern
					var listMatch = text.match(/^[-*+]\\s+(.*)$/);
					if (listMatch) {
						var listContent = listMatch[1];
						
						// Check if there's already a UL parent
						var ul = node.parentNode.closest("ul");
						if (!ul) {
							ul = document.createElement("ul");
							var li = document.createElement("li");
							li.textContent = listContent;
							ul.appendChild(li);
							node.parentNode.replaceChild(ul, node);
							
							// Add new list item
							var newLi = document.createElement("li");
							newLi.innerHTML = "\\u200B";
							ul.appendChild(newLi);
							
							var newRange = document.createRange();
							newRange.setStart(newLi, 0);
							newRange.collapse(true);
							sel.removeAllRanges();
							sel.addRange(newRange);
							return;
						}
					}
				}
			}
			
			// Default: insert line break
			document.execCommand("insertLineBreak");
		}
	});

	// Handle paste - convert to plain text then render
	editor.addEventListener("paste", function(e) {
		e.preventDefault();
		var text = (e.clipboardData || window.clipboardData).getData("text/plain");
		document.execCommand("insertText", false, text);
	});

	// -- Extract plain text/markdown from contenteditable --
	function extractMarkdown() {
		// Get the inner HTML and convert back to markdown-ish plain text
		var html = editor.innerHTML;
		
		// Replace <br> with newlines
		html = html.replace(/<br\\s*\\/?>/gi, "\\n");
		
		// Replace block elements with newlines
		html = html.replace(/<\\/div>/gi, "\\n");
		html = html.replace(/<\\/p>/gi, "\\n");
		html = html.replace(/<div[^>]*>/gi, "");
		html = html.replace(/<p[^>]*>/gi, "");
		
		// Handle headings - extract markdown syntax
		html = html.replace(/<h1[^>]*>(.*?)<\\/h1>/gi, "# $1\\n");
		html = html.replace(/<h2[^>]*>(.*?)<\\/h2>/gi, "## $1\\n");
		html = html.replace(/<h3[^>]*>(.*?)<\\/h3>/gi, "### $1\\n");
		html = html.replace(/<h4[^>]*>(.*?)<\\/h4>/gi, "#### $1\\n");
		html = html.replace(/<h5[^>]*>(.*?)<\\/h5>/gi, "##### $1\\n");
		html = html.replace(/<h6[^>]*>(.*?)<\\/h6>/gi, "###### $1\\n");
		
		// Handle lists
		html = html.replace(/<li[^>]*>(.*?)<\\/li>/gi, "- $1\\n");
		html = html.replace(/<\\/?[uo]l[^>]*>/gi, "");
		
		// Handle blockquotes
		html = html.replace(/<blockquote[^>]*><p[^>]*>(.*?)<\\/p><\\/blockquote>/gi, "> $1\\n");
		html = html.replace(/<blockquote[^>]*>(.*?)<\\/blockquote>/gi, "> $1\\n");
		
		// Handle code blocks
		html = html.replace(/<pre[^>]*><code[^>]*>(.*?)<\\/code><\\/pre>/gis, function(m, code) {
			var decoded = code.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
			return "\\\`\\\`\\\`\\n" + decoded + "\\n\\\`\\\`\\\`\\n";
		});
		
		// Handle inline code
		html = html.replace(/<code[^>]*>(.*?)<\\/code>/gi, "\\\`$1\\\`");
		
		// Handle strikethrough
		html = html.replace(/<s[^>]*>(.*?)<\\/s>/gi, "~~$1~~");
		
		// Handle strong/bold
		html = html.replace(/<strong[^>]*>(.*?)<\\/strong>/gi, "**$1**");
		html = html.replace(/<b[^>]*>(.*?)<\\/b>/gi, "**$1**");
		
		// Handle emphasis/italic
		html = html.replace(/<em[^>]*>(.*?)<\\/em>/gi, "*$1*");
		html = html.replace(/<i[^>]*>(.*?)<\\/i>/gi, "*$1*");
		
		// Handle links
		html = html.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\\/a>/gi, "[$2]($1)");
		
		// Handle images
		html = html.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*>/gi, "![$1]($2)");
		html = html.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, "![$2]($1)");
		html = html.replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, "![]($1)");
		
		// Handle horizontal rules
		html = html.replace(/<hr[^>]*>/gi, "---\\n");
		
		// Remove any remaining HTML tags
		html = html.replace(/<[^>]+>/g, "");
		
		// Decode HTML entities
		html = html.replace(/&nbsp;/g, " ");
		html = html.replace(/\\u200B/g, ""); // Remove zero-width spaces
		html = html.replace(/&lt;/g, "<");
		html = html.replace(/&gt;/g, ">");
		html = html.replace(/&amp;/g, "&");
		html = html.replace(/&quot;/g, '"');
		
		// Clean up excessive newlines
		html = html.replace(/\\n{3,}/g, "\\n\\n");
		html = html.trim();
		
		return html;
	}

	// -- Simple markdown renderer for initial load --
	function renderMarkdown(src) {
		if (!src || src.trim() === "") return "";
		
		// Escape HTML
		function esc(s) {
			return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
		}

		// Code blocks
		src = src.replace(/\\\`\\\`\\\`([\\s\\S]*?)\\\`\\\`\\\`/g, function(m, code) {
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
				html.push("<h" + level + ">" + inlineRender(hMatch[2]) + "</h" + level + ">");
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
				html.push("<blockquote><p>" + inlineRender(bqMatch[1]) + "</p></blockquote>");
				continue;
			}

			// Unordered list
			var ulMatch = line.match(/^[\\t ]*[-*+]\\s+(.*)/);
			if (ulMatch) {
				if (!inList || listType !== "ul") {
					if (inList) html.push("</" + listType + ">");
					html.push("<ul>"); inList = true; listType = "ul";
				}
				html.push("<li>" + inlineRender(ulMatch[1]) + "</li>");
				continue;
			}

			// Ordered list
			var olMatch = line.match(/^[\\t ]*\\d+\\.\\s+(.*)/);
			if (olMatch) {
				if (!inList || listType !== "ol") {
					if (inList) html.push("</" + listType + ">");
					html.push("<ol>"); inList = true; listType = "ol";
				}
				html.push("<li>" + inlineRender(olMatch[1]) + "</li>");
				continue;
			}

			// Close list if we hit a non-list line
			if (inList) { html.push("</" + listType + ">"); inList = false; }

			// Empty line
			if (line.trim() === "") {
				html.push("<br>");
				continue;
			}

			// Paragraph - use div for better contenteditable behavior
			html.push("<div>" + inlineRender(line) + "</div>");
		}

		if (inList) html.push("</" + listType + ">");
		return html.join("");
	}

	// Inline markdown renderer: bold, italic, code, links, images, strikethrough
	function inlineRender(text) {
		// Inline code
		text = text.replace(/\\\`([^\\\`]+)\\\`/g, function(m, c) {
			return "<code>" + c.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") + "</code>";
		});
		// Images
		text = text.replace(/!\\[([^\\]]*)]\\(([^)]+)\\)/g, '<img alt="$1" src="$2">');
		// Links
		text = text.replace(/\\[([^\\]]*)]\\(([^)]+)\\)/g, '<a href="$2">$1</a>');
		// Strikethrough
		text = text.replace(/~~(.+?)~~/g, "<s>$1</s>");
		// Bold (must come before italic)
		text = text.replace(/\\*\\*(.+?)\\*\\*/g, "<strong>$1</strong>");
		text = text.replace(/__(.+?)__/g, "<strong>$1</strong>");
		// Italic
		text = text.replace(/\\*(.+?)\\*/g, "<em>$1</em>");
		text = text.replace(/_(.+?)_/g, "<em>$1</em>");
		return text;
	}

	// -- Auto-save with debounce --
	function scheduleSave() {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(saveData, 400);
	}

	function saveData() {
		try {
			var content = extractMarkdown();
			fs.writeFileSync(notePath, content, "utf8");
			rawMarkdown = content;
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
