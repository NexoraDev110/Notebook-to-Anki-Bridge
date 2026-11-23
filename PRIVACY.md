# Privacy Policy

**Product:** Notebook to Anki Bridge  
**Developer:** NexoraDev110  
**Effective date:** 23 November 2026

## Summary

Notebook to Anki Bridge processes supported flashcard response data locally in your browser so that you can preview or export flashcards or, when you explicitly choose to do so, send them to your own Anki installation through AnkiConnect.

The extension does not operate a developer-controlled server, does not create an account, and does not send Notebook content to the developer.

## Data processed

When you open a supported Google Notebook page, the extension observes only the following same-origin application RPC responses used by its flashcard extractor:

- `v9rmvd`, the confirmed structured flashcard response used by both fullscreen artifact pages and the embedded/right-side flashcard panel.

The matching response body and request URL are temporarily processed in browser memory to extract flashcard Front and Back text. This capture happens automatically when a matching response is observed on a supported page; it does not require the user to click the export or Anki buttons.

The extension validates the exact batchexecute endpoint, the `v9rmvd` RPC identifier, and the expected Notebook source-path forms before relaying a response to the isolated content script:

- Fullscreen artifact: `/notebook/<notebook-uuid>/artifact/<artifact-uuid>`
- Embedded/right-side panel: `/notebook/<notebook-uuid>`

The extension does not read or transmit request headers, cookies, authorization values, or request bodies. It does not intentionally collect browsing history, unrelated page content, passwords, payment details, or personal profile information.

Other observed RPCs such as `Fxmvse` and `ulBSjf` are UI/state responses in the investigated flows and are not used as flashcard content sources.

## Where data goes

- **Browser:** Matching response data and extracted cards are processed locally in the browser. The extension does not send this data to a server operated by the developer.
- **Anki:** If you select a destination deck and click **Send all cards to Anki**, the selected flashcards are sent to the AnkiConnect service running on your own computer at `127.0.0.1:8765` (or `localhost:8765`).
- **CSV/TSV export:** If you choose an export button, the browser creates a local file download.
- **Google Notebook:** The extension observes matching responses from the Notebook page. The Notebook service itself remains subject to Google's own privacy terms.

## Storage and retention

The extension does not maintain a remote database, analytics store, or developer-side copy of your flashcards. Extracted cards are held in the active page's memory while that page is open. CSV/TSV files and imported Anki notes are stored wherever the browser and your local Anki installation normally store them.

## Sharing and sale

The developer does not receive, sell, rent, or share flashcard content or browsing data. No advertising, analytics, or tracking service is integrated into the extension.

## Permissions

Both browser builds request narrowly scoped access only to:

- `https://notebook.google.com/*` to observe the supported flashcard RPC responses.
- `http://127.0.0.1:8765/*` and `http://localhost:8765/*` to communicate with a local AnkiConnect installation when the user requests an Anki operation.

The Firefox build declares that it collects no data through Firefox's add-on data collection declaration. The Chrome build uses a Manifest V3 service worker for AnkiConnect requests. Neither build requests access to all websites, browser history, cookies, or tabs.

## Changes to this policy

If the extension's data practices change, this policy will be updated before or alongside the relevant release.

## Contact

For privacy questions or requests, use the contact method listed on the [GitHub project page](https://github.com/NexoraDev110/Notebook-to-Anki-Bridge).
