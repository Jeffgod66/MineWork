"use strict";

const { DEFAULT_NOTIFICATION_SETTINGS, normalizeNotification, notificationDedupeKey, deliveryDecision } = require("./notification-model.js");

const SOURCE_KEYS = new Set(Object.keys(DEFAULT_NOTIFICATION_SETTINGS.sources));
const CHANNEL_KEYS = new Set(Object.keys(DEFAULT_NOTIFICATION_SETTINGS.channels));
const SETTING_KEYS = new Set(["masterEnabled", "retentionDays", "maxRecords", "mailPrivacy", "sources", "channels", "quietHours", "criticalBypassesQuietHours", "performanceRules", "holidayReminder"]);
const TARGET_PAGES = new Set(["home", "tasks", "calendar", "weather", "news", "favorites", "notes", "library", "hydration", "reflection", "island", "ai", "shortcuts", "countdown", "translate", "performance", "music", "mail", "notifications"]);
const STATUS_KEYS = new Set(["unread", "read", "dismissed"]);
const CATEGORY_KEYS = new Set(["mail", "schedule", "performance", "health"]);
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function clone(value) { return value === undefined ? undefined : structuredClone(value); }
function plainObject(value) { return value && typeof value === "object" && !Array.isArray(value); }
function fail(name) { throw new TypeError(`Invalid notification ${name}`); }

function validateNotificationId(value) {
  if (typeof value !== "string" || !value || value.length > 160) fail("id");
  return value;
}

function validateNotificationFilter(value = {}) {
  if (!plainObject(value)) fail("filter");
  const allowed = new Set(["status", "source", "category", "query"]);
  Object.keys(value).forEach((key) => { if (!allowed.has(key)) fail(`filter ${key}`); });
  const result = {};
  if (value.status !== undefined) { if (!STATUS_KEYS.has(value.status)) fail("filter status"); result.status = value.status; }
  if (value.source !== undefined) { if (!SOURCE_KEYS.has(value.source)) fail("filter source"); result.source = value.source; }
  if (value.category !== undefined) { if (!CATEGORY_KEYS.has(value.category)) fail("filter category"); result.category = value.category; }
  if (value.query !== undefined) { if (typeof value.query !== "string" || value.query.length > 200) fail("filter query"); result.query = value.query; }
  return result;
}

function validateBooleanMap(value, known, name) {
  if (!plainObject(value)) fail(name);
  const result = {};
  Object.entries(value).forEach(([key, current]) => {
    if (!known.has(key) || typeof current !== "boolean") fail(`${name} ${key}`);
    result[key] = current;
  });
  return result;
}

