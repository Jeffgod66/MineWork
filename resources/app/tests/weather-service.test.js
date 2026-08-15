"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createWeatherService } = require("../weather-service");
const { normalizeWeatherSettings } = require("../weather-model");

function location(city) {
  return normalizeWeatherSettings({ locations: [{ countryCode: "CN", country: "中国", province: "测试省", city }] }).locations[0];
}

function forecastFor(city, temperature = 20) {
  return {
    location: { name: city, admin: "测试省", admin2: "", country: "中国" },
    current: { temperature_2m: temperature, relative_humidity_2m: 55, apparent_temperature: temperature - 1, precipitation: 0, weather_code: 1, wind_speed_10m: 8 },
    current_units: { temperature_2m: "°C", relative_humidity_2m: "%", apparent_temperature: "°C", precipitation: "mm", wind_speed_10m: "km/h" },
    daily: { time: ["2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16"], weather_code: [1, 2, 3, 0], temperature_2m_max: [25, 26, 27, 28], temperature_2m_min: [18, 19, 20, 21], precipitation_probability_max: [10, 20, 30, 0] }
  };
}

test("batch isolates failures, dedupes IDs, preserves order, and snapshots results", async () => {
  const a = location("甲城");
  const b = location("乙城");
  const service = createWeatherService({
    geocode: async (item) => ({ name: item.city, latitude: 1, longitude: 2 }),
    forecast: async (point, item) => {
      if (item.id === b.id) throw new Error("乙城断网");
      return forecastFor(point.name);
    },
    readCache: async () => null,
    writeCache: async () => {},
    now: () => 1000
  });
  const batch = await service.fetchBatch([a, b, a]);
  assert.deepEqual(batch.order, [a.id, b.id]);
  assert.equal(batch.results[a.id].status, "ok");
  assert.equal(batch.results[b.id].status, "error");
  assert.match(batch.results[b.id].error, /乙城断网/);
  assert.deepEqual(service.snapshot().order, [a.id, b.id]);
});

test("fresh cache, force, TTL, stale fallback, and malformed response preserve last success", async () => {
  const a = location("甲城");
  let clock = 1000;
  let mode = "good";
  let calls = 0;
  const cache = new Map();
  const writes = [];
  const service = createWeatherService({
    geocode: async () => ({ name: "甲城", latitude: 1, longitude: 2 }),
    forecast: async () => {
      calls += 1;
      if (mode === "throw") throw new Error("offline");
      if (mode === "malformed") return { current: { temperature_2m: Infinity }, daily: {} };
      return forecastFor("甲城", calls + 20);
    },
    readCache: async (key) => cache.get(key) || null,
    writeCache: async (key, value) => { writes.push(key); cache.set(key, value); },
    now: () => clock,
    ttlMs: 600
  });
  assert.equal((await service.fetchOne(a)).current.temperature_2m, 21);
  assert.equal((await service.fetchOne(a)).current.temperature_2m, 21);
  assert.equal(calls, 1, "fresh per-location cache should be reused");
  assert.equal((await service.fetchOne(a, { force: true })).current.temperature_2m, 22);
  assert.equal(calls, 2);
  clock = 2000;
  mode = "throw";
  const stale = await service.fetchOne(a);
  assert.equal(stale.status, "stale");
  assert.equal(stale.current.temperature_2m, 22);
  assert.match(stale.error, /offline/);
  mode = "malformed";
  const malformed = await service.fetchOne(a, { force: true });
  assert.equal(malformed.status, "stale");
  assert.equal(malformed.current.temperature_2m, 22);
  assert.equal(writes.length, 2, "failures must not replace successful cache");
  assert.ok(writes.every((key) => key === `weather:${a.id}`));
});

test("batch caps concurrency at four and does not truncate more than twenty locations", async () => {
  const locations = Array.from({ length: 25 }, (_, index) => location(`城市${index}`));
  let active = 0;
  let peak = 0;
  const service = createWeatherService({
    geocode: async (item) => ({ name: item.city, latitude: 1, longitude: 2 }),
    forecast: async (point) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return forecastFor(point.name);
    },
    readCache: async () => null,
    writeCache: async () => {},
    now: () => 1000,
    concurrency: 4
  });
  const batch = await service.fetchBatch(locations);
  assert.equal(batch.order.length, 25);
  assert.equal(Object.keys(batch.results).length, 25);
  assert.equal(peak, 4);
});
