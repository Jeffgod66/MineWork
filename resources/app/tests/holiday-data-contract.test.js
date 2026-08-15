"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateHolidaySnapshot, calendarDateMeta } = require("../calendar-model.js");
const china = require("../assets/holidays/cn-2026.json");
const international = require("../assets/holidays/international.json");

test("official 2026 snapshot contains exactly the State Council rest and make-up work dates", () => {
  const snapshot = validateHolidaySnapshot(china, 2026);
  const rest = Object.entries(snapshot.days).filter(([, status]) => status === "rest").map(([date]) => date);
  const work = Object.entries(snapshot.days).filter(([, status]) => status === "work").map(([date]) => date);
  assert.deepEqual(rest, [
    "2026-01-01", "2026-01-02", "2026-01-03",
    "2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23",
    "2026-04-04", "2026-04-05", "2026-04-06",
    "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05",
    "2026-06-19", "2026-06-20", "2026-06-21",
    "2026-09-25", "2026-09-26", "2026-09-27",
    "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"
  ]);
  assert.deepEqual(work, ["2026-01-04", "2026-02-14", "2026-02-28", "2026-05-09", "2026-09-20", "2026-10-10"]);
  assert.match(snapshot.source.url, /^https:\/\/www\.gov\.cn\//);
  assert.equal(snapshot.source.retrievedAt, "2026-08-13");
  assert.equal(calendarDateMeta("2026-08-13", { china, international }).workStatus, "");
  assert.equal(calendarDateMeta("2027-01-01", { china, international }).workStatus, "");
});

test("international dates are versioned, fixed/computed, and can never change workday status", () => {
  assert.ok(international.version);
  const required = ["new-year", "international-womens-day", "labour-day", "childrens-day", "world-environment-day", "un-day", "christmas"];
  required.forEach((id) => assert.ok(international.items.some((item) => item.id === id), `missing ${id}`));
  international.items.forEach((item) => {
    assert.equal(item.category, "international");
    assert.equal(item.changesWorkday, false);
    assert.ok(item.dateRule?.type === "fixed" || item.dateRule?.type === "computed");
  });
});

test("festival metadata uses allowed categories and has no duplicate same-date names", () => {
  const allowed = new Set(["china-traditional", "china-commemoration", "international"]);
  const seen = new Set();
  [...china.festivals, ...international.items].forEach((item) => {
    assert.ok(allowed.has(item.category));
    const key = `${item.date || JSON.stringify(item.dateRule)}|${item.name}`;
    assert.equal(seen.has(key), false, `duplicate ${key}`);
    seen.add(key);
  });
});
