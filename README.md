# Quote Collector

Select text on any page, add a short note and tags, and it's saved into a
personal, searchable library — no account, no server, everything stays in
the browser's local storage.

## How to load it (development mode)

Works the same way in Chrome, Opera, and Yandex Browser (all Chromium-based).

1. Open `chrome://extensions` (or `opera://extensions`, `browser://extensions` in Yandex).
2. Turn on **Developer mode** (toggle, usually top-right).
3. Click **Load unpacked**.
4. Select this whole `quote-collector` folder.
5. Pin the extension to the toolbar if you want it visible at all times.

Any time you edit a file, come back to this page and hit the refresh icon
on the extension's card to reload your changes.

## How to use it

- **Select text** on any page → a small "💬 Save quote" button appears
  near your selection → click it → add an optional note and comma-separated
  tags → **Save**.
- **Right-click** selected text → **"Save selection as quote"** works the
  same way, if you'd rather not reach for the floating button.
- **Click the toolbar icon** to open your library: search across quote
  text, notes, tags, and source titles; click one or more tag pills to filter
  by all selected tags; use **Edit tags** on any note to change its
  comma-separated tags; **Export ▾**
  lets you download everything as JSON, TXT, or DOCX.

## Project structure

```
quote-collector/
├── manifest.json        Extension config: permissions, entry points
├── background.js        Service worker — owns storage writes, the badge, the right-click menu
├── content/
│   └── content.js       Injected into every page — the floating button + form
├── popup/
│   ├── popup.html        The toolbar popup's markup
│   ├── popup.css        Its styling
│   ├── popup.js          Its logic — render, search, filter, delete
│   └── export.js         JSON / TXT / DOCX export (DOCX is hand-built: a
│                          minimal ZIP writer + minimal Word XML, no library)
└── icons/                Toolbar + store icons (16/48/128px placeholders — swap for your own)
```
