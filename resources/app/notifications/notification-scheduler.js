"use strict";

const DAY = 86400000;
const DELIVERED_KEY = "notification-delivered-occurrences";
const MAX_TIMER_DELAY = 2147483647;
const RECONCILE_MS = 60000;
const RECURRENCES = new Set(["once", "daily", "weekdays", "weekly"]);
const STATUSES = new Set(["active", "completed", "disabled"]);
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const { normalizeAnniversary, anniversaryOccurrences } = require("../calendar-model.js");

function clone(value) { return value === undefined ? undefined : structuredClone(value); }
function validDate(value) { const time = Date.parse(value); return Number.isFinite(time) ? new Date(time) : null; }
function text(value, max) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function occurrenceKey(source, entityId, scheduledAt) { return `${source}|${entityId}|${scheduledAt}`; }
function addLocalDays(dateKey, amount) {
  const match = typeof dateKey === "string" && dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateKey;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function validateCountdowns(value) {
  if (!Array.isArray(value) || value.length > 100) throw new TypeError("Invalid countdown workspace");
  return value.map((item) => {
    const id = text(item?.id, 160), name = text(item?.name, 120), date = validDate(item?.date);
    const status = item?.status === undefined ? "active" : item.status;
    if (!id || !name || !date || !STATUSES.has(status)) throw new TypeError("Invalid countdown");
    return { ...clone(item), id, name, date: date.toISOString(), status, createdAt: validDate(item.createdAt)?.toISOString() || undefined };
  });
}

function validateAlarms(value) {
  if (!Array.isArray(value) || value.length > 100) throw new TypeError("Invalid alarm workspace");
  return value.map((item) => {
    const id = text(item?.id, 160), title = text(item?.title, 120), time = text(item?.time, 5);
    const recurrence = item?.recurrence, status = item?.status;
    const createdAt = validDate(item?.createdAt);
    if (!id || !title || !TIME_PATTERN.test(time) || !RECURRENCES.has(recurrence) || !STATUSES.has(status) || !createdAt) throw new TypeError("Invalid alarm");
    const weekdays = Array.isArray(item.weekdays) ? [...new Set(item.weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort() : [];
    if (recurrence === "weekdays" && !weekdays.length) throw new TypeError("Invalid alarm weekdays");
    return { ...clone(item), id, title, time, recurrence, status, weekdays, createdAt: item.createdAt };
  });
}

function explicitOffset(value) {
  const match = typeof value === "string" && value.match(/([+-])(\d{2}):(\d{2})$/);
  return match ? (match[1] === "+" ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3])) : null;
}

function usesHostZone(alarm) {
  const offset = explicitOffset(alarm.createdAt);
  if (offset === null) return true;
  const instant = validDate(alarm.createdAt);
  return instant ? -instant.getTimezoneOffset() === offset : false;
}

function wallDate(alarm, year, month, date, hours, minutes) {
  const offset = explicitOffset(alarm.createdAt);
  return usesHostZone(alarm) ? new Date(year, month, date, hours, minutes, 0, 0) : new Date(Date.UTC(year, month, date, hours, minutes) - offset * 60000);
}

function wallParts(alarm, instant) {
  const offset = explicitOffset(alarm.createdAt);
  if (usesHostZone(alarm)) return { year: instant.getFullYear(), month: instant.getMonth(), date: instant.getDate(), weekday: instant.getDay() };
  const shifted = new Date(instant.getTime() + offset * 60000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), date: shifted.getUTCDate(), weekday: shifted.getUTCDay() };
}

function alarmStart(alarm) {
  const created = validDate(alarm.createdAt);
  if (!created || !TIME_PATTERN.test(alarm.time)) return null;
  const [hours, minutes] = alarm.time.split(":").map(Number);
  const wall = String(alarm.createdAt).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!wall) return null;
  let first = wallDate(alarm, Number(wall[1]), Number(wall[2]) - 1, Number(wall[3]), hours, minutes);
  if (first < created) {
    const parts = wallParts(alarm, first);
    first = wallDate(alarm, parts.year, parts.month, parts.date + 1, hours, minutes);
  }
  return first;
}

