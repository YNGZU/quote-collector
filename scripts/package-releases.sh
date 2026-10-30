#!/usr/bin/env bash
set -euo pipefail

rm -rf dist/package
mkdir -p dist/package/chromium dist/package/firefox

cp -R manifest.json background.js content icons popup import.html import.css import.js dist/package/chromium/
cp -R firefox/. dist/package/firefox/

rm -f dist/quote-collector-chromium.zip dist/quote-collector-firefox.zip
(cd dist/package/chromium && zip -qr ../../quote-collector-chromium.zip .)
(cd dist/package/firefox && zip -qr ../../quote-collector-firefox.zip .)
rm -rf dist/package
printf '%s\n' 'Created dist/quote-collector-chromium.zip'
printf '%s\n' 'Created dist/quote-collector-firefox.zip'
