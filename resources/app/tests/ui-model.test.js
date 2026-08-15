"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../renderer/ui-model.js");

test("responsiveLayoutBand catches broken approved window thresholds", () => {
  assert.equal(model.responsiveLayoutBand(1600), "wide");
  assert.equal(model.responsiveLayoutBand(1360), "wide");
  assert.equal(model.responsiveLayoutBand(1180), "standard");
  assert.equal(model.responsiveLayoutBand(1080), "standard");
  assert.equal(model.responsiveLayoutBand(1024), "compact");
  assert.equal(model.responsiveLayoutBand(840), "compact");
  assert.equal(model.responsiveLayoutBand(760), "narrow");
});

test("performanceViewModel catches fabricated or incorrectly formatted system values", () => {
  const gib = 1024 ** 3;
  const view = model.performanceViewModel({
    cpu: { usage: 18.4, model: "Example CPU", speedMHz: 4200, physicalCores: 8, logicalCores: 16 },
    memory: { total: 32 * gib, free: 18 * gib, usage: 43.75 },
    disk: { root: "C:", total: 512 * gib, free: 186 * gib, usage: 63.67 },
    gpu: { name: "Example GPU", memory: 8 * gib },
    system: { caption: "Windows 11 Pro", version: "10.0.26100", arch: "x64", hostname: "MINEWORK", bootTime: "2026-08-11T01:00:00.000Z" },
    uptime: 28800,
    sampledAt: "2026-08-11T09:29:58+08:00"
  }, new Date("2026-08-11T09:30:00+08:00"));

  assert.equal(view.cpu.usageText, "18%");
  assert.equal(view.cpu.speedText, "4.20 GHz");
  assert.equal(view.cpu.topologyText, "8 核 / 16 线程");
  assert.equal(view.memory.availableText, "18.0 GB 可用");
  assert.equal(view.disk.freeText, "186.0 GB 剩余");
  assert.equal(view.gpu.memoryText, "8.0 GB 显存");
  assert.equal(view.system.osText, "Windows 11 Pro");
  assert.equal(view.system.archText, "x64");
  assert.equal(view.system.hostText, "MINEWORK");
  assert.equal(view.updatedLabel, "09:29:58 更新");
});

test("performanceViewModel catches zeros masquerading as unavailable metrics", () => {
  const view = model.performanceViewModel({ cpu: {}, memory: {}, disk: {}, gpu: {}, system: {} });
  assert.equal(view.cpu.usage, null);
  assert.equal(view.cpu.usageText, "--");
  assert.equal(view.cpu.speedText, "不适用");
  assert.equal(view.cpu.topologyText, "正在识别");
  assert.equal(view.memory.availableText, "不适用");
  assert.equal(view.disk.freeText, "不适用");
  assert.equal(view.gpu.memoryText, "不适用");
  assert.equal(view.system.osText, "正在识别");
  assert.equal(view.system.bootText, "不适用");
});

test("cloneMutableSnapshot detaches context-bridge frozen collections", () => {
  const snapshot = Object.freeze({ books: Object.freeze([]), nested: Object.freeze({ notes: Object.freeze([{ id: "n1" }]) }) });
  const clone = model.cloneMutableSnapshot(snapshot);
  clone.books.push({ id: "b1" });
  clone.nested.notes.unshift({ id: "n2" });
  assert.equal(clone.books.length, 1);
  assert.equal(clone.nested.notes.length, 2);
  assert.equal(snapshot.books.length, 0);
});

test("wrapIndex wraps forward and backward without producing a negative index", () => {
  assert.equal(model.wrapIndex(60, 60), 0);
  assert.equal(model.wrapIndex(-1, 60), 59);
});

test("quoteIndexForDate is deterministic and remains inside the collection", () => {
  assert.equal(model.quoteIndexForDate("2026-08-09", 60), model.quoteIndexForDate("2026-08-09", 60));
  assert.ok(model.quoteIndexForDate("2026-08-09", 60) >= 0);
  assert.ok(model.quoteIndexForDate("2026-08-09", 60) < 60);
});

test("bookCoverShift returns one of four stable glacier cover variants", () => {
  assert.equal(model.bookCoverShift("Designing Interfaces"), 0);
  assert.equal(model.bookCoverShift("Designing Interfaces"), 0);
  assert.ok(model.bookCoverShift("雪国") >= 0 && model.bookCoverShift("雪国") <= 3);
});

test("shortcutKind distinguishes folders, applications and documents", () => {
  assert.equal(model.shortcutKind({ path: "D:\\Work", kind: "folder" }), "folder");
  assert.equal(model.shortcutKind({ path: "D:\\Apps\\Editor.exe" }), "app");
  assert.equal(model.shortcutKind({ path: "D:\\Notes\\brief.pdf" }), "document");
});

