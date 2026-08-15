"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createWorkspaceMutationHandlers } = require("../notifications/notification-runtime.js");
const { expandOccurrences } = require("../notifications/notification-scheduler.js");
const { normalizeAnniversary, validateHolidaySnapshot } = require("../calendar-model.js");
const china = require("../assets/holidays/cn-2026.json");

test("anniversary workspace mutation authorizes, validates, persists, and reloads shared scheduler", () => {
  const effects = [];
  const handlers = createWorkspaceMutationHandlers({
    authorize: () => effects.push("authorize"), validateCountdowns: (x) => x, validateAlarms: (x) => x, validateCalendarEvents: (x) => x,
    validateAnniversaries: (items) => items.map(normalizeAnniversary).filter(Boolean),
    writeWorkspace: (key, value) => effects.push([key, value]), reload: () => effects.push("reload"), publishCountdowns: () => {}
  });
  handlers.anniversaries({}, [{ id: "a", title: "纪念", type: "custom", calendar: "solar", recurrence: "once", date: "2026-08-13", allDay: false, time: "09:30", reminders: [0], enabled: true }]);
  assert.equal(effects[0], "authorize");
  assert.equal(effects[1][0], "anniversaries");
  assert.equal(effects[2], "reload");
});

test("scheduler expands anniversary reminders with stable dedupe keys without disturbing existing sources", () => {
  const workspace = {
    anniversaries: [{ id: "a", title: "纪念", type: "custom", calendar: "solar", recurrence: "once", date: "2026-08-13", allDay: false, time: "09:30", reminders: [0, 1], enabled: true }],
    "calendar-events": [{ id: "event", title: "会议", date: "2026-08-13T09:40:00+08:00", remindMinutes: 0 }],
    countdowns: [{ id: "countdown", name: "交付", date: "2026-08-13T09:50:00+08:00", status: "active" }]
  };
  const first = expandOccurrences(workspace, new Date("2026-08-12T00:00:00+08:00"), new Date("2026-08-13T10:00:00+08:00"));
  const second = expandOccurrences(structuredClone(workspace), new Date("2026-08-12T00:00:00+08:00"), new Date("2026-08-13T10:00:00+08:00"));
  assert.deepEqual(first, second);
  assert.deepEqual([...new Set(first.map((item) => item.source))].sort(), ["anniversary", "calendar", "countdown"]);
  const anniversary = first.filter((item) => item.source === "anniversary");
  assert.equal(anniversary.length, 2);
  assert.ok(anniversary.some((item) => item.scheduledAt.startsWith("2026-08-12T")));
  assert.ok(anniversary.every((item) => item.targetPage === "calendar" && item.key.startsWith("anniversary|a|")));
});

test("scheduler finds a seven-day reminder even when the anniversary due date is beyond the query window", () => {
  const workspace = { anniversaries: [{ id: "ahead", title: "提前提醒", type: "custom", calendar: "solar", recurrence: "once", date: "2026-08-13", allDay: false, time: "09:30", reminders: [7], enabled: true }] };
  const occurrences = expandOccurrences(workspace, new Date("2026-08-06T09:29:00+08:00"), new Date("2026-08-06T09:31:00+08:00"));
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].source, "anniversary");
  assert.equal(occurrences[0].dueAt, new Date("2026-08-13T09:30:00+08:00").toISOString());
});

test("holiday reminders are explicit opt-in occurrences and international data cannot set work status", () => {
  const workspace = { "holiday-reminders": [{ id: "spring", title: "春节", date: "2026-02-17", time: "09:00", enabled: true }] };
  const occurrences = expandOccurrences(workspace, new Date("2026-02-17T08:59:00+08:00"), new Date("2026-02-17T09:01:00+08:00"));
  assert.deepEqual(occurrences.map((item) => item.source), ["holiday"]);
  assert.equal(validateHolidaySnapshot(china, 2026).days["2026-02-17"], "rest");
});
