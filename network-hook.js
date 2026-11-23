(() => {
  "use strict";
  if (window.__NAB_RPC_HOOK__) return;
  window.__NAB_RPC_HOOK__ = true;

  const TARGET = "/_/LabsTailwindUi/data/batchexecute";
  const ALLOWED_RPCS = new Set(["Fxmvse", "ulBSjf"]);

  const matchTarget = (value) => {
    try {
      const url = new URL(String(value), location.href);
      if (url.origin !== location.origin || url.pathname !== TARGET) return null;

      const rpcIds = (url.searchParams.get("rpcids") || "").split(",");
      const matchedRpc = rpcIds.find(id => ALLOWED_RPCS.has(id));
      if (!matchedRpc) return null;

      // Fxmvse is the observed fullscreen artifact request and must be scoped
      // to an artifact. ulBSjf is the observed embedded-panel completion RPC.
      if (matchedRpc === "Fxmvse" &&
          !url.searchParams.get("source-path")?.includes("/artifact/")) return null;

      return matchedRpc;
    } catch (_) {
      return null;
    }
  };

  const relay = (url, rpcId, body) => {
    if (typeof body !== "string" || !body || body.length > 8_000_000) return;
    window.postMessage({
      source: "NOTEBOOK_TO_ANKI_BRIDGE",
      type: "NOTEBOOK_RPC_RESPONSE",
      rpcId,
      requestUrl: String(url),
      responseText: body
    }, location.origin);
  };

  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const requestUrl = args[0] instanceof Request ? args[0].url : args[0];
    const rpcId = matchTarget(requestUrl);
    return originalFetch.apply(this, args).then((response) => {
      if (rpcId && response && response.ok) {
        response.clone().text()
          .then(body => relay(requestUrl, rpcId, body))
          .catch(() => {});
      }
      return response;
    });
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    const rpcId = matchTarget(url);
    this.__nabTarget = rpcId ? { url: String(url), rpcId } : null;
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (this.__nabTarget) {
      const target = this.__nabTarget;
      this.addEventListener("load", () => {
        try {
          if (this.status >= 200 && this.status < 300) {
            relay(target.url, target.rpcId, this.responseText);
          }
        } catch (_) {}
      }, { once: true });
    }
    return originalSend.apply(this, args);
  };
})();