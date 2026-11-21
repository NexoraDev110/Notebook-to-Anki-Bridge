# Harrison Anki Bridge

Firefox extension for exporting Google Notebook flashcards to Anki.

## Version 0.2.3 (experimental)

This version replaces DOM text heuristics with a dedicated adapter for the observed `Fxmvse` RPC response from `https://notebook.google.com`.

### How extraction works

- A Firefox MAIN-world content script observes Fetch/XHR responses only when the request URL targets `/_/LabsTailwindUi/data/batchexecute`, includes `rpcids=Fxmvse`, and has an artifact source path.
- It relays the response body to the isolated extension content script. It does not read or relay request headers, cookies, authorization values, or request bodies.
- The parser unwraps the nested JSON serialization, locates `latestCompletion.cards`, and extracts text blocks from each card's `f` and `b` fields.
- Duplicate and incomplete cards are excluded.
- The panel reports the number of extracted cards, source card records, and observed `lastShownOrder` index range. Gaps in this index list are diagnostic metadata only: they must not be interpreted as missing extracted cards or used to declare the total card count unconfirmed.
- Image blocks are represented in-place by their alt text. The image assets themselves are not embedded in exports yet.

### Install (Firefox)

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on** and choose `manifest.json`.
3. Open or reload the target Notebook artifact page.
4. Open the floating **HAB** panel. It should report the number of structured cards captured after the flashcard RPC response arrives.
5. Export CSV/TSV, test one note in Anki, or confirm a full-batch AnkiConnect import.

Firefox 128 or later is required for the MAIN-world content script.

## AnkiConnect

AnkiConnect is optional. Install it in Anki and keep Anki running. The extension sends notes to `http://127.0.0.1:8765`, using the `Harrison::Inbox` deck by default.

## Limitations and verification status

- This is an experimental adapter for the observed `Fxmvse` response shape. Notebook may change its private RPC schema without notice.
- The captured response shape has been inspected, but end-to-end browser capture and Anki import must still be tested on the user's Firefox installation.
- Image binary retrieval and embedding are not implemented.
- AnkiConnect import validates the target deck and Basic note type, checks candidates with `canAddNotes`, skips repeated Front fields within the current batch, and uses `addNotes` for batch insertion.
- The panel offers a one-note test action and a separately confirmed full-batch action. Existing or otherwise non-addable notes are reported as skipped; no automatic overwrite is performed.
- The extension does not send Notebook data to a remote server.
- Temporary Firefox add-ons are removed when Firefox is fully closed.
