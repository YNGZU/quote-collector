let allQuotes = [];
let activeTag = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadQuotes();
  document.getElementById('search-input').addEventListener('input', applyFilters);
  document.getElementById('export-btn').addEventListener('click', exportQuotes);
  document.getElementById('quotes-list').addEventListener('click', handleListClick);
}

async function loadQuotes() {
  const { quotes = [] } = await chrome.storage.local.get('quotes');
  allQuotes = quotes;
  renderTagCloud();
  applyFilters();
}

function applyFilters() {
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  let list = allQuotes;

  if (activeTag) {
    list = list.filter((q) => q.tags.includes(activeTag));
  }

  if (query) {
    list = list.filter(
      (q) =>
        q.text.toLowerCase().includes(query) ||
        q.note.toLowerCase().includes(query) ||
        q.tags.some((t) => t.toLowerCase().includes(query)) ||
        (q.source.title || '').toLowerCase().includes(query)
    );
  }

  renderQuotes(list);
}

// Built with createElement rather than an HTML string: each tag comes
// straight from user input, and closing over `tag` directly in the
// click handler means we never need to round-trip it through a
// data-* attribute (and therefore never need to worry about escaping
// it for that context).
function renderTagCloud() {
  const allTags = new Set();
  allQuotes.forEach((q) => q.tags.forEach((t) => allTags.add(t)));

  const container = document.getElementById('tag-cloud');
  container.innerHTML = '';

  allTags.forEach((tag) => {
    const btn = document.createElement('button');
    btn.className = 'tag-pill' + (tag === activeTag ? ' active' : '');
    btn.textContent = tag;
    btn.addEventListener('click', () => {
      activeTag = activeTag === tag ? null : tag;
      renderTagCloud();
      applyFilters();
    });
    container.appendChild(btn);
  });
}

function renderQuotes(list) {
  const container = document.getElementById('quotes-list');

  if (list.length === 0) {
    container.innerHTML = `<p class="empty-state">Nothing here yet. Select text on any page to save your first quote.</p>`;
    return;
  }

  container.innerHTML = list.map(renderQuoteCard).join('');

  // The href is set via setAttribute rather than interpolated into the
  // HTML string above. escapeHtml() protects text content just fine,
  // but a stray " in a page title or URL could otherwise break out of
  // an href="..." attribute — setAttribute always treats the value as
  // a literal string, so that whole class of problem doesn't apply.
  container.querySelectorAll('.quote-card').forEach((card) => {
    const quote = list.find((q) => q.id === card.dataset.id);
    const link = card.querySelector('.meta a');
    if (quote && link) link.setAttribute('href', quote.source.url);
  });
}

function renderQuoteCard(quote) {
  const tagsHtml = quote.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join('');
  return `
    <div class="quote-card" data-id="${quote.id}">
      <blockquote>${escapeHtml(quote.text)}</blockquote>
      ${quote.note ? `<p class="note">${escapeHtml(quote.note)}</p>` : ''}
      <div class="meta">
        <a href="#" target="_blank" rel="noopener">${escapeHtml(quote.source.title || quote.source.url)}</a>
        <span>${formatDate(quote.createdAt)}</span>
      </div>
      <div class="tags">${tagsHtml}</div>
      <button class="delete-btn" data-id="${quote.id}">Delete</button>
    </div>
  `;
}

async function handleListClick(e) {
  if (e.target.classList.contains('delete-btn')) {
    const id = e.target.dataset.id;
    allQuotes = allQuotes.filter((q) => q.id !== id);
    await chrome.storage.local.set({ quotes: allQuotes });
    chrome.runtime.sendMessage({ type: 'QUOTES_CHANGED' });
    renderTagCloud();
    applyFilters();
  }
}

function exportQuotes() {
  const dataStr = JSON.stringify(allQuotes, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `quotes-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// A reliable escaping trick: assigning to textContent forces the browser
// to treat the value as plain text, and reading innerHTML back gives us
// that same text with <, >, and & safely encoded — good enough for
// anywhere this value ends up inside element content (not an attribute).
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
