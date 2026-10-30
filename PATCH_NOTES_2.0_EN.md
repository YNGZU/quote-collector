# Quote Collector 2.0 — Patch Notes

## New

- Compact display for long quotes with “Show more / Show less” controls.
- JSON library import in a standalone tab, compatible with Firefox-based browsers and temporary debug installations.
- Favorites: mark quotes as favorites and filter the library by favorites.
- Copy quotes together with the source title and URL.
- Quote sorting: Newest, Oldest, A–Z, and Favorites.
- Library counter inside the popup and a `Showing X of Y` results indicator.
- Consistent green focus outline for the search field and controls.
- Separate release archives for Firefox and Chromium/Opera.

## Improvements and fixes

- Improved compatibility with Firefox Add-ons requirements.
- Removed unsafe dynamic HTML assignments from the Firefox build.
- JSON import no longer depends on the popup lifecycle.
- The Opera/Chromium build now includes the same functionality as the Firefox build.

## Privacy

Version 2.0 uses the browser’s local storage. No data is sent to a server.
