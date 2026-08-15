"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateMailSignal, createMailBaselineRuntime, authorizeMailHost } = require("../mail-runtime.js");
const ready = (messages, unreadCount = messages.length) => ({ provider: "gmail", status: "ready", unreadCount, messages });
const message = (key, sender = "Ada", subject = "Update") => ({ key, sender, subject });

test("validates narrow mail signal schema and host authorization", () => {
  assert.deepEqual(validateMailSignal(ready([message("a")]), "gmail"), ready([message("a")]));
  assert.equal(validateMailSignal({ ...ready([]), html: "no" }, "gmail"), null);
  assert.equal(authorizeMailHost({ sender: 1, mainSender: 1, isTopFrame: true, slotProvider: "gmail", payloadProvider: "gmail" }), true);
  assert.equal(authorizeMailHost({ sender: 2, mainSender: 1, isTopFrame: true, slotProvider: "gmail", payloadProvider: "gmail" }), false);
});

test("baseline emits only new keys once and decrease never notifies", () => {
  const records = []; const runtime = createMailBaselineRuntime({ ingest: (x) => records.push(x), now: () => "2026-08-13T00:00:00.000Z", privacy: () => false });
  runtime.observe(ready([message("a")])); runtime.observe(ready([message("a"), message("b", "Bea", "Hello")])); runtime.observe(ready([message("a"), message("b", "Bea", "Hello")])); runtime.observe(ready([message("a")]));
  assert.equal(records.length, 1); assert.equal(records[0].source, "mail"); assert.equal(records[0].targetPage, "mail"); assert.match(records[0].body, /Bea.*Hello/);
});

test("count increases group, unavailable and recovery do not blast", () => {
  const records = []; const runtime = createMailBaselineRuntime({ ingest: (x) => records.push(x), now: () => "2026-08-13T00:00:00.000Z", privacy: () => false });
  runtime.observe(ready([], 4)); runtime.observe(ready([], 7)); runtime.observe({ provider: "gmail", status: "unavailable", reason: "login" }); runtime.observe(ready([], 9));
  assert.equal(records.length, 1); assert.match(records[0].title, /3/); assert.equal(runtime.status("gmail").status, "ready");
});

test("privacy strips identities from all notification fields and ingest failure preserves retry", () => {
  let shouldFail = true, calls = 0; const accepted = []; const runtime = createMailBaselineRuntime({ ingest: (x) => { calls++; if (shouldFail) throw new Error("down"); accepted.push(x); }, now: () => "2026-08-13T00:00:00.000Z", privacy: () => true });
  runtime.observe(ready([message("a")])); runtime.observe(ready([message("a"), message("b", "Secret Sender", "Secret Subject")])); shouldFail = false; runtime.observe(ready([message("a"), message("b", "Secret Sender", "Secret Subject")]));
  assert.equal(calls, 2); assert.equal(accepted.length, 1); assert.equal(JSON.stringify(accepted[0]).includes("Secret"), false); assert.equal(accepted[0].source, "mail");
});
