"use strict";

const SUPPORTED_YEAR_MIN = 1901;
const SUPPORTED_YEAR_MAX = 2100;
const DAY = 86400000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const MONTH_NAMES = ["正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
const DAY_NAMES = ["初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十", "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"];
const SOLAR_TERMS = ["小寒", "大寒", "立春", "雨水", "惊蛰", "春分", "清明", "谷雨", "立夏", "小满", "芒种", "夏至", "小暑", "大暑", "立秋", "处暑", "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至"];
const SOLAR_TERM_MINUTES = [0, 21208, 42467, 63836, 85337, 107014, 128867, 150921, 173149, 195551, 218072, 240693, 263343, 285989, 308563, 331033, 353350, 375494, 397447, 419210, 440795, 462224, 483532, 504758];
const TYPES = new Set(["birthday", "anniversary", "custom"]);
const CALENDARS = new Set(["solar", "lunar"]);
const RECURRENCES = new Set(["once", "monthly", "yearly"]);
const REMINDERS = new Set([0, 1, 3, 7]);
// Year records 1900-2100. Low nibble is leap month; bits 16..5 are
// normal-month lengths (1 = 30 days); bit 16 is also the leap-month length.
// 1900 is retained only as the arithmetic anchor for early-1901 solar dates.
const LUNAR_YEAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x16a95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
  0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d260,
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a4d0, 0x0d150, 0x0f252,
  0x0d520
];

function parseDateKey(value) {
  const match = typeof value === "string" && value.match(DATE_PATTERN);
  if (!match) throw new RangeError("Invalid local calendar date");
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) throw new RangeError("Invalid local calendar date");
  return { year, month, day };
}

function toDateKey(input) {
  if (typeof input === "string" && DATE_PATTERN.test(input)) { parseDateKey(input); return input; }
  const date = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid local calendar date");
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(key, amount) {
  const { year, month, day } = parseDateKey(key);
  const next = new Date(Date.UTC(year, month - 1, day + amount));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

function lunarInfo(year) { return LUNAR_YEAR_INFO[year - 1900]; }
function leapMonth(year) { return lunarInfo(year) & 0xf; }
function leapDays(year) { return leapMonth(year) ? (lunarInfo(year) & 0x10000 ? 30 : 29) : 0; }
function lunarMonthDays(year, month) { return lunarInfo(year) & (0x10000 >> month) ? 30 : 29; }
function lunarYearDays(year) {
  let days = 348;
  for (let bit = 0x8000; bit > 0x8; bit >>= 1) if (lunarInfo(year) & bit) days += 1;
  return days + leapDays(year);
}

function solarToLunar(dateKey) {
  const { year, month, day } = parseDateKey(dateKey);
  if (year < SUPPORTED_YEAR_MIN || year > SUPPORTED_YEAR_MAX) throw new RangeError(`Lunar calendar supports ${SUPPORTED_YEAR_MIN}-${SUPPORTED_YEAR_MAX}`);
  let offset = Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(1900, 0, 31)) / DAY);
  let lunarYear = 1900;
  while (lunarYear <= 2100) {
    const days = lunarYearDays(lunarYear);
    if (offset < days) break;
    offset -= days; lunarYear += 1;
  }
  const leap = leapMonth(lunarYear);
  let lunarMonth = 1, isLeap = false;
  while (lunarMonth <= 12) {
    const days = isLeap ? leapDays(lunarYear) : lunarMonthDays(lunarYear, lunarMonth);
    if (offset < days) break;
    offset -= days;
    if (leap === lunarMonth && !isLeap) { isLeap = true; continue; }
    if (isLeap) isLeap = false;
    lunarMonth += 1;
  }
  const lunarDay = offset + 1;
  const displayMonth = lunarMonth === 11 ? "冬月" : lunarMonth === 12 ? "腊月" : MONTH_NAMES[lunarMonth - 1];
  return { year: lunarYear, month: lunarMonth, day: lunarDay, isLeap, monthName: `${isLeap ? "闰" : ""}${displayMonth}`, dayName: DAY_NAMES[lunarDay - 1] };
}

function solarTerm(dateKey) {
  const { year } = parseDateKey(dateKey);
  if (year < SUPPORTED_YEAR_MIN || year > SUPPORTED_YEAR_MAX) return "";
  for (let index = 0; index < 24; index += 1) {
    const instant = new Date(Date.UTC(1900, 0, 6, 2, 5) + 31556925974.7 * (year - 1900) + SOLAR_TERM_MINUTES[index] * 60000);
    const china = new Date(instant.getTime() + 8 * 3600000);
    const key = `${china.getUTCFullYear()}-${String(china.getUTCMonth() + 1).padStart(2, "0")}-${String(china.getUTCDate()).padStart(2, "0")}`;
    if (key === dateKey) return SOLAR_TERMS[index];
  }
  return "";
}

