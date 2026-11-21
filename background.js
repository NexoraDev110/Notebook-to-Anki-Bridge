"use strict";

browser.runtime.onMessage.addListener(async (message) => {
  if (!message) return undefined;

  async function request(action, params = {}) {
    const response = await fetch("http://127.0.0.1:8765", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version: 6, params })
    });
    if (!response.ok) throw new Error("AnkiConnect HTTP " + response.status);
    const data = await response.json();
    if (data.error) throw new Error(action + ": " + data.error);
    return data.result;
  }

  if (message.type === "HAB_ANKI_GET_DECKS") {
    try {
      const decks = await request("deckNames");
      if (!Array.isArray(decks)) throw new Error("AnkiConnect returned an invalid deck list.");
      return { ok: true, decks };
    } catch (error) {
      return { ok: false, error: String(error.message || error) };
    }
  }

  if (message.type !== "HAB_ANKI_ADD") return undefined;

  const sourceNotes = Array.isArray(message.notes) ? message.notes : [];
  if (!sourceNotes.length) return { ok: false, error: "No notes supplied." };

  const deckName = String(message.deckName || "").trim();
  if (!deckName) return { ok: false, error: "Select an existing destination deck first.", added: 0, skippedExisting: 0, skippedInBatch: 0, invalid: 0, failed: sourceNotes.length };
  const modelName = "Basic";
  const results = sourceNotes.map((note, index) => ({
    index,
    status: "pending",
    front: String(note.front || "")
  }));

  try {
    const [decks, models] = await Promise.all([
      request("deckNames"),
      request("modelNames")
    ]);
    if (!Array.isArray(decks) || !decks.includes(deckName)) {
      throw new Error('Selected deck "' + deckName + '" no longer exists. Refresh the deck list and select an existing deck.');
    }
    if (!Array.isArray(models) || !models.includes(modelName)) {
      throw new Error('Note type "' + modelName + '" does not exist in Anki.');
    }
    const fields = await request("modelFieldNames", { modelName });
    if (!Array.isArray(fields) || !fields.includes("Front") || !fields.includes("Back")) {
      throw new Error('Note type "Basic" must contain Front and Back fields.');
    }

    const seenFronts = new Set();
    const candidates = [];
    const candidateIndexes = [];
    for (let i = 0; i < sourceNotes.length; i++) {
      const note = sourceNotes[i];
      const front = String(note.front || "").trim();
      const back = String(note.back || "").trim();
      if (!front || !back) {
        results[i].status = "invalid";
        continue;
      }
      const key = front.normalize("NFKC").replace(/\s+/g, " ").toLocaleLowerCase();
      if (seenFronts.has(key)) {
        results[i].status = "duplicate_in_batch";
        continue;
      }
      seenFronts.add(key);
      candidates.push({
        deckName,
        modelName,
        fields: { Front: front, Back: back },
        tags: Array.isArray(note.tags) ? note.tags : ["Notebook", "AnkiBridge"]
      });
      candidateIndexes.push(i);
    }

    if (!candidates.length) {
      return summarize(results);
    }

    const canAdd = await request("canAddNotes", { notes: candidates });
    if (!Array.isArray(canAdd) || canAdd.length !== candidates.length) {
      throw new Error("AnkiConnect returned an invalid canAddNotes result.");
    }

    const addableNotes = [];
    const addableIndexes = [];
    for (let i = 0; i < canAdd.length; i++) {
      const originalIndex = candidateIndexes[i];
      if (canAdd[i]) {
        addableNotes.push(candidates[i]);
        addableIndexes.push(originalIndex);
      } else {
        results[originalIndex].status = "already_exists_or_not_addable";
      }
    }

    if (addableNotes.length) {
      const ids = await request("addNotes", { notes: addableNotes });
      if (!Array.isArray(ids) || ids.length !== addableNotes.length) {
        throw new Error("AnkiConnect returned an invalid addNotes result.");
      }
      for (let i = 0; i < ids.length; i++) {
        results[addableIndexes[i]].status = ids[i] ? "added" : "add_failed_or_duplicate";
        results[addableIndexes[i]].noteId = ids[i] || null;
      }
    }
    return summarize(results);
  } catch (error) {
    for (const item of results) {
      if (item.status === "pending") item.status = "not_processed";
    }
    return {
      ok: false,
      error: String(error.message || error),
      ...counts(results),
      results
    };
  }

  function counts(items) {
    return {
      added: items.filter(x => x.status === "added").length,
      skippedExisting: items.filter(x => x.status === "already_exists_or_not_addable").length,
      skippedInBatch: items.filter(x => x.status === "duplicate_in_batch").length,
      invalid: items.filter(x => x.status === "invalid").length,
      failed: items.filter(x => ["add_failed_or_duplicate", "not_processed"].includes(x.status)).length
    };
  }

  function summarize(items) {
    const totals = counts(items);
    return { ok: totals.failed === 0, ...totals, results: items };
  }
});
