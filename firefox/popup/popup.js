let allQuotes = [];
const selectedTags = new Set();
let favoritesOnly = false;
let sortMode = 'newest';
const LONG_QUOTE_LENGTH = 280;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadQuotes();
  const searchInput = document.getElementById('search-input');
  const clearButton = document.getElementById('search-clear');
  clearButton.addEventListener('click', () => {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  });
  searchInput.addEventListener('input', () => {
    clearButton.style.opacity = searchInput.value.trim() ? '1' : '0';
    applyFilters();
  });
  const favoritesFilter = document.getElementById('favorites-filter');
  const sortSelect = document.getElementById('sort-select');
  sortSelect.addEventListener('change', () => { sortMode = sortSelect.value; applyFilters(); });
  favoritesFilter.addEventListener('click', () => {
    favoritesOnly = !favoritesOnly;
    favoritesFilter.textContent = favoritesOnly ? '★ Favorites' : '☆ Favorites';
    favoritesFilter.setAttribute('aria-pressed', String(favoritesOnly));
    applyFilters();
  });
  document.getElementById('quotes-list').addEventListener('click', handleListClick);
  document.getElementById('quotes-list').addEventListener('keydown', handleListKeydown);
  setupExportMenu();
  setupImportControl();
}

function setupExportMenu() {
  const exportButton = document.getElementById('export-btn');
  const menu = document.getElementById('export-menu');
  exportButton.addEventListener('click', event => {
    event.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  menu.addEventListener('click', async event => {
    const format = event.target.dataset.format;
    if (!format) return;
    if (format === 'json') exportAsJson(allQuotes);
    if (format === 'txt') exportAsTxt(allQuotes);
    if (format === 'docx') exportAsDocx(allQuotes);
    menu.hidden = true;
  });
  document.addEventListener('click', event => {
    if (!exportButton.contains(event.target) && !menu.contains(event.target)) menu.hidden = true;
  });
}

function setupImportControl() {
  const importButton = document.getElementById('import-btn');
  importButton.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('import.html') });
  });
}

function parseImportedQuotes(value) {
  if (!Array.isArray(value)) throw new Error('JSON must contain an array of quotes.');
  const quotes = value.map(normalizeImportedQuote).filter(Boolean);
  if (!quotes.length) throw new Error('No valid quotes found.');
  return quotes;
}

function normalizeImportedQuote(quote) {
  if (!quote || typeof quote !== 'object' || typeof quote.text !== 'string' || !quote.text.trim()) return null;
  const tags = Array.isArray(quote.tags)
    ? [...new Set(quote.tags.filter(tag => typeof tag === 'string').map(tag => tag.trim().toLowerCase()).filter(Boolean))]
    : [];
  const source = quote.source && typeof quote.source === 'object' ? quote.source : {};
  return {
    id: typeof quote.id === 'string' && quote.id ? quote.id : crypto.randomUUID(),
    text: quote.text,
    note: typeof quote.note === 'string' ? quote.note : '',
    tags,
    source: { url: typeof source.url === 'string' ? source.url : '', title: typeof source.title === 'string' ? source.title : '' },
    favorite: quote.favorite === true,
    createdAt: Number.isFinite(quote.createdAt) ? quote.createdAt : Date.now(),
  };
}

async function loadQuotes() {
  const { quotes = [] } = await chrome.storage.local.get('quotes');
  allQuotes = quotes.map(normalizeQuote);
  renderTagCloud();
  applyFilters();
}

function normalizeQuote(quote) {
  return { ...quote, note: quote.note || '', tags: Array.isArray(quote.tags) ? quote.tags : [], source: quote.source || {}, favorite: quote.favorite === true };
}

function applyFilters() {
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  let filteredQuotes = allQuotes;
  if (favoritesOnly) filteredQuotes = filteredQuotes.filter(quote => quote.favorite);
  if (selectedTags.size) filteredQuotes = filteredQuotes.filter(quote => [...selectedTags].every(tag => quote.tags.includes(tag)));
  if (query) {
    filteredQuotes = filteredQuotes.filter(quote =>
      quote.text.toLowerCase().includes(query) ||
      quote.note.toLowerCase().includes(query) ||
      quote.tags.some(tag => tag.toLowerCase().includes(query)) ||
      (quote.source.title || '').toLowerCase().includes(query),
    );
  }
  const sortedQuotes = sortQuotes(filteredQuotes);
  updateCounters(sortedQuotes.length);
  renderQuotes(sortedQuotes);
}

