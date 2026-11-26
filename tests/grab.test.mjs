import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validUrl = "https://notebook.google.com/_/LabsTailwindUi/data/batchexecute?rpcids=v9rmvd&source-path=%2Fnotebook%2F11111111-1111-4111-8111-111111111111%2Fartifact%2F22222222-2222-4222-8222-222222222222";
const validBody = new URLSearchParams({ "f.req": "test-payload", at: "csrf-token" }).toString();
const validRequest = {
  url: validUrl,
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "x-goog-authuser": "0" },
  body: validBody
};

function loadGrabFunction(file, fetchImpl) {
  const listeners = [];
  const context = {
    URL,
    URLSearchParams,
    Set,
    Object,
    String,
    Array,
    Promise,
    Error,
    fetch: fetchImpl,
    browser: { runtime: { onMessage: { addListener: listener => listeners.push(listener) } } },
    chrome: { runtime: { onMessage: { addListener: listener => listeners.push(listener) } } }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  return context.grabNotebookResponse;
}

for (const backgroundFile of ["background.js", "chrome/background.js"]) {
  test(backgroundFile + ": valid captured request is replayed with cookies and exact payload", async () => {
    let called = 0;
    let captured;
    const grab = loadGrabFunction(backgroundFile, async (url, options) => {
      called++;
      captured = { url: String(url), options };
      return { ok: true, status: 200, text: async () => "valid-rpc-response" };
    });
    const result = await grab(validRequest);
    assert.equal(result.ok, true);
    assert.equal(result.responseText, "valid-rpc-response");
    assert.equal(called, 1);
    assert.equal(captured.url, validUrl);
    assert.equal(captured.options.method, "POST");
    assert.equal(captured.options.body, validBody);
    assert.equal(captured.options.credentials, "include");
    assert.equal(captured.options.redirect, "error");
    assert.equal(captured.options.headers["content-type"], validRequest.headers["content-type"]);
  });

  const invalidRequests = [
    ["HTTP URL", { ...validRequest, url: validUrl.replace("https:", "http:") }],
    ["wrong host", { ...validRequest, url: validUrl.replace("notebook.google.com", "evil.example") }],
    ["wrong path", { ...validRequest, url: validUrl.replace("batchexecute", "other") }],
    ["unexpected port", { ...validRequest, url: validUrl.replace("notebook.google.com", "notebook.google.com:444") }],
    ["wrong RPC", { ...validRequest, url: validUrl.replace("v9rmvd", "otherRpc") }],
    ["invalid source path", { ...validRequest, url: validUrl.replace("11111111-1111-4111-8111-111111111111", "not-a-notebook-id") }],
    ["wrong method", { ...validRequest, method: "GET" }],
    ["missing f.req", { ...validRequest, body: "at=csrf-token" }],
    ["missing content type", { ...validRequest, headers: {} }],
    ["oversized body", { ...validRequest, body: "x".repeat(2_000_001) }]
  ];

  for (const [label, request] of invalidRequests) {
    test(backgroundFile + ": rejects " + label + " before network access", async () => {
      let called = false;
      const grab = loadGrabFunction(backgroundFile, async () => {
        called = true;
        return { ok: true, status: 200, text: async () => "should-not-run" };
      });
      const result = await grab(request);
      assert.equal(result.ok, false);
      assert.equal(called, false);
    });
  }

  test(backgroundFile + ": concurrent Grab requests are rejected", async () => {
    let releaseFetch;
    const grab = loadGrabFunction(backgroundFile, () => new Promise(resolve => {
      releaseFetch = () => resolve({ ok: true, status: 200, text: async () => "rpc-ok" });
    }));
    const first = grab(validRequest);
    await Promise.resolve();
    const second = await grab(validRequest);
    assert.equal(second.ok, false);
    assert.match(second.error, /already in progress/);
    releaseFetch();
    assert.equal((await first).ok, true);
  });

  test(backgroundFile + ": HTTP failure is reported without a false success", async () => {
    const grab = loadGrabFunction(backgroundFile, async () => ({
      ok: false, status: 403, text: async () => "forbidden"
    }));
    const result = await grab(validRequest);
    assert.equal(result.ok, false);
    assert.match(result.error, /HTTP 403/);
  });
}

test("RPC parser accepts a structurally valid empty flashcard array", () => {
  const context = {
    window: {},
    DOMParser: class {
      parseFromString() {
        return {
          querySelector() {
            return { dataset: { appData: JSON.stringify({ flashcards: [] }) } };
          }
        };
      }
    },
    Set,
    Object,
    Array,
    JSON,
    Number,
    String,
    RegExp,
    Error
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "rpc-parser.js"), "utf8"), context);
  const result = context.window.HABRpcParser.parseResponse(JSON.stringify("<html><div data-app-data></div></html>"), "");
  assert.deepEqual(Array.from(result.cards), []);
  assert.equal(result.total, 0);
  assert.equal(result.rawCardRecords, 0);
});

