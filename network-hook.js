(() => {
  "use strict";
  if (window.__HAB_FXMVSE_HOOK__) return;
  window.__HAB_FXMVSE_HOOK__ = true;

  const TARGET = "/_/LabsTailwindUi/data/batchexecute";
  const isTarget = (value) => {
    try {
      const url = new URL(String(value), location.href);
      return url.origin === location.origin &&
        url.pathname.includes(TARGET) &&
        url.searchParams.get("rpcids")?.split(",").includes("Fxmvse") &&
        url.searchParams.get("source-path")?.includes("/artifact/");
    } catch (_) {
      return false;
    }
  };

  const relay = (url, body) => {
    if (typeof body !== "string" || !body || body.length > 8_000_000) return;
    window.postMessage({
      source: "HARRISON_ANKI_BRIDGE",
      type: "FXMVSE_RESPONSE",
      requestUrl: String(url),
      responseText: body
    }, location.origin);
  };

  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const requestUrl = args[0] instanceof Request ? args[0].url : args[0];
    const target = isTarget(requestUrl);
    return originalFetch.apply(this, args).then((response) => {
      if (target && response && response.ok) {
        response.clone().text().then((text) => relay(requestUrl, text)).catch(() => {});
      }
      return response;
    });
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__habTargetUrl = isTarget(url) ? String(url) : "";
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (this.__habTargetUrl) {
      this.addEventListener("load", () => {
        try {
          if (this.status >= 200 && this.status < 300) {
            relay(this.__habTargetUrl, this.responseText);
          }
        } catch (_) {}
      }, { once: true });
    }
    return originalSend.apply(this, args);
  };
})();