test("nextIslandPage follows wheel direction and wraps across ten pages", () => {
  assert.equal(model.nextIslandPage(0, 10, 120, 0), 1);
  assert.equal(model.nextIslandPage(0, 10, -120, 0), 9);
  assert.equal(model.nextIslandPage(9, 10, 120, 0), 0);
});

test("islandPhasePlan delays collapse until visual exit finishes", () => {
  assert.deepEqual(model.islandPhasePlan(true, false), ["preparing", "expanding", "expanded"]);
  assert.deepEqual(model.islandPhasePlan(false, false), ["collapsing", "collapsed"]);
  assert.deepEqual(model.islandPhasePlan(false, true), ["collapsed"]);
});

test("workspaceSignalModel prioritizes real workspace data without inventing values", () => {
  const signals = model.workspaceSignalModel({
    taskProgress: { done: 2, total: 5 },
    hydration: { amount: 750, goal: 2000 },
    countdown: { name: "交付", target: "2026-08-10T08:00:00.000Z" }
  }, {
    cpu: { usage: 18 },
    memory: { usage: 42 }
  }, null, new Date("2026-08-09T08:00:00.000Z"));

  assert.deepEqual(signals.slice(0, 4).map(({ kind, value }) => ({ kind, value })), [
    { kind: "tasks", value: "2 / 5" },
    { kind: "hydration", value: "750 / 2000 ml" },
    { kind: "countdown", value: "24小时" },
    { kind: "performance", value: "CPU 18%" }
  ]);
});

test("hydration motion projection caps liquid while retaining actual amount", () => {
  assert.deepEqual([0, 40, 100, 130].map((percent) => model.hydrationMotionProjection({ amount: percent, goal: 100, mutation: "add", goalCrossed: percent === 100, reduceMotion: false })), [
    { level: 0, waterTransform: "translateY(100%)", bubbles: true, ripple: false, instant: false },
    { level: 40, waterTransform: "translateY(60%)", bubbles: true, ripple: false, instant: false },
    { level: 100, waterTransform: "translateY(0%)", bubbles: true, ripple: true, instant: false },
    { level: 100, waterTransform: "translateY(0%)", bubbles: true, ripple: false, instant: false }
  ]);
});

test("hydration motion projection suppresses decoration for non-add and reduced motion", () => {
  assert.deepEqual(model.hydrationMotionProjection({ amount: 800, goal: 2000, mutation: "undo", goalCrossed: false, reduceMotion: false }), { level: 40, waterTransform: "translateY(60%)", bubbles: false, ripple: false, instant: false });
  assert.deepEqual(model.hydrationMotionProjection({ amount: 800, goal: 2000, mutation: "add", goalCrossed: true, reduceMotion: true }), { level: 40, waterTransform: "translateY(60%)", bubbles: false, ripple: false, instant: true });
});

test("pageTransitionPlan never inserts an empty exit phase between functional pages", () => {
  assert.deepEqual(model.pageTransitionPlan(false), { exit: 0, enter: 180, stagger: 14 });
  assert.deepEqual(model.pageTransitionPlan(true), { exit: 0, enter: 1, stagger: 0 });
});

test("normalizeNoteImages keeps only local image data and caps a card at three images", () => {
  const images = model.normalizeNoteImages([
    "data:image/png;base64,AAA",
    "https://example.com/not-local.png",
    "data:image/jpeg;base64,BBB",
    "data:text/plain;base64,Q0ND",
    "data:image/webp;base64,CCC",
    "data:image/png;base64,DDD"
  ]);
  assert.deepEqual(images, [
    "data:image/png;base64,AAA",
    "data:image/jpeg;base64,BBB",
    "data:image/webp;base64,CCC"
  ]);
  assert.equal(model.noteCardLayout(images), "mosaic");
  assert.equal(model.noteCardLayout(images.slice(0, 2)), "duo");
  assert.equal(model.noteCardLayout(images.slice(0, 1)), "single");
});

test("calendarDayMeta exposes task and event density plus the first event preview", () => {
  const meta = model.calendarDayMeta("2026-08-11", [
    { date: "2026-08-11", text: "整理计划", done: false },
    { date: "2026-08-11", text: "已完成", done: true }
  ], [
    { date: "2026-08-11T14:30:00.000+08:00", title: "项目回顾" },
    { date: "2026-08-11T09:00:00.000+08:00", title: "晨会" }
  ]);
  assert.deepEqual(meta, { taskCount: 2, openTaskCount: 1, eventCount: 2, firstEventTitle: "晨会", firstEventTime: "09:00" });
});

