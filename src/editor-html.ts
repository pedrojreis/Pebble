/**
 * Builds the complete HTML document string for the standalone Minima editor.
 * The returned HTML runs inside an Electron BrowserWindow with nodeIntegration
 * and uses Node's fs module for direct file I/O.
 */
export function buildEditorHTML(
	filePath: string,
	initialContent: string,
): string {
	const escapedPath = filePath.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
	const serializedInitialContent = JSON.stringify(initialContent);
	const escapedInitialContentForTextarea = initialContent
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");

	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
	height: 100%;
}

body {
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
	background: #ffffff;
	color: #1b1b1b;
	display: flex;
	justify-content: center;
	align-items: stretch;
	padding: 0;
}

#editor-shell {
	width: 100%;
	height: 100%;
	max-width: none;
	background: inherit;
	border: none;
	border-radius: 0;
	overflow: hidden;
	box-shadow: none;
}

#editor {
	width: 100%;
	height: 100%;
	border: none;
	outline: none;
	resize: none;
	padding: 24px;
	font-family: inherit;
	font-size: 15px;
	line-height: 1.75;
	letter-spacing: 0.003em;
	background: transparent;
	color: inherit;
	tab-size: 4;
	overflow: auto;
	scrollbar-width: none;
	-ms-overflow-style: none;
}

#editor::-webkit-scrollbar {
	width: 0;
	height: 0;
	display: none;
}

#editor::placeholder {
	color: #9b9b93;
}

@media (max-width: 560px) {
	body {
		padding: 0;
	}

	#editor {
		padding: 18px;
	}
}

@media (prefers-color-scheme: dark) {
	body {
		background: #191919;
		color: #ededeb;
	}

	#editor-shell {
		background: inherit;
		box-shadow: none;
	}

	#editor::placeholder {
		color: #808078;
	}
}
</style>
</head>
<body>
<main id="editor-shell">
	<textarea id="editor" spellcheck="true" placeholder="Start writing...">${escapedInitialContentForTextarea}</textarea>
