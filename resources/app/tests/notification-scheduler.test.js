"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { expandOccurrences, createScheduler, validateAlarms, isTrustedWorkspaceEvent } = require("../notifications/notification-scheduler.js");
const { execFileSync } = require("node:child_process");

const iso = (value) => new Date(value).toISOString();

function occurrence(workspace, from, to) {
  return expandOccurrences(workspace, new Date(from), new Date(to));
}

function harness(initial, at) {
  let workspace = structuredClone(initial);
  let clock = Date.parse(at);
  const accepted = [];
  const writes = [];
  const timers = new Set();
  const scheduler = createScheduler({
    now: () => clock,
    setTimer: (fn, delay) => { const timer = { fn, delay }; timers.add(timer); return timer; },
    clearTimer: (timer) => timers.delete(timer),
    ingest: async (input) => { accepted.push(structuredClone(input)); return { created: true }; },
    readWorkspace: () => structuredClone(workspace),
    writeWorkspace: (key, value) => { workspace[key] = structuredClone(value); writes.push([key, structuredClone(value)]); }
  });
  return { scheduler, accepted, writes, timers, workspace: () => structuredClone(workspace), setNow: (value) => { clock = Date.parse(value); } };
}

test("calendar reminder uses lead time, stable occurrence identity, and calendar route", () => {
  const items = occurrence({ "calendar-events": [{ id: "event-1", title: "Review", date: "2026-08-13T10:00:00+08:00", remindMinutes: 15 }] }, "2026-08-13T09:40:00+08:00", "2026-08-13T10:01:00+08:00");
  assert.deepEqual(items, [{ key: `calendar|event-1|${iso("2026-08-13T09:45:00+08:00")}`, source: "calendar", entityId: "event-1", scheduledAt: iso("2026-08-13T09:45:00+08:00"), dueAt: iso("2026-08-13T10:00:00+08:00"), severity: "info", title: "Review", body: "Starts in 15 minutes.", targetPage: "calendar", type: "reminder" }]);
  const moved = occurrence({ "calendar-events": [{ id: "event-1", title: "Review", date: "2026-08-13T11:00:00+08:00", remindMinutes: 15 }] }, "2026-08-13T10:40:00+08:00", "2026-08-13T11:01:00+08:00");
  assert.notEqual(moved[0].key, items[0].key);
});

test("hydration reminders expand on stable interval keys only while active and below goal", () => {
  const hydration = {
    date: "2026-08-13", goal: 2000,
    entries: [{ amount: 250, occurredAt: "2026-08-13T09:00:00+08:00" }],
    reminder: { enabled: true, intervalMinutes: 30, activeStart: "08:00", activeEnd: "22:00" }
  };
  const items = occurrence({ hydration }, "2026-08-13T09:29:00+08:00", "2026-08-13T10:01:00+08:00");
  assert.deepEqual(items.map(({ key, source, entityId, scheduledAt, targetPage, type }) => ({ key, source, entityId, scheduledAt, targetPage, type })), [
    { key: `hydration|2026-08-13|${iso("2026-08-13T09:30:00+08:00")}`, source: "hydration", entityId: "2026-08-13", scheduledAt: iso("2026-08-13T09:30:00+08:00"), targetPage: "hydration", type: "hydration-reminder" },
    { key: `hydration|2026-08-13|${iso("2026-08-13T10:00:00+08:00")}`, source: "hydration", entityId: "2026-08-13", scheduledAt: iso("2026-08-13T10:00:00+08:00"), targetPage: "hydration", type: "hydration-reminder" }
  ]);
  assert.deepEqual(occurrence({ hydration: { ...hydration, entries: [{ amount: 2000, occurredAt: "2026-08-13T09:00:00+08:00" }] } }, "2026-08-13T09:29:00+08:00", "2026-08-13T10:01:00+08:00"), []);
  assert.deepEqual(occurrence({ hydration: { ...hydration, reminder: { ...hydration.reminder, enabled: false } } }, "2026-08-13T09:29:00+08:00", "2026-08-13T10:01:00+08:00"), []);
});

