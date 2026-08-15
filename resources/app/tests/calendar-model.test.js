"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const {
  toDateKey,
  solarToLunar,
  solarTerm,
  calendarDateMeta,
  normalizeAnniversary,
  anniversaryOccurrences,
  calendarMonthProjection,
  validateHolidaySnapshot
} = require("../calendar-model.js");

const datasets = {
  china: require("../assets/holidays/cn-2026.json"),
  international: require("../assets/holidays/international.json")
};

test("toDateKey preserves host-local calendar dates and rejects malformed input", () => {
  assert.equal(toDateKey("2026-08-13"), "2026-08-13");
  assert.equal(toDateKey(new Date(2026, 7, 13, 23, 59)), "2026-08-13");
  assert.throws(() => toDateKey("2026-02-30"), /date/i);
});

test("solarToLunar converts independently verified festival and leap-month literals", () => {
  assert.deepEqual(solarToLunar("2026-02-17"), { year: 2026, month: 1, day: 1, isLeap: false, monthName: "正月", dayName: "初一" });
  assert.deepEqual(solarToLunar("2026-09-25"), { year: 2026, month: 8, day: 15, isLeap: false, monthName: "八月", dayName: "十五" });
  assert.deepEqual(solarToLunar("2023-03-22"), { year: 2023, month: 2, day: 1, isLeap: true, monthName: "闰二月", dayName: "初一" });
  assert.equal(solarToLunar("2026-02-17").dayName, "初一");
  assert.throws(() => solarToLunar("1900-12-31"), /1901.*2100/);
  assert.throws(() => solarToLunar("not-a-date"), /date/i);
});

test("solarTerm uses China calendar semantics for known 2026 terms", () => {
  assert.equal(solarTerm("2026-04-05"), "清明");
  assert.equal(solarTerm("2026-06-22"), "夏至");
  assert.equal(solarTerm("2026-04-06"), "");
});

test("calendarDateMeta retains all metadata and applies short-label priority", () => {
  const inputs = { ...datasets, anniversaries: [{ id: "a1", title: "爸妈纪念日", type: "anniversary", calendar: "solar", recurrence: "yearly", date: "2020-09-25", allDay: true, reminders: [0], enabled: true }] };
  const meta = calendarDateMeta("2026-09-25", inputs);
  assert.equal(meta.lunarDay, "十五");
  assert.equal(meta.lunarMonth, "八月");
  assert.equal(meta.workStatus, "rest");
  assert.ok(meta.festivals.includes("中秋节"));
  assert.equal(meta.label, "爸妈纪念日");

  const international = calendarDateMeta("2026-12-25", datasets);
  assert.ok(international.festivals.includes("圣诞节"));
  assert.equal(international.workStatus, "");
  assert.ok(calendarDateMeta("2026-11-26", datasets).festivals.includes("感恩节"));
});

test("validateHolidaySnapshot strictly validates year, status, source and dates", () => {
  assert.equal(validateHolidaySnapshot(datasets.china, 2026).year, 2026);
  assert.throws(() => validateHolidaySnapshot({ ...datasets.china, year: 2027 }, 2026), /year/i);
  assert.throws(() => validateHolidaySnapshot({ ...datasets.china, source: {} }), /source/i);
  assert.throws(() => validateHolidaySnapshot({ ...datasets.china, days: { "2026-01-01": "maybe" } }), /status/i);
  assert.throws(() => validateHolidaySnapshot({ ...datasets.china, days: { "2025-12-31": "rest" } }), /year/i);
});

test("calendar metadata selects the matching validated snapshot without losing bundled years", () => {
  const future = { ...datasets.china, version: "future", year: 2027, days: { "2027-01-01": "rest" }, festivals: [] };
  assert.equal(calendarDateMeta("2026-01-01", { ...datasets, chinaSnapshots: [datasets.china, future] }).workStatus, "rest");
  assert.equal(calendarDateMeta("2027-01-01", { ...datasets, chinaSnapshots: [datasets.china, future] }).workStatus, "rest");
});

test("normalizeAnniversary enforces recurrence/calendar/reminder contracts", () => {
  const item = normalizeAnniversary({ id: " birthday ", title: " 小满生日 ", type: "birthday", calendar: "solar", recurrence: "yearly", date: "2024-02-29", allDay: false, time: "09:30", reminders: [7, 1, 7, 2, 0], enabled: true });
  assert.deepEqual(item.reminders, [0, 1, 7]);
  assert.equal(item.id, "birthday");
  assert.equal(item.time, "09:30");
  assert.equal(normalizeAnniversary({ ...item, calendar: "lunar", recurrence: "monthly" }), null);
  assert.equal(normalizeAnniversary({ ...item, time: "25:00" }), null);
});

test("lunar anniversary representation accepts February 30 independently of Gregorian month length", () => {
  const base = { title: "二月三十", type: "custom", calendar: "lunar", recurrence: "yearly", date: "2023-02-30", allDay: true, reminders: [0], enabled: true };
  const normal = normalizeAnniversary({ ...base, id: "normal-230", isLeapMonth: false });
  const leap = normalizeAnniversary({ ...base, id: "leap-230", isLeapMonth: true });
  assert.deepEqual({ date: normal.date, isLeapMonth: normal.isLeapMonth }, { date: "2023-02-30", isLeapMonth: false });
  assert.deepEqual({ date: leap.date, isLeapMonth: leap.isLeapMonth }, { date: "2023-02-30", isLeapMonth: true });
  assert.deepEqual(anniversaryOccurrences(normal, "2023-03-20", "2023-04-25").map((item) => item.dateKey), ["2023-03-21"]);
  assert.deepEqual(anniversaryOccurrences(leap, "2023-01-01", "2023-12-31"), []);
});