</main>
<script>
(function() {
	const fs = require('fs');
	const filePath = '${escapedPath}';
	const editor = document.getElementById('editor');
	const fenceMarker = String.fromCharCode(96, 96, 96);
	const initialContent = ${serializedInitialContent};
	if (!editor) return;

	let saveTimeout = null;
	let ignoreNextWatch = false;
	let lastSavedValue = editor.value;

	function loadFile() {
		try {
			const content = fs.readFileSync(filePath, 'utf-8');
			const start = editor.selectionStart;
			const end = editor.selectionEnd;
			editor.value = content;
			lastSavedValue = content;
			editor.selectionStart = Math.min(start, content.length);
			editor.selectionEnd = Math.min(end, content.length);
		} catch (err) {
			console.error('Minima: failed to read note file', err);
		}
	}

	function saveNow() {
		if (editor.value === lastSavedValue) return;
		try {
			ignoreNextWatch = true;
			fs.writeFileSync(filePath, editor.value, 'utf-8');
			lastSavedValue = editor.value;
			setTimeout(function() { ignoreNextWatch = false; }, 200);
		} catch (err) {
			console.error('Minima: failed to save', err);
		}
	}

	function scheduleSave() {
		if (saveTimeout) clearTimeout(saveTimeout);
		saveTimeout = setTimeout(function() {
			saveNow();
			saveTimeout = null;
		}, 300);
	}

	function getCurrentLineBounds(pos) {
		const value = editor.value;
		const lineStart = value.lastIndexOf('\n', Math.max(0, pos - 1)) + 1;
		const nextBreak = value.indexOf('\n', pos);
		const lineEnd = nextBreak === -1 ? value.length : nextBreak;
		return { lineStart, lineEnd };
	}

	function continueMarkdownList() {
		if (editor.selectionStart !== editor.selectionEnd) return false;

		const cursor = editor.selectionStart;
		const bounds = getCurrentLineBounds(cursor);
		const line = editor.value.slice(bounds.lineStart, bounds.lineEnd);

		const codeFenceMatch = line.match(new RegExp('^(\\\\s*)' + fenceMarker + '([a-zA-Z0-9_-]*)$'));
		if (codeFenceMatch) {
			const indent = codeFenceMatch[1];
			editor.setRangeText('\n' + indent + '\n' + indent + fenceMarker, cursor, cursor, 'end');
			const newCursor = cursor + 1 + indent.length;
			editor.selectionStart = newCursor;
			editor.selectionEnd = newCursor;
			scheduleSave();
			return true;
		}

		const taskMatch = line.match(/^(\\s*)-\\s+\\[( |x|X)\\]\\s+(.*)$/);
		if (taskMatch) {
			const indent = taskMatch[1];
			const content = taskMatch[3];
			if (content.trim().length === 0) {
				editor.setRangeText(indent, bounds.lineStart, bounds.lineEnd, 'end');
			} else {
				editor.setRangeText('\n' + indent + '- [ ] ', cursor, cursor, 'end');
			}
			scheduleSave();
			return true;
		}

		const unorderedMatch = line.match(/^(\\s*)([-*+])\\s+(.*)$/);
		if (unorderedMatch) {
			const indent = unorderedMatch[1];
			const content = unorderedMatch[3];
			if (content.trim().length === 0) {
				editor.setRangeText(indent, bounds.lineStart, bounds.lineEnd, 'end');
			} else {
				editor.setRangeText('\n' + indent + '- ', cursor, cursor, 'end');
			}
			scheduleSave();
			return true;
		}

		const orderedMatch = line.match(/^(\\s*)(\\d+)\\.\\s+(.*)$/);
		if (orderedMatch) {
			const indent = orderedMatch[1];
			const number = Number(orderedMatch[2]);
			const content = orderedMatch[3];
			if (content.trim().length === 0) {
				editor.setRangeText(indent, bounds.lineStart, bounds.lineEnd, 'end');
			} else {
				editor.setRangeText('\n' + indent + String(number + 1) + '. ', cursor, cursor, 'end');
			}
			scheduleSave();
			return true;
		}

		const quoteMatch = line.match(/^(\\s*)((?:>\\s*)+)(.*)$/);
		if (quoteMatch) {
			const indent = quoteMatch[1];
			const quotePrefix = quoteMatch[2].replace(/\\s*$/, ' ');
			const content = quoteMatch[3];
			if (content.trim().length === 0) {
				editor.setRangeText(indent, bounds.lineStart, bounds.lineEnd, 'end');
			} else {
				editor.setRangeText('\n' + indent + quotePrefix, cursor, cursor, 'end');
			}
			scheduleSave();
			return true;
		}

		return false;
	}

	function applyMarkdownShortcutOnSpace() {
		if (editor.selectionStart !== editor.selectionEnd) return false;

		const cursor = editor.selectionStart;
		const bounds = getCurrentLineBounds(cursor);
		const beforeCursor = editor.value.slice(bounds.lineStart, cursor);

		const bulletMatch = beforeCursor.match(/^(\\s*)([+*])$/);
		if (bulletMatch) {
			editor.setRangeText(bulletMatch[1] + '- ', bounds.lineStart, cursor, 'end');
			scheduleSave();
			return true;
		}

		const uncheckedTaskMatch = beforeCursor.match(/^(\\s*)\\[(?:\\s)?\\]$/);
		if (uncheckedTaskMatch) {
			editor.setRangeText(uncheckedTaskMatch[1] + '- [ ] ', bounds.lineStart, cursor, 'end');
			scheduleSave();
			return true;
		}

		const checkedTaskMatch = beforeCursor.match(/^(\\s*)\\[x\\]$/i);
		if (checkedTaskMatch) {
			editor.setRangeText(checkedTaskMatch[1] + '- [x] ', bounds.lineStart, cursor, 'end');
			scheduleSave();
			return true;
		}

		const headingMatch = beforeCursor.match(/^(\\s*)(#{1,6})$/);
		if (headingMatch) {
			editor.setRangeText(headingMatch[1] + headingMatch[2] + ' ', bounds.lineStart, cursor, 'end');
			scheduleSave();
			return true;
		}

		const quoteMatch = beforeCursor.match(/^(\\s*)(>+)$/);
		if (quoteMatch) {
			const normalized = quoteMatch[2].split('').map(() => '>').join(' ');
			editor.setRangeText(quoteMatch[1] + normalized + ' ', bounds.lineStart, cursor, 'end');
			scheduleSave();
			return true;
		}

		const orderedMatch = beforeCursor.match(/^(\\s*)(\\d+)[.)]$/);
		if (orderedMatch) {
			editor.setRangeText(orderedMatch[1] + orderedMatch[2] + '. ', bounds.lineStart, cursor, 'end');
			scheduleSave();
			return true;
		}

		return false;
	}

	function removeMarkdownMarkerOnBackspace() {
		if (editor.selectionStart !== editor.selectionEnd) return false;

		const cursor = editor.selectionStart;
		const bounds = getCurrentLineBounds(cursor);
		if (cursor !== bounds.lineEnd) return false;

		const line = editor.value.slice(bounds.lineStart, bounds.lineEnd);

		if (/^\\s*-\\s$/.test(line) || /^\\s*-\\s\\[(?: |x|X)\\]\\s$/.test(line)) {
			const indentMatch = line.match(/^(\\s*)/);
			editor.setRangeText(indentMatch ? indentMatch[1] : '', bounds.lineStart, bounds.lineEnd, 'end');
			scheduleSave();
			return true;
		}

		if (/^\\s*\\d+\\.\\s$/.test(line)) {
			const indentMatch = line.match(/^(\\s*)/);
			editor.setRangeText(indentMatch ? indentMatch[1] : '', bounds.lineStart, bounds.lineEnd, 'end');
			scheduleSave();
			return true;
		}

		if (/^\\s*(?:>\\s*)+$/.test(line)) {
			const indentMatch = line.match(/^(\\s*)/);
			editor.setRangeText(indentMatch ? indentMatch[1] : '', bounds.lineStart, bounds.lineEnd, 'end');
			scheduleSave();
			return true;
		}

		if (/^\\s*#{1,6}\\s$/.test(line)) {
			const indentMatch = line.match(/^(\\s*)/);
			editor.setRangeText(indentMatch ? indentMatch[1] : '', bounds.lineStart, bounds.lineEnd, 'end');
			scheduleSave();
			return true;
		}

		return false;
	}

	let watcher = null;
	try {
		watcher = fs.watch(filePath, function(eventType) {
			if (eventType === 'change' && !ignoreNextWatch) {
				loadFile();
			}
		});
	} catch (err) {
		console.error('Minima: failed to watch file', err);
	}

	editor.addEventListener('keydown', function(event) {
		if (event.key === 'Enter' && continueMarkdownList()) {
			event.preventDefault();
			return;
		}

		if (event.key === ' ' && applyMarkdownShortcutOnSpace()) {
			event.preventDefault();
			return;
		}

		if (event.key === 'Backspace' && removeMarkdownMarkerOnBackspace()) {
			event.preventDefault();
		}
	});

	editor.addEventListener('input', scheduleSave);
	editor.addEventListener('keyup', scheduleSave);
	editor.addEventListener('blur', saveNow);
	if (!editor.value && initialContent) {
		editor.value = initialContent;
		lastSavedValue = initialContent;
	}
	loadFile();
	editor.focus();

	window.addEventListener('beforeunload', function() {
		if (watcher) watcher.close();
		if (saveTimeout) clearTimeout(saveTimeout);
		saveNow();
	});
})();
</script>
</body>
</html>`;
}
