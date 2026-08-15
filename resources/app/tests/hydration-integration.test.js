"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const hydrationModel = require("../hydration-model.js");
const { createHydrationController } = require("../renderer/hydration-controller.js");

function harness(initial = {}, instant = "2026-08-13T09:00:00+08:00") {
  let stored = structuredClone(initial);
  let clock = new Date(instant);
  const calls = { save: [], sync: [], reload: 0, render: [] };
  const controller = createHydrationController({
    model: hydrationModel,
    load: () => structuredClone(stored),
    save: (value) => { stored = structuredClone(value); calls.save.push(structuredClone(value)); },
    syncWorkspace: (value) => calls.sync.push(structuredClone(value)),
    reloadScheduler: () => { calls.reload += 1; },
    now: () => new Date(clock),
    onRender: (value, event) => calls.render.push([structuredClone(value), structuredClone(event)])
  });
  return { controller, calls, stored: () => structuredClone(stored), setNow: (value) => { clock = new Date(value); } };
}

test("controller initializes a same-day detached normalized snapshot without persisting", () => {
  const frozen = Object.freeze({ date: "2026-08-13", goal: 2000, entries: Object.freeze([]) });
  const h = harness(frozen);
  const result = h.controller.initialize();
  assert.equal(result.ok, true);
  assert.deepEqual(h.calls.save, []);
  assert.equal(h.calls.render.length, 1);
  assert.equal(h.calls.sync.length, 1);
  assert.doesNotThrow(() => { result.state.entries.push({}); });
  assert.equal(h.controller.snapshot().entries.length, 0);
});

test("goal boundaries and presets persist, render and sync exactly once", () => {
  const h = harness();
  h.controller.initialize();
  for (const goal of [500, 1500, 2000, 2500, 3000, 6000]) {
    const before = { save: h.calls.save.length, sync: h.calls.sync.length, render: h.calls.render.length };
    assert.equal(h.controller.setGoal(goal).ok, true);
    assert.equal(h.controller.snapshot().goal, goal);
    assert.equal(h.calls.save.length, before.save + 1);
    assert.equal(h.calls.sync.length, before.sync + 1);
    assert.equal(h.calls.render.length, before.render + 1);
  }
  assert.deepEqual(h.controller.setGoal(499), { ok: false, error: "Goal must be between 500 and 6000 ml." });
  assert.equal(h.controller.snapshot().goal, 6000);
});

test("quick add, undo and no-entry undo preserve state and call adapters correctly", () => {
  const h = harness();
  h.controller.initialize();
  assert.deepEqual(h.controller.undo(), { ok: false, error: "There is no hydration entry to undo." });
  assert.equal(h.calls.save.length, 0);
  for (const amount of [150, 250, 350, 500]) assert.equal(h.controller.add(amount).ok, true);
  assert.equal(h.controller.snapshot().amount, 1250);
  assert.equal(h.controller.snapshot().entries.length, 4);
  assert.equal(h.controller.undo().ok, true);
  assert.equal(h.controller.snapshot().amount, 750);
  assert.equal(h.calls.save.length, 5);
  assert.equal(h.calls.sync.length, 6);
});

test("invalid mutations do not lose current state", () => {
  const h = harness();
  h.controller.initialize();
  h.controller.add(250);
  const before = h.controller.snapshot();
  assert.equal(h.controller.add(-1).ok, false);
  assert.equal(h.controller.updateReminder({ enabled: true, intervalMinutes: 14, activeStart: "08:00", activeEnd: "22:00" }).ok, false);
  assert.equal(h.controller.updateReminder({ enabled: true, intervalMinutes: 40, activeStart: "8am", activeEnd: "22:00" }).ok, false);
  assert.deepEqual(h.controller.snapshot(), before);
});

test("reminder settings validate, persist, sync, and reload scheduler once", () => {
  const h = harness();
  h.controller.initialize();
  const result = h.controller.updateReminder({ enabled: true, intervalMinutes: 30, activeStart: "08:00", activeEnd: "22:00" });
  assert.equal(result.ok, true);
  assert.deepEqual(h.controller.snapshot().reminder, { enabled: true, intervalMinutes: 30, activeStart: "08:00", activeEnd: "22:00" });
  assert.equal(h.calls.save.length, 1);
  assert.equal(h.calls.sync.length, 2);
  assert.equal(h.calls.render.length, 2);
  assert.equal(h.calls.reload, 1);
});

test("rollover archives the prior day while retaining goal and reminder", () => {
  const h = harness({ date: "2026-08-12", goal: 2500, entries: [{ amount: 300, occurredAt: "2026-08-12T09:15:00+08:00" }], reminder: { enabled: true, intervalMinutes: 30, activeStart: "08:00", activeEnd: "22:00" } });
  const result = h.controller.initialize();
  assert.equal(result.state.date, "2026-08-13");
  assert.equal(result.state.amount, 0);
  assert.equal(result.state.goal, 2500);
  assert.equal(result.state.archives[0].amount, 300);
  assert.equal(result.state.reminder.enabled, true);
  assert.equal(h.calls.save.length, 1);
  assert.deepEqual(h.stored(), result.state);
  assert.equal(h.calls.reload, 1);
  h.controller.initialize();
  assert.equal(h.calls.save.length, 1);
  h.setNow("2026-08-14T08:00:00+08:00");
  assert.equal(h.controller.rollover().ok, true);
  assert.equal(h.controller.snapshot().date, "2026-08-14");
});

test("first goal crossing emits one ripple per local day and never replays after undo", () => {
  const h = harness({ date: "2026-08-13", goal: 500, entries: [] });
  h.controller.initialize();
  assert.equal(h.controller.add(350).event.goalCrossed, false);
  assert.equal(h.controller.add(150).event.goalCrossed, true);
  assert.equal(h.controller.add(150).event.goalCrossed, false);
  h.controller.undo();
  h.controller.undo();
  assert.equal(h.controller.add(150).event.goalCrossed, false);
  assert.equal(h.controller.snapshot().amount, 500);
});
