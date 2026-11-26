(() => {
  "use strict";
  if (window.__NAB_RPC_HOOK__) return;
  window.__NAB_RPC_HOOK__ = true;

  const TARGET = "/_/LabsTailwindUi/data/batchexecute";
  const RPC_ID = "v9rmvd";
  const MAX_REQUEST_BODY = 2_000_000;
  const ALLOWED_HEADERS = new Set([
    "accept", "content-type", "x-goog-authuser", "x-same-domain", "x-user-agent"
  ]);

  const matchTarget = value => {
    try {
      const url = new URL(String(value), location.href);
      if (url.origin !== location.origin || url.pathname !== TARGET) return null;
      if (!(url.searchParams.get("rpcids") || "").split(",").includes(RPC_ID)) return null;
      const sourcePath = url.searchParams.get("source-path") || "";
      if (!/^\/notebook\/[a-f0-9-]{36}(?:\/artifact\/[a-f0-9-]{36})?$/i.test(sourcePath)) return null;
      return RPC_ID;
    } catch (_) {
      return null;
    }
  };

  function normalizeBody(body) {
    if (typeof body === "string") return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof Blob) return body.text();
    if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
    if (ArrayBuffer.isView(body)) {
      return new TextDecoder().decode(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength));
    }
    return null;
  }

  function safeHeaders(source, overrides) {
    const result = {};
    try {
      const headers = new Headers(source || undefined);
      if (overrides) new Headers(overrides).forEach((value, key) => headers.set(key, value));
      headers.forEach((value, key) => {
        if (ALLOWED_HEADERS.has(key.toLowerCase())) result[key.toLowerCase()] = value;
      });
    } catch (_) {}
    return result;
  }

  async function snapshotFetchRequest(input, init) {
    const isRequest = input instanceof Request;
    const request = isRequest ? input : null;
    const url = request ? request.url : new URL(String(input), location.href).href;
    const method = String(init?.method || request?.method || "GET").toUpperCase();
    const headers = safeHeaders(request?.headers, init?.headers);
    let body = "";

    if (init && Object.prototype.hasOwnProperty.call(init, "body")) {
      const normalized = normalizeBody(init.body);
      if (normalized === null) return null;
      body = await normalized;
    } else if (request && method !== "GET" && method !== "HEAD") {
      body = await request.clone().text();
    }

    if (body.length > MAX_REQUEST_BODY) return null;
    return { url, method, headers, body };
  }

  const relay = (url, rpcId, responseText, requestMeta) => {
    if (typeof responseText !== "string" || !responseText || responseText.length > 8_000_000) return;
    window.postMessage({
      source: "NOTEBOOK_TO_ANKI_BRIDGE",
      type: "NOTEBOOK_RPC_RESPONSE",
      rpcId,
      requestUrl: String(url),
      requestMeta: requestMeta || null,
      responseText
    }, location.origin);
  };

  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const input = args[0];
    const requestUrl = input instanceof Request ? input.url : String(input);
    const rpcId = matchTarget(requestUrl);
    if (!rpcId) return originalFetch.apply(this, args);

    // Clone the Request before the original fetch consumes its body. The original
    // request is never read, replaced, delayed, or otherwise mutated.
    const absoluteUrl = new URL(requestUrl, location.href).href;
    const snapshotPromise = snapshotFetchRequest(input, args[1]).catch(() => null);
    return originalFetch.apply(this, args).then(response => {
      if (response && response.ok) {
        Promise.all([snapshotPromise, response.clone().text()])
          .then(([snapshot, responseText]) => {
            // Passive extraction must continue even when Grab cannot snapshot
            // an unsupported request-body type.
            relay(absoluteUrl, rpcId, responseText, snapshot);
          })
          .catch(() => {});
      }
      return response;
    });
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    const rpcId = matchTarget(url);
    this.__nabTarget = rpcId ? {
      url: new URL(String(url), location.href).href,
      rpcId,
      method: String(method || "GET").toUpperCase(),
      headers: {}
    } : null;
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (this.__nabTarget && ALLOWED_HEADERS.has(String(name).toLowerCase())) {
      this.__nabTarget.headers[String(name).toLowerCase()] = String(value);
    }
    return originalSetRequestHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function (body) {
    if (this.__nabTarget) {
      const target = this.__nabTarget;
      const normalized = normalizeBody(body);
      const requestMeta = normalized === null ? null : {
        url: target.url,
        method: target.method,
        headers: target.headers,
        body: typeof normalized === "string" ? normalized : null
      };
      const usableRequestMeta = requestMeta &&
        requestMeta.body !== null &&
        requestMeta.body.length <= MAX_REQUEST_BODY
        ? requestMeta
        : null;
      // Always relay the response for passive extraction. Grab metadata is
      // optional and only controls whether the refresh button can be enabled.
      this.addEventListener("load", () => {
        try {
          if (this.status >= 200 && this.status < 300) {
            relay(target.url, target.rpcId, this.responseText, usableRequestMeta);
          }
        } catch (_) {}
      }, { once: true });
    }
    return originalSend.call(this, body);
  };
})();