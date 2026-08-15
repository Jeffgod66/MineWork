"use strict";

const SOURCES = new Set(["mail", "performance", "countdown", "alarm", "calendar", "anniversary", "holiday", "hydration"]);
const SEVERITIES = new Set(["info", "warning", "critical", "recovery"]);
const STATUSES = new Set(["unread", "read", "dismissed"]);
const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  masterEnabled: true,
  retentionDays: 30,
  maxRecords: 500,
  mailPrivacy: false,
  sources: Object.freeze(Object.fromEntries([...SOURCES].map((source) => [source, true]))),
  channels: Object.freeze({ windows: true, island: true, sound: true }),
  quietHours: Object.freeze({ enabled: false, start: "22:00", end: "07:00" }),
  criticalBypassesQuietHours: false
  ,performanceRules: Object.freeze({ cpuThreshold: 90, memoryThreshold: 85, diskFreePercentThreshold: 10, diskFreeBytesThreshold: 20 * 1024 ** 3, sustainMs: 120000, cooldownMs: 30 * 60000 }),
  holidayReminder: Object.freeze({ enabled: false, time: "09:00", daysBefore: 0, categories: Object.freeze({ chinaOfficial: true, chinaTraditional: true, international: true }) })
});

function cap(value, length) { return Array.from(typeof value === "string" ? value : "").slice(0, length).join(""); }
function iso(value) { const time = Date.parse(value); return Number.isNaN(time) ? null : new Date(time).toISOString(); }

function normalizeNotification(input, now) {
  if (!input || typeof input !== "object" || !SOURCES.has(input.source) || (input.type !== undefined && (typeof input.type !== "string" || !input.type.trim())) || !iso(input.scheduledAt)) return null;
  const title = cap(input.title, 120).trim();
  if (!title) return null;
  const severity = SEVERITIES.has(input.severity) ? input.severity : "info";
  const status = STATUSES.has(input.status) ? input.status : "unread";
  const scheduledAt = iso(input.scheduledAt);
  return { id: typeof input.id === "string" ? input.id : `${input.source}:${input.entityId || ""}:${scheduledAt}`, source: input.source, type: typeof input.type === "string" ? input.type.trim() : "notification", entityId: typeof input.entityId === "string" ? input.entityId : "", title, body: cap(input.body, 500), severity, status, scheduledAt, occurredAt: iso(input.occurredAt) || scheduledAt, createdAt: iso(input.createdAt) || new Date(now).toISOString(), groupKey: cap(input.groupKey, 160) || `${input.source}:${input.entityId || input.type || "notification"}` };
}

function notificationDedupeKey(record) {
  const occurrence = record && (record.scheduledAt || record.occurrence);
  return `${record && record.source || ""}|${record && record.entityId || ""}|${occurrence || ""}`;
}

function timeInWindow(now, start, end) {
  if (typeof start !== "string" || typeof end !== "string") return false;
  const toMinutes = (value) => {
    const parts = value.split(":").map(Number);
    return parts.length === 2 && Number.isInteger(parts[0]) && Number.isInteger(parts[1]) && parts[0] >= 0 && parts[0] < 24 && parts[1] >= 0 && parts[1] < 60 ? parts[0] * 60 + parts[1] : NaN;
  };
  const from = toMinutes(start), to = toMinutes(end), current = now.getHours() * 60 + now.getMinutes();
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return false;
  return from < to ? current >= from && current < to : current >= from || current < to;
}

function isQuietHours(settings, now) {
  const quiet = settings && settings.quietHours;
  return Boolean(quiet && quiet.enabled && timeInWindow(new Date(now), quiet.start, quiet.end));
}

function deliveryDecision(record, settings, now) {
  const masterEnabled = !settings || settings.masterEnabled !== false;
  const sourceEnabled = !(settings && settings.sources) || settings.sources[record.source] !== false;
  const channels = settings && settings.channels ? settings.channels : DEFAULT_NOTIFICATION_SETTINGS.channels;
  const bypass = record.severity === "critical" && settings && settings.criticalBypassesQuietHours === true;
  const quiet = isQuietHours(settings, now) && !bypass;
  return { history: true, windows: masterEnabled && sourceEnabled && !quiet && channels.windows !== false, island: masterEnabled && sourceEnabled && !quiet && channels.island !== false, sound: masterEnabled && sourceEnabled && !quiet && channels.sound !== false };
}

module.exports = { DEFAULT_NOTIFICATION_SETTINGS, normalizeNotification, notificationDedupeKey, isQuietHours, deliveryDecision };
