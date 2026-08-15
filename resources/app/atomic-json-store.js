"use strict";

const fs = require("node:fs");
const path = require("node:path");

function objectOrNull(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function parseObject(file) {
  try { return objectOrNull(JSON.parse(fs.readFileSync(file, "utf8"))); } catch { return null; }
}

function readJsonObject(file, { fallback = {} } = {}) {
  return parseObject(file) || parseObject(`${file}.bak`) || structuredClone(fallback);
}

function writeJsonAtomic(file, value) {
  const safe = objectOrNull(value);
  if (!safe) throw new TypeError("JSON store value must be an object");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  const backup = `${file}.bak`;
  fs.writeFileSync(temporary, JSON.stringify(safe, null, 2), "utf8");
  try {
    if (fs.existsSync(file)) fs.copyFileSync(file, backup);
    fs.renameSync(temporary, file);
  } catch (error) {
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch {}
    throw error;
  }
  return structuredClone(safe);
}

module.exports = { readJsonObject, writeJsonAtomic };
