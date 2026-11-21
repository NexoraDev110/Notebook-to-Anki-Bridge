"use strict";

browser.runtime.onMessage.addListener(async (message) => {
  if (!message || message.type !== "HAB_ANKI_ADD") return undefined;

  const notes = Array.isArray(message.notes) ? message.notes : [];
  if (!notes.length) return { ok: false, error: "No notes supplied." };

  const results = [];
  for (const note of notes) {
    const payload = {
      action: "addNote",
      version: 6,
      params: {
        note: {
          deckName: note.deckName || "Harrison::Inbox",
          modelName: "Basic",
          fields: {
            Front: String(note.front || ""),
            Back: String(note.back || "")
          },
          tags: Array.isArray(note.tags) ? note.tags : ["Harrison", "Notebook"]
        }
      }
    };

    try {
      const response = await fetch("http://127.0.0.1:8765", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      results.push({ ok: true, id: data.result });
    } catch (error) {
      results.push({ ok: false, error: String(error.message || error) });
    }
  }

  return {
    ok: results.every(item => item.ok),
    added: results.filter(item => item.ok).length,
    failed: results.filter(item => !item.ok).length,
    results
  };
});