test("bundled lunar conversion remains deterministic when Chinese-calendar Intl is incompatible", () => {
  const modulePath = require.resolve("../calendar-model.js");
  const script = `const Real=Intl.DateTimeFormat; Intl.DateTimeFormat=function(locale,options){ if(String(locale).includes("u-ca-chinese")) return {formatToParts(){return [{type:"month",value:"???"}]}}; return new Real(locale,options); }; const m=require(${JSON.stringify(modulePath)}); console.log(JSON.stringify([m.solarToLunar("1901-01-01"),m.solarToLunar("2026-02-17"),m.solarToLunar("2100-12-31")]));`;
  const values = JSON.parse(execFileSync(process.execPath, ["-e", script], { encoding: "utf8" }));
  assert.deepEqual(values[1], { year: 2026, month: 1, day: 1, isLeap: false, monthName: "正月", dayName: "初一" });
  assert.deepEqual(values[2], { year: 2100, month: 12, day: 1, isLeap: false, monthName: "腊月", dayName: "初一" });
  assert.deepEqual(values[0], { year: 1900, month: 11, day: 11, isLeap: false, monthName: "冬月", dayName: "十一" });
});

test("solar anniversaries use Feb 28 for non-leap years and local reminder times", () => {
  const item = normalizeAnniversary({ id: "leap", title: "Leap birthday", type: "birthday", calendar: "solar", recurrence: "yearly", date: "2024-02-29", allDay: false, time: "09:30", reminders: [0, 3], enabled: true });
  const occurrences = anniversaryOccurrences(item, "2025-02-20", "2025-03-01");
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].dateKey, "2025-02-28");
  assert.equal(occurrences[0].dueAt.slice(0, 10), "2025-02-28");
  assert.deepEqual(occurrences[0].reminders, [0, 3]);
  assert.equal(occurrences[0].key, "anniversary|leap|2025-02-28|09:30");
});

test("lunar yearly recurrence distinguishes normal and leap months and skips missing dates", () => {
  const leap = normalizeAnniversary({ id: "leap-lunar", title: "闰月纪念", type: "custom", calendar: "lunar", recurrence: "yearly", date: "2023-02-01", isLeapMonth: true, allDay: true, reminders: [0], enabled: true });
  assert.deepEqual(anniversaryOccurrences(leap, "2023-03-20", "2023-03-25").map((item) => item.dateKey), ["2023-03-22"]);
  const normal = normalizeAnniversary({ ...leap, id: "normal-lunar", isLeapMonth: false });
  assert.deepEqual(anniversaryOccurrences(normal, "2023-02-15", "2023-03-25").map((item) => item.dateKey), ["2023-02-20"]);
  assert.deepEqual(anniversaryOccurrences({ ...leap, date: "2023-02-30" }, "2024-01-01", "2024-12-31"), []);
});

test("monthly, once, disabled and duplicate anniversary behavior is deterministic", () => {
  const monthly = normalizeAnniversary({ id: "monthly", title: "每月复盘", type: "custom", calendar: "solar", recurrence: "monthly", date: "2026-01-31", allDay: true, reminders: [1], enabled: true });
  assert.deepEqual(anniversaryOccurrences(monthly, "2026-02-01", "2026-04-30").map((item) => item.dateKey), ["2026-03-31"]);
  assert.deepEqual(anniversaryOccurrences({ ...monthly, enabled: false }, "2026-01-01", "2026-12-31"), []);
  const once = normalizeAnniversary({ ...monthly, id: "once", recurrence: "once", date: "2026-08-13" });
  assert.deepEqual(anniversaryOccurrences(once, "2026-08-13", "2026-08-13").map((item) => item.dateKey), ["2026-08-13"]);
});

test("calendarMonthProjection always emits 42 stable local cells with independent signals", () => {
  const projection = calendarMonthProjection(2026, 8, { ...datasets, tasks: [{ date: "2026-08-13", done: false }], events: [{ date: "2026-08-13T09:00:00+08:00" }] });
  assert.equal(projection.length, 42);
  assert.equal(projection[0].dateKey, "2026-07-26");
  assert.equal(projection[41].dateKey, "2026-09-05");
  assert.deepEqual(projection.find((cell) => cell.dateKey === "2026-08-13").signals, { tasks: 1, events: 1, holiday: false, anniversary: false });

  const script = `const m=require(${JSON.stringify(path.resolve(__dirname, "../calendar-model.js"))}); console.log(JSON.stringify(m.calendarMonthProjection(2026,8,{}).map(x=>x.dateKey)))`;
  const run = (TZ) => execFileSync(process.execPath, ["-e", script], { env: { ...process.env, TZ }, encoding: "utf8" }).trim();
  assert.equal(run("Asia/Shanghai"), run("America/New_York"));
});
