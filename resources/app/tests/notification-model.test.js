"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../notifications/notification-model.js");

const now = new Date("2026-08-13T10:00:00+08:00");

test("normalizeNotification catches invalid sources and overlong title or body", () => {
  assert.equal(model.normalizeNotification({ source: "unknown", title: "x", scheduledAt: now.toISOString() }, now), null);
  const value = model.normalizeNotification({ source: "mail", title: "a".repeat(121), body: "b".repeat(501), scheduledAt: now.toISOString() }, now);
  assert.equal(Array.from(value.title).length, 120);
  assert.equal(Array.from(value.body).length, 500);
});

test("notificationDedupeKey catches a rescheduled occurrence being treated as duplicate", () => {
  const base = { source: "calendar", entityId: "event-1", scheduledAt: "2026-08-13T10:00:00.000Z" };
  assert.notEqual(model.notificationDedupeKey(base), model.notificationDedupeKey({ ...base, scheduledAt: "2026-08-14T10:00:00.000Z" }));
});

test("isQuietHours catches same-day and midnight-spanning quiet intervals", () => {
  assert.equal(model.isQuietHours({ quietHours: { enabled: true, start: "12:00", end: "13:00" } }, new Date("2026-08-13T12:30:00+08:00")), true);
  assert.equal(model.isQuietHours({ quietHours: { enabled: true, start: "22:00", end: "07:00" } }, new Date("2026-08-13T23:00:00+08:00")), true);
  assert.equal(model.isQuietHours({ quietHours: { enabled: true, start: "22:00", end: "07:00" } }, new Date("2026-08-13T08:00:00+08:00")), false);
});

test("DEFAULT_NOTIFICATION_SETTINGS catches changed retention defaults", () => {
  assert.equal(model.DEFAULT_NOTIFICATION_SETTINGS.retentionDays, 30);
  assert.equal(model.DEFAULT_NOTIFICATION_SETTINGS.maxRecords, 500);
  assert.equal(model.DEFAULT_NOTIFICATION_SETTINGS.mailPrivacy, false);
});

test("deliveryDecision catches quiet hours suppressing channels but not history and honors switches", () => {
  const record = model.normalizeNotification({ source: "hydration", title: "Drink", severity: "critical", scheduledAt: now.toISOString() }, now);
  const settings = { sources: { hydration: true }, channels: { windows: true, island: true, sound: true }, quietHours: { enabled: true, start: "09:00", end: "11:00" } };
  assert.deepEqual(model.deliveryDecision(record, settings, now), { history: true, windows: false, island: false, sound: false });
  assert.deepEqual(model.deliveryDecision(record, { ...settings, quietHours: { enabled: false }, channels: { windows: true, island: false, sound: true } }, now), { history: true, windows: true, island: false, sound: true });
  assert.deepEqual(model.deliveryDecision(record, { ...settings, quietHours: { enabled: false }, sources: { hydration: false } }, now), { history: true, windows: false, island: false, sound: false });
});
