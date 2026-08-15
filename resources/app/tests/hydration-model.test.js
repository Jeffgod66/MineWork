"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../hydration-model.js");

const day = new Date("2026-08-13T09:00:00+08:00");

test("setHydrationGoal catches values outside the 500 to 6000ml bounds", () => {
  let state = model.normalizeHydration({}, day);
  assert.equal(state.goal, 2000);
  assert.equal(model.setHydrationGoal(state, 499).goal, 2000);
  assert.equal(model.setHydrationGoal(state, 500).goal, 500);
  assert.equal(model.setHydrationGoal(state, 6000).goal, 6000);
  assert.equal(model.setHydrationGoal(state, 6001).goal, 2000);
});

test("addHydrationEntry and undoHydrationEntry catch mutation and wrong-day removal", () => {
  const state = model.normalizeHydration({}, day);
  const added = model.addHydrationEntry(state, 300, "2026-08-13T09:15:00+08:00");
  assert.equal(added.amount, 300);
  assert.equal(state.entries.length, 0);
  assert.equal(model.undoHydrationEntry(added).amount, 0);
});

test("addHydrationEntry catches percent overflow while retaining actual amount", () => {
  const state = model.setHydrationGoal(model.normalizeHydration({}, day), 500);
  const added = model.addHydrationEntry(state, 700, "2026-08-13T09:15:00+08:00");
  assert.equal(added.amount, 700);
  assert.equal(added.percent, 100);
});

test("normalizeHydration catches day rollover losing archive and goal", () => {
  const yesterday = model.addHydrationEntry(model.setHydrationGoal(model.normalizeHydration({}, new Date("2026-08-12T09:00:00+08:00")), 2500), 300, "2026-08-12T09:15:00+08:00");
  const today = model.normalizeHydration(yesterday, day);
  assert.equal(today.goal, 2500);
  assert.equal(today.amount, 0);
  assert.deepEqual(today.archives[0], { date: "2026-08-12", amount: 300, goal: 2500, percent: 12, entries: 1 });
});

test("hydrationReminderDue catches reminders outside active time quiet hours interval and completed goal", () => {
  const state = model.addHydrationEntry(model.normalizeHydration({}, day), 200, "2026-08-13T09:00:00+08:00");
  const settings = { enabled: true, intervalMinutes: 60, activeStart: "08:00", activeEnd: "22:00", quietStart: "12:00", quietEnd: "13:00" };
  assert.equal(model.hydrationReminderDue(state, settings, new Date("2026-08-13T07:00:00+08:00")), false);
  assert.equal(model.hydrationReminderDue(state, settings, new Date("2026-08-13T12:30:00+08:00")), false);
  assert.equal(model.hydrationReminderDue(state, settings, new Date("2026-08-13T09:30:00+08:00")), false);
  assert.equal(model.hydrationReminderDue(state, settings, new Date("2026-08-13T10:01:00+08:00")), true);
  assert.equal(model.hydrationReminderDue(model.addHydrationEntry(model.setHydrationGoal(state, 500), 300, "2026-08-13T09:20:00+08:00"), settings, new Date("2026-08-13T11:00:00+08:00")), false);
});

test("normalizeHydration catches UTC-date rollover instead of using the local calendar day", () => {
  const priorDay = model.addHydrationEntry(model.normalizeHydration({}, new Date("2026-08-12T09:00:00+08:00")), 250, "2026-08-12T20:00:00+08:00");
  const localNextDay = model.normalizeHydration(priorDay, new Date("2026-08-12T16:30:00.000Z"));
  assert.equal(localNextDay.date, "2026-08-13");
  assert.deepEqual(localNextDay.archives[0], { date: "2026-08-12", amount: 250, goal: 2000, percent: 13, entries: 1 });
});

test("hydrationReminderDue catches active windows spanning midnight without quiet hours", () => {
  const state = model.addHydrationEntry(model.normalizeHydration({}, new Date("2026-08-14T00:00:00+08:00")), 200, "2026-08-14T00:00:00+08:00");
  const settings = { enabled: true, intervalMinutes: 60, activeStart: "22:00", activeEnd: "06:00" };
  assert.equal(model.hydrationReminderDue(state, settings, new Date("2026-08-14T01:01:00+08:00")), true);
});
