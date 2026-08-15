"use strict";

const fs = require("node:fs");
const path = require("node:path");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const port = Number(process.argv[2] || 9560);
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = pages.find((item) => item.url.includes("island.html"));
  if (!page) throw new Error("island page not found");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const callId = ++id;
    pending.set(callId, { resolve, reject });
    socket.send(JSON.stringify({ id: callId, method, params }));
  });
  await call("Runtime.enable");
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 500, y: 120 });
  await call("Runtime.evaluate", { expression: "setExpanded(false); resetIdleFade()", awaitPromise: true });
  await delay(8300);
  const idle = await call("Runtime.evaluate", { expression: `({ dim: document.body.classList.contains('idle-dim'), opacity: getComputedStyle(document.getElementById('islandShell')).opacity })`, returnByValue: true });
  if (!idle.result.value.dim || Number(idle.result.value.opacity) > .31) throw new Error(`idle transparency failed: ${JSON.stringify(idle.result.value)}`);
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 153, y: 24 });
  await delay(250);
  const restored = await call("Runtime.evaluate", { expression: `({ dim: document.body.classList.contains('idle-dim'), opacity: getComputedStyle(document.getElementById('islandShell')).opacity })`, returnByValue: true });
  if (restored.result.value.dim || Number(restored.result.value.opacity) < .95) throw new Error(`idle recovery failed: ${JSON.stringify(restored.result.value)}`);
  const output = { idle: idle.result.value, restored: restored.result.value };
  fs.writeFileSync(path.join(__dirname, "..", "..", "..", ".visual-qa", "2026-08-12-island-refinement", "interaction-proof.json"), JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
  socket.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
