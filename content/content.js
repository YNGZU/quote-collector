// Content script — runs on every page. It watches for text
// selections, shows a small floating "Save quote" button near
// them, and expands that into a short form (note + tags) on click.
//
// Everything it renders lives inside a Shadow DOM attached to a
// single host element. That means the host page's CSS can never
// leak into our widget, and our CSS can never leak into the page —
// each content script instance gets its own fully isolated style
// scope, which matters a lot when you're injecting UI into pages
// you don't control.

(() => {
	const STYLES = `
    .qc-widget { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .qc-widget[hidden] { display: none; }
    .qc-save-btn {
      background: #3D6B64;
      color: #FAF6F0;
      border: none;
      border-radius: 8px;
      padding: 8px 14px 8px 10px;
      font-size: 13px;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0,0,0,0.18);
    }
    .qc-save-btn:hover { background: #325A54; }
    .qc-card {
      width: 280px;
      background: #FFFFFF;
      border: 1px solid #E8E1D6;
      border-radius: 10px;
      padding: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    }
    .qc-preview {
      margin: 0 0 8px;
      padding-left: 10px;
      border-left: 3px solid #3D6B64;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 13px;
      line-height: 1.4;
      color: #2B2621;
      max-height: 90px;
      overflow-y: auto;
    }
    .qc-note, .qc-tags {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #E8E1D6;
      border-radius: 6px;
      padding: 6px 8px;
      font-size: 12px;
      font-family: inherit;
      margin-bottom: 8px;
      resize: vertical;
      color: #2B2621;
    }
    .qc-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .qc-actions button {
      border: none;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 12px;
      cursor: pointer;
    }
    .qc-cancel { background: #F1EDE5; color: #6B6259; }
    .qc-confirm { background: #3D6B64; color: #FAF6F0; }
    .qc-confirm:hover { background: #325A54; }
    .qc-toast {
      background: #2B2621;
      color: #FAF6F0;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.18);
    }
  `;

	let hostEl = null;
	let shadow = null;

	function ensureWidget() {
		if (hostEl) return;
		hostEl = document.createElement('div');
		hostEl.id = 'quote-collector-root';
		Object.assign(hostEl.style, {
			position: 'absolute',
			zIndex: '2147483647',
			top: '0',
			left: '0',
		});
		document.documentElement.appendChild(hostEl);
		shadow = hostEl.attachShadow({ mode: 'open' });
		shadow.innerHTML = `<style>${STYLES}</style><div class="qc-widget" hidden></div>`;
	}

	function widgetEl() {
		ensureWidget();
		return shadow.querySelector('.qc-widget');
	}

	// hostEl (not the inner shadow div) is the thing actually attached
	// to the page, so it's what needs the real on-page coordinates.
	function positionAt(x, y) {
		hostEl.style.left = `${x}px`;
		hostEl.style.top = `${y}px`;
	}

	function hideWidget() {
		if (!shadow) return;
		const widget = widgetEl();
		widget.hidden = true;
		widget.innerHTML = '';
	}

	function showCollapsedButton(rect, text) {
		const widget = widgetEl();
		widget.hidden = false;
		widget.className = 'qc-widget qc-collapsed';
		widget.innerHTML = `<button class="qc-save-btn" type="button">💬 Save quote</button>`;
		positionAt(
			rect.right - 130 + window.scrollX,
			rect.bottom + 8 + window.scrollY,
		);

		widget.querySelector('.qc-save-btn').addEventListener('click', () => {
			showForm(text, rect);
		});
	}

	function showForm(text, rect) {
		const widget = widgetEl();
		widget.hidden = false;
		widget.className = 'qc-widget qc-form';
		widget.innerHTML = `
      <div class="qc-card">
        <blockquote class="qc-preview"></blockquote>
        <textarea class="qc-note" placeholder="Add a short note (optional)" rows="2"></textarea>
        <input class="qc-tags" type="text" placeholder="Tags, comma separated" />
        <div class="qc-actions">
          <button class="qc-cancel" type="button">Cancel</button>
          <button class="qc-confirm" type="button">Save</button>
        </div>
      </div>
    `;

		// Using textContent (not innerHTML) here means whatever the user
		// selected on the page is treated as plain text, never as markup —
		// even if the source page's own HTML leaks into the selection.
		widget.querySelector('.qc-preview').textContent =
			text.length > 240 ? text.slice(0, 240) + '…' : text;

		if (rect) {
			positionAt(rect.left + window.scrollX, rect.bottom + 8 + window.scrollY);
		}

		widget.querySelector('.qc-cancel').addEventListener('click', hideWidget);
		widget.querySelector('.qc-confirm').addEventListener('click', () => {
			const note = widget.querySelector('.qc-note').value.trim();
			const tags = widget
				.querySelector('.qc-tags')
				.value.split(',')
				.map(t => t.trim().toLowerCase())
				.filter(Boolean);

			chrome.runtime.sendMessage(
				{
					type: 'SAVE_QUOTE',
					payload: {
						text,
						note,
						tags,
						source: { url: location.href, title: document.title },
					},
				},
				response => {
					if (response?.success) {
						showSavedConfirmation();
					}
				},
			);
		});
	}

	function showSavedConfirmation() {
		const widget = widgetEl();
		widget.className = 'qc-widget qc-saved';
		widget.innerHTML = `<div class="qc-toast">✓ Saved to your library</div>`;
		setTimeout(hideWidget, 1400);
	}

	document.addEventListener('mouseup', e => {
		// composedPath() sees through the shadow boundary even though the
		// widget's internals are otherwise encapsulated — this is exactly
		// why it exists, and it's the reliable way to ask "did this event
		// originate inside my own UI?" without it leaking into the page.
		if (hostEl && e.composedPath().includes(hostEl)) return;

		const selection = window.getSelection();
		const text = selection ? selection.toString().trim() : '';

		if (!text || text.length < 3) {
			hideWidget();
			return;
		}

		const range = selection.getRangeAt(0);
		const rect = range.getBoundingClientRect();
		showCollapsedButton(rect, text);
	});

	// Right-click → "Save selection as quote" arrives here from background.js.
	chrome.runtime.onMessage.addListener(message => {
		if (message.type === 'OPEN_QUOTE_FORM') {
			// No mouse position is available from a context-menu click, so
			// anchor near the bottom-right of the current viewport instead.
			const x = window.scrollX + window.innerWidth - 320;
			const y = window.scrollY + window.innerHeight - 220;
			showForm(message.payload.text, null);
			positionAt(x, y);
		}
	});
})();