function sortQuotes(quotes) {
  return [...quotes].sort((left, right) => {
    if (sortMode === 'oldest') return left.createdAt - right.createdAt;
    if (sortMode === 'az') return left.text.localeCompare(right.text);
    if (sortMode === 'favorites') return Number(right.favorite) - Number(left.favorite) || right.createdAt - left.createdAt;
    return right.createdAt - left.createdAt;
  });
}

function renderTagCloud() {
  const container = document.getElementById('tag-cloud');
  const tags = new Set(allQuotes.flatMap(quote => quote.tags));
  container.replaceChildren(...[...tags].map(createTagButton));
}

function createTagButton(tag) {
  const button = document.createElement('button');
  button.className = `tag-pill${selectedTags.has(tag) ? ' active' : ''}`;
  button.textContent = tag;
  button.setAttribute('aria-pressed', String(selectedTags.has(tag)));
  button.addEventListener('click', () => {
    if (selectedTags.has(tag)) selectedTags.delete(tag);
    else selectedTags.add(tag);
    renderTagCloud();
    applyFilters();
  });
  return button;
}

function updateCounters(visibleCount) {
  document.getElementById('quote-counter').textContent = String(allQuotes.length);
  document.getElementById('results-count').textContent = `Showing ${visibleCount} of ${allQuotes.length}`;
}

function renderQuotes(quotes) {
  const container = document.getElementById('quotes-list');
  if (!quotes.length) {
    const emptyState = document.createElement('p');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'Nothing here yet. Select text on any page to save your first quote.';
    container.replaceChildren(emptyState);
    return;
  }
  container.replaceChildren(...quotes.map(createQuoteCard));
}

function createQuoteCard(quote) {
  const card = document.createElement('div');
  card.className = 'quote-card';
  card.dataset.id = quote.id;
  const quoteText = document.createElement('blockquote');
  quoteText.textContent = quote.text;
  const isLong = quote.text.length > LONG_QUOTE_LENGTH;
  if (isLong) quoteText.classList.add('is-collapsed');
  card.append(quoteText);
  if (isLong) card.append(createQuoteToggle(quoteText));
  if (quote.note) {
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = quote.note;
    card.append(note);
  }
  card.append(createQuoteMeta(quote), createTags(quote), createActions(quote));
  return card;
}

function createQuoteToggle(quoteText) {
  const button = document.createElement('button');
  button.className = 'quote-toggle';
  button.type = 'button';
  button.textContent = 'Show more';
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', () => {
    const collapsed = quoteText.classList.toggle('is-collapsed');
    button.textContent = collapsed ? 'Show more' : 'Show less';
    button.setAttribute('aria-expanded', String(!collapsed));
  });
  return button;
}

function createQuoteMeta(quote) {
  const meta = document.createElement('div');
  meta.className = 'meta';
  const link = document.createElement('a');
  link.href = quote.source.url || '#';
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = quote.source.title || quote.source.url || 'Unknown source';
  const date = document.createElement('span');
  date.textContent = formatDate(quote.createdAt);
  meta.append(link, date);
  return meta;
}

function createTags(quote) {
  const tags = document.createElement('div');
  tags.className = 'tags';
  tags.setAttribute('aria-label', 'Tags');
  if (!quote.tags.length) {
    const empty = document.createElement('span');
    empty.className = 'no-tags';
    empty.textContent = 'No tags';
    tags.append(empty);
  } else quote.tags.forEach(tag => { const item = document.createElement('span'); item.textContent = tag; tags.append(item); });
  return tags;
}

function createActions(quote) {
  const actions = document.createElement('div');
  actions.className = 'card-actions';
  actions.append(createFavoriteButton(quote), createActionButton('Copy', 'copy-btn', quote.id), createActionButton('Edit', 'edit-btn', quote.id), createActionButton('Delete', 'delete-btn', quote.id));
  return actions;
}

async function copyQuoteWithSource(id, button) {
  const quote = allQuotes.find(item => item.id === id);
  if (!quote) return;
  const source = quote.source.title || quote.source.url || 'Unknown source';
  const sourceLine = quote.source.url ? `${source} — ${quote.source.url}` : source;
  await navigator.clipboard.writeText(`“${quote.text}”

Source: ${sourceLine}`);
  const originalLabel = button.textContent;
  button.textContent = 'Copied';
  setTimeout(() => { button.textContent = originalLabel; }, 1200);
}

