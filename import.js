const fileInput = document.getElementById('json-file');
const statusMessage = document.getElementById('import-status');

document.getElementById('close-page').addEventListener('click', () => window.close());
fileInput.addEventListener('change', handleFileSelection);

async function handleFileSelection() {
  const [file] = fileInput.files || [];
  if (!file) return;
  statusMessage.className = '';
  statusMessage.textContent = 'Importing…';
  try {
    const importedQuotes = parseImportedQuotes(JSON.parse(await file.text()));
    const { quotes = [] } = await chrome.storage.local.get('quotes');
    const existingQuotes = quotes.map(normalizeQuote);
    const quotesById = new Map(existingQuotes.map(quote => [quote.id, quote]));
    importedQuotes.forEach(quote => quotesById.set(quote.id, quote));
    await chrome.storage.local.set({ quotes: [...quotesById.values()] });
    statusMessage.className = 'success';
    statusMessage.textContent = `Imported ${importedQuotes.length} quote${importedQuotes.length === 1 ? '' : 's'}. You can close this tab.`;
    fileInput.value = '';
  } catch (error) {
    statusMessage.className = 'error';
    statusMessage.textContent = `Import failed: ${error.message}`;
  }
}

function parseImportedQuotes(value) {
  if (!Array.isArray(value)) throw new Error('JSON must contain an array of quotes.');
  const quotes = value.map(normalizeQuote).filter(Boolean);
  if (!quotes.length) throw new Error('No valid quotes found.');
  return quotes;
}

function normalizeQuote(quote) {
  if (!quote || typeof quote !== 'object' || typeof quote.text !== 'string' || !quote.text.trim()) return null;
  const source = quote.source && typeof quote.source === 'object' ? quote.source : {};
  const tags = Array.isArray(quote.tags)
    ? [...new Set(quote.tags.filter(tag => typeof tag === 'string').map(tag => tag.trim().toLowerCase()).filter(Boolean))]
    : [];
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