test("hydration reminders honor active hours and unified notification quiet hours", () => {
  const hydration = { date: "2026-08-13", goal: 2000, entries: [{ amount: 250, occurredAt: "2026-08-13T07:30:00+08:00" }], reminder: { enabled: true, intervalMinutes: 30, activeStart: "08:00", activeEnd: "22:00" } };
  const workspace = { hydration, "notification-settings": { quietHours: { enabled: true, start: "08:00", end: "09:00" } } };
  const items = occurrence(workspace, "2026-08-13T07:30:00+08:00", "2026-08-13T09:31:00+08:00");
  assert.deepEqual(items.map((item) => item.scheduledAt), [iso("2026-08-13T09:00:00+08:00"), iso("2026-08-13T09:30:00+08:00")]);
});

test("hydration reminders begin before the first drink from active start interval boundaries", () => {
  const hydration = { date: "2026-08-13", goal: 2000, entries: [], reminder: { enabled: true, intervalMinutes: 30, activeStart: "08:00", activeEnd: "10:00" } };
  const items = occurrence({ hydration }, "2026-08-13T08:29:59+08:00", "2026-08-13T09:30:00+08:00");
  assert.deepEqual(items.map((item) => item.scheduledAt), [
    iso("2026-08-13T08:30:00+08:00"),
    iso("2026-08-13T09:00:00+08:00"),
    iso("2026-08-13T09:30:00+08:00")
  ]);
  assert.ok(items.every((item) => item.key === `hydration|2026-08-13|${item.scheduledAt}`));
});

test("first-drink hydration anchor replaces active-start anchor and still honors DND and goal", () => {
  const base = { date: "2026-08-13", goal: 2000, entries: [{ amount: 250, occurredAt: "2026-08-13T08:40:00+08:00" }], reminder: { enabled: true, intervalMinutes: 30, activeStart: "08:00", activeEnd: "10:00" } };
  assert.deepEqual(occurrence({ hydration: base }, "2026-08-13T08:00:00+08:00", "2026-08-13T09:41:00+08:00").map((item) => item.scheduledAt), [iso("2026-08-13T09:10:00+08:00"), iso("2026-08-13T09:40:00+08:00")]);
  assert.deepEqual(occurrence({ hydration: base, "notification-settings": { quietHours: { enabled: true, start: "09:00", end: "09:30" } } }, "2026-08-13T08:00:00+08:00", "2026-08-13T09:41:00+08:00").map((item) => item.scheduledAt), [iso("2026-08-13T09:40:00+08:00")]);
  assert.deepEqual(occurrence({ hydration: { ...base, goal: 250 } }, "2026-08-13T08:00:00+08:00", "2026-08-13T09:41:00+08:00"), []);
});

test("pre-drink reminder obeys catchup and persisted scheduler dedupe boundaries", async () => {
  const hydration = { date: "2026-08-13", goal: 2000, entries: [], reminder: { enabled: true, intervalMinutes: 30, activeStart: "08:00", activeEnd: "22:00" } };
  const recent = harness({ hydration }, "2026-08-13T08:40:00+08:00");
  await recent.scheduler.tick();
  await recent.scheduler.tick();
  assert.deepEqual(recent.accepted.map((item) => item.scheduledAt), [iso("2026-08-13T08:30:00+08:00")]);
  const old = harness({ hydration }, "2026-08-13T08:40:00.001+08:00");
  await old.scheduler.tick();
  assert.equal(old.accepted.length, 0);
  assert.ok(old.workspace()["notification-delivered-occurrences"].some((item) => item.key === `hydration|2026-08-13|${iso("2026-08-13T08:30:00+08:00")}`));
});

