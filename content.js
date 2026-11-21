"use strict";

(() => {
  const VERSION = "0.2.4";
  const PREFIX = "[Harrison Anki Bridge]";
  const status = {
    loaded: true, version: VERSION, host: location.host,
    href: location.href, timestamp: new Date().toISOString()
  };

  browser.storage.local.set({ habLastContentStatus: status }).catch(() => {});
  console.info(PREFIX, "content script loaded", status);

  let cards = [];
  let artifactId = "";
  let imageCount = 0;
  let extractionMeta = null;
  let captureError = "";

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === "HAB_PING") {
      return Promise.resolve({ ok: true, version: VERSION, host: location.host });
    }
    return undefined;
  });

  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const csvCell = value => '"' + String(value || "").replace(/"/g, '""') + '"';

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderStatus() {
    const count = document.querySelector("#hab-count");
    const preview = document.querySelector("#hab-preview");
    const enabled = cards.length > 0;
    for (const selector of ["#hab-csv", "#hab-tsv", "#hab-anki-test", "#hab-anki-all"]) {
      const button = document.querySelector(selector);
      if (button) button.disabled = !enabled;
    }
    if (count) {
      count.textContent = enabled
        ? cards.length + " structured cards captured" +
          (extractionMeta?.rawCardRecords
            ? " · " + extractionMeta.rawCardRecords + " source card records"
            : "") +
          (extractionMeta?.orderIndexCount
            ? " · display order: " + extractionMeta.orderIndexCount + " indices (" +
              extractionMeta.orderIndexMin + "–" + extractionMeta.orderIndexMax +
              (extractionMeta.orderIndexGaps?.length
                ? "; " + extractionMeta.orderIndexGaps.length + " gaps"
                : "") + ")"
            : "") +
          (extractionMeta?.duplicateCount
            ? " · " + extractionMeta.duplicateCount + " duplicate records skipped"
            : "") +
          (imageCount ? " · " + imageCount + " image references (alt text only)" : "") +
          (artifactId ? " · Artifact " + artifactId : "")
        : captureError || "Waiting for the Notebook flashcards RPC response. Reload the artifact page if needed.";
    }
    if (preview) {
      preview.textContent = cards.slice(0, 3).map((c, i) =>
        (i + 1) + ". Q: " + c.front + "\nA: " + c.back
      ).join("\n\n");
    }
  }

  function capture(raw, requestUrl) {
    try {
      const url = new URL(requestUrl, location.href);
      const sourcePath = url.searchParams.get("source-path") || "";
      const match = sourcePath.match(/\/artifact\/([a-f0-9-]{36})/i);
      const requestedId = match ? match[1] : "";
      const result = window.HABRpcParser.parseResponse(raw, requestedId);
      if (requestedId && result.artifactId && requestedId !== result.artifactId) {
        throw new Error("Artifact ID mismatch.");
      }
      cards = result.cards.map(card => ({
        front: card.front,
        back: card.back,
        tags: ["Harrison", "Notebook"]
      }));
      artifactId = requestedId;
      imageCount = result.imageCount;
      extractionMeta = {
        rawCardRecords: result.rawCardRecords || 0,
        duplicateCount: result.duplicateCount || 0,
        orderIndexCount: result.orderIndexCount || 0,
        orderIndexMin: result.orderIndexMin,
        orderIndexMax: result.orderIndexMax,
        orderIndexGaps: result.orderIndexGaps || []
      };
      captureError = "";
      renderStatus();
      console.info(PREFIX, "captured structured cards", {
        count: cards.length, artifactId, imageCount
      });
    } catch (error) {
      captureError = "RPC detected, but parsing failed: " + clean(error.message || error);
      renderStatus();
      console.warn(PREFIX, captureError);
    }
  }

  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.source !== "HARRISON_ANKI_BRIDGE" ||
        data.type !== "FXMVSE_RESPONSE" || typeof data.responseText !== "string") return;
    capture(data.responseText, data.requestUrl || location.href);
  });

  function ensureUI() {
    if (document.getElementById("hab-root") || !document.documentElement) return;
    const root = document.createElement("div");
    root.id = "hab-root";
    root.innerHTML = `
      <button id="hab-toggle" type="button" title="Harrison Anki Bridge">HAB</button>
      <section id="hab-panel" hidden>
        <header><strong>Harrison Anki Bridge 0.2.4</strong><button id="hab-close" type="button">×</button></header>
        <p id="hab-count">Waiting for the Notebook flashcards RPC response.</p>
        <pre id="hab-preview"></pre>
        <div class="hab-deck-picker">
          <label for="hab-deck">Anki destination deck</label>
          <div class="hab-deck-row">
            <select id="hab-deck" disabled>
              <option value="">Load decks from Anki…</option>
            </select>
            <button id="hab-deck-refresh" type="button">↻</button>
          </div>
          <small id="hab-deck-status">Connect to AnkiConnect to load your existing decks.</small>
        </div>
        <div class="hab-actions">
          <button id="hab-csv" type="button" disabled>Export CSV</button>
          <button id="hab-tsv" type="button" disabled>Export TSV</button>
          <button id="hab-anki-test" type="button" disabled>Test first card in Anki</button>
          <button id="hab-anki-all" type="button" disabled>Send all cards to Anki</button>
        </div>
        <small>Structured RPC extraction. Images are currently represented by their alt text, not embedded.</small>
      </section>`;
    document.documentElement.appendChild(root);
    const panel = root.querySelector("#hab-panel");
    const deckSelect = root.querySelector("#hab-deck");
    const deckStatus = root.querySelector("#hab-deck-status");

    async function loadDecks() {
      const refreshButton = root.querySelector("#hab-deck-refresh");
      refreshButton.disabled = true;
      deckSelect.disabled = true;
      deckStatus.textContent = "Loading existing decks from Anki…";
      try {
        const response = await browser.runtime.sendMessage({ type: "HAB_ANKI_GET_DECKS" });
        if (!response || !response.ok || !Array.isArray(response.decks)) {
          throw new Error(response?.error || "AnkiConnect returned an invalid deck list.");
        }
        const previous = deckSelect.value;
        deckSelect.replaceChildren();
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select destination deck…";
        deckSelect.appendChild(placeholder);
        for (const name of response.decks) {
          const option = document.createElement("option");
          option.value = name;
          option.textContent = name;
          deckSelect.appendChild(option);
        }
        if (response.decks.includes(previous)) deckSelect.value = previous;
        else if (response.decks.includes("Harrison::Inbox")) deckSelect.value = "Harrison::Inbox";
        deckSelect.disabled = response.decks.length === 0;
        deckStatus.textContent = response.decks.length
          ? response.decks.length + " existing deck(s) loaded. No deck will be created automatically."
          : "No decks were returned by AnkiConnect.";
      } catch (error) {
        deckSelect.replaceChildren();
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Could not load decks";
        deckSelect.appendChild(option);
        deckStatus.textContent = "AnkiConnect error: " + clean(error.message || error);
      } finally {
        refreshButton.disabled = false;
      }
    }

    root.querySelector("#hab-toggle").addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      renderStatus();
      if (!panel.hidden && !deckSelect.options.length) loadDecks();
    });
    root.querySelector("#hab-deck-refresh").addEventListener("click", loadDecks);
    root.querySelector("#hab-close").addEventListener("click", () => { panel.hidden = true; });
    root.querySelector("#hab-csv").addEventListener("click", () => {
      const rows = [["Front", "Back"], ...cards.map(c => [c.front, c.back])];
      downloadText("harrison-anki-bridge.csv",
        rows.map(row => row.map(csvCell).join(",")).join("\r\n"), "text/csv");
    });
    root.querySelector("#hab-tsv").addEventListener("click", () => {
      const rows = [["Front", "Back"], ...cards.map(c => [c.front, c.back])];
      downloadText("harrison-anki-bridge.tsv",
        rows.map(row => row.map(v => String(v || "").replace(/[\t\r\n]+/g, " ")).join("\t")).join("\r\n"),
        "text/tab-separated-values");
    });
    async function sendToAnki(testOnly) {
      const valid = cards.filter(c => clean(c.front) && clean(c.back));
      const selected = testOnly ? valid.slice(0, 1) : valid;
      if (!selected.length) return;
      if (!testOnly && !window.confirm("Send " + selected.length + " cards to Anki? Existing notes and repeated Front fields will be skipped.")) return;

      const deckName = deckSelect.value;
      if (!deckName) {
        deckStatus.textContent = "Select an existing Anki deck before importing.";
        return;
      }
      const testButton = root.querySelector("#hab-anki-test");
      const allButton = root.querySelector("#hab-anki-all");
      testButton.disabled = true;
      allButton.disabled = true;
      root.querySelector("#hab-count").textContent = "Checking AnkiConnect and sending " + selected.length + " note(s)…";
      try {
        const response = await browser.runtime.sendMessage({
          type: "HAB_ANKI_ADD",
          deckName,
          notes: selected
        });
        if (!response) throw new Error("No response from the background script.");
        const summary = [
          "Added: " + (response.added || 0),
          "Existing/not addable: " + (response.skippedExisting || 0),
          "Repeated in this batch: " + (response.skippedInBatch || 0),
          "Invalid: " + (response.invalid || 0),
          "Failed: " + (response.failed || 0)
        ].join(" · ");
        root.querySelector("#hab-count").textContent = response.error
          ? "AnkiConnect error: " + response.error + " · " + summary
          : summary;
        console.info(PREFIX, "AnkiConnect import result", response);
      } catch (error) {
        root.querySelector("#hab-count").textContent = "AnkiConnect error: " + clean(error.message || error);
      } finally {
        testButton.disabled = false;
        allButton.disabled = false;
      }
    }
    root.querySelector("#hab-anki-test").addEventListener("click", () => sendToAnki(true));
    root.querySelector("#hab-anki-all").addEventListener("click", () => sendToAnki(false));
    renderStatus();
    loadDecks();
  }

  ensureUI();
  const observer = new MutationObserver(ensureUI);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();