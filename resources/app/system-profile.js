"use strict";

function positiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function parseWindowsSystemProfile(payload, fallbacks = {}) {
  const cpu = payload?.cpu || {};
  const gpu = payload?.gpu || {};
  const system = payload?.os || {};
  return {
    cpu: {
      model: String(cpu.Name || "").trim(),
      physicalCores: positiveNumber(cpu.NumberOfCores),
      logicalCores: positiveNumber(cpu.NumberOfLogicalProcessors),
      maxClockMHz: positiveNumber(cpu.MaxClockSpeed)
    },
    gpu: {
      name: String(gpu.Name || "正在识别").trim() || "正在识别",
      memory: positiveNumber(gpu.AdapterRAM)
    },
    system: {
      caption: String(system.Caption || "").replace(/^Microsoft\s+/i, "Microsoft ").trim(),
      version: String(system.Version || "").trim(),
      arch: String(system.OSArchitecture || fallbacks.arch || "").trim(),
      hostname: String(fallbacks.hostname || "").trim(),
      bootTime: String(system.LastBootUpTime || "").trim()
    }
  };
}

module.exports = { parseWindowsSystemProfile };
