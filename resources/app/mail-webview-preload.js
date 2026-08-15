"use strict";

const { ipcRenderer } = require("electron");
const { createMailSignalController } = require("./mail-signal-controller.js");
const { parseMailProviderArgument } = require("./mail-integration.js");

const provider = parseMailProviderArgument(process.argv);
const adapters = Object.freeze({
  gmail: () => require("./mail-adapters/gmail.js"),
  outlook: () => require("./mail-adapters/outlook.js"),
  netease: () => require("./mail-adapters/netease.js"),
  qqmail: () => require("./mail-adapters/qqmail.js")
});
const adapter = provider && adapters[provider] ? adapters[provider]() : null;

const controller = createMailSignalController({
  scan: (documentLike) => adapter ? adapter.extract(documentLike) : { provider: "unknown", status: "unavailable", reason: "unknown-provider" },
  send: (signal) => ipcRenderer.sendToHost("minework:mail-signal", signal),
  schedule: (callback, delay) => delay >= 30000 ? setInterval(callback, delay) : setTimeout(callback, delay),
  cancel: (handle) => { clearTimeout(handle); clearInterval(handle); },
  observe: (callback, documentLike) => {
    const observer = new MutationObserver(callback);
    observer.observe(documentLike.documentElement, { childList: true, subtree: true, attributes: true });
    return observer;
  },
  disconnect: (observer) => observer.disconnect(),
  intervalMs: 30000
});

const start = () => controller.start(document);
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
window.addEventListener("unload", () => controller.stop(), { once: true });
