let allQuotes = [];
let activeTag = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
	await loadQuotes();

	const searchInput = document.getElementById('search-input');
	const clearBtn = document.getElementById('search-clear');

	if (searchInput && clearBtn) {
		clearBtn.addEventListener('click', () => {
			searchInput.value = '';
			searchInput.dispatchEvent(new Event('input', { bubbles: true }));
		});

		searchInput.addEventListener('input', () => {
			clearBtn.style.opacity = searchInput.value.trim() ? '1' : '0';
		});
	}

	searchInput.addEventListener('input', applyFilters);
	document
		.getElementById('quotes-list')
		.addEventListener('click', handleListClick);
	setupExportMenu();
}

function setupExportMenu() {
	const exportBtn = document.getElementById('export-btn');
	const menu = document.getElementById('export-menu');

	exportBtn.addEventListener('click', e => {
		e.stopPropagation();
		menu.hidden = !menu.hidden;
	});

	menu.addEventListener('click', e => {
		const format = e.target.dataset.format;
		if (!format) return;

		if (format === 'json') exportAsJson(allQuotes);
		if (format === 'txt') exportAsTxt(allQuotes);
		if (format === 'docx') exportAsDocx(allQuotes);

		menu.hidden = true;
	});

	// Close the menu on any click outside of it.
	document.addEventListener('click', e => {
		const exportBtn = document.getElementById('export-btn');
		const menu = document.getElementById('export-menu');

		if (
			exportBtn &&
			menu &&
			!exportBtn.contains(e.target) &&
			!menu.contains(e.target)
		) {
			menu.hidden = true;
		}
	});
}

async function loadQuotes() {
	const { quotes = [] } = await chrome.storage.local.get('quotes');
	allQuotes = quotes;
	renderTagCloud();
	applyFilters();
}

function applyFilters() {
	const query = document
		.getElementById('search-input')
		.value.trim()
		.toLowerCase();
	let list = allQuotes;

	if (activeTag) {
		list = list.filter(q => q.tags.includes(activeTag));
	}

	if (query) {
		list = list.filter(
			q =>
				q.text.toLowerCase().includes(query) ||
				q.note.toLowerCase().includes(query) ||
				q.tags.some(t => t.toLowerCase().includes(query)) ||
				(q.source.title || '').toLowerCase().includes(query),
		);
	}

	renderQuotes(list);
}

function renderTagCloud() {
	const allTags = new Set();
	allQuotes.forEach(q => q.tags.forEach(t => allTags.add(t)));

	const container = document.getElementById('tag-cloud');
	container.innerHTML = '';

	allTags.forEach(tag => {
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

	container.querySelectorAll('.quote-card').forEach(card => {
		const quote = list.find(q => q.id === card.dataset.id);
		const link = card.querySelector('.meta a');
		if (quote && link) link.setAttribute('href', quote.source.url);
	});
}

function renderQuoteCard(quote) {
	const tagsHtml = quote.tags
		.map(t => `<span>${escapeHtml(t)}</span>`)
		.join('');
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
		allQuotes = allQuotes.filter(q => q.id !== id);
		await chrome.storage.local.set({ quotes: allQuotes });
		chrome.runtime.sendMessage({ type: 'QUOTES_CHANGED' });
		renderTagCloud();
		applyFilters();
	}
}

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
