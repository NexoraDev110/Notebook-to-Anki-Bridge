# Development Notes

This file is the engineering handover for Notebook to Anki Bridge. It records confirmed findings, implementation decisions, test evidence, known limitations, and the release checklist so future work does not repeat the same investigation.

## 1. Project scope

Notebook to Anki Bridge is a Firefox/Chrome extension that captures structured flashcards from supported Google Notebook pages and exports them to Anki through AnkiConnect.

Current scope:
- Capture Front/Back flashcard content from fullscreen artifacts and the embedded/right-side flashcard panel.
- Let the user select an existing Anki deck returned by AnkiConnect.
- Search/filter the loaded deck list.
- Export cards as CSV/TSV or explicitly send them to Anki.
- Preserve image alt text/placeholders. Downloading and embedding image binaries is not implemented.

The extension relies on private, undocumented Google RPC formats. Google may change them without notice.

## 2. Browser builds and repository layout

There are two separately loadable builds:
- Firefox: repository root.
- Chrome: the `chrome/` directory.

Do not load the repository root as the Chrome unpacked extension. Do not upload GitHub's automatically generated source ZIP as a Firefox AMO package because it includes the parent directory and Chrome build.

Two Windows PowerShell packaging scripts are present:
- Firefox: `scripts/package-firefox.ps1`
- Chrome: `scripts/package-chrome.ps1`

Each script reads the version from its own manifest, creates a browser-specific ZIP under `dist/`, places that build's files directly at the ZIP root, and verifies the archive entry count and root manifest. The Chrome script packages the contents of `chrome/`, not the enclosing directory.

**Important shell detail:** These are PowerShell scripts. Running ` .\scripts\package-firefox.ps1` from the Windows Command Prompt (`cmd.exe`) does not execute them as PowerShell scripts; it may open the associated editor instead. From Command Prompt, invoke them explicitly:

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-firefox.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-chrome.ps1
```

Alternatively, run the original ` .\scripts\...` commands from a PowerShell terminal. Successful execution should print the created ZIP path and file count for each browser.

## 3. Confirmed Notebook RPC findings

### 3.1 Flashcard RPC

The confirmed flashcard response uses:
- Host: `https://notebook.google.com`
- Endpoint: `/_/LabsTailwindUi/data/batchexecute`
- RPC ID: `v9rmvd`

The batchexecute response contains HTML with a `data-app-data` attribute. Its decoded JSON contains a `flashcards` array. Each card has:
- `f`: Front side
- `b`: Back side

Each side contains `flashcardContentBlock` entries. Text is stored in each text block's `content` property. Image blocks may include alt text and references.

This structure was observed in both fullscreen and embedded flashcard experiences. In the embedded test, the response contained the same `data-app-data` / `flashcards[]` / `f` / `b` / `flashcardContentBlock[]` structure.

### 3.2 Source-path difference: root cause of embedded failure

Fullscreen request:

```text
/notebook/<notebook-uuid>/artifact/<artifact-uuid>
```

Embedded/right-side panel request:

```text
/notebook/<notebook-uuid>
```

The original network filter accepted only source paths containing `/artifact/`. Therefore it missed embedded responses even though the RPC ID and payload structure were the same.

The filter was corrected to accept only these two constrained path forms:

```regex
^/notebook/[a-f0-9-]{36}(?:/artifact/[a-f0-9-]{36})?$
```

This is deliberately narrower than accepting arbitrary Notebook source paths.

### 3.3 RPCs investigated and not accepted as flashcard sources

Do not re-enable these as flashcard data sources without new response evidence:

- `Fxmvse`: observed embedded-panel state such as `currentView`, `currentCardIndex`, `activePile`, and acquisition state. It did not contain Front/Back card content.
- `ulBSjf`: observed as a small state-related response, not the structured flashcard payload.
- `HpN0Ub`: small response; not the card payload in the investigated capture.
- `ub2Bae`: response containing Notebook source metadata/listing, not flashcard content.
- `khqZz`: response containing Notebook conversation/answer content, not the flashcard payload.
- `gArtLc`: investigated but not identified as the flashcard payload.
- `rLM1Ne`: observed topic/section labels such as symptoms/triggers, not the structured flashcard payload.

Response size alone is not evidence that an RPC contains flashcards. Inspect its actual structure before changing the allowlist or parser.

## 4. Cross-origin iframe investigation

The embedded page contained a cross-origin iframe using a host under `*.scf.usercontent.goog` and a `notebooklm-apps/shim.html` path. The parent page could inspect the iframe element and URL but could not access its document because of same-origin restrictions.

The presence of this iframe did not prove that flashcard data had to be captured inside it.

