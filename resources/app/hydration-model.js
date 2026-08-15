"use strict";

function localDateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function validGoal(value) { return Number.isFinite(value) && value >= 500 && value <= 6000; }
function percent(amount, goal) { return Math.min(100, Math.round((amount / goal) * 100)); }
function normalizeEntry(raw) {
  const amount = Number(raw && raw.amount);
  const occurredAt = raw && typeof raw.occurredAt === "string" && !Number.isNaN(Date.parse(raw.occurredAt)) ? new Date(raw.occurredAt).toISOString() : null;
  return Number.isFinite(amount) && amount > 0 && occurredAt ? { id: typeof raw.id === "string" ? raw.id : `${occurredAt}:${amount}`, amount, occurredAt } : null;
}

function normalizeHydration(raw, now) {
  const source = raw && typeof raw === "object" ? raw : {};
  const date = localDateKey(now);
  const goal = validGoal(source.goal) ? source.goal : 2000;
  const archives = Array.isArray(source.archives) ? source.archives.map((archive) => ({ ...(archive && typeof archive === "object" ? archive : {}) })) : [];
  const sourceDate = typeof source.date === "string" ? source.date : date;
  if (sourceDate !== date) {
    const oldEntries = Array.isArray(source.entries) ? source.entries.map(normalizeEntry).filter(Boolean) : [];
    const oldAmount = oldEntries.reduce((sum, entry) => sum + entry.amount, 0);
    if (sourceDate) archives.unshift({ date: sourceDate, amount: oldAmount, goal, percent: percent(oldAmount, goal), entries: oldEntries.length });
    return { date, goal, entries: [], amount: 0, percent: 0, archives, lastEntryAt: null };
  }
  const entries = (Array.isArray(source.entries) ? source.entries : []).map(normalizeEntry).filter(Boolean).filter((entry) => localDateKey(entry.occurredAt) === date);
  const amount = entries.reduce((sum, entry) => sum + entry.amount, 0);
  return { date, goal, entries: entries.map((entry) => ({ ...entry })), amount, percent: percent(amount, goal), archives, lastEntryAt: entries.length ? entries[entries.length - 1].occurredAt : null };
}

function setHydrationGoal(state, ml) {
  const normalized = normalizeHydration(state, new Date(`${state && state.date ? state.date : "1970-01-01"}T12:00:00`));
  const goal = validGoal(ml) ? ml : normalized.goal;
  return { ...normalized, goal, percent: percent(normalized.amount, goal) };
}

function addHydrationEntry(state, ml, at) {
  const date = localDateKey(at);
  const normalized = normalizeHydration(state, new Date(at));
  const amount = Number(ml);
  if (!Number.isFinite(amount) || amount <= 0 || normalized.date !== date) return normalized;
  const occurredAt = new Date(at).toISOString();
  const entries = [...normalized.entries.map((entry) => ({ ...entry })), { id: `${occurredAt}:${amount}:${normalized.entries.length}`, amount, occurredAt }];
  const total = normalized.amount + amount;
  return { ...normalized, entries, amount: total, percent: percent(total, normalized.goal), lastEntryAt: occurredAt };
}

function undoHydrationEntry(state) {
  const now = new Date(`${state && state.date ? state.date : "1970-01-01"}T12:00:00`);
  const normalized = normalizeHydration(state, now);
  const entries = normalized.entries.slice(0, -1);
  const amount = entries.reduce((sum, entry) => sum + entry.amount, 0);
  return { ...normalized, entries, amount, percent: percent(amount, normalized.goal), lastEntryAt: entries.length ? entries[entries.length - 1].occurredAt : null };
}

function inWindow(now, start, end) {
  if (typeof start !== "string" || typeof end !== "string") return true;
  const value = now.getHours() * 60 + now.getMinutes();
  const parse = (text) => {
    const [hour, minute] = text.split(":").map(Number);
    return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour < 24 && minute >= 0 && minute < 60 ? hour * 60 + minute : NaN;
  };
  const from = parse(start), to = parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return true;
  return from < to ? value >= from && value < to : value >= from || value < to;
}

function hydrationReminderDue(state, settings, now) {
  const normalized = normalizeHydration(state, now);
  const config = settings && typeof settings === "object" ? settings : {};
  if (!config.enabled || normalized.amount >= normalized.goal) return false;
  const active = inWindow(now, config.activeStart, config.activeEnd);
  const quiet = typeof config.quietStart === "string" && typeof config.quietEnd === "string" && inWindow(now, config.quietStart, config.quietEnd);
  if (!active || quiet) return false;
  const interval = Number(config.intervalMinutes);
  if (!Number.isFinite(interval) || interval <= 0 || !normalized.lastEntryAt) return false;
  return new Date(now).getTime() - Date.parse(normalized.lastEntryAt) >= interval * 60000;
}

const hydrationModelApi = { normalizeHydration, setHydrationGoal, addHydrationEntry, undoHydrationEntry, hydrationReminderDue };
if (typeof module !== "undefined" && module.exports) module.exports = hydrationModelApi;
if (typeof window !== "undefined") window.mineworkHydrationModel = hydrationModelApi;
