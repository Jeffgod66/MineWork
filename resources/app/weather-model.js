"use strict";

(function attachWeatherModel(factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.mineworkWeatherModel = api;
})(function createWeatherModel() {

function clean(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}

function weatherLocationId(location) {
  const values = [location && location.countryCode, location && location.country, location && location.province, location && location.city, location && location.district]
    .map((value) => clean(value).toLocaleLowerCase());
  return values.join("|");
}

function normalizeLocation(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const location = {
    countryCode: clean(raw.countryCode),
    country: clean(raw.country),
    province: clean(raw.province),
    city: clean(raw.city),
    district: clean(raw.district)
  };
  if (!location.countryCode && !location.country && !location.province && !location.city && !location.district) return null;
  if (!location.countryCode && !location.country) return null;
  location.id = weatherLocationId(location);
  return location;
}

function normalizeWeatherSettings(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const candidates = Array.isArray(source.locations) ? [...source.locations] : [];
  const legacy = source.weatherLocation;
  if (!candidates.length && legacy !== undefined) candidates.push(legacy);
  const locations = [];
  const knownIds = new Set();
  for (const candidate of candidates) {
    const location = normalizeLocation(candidate);
    if (location && !knownIds.has(location.id)) {
      knownIds.add(location.id);
      locations.push(location);
    }
  }
  const requestedOrder = Array.isArray(source.order) ? source.order : [];
  const order = requestedOrder.filter((id) => knownIds.has(id) && !requestedOrder.slice(0, requestedOrder.indexOf(id)).includes(id));
  for (const location of locations) if (!order.includes(location.id)) order.push(location.id);
  const primaryLocationId = knownIds.has(source.primaryLocationId) ? source.primaryLocationId : (locations[0] ? locations[0].id : null);
  const result = {
    locations,
    primaryLocationId,
    order,
    islandAutoRotate: source.islandAutoRotate === true,
    islandRotateSeconds: Number.isFinite(source.islandRotateSeconds) && source.islandRotateSeconds > 0 ? source.islandRotateSeconds : 8
  };
  if (legacy !== undefined && !normalizeLocation(legacy)) result.legacy = { weatherLocation: clone(legacy) };
  else if (source.legacy && typeof source.legacy === "object") result.legacy = clone(source.legacy);
  return result;
}

function reorderWeatherLocations(settings, ids) {
  const normalized = normalizeWeatherSettings(settings);
  const desired = Array.isArray(ids) ? ids : [];
  const present = new Set(normalized.locations.map((location) => location.id));
  const order = [];
  for (const id of desired) if (present.has(id) && !order.includes(id)) order.push(id);
  for (const id of normalized.order) if (!order.includes(id)) order.push(id);
  return { ...normalized, locations: normalized.locations.map((location) => ({ ...location })), order };
}

function migrateWeatherStorage(snapshot, persist) {
  const source = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot : {};
  const existing = source["weather-settings"];
  const normalized = normalizeWeatherSettings(existing === undefined ? { weatherLocation: source["weather-location"] } : existing);
  const shouldPersist = existing === undefined || JSON.stringify(existing) !== JSON.stringify(normalized);
  if (shouldPersist && typeof persist === "function") persist("weather-settings", clone(normalized));
  return { settings: normalized, persisted: shouldPersist };
}

function createWeatherState(settings, weatherResults = {}) {
  const weatherSettings = normalizeWeatherSettings(settings);
  const selectedWeatherLocationId = weatherSettings.primaryLocationId || weatherSettings.order[0] || null;
  return { weatherSettings, selectedWeatherLocationId, weatherResults: clone(weatherResults) || {}, weather: selectedWeatherLocationId ? clone(weatherResults[selectedWeatherLocationId] || null) : null };
}

function addWeatherLocation(state, rawLocation) {
  const current = createWeatherState(state?.weatherSettings, state?.weatherResults);
  const location = normalizeLocation(rawLocation);
  if (!location) return { ...state, ...current };
  if (!current.weatherSettings.locations.some((item) => item.id === location.id)) {
    current.weatherSettings.locations.push(location);
    current.weatherSettings.order.push(location.id);
    if (!current.weatherSettings.primaryLocationId) current.weatherSettings.primaryLocationId = location.id;
  }
  current.selectedWeatherLocationId = location.id;
  current.weather = current.weatherResults[location.id] || null;
  return { ...state, ...current };
}

function removeWeatherLocation(state, id) {
  const settings = normalizeWeatherSettings(state?.weatherSettings);
  const oldOrder = settings.order;
  const removedIndex = oldOrder.indexOf(id);
  settings.locations = settings.locations.filter((item) => item.id !== id);
  settings.order = oldOrder.filter((item) => item !== id);
  if (settings.primaryLocationId === id || !settings.order.includes(settings.primaryLocationId)) settings.primaryLocationId = settings.order[0] || null;
  let selectedWeatherLocationId = state?.selectedWeatherLocationId;
  if (!settings.order.includes(selectedWeatherLocationId)) selectedWeatherLocationId = settings.order[Math.min(Math.max(removedIndex, 0), settings.order.length - 1)] || null;
  const weatherResults = { ...(state?.weatherResults || {}) };
  delete weatherResults[id];
  return { ...state, weatherSettings: settings, selectedWeatherLocationId, weatherResults, weather: selectedWeatherLocationId ? weatherResults[selectedWeatherLocationId] || null : null };
}

function moveWeatherLocation(state, id, delta) {
  const settings = normalizeWeatherSettings(state?.weatherSettings);
  const index = settings.order.indexOf(id);
  if (index >= 0) {
    const target = Math.max(0, Math.min(settings.order.length - 1, index + Math.trunc(Number(delta) || 0)));
    if (target !== index) settings.order.splice(target, 0, settings.order.splice(index, 1)[0]);
  }
  return { ...state, weatherSettings: settings };
}

function selectWeatherLocation(state, id) {
  const settings = normalizeWeatherSettings(state?.weatherSettings);
  const selectedWeatherLocationId = settings.order.includes(id) ? id : settings.primaryLocationId || settings.order[0] || null;
  return { ...state, weatherSettings: settings, selectedWeatherLocationId, weather: selectedWeatherLocationId ? state?.weatherResults?.[selectedWeatherLocationId] || null : null };
}

function setPrimaryWeatherLocation(state, id) {
  const settings = normalizeWeatherSettings(state?.weatherSettings);
  if (settings.order.includes(id)) settings.primaryLocationId = id;
  return { ...state, weatherSettings: settings };
}

function mergeWeatherBatch(state, batch) {
  const weatherResults = { ...(state?.weatherResults || {}), ...(batch?.results || {}) };
  const compatibilityId = state?.weatherSettings?.primaryLocationId || state?.selectedWeatherLocationId;
  return { ...state, weatherResults, weather: compatibilityId ? weatherResults[compatibilityId] || null : null };
}

return { normalizeWeatherSettings, weatherLocationId, reorderWeatherLocations, migrateWeatherStorage, createWeatherState, addWeatherLocation, removeWeatherLocation, moveWeatherLocation, selectWeatherLocation, setPrimaryWeatherLocation, mergeWeatherBatch };
});