function validateSettingsPatch(value) {
  if (!plainObject(value)) fail("settings");
  Object.keys(value).forEach((key) => { if (!SETTING_KEYS.has(key)) fail(`settings ${key}`); });
  const result = {};
  if (value.masterEnabled !== undefined) {
    if (typeof value.masterEnabled !== "boolean") fail("settings masterEnabled");
    result.masterEnabled = value.masterEnabled;
  }
  if (value.retentionDays !== undefined) {
    if (!Number.isInteger(value.retentionDays) || value.retentionDays < 1 || value.retentionDays > 365) fail("settings retentionDays");
    result.retentionDays = value.retentionDays;
  }
  if (value.maxRecords !== undefined) {
    if (!Number.isInteger(value.maxRecords) || value.maxRecords < 1 || value.maxRecords > 500) fail("settings maxRecords");
    result.maxRecords = value.maxRecords;
  }
  if (value.mailPrivacy !== undefined) {
    if (typeof value.mailPrivacy !== "boolean") fail("settings mailPrivacy");
    result.mailPrivacy = value.mailPrivacy;
  }
  if (value.criticalBypassesQuietHours !== undefined) {
    if (typeof value.criticalBypassesQuietHours !== "boolean") fail("settings criticalBypassesQuietHours");
    result.criticalBypassesQuietHours = value.criticalBypassesQuietHours;
  }
  if (value.sources !== undefined) result.sources = validateBooleanMap(value.sources, SOURCE_KEYS, "settings sources");
  if (value.channels !== undefined) result.channels = validateBooleanMap(value.channels, CHANNEL_KEYS, "settings channels");
  if (value.quietHours !== undefined) {
    if (!plainObject(value.quietHours)) fail("settings quietHours");
    const allowed = new Set(["enabled", "start", "end"]);
    Object.keys(value.quietHours).forEach((key) => { if (!allowed.has(key)) fail(`settings quietHours ${key}`); });
    result.quietHours = {};
    if (value.quietHours.enabled !== undefined) {
      if (typeof value.quietHours.enabled !== "boolean") fail("settings quietHours enabled");
      result.quietHours.enabled = value.quietHours.enabled;
    }
    ["start", "end"].forEach((key) => {
      if (value.quietHours[key] !== undefined) {
        if (typeof value.quietHours[key] !== "string" || !TIME_PATTERN.test(value.quietHours[key])) fail(`settings quietHours ${key}`);
        result.quietHours[key] = value.quietHours[key];
      }
    });
  }
  if (value.performanceRules !== undefined) {
    if (!plainObject(value.performanceRules)) fail("settings performanceRules");
    const ranges = { cpuThreshold: [1, 100], memoryThreshold: [1, 100], diskFreePercentThreshold: [0, 100], diskFreeBytesThreshold: [0, Number.MAX_SAFE_INTEGER], sustainMs: [1000, 3600000], cooldownMs: [1000, 86400000] };
    result.performanceRules = {};
    Object.entries(value.performanceRules).forEach(([key, current]) => {
      if (!ranges[key] || !Number.isFinite(current) || current < ranges[key][0] || current > ranges[key][1]) fail(`settings performanceRules ${key}`);
      result.performanceRules[key] = current;
    });
  }
  if (value.holidayReminder !== undefined) {
    if (!plainObject(value.holidayReminder)) fail("settings holidayReminder");
    const allowed = new Set(["enabled", "time", "daysBefore", "categories"]);
    Object.keys(value.holidayReminder).forEach((key) => { if (!allowed.has(key)) fail(`settings holidayReminder ${key}`); });
    result.holidayReminder = {};
    if (value.holidayReminder.enabled !== undefined) {
      if (typeof value.holidayReminder.enabled !== "boolean") fail("settings holidayReminder enabled");
      result.holidayReminder.enabled = value.holidayReminder.enabled;
    }
    if (value.holidayReminder.time !== undefined) {
      if (typeof value.holidayReminder.time !== "string" || !TIME_PATTERN.test(value.holidayReminder.time)) fail("settings holidayReminder time");
      result.holidayReminder.time = value.holidayReminder.time;
    }
    if (value.holidayReminder.daysBefore !== undefined) {
      if (![0, 1, 3, 7].includes(value.holidayReminder.daysBefore)) fail("settings holidayReminder daysBefore");
      result.holidayReminder.daysBefore = value.holidayReminder.daysBefore;
    }
    if (value.holidayReminder.categories !== undefined) result.holidayReminder.categories = validateBooleanMap(value.holidayReminder.categories, new Set(["chinaOfficial", "chinaTraditional", "international"]), "settings holidayReminder categories");
  }
  return result;
}

function mergeSettings(current = {}, patch = {}) {
  return {
    ...clone(DEFAULT_NOTIFICATION_SETTINGS),
    ...clone(current),
    ...clone(patch),
    sources: { ...DEFAULT_NOTIFICATION_SETTINGS.sources, ...(current.sources || {}), ...(patch.sources || {}) },
    channels: { ...DEFAULT_NOTIFICATION_SETTINGS.channels, ...(current.channels || {}), ...(patch.channels || {}) },
    quietHours: { ...DEFAULT_NOTIFICATION_SETTINGS.quietHours, ...(current.quietHours || {}), ...(patch.quietHours || {}) }
    ,performanceRules: { ...DEFAULT_NOTIFICATION_SETTINGS.performanceRules, ...(current.performanceRules || {}), ...(patch.performanceRules || {}) },
    holidayReminder: { enabled: false, time: "09:00", daysBefore: 0, categories: { chinaOfficial: true, chinaTraditional: true, international: true }, ...(current.holidayReminder || {}), ...(patch.holidayReminder || {}), categories: { chinaOfficial: true, chinaTraditional: true, international: true, ...(current.holidayReminder?.categories || {}), ...(patch.holidayReminder?.categories || {}) } }
  };
}

