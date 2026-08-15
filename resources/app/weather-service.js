"use strict";

const { weatherLocationId } = require("./weather-model");

const CURRENT_FIELDS = Object.freeze([
  "temperature_2m", "relative_humidity_2m", "apparent_temperature",
  "precipitation", "weather_code", "wind_speed_10m"
]);
const DAILY_FIELDS = Object.freeze([
  "time", "weather_code", "temperature_2m_max", "temperature_2m_min",
  "precipitation_probability_max"
]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function timeValue(now) {
  const value = typeof now === "function" ? now() : Date.now();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normalizedLocation(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const location = {
    countryCode: String(raw.countryCode || "").trim().slice(0, 2).toUpperCase(),
    country: String(raw.country || "").trim().slice(0, 60),
    province: String(raw.province || "").trim().slice(0, 60),
    city: String(raw.city || "").trim().slice(0, 60),
    district: String(raw.district || "").trim().slice(0, 60)
  };
  location.id = weatherLocationId(location);
  if (!location.id.replaceAll("|", "") || (!location.countryCode && !location.country)) return null;
  return location;
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateForecast(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("天气服务返回了无效数据");
  const current = payload.current;
  if (!current || CURRENT_FIELDS.some((field) => !finite(current[field]))) throw new Error("天气实况数据不完整");
  const daily = payload.daily;
  if (!daily || DAILY_FIELDS.some((field) => !Array.isArray(daily[field]))) throw new Error("天气预报数据不完整");
  const count = Math.min(4, ...DAILY_FIELDS.map((field) => daily[field].length));
  if (!count) throw new Error("天气预报数据不完整");
  for (let index = 0; index < count; index += 1) {
    if (typeof daily.time[index] !== "string" || Number.isNaN(Date.parse(`${daily.time[index]}T00:00:00`))) throw new Error("天气日期无效");
    for (const field of DAILY_FIELDS.slice(1)) if (!finite(daily[field][index])) throw new Error("天气预报数值无效");
  }
  const location = payload.location;
  if (!location || typeof location !== "object" || !String(location.name || "").trim()) throw new Error("天气位置无效");
  const currentUnits = payload.currentUnits || payload.current_units;
  if (!currentUnits || typeof currentUnits !== "object" || Array.isArray(currentUnits)) throw new Error("天气单位无效");
  return {
    location: clone(location),
    current: Object.fromEntries(CURRENT_FIELDS.map((field) => [field, current[field]])),
    currentUnits: clone(currentUnits),
    daily: Object.fromEntries(DAILY_FIELDS.map((field) => [field, daily[field].slice(0, count)]))
  };
}

function cacheSuccess(value) {
  if (!value || typeof value !== "object") return null;
  const candidate = value.value && typeof value.value === "object" ? value.value : value;
  if (!candidate.updatedAt || !["ok", "stale"].includes(candidate.status)) return null;
  try {
    const valid = validateForecast(candidate);
    return { ...valid, id: candidate.id, status: "ok", updatedAt: candidate.updatedAt };
  } catch {
    return null;
  }
}

function createWeatherService({ geocode, forecast, readCache, writeCache, now = Date.now, concurrency = 4, ttlMs = 600000 } = {}) {
  if (typeof geocode !== "function" || typeof forecast !== "function") throw new TypeError("geocode and forecast are required");
  const read = typeof readCache === "function" ? readCache : async () => null;
  const write = typeof writeCache === "function" ? writeCache : async () => {};
  const limit = Math.max(1, Math.min(4, Math.trunc(Number(concurrency) || 4)));
  const memory = new Map();
  const order = [];

  function remember(result) {
    memory.set(result.id, clone(result));
    if (!order.includes(result.id)) order.push(result.id);
  }

  async function fetchOne(rawLocation, { force = false } = {}) {
    const location = normalizedLocation(rawLocation);
    if (!location) return { id: String(rawLocation?.id || ""), status: "error", location: null, current: null, currentUnits: null, daily: null, updatedAt: timeValue(now).toISOString(), error: "天气位置无效" };
    const key = `weather:${location.id}`;
    const at = timeValue(now);
    let cached = memory.get(location.id);
    if (!cached) cached = cacheSuccess(await read(key));
    if (cached && !force && at.getTime() - new Date(cached.updatedAt).getTime() < ttlMs) {
      const fresh = { ...clone(cached), id: location.id, status: "ok" };
      remember(fresh);
      return fresh;
    }
    try {
      const point = await geocode(clone(location));
      if (!point || !finite(Number(point.latitude)) || !finite(Number(point.longitude))) throw new Error("没有找到天气位置");
      const valid = validateForecast(await forecast(point, clone(location)));
      const result = { id: location.id, status: "ok", ...valid, updatedAt: at.toISOString() };
      await write(key, clone(result));
      remember(result);
      return clone(result);
    } catch (error) {
      const message = String(error?.message || "天气服务暂时不可用");
      if (cached) {
        const stale = { ...clone(cached), id: location.id, status: "stale", error: message };
        remember(stale);
        return stale;
      }
      const failed = { id: location.id, status: "error", location: clone(location), current: null, currentUnits: null, daily: null, updatedAt: at.toISOString(), error: message };
      remember(failed);
      return failed;
    }
  }

  async function fetchBatch(rawLocations, options = {}) {
    const locations = [];
    const seen = new Set();
    for (const raw of Array.isArray(rawLocations) ? rawLocations : []) {
      const location = normalizedLocation(raw);
      const id = location?.id || String(raw?.id || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      locations.push(location || raw);
    }
    const batchOrder = locations.map((item) => normalizedLocation(item)?.id || String(item?.id || ""));
    for (const id of batchOrder) if (!order.includes(id)) order.push(id);
    const results = {};
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(limit, locations.length) }, async () => {
      while (cursor < locations.length) {
        const index = cursor++;
        const result = await fetchOne(locations[index], options);
        results[batchOrder[index]] = result;
      }
    }));
    return { results, order: batchOrder, updatedAt: timeValue(now).toISOString() };
  }

  function snapshot(locationIds) {
    const requested = Array.isArray(locationIds) ? locationIds : order;
    const snapshotOrder = [];
    const results = {};
    for (const id of requested) {
      if (!snapshotOrder.includes(id) && memory.has(id)) {
        snapshotOrder.push(id);
        results[id] = clone(memory.get(id));
      }
    }
    return { results, order: snapshotOrder, updatedAt: timeValue(now).toISOString() };
  }

  return Object.freeze({ fetchOne, fetchBatch, snapshot });
}

module.exports = { createWeatherService };