test("workspaceSignalModel fills optional feed slots with real library and shortcut counts", () => {
  const signals = model.workspaceSignalModel({ bookCount: 3, shortcutCount: 4 }, {}, null);
  assert.deepEqual(signals.slice(-2).map(({ kind, value }) => ({ kind, value })), [
    { kind: "library", value: "3 本" },
    { kind: "shortcuts", value: "4 个" }
  ]);
});

test("islandMotionTiming keeps full motion responsive while preserving reduced motion", () => {
  assert.deepEqual(model.islandMotionTiming(false), { prepare: 40, expand: 380, collapse: 340, page: 240 });
  assert.deepEqual(model.islandMotionTiming(true), { prepare: 0, expand: 1, collapse: 1, page: 1 });
});

test("islandPageIntent moves immediately when idle and coalesces only the last intent while pending", () => {
  assert.deepEqual(model.islandPageIntent(0, null, 24, 2, 10), {
    target: 1,
    pending: null,
    direction: "next",
    delta: 1
  });
  assert.deepEqual(model.islandPageIntent(4, 5, -30, 1, 10), {
    target: 4,
    pending: { target: 3, direction: "previous" },
    direction: "previous",
    delta: -1
  });
  assert.deepEqual(model.islandPageIntent(9, null, 20, 0, 10), {
    target: 0,
    pending: null,
    direction: "next",
    delta: 1
  });
});

test("islandPageIntent retains direction for forward-forward and forward-reverse coalescing", () => {
  assert.deepEqual(model.islandPageIntent(1, { target: 2, direction: "next" }, 30, 0, 10).pending, { target: 2, direction: "next" });
  assert.deepEqual(model.islandPageIntent(1, { target: 2, direction: "next" }, -30, 0, 10).pending, { target: 0, direction: "previous" });
});

test("islandAttentionPolicy never overrides lock and restores prior idle click-through", () => {
  assert.deepEqual(model.islandAttentionPolicy({ locked: true, attentionActive: true, wasIdle: true }), { interaction: "preserve", restoreIdle: true });
  assert.deepEqual(model.islandAttentionPolicy({ locked: false, attentionActive: true, wasIdle: true }), { interaction: "active", restoreIdle: true });
  assert.deepEqual(model.islandAttentionPolicy({ locked: false, attentionActive: false, wasIdle: true }), { interaction: "idle", restoreIdle: false });
  assert.deepEqual(model.islandAttentionPolicy({ locked: false, attentionActive: false, wasIdle: false }), { interaction: "schedule", restoreIdle: false });
});

test("islandPageIntent ignores sub-threshold input and invalid page collections", () => {
  assert.deepEqual(model.islandPageIntent(3, null, 1, 1, 10), {
    target: 3,
    pending: null,
    direction: "none",
    delta: 0
  });
  assert.deepEqual(model.islandPageIntent(3, 7, 50, 0, 0), {
    target: 0,
    pending: null,
    direction: "none",
    delta: 0
  });
});

test("islandInteractionModel lets locked and collapsed-idle islands pass pointer input through", () => {
  assert.deepEqual(model.islandInteractionModel({ locked: true, idle: false, expanded: true }), {
    ignored: true,
    opacity: 0.3,
    mode: "locked"
  });
  assert.deepEqual(model.islandInteractionModel({ locked: false, idle: true, expanded: false }), {
    ignored: true,
    opacity: 0.3,
    mode: "idle"
  });
});

test("islandInteractionModel keeps every other island state active and opaque", () => {
  assert.deepEqual(model.islandInteractionModel({ locked: false, idle: true, expanded: true }), {
    ignored: false,
    opacity: 1,
    mode: "active"
  });
  assert.deepEqual(model.islandInteractionModel({ locked: false, idle: false, expanded: false }), {
    ignored: false,
    opacity: 1,
    mode: "active"
  });
});

test("calendarSignalVisibility keeps event task holiday and anniversary filters independent", () => {
  assert.deepEqual(model.calendarSignalVisibility({ events: true, tasks: false, holidays: true, anniversaries: false }, { eventCount: 2, taskCount: 1, holiday: true, anniversary: true }), {
    event: true, task: false, holiday: true, anniversary: false
  });
});

test("anniversaryComposerOptions disables ambiguous lunar monthly recurrence", () => {
  assert.deepEqual(model.anniversaryComposerOptions("solar"), { recurrences: ["once", "monthly", "yearly"], showLeapMonth: false, dateInputType: "date", datePlaceholder: "" });
  assert.deepEqual(model.anniversaryComposerOptions("lunar"), { recurrences: ["once", "yearly"], showLeapMonth: true, dateInputType: "text", datePlaceholder: "农历 YYYY-MM-DD（允许二月三十）" });
});
