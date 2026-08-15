"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createIslandNotificationController } = require("../renderer/island-notification-controller");

const delivery = (id, source = "calendar", type = "event") => ({ record: { id, source, type, title: `title-${id}`, body: `body-${id}` }, unreadCount: 3 });

test("transition-blocked deliveries retain order and active arrivals queue behind the visible card", async () => {
  const controller = createIslandNotificationController({ actions: { dismiss: async () => {} } });
  controller.setBlocked(true);
  controller.enqueue(delivery("a", "calendar", "event"));
  controller.enqueue(delivery("b", "mail", "new-mail"));
  assert.deepEqual(controller.snapshot(), { active: null, queue: [{ id: "a", count: 1 }, { id: "b", count: 1 }], blocked: true });
  controller.setBlocked(false);
  controller.enqueue(delivery("c", "performance", "cpu"));
  assert.equal(controller.current().id, "a");
  assert.deepEqual(controller.snapshot().queue.map((item) => item.id), ["b", "c"]);
  await controller.handle("dismiss");
  assert.equal(controller.current().id, "b");
});

test("same source and type aggregate in place without reordering other groups", () => {
  const controller = createIslandNotificationController();
  controller.setBlocked(true);
  controller.enqueue(delivery("a", "mail", "new-mail"));
  controller.enqueue(delivery("b", "calendar", "event"));
  controller.enqueue(delivery("c", "mail", "new-mail"));
  assert.deepEqual(controller.snapshot().queue, [{ id: "a", count: 2 }, { id: "b", count: 1 }]);
  controller.setBlocked(false);
  assert.deepEqual(controller.current().ids, ["a", "c"]);
});

test("async open captures its selected id and a new arrival cannot be opened or marked read", async () => {
  let resolveOpen;
  const calls = [];
  const controller = createIslandNotificationController({ actions: {
    open: (id) => new Promise((resolve) => { calls.push(["open", id]); resolveOpen = resolve; }),
    read: async (id) => calls.push(["read", id])
  }});
  controller.enqueue(delivery("a"));
  const opening = controller.handle("open");
  controller.enqueue(delivery("b", "mail", "new-mail"));
  resolveOpen();
  await opening;
  assert.deepEqual(calls, [["open", "a"]]);
  assert.equal(controller.current().id, "b");
});

test("attention starts once and restores after action or timeout", async () => {
  const attention = [];
  const timers = [];
  const controller = createIslandNotificationController({
    actions: { read: async () => {} },
    onAttention: (active) => attention.push(active),
    setTimer: (fn) => { timers.push(fn); return fn; },
    clearTimer: () => {}
  });
  controller.enqueue(delivery("a"));
  assert.deepEqual(attention, [true]);
  await controller.handle("read");
  assert.deepEqual(attention, [true, false]);
  controller.enqueue(delivery("b"));
  timers.at(-1)();
  assert.deepEqual(attention, [true, false, true, false]);
});
