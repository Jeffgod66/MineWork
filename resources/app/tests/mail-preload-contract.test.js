"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createMailSignalController } = require("../mail-signal-controller.js");

test("controller sends only changed safe signals and converts scan exceptions", () => {
  const sent = []; let callback;
  const controller = createMailSignalController({ scan: () => ({ provider: "gmail", status: "ready", unreadCount: 1, messages: [] }), send: (value) => sent.push(value), schedule: () => 1, cancel: () => {}, observe: (cb) => { callback = cb; return 2; }, disconnect: () => {} });
  controller.start({}); controller.run({}); callback();
  assert.equal(sent.length, 1);
  const failures = []; const failed = createMailSignalController({ scan: () => { throw new Error("secret DOM"); }, send: (value) => failures.push(value), schedule: () => 1, cancel: () => {}, observe: () => 2, disconnect: () => {} });
  failed.run({}); assert.deepEqual(failures, [{ provider: "unknown", status: "unavailable", reason: "scan-failed" }]);
});

test("controller clamps interval, debounces observer work, and cleanup is idempotent", () => {
  let cancelled = [], disconnected = 0, observer; const queued = [], delays = [];
  const controller = createMailSignalController({ scan: () => ({ provider: "gmail", status: "ready", unreadCount: 0, messages: [] }), send: () => {}, schedule: (fn, ms) => { delays.push(ms); queued.push(fn); return queued.length; }, cancel: (id) => cancelled.push(id), observe: (fn) => { observer = fn; return 9; }, disconnect: () => { disconnected++; }, intervalMs: 1 });
  controller.start({}); observer(); observer(); assert.equal(delays[0], 30000); assert.equal(queued.length, 2);
  controller.stop(); controller.stop(); assert.equal(disconnected, 1); assert.equal(cancelled.length, 2);
});

test("mail WebView preload exposes no remote API and contains no sensitive extraction surface", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "mail-webview-preload.js"), "utf8");
  assert.match(source, /sendToHost\(\s*["']minework:mail-signal["']/);
  assert.doesNotMatch(source, /contextBridge|exposeInMainWorld/);
  assert.doesNotMatch(source, /\b(?:body|html|cookie|attachment|localStorage|sessionStorage)\b/i);
  assert.doesNotMatch(source, /ipcRenderer\.(?:send|invoke|sendSync)\s*\(/);
});
