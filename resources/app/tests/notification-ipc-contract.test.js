"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateNotificationId, validateNotificationFilter, validateSettingsPatch, isTrustedNotificationEvent } = require("../notifications/notification-service.js");

test("ID and filter validation reject oversized or malformed management input", () => {
  assert.equal(validateNotificationId("id-1"), "id-1");
  assert.throws(() => validateNotificationId("x".repeat(161)), /id/);
  assert.deepEqual(validateNotificationFilter({ status: "unread", category: "mail", query: "report" }), { status: "unread", category: "mail", query: "report" });
  assert.throws(() => validateNotificationFilter({ source: "other" }), /source/);
  assert.throws(() => validateNotificationFilter({ query: "x".repeat(201) }), /query/);
});

test("settings validation rejects unknown keys, wrong booleans, ranges, time and sources", () => {
  assert.deepEqual(validateSettingsPatch({ maxRecords: 250, criticalBypassesQuietHours: true, quietHours: { start: "22:00" }, sources: { mail: false } }), { maxRecords: 250, criticalBypassesQuietHours: true, quietHours: { start: "22:00" }, sources: { mail: false } });
  assert.throws(() => validateSettingsPatch({ maxRecords: 501 }), /maxRecords/);
  assert.throws(() => validateSettingsPatch({ quietHours: { start: "25:00" } }), /start/);
  assert.throws(() => validateSettingsPatch({ sources: { rogue: true } }), /rogue/);
  assert.throws(() => validateSettingsPatch({ channels: { sound: 1 } }), /sound/);
});

test("performance rules are a single validated nested notification settings object", () => {
  assert.deepEqual(validateSettingsPatch({ performanceRules: { cpuThreshold: 92, memoryThreshold: 88, diskFreePercentThreshold: 12, diskFreeBytesThreshold: 25000000000, sustainMs: 90000, cooldownMs: 600000 } }).performanceRules.cpuThreshold, 92);
  assert.throws(() => validateSettingsPatch({ performanceRules: { cpuThreshold: 101 } }), /cpuThreshold/);
  assert.throws(() => validateSettingsPatch({ performanceRules: { rogue: 1 } }), /rogue/);
});

test("trusted event validation requires the main sender and top frame", () => {
  const mainContents = {};
  assert.equal(isTrustedNotificationEvent({ sender: mainContents, senderFrame: { parent: null } }, mainContents), true);
  assert.equal(isTrustedNotificationEvent({ sender: {}, senderFrame: { parent: null } }, mainContents), false);
  assert.equal(isTrustedNotificationEvent({ sender: mainContents, senderFrame: { parent: {} } }, mainContents), false);
  assert.equal(isTrustedNotificationEvent({ sender: mainContents, frameId: 3 }, mainContents), false);
});
