// Background service worker — the extension's central hub.
//
// It owns the actual writes to chrome.storage, keeps the toolbar
// badge count in sync, and sets up the right-click "Save selection
// as quote" menu item. The content script and popup don't talk to
// each other directly — they go through here (or read storage
// directly for the popup's case) so there is one place that owns
// "what does it mean to save a quote."

const MENU_ID = 'save-as-quote';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Save selection as quote',
    contexts: ['selection'],
  });
  updateBadge();
});

// Right-click path: the context menu already gives us the selected
// text directly (info.selectionText), so we just forward it to the
// content script running in that tab, which opens the same note +
// tags form used by the floating button.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'OPEN_QUOTE_FORM',
      payload: { text: info.selectionText ?? '' },
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_QUOTE') {
    saveQuote(message.payload).then(() => {
      updateBadge();
      sendResponse({ success: true });
    });
    // Returning true keeps the message channel open so the async
    // work above can still call sendResponse when it's done.
    return true;
  }

  if (message.type === 'QUOTES_CHANGED') {
    // The popup fires this after a delete, so the badge count
    // doesn't go stale.
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
  chrome.action.setBadgeText({ text: quotes.length ? String(quotes.length) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#3D6B64' });
}
