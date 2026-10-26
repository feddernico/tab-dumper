# Chrome Web Store submission

Version 2.0.1 · prepared 26 October 2026.

## Upload files

- `../../dist/tab-dumper-2.0.1-chrome.zip`: production-only Manifest V3 package. Its runtime code is the same as the Opera build; the Chrome package uses the padded 128px icon and includes `PRIVACY.md`.
- `store-icon-128.png`: 128 × 128 transparent PNG, with 96px artwork and 16px padding.
- `screenshots/01-archive.png`, `02-preview.png`, `03-review.png`: 1280 × 800 screenshots with example entries, captured in Chrome for Testing.
- `promo-440x280.png`: optional small promotional tile. The Opera 300 × 188 image is not the Chrome tile size.
- `listing.txt`: description, URLs and reviewer test instructions.
- `privacy-fields.txt`: single-purpose statement, permission reasons and data-use guidance.

## Build and check

Use the tool versions and setup in `../build-instructions.txt`. PNGs are committed, so no browser is needed just to package:

```sh
python3 scripts/package.py --target chrome
```

For development and regeneration:

```sh
npm ci
npx playwright install chromium
npm test
npm run assets:chrome
npm run package:chrome
npm run test:chrome
```

`test:chrome` uses Playwright's bundled Chrome for Testing in an isolated profile. It does not operate on personal tabs. To check a ZIP rather than the source folder, extract it to an empty directory and set `TEST_EXTENSION_PATH` to that absolute directory when running the test. Regular branded Chrome can disable command-line extension loading; manually use chrome://extensions → Developer mode → Load unpacked for its smoke check.

## Developer Dashboard

1. Register/verify your developer account if necessary. The account owner must handle any payment, terms, two-step verification and trader-status declarations.
2. Add a new item and upload the Chrome ZIP. Set English and the closest Productivity category.
3. Upload the icon and screenshots; add the promotional tile if desired. Paste `listing.txt` and `privacy-fields.txt` into the corresponding fields.
4. Verify that the support and privacy URLs are public and reachable. A public GitHub copy of the privacy policy is also provided. The archive handles user data locally, so a “no data handled” declaration would be inaccurate.
5. Set distribution and review the exact data-use certifications. No login instructions or test account are needed. Leave optional video, marquee image and verified-official-site fields blank unless you have them.
6. Submit for review when ready. Nothing in these scripts submits an item or guarantees approval. Deferred publishing is available if you want to choose the launch time after approval.

Cross-platform manual checks and a regular Chrome UI smoke check remain separate from the automated macOS Chrome for Testing checks. Export a backup before changing extension installations: Opera, Chrome and unpacked installations may have different IDs and separate storage.

Verified on 26 October 2026: 15 unit tests passed; the extracted Chrome ZIP passed the browser workflow in Chrome for Testing 156.0.8078.4 on macOS, including offline reload/search/preview, save-before-close, JSON/Markdown exports, merge import, persistence, safe rendering, review and unfinished-form protection. All supplied PNG dimensions and non-interlaced encoding were checked. Store review and approval remain with Google.

## References

- [Publish an extension](https://developer.chrome.com/docs/webstore/publish/)
- [Listing fields and image sizes](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Icon and promotional-image guidance](https://developer.chrome.com/docs/webstore/images)
- [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Local data still requires disclosure](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