test("countdown fires once and is persisted completed without deletion", async () => {
  const h = harness({ countdowns: [{ id: "cd-1", name: "Focus done", date: "2026-08-13T10:00:00+08:00", status: "active", createdAt: "2026-08-13T09:00:00+08:00" }] }, "2026-08-13T10:00:01+08:00");
  await h.scheduler.tick();
  await h.scheduler.tick();
  assert.equal(h.accepted.length, 1);
  assert.equal(h.accepted[0].targetPage, "countdown");
  assert.equal(h.workspace().countdowns[0].status, "completed");
  assert.equal(h.workspace().countdowns[0].completedAt, iso("2026-08-13T10:00:01+08:00"));
});

test("once, daily, weekdays, and weekly alarms expand at local wall-clock time", () => {
  const alarms = [
    { id: "once", title: "Once", time: "09:30", status: "active", recurrence: "once", createdAt: "2026-08-13T08:00:00+08:00" },
    { id: "daily", title: "Daily", time: "09:30", status: "active", recurrence: "daily", createdAt: "2026-08-10T08:00:00+08:00" },
    { id: "days", title: "Days", time: "09:30", status: "active", recurrence: "weekdays", weekdays: [1, 4], createdAt: "2026-08-10T08:00:00+08:00" },
    { id: "weekly", title: "Weekly", time: "09:30", status: "active", recurrence: "weekly", createdAt: "2026-08-06T08:00:00+08:00" }
  ];
  const items = occurrence({ alarms }, "2026-08-10T00:00:00+08:00", "2026-08-17T00:00:00+08:00");
  assert.deepEqual(items.filter((x) => x.entityId === "once").map((x) => x.dueAt), [iso("2026-08-13T09:30:00+08:00")]);
  assert.equal(items.filter((x) => x.entityId === "daily").length, 7);
  assert.deepEqual(items.filter((x) => x.entityId === "days").map((x) => new Date(x.dueAt).getDay()), [1, 4]);
  assert.deepEqual(items.filter((x) => x.entityId === "weekly").map((x) => new Date(x.dueAt).getDay()), [4]);
  assert.ok(items.filter((x) => x.source === "alarm").every((x) => x.severity === "critical" && x.targetPage === "countdown"));
});

test("validated alarms preserve explicit wall metadata and repeating alarms retain 09:30 across DST", () => {
  const validated = validateAlarms([{ id: "dst", title: "DST", time: "09:30", status: "active", recurrence: "daily", createdAt: "2026-03-07T08:00:00-05:00" }]);
  assert.equal(validated[0].createdAt, "2026-03-07T08:00:00-05:00");
  const script = `const {expandOccurrences,validateAlarms}=require(${JSON.stringify(require.resolve("../notifications/notification-scheduler.js"))}); const alarms=validateAlarms([{id:"dst",title:"DST",time:"09:30",status:"active",recurrence:"daily",createdAt:"2026-03-07T08:00:00-05:00"}]); console.log(JSON.stringify(expandOccurrences({alarms},new Date("2026-03-07T00:00:00-05:00"),new Date("2026-03-10T00:00:00-04:00")).map(x=>x.scheduledAt)))`;
  const output = execFileSync(process.execPath, ["-e", script], { env: { ...process.env, TZ: "America/New_York" }, encoding: "utf8" });
  assert.deepEqual(JSON.parse(output), ["2026-03-07T14:30:00.000Z", "2026-03-08T13:30:00.000Z", "2026-03-09T13:30:00.000Z"]);
});

