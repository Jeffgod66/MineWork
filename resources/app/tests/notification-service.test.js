"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createNotificationStore } = require("../notifications/notification-store.js");
const { createNotificationService } = require("../notifications/notification-service.js");

const instant = new Date("2026-08-13T02:30:00.000Z");
function setup(settingsPatch = {}, failures = {}) {
  let records = [], savedSettings = settingsPatch;
  const outcomes = { windows: [], main: [], island: [], navigation: [] };
  const store = createNotificationStore({
    read: () => structuredClone(records), write: (_key, value) => { records = structuredClone(value); }, now: () => instant.getTime()
  });
  const service = createNotificationService({
    store,
    showWindows: (record, click) => { outcomes.windows.push({ record, click }); if (failures.windows) throw new Error("windows failed"); },
    publishMain: (snapshot) => outcomes.main.push(snapshot),
    publishIsland: (record, unreadCount) => outcomes.island.push({ record, unreadCount }),
    navigate: (page) => outcomes.navigation.push(page),
    readSettings: () => structuredClone(savedSettings),
    writeSettings: (value) => { savedSettings = structuredClone(value); },
    now: () => instant.getTime()
  });
  return { service, store, outcomes, savedSettings: () => savedSettings };
}

function input(overrides = {}) {
  return { source: "calendar", entityId: "event-1", type: "reminder", title: "Standup", body: "In 10 minutes", severity: "info", scheduledAt: instant.toISOString(), targetPage: "calendar", ...overrides };
}

test("quiet hours retain history and publish main without Windows or island delivery", () => {
  const ctx = setup({ quietHours: { enabled: true, start: "00:00", end: "23:59" } });
  const result = ctx.service.ingest(input());
  assert.equal(result.created, true);
  assert.equal(ctx.store.snapshot().totalCount, 1);
  assert.equal(ctx.outcomes.main.length, 1);
  assert.equal(ctx.outcomes.windows.length, 0);
  assert.equal(ctx.outcomes.island.length, 0);
});

test("channel switches, duplicate delivery, and Windows failure preserve history and main publishing", () => {
  const switched = setup({ channels: { windows: false, island: true, sound: false } });
  switched.service.ingest(input());
  switched.service.ingest(input({ id: "duplicate" }));
  assert.equal(switched.outcomes.windows.length, 0);
  assert.equal(switched.outcomes.island.length, 1);
  assert.equal(switched.outcomes.main.length, 1);
  const failing = setup({}, { windows: true });
  assert.doesNotThrow(() => failing.service.ingest(input()));
  assert.equal(failing.store.snapshot().totalCount, 1);
  assert.equal(failing.outcomes.main.length, 1);
});

test("Windows click and open action navigate and mark the record read", () => {
  const ctx = setup();
  const created = ctx.service.ingest(input());
  ctx.outcomes.windows[0].click();
  assert.equal(ctx.store.snapshot().unreadCount, 0);
  assert.deepEqual(ctx.outcomes.navigation, ["calendar"]);
  const second = ctx.service.ingest(input({ entityId: "event-2", scheduledAt: "2026-08-13T03:00:00Z", targetPage: "tasks" }));
  ctx.service.handleAction({ action: "open", id: second.record.id });
  assert.equal(ctx.store.list().find((item) => item.id === second.record.id).status, "read");
  assert.deepEqual(ctx.outcomes.navigation, ["calendar", "tasks"]);
});

test("read, dismiss, read-all, and clear actions publish changed snapshots", () => {
  const ctx = setup({ channels: { windows: false, island: false, sound: false } });
  const first = ctx.service.ingest(input());
  const second = ctx.service.ingest(input({ entityId: "two", scheduledAt: "2026-08-13T03:00:00Z" }));
  ctx.service.handleAction({ action: "read", id: first.record.id });
  ctx.service.handleAction({ action: "dismiss", id: first.record.id });
  ctx.service.handleAction({ action: "read-all" });
  assert.equal(ctx.store.list().find((item) => item.id === second.record.id).status, "read");
  ctx.service.handleAction({ action: "clear" });
  assert.equal(ctx.store.snapshot().totalCount, 0);
  assert.equal(ctx.outcomes.main.at(-1).totalCount, 0);
});

test("settings merge known valid values, persist, and reject invalid patches", () => {
  const ctx = setup();
  const settings = ctx.service.updateSettings({ retentionDays: 14, mailPrivacy: true, channels: { windows: false }, quietHours: { enabled: true, start: "21:30", end: "06:15" }, sources: { mail: false } });
  assert.equal(settings.retentionDays, 14);
  assert.equal(settings.channels.windows, false);
  assert.equal(settings.channels.island, true);
  assert.equal(settings.sources.mail, false);
  assert.equal(settings.mailPrivacy, true);
  assert.equal(ctx.savedSettings().mailPrivacy, true);
  assert.equal(ctx.savedSettings().quietHours.start, "21:30");
  assert.throws(() => ctx.service.updateSettings({ retentionDays: 0 }), /retentionDays/);
  assert.throws(() => ctx.service.updateSettings({ channels: { windows: "no" } }), /windows/);
  assert.throws(() => ctx.service.updateSettings({ unknown: true }), /unknown/);
  assert.throws(() => ctx.service.updateSettings({ mailPrivacy: "yes" }), /mailPrivacy/);
});

test("test notification uses the documented source, target, title and a unique occurrence", () => {
  const ctx = setup({ channels: { windows: false, island: true, sound: true } });
  const first = ctx.service.testNotification();
  const second = ctx.service.testNotification();
  assert.equal(first.record.source, "calendar");
  assert.equal(first.record.type, "test");
  assert.equal(first.record.targetPage, "notifications");
  assert.equal(first.record.title, "MineWork 测试通知");
  assert.notEqual(first.record.dedupeKey, second.record.dedupeKey);
  assert.equal(ctx.outcomes.island.length, 2);
});
