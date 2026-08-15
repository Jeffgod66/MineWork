"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createWorkspaceMutationHandlers, createClonedSubscription } = require("../notifications/notification-runtime.js");
const { createSchedulerController } = require("../renderer/scheduler-controller.js");

function workspaceHarness() {
  const effects = [];
  let authorized = false;
  const handlers = createWorkspaceMutationHandlers({
    authorize: () => { effects.push("authorize"); if (!authorized) throw new Error("unauthorized"); },
    validateCountdowns: (value) => { effects.push("validate-countdowns"); return value; },
    validateAlarms: (value) => { effects.push("validate-alarms"); return value; },
    validateCalendarEvents: (value) => { effects.push("validate-calendar"); return value; },
    writeWorkspace: (key) => effects.push(`write-${key}`),
    reload: () => effects.push("reload"),
    publishCountdowns: () => effects.push("publish-countdowns")
  });
  return { handlers, effects, authorize: () => { authorized = true; } };
}

for (const [name, input, write] of [["countdowns", [], "write-countdowns"], ["alarms", [], "write-alarms"], ["calendar", [], "write-calendar-events"]]) {
  test(`${name} handler authorizes before validation and mutation`, () => {
    const h = workspaceHarness();
    assert.throws(() => h.handlers[name]({}, input), /unauthorized/);
    assert.deepEqual(h.effects, ["authorize"]);
    h.effects.length = 0;
    h.authorize();
    h.handlers[name]({}, input);
    assert.equal(h.effects[0], "authorize");
    assert.ok(h.effects.indexOf(write) > h.effects.findIndex((item) => item.startsWith("validate-")));
    assert.ok(h.effects.indexOf("reload") > h.effects.indexOf(write));
  });
}

test("preload-style cloned subscription unsubscribes from real emitter effects", () => {
  const emitter = new EventEmitter();
  const received = [];
  const unsubscribe = createClonedSubscription(emitter, "changed", (value) => { value.items.push("listener"); received.push(value); });
  const original = { items: [] };
  emitter.emit("changed", {}, original);
  assert.deepEqual(received, [{ items: ["listener"] }]);
  assert.deepEqual(original, { items: [] });
  unsubscribe();
  emitter.emit("changed", {}, { items: [] });
  assert.equal(received.length, 1);
});

test("renderer scheduler controller registers once and alarm edits never add callbacks", () => {
  let subscriptions = 0, unsubscriptions = 0, alarmSends = 0;
  const controller = createSchedulerController({ scheduler: { syncCountdowns: () => {}, syncAlarms: () => { alarmSends += 1; }, onCountdownsChanged: () => { subscriptions += 1; return () => { unsubscriptions += 1; }; } }, saveAlarms: () => {}, applyCountdowns: () => {} });
  const stopA = controller.start();
  const stopB = controller.start();
  controller.syncAlarms([]);
  controller.syncAlarms([]);
  assert.equal(subscriptions, 1);
  assert.equal(alarmSends, 2);
  assert.strictEqual(stopA, stopB);
  stopA();
  assert.equal(unsubscriptions, 1);
});
