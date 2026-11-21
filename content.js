"use strict";

(() => {
  const VERSION = "0.2.0";
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
    for (const selector of ["#hab-csv", "#hab-tsv", "#hab-anki"]) {
      const button = document.querySelector(selector);
      if (button) button.disabled = !enabled;
    }
    if (count) {
      count.textContent = enabled
        ? cards.length + " structured cards captured" +
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
      const match = url.pathname.match(/\/artifact\/([a-f0-9-]{36})/i);
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
        <header><strong>Harrison Anki Bridge 0.2.0</strong><button id="hab-close" type="button">×</button></header>
        <p id="hab-count">Waiting for the Notebook flashcards RPC response.</p>
        <pre id="hab-preview"></pre>
        <div class="hab-actions">
          <button id="hab-csv" type="button" disabled>Export CSV</button>
          <button id="hab-tsv" type="button" disabled>Export TSV</button>
          <button id="hab-anki" type="button" disabled>Send to Anki</button>
        </div>
        <small>Structured RPC extraction. Images are currently represented by their alt text, not embedded.</small>
      </section>`;
    document.documentElement.appendChild(root);
    const panel = root.querySelector("#hab-panel");
    root.querySelector("#hab-toggle").addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      renderStatus();
    });
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
    root.querySelector("#hab-anki").addEventListener("click", async () => {
      const valid = cards.filter(c => clean(c.front) && clean(c.back));
      if (!valid.length) return;
      root.querySelector("#hab-count").textContent = "Sending " + valid.length + " notes to Anki…";
      try {
        const response = await browser.runtime.sendMessage({ type: "HAB_ANKI_ADD", notes: valid });
        root.querySelector("#hab-count").textContent = response?.ok
          ? response.added + " notes added to Anki."
          : "AnkiConnect result: " + JSON.stringify(response);
      } catch (error) {
        root.querySelector("#hab-count").textContent = "AnkiConnect error: " + clean(error.message || error);
      }
    });
    renderStatus();
  }

  ensureUI();
  const observer = new MutationObserver(ensureUI);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();