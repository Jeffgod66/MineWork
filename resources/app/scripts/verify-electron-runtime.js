"use strict";

const assert = require("node:assert/strict");

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function connect(port) {
  let pages;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      break;
    } catch {
      await delay(200);
    }
  }
  const page = pages?.find((item) => item.type === "page" && item.url.includes("index.html"));
  if (!page) throw new Error("MineWork Electron renderer target was not found");

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });

  let id = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const callId = ++id;
    const timeout = setTimeout(() => {
      pending.delete(callId);
      reject(new Error(`CDP ${method} timed out`));
    }, 25000);
    pending.set(callId, {
      resolve: (value) => { clearTimeout(timeout); resolve(value); },
      reject: (error) => { clearTimeout(timeout); reject(error); }
    });
    socket.send(JSON.stringify({ id: callId, method, params }));
  });
  return { call, socket, targetId: page.id };
}

async function main() {
  const port = Number(process.argv[2] || 9560);
  const width = Number(process.argv[3] || 1024);
  const height = Number(process.argv[4] || 680);
  const { call, socket } = await connect(port);
  await call("Runtime.enable");
  await call("Runtime.evaluate", { expression: `window.resizeTo(${width}, ${height})` });
  await delay(500);

  const result = await call("Runtime.evaluate", {
    expression: `(async () => {
      const payload = await window.minework.system.performance();
      await updatePerformance();
      setPage('performance');
      await new Promise((resolve) => setTimeout(resolve, 450));
      const page = document.getElementById('page-performance');
      page.scrollTop = page.scrollHeight;
      const bottomDelta = Math.abs((page.scrollHeight - page.clientHeight) - page.scrollTop);
      page.scrollTop = 0;
      return {
        payload,
        viewport: { width: innerWidth, height: innerHeight },
        layout: { clientWidth: page.clientWidth, scrollWidth: page.scrollWidth, clientHeight: page.clientHeight, scrollHeight: page.scrollHeight, bottomDelta },
        dom: {
          cpuUsage: document.getElementById('cpuUsage').textContent.trim(),
          cpuModel: document.getElementById('cpuModel').textContent.trim(),
          memoryUsage: document.getElementById('memoryUsage').textContent.trim(),
          diskUsage: document.getElementById('diskUsage').textContent.trim(),
          gpuName: document.getElementById('gpuName').textContent.trim(),
          systemOs: document.getElementById('systemOs').textContent.trim(),
          systemArch: document.getElementById('systemArch').textContent.trim(),
          systemHost: document.getElementById('systemHost').textContent.trim(),
          systemBoot: document.getElementById('systemBoot').textContent.trim(),
          updated: document.getElementById('performanceUpdated').textContent.trim()
        }
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  const value = result.result.value;
  assert.equal(typeof value.payload.cpu.usage, "number");
  assert.equal(typeof value.payload.memory.usage, "number");
  assert.equal(typeof value.payload.disk.usage, "number");
  assert.ok(value.payload.sampledAt);
  assert.ok(value.dom.cpuUsage.endsWith("%"));
  assert.ok(value.dom.memoryUsage.endsWith("%"));
  assert.ok(value.dom.diskUsage.endsWith("%"));
  assert.equal(value.layout.scrollWidth, value.layout.clientWidth);
  assert.ok(value.layout.bottomDelta <= 1);
  assert.notEqual(value.dom.systemArch, "不适用");
  console.log(JSON.stringify(value, null, 2));
  socket.close();
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
