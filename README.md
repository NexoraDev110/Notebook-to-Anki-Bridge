# Notebook to Anki Bridge

A cross-browser browser extension that captures structured flashcards from supported Google Notebook pages and exports them to Anki.

## Current builds

- **Firefox:** 0.3.4 (Firefox-specific build at the repository root; Firefox 128 or later).
- **Chrome:** 0.3.5 (Chrome-specific build in the `chrome/` directory; Chrome 111 or later).

The Firefox and Chrome manifests are intentionally separate. Do not load the repository root as the Chrome extension, and do not use the repository's full source ZIP as an AMO upload package.

## Supported source

The extractor adapts to two observed Google Notebook web application RPCs:

- Host: `https://notebook.google.com`
- Endpoint: `/_/LabsTailwindUi/data/batchexecute`
- Fullscreen artifact RPC: `Fxmvse` (requires an artifact `source-path`).
- Embedded/right-panel RPC: `ulBSjf` (observed completion payload containing `latestCompletion.cards`).

Both adapters use the same structured Front/Back parser. The embedded-panel adapter is based on an observed response schema and remains experimental until it has been verified across a broader set of notebooks and navigation/reload scenarios.

This does not imply compatibility with every product or website called NotebookLM/Notebook. Google may change these undocumented RPC formats without notice.

## How extraction works

- A browser MAIN-world content script observes only the two allowlisted Fetch/XHR RPCs described above.
- It relays the matching response body and request URL to the isolated extension content script.
- It does not read or relay request headers, cookies, authorization values, or request bodies.
- The parser unwraps nested JSON and extracts text blocks from flashcard Front and Back fields.
- Duplicate and incomplete cards are excluded.
- Image blocks are represented by their alt text; image files are not downloaded or embedded.

## Install on Firefox

For temporary local testing:

1. Extract the repository.
2. Open `about:debugging#/runtime/this-firefox`.
3. Select **Load Temporary Add-on** and choose the root `manifest.json`.
4. Open or reload a supported Google Notebook artifact page.
5. Open the floating **NAB** panel.
6. Select an existing Anki deck, then export CSV/TSV or send the captured cards to Anki.

Firefox 128 or later is required for MAIN-world content scripts.

### Build a Firefox AMO package

Do not upload GitHub's automatically generated repository ZIP to AMO. It contains a parent directory and the Chrome build.

On Windows PowerShell, run:

```powershell
.\scripts\package-firefox.ps1
```

The script creates a Firefox-only ZIP in `dist/`, with `manifest.json` directly at the archive root. Upload that generated ZIP to AMO.

## Install on Chrome

1. Download and extract the repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the repository's `chrome` folder (not the repository root).
5. Open or reload a supported Google Notebook artifact page.
6. Open the floating **NAB** panel, select an existing Anki deck, then export CSV/TSV or send the captured cards to Anki.

Chrome 111 or later is required for MAIN-world content scripts. The Chrome build uses a Manifest V3 service worker and the Chrome Extensions API.

## AnkiConnect

AnkiConnect is optional. Install it in Anki and keep Anki running. The extension communicates with the local AnkiConnect service at `http://127.0.0.1:8765`.

- The destination must be selected from the existing deck list returned by AnkiConnect.
- The selected deck is revalidated before import.
- Notes use the Anki `Basic` note type with `Front` and `Back` fields.
- Existing/non-addable notes and repeated Front fields in the current batch are skipped.
- The extension does not overwrite existing notes or create decks automatically.

## Privacy

See [PRIVACY.md](PRIVACY.md). Matching flashcard RPC responses are processed locally in the browser. The extension does not send Notebook content to a developer-operated server. Anki imports occur only after the user explicitly clicks the import action and are sent to the user's local AnkiConnect service.

## Known limitations

- The extractor depends on private/undocumented Google Notebook RPC schemas and may need updates if Google changes them.
- Compatibility is limited to the two observed RPCs described above; embedded-panel support is experimental.
- Image binary retrieval and embedding are not implemented.
- AnkiConnect must be installed and running locally for direct Anki import.
- Temporary Firefox add-ons are removed when Firefox is fully closed. AMO distribution is the normal installation path once the listing is published.
