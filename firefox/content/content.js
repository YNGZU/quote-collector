(() => {
  const STYLES = `
    .qc-widget { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color-scheme: light; user-select: none; }
    .qc-widget[hidden] { display: none; }
    .qc-save-btn { background: #3D6B64; color: #FAF6F0 !important; border: none; border-radius: 8px; padding: 8px 18px 8px 15px; font-size: 13px; font-weight: 500; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.2); white-space: nowrap; }
    .qc-card { width: 300px; background: #FFFFFF !important; border: 1px solid #E8E1D6; border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,0.25); overflow: hidden; display: flex; flex-direction: column; }
    .qc-drag-handle { cursor: grab; padding: 10px 14px; background: #F1EDE5; border-bottom: 1px solid #E8E1D6; font-size: 12px; font-weight: 700; color: #6B6259; }
    .qc-content { padding: 14px; }
    .qc-preview { margin: 0 0 12px; padding-left: 12px; border-left: 3px solid #3D6B64; font-family: Georgia, 'Times New Roman', serif; font-size: 13px; line-height: 1.5; color: #2B2621 !important; max-height: 100px; overflow-y: auto; font-style: italic; user-select: text; }
    .qc-note, .qc-tags { width: 100%; box-sizing: border-box; border: 1px solid #E8E1D6; border-radius: 8px; padding: 8px 10px; font-size: 13px; font-family: inherit; margin-bottom: 10px; background: #FFFFFF !important; color: #2B2621 !important; outline: none; user-select: text; }
    .qc-note { resize: vertical; min-height: 60px; }
    .qc-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
    .qc-actions button { border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .qc-cancel { background: #F1EDE5; color: #6B6259; }
    .qc-confirm { background: #3D6B64; color: #FAF6F0 !important; }
    .qc-toast { background: #2B2621; color: #FAF6F0 !important; padding: 10px 20px; border-radius: 10px; font-size: 14px; font-weight: 500; box-shadow: 0 4px 14px rgba(0,0,0,0.3); text-align: center; }
  `;
  const EDGE_PADDING = 12;
  let hostEl = null;
  let shadow = null;
  let lastRightClickPos = null;

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function ensureWidget() {
    if (hostEl) return;
    hostEl = createElement('div');
    hostEl.id = 'quote-collector-root';
    Object.assign(hostEl.style, { position: 'absolute', zIndex: '2147483647', top: '0', left: '0', pointerEvents: 'auto' });
    document.documentElement.append(hostEl);
    shadow = hostEl.attachShadow({ mode: 'open' });
    const style = createElement('style');
    style.textContent = STYLES;
    const widget = createElement('div', 'qc-widget');
    widget.hidden = true;
    shadow.append(style, widget);
  }

  function widgetEl() { ensureWidget(); return shadow.querySelector('.qc-widget'); }
  function clamp(value, min, max) { return max < min ? min : Math.min(Math.max(value, min), max); }

  function positionAt(x, y) {
    const rect = hostEl.getBoundingClientRect();
    const minX = window.scrollX + EDGE_PADDING;
    const maxX = window.scrollX + window.innerWidth - rect.width - EDGE_PADDING;
    const minY = window.scrollY + EDGE_PADDING;
    const maxY = window.scrollY + window.innerHeight - rect.height - EDGE_PADDING;
    hostEl.style.left = `${clamp(x, minX, maxX)}px`;
    hostEl.style.top = `${clamp(y, minY, maxY)}px`;
  }

  function hideWidget() {
    if (!shadow) return;
    const widget = widgetEl();
    widget.hidden = true;
    widget.replaceChildren();
  }

  function showCollapsedButton(text, mouseX, mouseY) {
    const widget = widgetEl();
    const button = createElement('button', 'qc-save-btn', '💬 Save quote');
    button.type = 'button';
    widget.className = 'qc-widget qc-collapsed';
    widget.hidden = false;
    widget.replaceChildren(button);
    positionAt(mouseX + 5, mouseY + 5);
    button.addEventListener('click', () => {
      const rect = hostEl.getBoundingClientRect();
      showForm(text, { x: rect.left + window.scrollX, y: rect.top + window.scrollY });
    });
  }

  function showForm(text, pos) {
    const widget = widgetEl();
    const card = createElement('div', 'qc-card');
    const handle = createElement('div', 'qc-drag-handle', 'Save quote');
    const content = createElement('div', 'qc-content');
    const preview = createElement('blockquote', 'qc-preview', text.length > 240 ? `${text.slice(0, 240)}…` : text);
    const note = createElement('textarea', 'qc-note');
    note.placeholder = 'Add a short note (optional)';
    note.rows = 3;
    const tags = createElement('input', 'qc-tags');
    tags.type = 'text';
    tags.placeholder = 'Tags (e.g. research, ideas)';
    const actions = createElement('div', 'qc-actions');
    const cancel = createElement('button', 'qc-cancel', 'Cancel');
    const confirm = createElement('button', 'qc-confirm', 'Save');
    cancel.type = 'button';
    confirm.type = 'button';
    actions.append(cancel, confirm);
    content.append(preview, note, tags, actions);
    card.append(handle, content);
    widget.className = 'qc-widget qc-form';
    widget.hidden = false;
    widget.replaceChildren(card);
    if (pos) positionAt(pos.x, pos.y);
    makeDraggable(handle);
    cancel.addEventListener('click', hideWidget);
    confirm.addEventListener('click', () => saveQuote(text, note, tags, confirm));
    setTimeout(() => note.focus(), 50);
  }

  function saveQuote(text, note, tags, confirm) {
    const payload = {
      text,
      note: note.value.trim(),
      tags: tags.value.split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean),
      source: { url: location.href, title: document.title },
    };
    confirm.disabled = true;
    confirm.textContent = 'Saving...';
    chrome.runtime.sendMessage({ type: 'SAVE_QUOTE', payload }, response => {
      if (response?.success) showSavedConfirmation();
      else {
        confirm.disabled = false;
        confirm.textContent = 'Save';
        alert('Failed to save quote. Please try again.');
      }
    });
  }

  function makeDraggable(handle) {
    handle.addEventListener('mousedown', event => {
      if (event.button !== 0) return;
      const startX = event.clientX;
      const startY = event.clientY;
      const rect = hostEl.getBoundingClientRect();
      const startLeft = rect.left + window.scrollX;
      const startTop = rect.top + window.scrollY;
      const move = moveEvent => {
        hostEl.style.left = `${startLeft + moveEvent.clientX - startX}px`;
        hostEl.style.top = `${startTop + moveEvent.clientY - startY}px`;
      };
      const stop = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', stop);
        positionAt(hostEl.getBoundingClientRect().left + window.scrollX, hostEl.getBoundingClientRect().top + window.scrollY);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', stop);
      event.preventDefault();
    });
  }

  function showSavedConfirmation() {
    const widget = widgetEl();
    widget.className = 'qc-widget qc-saved';
    widget.hidden = false;
    widget.replaceChildren(createElement('div', 'qc-toast', '✓ Saved to your library'));
    setTimeout(hideWidget, 1500);
  }

  document.addEventListener('mouseup', event => {
    if (hostEl && event.composedPath().includes(hostEl)) return;
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';
    if (!text || text.length < 3) {
      if (hostEl && !widgetEl().hidden) hideWidget();
      return;
    }
    showCollapsedButton(text, event.pageX, event.pageY);
  });
  document.addEventListener('contextmenu', event => { lastRightClickPos = { x: event.pageX, y: event.pageY }; });
  chrome.runtime.onMessage.addListener(message => {
    if (message.type !== 'OPEN_QUOTE_FORM') return;
    const pos = lastRightClickPos || { x: window.scrollX + window.innerWidth / 2 - 150, y: window.scrollY + window.innerHeight / 2 - 100 };
    showForm(message.payload.text, pos);
  });
})();
