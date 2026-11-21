"use strict";

const versionElement = document.getElementById("version");
versionElement.textContent = "Version " + browser.runtime.getManifest().version;
