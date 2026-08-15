"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createNotificationStore } = require("../notifications/notification-store.js");

function fixture(overrides = {}) {
  return Object.freeze({
    id: overrides.id || "n-1",
    dedupeKey: overrides.dedupeKey || overrides.id || "n-1",
    source: overrides.source || "mail",
    type: "message",
    category: overrides.category || "mail",
    title: overrides.title || "New message",
    body: overrides.body || "Body",
    severity: "info",
    status: overrides.status || "unread",
    scheduledAt: overrides.scheduledAt || "2026-08-13T01:00:00.000Z",
    createdAt: overrides.createdAt || "2026-08-13T01:00:00.000Z",
    targetPage: overrides.targetPage || "mail"
  });
}

function memory(initial = []) {
  let records = structuredClone(initial);
  return {
    read: (key) => key === "notification-records" ? structuredClone(records) : undefined,
    write: (key, value) => { assert.equal(key, "notification-records"); records = structuredClone(value); },
    value: () => structuredClone(records)
  };
}

test("ingest deduplicates records and never mutates frozen input", () => {
  const adapter = memory();
  const store = createNotificationStore({ ...adapter, now: () => new Date("2026-08-13T02:00:00Z").getTime() });
  const input = fixture();
  assert.deepEqual(store.ingest(input), { record: input, created: true });
  const duplicate = store.ingest(fixture({ id: "different", dedupeKey: "n-1" }));
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.record.id, "n-1");
  duplicate.record.title = "changed";
  assert.equal(store.list()[0].title, "New message");
});

test("status actions update unread counts and clear removes history", () => {
  const adapter = memory([fixture({ id: "a" }), fixture({ id: "b", status: "read" })]);
  const store = createNotificationStore({ ...adapter, now: Date.now });
  assert.equal(store.snapshot().unreadCount, 1);
  assert.equal(store.markRead("a").status, "read");
  assert.equal(store.dismiss("b").status, "dismissed");
  store.ingest(fixture({ id: "c" }));
  assert.equal(store.markAllRead(), 1);
  assert.equal(store.snapshot().unreadCount, 0);
  assert.equal(store.clear(), 3);
  assert.deepEqual(store.snapshot(), { records: [], unreadCount: 0, totalCount: 0 });
});

test("retention, newest ordering, and 501 eviction prefer oldest non-unread", () => {
  const now = new Date("2026-08-13T12:00:00Z").getTime();
  const old = fixture({ id: "expired", createdAt: "2026-07-01T00:00:00Z" });
  const records = [old];
  for (let index = 0; index < 500; index += 1) {
    records.push(fixture({ id: `r-${index}`, status: index === 0 ? "read" : "unread", createdAt: new Date(now - (500 - index) * 1000).toISOString() }));
  }
  const adapter = memory(records);
  const store = createNotificationStore({ ...adapter, now: () => now, maxRecords: 500 });
  store.ingest(fixture({ id: "newest", createdAt: new Date(now).toISOString() }));
  const listed = store.list();
  assert.equal(listed.length, 500);
  assert.equal(listed[0].id, "newest");
  assert.equal(listed.some((item) => item.id === "expired"), false);
  assert.equal(listed.some((item) => item.id === "r-0"), false);
});

test("filters status, source, category group and query without guessing unknown values", () => {
  const adapter = memory([
    fixture({ id: "mail", title: "Quarterly Report", source: "mail", category: "mail" }),
    fixture({ id: "calendar", title: "Standup", source: "calendar", category: "schedule", status: "read" }),
    fixture({ id: "cpu", title: "CPU hot", source: "performance", category: "performance" }),
    fixture({ id: "water", title: "Drink", source: "hydration", category: "health" })
  ]);
  const store = createNotificationStore({ ...adapter, now: () => new Date("2026-08-13T12:00:00Z").getTime() });
  assert.deepEqual(store.list({ status: "read" }).map((x) => x.id), ["calendar"]);
  assert.deepEqual(store.list({ source: "mail" }).map((x) => x.id), ["mail"]);
  assert.deepEqual(store.list({ category: "health" }).map((x) => x.id), ["water"]);
  assert.deepEqual(store.list({ query: "quarterly" }).map((x) => x.id), ["mail"]);
  assert.deepEqual(store.list({ status: "future" }), []);
  assert.equal(store.list({ mystery: "ignored" }).length, 4);
});
