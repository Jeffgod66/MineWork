"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluatePerformanceState, createPerformanceMonitor } = require("../notifications/performance-monitor.js");

const GB = 1024 ** 3;
const at = (seconds) => Date.parse("2026-08-13T00:00:00.000Z") + seconds * 1000;
const sample = (cpu = 20, memory = 30, diskFreePercent = 50, diskFreeBytes = 100 * GB) => ({ cpu: { usage: cpu }, memory: { usage: memory }, disk: { freePercent: diskFreePercent, free: diskFreeBytes }, gpu: null, sampledAt: new Date(at(0)).toISOString() });

function step(state, value, seconds, settings = {}) {
  return evaluatePerformanceState(state, value, settings, at(seconds));
}

test("CPU and memory require 120 seconds continuously above threshold", () => {
  let cpu = step(null, sample(91, 20), 0).state;
  ({ state: cpu } = step(cpu, sample(91, 20), 119));
  assert.equal(step(cpu, sample(91, 20), 119).events.length, 0);
  const cpuAlert = step(cpu, sample(91, 20), 120);
  assert.deepEqual(cpuAlert.events.map((x) => [x.metric, x.kind]), [["cpu", "warning"]]);
  let memory = step(null, sample(20, 86), 0).state;
  ({ state: memory } = step(memory, sample(20, 86), 119));
  assert.equal(step(memory, sample(20, 86), 120).events[0].metric, "memory");
});

test("continued overload does not duplicate and recovery waits one full sampling window", () => {
  let state = step(null, sample(91), 0).state;
  let result = step(state, sample(91), 120); state = result.state;
  assert.equal(result.events.length, 1);
  result = step(state, sample(99), 1800); state = result.state;
  assert.equal(result.events.length, 0);
  result = step(state, sample(84), 1801); state = result.state;
  assert.equal(result.events.length, 0);
  result = step(state, sample(84), 1803.5);
  assert.deepEqual(result.events.map((x) => [x.metric, x.kind]), [["cpu", "recovery"]]);
});

test("disk alerts for either low percentage or bytes and recovers only when both are safe", () => {
  let percent = step(null, sample(20, 20, 9, 50 * GB), 0);
  assert.deepEqual(percent.events.map((x) => x.metric), ["disk"]);
  let bytes = step(null, sample(20, 20, 50, 19 * GB), 0);
  assert.deepEqual(bytes.events.map((x) => x.metric), ["disk"]);
  let state = bytes.state;
  let result = step(state, sample(20, 20, 15, 24 * GB), 3); state = result.state;
  assert.equal(result.events.length, 0);
  result = step(state, sample(20, 20, 15, 25 * GB), 6); state = result.state;
  assert.equal(result.events.length, 0);
  result = step(state, sample(20, 20, 15, 25 * GB), 8.5);
  assert.equal(result.events[0].kind, "recovery");
});

test("missing metrics remain unavailable and never normalize to zero or alert", () => {
  const result = step(null, { cpu: null, memory: null, disk: null, gpu: null }, 0);
  assert.equal(result.events.length, 0);
  assert.equal(result.state.metrics.cpu.value, null);
  assert.equal(result.state.metrics.memory.value, null);
  assert.equal(result.state.metrics.disk.freeBytes, null);
});

test("successful monitor ticks publish the identical sample and ingest normalized incident events", async () => {
  let clock = at(0);
  const value = sample(91);
  const published = [];
  const ingested = [];
  const monitor = createPerformanceMonitor({ sample: async () => value, ingest: async (event) => ingested.push(event), publish: (snapshot) => published.push(snapshot), now: () => clock, setTimer: () => 1, clearTimer: () => {} });
  await monitor.tick();
  clock = at(120);
  await monitor.tick();
  assert.deepEqual(published[0], value);
  assert.strictEqual(published[0], value);
  assert.equal(ingested.length, 1);
  assert.deepEqual({ source: ingested[0].source, targetPage: ingested[0].targetPage, severity: ingested[0].severity, entityId: ingested[0].entityId }, { source: "performance", targetPage: "performance", severity: "warning", entityId: "cpu" });
  assert.match(ingested[0].dedupeKey, /^performance\|cpu\|warning\|/);
});

test("sampling errors preserve last success, publish an error status, and emit no alerts", async () => {
  let fail = false;
  const value = sample(20);
  const published = [];
  const ingested = [];
  const monitor = createPerformanceMonitor({ sample: async () => { if (fail) throw new Error("offline"); return value; }, ingest: async (event) => ingested.push(event), publish: (snapshot) => published.push(snapshot), now: () => at(0), setTimer: () => 1, clearTimer: () => {} });
  await monitor.tick();
  fail = true;
  await monitor.tick();
  assert.equal(published[1].cpu.usage, 20);
  assert.equal(published[1].error, "offline");
  assert.equal(published[1].lastSuccess, value.sampledAt);
  assert.equal(ingested.length, 0);
});

test("settings update live and start/stop own exactly one timer", async () => {
  const timers = new Set();
  const monitor = createPerformanceMonitor({ sample: async () => sample(50), ingest: async () => {}, publish: () => {}, now: () => at(0), setTimer: (fn, delay) => { const timer = { fn, delay }; timers.add(timer); return timer; }, clearTimer: (timer) => timers.delete(timer) });
  monitor.updateSettings({ cpuThreshold: 40 });
  assert.equal(monitor.snapshot().settings.cpuThreshold, 40);
  await monitor.start();
  assert.equal(timers.size, 1);
  monitor.stop();
  assert.equal(timers.size, 0);
});

test("notification ingest failure is retried and is not published as a sampling error", async () => {
  let clock = at(0), attempts = 0;
  const published = [];
  const monitor = createPerformanceMonitor({ sample: async () => sample(91), ingest: async () => { attempts += 1; if (attempts === 1) throw new Error("history unavailable"); }, publish: (value) => published.push(value), now: () => clock, setTimer: () => 1, clearTimer: () => {} });
  await monitor.tick();
  clock = at(120);
  await assert.rejects(monitor.tick(), /history unavailable/);
  assert.equal(published.at(-1).error, undefined);
  clock = at(123);
  await monitor.tick();
  assert.equal(attempts, 2);
});

test("initial persisted rules are active before the first sample", async () => {
  const monitor = createPerformanceMonitor({ sample: async () => sample(50), ingest: async () => {}, publish: () => {}, now: () => at(0), setTimer: () => 1, clearTimer: () => {}, settings: { cpuThreshold: 40, sustainMs: 1000 } });
  await monitor.tick();
  assert.equal(monitor.snapshot().settings.cpuThreshold, 40);
  assert.equal(monitor.snapshot().state.metrics.cpu.aboveSince, at(0));
});

test("start resets after an initial ingest rejection and a later start retries and schedules", async () => {
  let attempts = 0;
  const timers = new Set();
  const monitor = createPerformanceMonitor({ sample: async () => sample(20, 20, 9, 50 * GB), ingest: async () => { attempts += 1; if (attempts === 1) throw new Error("history unavailable"); }, publish: () => {}, now: () => at(0), setTimer: (fn, delay) => { const timer = { fn, delay }; timers.add(timer); return timer; }, clearTimer: (timer) => timers.delete(timer) });
  await assert.rejects(monitor.start(), /history unavailable/);
  assert.equal(timers.size, 0);
  await monitor.start();
  assert.equal(attempts, 2);
  assert.equal(timers.size, 1);
});
