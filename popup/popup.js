let allQuotes = [];
const selectedTags = new Set();

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
	document.getElementById('quotes-list').addEventListener('click', handleListClick);
	document.getElementById('quotes-list').addEventListener('keydown', handleListKeydown);
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

	document.addEventListener('click', e => {
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
	allQuotes = quotes.map(normalizeQuote);
	renderTagCloud();
	applyFilters();
}

function normalizeQuote(quote) {
	return {
		...quote,
		note: quote.note || '',
		tags: Array.isArray(quote.tags) ? quote.tags : [],
		source: quote.source || {},
	};
}

function applyFilters() {
	const query = document.getElementById('search-input').value.trim().toLowerCase();
	let list = allQuotes;

	if (selectedTags.size) {
		list = list.filter(q => [...selectedTags].every(tag => q.tags.includes(tag)));
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
		btn.className = 'tag-pill' + (selectedTags.has(tag) ? ' active' : '');
		btn.textContent = tag;
		btn.setAttribute('aria-pressed', String(selectedTags.has(tag)));
		btn.addEventListener('click', () => {
			if (selectedTags.has(tag)) selectedTags.delete(tag);
			else selectedTags.add(tag);
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
		if (quote && link) link.setAttribute('href', quote.source.url || '#');
	});
}

function renderQuoteCard(quote) {
	const tagsHtml = quote.tags.map(t => `<span>${escapeHtml(t)}</span>`).join('');
	return `
    <div class="quote-card" data-id="${escapeHtml(quote.id)}">
      <blockquote>${escapeHtml(quote.text)}</blockquote>
      ${quote.note ? `<p class="note">${escapeHtml(quote.note)}</p>` : ''}
      <div class="meta">
        <a href="#" target="_blank" rel="noopener">${escapeHtml(quote.source.title || quote.source.url || 'Unknown source')}</a>
        <span>${formatDate(quote.createdAt)}</span>
      </div>
      <div class="tags" aria-label="Tags">${tagsHtml || '<span class="no-tags">No tags</span>'}</div>
      <div class="card-actions">
		<button class="edit-btn" data-id="${escapeHtml(quote.id)}" type="button">Edit</button>
        <button class="delete-btn" data-id="${escapeHtml(quote.id)}" type="button">Delete</button>
      </div>
    </div>
  `;
}

async function handleListClick(e) {
	const editButton = e.target.closest('.edit-btn');
	if (editButton) {
		startQuoteEditing(editButton.dataset.id);
		return;
	}

	const cancelButton = e.target.closest('.cancel-edit-btn');
	if (cancelButton) {
		applyFilters();
		return;
	}

	const saveButton = e.target.closest('.save-edit-btn');
	if (saveButton) {
		await saveEditedQuote(saveButton.dataset.id);
		return;
	}

	const deleteButton = e.target.closest('.delete-btn');
	if (deleteButton) {
		const id = deleteButton.dataset.id;
		allQuotes = allQuotes.filter(q => q.id !== id);
		await chrome.storage.local.set({ quotes: allQuotes });
		chrome.runtime.sendMessage({ type: 'QUOTES_CHANGED' });
		for (const tag of selectedTags) {
			if (!allQuotes.some(q => q.tags.includes(tag))) selectedTags.delete(tag);
		}
		renderTagCloud();
		applyFilters();
	}
}

function handleListKeydown(e) {
	if (!e.target.classList.contains('note-input') && !e.target.classList.contains('tags-input')) return;
	if (e.key === 'Enter' && (e.target.classList.contains('tags-input') || e.ctrlKey || e.metaKey)) {
		e.preventDefault();
		saveEditedQuote(e.target.dataset.id);
	}
	if (e.key === 'Escape') applyFilters();
}

function startQuoteEditing(id) {
	const card = document.querySelector(`.quote-card[data-id="${CSS.escape(id)}"]`);
	const quote = allQuotes.find(q => q.id === id);
	if (!card || !quote) return;

	const note = card.querySelector('.note');
	const tags = card.querySelector('.tags');
	if (note) {
		note.outerHTML = `<textarea class="note-input" data-id="${escapeHtml(id)}" rows="3" aria-label="Edit description">${escapeHtml(quote.note)}</textarea>`;
	} else {
		card.querySelector('.meta').insertAdjacentHTML('beforebegin', `<textarea class="note-input" data-id="${escapeHtml(id)}" rows="3" aria-label="Edit description" placeholder="Add a short description (optional)"></textarea>`);
	}
	tags.innerHTML = `<input class="tags-input" data-id="${escapeHtml(id)}" type="text" value="${escapeHtml(quote.tags.join(', '))}" aria-label="Edit tags" placeholder="Tags (comma-separated)" />`;
	card.querySelector('.card-actions').innerHTML = `
		<button class="save-edit-btn" data-id="${escapeHtml(id)}" type="button">Save</button>
		<button class="cancel-edit-btn" type="button">Cancel</button>
	`;
	const input = card.querySelector('.note-input');
	input.focus();
	input.select();
}

async function saveEditedQuote(id) {
	const card = document.querySelector(`.quote-card[data-id="${CSS.escape(id)}"]`);
	const quote = allQuotes.find(q => q.id === id);
	if (!card || !quote) return;

	const noteInput = card.querySelector('.note-input');
	const tagsInput = card.querySelector('.tags-input');
	if (!noteInput || !tagsInput) return;

	quote.note = noteInput.value.trim();
	quote.tags = parseTags(tagsInput.value);
	await chrome.storage.local.set({ quotes: allQuotes });
	chrome.runtime.sendMessage({ type: 'QUOTES_CHANGED' });
	for (const tag of selectedTags) {
		if (!allQuotes.some(q => q.tags.includes(tag))) selectedTags.delete(tag);
	}
	renderTagCloud();
	applyFilters();
}

function parseTags(value) {
	return [...new Set(value.split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean))];
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
