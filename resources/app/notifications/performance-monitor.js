"use strict";

const GB = 1024 ** 3;
const DEFAULTS = Object.freeze({ cpuThreshold: 90, memoryThreshold: 85, diskFreePercentThreshold: 10, diskFreeBytesThreshold: 20 * GB, sustainMs: 120000, cooldownMs: 30 * 60000, recoveryMargin: 5, diskRecoveryFreePercent: 15, diskRecoveryFreeBytes: 25 * GB });

function metricValue(sample, name) {
  const value = sample?.[name]?.usage;
  return Number.isFinite(value) ? value : null;
}
function diskValues(sample) {
  const freeBytes = Number.isFinite(sample?.disk?.free) ? sample.disk.free : Number.isFinite(sample?.disk?.freeBytes) ? sample.disk.freeBytes : null;
  let freePercent = Number.isFinite(sample?.disk?.freePercent) ? sample.disk.freePercent : null;
  if (freePercent === null && Number.isFinite(sample?.disk?.total) && sample.disk.total > 0 && freeBytes !== null) freePercent = freeBytes / sample.disk.total * 100;
  return { freePercent, freeBytes };
}
function emptyMetric(value = null) { return { value, aboveSince: null, active: false, incidentAt: null, recoverySince: null, lastAlertAt: null }; }
function event(metric, kind, incidentAt, current, value) { return { metric, kind, incidentAt, occurredAt: new Date(current).toISOString(), value }; }

function evaluatePerformanceState(previous, sample, settings = {}, now) {
  const config = { ...DEFAULTS, ...(settings || {}) };
  const current = Number(now);
  const prior = previous && previous.metrics ? previous : { metrics: { cpu: emptyMetric(), memory: emptyMetric(), disk: { ...emptyMetric(), freePercent: null, freeBytes: null } } };
  const state = structuredClone(prior);
  state.settings = config;
  const events = [];

  for (const [name, threshold] of [["cpu", config.cpuThreshold], ["memory", config.memoryThreshold]]) {
    const value = metricValue(sample, name);
    const metric = state.metrics[name] || emptyMetric();
    metric.value = value;
    if (value === null) { metric.aboveSince = null; metric.recoverySince = null; state.metrics[name] = metric; continue; }
    if (!metric.active && value > threshold) {
      if (metric.aboveSince === null) metric.aboveSince = current;
      if (current - metric.aboveSince >= config.sustainMs && (metric.lastAlertAt === null || current - metric.lastAlertAt >= config.cooldownMs)) {
        metric.active = true; metric.incidentAt = metric.aboveSince; metric.lastAlertAt = current;
        events.push(event(name, "warning", metric.incidentAt, current, value));
      }
    } else if (!metric.active) metric.aboveSince = null;
    if (metric.active && value <= threshold - config.recoveryMargin) {
      if (metric.recoverySince === null) metric.recoverySince = current;
      if (current - metric.recoverySince >= (config.samplingWindowMs || 2500)) {
        events.push(event(name, "recovery", metric.incidentAt, current, value));
        metric.active = false; metric.aboveSince = null; metric.incidentAt = null; metric.recoverySince = null;
      }
    } else if (metric.active) metric.recoverySince = null;
    state.metrics[name] = metric;
  }

  const values = diskValues(sample);
  const disk = state.metrics.disk || { ...emptyMetric(), freePercent: null, freeBytes: null };
  disk.freePercent = values.freePercent; disk.freeBytes = values.freeBytes;
  const available = values.freePercent !== null || values.freeBytes !== null;
  const low = (values.freePercent !== null && values.freePercent < config.diskFreePercentThreshold) || (values.freeBytes !== null && values.freeBytes < config.diskFreeBytesThreshold);
  if (available && low && !disk.active && (disk.lastAlertAt === null || current - disk.lastAlertAt >= config.cooldownMs)) {
    disk.active = true; disk.incidentAt = current; disk.lastAlertAt = current;
    events.push(event("disk", "warning", current, current, values));
  }
  const recovered = values.freePercent !== null && values.freeBytes !== null && values.freePercent >= config.diskRecoveryFreePercent && values.freeBytes >= config.diskRecoveryFreeBytes;
  if (disk.active && recovered) {
    if (disk.recoverySince === null) disk.recoverySince = current;
    if (current - disk.recoverySince >= (config.samplingWindowMs || 2500)) {
      events.push(event("disk", "recovery", disk.incidentAt, current, values));
      disk.active = false; disk.incidentAt = null; disk.recoverySince = null;
    }
  } else if (disk.active) disk.recoverySince = null;
  state.metrics.disk = disk;
  return { state, events };
}

function createPerformanceMonitor({ sample, ingest, publish, now, setTimer, clearTimer, intervalMs = 2500, settings: initialSettings = {} }) {
  if ([sample, ingest, publish, now, setTimer, clearTimer].some((fn) => typeof fn !== "function")) throw new TypeError("performance monitor adapters are required");
  let timer = null, running = false, state = null, lastSuccess = null, latest = null;
  let settings = { ...DEFAULTS, ...initialSettings, samplingWindowMs: intervalMs };

  function schedule() {
    if (!running) return;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(async () => { timer = null; try { await tick(); } finally { schedule(); } }, intervalMs);
  }
  async function tick() {
    let value;
    try {
      value = await sample();
    } catch (error) {
      const status = { ...(latest || {}), error: error?.message || String(error), lastSuccess };
      publish(status);
      return status;
    }
    const result = evaluatePerformanceState(state, value, settings, now());
    latest = value;
    lastSuccess = value?.sampledAt || new Date(now()).toISOString();
    publish(value);
    for (const item of result.events) {
      const severity = item.kind === "warning" ? "warning" : "recovery";
      const label = item.metric === "cpu" ? "CPU" : item.metric === "memory" ? "Memory" : "Disk";
      await ingest({ source: "performance", type: `performance-${item.kind}`, entityId: item.metric, title: `${label} ${item.kind}`, body: item.kind === "warning" ? `${label} crossed its configured threshold.` : `${label} returned to a safe range.`, severity, scheduledAt: item.occurredAt, targetPage: "performance", category: "performance", dedupeKey: `performance|${item.metric}|${item.kind}|${new Date(item.incidentAt).toISOString()}` });
    }
    state = result.state;
    return value;
  }
  async function start() {
    if (running) return;
    running = true;
    try { await tick(); schedule(); } catch (error) { running = false; throw error; }
  }
  function stop() { running = false; if (timer !== null) clearTimer(timer); timer = null; }
  function updateSettings(patch = {}) { settings = { ...settings, ...patch, samplingWindowMs: intervalMs }; return snapshot(); }
  function snapshot() { return { sample: latest ? structuredClone(latest) : null, state: state ? structuredClone(state) : null, settings: structuredClone(settings), lastSuccess }; }
  return Object.freeze({ start, stop, tick, updateSettings, snapshot });
}

module.exports = { evaluatePerformanceState, createPerformanceMonitor };
