# Notebook to Anki Bridge

A Firefox extension that captures flashcards from supported Google Notebook artifact pages and exports them to Anki.

## Version 0.3.0

This release removes the one-card test action and active-tab diagnostic popup. Clicking the extension icon opens an information popup that reads the installed version directly from the extension manifest.

The extension is no longer branded or configured specifically for Harrison. It uses generic Notebook/Anki labels and tags, and lets the user select any existing Anki deck.

## Supported source

The current extractor is an adapter for the observed Google Notebook web application RPC:

- Host: `https://notebook.google.com`
- RPC: `/_/LabsTailwindUi/data/batchexecute`
- RPC ID: `Fxmvse`
- The request must include an artifact `source-path`.

This does not imply compatibility with every product or website called NotebookLM/Notebook. Other providers and changed RPC schemas require separate adapters.

## How extraction works

- A Firefox MAIN-world content script observes matching Fetch/XHR responses.
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

## AnkiConnect

AnkiConnect is optional. Install it in Anki and keep Anki running. The extension sends notes to `http://127.0.0.1:8765`.

- The destination must be selected from the existing deck list returned by AnkiConnect.
- The selected deck is revalidated before import.
- Notes use the Anki `Basic` note type with `Front` and `Back` fields.
- Existing/non-addable notes and repeated Front fields in the current batch are skipped.
- The extension does not overwrite existing notes or create decks automatically.

## Limitations

- The extractor depends on a private/undocumented Google Notebook RPC schema and may need updates if Google changes it.
- Compatibility is currently limited to the Google Notebook web RPC described above.
- Image binary retrieval and embedding are not implemented.
- The extension does not send Notebook content to a remote server.
- Temporary Firefox add-ons are removed when Firefox is fully closed.
