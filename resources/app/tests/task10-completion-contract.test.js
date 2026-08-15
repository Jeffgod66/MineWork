"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { normalizeNotification, DEFAULT_NOTIFICATION_SETTINGS, deliveryDecision } = require("../notifications/notification-model.js");
const { createNotificationService, validateSettingsPatch } = require("../notifications/notification-service.js");
const { createNotificationStore } = require("../notifications/notification-store.js");
const { buildHolidayReminders } = require("../holiday-reminders.js");
const { readJsonObject, writeJsonAtomic } = require("../atomic-json-store.js");
const ui = require("../renderer/ui-model.js");

const now = Date.parse("2026-08-13T01:00:00.000Z");

test("normalized notification records retain occurredAt and groupKey", () => {
  const record = normalizeNotification({ source: "calendar", entityId: "e1", title: "日程", body: "开始", scheduledAt: "2026-08-13T02:00:00Z", occurredAt: "2026-08-13T01:59:00Z", groupKey: "calendar:today" }, now);
  assert.equal(record.occurredAt, "2026-08-13T01:59:00.000Z");
  assert.equal(record.groupKey, "calendar:today");
});

test("masterEnabled disables delivery without erasing source preferences", () => {
  assert.equal(DEFAULT_NOTIFICATION_SETTINGS.masterEnabled, true);
  const settings = { ...DEFAULT_NOTIFICATION_SETTINGS, masterEnabled: false, sources: { ...DEFAULT_NOTIFICATION_SETTINGS.sources, mail: true } };
  assert.deepEqual(deliveryDecision({ source: "mail", severity: "info" }, settings, now), { history: true, windows: false, island: false, sound: false });
  assert.deepEqual(validateSettingsPatch({ masterEnabled: false }), { masterEnabled: false });
});

test("notification service validates target routes and resets true defaults", () => {
  let records = [], saved = { masterEnabled: false, sources: { mail: false } };
  const store = createNotificationStore({ read: () => records, write: (_key, value) => { records = structuredClone(value); }, now: () => now });
  const service = createNotificationService({ store, showWindows() {}, publishMain() {}, publishIsland() {}, navigate() {}, readSettings: () => saved, writeSettings: (value) => { saved = structuredClone(value); }, now: () => now });
  assert.throws(() => service.ingest({ source: "calendar", entityId: "x", title: "bad", scheduledAt: new Date(now).toISOString(), targetPage: "../../unsafe" }), /targetPage/);
  const defaults = service.resetSettings();
  assert.equal(defaults.masterEnabled, true);
  assert.equal(defaults.sources.mail, true);
  assert.equal(saved.masterEnabled, true);
});

test("store limits follow current persisted notification settings", () => {
  let records = [], limits = { maxRecords: 3, retentionDays: 30 };
  const store = createNotificationStore({ read: () => records, write: (_key, value) => { records = structuredClone(value); }, now: () => now, limits: () => limits });
  for (let index = 0; index < 4; index += 1) store.ingest({ id: String(index), source: "calendar", status: "read", createdAt: new Date(now + index).toISOString(), dedupeKey: String(index) });
  assert.equal(store.snapshot().totalCount, 3);
  limits = { maxRecords: 2, retentionDays: 30 };
  assert.equal(store.snapshot().totalCount, 2);
});

test("holiday settings build official China, traditional and international reminders independently", () => {
  const china = require("../assets/holidays/cn-2026.json");
  const international = require("../assets/holidays/international.json");
  const all = buildHolidayReminders({ china, international, year: 2026, settings: { enabled: true, time: "09:00", daysBefore: 1, categories: { chinaOfficial: true, chinaTraditional: true, international: true } } });
  assert.ok(all.some((item) => item.category === "china-official"));
  assert.ok(all.some((item) => item.category === "china-traditional"));
  assert.ok(all.some((item) => item.category === "international"));
  const onlyInternational = buildHolidayReminders({ china, international, year: 2026, settings: { enabled: true, time: "08:30", daysBefore: 0, categories: { chinaOfficial: false, chinaTraditional: false, international: true } } });
  assert.ok(onlyInternational.length > 0);
  assert.ok(onlyInternational.every((item) => item.category === "international" && item.time === "08:30"));
});

test("calendar visibility separates official, traditional, international and personal signals", () => {
  const filters = { events: true, tasks: true, officialHolidays: false, traditionalFestivals: true, internationalDates: false, anniversaries: true };
  assert.deepEqual(ui.calendarSignalVisibility(filters, { eventCount: 1, taskCount: 1, officialHoliday: true, traditionalFestival: true, internationalDate: true, anniversary: true }), {
    event: true, task: true, officialHoliday: false, traditionalFestival: true, internationalDate: false, holiday: true, anniversary: true
  });
});

test("atomic JSON writes preserve the last valid object when the primary file is corrupted", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "minework-atomic-"));
  const file = path.join(directory, "state.json");
  writeJsonAtomic(file, { version: 1 });
  writeJsonAtomic(file, { version: 2 });
  fs.writeFileSync(file, "{broken", "utf8");
  assert.deepEqual(readJsonObject(file, { fallback: {} }), { version: 1 });
  assert.equal(fs.existsSync(`${file}.tmp`), false);
});

test("main authorizes generic workspace writes and exposes the full settings controls", () => {
  const main = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "..", "renderer", "index.html"), "utf8");
  assert.match(main, /ipcMain\.on\("store:set", \(event, key, value\) => \{\s*try \{ requireWorkspaceMain\(event\);/);
  for (const name of ["masterEnabled", "performanceRules.diskFreeBytesThresholdGb", "performanceRules.cooldownMinutes", "holidayReminder.enabled", "holidayReminder.chinaOfficial", "holidayReminder.chinaTraditional", "holidayReminder.international"]) assert.match(html, new RegExp(`name=["']${name.replace(".", "\\.")}["']`));
  assert.match(main, /notifications:settings:reset/);
});
