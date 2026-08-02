const MENU_ID = 'save-as-quote';

// Processing the extension installation
chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.create({
		id: MENU_ID,
		title: 'Save selection as quote',
		contexts: ['selection'],
	});
	updateBadge();
});

// Processing a click on a menu item
chrome.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId === MENU_ID && tab?.id) {
		chrome.tabs.sendMessage(tab.id, {
			type: 'OPEN_QUOTE_FORM',
			payload: {
				text: info.selectionText ?? '',
				x: info.x,
				y: info.y,
			},
		});
	}
});

// Receiving messages from other parts of the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === 'SAVE_QUOTE') {
		saveQuote(message.payload).then(() => {
			updateBadge();
			sendResponse({ success: true });
		});
		return true;
	}

	if (message.type === 'QUOTES_CHANGED') {
		updateBadge();
	}
});

async function saveQuote(data) {
	const { quotes = [] } = await chrome.storage.local.get('quotes');
	const quote = {
		id: crypto.randomUUID(),
		text: data.text,
		note: data.note || '',
		tags: data.tags || [],
		source: data.source,
		createdAt: Date.now(),
	};
	quotes.unshift(quote);
	await chrome.storage.local.set({ quotes });
}

async function updateBadge() {
	const { quotes = [] } = await chrome.storage.local.get('quotes');
	chrome.action.setBadgeText({
		text: quotes.length ? String(quotes.length) : '',
	});
	chrome.action.setBadgeBackgroundColor({ color: '#3D6B64' });
}
