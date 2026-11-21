# Notebook to Anki Bridge

A cross-browser extension for Firefox and Chrome that captures flashcards from supported Google Notebook artifact pages and exports them to Anki.

## Version 0.3.3

This release adds a Chrome Manifest V3 build in the `chrome/` directory. The Chrome build uses a service worker and the Chrome Extensions API; the Firefox build remains at the repository root.

## Previous version 0.3.2

This release clears the missing-destination-deck warning as soon as an existing deck is selected.

## Previous version 0.3.1

This release highlights the missing-destination-deck warning in red. It also removes the one-card test action and active-tab diagnostic popup. Clicking the extension icon opens an information popup that reads the installed version directly from the extension manifest.

The extension uses generic Notebook/Anki labels and tags, and lets the user select any existing Anki deck.

> **Reinstall note:** This release uses a new generic Firefox extension ID. If you previously loaded an earlier build temporarily, remove that old temporary add-on and load this release again from `manifest.json`.

## Supported source

The current extractor is an adapter for the observed Google Notebook web application RPC:

- Host: `https://notebook.google.com`
- RPC: `/_/LabsTailwindUi/data/batchexecute`
- Fullscreen artifact RPC: `Fxmvse` (requires an artifact `source-path`).
- Embedded/right-panel RPC: `ulBSjf` (observed completion payload containing `latestCompletion.cards`).

Both adapters use the same structured Front/Back parser. The embedded-panel adapter is based on an observed response schema and should be treated as experimental until verified against multiple notebooks and reload/navigation scenarios.

This does not imply compatibility with every product or website called NotebookLM/Notebook. Other providers and changed RPC schemas require separate adapters.

## How extraction works

- A browser MAIN-world content script observes only the two allowlisted Fetch/XHR RPCs described above.
- It relays only the response body and request URL to the isolated extension content script. It does not read or relay request headers, cookies, authorization values, or request bodies.
- The parser unwraps nested JSON and extracts text blocks from flashcard Front and Back fields.
- Duplicate and incomplete cards are excluded.
- Image blocks are represented by their alt text; image files are not downloaded or embedded.

## Install (Firefox)

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on** and choose `manifest.json`.
3. Open or reload a supported Google Notebook artifact page.
4. Open the floating **NAB** panel on the page.
5. Select an existing Anki deck, then export CSV/TSV or send all captured cards to Anki.

Firefox 128 or later is required for MAIN-world content scripts.

## Install (Chrome)

1. Download the repository ZIP from GitHub and extract it.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the repository's `chrome` folder (not the repository root).
5. Open or reload a supported Google Notebook artifact page.
6. Open the floating **NAB** panel, select an existing Anki deck, then export CSV/TSV or send all captured cards to Anki.

Chrome 111 or later is required for MAIN-world content scripts. The Chrome build uses a Manifest V3 service worker and the Chrome Extensions API.

## Privacy

See [PRIVACY.md](PRIVACY.md) for the extension's data handling and privacy policy.

## AnkiConnect

AnkiConnect is optional. Install it in Anki and keep Anki running. The extension sends notes to `http://127.0.0.1:8765`.

- The destination must be selected from the existing deck list returned by AnkiConnect.
- The selected deck is revalidated before import.
- Notes use the Anki `Basic` note type with `Front` and `Back` fields.
- Existing/non-addable notes and repeated Front fields in the current batch are skipped.
- The extension does not overwrite existing notes or create decks automatically.

## Limitations

- The extractor depends on a private/undocumented Google Notebook RPC schema and may need updates if Google changes it.
- Compatibility is currently limited to the two observed Google Notebook web RPCs described above; embedded-panel support is experimental.
- Image binary retrieval and embedding are not implemented.
- The extension does not send Notebook content to a remote server.
- Temporary Firefox add-ons are removed when Firefox is fully closed.