test("explicit non-DST offset alarm is stable when the host timezone changes", () => {
  const script = `const {expandOccurrences,validateAlarms}=require(${JSON.stringify(require.resolve("../notifications/notification-scheduler.js"))}); const alarms=validateAlarms([{id:"cn",title:"CN",time:"09:30",status:"active",recurrence:"daily",createdAt:"2026-08-13T08:00:00+08:00"}]); console.log(JSON.stringify(expandOccurrences({alarms},new Date("2026-08-13T00:00:00+08:00"),new Date("2026-08-15T00:00:00+08:00")).map(x=>x.scheduledAt)))`;
  const run = (tz) => execFileSync(process.execPath, ["-e", script], { env: { ...process.env, TZ: tz }, encoding: "utf8" }).trim();
  assert.equal(run("UTC"), run("Asia/Shanghai"));
  assert.deepEqual(JSON.parse(run("UTC")), ["2026-08-13T01:30:00.000Z", "2026-08-14T01:30:00.000Z"]);
});

test("legacy Z createdAt is host-local wall metadata rather than a UTC recurrence anchor", () => {
  const script = `const {expandOccurrences}=require(${JSON.stringify(require.resolve("../notifications/notification-scheduler.js"))}); const alarms=[{id:"legacy",title:"Legacy",time:"09:30",status:"active",recurrence:"once",createdAt:"2026-08-13T08:00:00.000Z"}]; console.log(expandOccurrences({alarms},new Date("2026-08-13T00:00:00-04:00"),new Date("2026-08-14T00:00:00-04:00"))[0].scheduledAt)`;
  const output = execFileSync(process.execPath, ["-e", script], { env: { ...process.env, TZ: "America/New_York" }, encoding: "utf8" }).trim();
  assert.equal(output, "2026-08-13T13:30:00.000Z");
});

test("normal and critical catch-up windows deliver recent occurrences and permanently handle old ones", async () => {
  const h = harness({
    "calendar-events": [
      { id: "recent", title: "Recent", date: "2026-08-13T10:00:00+08:00", remindMinutes: 5 },
      { id: "old", title: "Old", date: "2026-08-13T09:40:00+08:00", remindMinutes: 0 }
    ],
    alarms: [
      { id: "critical-recent", title: "Critical recent", time: "09:10", status: "active", recurrence: "once", createdAt: "2026-08-13T08:00:00+08:00" },
      { id: "critical-old", title: "Critical old", time: "08:30", status: "active", recurrence: "once", createdAt: "2026-08-13T08:00:00+08:00" }
    ]
  }, "2026-08-13T10:00:00+08:00");
  await h.scheduler.tick();
  assert.deepEqual(h.accepted.map((x) => x.entityId).sort(), ["critical-recent", "recent"]);
  assert.equal(h.workspace()["notification-delivered-occurrences"].length, 4);
  assert.equal(h.workspace().alarms.find((x) => x.id === "critical-old").status, "completed");
});

test("catch-up boundaries include exactly 10 normal minutes and 60 critical minutes", async () => {
  const h = harness({
    "calendar-events": [{ id: "normal-boundary", title: "Normal", date: "2026-08-13T09:50:00+08:00", remindMinutes: 0 }],
    alarms: [{ id: "critical-boundary", title: "Critical", time: "09:00", status: "active", recurrence: "once", createdAt: "2026-08-13T08:00:00+08:00" }]
  }, "2026-08-13T10:00:00+08:00");
  await h.scheduler.tick();
  assert.deepEqual(h.accepted.map((x) => x.entityId).sort(), ["critical-boundary", "normal-boundary"]);
});

test("active one-shots older than 30 days are handled and completed without delivery", async () => {
  const h = harness({
    countdowns: [{ id: "ancient-countdown", name: "Ancient", date: "2026-06-01T10:00:00+08:00", status: "active" }],
    alarms: [{ id: "ancient-alarm", title: "Ancient alarm", time: "09:00", status: "active", recurrence: "once", createdAt: "2026-06-01T08:00:00+08:00" }]
  }, "2026-08-13T10:00:00+08:00");
  await h.scheduler.tick();
  assert.equal(h.accepted.length, 0);
  assert.equal(h.workspace().countdowns[0].status, "completed");
  assert.equal(h.workspace().alarms[0].status, "completed");
  assert.equal(h.workspace()["notification-delivered-occurrences"].length, 2);
});