function validateHolidaySnapshot(raw, expectedYear) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof raw.version !== "string" || !raw.version.trim()) throw new TypeError("Invalid holiday snapshot version");
  if (!Number.isInteger(raw.year) || (expectedYear !== undefined && raw.year !== expectedYear)) throw new TypeError("Invalid holiday snapshot year");
  if (!raw.source || typeof raw.source.url !== "string" || !/^https:\/\//.test(raw.source.url) || typeof raw.source.title !== "string" || !raw.source.title.trim() || !DATE_PATTERN.test(raw.source.retrievedAt || "")) throw new TypeError("Invalid holiday snapshot source");
  if (!raw.days || typeof raw.days !== "object" || Array.isArray(raw.days)) throw new TypeError("Invalid holiday snapshot days");
  for (const [date, status] of Object.entries(raw.days)) {
    const parsed = parseDateKey(date);
    if (parsed.year !== raw.year) throw new TypeError("Holiday date year does not match snapshot year");
    if (status !== "rest" && status !== "work") throw new TypeError("Invalid holiday status");
  }
  if (!Array.isArray(raw.festivals)) throw new TypeError("Invalid holiday festivals");
  const seen = new Set();
  for (const item of raw.festivals) {
    if (!item || typeof item.name !== "string" || !["china-traditional", "china-commemoration"].includes(item.category)) throw new TypeError("Invalid holiday festival");
    if (!item.date && !item.lunar && !item.solarTerm) throw new TypeError("Invalid holiday festival rule");
    const key = `${item.date || item.lunar || item.solarTerm}|${item.name}`;
    if (seen.has(key)) throw new TypeError("Duplicate holiday festival");
    seen.add(key);
  }
  return structuredClone(raw);
}

function normalizeAnniversary(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id.trim().slice(0, 160) : "";
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 120) : "";
  if (!id || !title || !TYPES.has(raw.type) || !CALENDARS.has(raw.calendar) || !RECURRENCES.has(raw.recurrence)) return null;
  if (raw.calendar === "lunar" && raw.recurrence === "monthly") return null;
  let parsed;
  if (raw.calendar === "lunar") {
    const match = typeof raw.date === "string" && raw.date.match(DATE_PATTERN);
    if (!match) return null;
    parsed = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
    if (parsed.year < SUPPORTED_YEAR_MIN || parsed.year > SUPPORTED_YEAR_MAX || parsed.month < 1 || parsed.month > 12 || parsed.day < 1 || parsed.day > 30) return null;
  } else {
    try { parsed = parseDateKey(raw.date); } catch { return null; }
  }
  const allDay = raw.allDay !== false;
  const time = allDay ? "09:00" : raw.time;
  if (!TIME_PATTERN.test(time || "")) return null;
  const reminders = [...new Set((Array.isArray(raw.reminders) ? raw.reminders : [0]).map(Number).filter((value) => REMINDERS.has(value)))].sort((a, b) => a - b);
  return { id, title, type: raw.type, calendar: raw.calendar, recurrence: raw.recurrence, date: raw.date, isLeapMonth: raw.calendar === "lunar" && raw.isLeapMonth === true, allDay, time, reminders, enabled: raw.enabled !== false };
}

function localDateTime(dateKey, time) { return new Date(`${dateKey}T${time}:00`); }

function occurrenceFor(item, dateKey) {
  const due = localDateTime(dateKey, item.time);
  if (!Number.isFinite(due.getTime())) return null;
  return { key: `anniversary|${item.id}|${dateKey}|${item.time}`, entityId: item.id, title: item.title, dateKey, dueAt: due.toISOString(), allDay: item.allDay, reminders: [...item.reminders] };
}

