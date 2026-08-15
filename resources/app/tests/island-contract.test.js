"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
const preload = fs.readFileSync(path.join(root, "preload.js"), "utf8");
const app = fs.readFileSync(path.join(root, "renderer", "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "renderer", "index.html"), "utf8");

test("native island geometry uses a 48px CSS-antialiased capsule without setShape", () => {
  assert.match(main, /ISLAND_COLLAPSED_SIZE\s*=\s*\{\s*width:\s*306,\s*height:\s*48\s*\}/);
  assert.doesNotMatch(main, /\.setShape\s*\(/);
  assert.doesNotMatch(main, /applyIslandShape\s*\(/);
});

test("island settings persist a locked boolean", () => {
  assert.match(main, /ISLAND_DEFAULTS\s*=\s*\{[^}]*locked:\s*false/);
  assert.match(main, /locked:\s*stored\.locked\s*===\s*true/);
  assert.match(main, /writeIslandSettings\(\{\s*locked:\s*Boolean\(locked\)\s*\}\)/);
});

test("native interaction combines idle and locked states with forwarded mouse events", () => {
  assert.match(main, /function\s+applyIslandInteraction\s*\(/);
  assert.match(main, /setIgnoreMouseEvents\(ignore,\s*\{\s*forward:\s*true\s*\}\)/);
  assert.match(main, /ipcMain\.on\("island:interaction:set"[^]*idle/);
  assert.match(main, /ipcMain\.handle\("island:lock:set"/);
  assert.match(main, /webContents\.send\("island:settings-changed"/);
});

test("preload exposes native idle interaction and persistent lock controls", () => {
  assert.match(preload, /setInteraction:\s*\([^)]*\)\s*=>\s*ipcRenderer\.send\("island:interaction:set"/);
  assert.match(preload, /setLocked:\s*\([^)]*\)\s*=>\s*ipcRenderer\.invoke\("island:lock:set"/);
});

test("Ctrl+Alt+I and the tray both toggle lock state", () => {
  assert.match(main, /globalShortcut/);
  assert.match(main, /globalShortcut\.register\("CommandOrControl\+Alt\+I"/);
  assert.match(main, /app\.on\("will-quit"[^]*globalShortcut\.unregisterAll\(\)/);
  assert.match(main, /function\s+refreshTrayMenu\s*\(/);
  assert.match(main, /locked\s*\?\s*["'`]解除锁定["'`]\s*:\s*["'`]锁定灵动岛["'`]/);
});

test("unlock atomically clears idle pass-through and wakes the renderer", () => {
  assert.match(main, /if \(!settings\.locked\)\s*\{\s*islandIdle = false;/);
  assert.match(main, /islandWindow\?\.webContents\.send\("island:wake"\)/);
  assert.match(preload, /onWake/);
  assert.match(app, /islandShortcutAvailable/);
});

test("main settings UI displays and binds the lock control", () => {
  assert.match(html, /id="islandLocked"/);
  assert.match(html, /Ctrl\+Alt\+I/);
  assert.match(app, /\$\("#islandLocked"\)\.checked\s*=\s*settings\?\.locked\s*===\s*true/);
  assert.match(app, /\$\("#islandLocked"\)\.addEventListener\("change"[^]*api\.island\.setLocked/);
});