test("persisted dedupe survives a new scheduler and resume, while ingest failure is retried", async () => {
  let workspace = { countdowns: [{ id: "retry", name: "Retry", date: "2026-08-13T10:00:00+08:00", status: "active" }] };
  let attempts = 0;
  const make = () => createScheduler({
    now: () => Date.parse("2026-08-13T10:00:01+08:00"), setTimer: () => 1, clearTimer: () => {},
    ingest: async () => { attempts += 1; if (attempts === 1) throw new Error("store failed"); return { created: true }; },
    readWorkspace: () => structuredClone(workspace), writeWorkspace: (key, value) => { workspace[key] = structuredClone(value); }
  });
  await assert.rejects(make().tick(), /store failed/);
  assert.equal(workspace["notification-delivered-occurrences"], undefined);
  await make().onResume();
  assert.equal(attempts, 2);
  await make().onResume();
  assert.equal(attempts, 2);
});

test("invalid and duplicate workspace inputs are skipped and delivered keys prune after 30 days", async () => {
  const duplicated = { id: "same", name: "One", date: "2026-08-13T10:00:00+08:00", status: "active" };
  const h = harness({ countdowns: [duplicated, { ...duplicated }, { id: "bad", name: "Bad", date: "not-a-date" }], "calendar-events": [null, { id: "bad", title: "Bad", date: "x" }], "notification-delivered-occurrences": [{ key: "expired", handledAt: "2026-07-01T00:00:00.000Z" }] }, "2026-08-13T10:00:01+08:00");
  assert.doesNotThrow(() => occurrence(h.workspace(), "2026-08-13T09:00:00+08:00", "2026-08-13T11:00:00+08:00"));
  assert.equal(occurrence(h.workspace(), "2026-08-13T09:00:00+08:00", "2026-08-13T11:00:00+08:00").length, 1);
  await h.scheduler.tick();
  assert.equal(h.accepted.length, 1);
  assert.equal(h.workspace()["notification-delivered-occurrences"].some((item) => item.key === "expired"), false);
});

test("start reads persisted workspace, schedules safely, reload replaces timer, and stop clears it", async () => {
  const h = harness({ countdowns: [{ id: "future", name: "Future", date: "2026-09-30T10:00:00+08:00", status: "active" }] }, "2026-08-13T10:00:00+08:00");
  await h.scheduler.start();
  assert.equal(h.timers.size, 1);
  assert.ok([...h.timers][0].delay <= 2147483647);
  await h.scheduler.reload();
  assert.equal(h.timers.size, 1);
  h.scheduler.stop();
  assert.equal(h.timers.size, 0);
});

test("a rejected startup tick leaves scheduler restartable and later schedules reconciliation", async () => {
  let fail = true;
  const timers = new Set();
  const scheduler = createScheduler({ now: () => Date.parse("2026-08-13T10:00:00Z"), setTimer: (fn, delay) => { const timer = { fn, delay }; timers.add(timer); return timer; }, clearTimer: (timer) => timers.delete(timer), ingest: async () => {}, readWorkspace: () => { if (fail) throw new Error("transient"); return {}; }, writeWorkspace: () => {} });
  await assert.rejects(scheduler.start(), /transient/);
  fail = false;
  await scheduler.start();
  assert.equal(timers.size, 1);
});

test("workspace sender validation rejects other contents and child frames", () => {
  const mainContents = {};
  assert.equal(isTrustedWorkspaceEvent({ sender: mainContents, senderFrame: { parent: null } }, mainContents), true);
  assert.equal(isTrustedWorkspaceEvent({ sender: {}, senderFrame: { parent: null } }, mainContents), false);
  assert.equal(isTrustedWorkspaceEvent({ sender: mainContents, senderFrame: { parent: {} } }, mainContents), false);
  assert.equal(isTrustedWorkspaceEvent({ sender: mainContents, frameId: 2 }, mainContents), false);
});