function anniversaryOccurrences(raw, from, to) {
  const item = normalizeAnniversary(raw);
  if (!item || !item.enabled) return [];
  let start, end;
  try { start = toDateKey(from); end = toDateKey(to); } catch { return []; }
  if (start > end) return [];
  const sourceMatch = item.date.match(DATE_PATTERN);
  const source = item.calendar === "lunar"
    ? { year: Number(sourceMatch[1]), month: Number(sourceMatch[2]), day: Number(sourceMatch[3]) }
    : parseDateKey(item.date);
  const found = [];
  if (item.calendar === "lunar") {
    for (let key = start; key <= end; key = addDays(key, 1)) {
      let lunar;
      try { lunar = solarToLunar(key); } catch { continue; }
      const exact = lunar.month === source.month && lunar.day === source.day && lunar.isLeap === item.isLeapMonth;
      if (exact && (item.recurrence === "yearly" || (item.recurrence === "once" && lunar.year === source.year))) found.push(occurrenceFor(item, key));
    }
    return found.filter(Boolean);
  }
  const startYear = parseDateKey(start).year, endYear = parseDateKey(end).year;
  const candidates = [];
  if (item.recurrence === "once") candidates.push(item.date);
  if (item.recurrence === "yearly") {
    for (let year = startYear; year <= endYear; year += 1) {
      const leap = source.month === 2 && source.day === 29;
      const day = leap && new Date(Date.UTC(year, 1, 29)).getUTCDate() !== 29 ? 28 : source.day;
      candidates.push(`${year}-${String(source.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
  }
  if (item.recurrence === "monthly") {
    let cursor = parseDateKey(start);
    while (cursor.year < endYear || cursor.year === endYear && cursor.month <= parseDateKey(end).month) {
      const max = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();
      if (source.day <= max) candidates.push(`${cursor.year}-${String(cursor.month).padStart(2, "0")}-${String(source.day).padStart(2, "0")}`);
      cursor.month += 1; if (cursor.month > 12) { cursor.month = 1; cursor.year += 1; }
    }
  }
  return [...new Set(candidates)].filter((key) => key >= start && key <= end).map((key) => occurrenceFor(item, key)).filter(Boolean);
}

function festivalDetails(dateKey, datasets, lunar, term) {
  const details = [];
  const add = (name, category) => { if (name && !details.some((item) => item.name === name)) details.push({ name, category }); };
  for (const item of datasets?.china?.festivals || []) {
    if (item.date === dateKey || item.solarTerm === term || item.lunar && item.lunar.month === lunar.month && item.lunar.day === lunar.day && Boolean(item.lunar.isLeap) === lunar.isLeap) add(item.name, item.category);
  }
  const { month, day } = parseDateKey(dateKey);
  for (const item of datasets?.international?.items || []) {
    if (item.changesWorkday !== false) continue;
    if (item.dateRule?.type === "fixed" && item.dateRule.month === month && item.dateRule.day === day) add(item.name, item.category);
    if (item.dateRule?.type === "computed" && item.dateRule.rule === "fourth-thursday" && item.dateRule.month === month) {
      const { year } = parseDateKey(dateKey);
      const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
      const fourthThursday = 1 + ((4 - firstWeekday + 7) % 7) + 21;
      if (day === fourthThursday) add(item.name, item.category);
    }
  }
  return details;
}

function calendarDateMeta(dateKey, datasets = {}) {
  const lunar = solarToLunar(dateKey);
  const term = solarTerm(dateKey);
  const festivalDetailsForDay = festivalDetails(dateKey, datasets, lunar, term);
  const festivals = festivalDetailsForDay.map((item) => item.name);
  let workStatus = "";
  const requestedYear = parseDateKey(dateKey).year;
  const candidates = Array.isArray(datasets.chinaSnapshots) ? datasets.chinaSnapshots : [datasets.china];
  for (const candidate of candidates) {
    try { const snapshot = validateHolidaySnapshot(candidate); if (snapshot.year === requestedYear) { workStatus = snapshot.days[dateKey] || ""; break; } } catch {}
  }
  const anniversaries = (datasets.anniversaries || []).map(normalizeAnniversary).filter(Boolean).flatMap((item) => anniversaryOccurrences(item, dateKey, dateKey));
  return { lunarDay: lunar.dayName, lunarMonth: lunar.monthName, solarTerm: term, festivals, festivalCategories: festivalDetailsForDay.map((item) => item.category), workStatus, label: anniversaries[0]?.title || festivals[0] || term || lunar.dayName };
}

function calendarMonthProjection(year, month, inputs = {}) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) throw new RangeError("Invalid calendar month");
  const first = new Date(Date.UTC(year, month - 1, 1));
  let key = addDays(`${year}-${String(month).padStart(2, "0")}-01`, -first.getUTCDay());
  return Array.from({ length: 42 }, () => {
    const dateKey = key;
    const meta = calendarDateMeta(dateKey, inputs);
    const anniversary = (inputs.anniversaries || []).some((item) => anniversaryOccurrences(item, dateKey, dateKey).length);
    const cell = { dateKey, inMonth: parseDateKey(dateKey).month === month, meta, signals: { tasks: (inputs.tasks || []).filter((item) => item?.date === dateKey).length, events: (inputs.events || []).filter((item) => { try { return toDateKey(item?.date) === dateKey; } catch { return false; } }).length, holiday: meta.festivals.length > 0 || Boolean(meta.workStatus), anniversary }, holidaySignals: { officialHoliday: Boolean(meta.workStatus), traditionalFestival: meta.festivalCategories.includes("china-traditional") || meta.festivalCategories.includes("china-commemoration"), internationalDate: meta.festivalCategories.includes("international") } };
    key = addDays(key, 1);
    return cell;
  });
}

const calendarModelApi = { SUPPORTED_YEAR_MIN, SUPPORTED_YEAR_MAX, toDateKey, solarToLunar, solarTerm, calendarDateMeta, normalizeAnniversary, anniversaryOccurrences, calendarMonthProjection, validateHolidaySnapshot };
if (typeof module !== "undefined" && module.exports) module.exports = calendarModelApi;
if (typeof window !== "undefined") window.mineworkCalendarModel = calendarModelApi;
