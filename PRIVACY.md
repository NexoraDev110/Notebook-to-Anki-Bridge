# Privacy Policy

**Product:** Notebook to Anki Bridge  
**Developer:** NexoraDev110  
**Effective date:** 21 November 2026

## Summary

Notebook to Anki Bridge processes supported flashcard response data locally in your browser so that you can export flashcards or, when you explicitly choose to do so, send them to your own Anki installation through AnkiConnect.

The extension does not operate a developer-controlled server, does not create an account, and does not send Notebook content to the developer.

## Data processed

When you open a supported Google Notebook page, the extension observes only the following same-origin application RPC responses used by its flashcard extractor:

- `Fxmvse` for the observed fullscreen artifact view (only when the request includes an artifact source path).
- `ulBSjf` for the observed embedded/right-side flashcard panel.

The extension temporarily processes the matching response body and request URL in browser memory to extract flashcard Front and Back text. It does not read or transmit request headers, cookies, authorization values, or request bodies.

The extension does not intentionally collect browsing history, unrelated page content, passwords, payment details, or personal profile information.

## Where data goes

- **Browser:** Matching response data and extracted cards are processed locally in the browser. The extension does not send this data to a server operated by the developer.
- **Anki:** If you select a destination deck and click **Send all cards to Anki**, the selected flashcards are sent to the AnkiConnect service running on your own computer at `127.0.0.1:8765` (or `localhost:8765`). This is the user's local Anki integration.
- **CSV/TSV export:** If you choose an export button, the browser creates a local file download.
- **Google Notebook:** The extension observes responses from the Notebook page. The Notebook service itself remains subject to Google's own privacy terms.

## Storage and retention

The extension does not maintain a remote database, analytics store, or developer-side copy of your flashcards. Extracted cards are held in the active page's memory while that page is open. CSV/TSV files and imported Anki notes are stored wherever the browser and your local Anki installation normally store them.

## Sharing and sale

The developer does not receive, sell, rent, or share flashcard content or browsing data. No advertising, analytics, or tracking service is integrated into the extension.

## Permissions

The Chrome build requests access only to:

- `https://notebook.google.com/*` to observe the supported flashcard RPC responses.
- `http://127.0.0.1:8765/*` and `http://localhost:8765/*` to communicate with a local AnkiConnect installation when the user requests an Anki operation.

The extension uses a Manifest V3 service worker for AnkiConnect requests. It does not request access to all websites, browser history, cookies, or tabs.

## Changes to this policy

If the extension's data practices change, this policy will be updated before or alongside the relevant release.

## Contact

For privacy questions or requests, use the contact method listed on the [GitHub project page](https://github.com/NexoraDev110/Notebook-to-Anki-Bridge).
