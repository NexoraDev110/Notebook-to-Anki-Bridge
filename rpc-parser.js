(() => {
  "use strict";

  const MAX_DEPTH = 100;
  const MAX_NODES = 250000;

  function decodeNested(value, depth = 0, budget = { count: 0 }) {
    if (depth > MAX_DEPTH || ++budget.count > MAX_NODES) return value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("[[") || trimmed.startsWith("{")) {
        try { return decodeNested(JSON.parse(trimmed), depth + 1, budget); }
        catch (_) { return value; }
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(v => decodeNested(v, depth + 1, budget));
    if (value && typeof value === "object") {
      for (const key of Object.keys(value)) value[key] = decodeNested(value[key], depth + 1, budget);
    }
    return value;
  }

  function directValue(node, key) {
    if (!Array.isArray(node)) return undefined;
    for (const item of node) {
      if (Array.isArray(item) && item.length >= 2 && item[0] === key) return item[1];
    }
    return undefined;
  }

  function deepValue(node, key) {
    let result;
    walk(node, current => {
      if (result !== undefined || !Array.isArray(current)) return;
      if (current.length >= 2 && current[0] === key) result = current[1];
    });
    return result;
  }

  function walk(node, visit, depth = 0, seen = new Set()) {
    if (depth > MAX_DEPTH || !node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    visit(node);
    if (Array.isArray(node)) {
      for (const child of node) walk(child, visit, depth + 1, seen);
    } else {
      for (const child of Object.values(node)) walk(child, visit, depth + 1, seen);
    }
  }

  function firstString(node, depth = 0) {
    if (depth > 30 || node == null) return "";
    if (typeof node === "string") return node;
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = firstString(child, depth + 1);
        if (found) return found;
      }
    }
    return "";
  }

  function collectBlocks(fieldNode) {
    const parts = [];
    const images = [];
    walk(fieldNode, node => {
      if (!Array.isArray(node)) return;
      const type = firstString(directValue(node, "type"));
      if (type === "text") {
        const value = firstString(directValue(node, "content"));
        if (value) parts.push(value);
      } else if (type === "image") {
        const image = {
          reference: firstString(directValue(node, "reference")),
          alt: firstString(directValue(node, "alt"))
        };
        images.push(image);
        parts.push(image.alt ? "[Image: " + image.alt + "]" : "[Image]");
      }
    });
    return {
      text: parts.join("\n").trim(),
      images
    };
  }

  function extractCardsArray(cardsNode) {
    const found = [];
    const seen = new Set();
    walk(cardsNode, node => {
      if (!Array.isArray(node)) return;
      const frontNode = directValue(node, "f");
      const backNode = directValue(node, "b");
      if (frontNode === undefined || backNode === undefined) return;
      const front = collectBlocks(frontNode);
      const back = collectBlocks(backNode);
      if (!front.text || !back.text) return;
      const key = front.text + "\u0000" + back.text;
      if (seen.has(key)) return;
      seen.add(key);
      found.push({
        front: front.text + front.images.map(x => x.alt ? "\n[Image: " + x.alt + "]" : "\n[Image]").join(""),
        back: back.text + back.images.map(x => x.alt ? "\n[Image: " + x.alt + "]" : "\n[Image]").join(""),
        images: [...front.images, ...back.images],
        status: firstString(directValue(node, "userStatus")) || ""
      });
    });
    return found;
  }

  function parseBatchedResponse(raw) {
    const cleaned = raw.replace(/^\)\]\}'\s*/, "").trim();
    const candidates = [cleaned];

    // Google batchexecute commonly frames each JSON chunk with a decimal
    // byte/character count on its own line. Parse each framed payload separately.
    const lines = cleaned.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || /^\d+$/.test(line)) continue;
      candidates.push(line);
    }

    // Some responses contain several length-prefixed chunks on one stream.
    // Walk the stream and extract the JSON text following each numeric prefix.
    const framed = [...cleaned.matchAll(/(?:^|\n)\s*\d+\s*\n/g)];
    for (let i = 0; i < framed.length; i++) {
      const start = framed[i].index + framed[i][0].length;
      const end = i + 1 < framed.length ? framed[i + 1].index : cleaned.length;
      const chunk = cleaned.slice(start, end).trim();
      if (chunk) candidates.push(chunk);
    }

    const parsed = [];
    const seen = new Set();
    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      try {
        const value = JSON.parse(candidate);
        parsed.push(value);
      } catch (_) {}
    }
    if (!parsed.length) {
      throw new Error("Unrecognized batchexecute framing: no JSON payload chunk could be parsed.");
    }
    return parsed.length === 1 ? parsed[0] : parsed;
  }

  function parseResponse(raw, expectedArtifactId) {
    if (typeof raw !== "string" || raw.length > 8_000_000) {
      throw new Error("Invalid or oversized RPC response.");
    }
    const outer = parseBatchedResponse(raw);
    const decoded = decodeNested(outer);
    // Fxmvse identifies the request in the batchexecute URL. Google does not
    // necessarily echo that RPC ID in the response body, so do not require it here.
    if (expectedArtifactId && !JSON.stringify(decoded).includes(expectedArtifactId)) {
      throw new Error("The RPC response does not match the active artifact ID.");
    }

    const artifactFound = [];
    walk(decoded, node => {
      if (Array.isArray(node) && node.length >= 2 &&
          node[0] === "latestCompletion") artifactFound.push(node[1]);
    });
    if (!artifactFound.length) throw new Error("latestCompletion was not found.");

    const allCards = [];
    for (const completion of artifactFound) {
      const cardsNode = deepValue(completion, "cards");
      if (cardsNode !== undefined) allCards.push(...extractCardsArray(cardsNode));
    }
    const unique = [];
    const keys = new Set();
    for (const card of allCards) {
      const key = card.front + "\u0000" + card.back;
      if (!keys.has(key)) { keys.add(key); unique.push(card); }
    }
    if (!unique.length) throw new Error("No complete Front/Back cards found in latestCompletion.");
    return {
      artifactId: expectedArtifactId || "",
      cards: unique,
      total: unique.length,
      imageCount: unique.reduce((n, c) => n + c.images.length, 0)
    };
  }

  window.HABRpcParser = { parseResponse };
})();