function alarmMatches(alarm, day, first) {
  if (day < first) return false;
  const weekday = wallParts(alarm, day).weekday;
  if (alarm.recurrence === "once") return day.getTime() === first.getTime();
  if (alarm.recurrence === "daily") return true;
  if (alarm.recurrence === "weekdays") return alarm.weekdays.includes(weekday);
  const firstWeekday = wallParts(alarm, first).weekday;
  return alarm.recurrence === "weekly" && weekday === firstWeekday;
}

function minutesInWindow(minutes, start, end) {
  if (!TIME_PATTERN.test(start || "") || !TIME_PATTERN.test(end || "") || start === end) return false;
  const value = (text) => text.split(":").map(Number).reduce((hours, part, index) => index ? hours * 60 + part : part);
  const from = value(start), to = value(end);
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}

function hydrationWallMinutes(date) { return date.getHours() * 60 + date.getMinutes(); }

function addHydrationOccurrences(workspace, start, end, add) {
  const state = workspace.hydration;
  const reminder = state && state.reminder;
  const goal = Number(state && state.goal);
  const entries = Array.isArray(state && state.entries) ? state.entries.filter((entry) => Number(entry?.amount) > 0 && validDate(entry?.occurredAt)) : [];
  const amount = entries.reduce((sum, entry) => sum + Number(entry.amount), 0);
  const interval = Number(reminder && reminder.intervalMinutes);
  if (!state || !/^\d{4}-\d{2}-\d{2}$/.test(state.date || "") || reminder?.enabled !== true || !Number.isInteger(interval) || interval < 15 || interval > 240 || !TIME_PATTERN.test(reminder.activeStart || "") || !TIME_PATTERN.test(reminder.activeEnd || "") || reminder.activeStart === reminder.activeEnd || !Number.isFinite(goal) || goal < 500 || amount >= goal) return;
  const latest = entries.length
    ? entries.map((entry) => validDate(entry.occurredAt)).sort((left, right) => right - left)[0]
    : validDate(`${state.date}T${reminder.activeStart}:00`);
  if (!latest) return;
  const quiet = workspace["notification-settings"]?.quietHours;
  for (let cursor = new Date(latest.getTime() + interval * 60000); cursor <= end; cursor = new Date(cursor.getTime() + interval * 60000)) {
    if (cursor < start) continue;
    const dateKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    if (dateKey !== state.date) break;
    const minutes = hydrationWallMinutes(cursor);
    if (!minutesInWindow(minutes, reminder.activeStart, reminder.activeEnd)) continue;
    if (quiet?.enabled === true && minutesInWindow(minutes, quiet.start, quiet.end)) continue;
    const scheduledAt = cursor.toISOString();
    add({ key: occurrenceKey("hydration", state.date, scheduledAt), source: "hydration", entityId: state.date, scheduledAt, dueAt: scheduledAt, severity: "info", title: "Time to hydrate", body: `${Math.max(0, goal - amount)} ml remaining toward today's ${goal} ml goal.`, targetPage: "hydration", type: "hydration-reminder" });
  }
}

