"use strict";

const versionElement = document.getElementById("version");
versionElement.textContent = "Version " + chrome.runtime.getManifest().version;
