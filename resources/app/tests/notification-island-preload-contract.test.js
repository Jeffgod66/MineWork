"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("notification preload exposes cloned delivery subscription, open, and unsubscribe", () => {
  const preload = fs.readFileSync(path.join(__dirname, "..", "preload.js"), "utf8");
  assert.match(preload, /open:\s*\(id\)\s*=>\s*ipcRenderer\.invoke\("notifications:open",\s*id\)/);
  assert.match(preload, /onDelivery:\s*\(listener\)/);
  assert.match(preload, /listener\(cloneNotificationValue\(payload\)\)/);
  assert.match(preload, /ipcRenderer\.on\("notifications:delivery",\s*handler\)/);
  assert.match(preload, /removeListener\("notifications:delivery",\s*handler\)/);
});

test("notification action IPC accepts only the main window or island top frame", () => {
  const main = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  assert.match(main, /function requireNotificationConsumer\(event\)/);
  assert.match(main, /isTrustedNotificationEvent\(event,\s*islandWindow\.webContents\)/);
  for (const channel of ["mark-read", "dismiss", "open"]) {
    const handler = main.match(new RegExp(`ipcMain\\.handle\\(\"notifications:${channel}\"[\\s\\S]{0,180}?requireNotificationConsumer\\(event\\)`));
    assert.ok(handler, `missing notifications:${channel} handler`);
  }
});