function expandOccurrences(workspace, from, to) {
  const start = new Date(from), end = new Date(to);
  if (!workspace || typeof workspace !== "object" || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return [];
  const found = new Map();
  const add = (item) => { if (!found.has(item.key)) found.set(item.key, item); };

  addHydrationOccurrences(workspace, start, end, add);

  for (const raw of Array.isArray(workspace.anniversaries) ? workspace.anniversaries : []) {
    const item = normalizeAnniversary(raw);
    if (!item) continue;
    let fromKey, toKey;
    try {
      const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      fromKey = localKey(start); toKey = localKey(end);
    } catch { continue; }
    const maxReminder = item.reminders.length ? Math.max(...item.reminders) : 0;
    for (const occurrence of anniversaryOccurrences(item, fromKey, addLocalDays(toKey, maxReminder))) {
      const due = validDate(occurrence.dueAt);
      if (!due) continue;
      for (const offset of occurrence.reminders) {
        const scheduled = new Date(due.getTime() - offset * DAY);
        if (scheduled < start || scheduled > end) continue;
        const scheduledAt = scheduled.toISOString();
        add({ key: occurrenceKey("anniversary", item.id, scheduledAt), source: "anniversary", entityId: item.id, scheduledAt, dueAt: due.toISOString(), severity: "info", title: item.title, body: offset ? `${offset} day${offset === 1 ? "" : "s"} until this anniversary.` : "Anniversary is today.", targetPage: "calendar", type: "anniversary-reminder" });
      }
    }
  }

  for (const item of Array.isArray(workspace["holiday-reminders"]) ? workspace["holiday-reminders"] : []) {
    const id = text(item?.id, 160), title = text(item?.title, 120);
    if (!id || !title || item.enabled !== true || !/^\d{4}-\d{2}-\d{2}$/.test(item.date || "") || !TIME_PATTERN.test(item.time || "")) continue;
    const due = validDate(`${item.date}T${item.time}:00`);
    if (!due || due < start || due > end) continue;
    const scheduledAt = due.toISOString();
    add({ key: occurrenceKey("holiday", id, scheduledAt), source: "holiday", entityId: id, scheduledAt, dueAt: scheduledAt, severity: "info", title, body: "Holiday reminder.", targetPage: "calendar", type: "holiday-reminder" });
  }

  for (const item of Array.isArray(workspace["calendar-events"]) ? workspace["calendar-events"] : []) {
    const id = text(item?.id, 160), title = text(item?.title, 120), due = validDate(item?.date);
    const minutes = Math.max(0, Math.min(10080, Number(item?.remindMinutes) || 0));
    if (!id || !title || !due) continue;
    const scheduled = new Date(due.getTime() - minutes * 60000);
    if (scheduled < start || scheduled > end) continue;
    const scheduledAt = scheduled.toISOString();
    add({ key: occurrenceKey("calendar", id, scheduledAt), source: "calendar", entityId: id, scheduledAt, dueAt: due.toISOString(), severity: "info", title, body: minutes ? `Starts in ${minutes} minutes.` : "Starts now.", targetPage: "calendar", type: "reminder" });
  }

  for (const item of Array.isArray(workspace.countdowns) ? workspace.countdowns : []) {
    const id = text(item?.id, 160), title = text(item?.name, 120), due = validDate(item?.date);
    if (!id || !title || !due || (item.status !== undefined && item.status !== "active")) continue;
    if (due < start || due > end) continue;
    const scheduledAt = due.toISOString();
    add({ key: occurrenceKey("countdown", id, scheduledAt), source: "countdown", entityId: id, scheduledAt, dueAt: scheduledAt, severity: "info", title, body: "Countdown reached its target.", targetPage: "countdown", type: "countdown-complete" });
  }

  for (const alarm of Array.isArray(workspace.alarms) ? workspace.alarms : []) {
    if (!alarm || alarm.status !== "active" || !text(alarm.id, 160) || !text(alarm.title, 120) || !RECURRENCES.has(alarm.recurrence) || !TIME_PATTERN.test(alarm.time)) continue;
    const first = alarmStart(alarm);
    if (!first) continue;
    const weekdays = Array.isArray(alarm.weekdays) ? alarm.weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : [];
    if (alarm.recurrence === "weekdays" && !weekdays.length) continue;
    const normalized = { ...alarm, weekdays };
    let cursor;
    if (alarm.recurrence === "once") {
      cursor = new Date(first);
    } else {
      const parts = wallParts(alarm, start);
      const [hours, minutes] = alarm.time.split(":").map(Number);
      cursor = wallDate(alarm, parts.year, parts.month, parts.date, hours, minutes);
      if (cursor < start) cursor = wallDate(alarm, parts.year, parts.month, parts.date + 1, hours, minutes);
    }
    while (cursor <= end) {
      if (alarmMatches(normalized, cursor, first)) {
        const scheduledAt = cursor.toISOString();
        add({ key: occurrenceKey("alarm", alarm.id, scheduledAt), source: "alarm", entityId: alarm.id, scheduledAt, dueAt: scheduledAt, severity: "critical", title: alarm.title.trim().slice(0, 120), body: "Alarm is due now.", targetPage: "countdown", type: "alarm" });
      }
      if (alarm.recurrence === "once") break;
      const parts = wallParts(alarm, cursor);
      cursor = wallDate(alarm, parts.year, parts.month, parts.date + 1, ...alarm.time.split(":").map(Number));
    }
  }
  return [...found.values()].sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt) || a.key.localeCompare(b.key));
}

