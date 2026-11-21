"use strict";

const resultBox = document.getElementById("result");
const checkButton = document.getElementById("check");

checkButton.addEventListener("click", async () => {
  checkButton.disabled = true;
  resultBox.textContent = "Checking active tab…";

  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) throw new Error("No active browser tab was found.");

    const url = tab.url || "";
    const matches = url.startsWith("https://notebook.google.com/");

    let ping = null;
    let pingError = null;
    if (matches) {
      try {
        ping = await browser.tabs.sendMessage(tab.id, { type: "HAB_PING" });
      } catch (error) {
        pingError = String(error.message || error);
      }
    }

    const stored = await browser.storage.local.get("habLastContentStatus");
    const report = {
      activeTab: { id: tab.id, url, title: tab.title || "" },
      expectedHost: "https://notebook.google.com/",
      hostMatches: matches,
      contentScriptPing: ping,
      contentScriptPingError: pingError,
      lastContentScriptStatus: stored.habLastContentStatus || null,
      interpretation: !matches
        ? "The active tab is not on the configured target host."
        : ping && ping.ok
          ? "The content script is running and responded."
          : "The content script did not respond. Reload the target tab after installing the add-on."
    };
    resultBox.textContent = JSON.stringify(report, null, 2);
  } catch (error) {
    resultBox.textContent = JSON.stringify({
      checkFailed: true,
      error: String(error.message || error)
    }, null, 2);
  } finally {
    checkButton.disabled = false;
  }
});