The decisive evidence was that the top-level page's performance entries exposed a `v9rmvd` batchexecute Fetch request with a notebook-level source path, and that response contained the flashcard HTML/data. Therefore the fix was to broaden the validated source-path condition in the existing top-level hook, not to inject the extension into every frame.

Do not add `all_frames`, broad `*.scf.usercontent.goog` host permissions, or iframe UI injection without new evidence. These changes could create duplicate extension panels and unnecessary permissions.

## 5. Capture architecture

Firefox and Chrome maintain parallel copies of the relevant scripts.

### Network hook

Files:
- `network-hook.js`
- `chrome/network-hook.js`

Responsibilities:
- Run in the page MAIN world on `https://notebook.google.com/*`.
- Observe Fetch and XMLHttpRequest responses for the exact batchexecute endpoint on the same origin.
- Allow only RPC ID `v9rmvd`.
- Validate the notebook/artifact source-path pattern.
- Clone/read successful response bodies and relay them through `window.postMessage`.
- Do not read or relay request headers, cookies, authorization values, or request bodies.
- Enforce an 8,000,000-character response size limit.

### Isolated content script

Files:
- `content.js`
- `chrome/content.js`

Responsibilities:
- Accept only same-window, same-origin messages with the expected message source/type and RPC ID.
- Pass the response body to the parser.
- Extract the artifact UUID from source-path when present and validate the parser's artifact ID when applicable.
- Render the extension panel and card preview.
- Offer CSV/TSV export and explicit Anki import.

### RPC parser

Files:
- `rpc-parser.js`
- `chrome/rpc-parser.js`

Responsibilities include parsing batchexecute framing, decoding nested JSON, locating embedded HTML `data-app-data`, extracting structured Front/Back blocks, preserving image placeholders/alt text, and removing duplicate or incomplete cards.

Keep Firefox and Chrome copies synchronized unless a browser-specific difference is intentional and documented.

## 6. Anki deck picker and search

The extension loads the existing deck list from AnkiConnect. It does not create decks automatically.

The deck picker includes a search input:
- Search filters the already-loaded deck names as the user types.
- Matching is case-insensitive.
- The selected deck is preserved while filtering, including when it is temporarily outside the filtered results.
- Status text reports matching results and the total loaded deck count.
- Refresh reloads the deck list from AnkiConnect.

Files updated:
- `content.js`
- `chrome/content.js`

Keep the two browser implementations behaviorally equivalent.

## 7. Anki import behavior and boundaries

- AnkiConnect is optional and must be running locally for direct import.
- The extension connects to `http://127.0.0.1:8765`; localhost is also included in host permissions.
- The user must explicitly choose a destination deck and click the import action.
- The selected deck is validated again before import.
- Notes use the Anki Basic note type with Front and Back fields.
- Existing/non-addable notes and duplicate Front fields in the current batch are skipped.
- The extension does not overwrite existing notes or create destination decks automatically.
- CSV/TSV export is available independently of AnkiConnect.

## 8. Test evidence: separate real-browser tests from static checks

### Confirmed by real user browser testing
- Fullscreen flashcard extraction worked before the embedded-panel fix.
- After the source-path filter fix, the user confirmed that embedded/right-side flashcard extraction works.
- The user reported the deck search feature as working satisfactorily after it was added.
- The user built the final 0.3.6 ZIP packages using the repository packaging scripts and installed/tested the packaged builds.
- The user explicitly confirmed that both fullscreen and embedded/right-side flashcard extraction work in both packaged Chrome and Firefox builds. This is real-browser smoke-test evidence for those two capture modes in both browsers.

### Static/mock checks previously performed
- JavaScript syntax checks were run on the six main JS files involved in capture/parsing/content handling.
- A mock parser test extracted two unique cards, removed a duplicate, retained image placeholder/alt text, and rejected a mismatched artifact ID.
- The source-path filter was checked against embedded and fullscreen examples and an unrelated path.
- GitHub files were fetched again after edits to verify that intended changes were present.

Static/mock checks are not substitutes for browser testing. Never describe a syntax or mock test as a real-browser test.

### Not yet established
- Broad compatibility across many notebooks, accounts, locales, and Google UI versions.
- Stability of Google's private RPC schema over time.
- Automated end-to-end browser coverage for both Firefox and Chrome.
- Image binary retrieval/embedding.
- Full functional regression coverage for deck loading/search/selection retention, refresh, CSV/TSV export, and AnkiConnect import on the packaged builds.

## 9. Historical implementation changes