function createScheduler({ now, setTimer, clearTimer, ingest, readWorkspace, writeWorkspace, catchupMinutes = 10, criticalCatchupMinutes = 60 }) {
  if ([now, setTimer, clearTimer, ingest, readWorkspace, writeWorkspace].some((fn) => typeof fn !== "function")) throw new TypeError("scheduler adapters are required");
  let timer = null;
  let running = false;

  function delivered(workspace, current) {
    const cutoff = current - 30 * DAY;
    return (Array.isArray(workspace[DELIVERED_KEY]) ? workspace[DELIVERED_KEY] : []).filter((item) => item && typeof item.key === "string" && Date.parse(item.handledAt) >= cutoff);
  }

  function completeEntity(workspace, item, completedAt) {
    const key = item.source === "countdown" ? "countdowns" : item.source === "alarm" ? "alarms" : null;
    if (!key) return;
    const entries = Array.isArray(workspace[key]) ? workspace[key] : [];
    const index = entries.findIndex((entry) => entry?.id === item.entityId);
    if (index < 0) return;
    if (item.source === "alarm" && entries[index].recurrence !== "once") return;
    if (entries[index].status === "completed") return;
    const next = clone(entries);
    next[index] = { ...next[index], status: "completed", completedAt };
    workspace[key] = next;
    writeWorkspace(key, next);
  }

  async function tick() {
    const current = Number(now());
    const workspace = clone(readWorkspace()) || {};
    let handled = delivered(workspace, current);
    const handledKeys = new Set(handled.map((item) => item.key));
    const occurrences = expandOccurrences(workspace, new Date(0), new Date(current));
    let dirty = handled.length !== (Array.isArray(workspace[DELIVERED_KEY]) ? workspace[DELIVERED_KEY].length : 0);
    for (const item of occurrences) {
      if (handledKeys.has(item.key)) continue;
      const age = current - Date.parse(item.scheduledAt);
      const catchup = (item.source === "alarm" ? criticalCatchupMinutes : catchupMinutes) * 60000;
      if (age <= catchup) {
        await ingest({ ...item, dedupeKey: item.key, occurrence: item.scheduledAt, category: item.source === "calendar" || item.source === "countdown" || item.source === "alarm" ? "schedule" : undefined });
      }
      const handledAt = new Date(current).toISOString();
      handled.push({ key: item.key, handledAt });
      handledKeys.add(item.key);
      dirty = true;
      completeEntity(workspace, item, handledAt);
    }
    if (dirty) writeWorkspace(DELIVERED_KEY, handled);
    return occurrences;
  }

  function schedule() {
    if (!running) return;
    if (timer !== null) clearTimer(timer);
    const current = Number(now());
    const next = expandOccurrences(clone(readWorkspace()) || {}, new Date(current + 1), new Date(current + 370 * DAY))[0];
    const delay = next ? Math.max(1, Math.min(RECONCILE_MS, Date.parse(next.scheduledAt) - current, MAX_TIMER_DELAY)) : RECONCILE_MS;
    timer = setTimer(async () => { timer = null; try { await tick(); } finally { schedule(); } }, delay);
  }

  async function start() {
    if (running) return;
    running = true;
    try { await tick(); schedule(); } catch (error) { running = false; throw error; }
  }
  function stop() { running = false; if (timer !== null) clearTimer(timer); timer = null; }
  async function reload() { await tick(); if (running) schedule(); }
  async function onResume() { await tick(); if (running) schedule(); }
  return Object.freeze({ start, stop, reload, onResume, tick });
}

function isTrustedWorkspaceEvent(event, mainContents) {
  if (!event || event.sender !== mainContents) return false;
  if (event.senderFrame) return event.senderFrame.parent === null;
  return event.frameId === 0;
}

module.exports = { expandOccurrences, createScheduler, validateCountdowns, validateAlarms, isTrustedWorkspaceEvent };
