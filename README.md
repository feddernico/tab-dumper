# Tab Dumper

A local tab archive for Opera and other Chromium browsers. Save useful pages, close the tabs, and find them later by title, URL, description, captured text or category.

## Install or reload in Opera

1. Open `opera://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this `tab-dumper` folder. If it is already installed, use **Reload** on its extension card instead.
3. Pin Tab Dumper in the extensions menu and click its toolbar icon. It opens a full-page dashboard.

The manifest now points to the included `background.js`. The previous version pointed to missing `background.js` and `panel.html` files. No build step or npm installation is needed to use the extension.

Reload the existing extension in the same folder to retain its identity and local data. Removing/uninstalling the extension can delete the archive; export a JSON backup first.

## Everyday use

- **Open tabs:** review HTTP/HTTPS tabs across regular windows. Assign comma-separated categories and a purpose, then save individual tabs or select a batch. Each link is committed to the archive before closing its tab. A failed save leaves the tab open.
- **Preview:** inspect locally extracted page text. **Unload** keeps a tab in the tab bar while asking the browser to discard its loaded page.
- **Your archive:** search across title, URL, description, captured text and categories. Search terms are combined, so `research quokka` matches entries containing both. Filter by category or purpose, edit the description, and reopen pages without removing their saved copy.
- **Weekly review:** revisit up to ten of the oldest unreviewed saved links. Keep marks an entry reviewed; Done excludes it from future review queues. Finishing schedules the next reminder one week later. There is no automatic deletion or expiry.

The weekly reminder is a dot on the extension toolbar icon and a banner in the dashboard. Pin the icon to see it. It is checked hourly while the browser runs, and after restart; it does not create a macOS notification or run with Opera closed. You can turn it off in Weekly review.

Pinned tabs, tabs playing audio, and pages with detected form edits are saved but left open. Form detection is best-effort: it cannot recognise every web application's editor or iframe. Saved links/text do not preserve form state, page history, downloads, login sessions or media playback.

## Captured content

Saving or previewing an already loaded page reads its description and visible article/main text, falling back to visible page text. Capture runs only when requested. Sleeping tabs are not reactivated, and inaccessible or loading pages are saved as links. A metadata description or opening excerpt provides the initial description; this is not an AI summary.

Captures contain at most 200,000 characters per page and explicitly label truncation. They exclude form fields and common navigation elements. Article extraction is heuristic and may miss content on unusual layouts, paywalled pages, PDFs, embedded frames or dynamically loaded pages. Text is saved as plain text; original formatting and images are not preserved. The preview displays saved text. Screenshots from the previous version are retained, but new screenshots are not captured.

No page text is sent to an AI service, and no remote favicon or preview service is used. AI classification/summaries are not implemented in this version.

## Backup and portability

- **Export backup:** downloads a versioned JSON file with every entry, categories, purpose, review dates, saved text and any legacy screenshots.
- **Import backup:** merges a version 2 JSON backup by exact normalised URL. Existing descriptions, titles and purposes win; categories are combined and the longer text capture is kept. Invalid entries reject the import before any writes. Import does not replace or delete existing entries. The current import limit is 200 MB.
- **Export all as Markdown:** downloads a single `Tab archive.md` containing all entries and captured text. Move it into an Obsidian vault, or import it using Notion's Markdown import. Each preview also offers a single-entry Markdown export. This is a file export, not live synchronisation or direct publication to Notion.

Archived entries have no count limit or expiry. Storage is still bounded by available disk space. Browser/profile removal can destroy local data, so keep exported backups outside the browser profile. Backups may contain private text from pages you chose to save.

The old `chrome.storage.local.sessions` archive migrates once into IndexedDB. HTTP/HTTPS entries and screenshots are preserved, duplicates merge, and supported legacy copies are removed only after a successful migration. Unsupported or malformed legacy records remain in browser storage until the extension is removed. Entries already discarded by the old 200-session cap cannot be recovered.

Tab Dumper was previously called Tab Tinder. The internal database name and JSON format identifier retain the old name for compatibility; renaming the extension does not migrate or reset its data.

## Visual design

The dashboard follows the supplied viscioletti.com design system: Source Sans Pro, a 17px base, blue and charcoal colours, white/light-grey surfaces, 9px controls and cards, category labels, soft shadows and 180ms hover transitions. Primary controls use the system's deeper link blue for readable white labels. Reduced-motion preferences disable hover movement.

Regular and semibold Source Sans Pro fonts are bundled locally in `assets/fonts/`, with their SIL Open Font License. The interface makes no external font requests.

## Development and checks

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

The browser check loads the real unpacked extension in a temporary Chromium profile with local test pages. It exercises loading, preview/capture, archiving, search, edits, export/import, reopening, reload persistence, review, form protection and responsive layout. It does not read or close personal browser tabs. Screenshots go to ignored `test-results/`.

Production code has no third-party dependencies. IndexedDB provides atomic archive writes; list responses omit article bodies and screenshots, and the interface renders 40 rows at a time. Search scans records locally. Imports and exports load their data into memory; very large libraries may require a future streaming export/search index.

Permissions: `tabs` lists tab metadata; `scripting` and HTTP/HTTPS host access extract text when requested; `storage` preserves settings and migrates legacy entries; `unlimitedStorage` removes the normal extension quota; `alarms` powers the reminder. Incognito tabs and internal browser pages are not listed.

Browser API references: [Opera extension APIs](https://help.opera.com/en/extensions/apis/), [script injection permissions](https://developer.chrome.com/docs/extensions/reference/api/scripting), [alarm lifecycle](https://developer.chrome.com/docs/extensions/reference/api/alarms), [extension storage](https://developer.chrome.com/docs/extensions/reference/api/storage).

## Opera release

Run `npm run test:opera` to check the installed Opera in an isolated temporary profile. Set `TEST_BROWSER_PATH` if its executable is elsewhere. Run `npm run package` to create the production-only ZIP in `dist/`. See [submission/README.md](submission/README.md) for listing assets and remaining release checks.

Source: https://github.com/feddernico/tab-dumper. See [build instructions](submission/build-instructions.txt) for setup and packaging.

Support: https://viscioletti.com/tab-dumper (the website page will be published after store approval). Until then, the assistance form is available directly at https://tally.so/r/e55RWl.
