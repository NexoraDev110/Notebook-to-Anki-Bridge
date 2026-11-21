# Harrison Anki Bridge

Firefox extension for exporting NotebookLM study material to Anki.

## Version 0.1.2

**Corrected target host:** `https://notebook.google.com/*`

This release targets the host specified for this installation. It does not target `notebooklm.google.com`.

## Install (Firefox)

1. Download or clone this repository.
2. Open `about:debugging#/runtime/this-firefox`.
3. Select **Load Temporary Add-on** and choose `manifest.json`.
4. Open or reload `https://notebook.google.com/`.
5. Open the extension popup and select **Check active tab**.

## Diagnostic

The popup reports:
- active tab URL and whether it matches the configured host;
- whether the content script responds to a ping;
- the last content-script startup status.

If the tab does not match, check that the address bar shows `https://notebook.google.com/`. If the content script does not respond, reload the tab after installing the extension.

## Export

The content script adds a floating **HAB** control. The initial exporter captures visible question/answer-like content heuristically and supports CSV/TSV download. DOM extraction is inherently sensitive to Notebook's changing page structure, so inspect exported cards before importing them.

## AnkiConnect

AnkiConnect is optional. Install it in Anki and keep Anki running. The extension sends notes to `http://127.0.0.1:8765`. The extension does not send data to a remote server.

## Limitations

- This is an early MVP, not a verified integration with every Notebook page layout.
- Firefox temporary add-ons are removed when Firefox is fully closed.
- The target host is explicitly configured as `notebook.google.com`.
