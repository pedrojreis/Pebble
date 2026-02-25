const editorScriptTemplate = String.raw`(function() {
	const editor = document.getElementById('editor');
	const fenceMarker = String.fromCharCode(96, 96, 96);
	const initialContent = __INITIAL_CONTENT__;
	if (!editor) return;

	function updateContent(nextValue) {
		if (typeof nextValue !== 'string') return;
		if (nextValue === editor.value) return;

		const start = editor.selectionStart;
		const end = editor.selectionEnd;
		editor.value = nextValue;
		editor.selectionStart = Math.min(start, nextValue.length);
		editor.selectionEnd = Math.min(end, nextValue.length);
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

		const codeFenceMatch = line.match(
			new RegExp('^(\\s*)' + fenceMarker + '([a-zA-Z0-9_-]*)$'),
		);
		if (codeFenceMatch) {
			const indent = codeFenceMatch[1];
			editor.setRangeText(
				'\n' + indent + '\n' + indent + fenceMarker,
				cursor,
				cursor,
				'end',
			);
			const newCursor = cursor + 1 + indent.length;
			editor.selectionStart = newCursor;
			editor.selectionEnd = newCursor;
			return true;
		}

		const taskMatch = line.match(/^(\s*)-\s+\[( |x|X)\]\s+(.*)$/);
		if (taskMatch) {
			const indent = taskMatch[1];
			const content = taskMatch[3];
			if (content.trim().length === 0) {
				editor.setRangeText(indent, bounds.lineStart, bounds.lineEnd, 'end');
			} else {
				editor.setRangeText(
					'\n' + indent + '- [ ] ',
					cursor,
					cursor,
					'end',
				);
			}
			return true;
		}

		const unorderedMatch = line.match(/^(\s*)([-*+])\s+(.*)$/);
		if (unorderedMatch) {
			const indent = unorderedMatch[1];
			const content = unorderedMatch[3];
			if (content.trim().length === 0) {
				editor.setRangeText(indent, bounds.lineStart, bounds.lineEnd, 'end');
			} else {
				editor.setRangeText('\n' + indent + '- ', cursor, cursor, 'end');
			}
			return true;
		}

		const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
		if (orderedMatch) {
			const indent = orderedMatch[1];
			const number = Number(orderedMatch[2]);
			const content = orderedMatch[3];
			if (content.trim().length === 0) {
				editor.setRangeText(indent, bounds.lineStart, bounds.lineEnd, 'end');
			} else {
				editor.setRangeText(
					'\n' + indent + String(number + 1) + '. ',
					cursor,
					cursor,
					'end',
				);
			}
			return true;
		}

		const quoteMatch = line.match(/^(\s*)((?:>\s*)+)(.*)$/);
		if (quoteMatch) {
			const indent = quoteMatch[1];
			const quotePrefix = quoteMatch[2].replace(/\s*$/, ' ');
			const content = quoteMatch[3];
			if (content.trim().length === 0) {
				editor.setRangeText(indent, bounds.lineStart, bounds.lineEnd, 'end');
			} else {
				editor.setRangeText(
					'\n' + indent + quotePrefix,
					cursor,
					cursor,
					'end',
				);
			}
			return true;
		}

		return false;
	}

	function applyMarkdownShortcutOnSpace() {
		if (editor.selectionStart !== editor.selectionEnd) return false;

		const cursor = editor.selectionStart;
		const bounds = getCurrentLineBounds(cursor);
		const beforeCursor = editor.value.slice(bounds.lineStart, cursor);

		const bulletMatch = beforeCursor.match(/^(\s*)([+*])$/);
		if (bulletMatch) {
			editor.setRangeText(bulletMatch[1] + '- ', bounds.lineStart, cursor, 'end');
			return true;
		}

		const uncheckedTaskMatch = beforeCursor.match(/^(\s*)\[(?:\s)?\]$/);
		if (uncheckedTaskMatch) {
			editor.setRangeText(
				uncheckedTaskMatch[1] + '- [ ] ',
				bounds.lineStart,
				cursor,
				'end',
			);
			return true;
		}

		const checkedTaskMatch = beforeCursor.match(/^(\s*)\[x\]$/i);
		if (checkedTaskMatch) {
			editor.setRangeText(
				checkedTaskMatch[1] + '- [x] ',
				bounds.lineStart,
				cursor,
				'end',
			);
			return true;
		}

		const headingMatch = beforeCursor.match(/^(\s*)(#{1,6})$/);
		if (headingMatch) {
			editor.setRangeText(
				headingMatch[1] + headingMatch[2] + ' ',
				bounds.lineStart,
				cursor,
				'end',
			);
			return true;
		}

		const quoteMatch = beforeCursor.match(/^(\s*)(>+)$/);
		if (quoteMatch) {
			const normalized = quoteMatch[2]
				.split('')
				.map(() => '>')
				.join(' ');
			editor.setRangeText(
				quoteMatch[1] + normalized + ' ',
				bounds.lineStart,
				cursor,
				'end',
			);
			return true;
		}

		const orderedMatch = beforeCursor.match(/^(\s*)(\d+)[.)]$/);
		if (orderedMatch) {
			editor.setRangeText(
				orderedMatch[1] + orderedMatch[2] + '. ',
				bounds.lineStart,
				cursor,
				'end',
			);
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

		function stripLineToIndent() {
			const indentMatch = line.match(/^(\s*)/);
			editor.setRangeText(
				indentMatch ? indentMatch[1] : '',
				bounds.lineStart,
				bounds.lineEnd,
				'end',
			);
			return true;
		}

		if (
			/^\s*-\s$/.test(line) ||
			/^\s*-\s\[(?: |x|X)\]\s$/.test(line)
		) {
			return stripLineToIndent();
		}

		if (/^\s*\d+\.\s$/.test(line)) {
			return stripLineToIndent();
		}

		if (/^\s*(?:>\s*)+$/.test(line)) {
			return stripLineToIndent();
		}

		if (/^\s*#{1,6}\s$/.test(line)) {
			return stripLineToIndent();
		}

		return false;
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

	window.__pebbleEditor = {
		getContent: function() {
			return editor.value;
		},
		setContent: function(content) {
			updateContent(content);
		},
	};

	if (!editor.value && initialContent) {
		editor.value = initialContent;
	}
	editor.focus();
})();`;

export default editorScriptTemplate;
