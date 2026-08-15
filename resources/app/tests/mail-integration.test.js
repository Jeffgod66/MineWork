"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createMailMainBridge,
  createMailWebviewHostBridge,
  parseMailProviderArgument,
  sanitizeMailStatus
} = require("../mail-integration.js");
const { createMailBaselineRuntime } = require("../mail-runtime.js");

const message = (key, sender = "Ada", subject = "Update") => ({ key, sender, subject });
const ready = (provider = "gmail", messages = [], unreadCount = messages.length) => ({ provider, status: "ready", unreadCount, messages });

test("main bridge rejects unauthorized or mismatched provider signals before baseline observation", () => {
  const observed = [];
  const bridge = createMailMainBridge({
    trusted: (event) => event && event.top === true,
    allowedProviders: ["gmail", "outlook"],
    observe: (signal) => { observed.push(signal); return { accepted: true }; },
    publishStatus: () => {},
    now: () => "2026-08-13T00:00:00.000Z"
  });

  assert.equal(bridge.handle({ top: false }, { provider: "gmail", signal: ready() }).accepted, false);
  assert.equal(bridge.handle({ top: true }, { provider: "outlook", signal: ready("gmail") }).accepted, false);
  assert.equal(bridge.handle({ top: true }, { provider: "unknown", signal: ready("unknown") }).accepted, false);
  assert.equal(observed.length, 0);

  assert.equal(bridge.handle({ top: true }, { provider: "gmail", signal: ready() }).accepted, true);
  assert.equal(observed.length, 1);
});

test("baseline integration reads privacy dynamically and private delivery contains no identity", () => {
  let mailPrivacy = false;
  const records = [];
  const runtime = createMailBaselineRuntime({
    ingest: (record) => records.push(record),
    now: () => "2026-08-13T00:00:00.000Z",
    privacy: () => mailPrivacy
  });
  runtime.observe(ready("gmail", [message("a")]));
  runtime.observe(ready("gmail", [message("a"), message("b", "Visible Sender", "Visible Subject")]));
  mailPrivacy = true;
  runtime.observe(ready("gmail", [message("a"), message("b"), message("c", "Secret Sender", "Secret Subject")]));
  assert.match(records[0].body, /Visible Sender.*Visible Subject/);
  assert.equal(JSON.stringify(records[1]).includes("Secret"), false);
  assert.equal(records[1].body, "1 封新邮件");
});

test("main bridge accepts ready baseline then emits a new key once through runtime", () => {
  const records = [];
  const runtime = createMailBaselineRuntime({ ingest: (record) => records.push(record), now: () => "2026-08-13T00:00:00.000Z", privacy: () => false });
  const bridge = createMailMainBridge({ trusted: () => true, allowedProviders: ["gmail"], observe: runtime.observe, publishStatus: () => {}, now: () => "2026-08-13T00:00:00.000Z" });
  bridge.handle({}, { provider: "gmail", signal: ready("gmail", [message("a")]) });
  bridge.handle({}, { provider: "gmail", signal: ready("gmail", [message("a"), message("b")]) });
  bridge.handle({}, { provider: "gmail", signal: ready("gmail", [message("a"), message("b")]) });
  assert.equal(records.length, 1);
  assert.equal(records[0].source, "mail");
  assert.equal(records[0].targetPage, "mail");
});

test("main bridge publishes cloned allowlisted status snapshots and preserves unavailable", () => {
  const published = [];
  const bridge = createMailMainBridge({
    trusted: () => true,
    allowedProviders: ["gmail"],
    observe: () => ({ accepted: true, notified: 0 }),
    publishStatus: (snapshot) => { published.push(snapshot); snapshot.status = "tampered"; },
    now: () => "2026-08-13T00:00:00.000Z"
  });

  bridge.handle({}, { provider: "gmail", signal: { provider: "gmail", status: "unavailable", reason: "login" } });
  assert.deepEqual(bridge.status("gmail"), {
    provider: "gmail", status: "unavailable", unreadCount: null, observedAt: "2026-08-13T00:00:00.000Z"
  });
  assert.deepEqual(Object.keys(published[0]).sort(), ["observedAt", "provider", "status", "unreadCount"]);
  assert.equal(published[0].unreadCount, null);
});

test("main bridge contains baseline failures without publishing status", () => {
  let published = 0;
  const bridge = createMailMainBridge({
    trusted: () => true,
    allowedProviders: ["gmail"],
    observe: () => { throw new Error("notification service down"); },
    publishStatus: () => { published += 1; },
    now: () => "2026-08-13T00:00:00.000Z"
  });
  assert.doesNotThrow(() => bridge.handle({}, { provider: "gmail", signal: ready() }));
  assert.equal(bridge.handle({}, { provider: "gmail", signal: ready() }).accepted, false);
  assert.equal(published, 0);
});

test("renderer host bridge rejects wrong channel, provider, and slot then forwards one safe clone", () => {
  const gmailView = { id: 1 }, outlookView = { id: 2 };
  const sent = [];
  const bridge = createMailWebviewHostBridge({
    slots: new Map([[gmailView, "gmail"], [outlookView, "outlook"]]),
    forward: (value) => { sent.push(value); value.signal.messages[0].subject = "mutated"; }
  });
  const signal = ready("gmail", [message("a")]);

  assert.equal(bridge.handle(gmailView, { channel: "wrong", args: [signal] }), false);
  assert.equal(bridge.handle(outlookView, { channel: "minework:mail-signal", args: [signal] }), false);
  assert.equal(bridge.handle({}, { channel: "minework:mail-signal", args: [signal] }), false);
  assert.equal(bridge.handle(gmailView, { channel: "minework:mail-signal", args: [signal] }), true);
  assert.equal(sent.length, 1);
  assert.equal(signal.messages[0].subject, "Update");
  assert.deepEqual(Object.keys(sent[0]).sort(), ["provider", "signal"]);
});

test("provider identity comes only from the host additional argument", () => {
  assert.equal(parseMailProviderArgument(["--remote-choice=outlook", "--minework-mail-provider=gmail"]), "gmail");
  assert.equal(parseMailProviderArgument(["--minework-mail-provider=unknown"]), null);
  assert.equal(parseMailProviderArgument(["--minework-mail-provider=gmail", "--minework-mail-provider=outlook"]), null);
});

test("status sanitizer rejects extra fields and returns detached values", () => {
  assert.equal(sanitizeMailStatus({ provider: "gmail", status: "ready", unreadCount: 1, observedAt: "2026-08-13T00:00:00.000Z", messages: [] }), null);
  const input = { provider: "gmail", status: "ready", unreadCount: 1, observedAt: "2026-08-13T00:00:00.000Z" };
  const output = sanitizeMailStatus(input);
  input.unreadCount = 9;
  assert.equal(output.unreadCount, 1);
});