function isTrustedNotificationEvent(event, mainContents) {
  if (!event || event.sender !== mainContents) return false;
  if (event.senderFrame) return event.senderFrame.parent === null;
  return event.frameId === 0;
}

function createNotificationService({ store, showWindows, publishMain, publishIsland, navigate, readSettings, writeSettings, now }) {
  let testSequence = 0;
  const currentSettings = () => mergeSettings(validateSettingsPatch(readSettings() || {}));
  const publish = (filter) => {
    const value = store.snapshot(filter);
    try { publishMain(clone(value)); } catch {}
    return value;
  };
  const changeStatus = (method, id) => {
    const record = store[method](id);
    if (record) publish();
    return record;
  };

  function ingest(input) {
    const normalized = normalizeNotification(input, now());
    if (!normalized) throw new TypeError("Invalid notification input");
    if (input.targetPage !== undefined && !TARGET_PAGES.has(input.targetPage)) throw new TypeError("Invalid notification targetPage");
    const record = {
      ...normalized,
      targetPage: TARGET_PAGES.has(input.targetPage) ? input.targetPage : TARGET_PAGES.has(normalized.source) ? normalized.source : "notifications",
      category: CATEGORY_KEYS.has(input.category) ? input.category : undefined,
      dedupeKey: typeof input.dedupeKey === "string" && input.dedupeKey ? input.dedupeKey.slice(0, 240) : notificationDedupeKey(input)
    };
    const result = store.ingest(record);
    if (!result.created) return result;
    const snapshot = publish();
    const decision = deliveryDecision(result.record, currentSettings(), now());
    if (decision.windows) {
      try {
        showWindows(clone(result.record), () => {
          navigate(result.record.targetPage);
          changeStatus("markRead", result.record.id);
        }, { sound: decision.sound });
      } catch {}
    }
    if (decision.island) {
      try { publishIsland(clone(result.record), snapshot.unreadCount); } catch {}
    }
    return result;
  }

  function updateSettings(patch) {
    const validated = validateSettingsPatch(patch);
    const next = mergeSettings(currentSettings(), validated);
    writeSettings(clone(next));
    publish();
    return clone(next);
  }

  function resetSettings() {
    const next = mergeSettings({}, {});
    writeSettings(clone(next));
    publish();
    return clone(next);
  }

  function testNotification() {
    testSequence += 1;
    const occurrence = `${new Date(now()).toISOString()}-${testSequence}`;
    return ingest({ source: "calendar", type: "test", entityId: `test-${occurrence}`, title: "MineWork 测试通知", body: "通知渠道工作正常。", scheduledAt: new Date(now()).toISOString(), targetPage: "notifications", dedupeKey: `test|${occurrence}` });
  }

  function handleAction({ action, id } = {}) {
    if (action === "read") return changeStatus("markRead", id);
    if (action === "dismiss") return changeStatus("dismiss", id);
    if (action === "read-all") { const count = store.markAllRead(); if (count) publish(); return count; }
    if (action === "clear") { const count = store.clear(); publish(); return count; }
    if (action === "open") {
      const record = store.list().find((item) => item.id === id);
      if (!record) return null;
      navigate(record.targetPage);
      changeStatus("markRead", id);
      return record;
    }
    throw new TypeError("Invalid notification action");
  }

  return Object.freeze({ ingest, updateSettings, resetSettings, testNotification, handleAction, snapshot: (filter) => store.snapshot(filter), settings: () => clone(currentSettings()) });
}

module.exports = { createNotificationService, validateNotificationId, validateNotificationFilter, validateSettingsPatch, isTrustedNotificationEvent };
