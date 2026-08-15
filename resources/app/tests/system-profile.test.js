"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseWindowsSystemProfile } = require("../system-profile.js");

test("parseWindowsSystemProfile catches renamed or dropped CIM hardware fields", () => {
  const profile = parseWindowsSystemProfile({
    cpu: { Name: "Example CPU", NumberOfCores: 8, NumberOfLogicalProcessors: 16, MaxClockSpeed: 4200 },
    gpu: { Name: "Example GPU", AdapterRAM: 8 * 1024 ** 3 },
    os: { Caption: "Microsoft Windows 11 Pro", Version: "10.0.26100", LastBootUpTime: "2026-08-11T01:00:00.000Z", OSArchitecture: "64-bit" }
  }, { arch: "x64", hostname: "MINEWORK" });

  assert.deepEqual(profile.cpu, {
    model: "Example CPU",
    physicalCores: 8,
    logicalCores: 16,
    maxClockMHz: 4200
  });
  assert.deepEqual(profile.gpu, { name: "Example GPU", memory: 8 * 1024 ** 3 });
  assert.deepEqual(profile.system, {
    caption: "Microsoft Windows 11 Pro",
    version: "10.0.26100",
    arch: "64-bit",
    hostname: "MINEWORK",
    bootTime: "2026-08-11T01:00:00.000Z"
  });
});

test("parseWindowsSystemProfile catches fabricated zeros after a failed CIM query", () => {
  const profile = parseWindowsSystemProfile(null, { arch: "x64", hostname: "DESKTOP" });
  assert.deepEqual(profile.cpu, { model: "", physicalCores: null, logicalCores: null, maxClockMHz: null });
  assert.deepEqual(profile.gpu, { name: "正在识别", memory: null });
  assert.deepEqual(profile.system, { caption: "", version: "", arch: "x64", hostname: "DESKTOP", bootTime: "" });
});
