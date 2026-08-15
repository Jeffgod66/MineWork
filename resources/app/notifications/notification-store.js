"use strict";

const STORE_KEY = "notification-records";
const VALID_STATUSES = new Set(["unread", "read", "dismissed"]);
const VALID_SOURCES = new Set(["mail", "performance", "countdown", "alarm", "calendar", "anniversary", "holiday", "hydration"]);
const CATEGORY_SOURCES = Object.freeze({
  mail: new Set(["mail"]),
  schedule: new Set(["countdown", "alarm", "calendar", "anniversary", "holiday"]),
  performance: new Set(["performance"]),
  health: new Set(["hydration"])
});

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function timestamp(record) {
  const value = Date.parse(record && (record.createdAt || record.scheduledAt));
  return Number.isFinite(value) ? value : 0;
}

function createNotificationStore({ read, write, now, maxRecords = 500, retentionMs = 30 * 86400000, limits }) {
  if (typeof read !== "function" || typeof write !== "function" || typeof now !== "function") throw new TypeError("notification store adapters are required");

  function load() {
    const value = read(STORE_KEY);
    return Array.isArray(value) ? clone(value).filter((record) => record && typeof record === "object") : [];
  }

  function persist(records) {
    write(STORE_KEY, clone(records));
  }

  function prune(records) {
    const configured = typeof limits === "function" ? limits() || {} : {};
    const recordLimit = Math.max(1, Math.min(500, Number(configured.maxRecords) || maxRecords));
    const retention = Math.max(86400000, Math.min(365 * 86400000, (Number(configured.retentionDays) || retentionMs / 86400000) * 86400000));
    const cutoff = Number(now()) - retention;
    let kept = records.filter((record) => timestamp(record) >= cutoff);
    if (kept.length > recordLimit) {
      const oldestFirst = kept.slice().sort((a, b) => timestamp(a) - timestamp(b));
      const excess = kept.length - recordLimit;
      const evict = oldestFirst.filter((record) => record.status === "read" || record.status === "dismissed").slice(0, excess);
      if (evict.length < excess) {
        evict.push(...oldestFirst.filter((record) => record.status !== "read" && record.status !== "dismissed").slice(0, excess - evict.length));
      }
      const removed = new Set(evict.map((record) => record.id));
      kept = kept.filter((record) => !removed.has(record.id));
    }
    return kept;
  }

  function normalizedRecords() {
    const records = load();
    const next = prune(records);
    if (next.length !== records.length) persist(next);
    return next;
  }

  function list(filter = {}) {
    let records = normalizedRecords();
    if (filter.status !== undefined) records = VALID_STATUSES.has(filter.status) ? records.filter((record) => record.status === filter.status) : [];
    if (filter.source !== undefined) records = VALID_SOURCES.has(filter.source) ? records.filter((record) => record.source === filter.source) : [];
    if (filter.category !== undefined) {
      const sources = CATEGORY_SOURCES[filter.category];
      records = sources ? records.filter((record) => record.category === filter.category || sources.has(record.source)) : [];
    }
    if (typeof filter.query === "string" && filter.query.trim()) {
      const query = filter.query.trim().toLocaleLowerCase();
      records = records.filter((record) => `${record.title || ""}\n${record.body || ""}`.toLocaleLowerCase().includes(query));
    }
    return clone(records.sort((a, b) => timestamp(b) - timestamp(a)));
  }

  function ingest(record) {
    const records = normalizedRecords();
    const key = record && record.dedupeKey;
    const existing = key ? records.find((item) => item.dedupeKey === key) : null;
    if (existing) return { record: clone(existing), created: false };
    const stored = clone(record);
    const next = prune([...records, stored]);
    persist(next);
    const result = next.find((item) => item.id === stored.id) || stored;
    return { record: clone(result), created: true };
  }

  function update(id, status) {
    const records = normalizedRecords();
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) return null;
    if (records[index].status !== status) {
      records[index] = { ...records[index], status };
      persist(records);
    }
    return clone(records[index]);
  }

  function markRead(id) { return update(id, "read"); }
  function dismiss(id) { return update(id, "dismissed"); }

  function markAllRead() {
    const records = normalizedRecords();
    let count = 0;
    const next = records.map((record) => {
      if (record.status !== "unread") return record;
      count += 1;
      return { ...record, status: "read" };
    });
    if (count) persist(next);
    return count;
  }

  function clear() {
    const count = normalizedRecords().length;
    persist([]);
    return count;
  }

  function snapshot(filter = {}) {
    const all = normalizedRecords();
    return {
      records: list(filter),
      unreadCount: all.filter((record) => record.status === "unread").length,
      totalCount: all.length
    };
  }

  return Object.freeze({ list, ingest, markRead, markAllRead, dismiss, clear, snapshot });
}

module.exports = { createNotificationStore };
