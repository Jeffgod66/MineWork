"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../weather-model");

const shanghai = { countryCode: "CN", country: "中国", province: "上海市", city: "上海市", district: "浦东新区" };
const london = { countryCode: "GB", country: "United Kingdom", province: "England", city: "London", district: "" };

test("legacy startup migration persists normalized settings once and is idempotent", () => {
  const writes = [];
  const first = model.migrateWeatherStorage({ "weather-location": shanghai }, (key, value) => writes.push([key, value]));
  assert.equal(first.settings.locations.length, 1);
  assert.equal(first.persisted, true);
  assert.deepEqual(writes.map(([key]) => key), ["weather-settings"]);
  const second = model.migrateWeatherStorage({ "weather-settings": writes[0][1], "weather-location": shanghai }, (key, value) => writes.push([key, value]));
  assert.equal(second.persisted, false);
  assert.equal(writes.length, 1);
});

test("add dedupes, removing primary promotes first remaining, and selected deletion chooses neighbor", () => {
  let state = model.createWeatherState({ locations: [shanghai, london] });
  const firstId = state.weatherSettings.order[0];
  const secondId = state.weatherSettings.order[1];
  state = model.addWeatherLocation(state, shanghai);
  assert.equal(state.weatherSettings.locations.length, 2);
  state = { ...state, selectedWeatherLocationId: firstId };
  state = model.removeWeatherLocation(state, firstId);
  assert.equal(state.weatherSettings.primaryLocationId, secondId);
  assert.equal(state.selectedWeatherLocationId, secondId);
  assert.deepEqual(state.weatherSettings.order, [secondId]);
});

test("reorder is complete and selected fallback remains valid", () => {
  const third = { countryCode: "JP", country: "日本", province: "東京都", city: "東京", district: "" };
  let state = model.createWeatherState({ locations: [shanghai, london, third] });
  const [a, b, c] = state.weatherSettings.order;
  state = model.moveWeatherLocation(state, c, -1);
  assert.deepEqual(state.weatherSettings.order, [a, c, b]);
  state = model.selectWeatherLocation(state, "missing");
  assert.equal(state.selectedWeatherLocationId, a);
});

test("batch state merge preserves results absent from a partial refresh", () => {
  const base = model.createWeatherState({ locations: [shanghai, london] });
  const [a, b] = base.weatherSettings.order;
  const previous = { ...base, weatherResults: { [a]: { id: a, status: "ok", updatedAt: "old-a" }, [b]: { id: b, status: "ok", updatedAt: "old-b" } } };
  const merged = model.mergeWeatherBatch(previous, { order: [a], results: { [a]: { id: a, status: "stale", updatedAt: "new-a" } } });
  assert.equal(merged.weatherResults[a].updatedAt, "new-a");
  assert.equal(merged.weatherResults[b].updatedAt, "old-b");
  assert.equal(merged.weather, merged.weatherResults[a]);
});
