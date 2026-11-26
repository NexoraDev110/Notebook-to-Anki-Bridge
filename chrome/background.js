"use strict";

async function grabNotebookResponse(request) {
  const fail = message => ({ ok: false, error: message });
  try {
    if (!request || typeof request !== "object") return fail("Missing captured NotebookLM request.");
    if (typeof request.url !== "string" || request.url.length > 4096) return fail("Invalid request URL.");
    const url = new URL(request.url);
    if (url.protocol !== "https:" || url.hostname !== "notebook.google.com" ||
        !["", "443"].includes(url.port) || url.username || url.password || url.hash ||
        url.pathname !== "/_/LabsTailwindUi/data/batchexecute") {
      return fail("Grab blocked an untrusted NotebookLM URL.");
    }
    const rpcIds = (url.searchParams.get("rpcids") || "").split(",");
    if (!rpcIds.includes("v9rmvd")) return fail("The captured request is not the supported Flashcards RPC.");
    const sourcePath = url.searchParams.get("source-path") || "";
    if (!/^\/notebook\/[a-f0-9-]{36}(?:\/artifact\/[a-f0-9-]{36})?$/i.test(sourcePath)) {
      return fail("The captured NotebookLM source path is invalid.");
    }
    if (request.method !== "POST" || typeof request.body !== "string" ||
        !request.body.length || request.body.length > 2_000_000) {
      return fail("The captured POST body is missing or exceeds the size limit.");
    }
    const form = new URLSearchParams(request.body);
    if (!form.has("f.req") || !form.get("f.req")) {
      return fail("The captured request body does not contain the expected f.req payload.");
    }

    const allowedHeaders = new Set([
      "accept", "content-type", "x-goog-authuser", "x-same-domain", "x-user-agent"
    ]);
    const headers = {};
    if (request.headers && typeof request.headers === "object" && !Array.isArray(request.headers)) {
      for (const [key, value] of Object.entries(request.headers)) {
        const normalized = key.toLowerCase();
        if (allowedHeaders.has(normalized) && typeof value === "string" && value.length <= 2048) {
          headers[normalized] = value;
        }
      }
    }
    if (!headers["content-type"] || !/application\/x-www-form-urlencoded/i.test(headers["content-type"])) {
      return fail("The captured request is missing its expected form content type.");
    }

    const response = await fetch(url.href, {
      method: "POST",
      headers,
      body: request.body,
      credentials: "include",
      cache: "no-store",
      redirect: "error"
    });
    if (!response.ok) return fail("NotebookLM Grab request failed with HTTP " + response.status + ".");
    const responseText = await response.text();
    if (!responseText || responseText.length > 8_000_000) {
      return fail("NotebookLM returned an empty or oversized Grab response.");
    }
    return { ok: true, responseText };
  } catch (error) {
    return fail(String(error?.message || error));
  }
}

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

async function handleMessage(message) {
  if (!message) return undefined;

  if (message.type === "HAB_NLM_GRAB") return grabNotebookResponse(message.request);

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
  if (!deckName) return {
    ok: false,
    error: "Select an existing destination deck first.",
    added: 0,
    skippedExisting: 0,
    skippedInBatch: 0,
    invalid: 0,
    failed: sourceNotes.length
  };

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

    if (!candidates.length) return summarize(results);

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
}

// Callback-style response is used for broad Chrome MV3 compatibility.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  Promise.resolve(handleMessage(message))
    .then(sendResponse)
    .catch(error => sendResponse({ ok: false, error: String(error.message || error) }));
  return true;
});