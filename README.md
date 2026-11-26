# Notebook to Anki Bridge

A cross-browser browser extension that captures structured flashcards from supported Google Notebook pages and exports them to Anki.

## Current builds

- **Firefox:** 0.3.7 (Firefox-specific build at the repository root; Firefox 128 or later).
- **Chrome:** 0.3.7 (Chrome-specific build in the `chrome/` directory; Chrome 111 or later).

## Branding

Version 0.3.7 adds a professional logo across both browser builds. Icon assets (`icons/logo-{16,32,48,96,128}.png`) are included in the Firefox build at the repository root and in the Chrome build under `chrome/icons/`. The same design is used for both browsers. No text, letters, or product name are included in the icon.

The Firefox and Chrome manifests are intentionally separate. Do not load the repository root as the Chrome extension, and do not use the repository's full source ZIP as a Firefox AMO upload package.

## Supported source

The extractor supports the observed Google Notebook flashcard response in both fullscreen artifact pages and the embedded/right-side flashcard panel.

- Host: `https://notebook.google.com`
- Endpoint: `/_/LabsTailwindUi/data/batchexecute`
- Flashcard RPC: `v9rmvd`

The request's `source-path` differs by view:

- Fullscreen artifact: `/notebook/<notebook-uuid>/artifact/<artifact-uuid>`
- Embedded/right-side panel: `/notebook/<notebook-uuid>`

Both views return HTML containing a `data-app-data` attribute. Its decoded data includes a `flashcards` array with Front (`f`) and Back (`b`) content blocks. The parser extracts text blocks and represents image blocks using available alt text/placeholders.

Other observed RPCs such as `Fxmvse` and `ulBSjf` provide UI/state information in the investigated flows; they are not treated as the structured flashcard payload.

This does not imply compatibility with every product or website called NotebookLM/Notebook. Google may change these undocumented RPC formats without notice.

## How extraction works

- A browser MAIN-world content script observes Fetch/XHR responses for the exact batchexecute endpoint and the allowlisted `v9rmvd` RPC.
- It accepts only the expected Notebook source-path patterns for fullscreen and embedded views.
- It relays the matching response body, request URL, and a bounded request snapshot to the isolated extension content script. Fetch `Request` bodies are read from a clone, leaving the original page request untouched.
- The request snapshot contains the POST body and only the allowlisted headers needed for a possible refresh (`content-type`, `accept`, `x-goog-authuser`, `x-same-domain`, and `x-user-agent`). Cookies and authorization headers are not read by the extension.
- The parser unwraps nested JSON and extracts text blocks from flashcard Front and Back fields.
- Duplicate cards are skipped; incomplete non-empty datasets are rejected rather than partially replacing the current dataset.
- Image blocks are represented by their alt text; image files are not downloaded or embedded.

## Refresh captured flashcards

The floating panel includes **Grab latest**. After the initial capture, use it to request the current flashcard payload again from the same NotebookLM artifact. The extension replays the captured `v9rmvd` POST request using its bounded request body and allowlisted headers, with the browser session credentials, and accepts only the exact HTTPS NotebookLM batchexecute endpoint.

A successful Grab replaces the entire in-memory dataset and its extraction metadata. It does not append cards and it never changes or deletes anything in Anki. A valid empty flashcard array is accepted as a zero-card dataset. If the request, response validation, or parsing fails, the previous dataset remains intact. Grab is disabled until a suitable original POST request has been captured.

Google may invalidate transient request tokens or change its undocumented RPC behavior. If Grab fails, reload the NotebookLM artifact page to capture a fresh request. The refresh flow must be tested against a live NotebookLM page before this branch is considered release-ready.

## Install on Firefox

For temporary local testing:

1. Extract the repository.
2. Open `about:debugging#/runtime/this-firefox`.
3. Select **Load Temporary Add-on** and choose the root `manifest.json`.
4. Open or reload a supported Google Notebook page with flashcards.
5. Open the floating **NAB** panel.
6. Select an existing Anki deck, then export CSV/TSV or send the captured cards to Anki.

Firefox 128 or later is required for MAIN-world content scripts.

### Build a Firefox AMO package

Do not upload GitHub's automatically generated repository ZIP to AMO. It contains a parent directory and the Chrome build.

On Windows PowerShell, run:

```powershell
.\scripts\package-firefox.ps1
```

The script creates a Firefox-only ZIP in `dist/`, with `manifest.json` directly at the archive root. Inspect and test the generated package before submitting it to AMO.

## Install on Chrome

1. Download and extract the repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the repository's `chrome` folder (not the repository root).
5. Open or reload a supported Google Notebook page with flashcards.
6. Open the floating **NAB** panel, select an existing Anki deck, then export CSV/TSV or send the captured cards to Anki.

Chrome 111 or later is required for MAIN-world content scripts. The Chrome build uses a Manifest V3 service worker and the Chrome Extensions API.

### Build a Chrome ZIP package

On Windows PowerShell, run:

```powershell
.\scripts\package-chrome.ps1
```

The script creates a Chrome-only ZIP in `dist/`, with the contents of the `chrome/` build at the archive root and `manifest.json` directly at the ZIP root. Inspect and test the generated package before distribution.

## AnkiConnect

AnkiConnect is optional. Install it in Anki and keep Anki running. The extension communicates with the local AnkiConnect service at `http://127.0.0.1:8765`.

- The destination must be selected from the existing deck list returned by AnkiConnect.
- The deck picker includes a case-insensitive search field that filters the loaded deck list.
- The selected deck is retained while filtering, even when it does not match the current search.
- The selected deck is revalidated before import.
- Notes use the Anki `Basic` note type with `Front` and `Back` fields.
- Existing/non-addable notes and repeated Front fields in the current batch are skipped.
- The extension does not overwrite existing notes or create decks automatically.

## Privacy

See [PRIVACY.md](PRIVACY.md). Matching flashcard RPC responses are processed locally in the browser. The extension does not send Notebook content to a developer-operated server. Anki imports occur only after the user explicitly clicks the import action and are sent to the user's local AnkiConnect service.

## Known limitations

- The extractor depends on private/undocumented Google Notebook RPC schemas and may need updates if Google changes them.
- Fullscreen and embedded/right-side capture have both been confirmed in user browser testing, but compatibility across all notebooks, accounts, locales, and future Google UI versions is not guaranteed.
- Image binary retrieval and embedding are not implemented; available image alt text/placeholders are retained.
- AnkiConnect must be installed and running locally for direct Anki import.
- Temporary Firefox add-ons are removed when Firefox is fully closed. AMO distribution is the normal installation path once the listing is published.
- Packaged Firefox and Chrome release ZIPs must be built and smoke-tested separately; a successful unpacked development test is not a substitute for package validation.
