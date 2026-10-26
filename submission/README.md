# Opera submission kit

Prepared 26 October 2026. Version 2.0.1. MIT licence.

## Upload materials

- Package: `../dist/tab-dumper-2.0.1-opera.zip` (manifest at the ZIP root; production files only).
- Listing and reviewer notes: `listing.txt`.
- Promotional image: `promotional/tab-dumper-promo-300x188.png` (300 × 188 PNG; editable SVG alongside it).
- Store screenshots: `screenshots/01-archive.png`, `02-preview.png`, `03-review.png` (800 × 600 PNG, demonstration entries, captured in Opera).
- Icons: `../assets/icons/` (16, 32, 48, 64, 128 and 256 px, non-interlaced PNG).
- Support page: https://viscioletti.com/tab-dumper (prepared as a draft; publication is deferred until store approval).
- Direct assistance form, available now: https://tally.so/r/e55RWl.
- Public source: https://github.com/feddernico/tab-dumper. Build instructions: `build-instructions.txt`.
- Privacy notice and both licences are bundled in the extension. Open **Help & privacy**.

## Verified

- 15 unit tests covering the archive, atomic imports, migration, save-before-close and tab protection.
- Packaged extension workflow passed in the installed Opera 138 on macOS: load, capture, search, edit, export/import, reopen, persistence, safe rendering, ten-item review and dirty-form protection.
- Website rendered with the existing Quarto theme and checked at desktop/mobile sizes. Images, download and privacy alias work; Tally makes no request until the load button is clicked.
- Tally's public form is published. Required email/request/details fields and preview validation checked. No test support response was submitted.

## Still before submission / launch

1. Run the workflow on Windows Opera. The official guidelines ask for Mac and Windows checks; Windows and Linux have not been verified here. `npm ci`, `npm run test:opera` uses an isolated profile; set `TEST_BROWSER_PATH` if needed. Manually check toolbar icon, browser restart/reminder, keyboard access, offline preview and loading tabs.
2. Upload the ZIP and listing/screenshots to Opera's developer portal, select MIT, and enter the chosen website support URL. That page is intentionally unpublished until store approval, so it is not yet reachable; the direct Tally form remains available. If the portal requires a public privacy-policy URL, provide one before submitting; the website page is intentionally held until approval.
3. Wait for moderation. This work did not upload or submit the extension, accept portal terms or claim store approval.
4. After the extension is live, update `tab-dumper.qmd` with its verified Opera store URL, replace the pre-release installation copy, remove `draft: true`, and deploy the website. Then verify the support/privacy links in the listing and form. The six files are already in `~/Dev/viscioletti_com_private/`; no website commit or deployment was made.

The website's existing `draft-mode: gone` prevents the draft page from entering normal builds. Its static images/download ZIP are ordinary resources and are not private if a full site build publishes them.

## Rebuild

```sh
npm ci
npm test
npm run test:opera
npm run package
node scripts/store-assets.mjs
```

The internal database and backup identifiers retain `tab-tinder` for compatibility. Export a backup before changing from an unpacked installation to a store installation, since they may have different extension IDs.

References: [Opera publishing guidelines](https://help.opera.com/en/extensions/publishing-guidelines/), [acceptance criteria](https://help.opera.com/en/extensions/acceptance-criteria/), [icon guidance](https://help.opera.com/en/extensions/effective-icons/).