function createFavoriteButton(quote) {
  const button = createActionButton(quote.favorite ? '★' : '☆', 'favorite-btn', quote.id);
  button.title = quote.favorite ? 'Remove from favorites' : 'Add to favorites';
  button.setAttribute('aria-label', button.title);
  button.setAttribute('aria-pressed', String(quote.favorite));
  return button;
}

function createActionButton(label, className, id) {
  const button = document.createElement('button');
  button.className = className;
  button.dataset.id = id;
  button.type = 'button';
  button.textContent = label;
  return button;
}

async function handleListClick(event) {
  const toggle = event.target.closest('.quote-toggle');
  if (toggle) return;
  const copy = event.target.closest('.copy-btn');
  if (copy) {
    await copyQuoteWithSource(copy.dataset.id, copy);
    return;
  }
  const favorite = event.target.closest('.favorite-btn');
  if (favorite) {
    const quote = allQuotes.find(item => item.id === favorite.dataset.id);
    if (!quote) return;
    quote.favorite = !quote.favorite;
    await chrome.storage.local.set({ quotes: allQuotes });
    applyFilters();
    return;
  }
  const edit = event.target.closest('.edit-btn');
  if (edit) return startQuoteEditing(edit.dataset.id);
  const cancel = event.target.closest('.cancel-edit-btn');
  if (cancel) return applyFilters();
  const save = event.target.closest('.save-edit-btn');
  if (save) return saveEditedQuote(save.dataset.id);
  const remove = event.target.closest('.delete-btn');
  if (!remove) return;
  allQuotes = allQuotes.filter(quote => quote.id !== remove.dataset.id);
  await chrome.storage.local.set({ quotes: allQuotes });
  chrome.runtime.sendMessage({ type: 'QUOTES_CHANGED' });
  selectedTags.forEach(tag => { if (!allQuotes.some(quote => quote.tags.includes(tag))) selectedTags.delete(tag); });
  renderTagCloud();
  applyFilters();
}

function handleListKeydown(event) {
  if (!event.target.matches('.note-input, .tags-input')) return;
  if (event.key === 'Enter' && (event.target.classList.contains('tags-input') || event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    saveEditedQuote(event.target.dataset.id);
  }
  if (event.key === 'Escape') applyFilters();
}

function startQuoteEditing(id) {
  const card = document.querySelector(`.quote-card[data-id="${CSS.escape(id)}"]`);
  const quote = allQuotes.find(item => item.id === id);
  if (!card || !quote) return;
  const note = document.createElement('textarea');
  note.className = 'note-input'; note.dataset.id = id; note.rows = 3; note.setAttribute('aria-label', 'Edit description'); note.value = quote.note;
  const existingNote = card.querySelector('.note');
  if (existingNote) existingNote.replaceWith(note); else card.querySelector('.meta').before(note);
  const tags = card.querySelector('.tags');
  const tagsInput = document.createElement('input');
  tagsInput.className = 'tags-input'; tagsInput.dataset.id = id; tagsInput.type = 'text'; tagsInput.value = quote.tags.join(', '); tagsInput.setAttribute('aria-label', 'Edit tags'); tags.replaceChildren(tagsInput);
  const actions = card.querySelector('.card-actions');
  actions.replaceChildren(createActionButton('Save', 'save-edit-btn', id), createActionButton('Cancel', 'cancel-edit-btn', id));
  note.focus(); note.select();
}

async function saveEditedQuote(id) {
  const card = document.querySelector(`.quote-card[data-id="${CSS.escape(id)}"]`);
  const quote = allQuotes.find(item => item.id === id);
  if (!card || !quote) return;
  quote.note = card.querySelector('.note-input').value.trim();
  quote.tags = parseTags(card.querySelector('.tags-input').value);
  await chrome.storage.local.set({ quotes: allQuotes });
  chrome.runtime.sendMessage({ type: 'QUOTES_CHANGED' });
  renderTagCloud();
  applyFilters();
}

function parseTags(value) { return [...new Set(value.split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean))]; }
function formatDate(timestamp) { return new Date(timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
