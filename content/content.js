(() => {
	const STYLES = `
    .qc-widget { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
      color-scheme: light; 
      user-select: none;
    }
    .qc-widget[hidden] { display: none; }
    
    .qc-save-btn {
      background: #3D6B64;
      color: #FAF6F0 !important;
      border: none;
      border-radius: 8px;
      padding: 8px 18px 8px 15px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0,0,0,0.2);
      transition: transform 0.1s ease, background 0.2s ease;
      white-space: nowrap;
    }
    .qc-save-btn:hover { background: #325A54; transform: scale(1.02); }
    .qc-save-btn:active { transform: scale(0.98); }

    .qc-card {
      width: 300px;
      background: #FFFFFF !important;
      border: 1px solid #E8E1D6;
      border-radius: 12px;
      padding: 0;
      box-shadow: 0 12px 32px rgba(0,0,0,0.25);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    
    .qc-drag-handle {
      cursor: grab;
      padding: 10px 14px;
      background: #F1EDE5;
      border-bottom: 1px solid #E8E1D6;
      font-size: 12px;
      font-weight: 700;
      color: #6B6259;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .qc-drag-handle::after {
      content: "⋮⋮";
      opacity: 0.5;
      font-size: 14px;
    }
    .qc-drag-handle:active { cursor: grabbing; }
    
    .qc-content {
      padding: 14px;
    }

    .qc-preview {
      margin: 0 0 12px;
      padding: 0 0 0 12px;
      border-left: 3px solid #3D6B64;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 13px;
      line-height: 1.5;
      color: #2B2621 !important;
      max-height: 100px;
      overflow-y: auto;
      font-style: italic;
      user-select: text;
    }
    
    .qc-note, .qc-tags {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #E8E1D6;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 13px;
      font-family: inherit;
      margin-bottom: 10px;
      background: #FFFFFF !important;
      color: #2B2621 !important;
      outline: none;
      transition: border-color 0.2s;
      user-select: text;
    }
    .qc-note:focus, .qc-tags:focus {
      border-color: #3D6B64;
    }
    .qc-note { resize: vertical; min-height: 60px; }
    .qc-note::placeholder, .qc-tags::placeholder { color: #A8A095; }
    
    .qc-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
    .qc-actions button {
      border: none;
      border-radius: 8px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .qc-cancel { background: #F1EDE5; color: #6B6259; }
    .qc-cancel:hover { background: #E8E1D6; }
    .qc-confirm { background: #3D6B64; color: #FAF6F0 !important; }
    .qc-confirm:hover { background: #325A54; }
    
    .qc-toast {
      background: #2B2621;
      color: #FAF6F0 !important;
      padding: 10px 20px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 14px rgba(0,0,0,0.3);
      text-align: center;
    }
  `;

	const EDGE_PADDING = 12;

	let hostEl = null;
	let shadow = null;
	let lastRightClickPos = null;

	function ensureWidget() {
		if (hostEl) return;
		hostEl = document.createElement('div');
		hostEl.id = 'quote-collector-root';
		Object.assign(hostEl.style, {
			position: 'absolute',
			zIndex: '2147483647',
			top: '0',
			left: '0',
			pointerEvents: 'auto',
		});
		document.documentElement.appendChild(hostEl);
		shadow = hostEl.attachShadow({ mode: 'open' });
		shadow.innerHTML = `<style>${STYLES}</style><div class="qc-widget" hidden></div>`;
	}

	function widgetEl() {
		ensureWidget();
		return shadow.querySelector('.qc-widget');
	}

	function clamp(value, min, max) {
		if (max < min) return min;
		return Math.min(Math.max(value, min), max);
	}

	function positionAt(x, y) {
		ensureWidget();
		const rect = hostEl.getBoundingClientRect();

		const minX = window.scrollX + EDGE_PADDING;
		const maxX = window.scrollX + window.innerWidth - rect.width - EDGE_PADDING;
		const minY = window.scrollY + EDGE_PADDING;
		const maxY =
			window.scrollY + window.innerHeight - rect.height - EDGE_PADDING;

		hostEl.style.left = `${clamp(x, minX, maxX)}px`;
		hostEl.style.top = `${clamp(y, minY, maxY)}px`;
	}

	function hideWidget() {
		if (!shadow) return;
		const widget = widgetEl();
		widget.hidden = true;
		widget.innerHTML = '';
	}

	function showCollapsedButton(text, mouseX, mouseY) {
		const widget = widgetEl();
		widget.hidden = false;
		widget.className = 'qc-widget qc-collapsed';
		widget.innerHTML = `<button class="qc-save-btn" type="button">💬 Save quote</button>`;

		// Position button slightly offset from cursor
		positionAt(mouseX + 5, mouseY + 5);

		widget.querySelector('.qc-save-btn').addEventListener('click', e => {
			const rect = hostEl.getBoundingClientRect();
			const currentPos = {
				x: rect.left + window.scrollX,
				y: rect.top + window.scrollY,
			};
			showForm(text, currentPos);
		});
	}

	function showForm(text, pos) {
		const widget = widgetEl();
		widget.hidden = false;
		widget.className = 'qc-widget qc-form';
		widget.innerHTML = `
      <div class="qc-card">
        <div class="qc-drag-handle">Save quote</div>
        <div class="qc-content">
          <blockquote class="qc-preview"></blockquote>
          <textarea class="qc-note" placeholder="Add a short note (optional)" rows="3"></textarea>
          <input class="qc-tags" type="text" placeholder="Tags (e.g. research, ideas)" />
          <div class="qc-actions">
            <button class="qc-cancel" type="button">Cancel</button>
            <button class="qc-confirm" type="button">Save</button>
          </div>
        </div>
      </div>
    `;

		widget.querySelector('.qc-preview').textContent =
			text.length > 240 ? text.slice(0, 240) + '…' : text;

		if (pos) {
			positionAt(pos.x, pos.y);
		}

		makeDraggable(widget.querySelector('.qc-drag-handle'));

		widget.querySelector('.qc-cancel').addEventListener('click', hideWidget);

		const confirmBtn = widget.querySelector('.qc-confirm');
		confirmBtn.addEventListener('click', () => {
			const note = widget.querySelector('.qc-note').value.trim();
			const tags = widget
				.querySelector('.qc-tags')
				.value.split(',')
				.map(t => t.trim().toLowerCase())
				.filter(Boolean);

			confirmBtn.disabled = true;
			confirmBtn.textContent = 'Saving...';

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
					} else {
						confirmBtn.disabled = false;
						confirmBtn.textContent = 'Save';
						alert('Failed to save quote. Please try again.');
					}
				},
			);
		});

		setTimeout(() => {
			const noteArea = widget.querySelector('.qc-note');
			if (noteArea) noteArea.focus();
		}, 50);
	}

	function makeDraggable(handle) {
		let startMouseX = 0;
		let startMouseY = 0;
		let startLeft = 0;
		let startTop = 0;

		function onMouseMove(e) {
			const dx = e.clientX - startMouseX;
			const dy = e.clientY - startMouseY;

			hostEl.style.left = `${startLeft + dx}px`;
			hostEl.style.top = `${startTop + dy}px`;
		}

		function onMouseUp() {
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);

			const rect = hostEl.getBoundingClientRect();
			positionAt(rect.left + window.scrollX, rect.top + window.scrollY);
		}

		handle.addEventListener('mousedown', e => {
			if (e.button !== 0) return;

			startMouseX = e.clientX;
			startMouseY = e.clientY;

			const rect = hostEl.getBoundingClientRect();
			startLeft = rect.left + window.scrollX;
			startTop = rect.top + window.scrollY;

			document.addEventListener('mousemove', onMouseMove);
			document.addEventListener('mouseup', onMouseUp);
			e.preventDefault();
		});
	}

	function showSavedConfirmation() {
		const widget = widgetEl();
		widget.className = 'qc-widget qc-saved';
		widget.innerHTML = `<div class="qc-toast">✓ Saved to your library</div>`;
		setTimeout(hideWidget, 1500);
	}

	document.addEventListener('mouseup', e => {
		if (hostEl && e.composedPath().includes(hostEl)) return;

		const selection = window.getSelection();
		const text = selection ? selection.toString().trim() : '';

		if (!text || text.length < 3) {
			if (
				hostEl &&
				!shadow.querySelector('.qc-widget').hidden &&
				!e.composedPath().includes(hostEl)
			) {
				hideWidget();
			}
			return;
		}

		showCollapsedButton(text, e.pageX, e.pageY);
	});

	document.addEventListener('contextmenu', e => {
		lastRightClickPos = { x: e.pageX, y: e.pageY };
	});

	chrome.runtime.onMessage.addListener(message => {
		if (message.type === 'OPEN_QUOTE_FORM') {
			const pos = lastRightClickPos || {
				x: window.scrollX + window.innerWidth / 2 - 150,
				y: window.scrollY + window.innerHeight / 2 - 100,
			};
			showForm(message.payload.text, pos);
		}
	});
})();
