"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../weather-model.js");

const single = { countryCode: "CN", country: "中国", province: "上海市", city: "上海市", district: "浦东新区" };

test("normalizeWeatherSettings catches legacy single-location data loss and unstable IDs", () => {
  const migrated = model.normalizeWeatherSettings({ weatherLocation: single });
  assert.equal(migrated.locations.length, 1);
  assert.equal(migrated.primaryLocationId, migrated.locations[0].id);
  assert.equal(model.normalizeWeatherSettings(migrated).locations[0].id, migrated.locations[0].id);
  assert.equal(model.normalizeWeatherSettings({ locations: [single, single] }).locations.length, 1);
  assert.equal(migrated.islandAutoRotate, false);
  assert.equal(migrated.islandRotateSeconds, 8);
});

test("weatherLocationId catches casing and whitespace creating duplicate saved places", () => {
  assert.equal(model.weatherLocationId(single), model.weatherLocationId({ countryCode: " cn ", country: " 中国 ", province: "上海市", city: " 上海市", district: "浦东新区 " }));
});

test("reorderWeatherLocations catches dropped locations and unknown IDs", () => {
  const settings = model.normalizeWeatherSettings({ locations: [single, { countryCode: "US", country: "US", province: "CA", city: "San Francisco", district: "" }] });
  const [first, second] = settings.locations;
  const reordered = model.reorderWeatherLocations(settings, [second.id, "unknown"]);
  assert.deepEqual(reordered.order, [second.id, first.id]);
  assert.equal(reordered.locations.length, 2);
});

test("normalizeWeatherSettings catches malformed legacy values being discarded", () => {
  const migrated = model.normalizeWeatherSettings({ weatherLocation: { unexpected: true } });
  assert.deepEqual(migrated.legacy, { weatherLocation: { unexpected: true } });
});

test("normalizeWeatherSettings catches frozen nested locations being mutated by legacy migration", () => {
  const locations = Object.freeze([]);
  const input = Object.freeze({ locations, weatherLocation: single });
  const normalized = model.normalizeWeatherSettings(input);
  assert.equal(normalized.locations.length, 1);
  assert.equal(locations.length, 0);
});