test("RPC parser rejects non-empty malformed flashcard records", () => {
  const context = {
    window: {},
    DOMParser: class {
      parseFromString() {
        return {
          querySelector() {
            return { dataset: { appData: JSON.stringify({ flashcards: [{ f: "", b: "" }] }) } };
          }
        };
      }
    },
    Set,
    Object,
    Array,
    JSON,
    Number,
    String,
    RegExp,
    Error
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "rpc-parser.js"), "utf8"), context);
  assert.throws(
    () => context.window.HABRpcParser.parseResponse(JSON.stringify("<html><div data-app-data></div></html>"), ""),
    /non-empty flashcards array/
  );
});

test("RPC parser rejects malformed records even when other cards are valid", () => {
  const context = {
    window: {},
    DOMParser: class {
      parseFromString() {
        return {
          querySelector() {
            return { dataset: { appData: JSON.stringify({ flashcards: [
              { f: "Question", b: "Answer" },
              { f: "", b: "" }
            ] }) } };
          }
        };
      }
    },
    Set,
    Object,
    Array,
    JSON,
    Number,
    String,
    RegExp,
    Error
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "rpc-parser.js"), "utf8"), context);
  assert.throws(
    () => context.window.HABRpcParser.parseResponse(JSON.stringify("<html><div data-app-data></div></html>"), ""),
    /invalid flashcard record/
  );
});

function loadNetworkHook(file, messages) {
  const location = {
    href: "https://notebook.google.com/notebook/11111111-1111-4111-8111-111111111111",
    origin: "https://notebook.google.com"
  };
  class FakeXMLHttpRequest {
    constructor() {
      this.status = 200;
      this.responseText = "mock-xhr-response";
      this.listeners = {};
    }
    addEventListener(name, callback) {
      (this.listeners[name] ||= []).push(callback);
    }
    open() {}
    send() {
      for (const callback of this.listeners.load || []) callback.call(this);
    }
    setRequestHeader() {}
  }
  const window = {
    __NAB_RPC_HOOK__: false,
    fetch: async () => ({
      ok: true,
      clone: () => ({ text: async () => "mock-rpc-response" })
    }),
    postMessage: message => messages.push(message)
  };
  const context = {
    window, location, URL, Request, Headers, Blob, ArrayBuffer, TextDecoder,
    XMLHttpRequest: FakeXMLHttpRequest, Set, String, Object, Promise
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  return window;
}

for (const hookFile of ["network-hook.js", "chrome/network-hook.js"]) {
  test(hookFile + ": safely snapshots a Request body without consuming the original request", async () => {
    const messages = [];
    const page = loadNetworkHook(hookFile, messages);
    const request = new Request(validUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: validBody
    });
    await page.fetch(request);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(request.bodyUsed, false);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].requestMeta.method, "POST");
    assert.equal(messages[0].requestMeta.body, validBody);
    assert.equal(messages[0].requestMeta.url, validUrl);
    assert.equal(messages[0].responseText, "mock-rpc-response");
  });

  test(hookFile + ": normalizes relative RPC URLs before sending request metadata", async () => {
    const messages = [];
    const page = loadNetworkHook(hookFile, messages);
    const relativeUrl = new URL(validUrl).pathname + new URL(validUrl).search;
    await page.fetch(relativeUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: validBody
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].requestMeta.url, validUrl);
    assert.equal(messages[0].requestUrl, validUrl);
  });

  test(hookFile + ": keeps passive fetch extraction when request body cannot be snapshotted", async () => {
    const messages = [];
    const page = loadNetworkHook(hookFile, messages);
    const form = new FormData();
    form.append("f.req", "payload");
    await page.fetch(validUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: form
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].responseText, "mock-rpc-response");
    assert.equal(messages[0].requestMeta, null);
  });

  test(hookFile + ": keeps passive XHR extraction when request body cannot be snapshotted", () => {
    const messages = [];
    const page = loadNetworkHook(hookFile, messages);
    const xhr = new page.XMLHttpRequest();
    xhr.open("POST", validUrl);
    xhr.setRequestHeader("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
    xhr.send(new FormData());
    assert.equal(messages.length, 1);
    assert.equal(messages[0].responseText, "mock-xhr-response");
    assert.equal(messages[0].requestMeta, null);
  });

  test(hookFile + ": snapshots a string init body for a matching RPC", async () => {
    const messages = [];
    const page = loadNetworkHook(hookFile, messages);
    await page.fetch(validUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: validBody
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].requestMeta.body, validBody);
  });
}
