"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

test("notification defaults expose the single performance rules object", () => {
  const { DEFAULT_NOTIFICATION_SETTINGS } = require("../notifications/notification-model.js");
  assert.deepEqual(DEFAULT_NOTIFICATION_SETTINGS.performanceRules, { cpuThreshold: 90, memoryThreshold: 85, diskFreePercentThreshold: 10, diskFreeBytesThreshold: 20 * 1024 ** 3, sustainMs: 120000, cooldownMs: 1800000 });
});

test("workspace sync validators accept bounded countdowns and alarms and reject malformed input", () => {
  const { validateCountdowns, validateAlarms } = require("../notifications/notification-scheduler.js");
  assert.equal(validateCountdowns([{ id: "c", name: "Tea", date: "2026-08-13T10:00:00Z", status: "active", createdAt: "2026-08-13T09:00:00Z" }]).length, 1);
  assert.throws(() => validateCountdowns([{ id: "", name: "Tea", date: "bad" }]), /countdown/);
  assert.deepEqual(validateAlarms([{ id: "a", title: "Wake", time: "07:30", status: "active", recurrence: "weekdays", weekdays: [1, 2, 3, 4, 5], createdAt: "2026-08-13T00:00:00Z" }])[0].weekdays, [1, 2, 3, 4, 5]);
  assert.throws(() => validateAlarms([{ id: "a", title: "Wake", time: "25:30", status: "active", recurrence: "daily", createdAt: "2026-08-13T00:00:00Z" }]), /alarm/);
});

test("main owns the single performance monitor and old calendar point loop is gone", () => {
  const main = read("main.js");
  assert.equal((main.match(/createPerformanceMonitor\s*\(/g) || []).length, 1);
  assert.match(main, /createScheduler\s*\(/);
  assert.doesNotMatch(main, /checkCalendarReminders|reminderEvents|deliveredReminders/);
  assert.match(main, /powerMonitor\.on\("resume"/);
  assert.match(main, /settings:\s*notificationService\.settings\(\)\.performanceRules/);
  assert.match(main, /isTrustedWorkspaceEvent\(event,\s*mainWindow\.webContents\)/);
});

test("preload performance change subscription clones values and returns unsubscribe", () => {
  const preload = read("preload.js");
  assert.match(preload, /onPerformanceChanged:\s*\(listener\)/);
  assert.match(preload, /system:performance:changed/);
  assert.match(preload, /removeListener\("system:performance:changed"/);
  assert.match(preload, /cloneNotificationValue\(value\)/);
  assert.match(preload, /syncCountdowns/);
  assert.match(preload, /syncAlarms/);
  assert.match(preload, /onCountdownsChanged/);
});

test("renderers request one initial snapshot and subscribe without recurring OS polling", () => {
  for (const name of ["app.js", "island.js"]) {
    const source = read("renderer", name);
    assert.match(source, /onPerformanceChanged/);
    assert.doesNotMatch(source, /setInterval\s*\(\s*updatePerformance/);
  }
});

test("countdown completion subscription is registered once and countdown IPC has one alias", () => {
  const app = read("renderer", "app.js");
  const preload = read("preload.js");
  const html = read("renderer", "index.html");
  assert.match(html, /scheduler-controller\.js/);
  assert.equal((app.match(/schedulerController\?\.start\s*\(/g) || []).length, 1);
  assert.equal((preload.match(/ipcRenderer\.send\("island:countdowns:update"/g) || []).length, 1);
});
