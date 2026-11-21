"use strict";

(() => {
  const PREFIX = "[Harrison Anki Bridge]";
  const status = {
    loaded: true,
    version: "0.1.2",
    host: location.host,
    href: location.href,
    timestamp: new Date().toISOString()
  };

  browser.storage.local.set({ habLastContentStatus: status }).catch(() => {});
  console.info(PREFIX, "content script loaded", status);

  browser.runtime.onMessage.addListener((message) => {
    if (message && message.type === "HAB_PING") {
      return Promise.resolve({ ok: true, version: "0.1.2", host: location.host });
    }
    return undefined;
  });

  const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();

  function extractCards() {
    const candidates = Array.from(document.querySelectorAll(
      '[class*="flashcard"], [class*="flash-card"], [data-testid*="flashcard"], article'
    ));
    const seen = new Set();
    const cards = [];

    for (const element of candidates) {
      const text = clean(element.innerText);
      if (!text || text.length < 12 || text.length > 5000 || seen.has(text)) continue;
      seen.add(text);

      const lines = (element.innerText || "").split("\n").map(clean).filter(Boolean);
      if (lines.length < 2) continue;

      let front = lines[0];
      let back = lines.slice(1).join("\n");
      if (/^(question|front|q)[:：]?$/i.test(front) && lines.length > 2) {
        front = lines[1];
        back = lines.slice(2).join("\n");
      }
      if (/^(answer|back|a)[:：]?$/i.test(back.split("\n")[0])) {
        back = back.split("\n").slice(1).join("\n");
      }
      if (front && back) cards.push({ front, back, tags: ["Harrison", "Notebook"] });
      if (cards.length >= 100) break;
    }
    return cards;
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function csvCell(value) {
    return '"' + String(value || "").replace(/"/g, '""') + '"';
  }

  function ensureUI() {
    if (document.getElementById("hab-root")) return;

    const root = document.createElement("div");
    root.id = "hab-root";
    root.innerHTML = `
      <button id="hab-toggle" type="button" title="Harrison Anki Bridge">HAB</button>
      <section id="hab-panel" hidden>
        <header><strong>Harrison Anki Bridge</strong><button id="hab-close" type="button">×</button></header>
        <p id="hab-count">Ready to inspect visible study cards.</p>
        <div class="hab-actions">
          <button id="hab-scan" type="button">Scan page</button>
          <button id="hab-csv" type="button" disabled>Export CSV</button>
          <button id="hab-tsv" type="button" disabled>Export TSV</button>
          <button id="hab-anki" type="button" disabled>Send to Anki</button>
        </div>
        <small>Review extracted cards before importing. Extraction is heuristic.</small>
      </section>`;
    document.documentElement.appendChild(root);

    let cards = [];
    const panel = root.querySelector("#hab-panel");
    const count = root.querySelector("#hab-count");
    const setEnabled = (enabled) => {
      ["#hab-csv", "#hab-tsv", "#hab-anki"].forEach(selector => {
        root.querySelector(selector).disabled = !enabled;
      });
    };

    root.querySelector("#hab-toggle").addEventListener("click", () => {
      panel.hidden = !panel.hidden;
    });
    root.querySelector("#hab-close").addEventListener("click", () => { panel.hidden = true; });
    root.querySelector("#hab-scan").addEventListener("click", () => {
      cards = extractCards();
      count.textContent = cards.length
        ? cards.length + " candidate cards found. Check the source page before importing."
        : "No card-like elements found. The page structure may need a dedicated adapter.";
      setEnabled(cards.length > 0);
    });
    root.querySelector("#hab-csv").addEventListener("click", () => {
      const rows = [["Front", "Back"], ...cards.map(c => [c.front, c.back])];
      downloadText("harrison-anki-bridge.csv", rows.map(row => row.map(csvCell).join(",")).join("\r\n"), "text/csv");
    });
    root.querySelector("#hab-tsv").addEventListener("click", () => {
      const rows = [["Front", "Back"], ...cards.map(c => [c.front, c.back])];
      downloadText("harrison-anki-bridge.tsv", rows.map(row => row.map(v => String(v).replace(/[\t\r\n]+/g, " ")).join("\t")).join("\r\n"), "text/tab-separated-values");
    });
    root.querySelector("#hab-anki").addEventListener("click", async () => {
      count.textContent = "Sending " + cards.length + " notes to Anki…";
      try {
        const response = await browser.runtime.sendMessage({ type: "HAB_ANKI_ADD", notes: cards });
        count.textContent = response && response.ok
          ? response.added + " notes added to Anki."
          : "AnkiConnect error: " + JSON.stringify(response);
      } catch (error) {
        count.textContent = "Could not contact AnkiConnect: " + String(error.message || error);
      }
    });
  }

  ensureUI();
  const observer = new MutationObserver(() => ensureUI());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();