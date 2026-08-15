"use strict";

const { calendarDateMeta } = require("./calendar-model.js");

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function dateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(key, amount) {
  const value = new Date(`${key}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function computedDate(year, rule, month) {
  if (rule !== "fourth-thursday") return null;
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return dateKey(year, month, 1 + ((4 - first + 7) % 7) + 21);
}

function buildHolidayReminders({ china, international, year, settings } = {}) {
  if (!Number.isInteger(year) || !settings || settings.enabled !== true) return [];
  const categories = settings.categories || {};
  const time = TIME_PATTERN.test(settings.time || "") ? settings.time : "09:00";
  const daysBefore = [0, 1, 3, 7].includes(Number(settings.daysBefore)) ? Number(settings.daysBefore) : 0;
  const items = [];
  const add = (id, title, holidayDate, category) => {
    if (!DATE_PATTERN.test(holidayDate || "")) return;
    items.push({ id: `${category}:${id}:${holidayDate}:${daysBefore}`, title: daysBefore ? `${title}（提前 ${daysBefore} 天）` : title, date: addDays(holidayDate, -daysBefore), holidayDate, time, enabled: true, category });
  };

  if (categories.chinaOfficial !== false) {
    let previousRest = false;
    let previousKey = "";
    for (const [key, status] of Object.entries(china?.year === year ? china.days || {} : {}).sort(([a], [b]) => a.localeCompare(b))) {
      const isRest = status === "rest";
      const contiguous = previousKey && addDays(previousKey, 1) === key;
      if (isRest && (!previousRest || !contiguous)) add(`official-${key}`, "法定节假日", key, "china-official");
      previousRest = isRest;
      previousKey = key;
    }
  }

  if (categories.chinaTraditional !== false) {
    const names = new Set((china?.festivals || []).filter((item) => item.category === "china-traditional").map((item) => item.name));
    let cursor = new Date(Date.UTC(year, 0, 1));
    while (cursor.getUTCFullYear() === year) {
      const key = cursor.toISOString().slice(0, 10);
      for (const name of calendarDateMeta(key, { china, international: { items: [] } }).festivals) if (names.has(name)) add(`traditional-${name}`, name, key, "china-traditional");
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  if (categories.international !== false) {
    for (const item of international?.items || []) {
      const rule = item.dateRule || {};
      const key = rule.type === "fixed" ? dateKey(year, rule.month, rule.day) : computedDate(year, rule.rule, rule.month);
      if (key) add(item.id, item.name, key, "international");
    }
  }
  return items;
}

module.exports = { buildHolidayReminders };
