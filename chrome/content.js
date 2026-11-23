"use strict";

(() => {
  const VERSION = chrome.runtime.getManifest().version;
  const PREFIX = "[Notebook to Anki Bridge]";
  console.info(PREFIX, "content script loaded", { version: VERSION, host: location.host });

  let cards = [];
  let artifactId = "";
  let imageCount = 0;
  let extractionMeta = null;
  let captureError = "";

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
    for (const selector of ["#hab-csv", "#hab-tsv", "#hab-anki-all"]) {
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
        tags: ["Notebook", "AnkiBridge"]
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
    if (!data || data.source !== "NOTEBOOK_TO_ANKI_BRIDGE" ||
        data.type !== "NOTEBOOK_RPC_RESPONSE" ||
        !["v9rmvd"].includes(data.rpcId) ||
        typeof data.responseText !== "string") return;
    capture(data.responseText, data.requestUrl || location.href);
  });

  function ensureUI() {
    if (document.getElementById("hab-root") || !document.documentElement) return;
    const makeElement = (tag, id, text) => {
      const element = document.createElement(tag);
      if (id) element.id = id;
      if (text !== undefined) element.textContent = text;
      return element;
    };

    const root = makeElement("div", "hab-root");
    const toggle = makeElement("button", "hab-toggle", "NAB");
    toggle.type = "button";
    toggle.title = "Notebook to Anki Bridge";

    const panel = makeElement("section", "hab-panel");
    panel.hidden = true;

    const header = makeElement("header");
    const heading = makeElement("strong", null, "Notebook to Anki Bridge v" + VERSION);
    const closeButton = makeElement("button", "hab-close", "×");
    closeButton.type = "button";
    header.append(heading, closeButton);

    const count = makeElement("p", "hab-count",
      "Waiting for the Notebook flashcards RPC response.");
    const preview = makeElement("pre", "hab-preview");

    const deckPicker = makeElement("div");
    deckPicker.className = "hab-deck-picker";
    const deckLabel = makeElement("label", null, "Anki destination deck");
    deckLabel.htmlFor = "hab-deck";

    const deckRow = makeElement("div");
    deckRow.className = "hab-deck-row";
    const deckSearch = makeElement("input", "hab-deck-search");
    deckSearch.type = "search";
    deckSearch.placeholder = "Search existing Anki decks…";
    deckSearch.setAttribute("aria-label", "Search existing Anki decks");
    deckSearch.disabled = true;
    const deckSelect = makeElement("select", "hab-deck");
    deckSelect.disabled = true;
    const initialOption = makeElement("option", null, "Load decks from Anki…");
    initialOption.value = "";
    deckSelect.appendChild(initialOption);
    const refreshButton = makeElement("button", "hab-deck-refresh", "↻");
    refreshButton.type = "button";
    deckRow.append(deckSelect, refreshButton);

    const deckStatus = makeElement("small", "hab-deck-status",
      "Connect to AnkiConnect to load your existing decks.");
    deckPicker.append(deckLabel, deckSearch, deckRow, deckStatus);

    let allDecks = [];
    function renderDeckOptions(preferredValue = deckSelect.value) {
      const query = clean(deckSearch.value).toLocaleLowerCase();
      const matches = allDecks.filter(name => name.toLocaleLowerCase().includes(query));
      deckSelect.replaceChildren();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select destination deck…";
      deckSelect.appendChild(placeholder);

      for (const name of matches) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        deckSelect.appendChild(option);
      }

      if (preferredValue && allDecks.includes(preferredValue) && !matches.includes(preferredValue)) {
        const selectedOption = document.createElement("option");
        selectedOption.value = preferredValue;
        selectedOption.textContent = preferredValue + " (currently selected)";
        deckSelect.appendChild(selectedOption);
      }
      if (preferredValue && allDecks.includes(preferredValue)) deckSelect.value = preferredValue;
      deckSelect.disabled = allDecks.length === 0;
      return matches.length;
    }

    const actions = makeElement("div");
    actions.className = "hab-actions";
    const csvButton = makeElement("button", "hab-csv", "Export CSV");
    csvButton.type = "button";
    csvButton.disabled = true;
    const tsvButton = makeElement("button", "hab-tsv", "Export TSV");
    tsvButton.type = "button";
    tsvButton.disabled = true;
    const ankiButton = makeElement("button", "hab-anki-all", "Send all cards to Anki");
    ankiButton.type = "button";
    ankiButton.disabled = true;
    actions.append(csvButton, tsvButton, ankiButton);

    const footer = makeElement("small", null, "Flashcard response data is processed locally and is not sent to the developer. Anki import happens only when you click Send all cards to Anki. Images are represented by alt text, not embedded.");

    panel.append(header, count, preview, deckPicker, actions, footer);
    root.append(toggle, panel);
    document.documentElement.appendChild(root);
    async function loadDecks() {
      const refreshButton = root.querySelector("#hab-deck-refresh");
      refreshButton.disabled = true;
      deckSelect.disabled = true;
      deckStatus.textContent = "Loading existing decks from Anki…";
      deckStatus.classList.remove("hab-error");
      deckStatus.removeAttribute("role");
      try {
        const response = await chrome.runtime.sendMessage({ type: "HAB_ANKI_GET_DECKS" });
        if (!response || !response.ok || !Array.isArray(response.decks)) {
          throw new Error(response?.error || "AnkiConnect returned an invalid deck list.");
        }
        const previous = deckSelect.value;
        allDecks = response.decks;
        deckSearch.disabled = allDecks.length === 0;
        renderDeckOptions(previous);
        deckStatus.textContent = response.decks.length
          ? response.decks.length + " existing deck(s) loaded. No deck will be created automatically."
          : "No decks were returned by AnkiConnect.";
      } catch (error) {
        allDecks = [];
        deckSearch.disabled = true;
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
    deckSearch.addEventListener("input", () => {
      const matchCount = renderDeckOptions(deckSelect.value);
      deckStatus.textContent = matchCount
        ? matchCount + " matching deck(s) shown."
        : "No matching decks. Try another search.";
    });
    deckSelect.addEventListener("change", () => {
      if (deckSelect.value) {
        deckStatus.classList.remove("hab-error");
        deckStatus.removeAttribute("role");
        const loadedDeckCount = Math.max(0, deckSelect.options.length - 1);
        deckStatus.textContent = loadedDeckCount +
          " existing deck(s) loaded. No deck will be created automatically.";
      }
    });
    root.querySelector("#hab-close").addEventListener("click", () => { panel.hidden = true; });
    root.querySelector("#hab-csv").addEventListener("click", () => {
      const rows = [["Front", "Back"], ...cards.map(c => [c.front, c.back])];
      downloadText("notebook-anki-bridge.csv",
        rows.map(row => row.map(csvCell).join(",")).join("\r\n"), "text/csv");
    });
    root.querySelector("#hab-tsv").addEventListener("click", () => {
      const rows = [["Front", "Back"], ...cards.map(c => [c.front, c.back])];
      downloadText("notebook-anki-bridge.tsv",
        rows.map(row => row.map(v => String(v || "").replace(/[\t\r\n]+/g, " ")).join("\t")).join("\r\n"),
        "text/tab-separated-values");
    });
    async function sendToAnki() {
      const selected = cards.filter(c => clean(c.front) && clean(c.back));
      if (!selected.length) return;
      if (!window.confirm("Send " + selected.length + " cards to Anki? Existing notes and repeated Front fields will be skipped.")) return;
      const deckName = deckSelect.value;
      if (!deckName) {
        deckStatus.textContent = "Select an existing Anki deck before importing.";
        deckStatus.classList.add("hab-error");
        deckStatus.setAttribute("role", "alert");
        return;
      }
      const allButton = root.querySelector("#hab-anki-all");
      allButton.disabled = true;
      root.querySelector("#hab-count").textContent = "Checking AnkiConnect and sending " + selected.length + " note(s)…";
      try {
        const response = await chrome.runtime.sendMessage({ type: "HAB_ANKI_ADD", deckName, notes: selected });
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
        allButton.disabled = false;
      }
    }
    root.querySelector("#hab-anki-all").addEventListener("click", sendToAnki);
    renderStatus();
    loadDecks();
  }

  ensureUI();
  const observer = new MutationObserver(ensureUI);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();