1. Capture was narrowed to the confirmed flashcard RPC `v9rmvd`; state-only RPCs were not treated as card data.
2. The network hook was changed to accept both fullscreen artifact source paths and embedded notebook source paths while retaining strict endpoint, origin, RPC, and path validation.
3. The same source-path fix was applied to Firefox and Chrome network hooks.
4. A searchable existing-deck picker was added to both Firefox and Chrome content scripts.
5. The selected deck is retained while search results are filtered.
6. README documentation was corrected for the `v9rmvd` RPC, both source-path forms, confirmed embedded support, deck search, and browser-specific package commands.
7. Both browser packaging scripts were added/documented, with ZIP-root manifest and file-count checks.
8. The Chrome packaging script was corrected to source LICENSE from the repository root while still placing it at the ZIP root. The script had incorrectly searched for chrome/LICENSE.
9. The privacy policy was corrected to describe `v9rmvd` as the sole observed flashcard response and to identify `Fxmvse` / `ulBSjf` as non-payload state RPCs.
10. A GitHub Actions workflow was added at `.github/workflows/release.yml`. Pushing a `v*` tag triggers Windows packaging, checks that the tag matches both manifest versions, and publishes the two ZIP files as GitHub Release assets.

## 10. Version and release status

Both manifests are aligned to version `0.3.6`:
- Root Firefox manifest: `0.3.6`
- `chrome/manifest.json`: `0.3.6`

README and privacy documentation now describe the confirmed capture behavior. The current documented release candidate is `v0.3.6`.

Both final browser packages were successfully built from the updated repository at version 0.3.6:
- notebook-to-anki-bridge-firefox-0.3.6.zip (10 files; packaging script verification passed).
- notebook-to-anki-bridge-chrome-0.3.6.zip (10 files; packaging script verification passed).
- The Chrome archive entry listing was manually inspected and contained exactly the 10 expected root-level entries, including manifest.json and LICENSE, with no nested chrome/ directory.
- The user confirmed packaged-build fullscreen and embedded capture in both Chrome and Firefox.

GitHub Release `v0.3.6` was successfully published by the tag-triggered GitHub Actions workflow on 2026-11-23. The workflow completed with conclusion `success` for tag `v0.3.6` at commit `17a75579f42d115da5ac9bc7dba00bfd39ece792`. Both packaging steps and the publish step completed successfully. The published release is available at https://github.com/NexoraDev110/Notebook-to-Anki-Bridge/releases/tag/v0.3.6 and contains these uploaded assets:\n- `notebook-to-anki-bridge-chrome-0.3.6.zip` (13,958 bytes; SHA-256 `550a10f5b5a403788c32bcb2808c2468a91bc463040e8ada69ac36926de43e7b`).\n- `notebook-to-anki-bridge-firefox-0.3.6.zip` (13,876 bytes; SHA-256 `248d443e349fd0547631a990d690c65b92465030ad67d7482ec3598ebcecbafb`).

## 11. Release checklist

- [x] Update README RPC descriptions to identify `v9rmvd` and both supported source-path forms.
- [x] Remove outdated statements that `Fxmvse` / `ulBSjf` are the flashcard data RPCs.
- [x] Update README embedded support status to reflect user-confirmed implementation.
- [x] Align Firefox and Chrome manifest versions to `0.3.6`.
- [x] Add a Chrome ZIP packaging script and document both browser package commands.
- [x] Correct privacy policy RPC descriptions.
- [x] Add tag-triggered GitHub Actions packaging/release workflow.
- [x] Execute both packaging scripts and build the Firefox and Chrome 0.3.6 ZIP files (10 files each).
- [x] Verify ZIP root manifest and file count using both packaging scripts.
- [x] Manually inspect the Chrome ZIP entry list; all 10 expected files are at the archive root, including LICENSE.
- [x] Install/test the packaged builds in both Chrome and Firefox.
- [x] Real-browser smoke test fullscreen capture in Firefox and Chrome.
- [x] Real-browser smoke test embedded-panel capture in Firefox and Chrome.
- [ ] Test deck loading, search, selection retention, refresh, CSV/TSV export, and AnkiConnect import on the packaged builds.
- [ ] Create a GitHub Release (proposed tag: v0.3.6) and attach the correct browser packages.
- [ ] Verify the release page, tag, and downloadable assets after publication.

## 12. Safe change workflow

For future repository work:

1. Identify the exact source of the behavior before editing. For Google RPC changes, capture the request URL and response shape first.
2. Fetch the latest version of every target file from GitHub main immediately before editing.
3. Apply the smallest change that addresses the verified cause.
4. Keep Firefox and Chrome implementations aligned.
5. After each update, fetch the file again and verify the saved content.
6. Run syntax checks and focused parser/filter tests.
7. Clearly label tests as static/mock or real-browser.
8. Do not change manifests, frame permissions, or parser architecture based only on speculation.
9. Do not publish a release until both browser packages have been built and inspected.
10. Never claim a release, package, or browser test exists unless it has actually been created or performed.

---

Last updated: 2026-11-23
