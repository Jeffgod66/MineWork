"use strict";

const api = window.minework;
const DEFAULT_USERNAME = "";
const persistedStore = window.mineworkUiModel?.cloneMutableSnapshot(api?.storage?.snapshot) || {};
const store = {
  get(key, fallback) {
    return Object.prototype.hasOwnProperty.call(persistedStore, key) ? persistedStore[key] : fallback;
  },
  set(key, value) {
    persistedStore[key] = value;
    api.storage.set(key, value);
  }
};
const weatherModel = window.mineworkWeatherModel;
const migratedWeather = weatherModel.migrateWeatherStorage(persistedStore, (key, value) => store.set(key, value));

const state = {
  page: "home",
  quoteIndex: store.get("quote-index", null),
  shortcuts: store.get("shortcuts", []),
  countdowns: store.get("countdowns", []),
  alarms: store.get("alarms", []),
  tasks: store.get("tasks", []),
  favorites: store.get("favorites", []),
  notes: store.get("notes", []),
  books: store.get("books", []),
  hydration: store.get("hydration", {}),
  reflections: store.get("reflections", {}),
  calendarEvents: store.get("calendar-events", []),
  anniversaries: store.get("anniversaries", []),
  calendarData: { china: null, international: { version: "", items: [] } },
  calendarFilters: store.get("calendar-filters", { events: true, tasks: true, officialHolidays: true, traditionalFestivals: true, internationalDates: true, anniversaries: true }),
  city: store.get("weather-city", ""),
  weatherLocation: store.get("weather-location", null),
  weatherSettings: migratedWeather.settings,
  selectedWeatherLocationId: migratedWeather.settings.primaryLocationId || migratedWeather.settings.order[0] || null,
  weatherResults: {},
  weather: null,
  news: [],
  newsCategories: {},
  activeNewsCategory: "general",
  newsReadIds: store.get("newsReadIds", []),
  newsQuery: store.get("newsQuery", ""),
  username: "",
  stayResident: false,
  calendarCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDate: "",
  media: null,
  webProviders: {
    ai: store.get("ai-provider", "chatgpt") === "gemini" ? "claude" : store.get("ai-provider", "chatgpt"),
    mail: store.get("mail-provider", "gmail")
  }
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const PAGE_TONES = Object.freeze({
  tasks: "mint", hydration: "mint", performance: "mint",
  notes: "lavender", library: "lavender", ai: "lavender",
  calendar: "peach", countdown: "peach", reflection: "peach",
  news: "lemon", favorites: "lemon", shortcuts: "lemon"
});
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let toastTimer = null;
let translationTimer = null;
let translationRequestId = 0;
let islandWidthTimer = null;
let islandShortcutAvailable = true;
let shortcutIconHydration = false;
let providerWarmTimer = null;
const weatherLoadingIds = new Set();
let pendingNoteImages = [];
let regionData = { provinces: [], cities: [], areas: [] };
let pageSwitchTimer = null;
let pageSwitchToken = 0;
const notificationState = { snapshot: { records: [], unreadCount: 0, totalCount: 0 }, filter: "all", limit: 100, settings: null };
const mailStatusState = new Map();
const schedulerController = window.MineWorkSchedulerController?.createSchedulerController({
  scheduler: api.scheduler,
  saveAlarms: (alarms) => store.set("alarms", alarms),
  applyCountdowns: (countdowns) => { state.countdowns = countdowns; store.set("countdowns", countdowns); renderCountdowns(); syncWorkspace(); }
});
const hydrationController = window.MineWorkHydrationController?.createHydrationController({
  model: window.mineworkHydrationModel,
  load: () => state.hydration,
  save: (hydration) => { state.hydration = hydration; store.set("hydration", hydration); },
  syncWorkspace: () => syncWorkspace(),
  reloadScheduler: () => api.scheduler.syncHydration(state.hydration),
  now: () => new Date(),
  onRender: (hydration, event) => { state.hydration = hydration; renderHydrationState(event); renderReflection(); }
});
const newsController = window.MineWorkNewsController.createNewsController({
  openExternal: (url) => api.system.openExternal(url),
  initialCategory: state.activeNewsCategory,
  readIds: state.newsReadIds,
  query: state.newsQuery
});

function syncNewsState() {
  const snapshot = newsController.snapshot();
  state.newsCategories = snapshot.categories;
  state.activeNewsCategory = snapshot.activeNewsCategory;
  state.newsReadIds = snapshot.newsReadIds;
  state.newsQuery = snapshot.newsQuery;
  state.news = snapshot.categories[snapshot.activeNewsCategory].items;
}

const COUNTRY_OPTIONS = [
  ["CN", "中国"], ["HK", "中国香港"], ["MO", "中国澳门"], ["TW", "中国台湾"],
  ["JP", "日本"], ["KR", "韩国"], ["SG", "新加坡"], ["MY", "马来西亚"], ["TH", "泰国"],
  ["US", "美国"], ["CA", "加拿大"], ["GB", "英国"], ["FR", "法国"], ["DE", "德国"],
  ["IT", "意大利"], ["ES", "西班牙"], ["AU", "澳大利亚"], ["NZ", "新西兰"],
  ["RU", "俄罗斯"], ["IN", "印度"], ["AE", "阿联酋"], ["OTHER", "其他国家 / 地区"]
];

const DAILY_QUOTES = [
  "慢慢来，你正在成为更好的自己。",
  "今天不必完美，只要比昨天多走一步。",
  "你已经走了很远，别忘了为自己鼓掌。",
  "允许自己休息，也是一种认真生活。",
  "哪怕步子很小，也是在向光靠近。",
  "没有白走的路，每一步都算数。",
  "此刻的坚持，会在未来温柔地回应你。",
  "先照顾好自己，再去拥抱想要的生活。",
  "你不需要一直坚强，柔软也很有力量。",
  "把今天过好，明天自然会有答案。",
  "焦虑不会改变结果，行动会。",
  "真正的成长，常常发生在安静的日子里。",
  "别急着否定自己，你只是还在路上。",
  "世界偶尔薄凉，你要记得温暖自己。",
  "只要没有停下，就不算来不及。",
  "你认真生活的样子，本身就很闪亮。",
  "难过会过去，新的风景正在来的路上。",
  "不和别人比较，专心完成自己的花期。",
  "疲惫时就慢一点，不要因此责怪自己。",
  "每一次重新开始，都值得被认真对待。",
  "你可以平凡，但不要放弃成为更好的可能。",
  "生活不是赶路，是感受路。",
  "把复杂的事做简单，把简单的事认真做。",
  "今天的你，已经值得被好好爱着。",
  "保持热爱，时间会给努力一个温柔的答案。",
  "别怕走得慢，方向正确就好。",
  "困住你的不是此刻，而是你以为没有出口。",
  "愿你有重新出发的勇气，也有停下来拥抱自己的温柔。",
  "所有看似不起眼的积累，都会在某天连成星河。",
  "请相信，生活正在悄悄奖励认真前行的你。",
  "把注意力收回来，先完成眼前这一小步。",
  "清楚地开始，比仓促地完成更重要。",
  "为真正重要的事，留一段不被打扰的时间。",
  "今天解决一个问题，就已经值得庆祝。",
  "不必把每一天塞满，留白也是进度。",
  "先做能推动事情向前的那个动作。",
  "稳定不是缓慢，是知道自己为什么出发。",
  "把目标写下来，混乱就会少一点。",
  "一次只做一件事，专注会替你节省力气。",
  "好的节奏，来自认真工作也认真休息。",
  "愿你结束今天时，心里比早晨更笃定。",
  "先完成，再打磨；先行动，再校准。",
  "给困难一个名字，它就不再那么庞大。",
  "小小的确定性，会慢慢照亮下一段路。",
  "真正重要的进步，往往安静得没有掌声。",
  "把能控制的做好，把不能控制的放下。",
  "今天留下的每一份记录，都会帮助未来的你。",
  "勇气不是没有犹豫，而是犹豫之后仍然前行。",
  "先让呼吸慢下来，再让思路清晰起来。",
  "你可以调整计划，但不必怀疑自己的方向。",
  "完成一件小事，是打破停滞最好的方法。",
  "留心那些微小的改善，它们正在形成复利。",
  "对自己诚实，是所有改变真正开始的地方。",
  "把今天最重要的事，放在精力最好的时段。",
  "允许答案晚一点到来，先把问题想清楚。",
  "专注不是用力过猛，而是减少无关的声音。",
  "你所需要的下一步，通常比想象中更简单。",
  "在自己的节奏里前进，也是一种坚定。",
  "收好今天的经验，明天就会多一份从容。",
  "愿每一次专注，都让你更靠近想要的生活。"
];

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 2400);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function uiIcon(name, className = "") {
  return window.MineWorkUI?.icon(name, className) || "";
}

function visualEmpty(icon, title, description, className = "empty-paper") {
  return `<div class="${className} visual-empty"><span>${uiIcon(icon)}</span><b>${title}</b><small>${description}</small></div>`;
}

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function quoteForToday() {
  const seed = [...dateKey()].reduce((sum, character) => ((sum * 31) + character.charCodeAt(0)) >>> 0, 17);
  const index = seed % DAILY_QUOTES.length;
  return { text: DAILY_QUOTES[index], index };
}

function currentQuote() {
  const index = state.quoteIndex ?? quoteForToday().index;
  return { text: DAILY_QUOTES[index], index };
}

function setQuote(index) {
  state.quoteIndex = ((index % DAILY_QUOTES.length) + DAILY_QUOTES.length) % DAILY_QUOTES.length;
  store.set("quote-index", state.quoteIndex);
  renderDailyQuote();
  syncWorkspace();
}

function setPage(page) {
  const targetPage = $(`#page-${page}`);
  if (!targetPage) return;
  const activePage = $(".page.active");
  const tone = PAGE_TONES[page] || "glacier";
  state.page = page;
  document.body.dataset.pageTone = tone;
  $$(".nav-item").forEach((element) => element.classList.toggle("active", element.dataset.page === page));
  if (activePage === targetPage) return;

  const token = ++pageSwitchToken;
  const plan = window.mineworkUiModel?.pageTransitionPlan(reducedMotionQuery.matches) || { exit: 0, enter: 1, stagger: 0 };
  clearTimeout(pageSwitchTimer);
  $$(".page").forEach((element) => element.classList.remove("active", "is-leaving", "is-entering"));
  targetPage.classList.add("active", "is-entering");
  targetPage.style.setProperty("--page-enter-duration", `${plan.enter}ms`);
  targetPage.style.setProperty("--page-stagger", `${plan.stagger}ms`);
  pageSwitchTimer = setTimeout(() => {
    if (token === pageSwitchToken) targetPage.classList.remove("is-entering");
  }, plan.enter + (plan.stagger * 4));
  if (page === "ai") activateWebProvider("ai", state.webProviders.ai);
  if (page === "mail") activateWebProvider("mail", state.webProviders.mail);
  if (page === "news" && state.newsCategories[state.activeNewsCategory]?.status === "idle") fetchNews();
  if (page === "notifications") refreshNotifications();
}

function notificationFilter() {
  if (notificationState.filter === "unread") return { status: "unread" };
  if (["mail", "schedule", "performance", "health"].includes(notificationState.filter)) return { category: notificationState.filter };
  return {};
}

function relativeNotificationTime(value) {
  const delta = Date.now() - Date.parse(value);
  if (!Number.isFinite(delta) || delta < 0) return "刚刚";
  if (delta < 60000) return "刚刚";
  if (delta < 3600000) return `${Math.floor(delta / 60000)} 分钟前`;
  if (delta < 86400000) return `${Math.floor(delta / 3600000)} 小时前`;
  return `${Math.floor(delta / 86400000)} 天前`;
}

function notificationIcon(source) {
  return { mail: "envelope", performance: "gauge", hydration: "drop", calendar: "calendar", countdown: "timer", alarm: "clock", anniversary: "calendar", holiday: "calendar" }[source] || "bell";
}

function renderNotifications(snapshot = notificationState.snapshot) {
  notificationState.snapshot = snapshot || { records: [], unreadCount: 0, totalCount: 0 };
  $("#notificationUnreadCount").textContent = String(notificationState.snapshot.unreadCount || 0);
  const records = (notificationState.snapshot.records || []).slice(0, notificationState.limit);
  $("#notificationList").innerHTML = records.length ? records.map((record) => `
    <article class="notification-card" data-status="${escapeHtml(record.status)}">
      <span class="notification-source-icon"><svg><use href="./icon-sprite.svg#${notificationIcon(record.source)}"/></svg></span>
      <div><h3>${escapeHtml(record.title)}</h3><p>${escapeHtml(record.body)}</p><div class="notification-meta"><span class="notification-severity">${escapeHtml(record.severity)}</span><time title="${escapeHtml(new Date(record.createdAt).toLocaleString())}" datetime="${escapeHtml(record.createdAt)}">${relativeNotificationTime(record.createdAt)}</time></div></div>
      <div class="notification-actions">${record.status === "unread" ? `<button data-notification-action="read" data-notification-id="${escapeHtml(record.id)}">已读</button>` : ""}<button data-notification-action="open" data-notification-id="${escapeHtml(record.id)}">打开</button><button data-notification-action="dismiss" data-notification-id="${escapeHtml(record.id)}">忽略</button></div>
    </article>`).join("") : '<div class="notification-empty">当前筛选下没有通知。</div>';
  $("#notificationLoadMore").classList.toggle("hidden", (notificationState.snapshot.records || []).length <= notificationState.limit);
}

async function refreshNotifications() {
  if (!api.notifications) return;
  const list = $("#notificationList");
  list.innerHTML = '<div class="notification-empty" role="status">正在加载通知…</div>';
  try { renderNotifications(await api.notifications.list(notificationFilter())); }
  catch (error) { list.innerHTML = `<div class="notification-empty is-error" role="alert">${escapeHtml(error.message || "通知暂时不可用，请重试。")}</div>`; }
}

function writeNotificationForm(settings) {
  notificationState.settings = settings;
  const form = $("#notificationSettingsForm");
  form.elements.masterEnabled.checked = settings.masterEnabled !== false;
  form.elements.mailPrivacy.checked = settings.mailPrivacy === true;
  Object.entries(settings.channels).forEach(([key, value]) => { form.elements[`channels.${key}`].checked = value; });
  Object.entries(settings.quietHours).forEach(([key, value]) => { const field = form.elements[`quietHours.${key}`]; if (field) field.type === "checkbox" ? field.checked = value : field.value = value; });
  Object.entries(settings.sources).forEach(([key, value]) => { form.elements[`sources.${key}`].checked = value; });
  const rules = { cpuThreshold: 90, memoryThreshold: 85, diskFreePercentThreshold: 10, diskFreeBytesThreshold: 20 * 1024 ** 3, sustainMs: 120000, cooldownMs: 30 * 60000, ...(settings.performanceRules || {}) };
  form.elements["performanceRules.cpuThreshold"].value = rules.cpuThreshold;
  form.elements["performanceRules.memoryThreshold"].value = rules.memoryThreshold;
  form.elements["performanceRules.diskFreePercentThreshold"].value = rules.diskFreePercentThreshold;
  form.elements["performanceRules.diskFreeBytesThresholdGb"].value = Math.round(rules.diskFreeBytesThreshold / 1024 ** 3);
  form.elements["performanceRules.sustainSeconds"].value = Math.round(rules.sustainMs / 1000);
  form.elements["performanceRules.cooldownMinutes"].value = Math.round(rules.cooldownMs / 60000);
  const holiday = { enabled: false, time: "09:00", daysBefore: 0, categories: { chinaOfficial: true, chinaTraditional: true, international: true }, ...(settings.holidayReminder || {}) };
  form.elements["holidayReminder.enabled"].checked = holiday.enabled === true;
  form.elements["holidayReminder.time"].value = holiday.time;
  form.elements["holidayReminder.daysBefore"].value = String(holiday.daysBefore);
  form.elements["holidayReminder.chinaOfficial"].checked = holiday.categories?.chinaOfficial !== false;
  form.elements["holidayReminder.chinaTraditional"].checked = holiday.categories?.chinaTraditional !== false;
  form.elements["holidayReminder.international"].checked = holiday.categories?.international !== false;
}

function notificationSettingsPatch() {
  const form = $("#notificationSettingsForm");
  const channels = {}, sources = {};
  ["windows", "island", "sound"].forEach((key) => { channels[key] = form.elements[`channels.${key}`].checked; });
  ["mail", "performance", "countdown", "alarm", "calendar", "anniversary", "holiday", "hydration"].forEach((key) => { sources[key] = form.elements[`sources.${key}`].checked; });
  return { masterEnabled: form.elements.masterEnabled.checked, mailPrivacy: form.elements.mailPrivacy.checked, channels, sources, quietHours: { enabled: form.elements["quietHours.enabled"].checked, start: form.elements["quietHours.start"].value, end: form.elements["quietHours.end"].value }, performanceRules: { cpuThreshold: Number(form.elements["performanceRules.cpuThreshold"].value), memoryThreshold: Number(form.elements["performanceRules.memoryThreshold"].value), diskFreePercentThreshold: Number(form.elements["performanceRules.diskFreePercentThreshold"].value), diskFreeBytesThreshold: Number(form.elements["performanceRules.diskFreeBytesThresholdGb"].value) * 1024 ** 3, sustainMs: Number(form.elements["performanceRules.sustainSeconds"].value) * 1000, cooldownMs: Number(form.elements["performanceRules.cooldownMinutes"].value) * 60000 }, holidayReminder: { enabled: form.elements["holidayReminder.enabled"].checked, time: form.elements["holidayReminder.time"].value, daysBefore: Number(form.elements["holidayReminder.daysBefore"].value), categories: { chinaOfficial: form.elements["holidayReminder.chinaOfficial"].checked, chinaTraditional: form.elements["holidayReminder.chinaTraditional"].checked, international: form.elements["holidayReminder.international"].checked } } };
}

async function initializeNotifications() {
  if (!api.notifications) return;
  try {
    writeNotificationForm(await api.notifications.getSettings());
    await refreshNotifications();
    api.notifications.onChanged((snapshot) => {
      if (notificationState.filter === "all") renderNotifications(snapshot);
      else refreshNotifications();
    });
  } catch (error) { toast(error.message || "通知初始化失败"); }
}

function updateClock() {
  const now = new Date();
  const hour = now.getHours();
  const phase = hour < 6 ? ["凌晨好", "NIGHT"] : hour < 12 ? ["早上好", "MORNING"] : hour < 18 ? ["下午好", "AFTERNOON"] : ["晚上好", "EVENING"];
  $("#greeting").textContent = phase[0];
  $("#dayPhase").textContent = phase[1];
  const clockEl = $("#clock");
  const timeText = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (clockEl && clockEl.textContent !== timeText) {
    clockEl.textContent = timeText;
    clockEl.classList.remove("flip");
    void clockEl.offsetWidth;
    clockEl.classList.add("flip");
  } else if (clockEl) {
    clockEl.textContent = timeText;
  }
  const secEl = $("#clockSeconds");
  const secText = String(now.getSeconds()).padStart(2, "0");
  if (secEl && secEl.textContent !== secText) secEl.textContent = secText;
  $("#date").textContent = now.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  if ($("#previewTime")) $("#previewTime").textContent = $("#clock").textContent;
}

function formatBytes(bytes, decimals = 1) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 GB";
  return `${(bytes / 1024 / 1024 / 1024).toFixed(decimals)} GB`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remain = Math.floor(seconds % 60);
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days ? `${days} 天 ${hours} 小时` : `${hours} 小时 ${minutes} 分`;
}

function shortcutIcon(item, className = "") {
  if (item.icon) return `<img class="${className}" src="${item.icon}" alt="" />`;
  const kind = window.mineworkUiModel?.shortcutKind(item) || "document";
  const glyph = kind === "folder" ? "folder-open" : kind === "app" ? "app-window" : kind === "url" ? "globe" : "file-text";
  return `<div class="${className} fallback-icon" data-icon-ready="true">${uiIcon(glyph)}</div>`;
}

function renderShortcuts() {
  const grid = $("#shortcutGrid");
  if (!state.shortcuts.length) {
    grid.innerHTML = visualEmpty("rocket-launch", "还没有快捷项目", "添加常用程序、文档或文件夹。", "empty-state");
  } else {
    grid.innerHTML = state.shortcuts.map((item, index) => `
      <article class="shortcut-card" data-open-shortcut="${index}" title="${escapeHtml(item.path)}">
        ${shortcutIcon(item)}
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.path)}</p>
        <button class="card-menu" data-remove-shortcut="${index}" aria-label="移除">${uiIcon("dots-three")}</button>
      </article>
    `).join("");
  }

  const home = $("#homeShortcuts");
  const items = state.shortcuts.slice(0, 4);
  home.innerHTML = items.length ? items.map((item, index) => `
    <div class="mini-shortcut" data-open-shortcut="${index}" title="${escapeHtml(item.path)}">
      ${item.icon ? `<img src="${item.icon}" alt="" />` : shortcutIcon(item, "mini-icon")}
      <span>${escapeHtml(item.name)}</span>
    </div>
  `).join("") : `<p class="empty-mini">添加常用项目后，会显示在这里。</p>`;
  $("#homeShortcutCount").textContent = state.shortcuts.length;
  $("#homeShortcutBar").style.width = `${Math.min(100, state.shortcuts.length * 16)}%`;
}

async function hydrateShortcutIcons() {
  if (shortcutIconHydration) return;
  const missing = state.shortcuts.filter((item) => !item.icon).map((item) => item.path);
  if (!missing.length) return;
  shortcutIconHydration = true;
  try {
    const hydrated = await api.shortcuts.hydrateIcons(missing);
    const iconByPath = new Map((hydrated || []).map((item) => [item.path, item.icon]));
    let changed = false;
    state.shortcuts.forEach((item) => {
      const icon = iconByPath.get(item.path);
      if (!item.icon && icon) {
        item.icon = icon;
        changed = true;
      }
    });
    if (changed) {
      store.set("shortcuts", state.shortcuts);
      renderShortcuts();
    }
  } finally {
    shortcutIconHydration = false;
  }
}

async function openShortcut(index) {
  const item = state.shortcuts[index];
  if (!item) return;
  const result = await api.shortcuts.open(item.path);
  if (!result.ok) toast(result.error || "无法打开该项目");
}

function countdownParts(target) {
  const distance = Math.max(0, new Date(target).getTime() - Date.now());
  return {
    expired: distance <= 0,
    days: Math.floor(distance / 86400000),
    hours: Math.floor((distance % 86400000) / 3600000),
    minutes: Math.floor((distance % 3600000) / 60000),
    seconds: Math.floor((distance % 60000) / 1000)
  };
}

function unitMarkup(parts, home = false) {
  const values = [
    ["days", "天"], ["hours", "时"], ["minutes", "分"], ["seconds", "秒"]
  ];
  return `<div class="${home ? "home-time-units" : "countdown-units"}">${values.map(([key, label]) => `
    <div><b>${String(parts[key]).padStart(2, "0")}</b><small>${label}</small></div>
  `).join("")}</div>`;
}

function renderCountdowns() {
  const sorted = [...state.countdowns].sort((a, b) => (a.status === "completed") - (b.status === "completed") || new Date(a.date) - new Date(b.date));
  const grid = $("#countdownGrid");
  if (!sorted.length) {
    grid.innerHTML = visualEmpty("timer", "还没有倒计时", "为下一个重要时刻创建提醒。", "empty-state");
    $("#homeCountdown").innerHTML = `<p class="empty-mini">创建倒计时后，会显示最近事件。</p>`;
    return;
  }
  grid.innerHTML = sorted.map((item) => {
    const parts = countdownParts(item.date);
    const originalIndex = state.countdowns.findIndex((value) => value.id === item.id);
    const status = item.status === "completed" ? "completed" : "active";
    return `<article class="countdown-card ${status}" style="--glow:${item.color || "#647cff"}">
      <button class="remove-countdown" data-remove-countdown="${originalIndex}" aria-label="删除">${uiIcon("trash")}</button>
      <span class="target-date">${new Date(item.date).toLocaleString("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
      <h3>${escapeHtml(item.name)} <small>${status === "completed" ? "Completed" : "Active"}</small></h3>
      ${unitMarkup(parts)}
    </article>`;
  }).join("");
  const nearest = sorted.find((item) => item.status !== "completed" && !countdownParts(item.date).expired) || sorted[0];
  const parts = countdownParts(nearest.date);
  $("#homeCountdown").innerHTML = `<div class="home-countdown-main"><h3>${escapeHtml(nearest.name)}</h3>${unitMarkup(parts, true)}</div>`;
}

function syncCountdowns() {
  schedulerController?.syncCountdowns(state.countdowns);
}

function renderAlarms() {
  const grid = $("#alarmGrid");
  if (!grid) return;
  grid.innerHTML = state.alarms.length ? state.alarms.map((alarm) => `<article class="alarm-card ${escapeHtml(alarm.status)}">
    <div><strong>${escapeHtml(alarm.time)}</strong><h3>${escapeHtml(alarm.title)}</h3><p>${escapeHtml(alarm.recurrence)}</p></div>
    <div><button data-toggle-alarm="${escapeHtml(alarm.id)}">${alarm.status === "active" ? "Disable" : "Enable"}</button><button data-delete-alarm="${escapeHtml(alarm.id)}">Delete</button></div>
  </article>`).join("") : '<p class="empty-mini">No alarms yet.</p>';
}

function syncAlarms() {
  schedulerController?.syncAlarms(state.alarms);
  renderAlarms();
}

function addCountdown(name, target) {
  const date = target instanceof Date ? target : new Date(target);
  if (!name || Number.isNaN(date.getTime())) return;
  const colors = ["#5f82ff", "#8a62ef", "#43cfc4", "#f09a60"];
  state.countdowns.push({
    id: `${Date.now()}-${Math.random()}`,
    name,
    date: date.toISOString(),
    status: "active",
    createdAt: new Date().toISOString(),
    color: colors[state.countdowns.length % colors.length]
  });
  store.set("countdowns", state.countdowns);
  renderCountdowns();
  syncCountdowns();
  syncWorkspace();
}

async function updatePerformance(snapshot) {
  try {
    const data = snapshot || await api.system.performance();
    const view = window.mineworkUiModel?.performanceViewModel(data, new Date());
    if (!view) throw new Error("性能显示模型不可用");
    const applyProgress = (barId, value) => {
      const bar = $(`#${barId}`);
      if (bar && value !== null) bar.style.width = `${value}%`;
    };
    $("#cpuUsage").textContent = view.cpu.usageText;
    $("#cpuOrbit").style.setProperty("--usage", view.cpu.usage ?? 0);
    applyProgress("cpuBar", view.cpu.usage);
    $("#cpuModel").textContent = view.cpu.modelText;
    $("#cpuSpeed").textContent = view.cpu.speedText;
    $("#cpuTopology").textContent = view.cpu.topologyText;
    $("#cpuCores").textContent = view.cpu.topologyText;
    $("#memoryUsage").textContent = view.memory.usageText;
    applyProgress("memoryBar", view.memory.usage);
    $("#memoryInfo").textContent = view.memory.usedText;
    $("#memoryAvailable").textContent = view.memory.availableText;
    $("#diskUsage").textContent = view.disk.usageText;
    applyProgress("diskBar", view.disk.usage);
    $("#diskInfo").textContent = view.disk.usedText;
    $("#diskRoot").textContent = view.disk.rootText;
    $("#diskFree").textContent = view.disk.freeText;
    $("#gpuName").textContent = view.gpu.nameText;
    $("#gpuMemory").textContent = view.gpu.memoryText;
    $("#systemUptime").textContent = view.system.uptimeText;
    $("#systemOs").textContent = view.system.osText;
    $("#systemArch").textContent = view.system.archText;
    $("#systemHost").textContent = view.system.hostText;
    $("#systemBoot").textContent = view.system.bootText;
    $("#performanceUpdated").textContent = view.updatedLabel;
    $("#performanceStatus").innerHTML = `<i></i>实时采样`;
    [["homeCpu", "homeCpuRing", view.cpu.usage], ["homeMem", "homeMemRing", view.memory.usage], ["homeDisk", "homeDiskRing", view.disk.usage]].forEach(([textId, ringId, value]) => {
      if (value === null) return;
      $(`#${textId}`).textContent = `${value}%`;
      $(`#${ringId}`).style.setProperty("--value", value);
    });
  } catch {
    $("#performanceStatus").innerHTML = `<i></i>等待更新`;
    if ($("#cpuUsage").textContent === "--") $("#cpuModel").textContent = "性能数据暂时不可用";
  }
}

function initializePerformance() {
  api.system.performance().then((data) => updatePerformance(data)).catch(() => updatePerformance());
  api.system.onPerformanceChanged?.((data) => updatePerformance(data));
}

function mediaImage(info) {
  if (!info?.thumbnail) return "";
  if (typeof info.thumbnail === "string") {
    if (info.thumbnail.startsWith("data:") || info.thumbnail.startsWith("http") || info.thumbnail.startsWith("blob:")) return info.thumbnail;
    return `data:image/jpeg;base64,${info.thumbnail}`;
  }
  if (info.thumbnail?.data) return `data:${info.thumbnail.contentType || "image/jpeg"};base64,${info.thumbnail.data}`;
  return "";
}

function mediaTimeline(info) {
  const timeline = info?.timeline || {};
  const position = Number(timeline.position ?? timeline.positionSeconds ?? 0);
  const end = Number(timeline.endTime ?? timeline.duration ?? timeline.endTimeSeconds ?? 0);
  return { position, end, percent: end > 0 ? Math.min(100, Math.max(0, position / end * 100)) : 0 };
}

function renderMedia(info) {
  state.media = info;
  const available = Boolean(info?.isAvailable);
  const playing = info?.playbackStatus === "playing";
  const isMineRadio = /mine\s*radio/i.test(String(info?.sourceAppUserModelId || ""));
  const title = available ? info.title || "未知曲目" : "等待音乐播放";
  const artist = available ? info.artist || info.albumArtist || "未知艺术家" : "打开任意支持系统媒体控制的播放器";
  const image = mediaImage(info);
  const albumMarkup = image ? `<img src="${image}" alt="" />` : `<span>${uiIcon("music-notes")}</span>`;
  $("#trackTitle").textContent = title;
  $("#trackArtist").textContent = artist;
  $("#homeTrack").textContent = title;
  $("#homeArtist").textContent = available ? artist : "Windows 媒体会话";
  $("#albumArtwork").innerHTML = albumMarkup;
  $("#homeAlbum").innerHTML = albumMarkup;
  $$("[data-media='play-toggle']").forEach((button) => {
    button.innerHTML = uiIcon(playing ? "pause" : "play");
    button.setAttribute("aria-label", playing ? "暂停" : "播放");
  });
  $("#mediaSource").textContent = isMineRadio ? "MINERADIO" : (info?.sourceAppUserModelId || "WINDOWS MEDIA").toUpperCase();
  $("#mediaMessage").textContent = available
    ? `${playing ? "正在播放" : "已暂停"} · ${isMineRadio ? "MineRadio 精准适配已连接" : "系统媒体会话已连接"}`
    : (info?.error || "未检测到正在播放的媒体");
  const timeline = mediaTimeline(info);
  $("#positionText").textContent = formatDuration(timeline.position);
  $("#durationText").textContent = formatDuration(timeline.end);
  $("#timelineProgress").style.width = `${timeline.percent}%`;
}

async function updateMedia() {
  try {
    renderMedia(await api.media.status());
  } catch (error) {
    renderMedia({ isAvailable: false, error: error?.message });
  }
}

async function controlMedia(action) {
  let target = action;
  if (action === "play-toggle") target = state.media?.playbackStatus === "playing" ? "pause" : "play";
  const result = await api.media.control(target);
  if (!result?.success) toast(result?.error || "媒体控制失败");
  setTimeout(updateMedia, 250);
}

const providerConfig = {
  ai: {
    chatgpt: { url: "https://chatgpt.com/", host: "chatgpt.com" },
    claude: { url: "https://claude.ai/new", host: "claude.ai" },
    deepseek: { url: "https://chat.deepseek.com/", host: "chat.deepseek.com" }
  },
  mail: {
    gmail: { url: "https://mail.google.com/", host: "mail.google.com", secureChrome: true },
    outlook: { url: "https://outlook.office.com/mail/", host: "outlook.office.com" },
    netease: { url: "https://mail.163.com/", host: "mail.163.com" },
    qqmail: { url: "https://mail.qq.com/", host: "mail.qq.com" }
  }
};

function primeWebProvider(group, provider) {
  const config = providerConfig[group]?.[provider];
  const webview = $(`#${group}Webviews webview[data-provider="${provider}"]`);
  if (config && webview && !webview.getAttribute("src")) webview.setAttribute("src", webview.dataset.src || config.url);
}

function updateSecureLoginButton(group, config) {
  const button = $(`#secure${group === "ai" ? "Ai" : "Mail"}Login`);
  button?.classList.toggle("hidden", !config?.secureChrome);
}

function scheduleTranslation(delay = 520) {
  clearTimeout(translationTimer);
  const text = $("#sourceText").value.trim();
  $("#charCount").textContent = $("#sourceText").value.length;
  if (!text) {
    translationRequestId += 1;
    $("#translatedText").value = "";
    $("#translateStatus").textContent = "输入内容后自动翻译";
    return;
  }
  $("#translateStatus").textContent = "等待输入完成…";
  translationTimer = setTimeout(runAutoTranslation, delay);
}

async function runAutoTranslation() {
  const text = $("#sourceText").value.trim();
  if (!text) return;
  const requestId = ++translationRequestId;
  $("#translateStatus").textContent = "正在自动翻译…";
  const result = await api.translate({
    text,
    source: $("#sourceLanguage").value,
    target: $("#targetLanguage").value
  });
  if (requestId !== translationRequestId) return;
  if (result.ok) {
    $("#translatedText").value = result.translated;
    $("#translateStatus").textContent = result.detected ? `自动翻译完成 · 检测语言 ${result.detected}` : "自动翻译完成";
  } else {
    $("#translateStatus").textContent = result.error;
  }
}

function applyIslandSettings(settings) {
  const width = Math.max(420, Math.min(760, Number(settings?.width) || 560));
  $("#islandWidth").value = width;
  $("#islandWidthValue").textContent = width;
  $("#islandPreview").style.width = `${width}px`;
  $("#islandVisible").checked = settings?.visible !== false;
  $("#islandLocked").checked = settings?.locked === true;
}

async function initializeIsland() {
  try {
    applyIslandSettings(await api.island.getSettings());
    api.island.onSettingsChanged(applyIslandSettings);
    api.island.onShortcutStatus((available) => {
      islandShortcutAvailable = available;
      const help = document.getElementById("islandLockHelp");
      if (help) help.textContent = available
        ? "锁定后可直接点击灵动岛后方内容；按 Ctrl+Alt+I 可随时解除锁定。"
        : "Ctrl+Alt+I 已被其他应用占用；请从 MineWork 托盘菜单解除锁定。";
    });
  } catch {
    applyIslandSettings({ width: 560, visible: true });
  }
}

function activateWebProvider(group, provider) {
  const config = providerConfig[group][provider];
  if (!config) return;
  state.webProviders[group] = provider;
  store.set(`${group}-provider`, provider);
  const container = $(`#${group}Webviews`);
  $$("webview", container).forEach((webview) => webview.classList.toggle("active", webview.dataset.provider === provider));
  primeWebProvider(group, provider);
  $$(`[data-web-tabs="${group}"] [data-provider]`).forEach((button) => button.classList.toggle("active", button.dataset.provider === provider));
  $(`#${group}Address`).textContent = config.host;
  updateSecureLoginButton(group, config);
}

function createWebviews() {
  $$(".webview-slot").forEach((slot) => {
    const webview = document.createElement("webview");
    if (slot.dataset.active === "true") webview.classList.add("active");
    webview.dataset.provider = slot.dataset.provider;
    webview.dataset.src = slot.dataset.src;
    webview.setAttribute("partition", slot.dataset.partition);
    webview.setAttribute("webpreferences", "javascript=yes, contextIsolation=yes, nodeIntegration=no, sandbox=yes, backgroundThrottling=no");
    if (slot.closest("#mailWebviews")) {
      webview.setAttribute("preload", api.system.mailWebviewPreload);
      webview.setAttribute("additionalarguments", `--minework-mail-provider=${slot.dataset.provider}`);
    }
    webview.setAttribute("allowpopups", "");
    slot.replaceWith(webview);
  });
}

function renderMailStatus(snapshot) {
  if (!snapshot || !providerConfig.mail[snapshot.provider]) return;
  mailStatusState.set(snapshot.provider, snapshot);
  const element = document.getElementById(`mailStatus-${snapshot.provider}`);
  if (!element) return;
  const observed = new Date(snapshot.observedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  element.textContent = snapshot.status === "ready" ? `${snapshot.unreadCount} unread · Ready · ${observed}` : `Unavailable · ${observed}`;
  element.dataset.status = snapshot.status;
}

function configureWebviews() {
  const mailViews = new Map($$("#mailWebviews webview").map((webview) => [webview, webview.dataset.provider]));
  const mailHostBridge = window.MineWorkMailIntegration.createMailWebviewHostBridge({ slots: mailViews, forward: (value) => api.mail.signal(value) });
  $$("webview").forEach((webview) => {
    const container = webview.parentElement;
    const repaint = () => {
      if (!webview.classList.contains("active")) return;
      webview.style.visibility = "hidden";
      requestAnimationFrame(() => {
        webview.style.visibility = "visible";
      });
    };
    webview.addEventListener("dom-ready", () => {
      container.classList.add("loaded");
      webview.setZoomFactor(0.9);
      repaint();
    });
    webview.addEventListener("did-start-loading", () => container.classList.remove("loaded"));
    webview.addEventListener("did-stop-loading", () => {
      container.classList.add("loaded");
      repaint();
      api.webSessions?.flush().catch(() => {});
    });
    webview.addEventListener("did-fail-load", (event) => {
      if (event.errorCode !== -3) toast(`网页连接失败：${event.errorDescription}`);
    });
    if (mailViews.has(webview)) webview.addEventListener("ipc-message", (event) => mailHostBridge.handle(webview, { channel: event.channel, args: event.args }));
  });
  Object.keys(state.webProviders).forEach((group) => {
    const provider = state.webProviders[group];
    const config = providerConfig[group][provider];
    $$(`[data-web-tabs="${group}"] [data-provider]`).forEach((button) => button.classList.toggle("active", button.dataset.provider === provider));
    $$("webview", $(`#${group}Webviews`)).forEach((webview) => webview.classList.toggle("active", webview.dataset.provider === provider));
    $(`#${group}Address`).textContent = config.host;
    updateSecureLoginButton(group, config);
  });
  api.mail?.onStatusChanged(renderMailStatus);
}

function renderDailyQuote() {
  const quote = currentQuote();
  $("#dailyQuote").textContent = quote.text;
  $("#dailyTitleQuote").textContent = quote.text;
  $("#dailyQuoteIndex").textContent = `${String(quote.index + 1).padStart(2, "0")} / ${DAILY_QUOTES.length}`;
}

function renderAccount() {
  const name = state.username.trim();
  const displayName = name || "未登录";
  $("#accountName").textContent = displayName;
  $("#accountHint").textContent = name ? "MineWork · 已登录" : "MineWork · 未登录";
  $("#accountAvatar").textContent = displayName.slice(0, 1).toUpperCase();
  $("#greetingName").textContent = displayName;
  const brandOwner = $("#brandOwner");
  if (brandOwner) brandOwner.textContent = displayName.toUpperCase();
  $("#usernameInput").value = name;
  $("#stayResident").checked = state.stayResident;
  document.title = name ? `MineWork · ${name}` : "MineWork";
}

async function initializeAccount() {
  try {
    const settings = await api.settings.get();
    state.username = settings?.username || DEFAULT_USERNAME;
    state.stayResident = settings?.stayResident !== false;
  } catch {}
  renderAccount();
  syncWorkspace();
}

function fillLocationSelect(element, items, placeholder, selected = "") {
  element.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${items.map((item) => `<option value="${escapeHtml(item.code)}">${escapeHtml(item.name)}</option>`).join("")}`;
  if (selected && items.some((item) => item.code === selected)) element.value = selected;
}

function selectedLocationName(selectId) {
  const select = $(selectId);
  return select?.selectedOptions?.[0]?.dataset?.name || select?.selectedOptions?.[0]?.textContent || "";
}

function updateLocationPath() {
  const location = getLocationSelection(false);
  const path = [location.country, location.province, location.city, location.district].filter(Boolean).join(" · ");
  $("#locationPath").textContent = path || "请选择天气位置";
}

function populateDistricts(selected = "") {
  const cityCode = $("#weatherCity").value;
  const districts = regionData.areas.filter((item) => item.cityCode === cityCode);
  fillLocationSelect($("#weatherDistrict"), districts, districts.length ? "选择区 / 县（可选）" : "暂无区县数据", selected);
  updateLocationPath();
}

function populateCities(selectedCity = "", selectedDistrict = "") {
  const provinceCode = $("#weatherProvince").value;
  const cities = regionData.cities.filter((item) => item.provinceCode === provinceCode);
  fillLocationSelect($("#weatherCity"), cities, "选择城市", selectedCity);
  if (!$("#weatherCity").value && cities.length === 1) $("#weatherCity").value = cities[0].code;
  populateDistricts(selectedDistrict);
}

function setForeignLocationMode(isForeign) {
  ["Province", "City", "District"].forEach((part) => {
    $(`#weather${part}`).classList.toggle("hidden", isForeign);
    $(`#foreign${part}`).classList.toggle("hidden", !isForeign);
  });
  $("#foreignCountry").classList.toggle("hidden", $("#weatherCountry").value !== "OTHER");
}

function getLocationSelection(requireCity = true) {
  const countryCode = $("#weatherCountry")?.value || "CN";
  const foreign = countryCode !== "CN";
  const country = countryCode === "OTHER"
    ? $("#foreignCountry").value.trim()
    : COUNTRY_OPTIONS.find(([code]) => code === countryCode)?.[1] || "";
  const location = foreign ? {
    countryCode: countryCode === "OTHER" ? "" : countryCode,
    country,
    province: $("#foreignProvince").value.trim(),
    city: $("#foreignCity").value.trim(),
    district: $("#foreignDistrict").value.trim()
  } : {
    countryCode: "CN",
    country: "中国",
    provinceCode: $("#weatherProvince").value,
    province: selectedLocationName("#weatherProvince").replace(/^选择省份$/, ""),
    cityCode: $("#weatherCity").value,
    city: selectedLocationName("#weatherCity").replace(/^选择城市$/, ""),
    districtCode: $("#weatherDistrict").value,
    district: selectedLocationName("#weatherDistrict").replace(/^选择区 \/ 县（可选）$|^暂无区县数据$/, "")
  };
  if (requireCity && (!location.country || (!location.city && !location.province))) return null;
  return location;
}

async function initializeLocationFilters() {
  $("#weatherCountry").innerHTML = COUNTRY_OPTIONS.map(([code, name]) => `<option value="${code}">${name}</option>`).join("");
  try {
    const [provinces, cities, areas] = await Promise.all([
      fetch("../assets/provinces.json").then((response) => response.json()),
      fetch("../assets/cities.json").then((response) => response.json()),
      fetch("../assets/areas.json").then((response) => response.json())
    ]);
    regionData = { provinces, cities, areas };
  } catch {
    $("#locationPath").textContent = "地区数据读取失败，请重新打开 MineWork";
  }

  let saved = state.weatherLocation;
  if (!saved && state.city) {
    const province = regionData.provinces.find((item) => item.name.includes(state.city) || state.city.includes(item.name.replace(/[省市]$/, "")));
    const city = regionData.cities.find((item) => item.name.includes(state.city) || state.city.includes(item.name.replace(/市$/, "")));
    saved = { countryCode: "CN", country: "中国", provinceCode: province?.code || city?.provinceCode || "", cityCode: city?.code || "", city: state.city };
  }
  saved ||= { countryCode: "CN", country: "中国" };
  $("#weatherCountry").value = COUNTRY_OPTIONS.some(([code]) => code === saved.countryCode) ? saved.countryCode : "OTHER";
  const foreign = $("#weatherCountry").value !== "CN";
  setForeignLocationMode(foreign);
  if (foreign) {
    $("#foreignCountry").value = saved.country || "";
    $("#foreignProvince").value = saved.province || "";
    $("#foreignCity").value = saved.city || "";
    $("#foreignDistrict").value = saved.district || "";
  } else {
    fillLocationSelect($("#weatherProvince"), regionData.provinces, "选择省份", saved.provinceCode || "");
    populateCities(saved.cityCode || "", saved.districtCode || "");
  }
  updateLocationPath();
}

function weatherDescription(code) {
  if (code === 0) return "晴朗";
  if ([1, 2].includes(code)) return "晴间多云";
  if (code === 3) return "阴天";
  if ([45, 48].includes(code)) return "有雾";
  if ([51, 53, 55, 56, 57].includes(code)) return "毛毛雨";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "有雨";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "有雪";
  if ([95, 96, 99].includes(code)) return "雷雨";
  return "天气变化中";
}

function weatherGlyph(code) {
  if (code === 0) return "sun";
  if ([1, 2].includes(code)) return "cloud-sun";
  if (code === 3 || [45, 48].includes(code)) return "cloud";
  if ([71, 73, 75, 77, 85, 86, 95, 96, 99].includes(code)) return "sparkle";
  return "drop";
}

function renderWeather() {
  const container = $("#weatherContent");
  renderWeatherLocationTabs();
  const selectedId = state.selectedWeatherLocationId;
  if (selectedId && weatherLoadingIds.has(selectedId) && !state.weatherResults[selectedId]) {
    container.innerHTML = `<div class="network-empty"><i class="network-spinner"></i>正在获取实时天气…</div>`;
    return;
  }
  const data = selectedId ? state.weatherResults[selectedId] : null;
  if (!data || data.status === "error") {
    container.innerHTML = `<div class="network-empty">${escapeHtml(data?.error || (state.weatherSettings.order.length ? "等待获取所选位置天气。" : "添加一个位置后获取实时天气。"))}</div>`;
    return;
  }
  const current = data.current || {};
  const daily = data.daily || {};
  const location = [data.location?.name, data.location?.admin2, data.location?.admin, data.location?.country].filter((item, index, values) => item && values.indexOf(item) === index).join(" · ");
  const days = (daily.time || []).slice(0, 4).map((date, index) => `<div><span>${index === 0 ? "今天" : new Date(`${date}T00:00:00`).toLocaleDateString("zh-CN", { weekday: "short" })}</span><b>${uiIcon(weatherGlyph(daily.weather_code?.[index]))}</b><small>${Math.round(daily.temperature_2m_min?.[index] || 0)}° / ${Math.round(daily.temperature_2m_max?.[index] || 0)}°</small></div>`).join("");
  container.innerHTML = `${data.status === "stale" ? `<div class="weather-stale">显示上次成功数据 · ${escapeHtml(data.error || "当前无法更新")}</div>` : ""}<div class="weather-now"><span class="weather-glyph">${uiIcon(weatherGlyph(current.weather_code))}</span><div><small>${escapeHtml(location)}</small><strong>${Math.round(current.temperature_2m || 0)}°</strong><b>${weatherDescription(current.weather_code)} · 体感 ${Math.round(current.apparent_temperature || 0)}°</b></div><p>湿度 ${Math.round(current.relative_humidity_2m || 0)}%<br>风速 ${Math.round(current.wind_speed_10m || 0)} km/h<br>降水 ${Number(current.precipitation || 0).toFixed(1)} mm</p></div><div class="weather-days">${days}</div>`;
  $("#weatherUpdated").textContent = data.updatedAt ? `${data.status === "stale" ? "上次成功" : "更新于"} ${new Date(data.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : "实时数据";
}

function persistWeatherSettings() { store.set("weather-settings", state.weatherSettings); }

function renderWeatherIslandSettings() {
  $("#weatherIslandAutoRotate").checked = state.weatherSettings.islandAutoRotate === true;
  $("#weatherIslandRotateSeconds").value = Math.max(5, Math.min(60, Number(state.weatherSettings.islandRotateSeconds) || 8));
}

function weatherLocationName(location) { return location.district || location.city || location.province || location.country || "天气位置"; }

function renderWeatherLocationTabs() {
  const host = $("#weatherLocationTabs");
  host.innerHTML = state.weatherSettings.order.map((id, index) => {
    const location = state.weatherSettings.locations.find((item) => item.id === id);
    if (!location) return "";
    const status = weatherLoadingIds.has(id) ? "loading" : state.weatherResults[id]?.status || "idle";
    return `<div class="weather-location-chip ${id === state.selectedWeatherLocationId ? "selected" : ""}" role="presentation"><button role="tab" aria-selected="${id === state.selectedWeatherLocationId}" data-weather-select="${escapeHtml(id)}"><span>${escapeHtml(weatherLocationName(location))}</span><small>${id === state.weatherSettings.primaryLocationId ? "主要 · " : ""}${status}</small></button><div><button data-weather-primary="${escapeHtml(id)}" aria-label="设为主要位置">★</button><button data-weather-move="-1" data-weather-id="${escapeHtml(id)}" aria-label="向左移动" ${index === 0 ? "disabled" : ""}>←</button><button data-weather-move="1" data-weather-id="${escapeHtml(id)}" aria-label="向右移动" ${index === state.weatherSettings.order.length - 1 ? "disabled" : ""}>→</button><button data-weather-remove="${escapeHtml(id)}" aria-label="移除位置">×</button></div></div>`;
  }).join("");
}

async function fetchWeather(locations, { force = false } = {}) {
  const targets = (Array.isArray(locations) ? locations : [locations]).filter(Boolean);
  if (!targets.length) return;
  targets.forEach((target) => weatherLoadingIds.add(target.id));
  renderWeather();
  try {
    const batch = await api.network.weatherBatch(targets, { force });
    Object.assign(state.weatherResults, batch.results || {});
  } catch (error) {
    targets.forEach((target) => {
      if (!state.weatherResults[target.id]) state.weatherResults[target.id] = { id: target.id, status: "error", error: error?.message || "天气服务暂时不可用", updatedAt: new Date().toISOString() };
    });
  }
  targets.forEach((target) => weatherLoadingIds.delete(target.id));
  const primary = state.weatherSettings.primaryLocationId;
  state.weather = primary ? state.weatherResults[primary] || null : null;
  renderWeather();
  syncWorkspace();
}

function renderNews() {
  syncNewsState();
  const container = $("#newsList");
  const categoryState = state.newsCategories[state.activeNewsCategory];
  const items = newsController.projection();
  $$('[data-news-category]').forEach((tab) => {
    const selected = tab.dataset.newsCategory === state.activeNewsCategory;
    tab.setAttribute("aria-selected", String(selected));
    tab.classList.toggle("active", selected);
  });
  if (categoryState.status === "loading" && !categoryState.items.length) {
    container.innerHTML = `<div class="network-empty"><i class="network-spinner"></i>正在获取今日热点…</div>`;
    return;
  }
  if (!items.length) {
    const message = categoryState.error || (state.newsQuery ? "没有匹配当前搜索的资讯" : "暂无实时资讯");
    container.innerHTML = `<div class="network-empty news-error-state">${uiIcon("newspaper")}<b>${escapeHtml(message)}</b><small>网络恢复后可立即重新连接，不会继续使用失败缓存。</small><button class="secondary-button" data-retry-news>重新连接资讯源</button></div>`;
    $("#newsUpdated").textContent = categoryState.error ? "连接中断 · 可立即重试" : "等待资讯源";
    return;
  }
  container.innerHTML = items.map((item, index) => `<button class="news-row ${state.newsReadIds.includes(item.url) ? "is-read" : ""}" data-open-news="${index}"><span>${String(index + 1).padStart(2, "0")}</span><div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.source || "实时资讯")} · ${item.publishedAt ? new Date(item.publishedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "时间未知"}</small></div><i>${uiIcon("arrow-square-out")}</i></button>`).join("");
  const providerText = categoryState.providers.length ? categoryState.providers.join(" / ") : "资讯源";
  $("#newsUpdated").textContent = `${categoryState.stale ? "缓存资讯 · " : ""}已载入 ${items.length} 条 · ${providerText}${categoryState.updatedAt ? ` · ${new Date(categoryState.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : ""}`;
}

async function fetchNews({ force = false, category = state.activeNewsCategory } = {}) {
  if (state.newsCategories[category]?.status === "loading") return;
  newsController.setStatus(category, "loading");
  renderNews();
  try {
    newsController.merge(await api.network.newsCategory(category, { force }));
  } catch (error) {
    newsController.merge({ ok: false, category, error: error?.message || "资讯服务暂时不可用" });
  }
  renderNews();
}

function syncWorkspace() {
  const todayTasks = state.tasks.filter((item) => !item.date || item.date === dateKey());
  const nearestCountdown = [...state.countdowns]
    .filter((item) => new Date(item.date).getTime() > Date.now())
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;
  const weatherProjection = window.mineworkUiModel.weatherWorkspaceProjection({ weatherSettings: state.weatherSettings, weatherResults: state.weatherResults, describeWeather: weatherDescription });
  api.island.syncWorkspace({
    username: state.username,
    quote: currentQuote().text,
    tasks: todayTasks.slice(0, 5).map((item) => ({ text: item.text, done: item.done })),
    taskProgress: { done: todayTasks.filter((item) => item.done).length, total: todayTasks.length },
    ...weatherProjection,
    hydration: {
      amount: Math.max(0, Number(state.hydration.amount) || 0),
      goal: Math.max(1, Number(state.hydration.goal))
    },
    countdown: nearestCountdown ? { name: nearestCountdown.name, target: nearestCountdown.date } : null,
    events: state.calendarEvents
      .filter((item) => dateKey(new Date(item.date)) === dateKey())
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 4)
      .map((item) => ({ title: item.title, date: item.date })),
    bookCount: state.books.length,
    shortcutCount: state.shortcuts.length
  });
}

function savePersonal(key, value) {
  state[key] = value;
  store.set(key, value);
  renderPersonalWorkspace();
}

function renderTasks() {
  const today = dateKey();
  const todayTasks = state.tasks.filter((item) => !item.date || item.date === today);
  const done = todayTasks.filter((item) => item.done).length;
  const percent = todayTasks.length ? Math.round(done / todayTasks.length * 100) : 0;
  $("#taskCounter").textContent = `${done} / ${todayTasks.length}`;
  $("#homeTaskStat").textContent = `${done} / ${todayTasks.length}`;
  $("#homeTaskBar").style.width = `${percent}%`;
  $("#taskList").innerHTML = todayTasks.length ? todayTasks.map((item) => `
    <div class="task-row ${item.done ? "done" : ""}">
      <button class="task-check" data-toggle-task="${item.id}" aria-label="${item.done ? "标记为未完成" : "标记为完成"}">${item.done ? uiIcon("check") : ""}</button>
      <span class="task-copy">${escapeHtml(item.text)}</span>
      <span class="task-priority">PRIORITY / ${escapeHtml((item.priority || "normal").toUpperCase())}</span>
      <button class="task-delete" data-delete-task="${item.id}" aria-label="删除">${uiIcon("trash")}</button>
    </div>`).join("") : visualEmpty("check-square", "今天还没有待办", "写下第一件要完成的事。");
  $("#homeTaskList").innerHTML = todayTasks.length ? todayTasks.slice(0, 4).map((item) => `
    <div class="home-task-row ${item.done ? "done" : ""}"><i></i><span>${escapeHtml(item.text)}</span></div>`).join("") : `<p class="home-task-empty">今天的列表很安静，适合从最重要的一件事开始。</p>`;
}

function renderCalendar() {
  const cursor = state.calendarCursor;
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  $("#calendarTitle").textContent = `${cursor.toLocaleDateString("en-US", { month: "long" })} ${year} / ${String(month + 1).padStart(2, "0")}`;
  const projection = window.mineworkCalendarModel?.calendarMonthProjection(year, month + 1, { china: state.calendarData.china, chinaSnapshots: state.calendarData.chinaSnapshots, international: state.calendarData.international, anniversaries: state.anniversaries, tasks: state.tasks, events: state.calendarEvents }) || [];
  const today = dateKey();
  if (!state.selectedDate) state.selectedDate = today;
  const eventDateInput = $("#eventDate");
  if (eventDateInput) eventDateInput.value = state.selectedDate;
  const days = projection.map((cell) => {
    const day = new Date(`${cell.dateKey}T12:00:00`);
    const key = cell.dateKey;
    const meta = window.mineworkUiModel?.calendarDayMeta(key, state.tasks, state.calendarEvents) || { taskCount: 0, openTaskCount: 0, eventCount: 0, firstEventTitle: "", firstEventTime: "" };
    const isOutsideMonth = !cell.inMonth;
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
    const visibility = window.mineworkUiModel?.calendarSignalVisibility(state.calendarFilters, { eventCount: meta.eventCount, taskCount: meta.openTaskCount, officialHoliday: cell.holidaySignals?.officialHoliday, traditionalFestival: cell.holidaySignals?.traditionalFestival, internationalDate: cell.holidaySignals?.internationalDate, anniversary: cell.signals.anniversary }) || {};
    const badge = visibility.officialHoliday && cell.meta.workStatus === "rest" ? `<b class="work-badge rest">休</b>` : visibility.officialHoliday && cell.meta.workStatus === "work" ? `<b class="work-badge work">班</b>` : "";
    const categoryVisible = { "china-official": visibility.officialHoliday, "china-traditional": visibility.traditionalFestival, "international": visibility.internationalDate };
    const visibleFestivals = cell.meta.festivals.filter((_name, index) => {
      const category = cell.meta.festivalCategories[index];
      if (category === "china-commemoration") return cell.meta.workStatus ? visibility.officialHoliday : visibility.traditionalFestival;
      return categoryVisible[category] === true;
    });
    const anniversaryTitle = cell.signals.anniversary ? cell.meta.label : "";
    const specialLabel = visibility.anniversary && anniversaryTitle ? anniversaryTitle : visibleFestivals[0] || (visibility.traditionalFestival && cell.meta.solarTerm ? cell.meta.solarTerm : "");
    const fullLabel = [...cell.meta.festivals, cell.meta.solarTerm, cell.meta.lunarMonth + cell.meta.lunarDay].filter(Boolean).join(" · ");
    return `<button class="calendar-day ${isOutsideMonth ? "muted" : ""} ${isWeekend ? "weekend" : ""} ${key === today ? "today" : ""} ${key === state.selectedDate ? "selected" : ""}" data-calendar-date="${key}" title="${escapeHtml(fullLabel)}" aria-label="${key} ${escapeHtml(fullLabel)}">
      <span class="calendar-day-top">${isOutsideMonth || day.getDate() === 1 ? `<small>${day.getMonth() + 1}月</small>` : "<small></small>"}<strong>${day.getDate()}</strong></span>
      <span class="calendar-lunar">${escapeHtml(cell.meta.lunarDay === "初一" ? cell.meta.lunarMonth : cell.meta.lunarDay)}${badge}</span>
      ${specialLabel ? `<span class="calendar-special">${escapeHtml(specialLabel)}</span>` : ""}
      <span class="calendar-day-signals">${visibility.task ? `<i class="task-signal">${meta.openTaskCount} 待办</i>` : ""}${visibility.event ? `<i class="event-signal">${meta.eventCount} 行程</i>` : ""}</span>
    </button>`;
  });
  $("#calendarGrid").innerHTML = days.join("");
  const selected = new Date(`${state.selectedDate}T00:00:00`);
  $("#selectedDate").textContent = Number.isNaN(selected.getTime()) ? state.selectedDate : selected.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" });
  const selectedTasks = state.tasks.filter((item) => item.date === state.selectedDate);
  $("#selectedDayTasks").innerHTML = selectedTasks.length ? selectedTasks.map((item) => `<div class="agenda-row ${item.done ? "done" : ""}"><span>${uiIcon(item.done ? "check" : "circle-notch")}</span><b>${escapeHtml(item.text)}</b><small>${item.done ? "已完成" : "待完成"}</small></div>`).join("") : `<div class="agenda-empty">这一天没有待办。</div>`;
  const selectedEvents = state.calendarEvents.filter((item) => dateKey(new Date(item.date)) === state.selectedDate).sort((a, b) => new Date(a.date) - new Date(b.date));
  $("#selectedDayEvents").innerHTML = selectedEvents.length ? selectedEvents.map((item) => `<div class="event-row"><time>${new Date(item.date).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}</time><span>${escapeHtml(item.title)}</span><small>${Number(item.remindMinutes) ? `提前 ${item.remindMinutes} 分钟` : "准时提醒"}</small><button data-delete-event="${item.id}" aria-label="删除行程">${uiIcon("x")}</button></div>`).join("") : `<div class="agenda-empty">这一天没有行程。</div>`;
  const selectedCell = projection.find((cell) => cell.dateKey === state.selectedDate);
  const selectedAnniversaries = state.anniversaries.filter((item) => window.mineworkCalendarModel?.anniversaryOccurrences(item, state.selectedDate, state.selectedDate).length);
  $("#selectedDayFestivals").innerHTML = selectedCell && (selectedCell.meta.festivals.length || selectedCell.meta.solarTerm) ? [...selectedCell.meta.festivals, selectedCell.meta.solarTerm].filter(Boolean).map((name) => `<div class="agenda-row"><span>${uiIcon("calendar")}</span><b>${escapeHtml(name)}</b><small>${selectedCell.meta.workStatus === "rest" ? "休息日" : selectedCell.meta.workStatus === "work" ? "调休上班" : "日期纪念"}</small></div>`).join("") : `<div class="agenda-empty">这一天没有节日或节气。</div>`;
  $("#selectedDayAnniversaries").innerHTML = selectedAnniversaries.length ? selectedAnniversaries.map((item) => `<div class="event-row"><time>${item.allDay ? "全天" : escapeHtml(item.time)}</time><span>${escapeHtml(item.title)}</span><small>${item.enabled ? "提醒已启用" : "已停用"}</small><button data-edit-anniversary="${item.id}" aria-label="编辑纪念日">编辑</button><button data-delete-anniversary="${item.id}" aria-label="删除纪念日">${uiIcon("x")}</button></div>`).join("") : `<div class="agenda-empty">这一天没有纪念日。</div>`;
  $("#selectedDateMeta").textContent = `${selectedTasks.length} 项待办 · ${selectedEvents.length} 个行程 · ${selectedAnniversaries.length} 个纪念日`;
  renderAnniversaryList();
  api.calendar.syncEvents(state.calendarEvents);
  api.calendar.syncAnniversaries(state.anniversaries);
}

function renderAnniversaryList() {
  const host = $("#anniversaryList");
  if (!host) return;
  host.innerHTML = state.anniversaries.length ? state.anniversaries.map((item) => `<div><b>${escapeHtml(item.title)}</b><small>${item.calendar === "lunar" ? "农历" : "公历"} · ${escapeHtml(item.date)} · ${item.recurrence}</small><button type="button" data-edit-anniversary="${item.id}">编辑</button><button type="button" data-delete-anniversary="${item.id}">删除</button></div>`).join("") : `<small>还没有保存纪念日。</small>`;
}

function configureAnniversaryComposer() {
  const calendar = $("#anniversaryCalendar").value;
  const options = window.mineworkUiModel.anniversaryComposerOptions(calendar);
  const labels = { once: "仅一次", monthly: "每月", yearly: "每年" };
  const current = $("#anniversaryRecurrence").value;
  $("#anniversaryRecurrence").innerHTML = options.recurrences.map((value) => `<option value="${value}">${labels[value]}</option>`).join("");
  $("#anniversaryRecurrence").value = options.recurrences.includes(current) ? current : "yearly";
  $("#anniversaryLeapWrap").hidden = !options.showLeapMonth;
  $("#anniversaryDate").type = options.dateInputType;
  $("#anniversaryDate").placeholder = options.datePlaceholder;
}

async function initializeCalendarData() {
  try { state.calendarData = await api.calendar.getData(); } catch { state.calendarData = { china: null, international: { version: "", items: [] } }; }
  renderCalendar();
}

function renderFavorites() {
  $("#favoriteList").innerHTML = state.favorites.length ? state.favorites.map((item) => {
    let host = "LINK";
    try { host = new URL(item.url).hostname.replace(/^www\./, ""); } catch {}
    return `<article class="archive-card"><span class="archive-icon">${uiIcon("link")}</span><div><h3>${escapeHtml(item.title || host)}</h3><p>${escapeHtml(host)} · ${new Date(item.created).toLocaleDateString("zh-CN")}</p></div><button class="archive-open text-link icon-label" data-open-favorite="${item.id}">打开${uiIcon("arrow-square-out")}</button><button class="archive-delete" data-delete-favorite="${item.id}" aria-label="删除">${uiIcon("trash")}</button></article>`;
  }).join("") : visualEmpty("bookmark", "暂无收藏", "把下一篇值得重读的内容放在这里。");
}

function renderNoteImagePreview() {
  const preview = $("#noteImagePreview");
  if (!preview) return;
  preview.innerHTML = pendingNoteImages.map((image, index) => `<figure><img src="${image}" alt="待保存的摘录图片 ${index + 1}" /><button type="button" data-remove-note-image="${index}" aria-label="移除图片">${uiIcon("x")}</button></figure>`).join("");
  $("#noteMediaDock")?.classList.toggle("has-images", pendingNoteImages.length > 0);
}

async function compressNoteImage(file) {
  const bitmap = await createImageBitmap(file);
  const maximum = 1280;
  const scale = Math.min(1, maximum / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { alpha: file.type === "image/png" });
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", .84);
}

async function addNoteImages(files) {
  const room = Math.max(0, 3 - pendingNoteImages.length);
  const selected = [...files].filter((file) => file?.type?.startsWith("image/")).slice(0, room);
  if (!selected.length) return;
  try {
    const images = await Promise.all(selected.map(compressNoteImage));
    pendingNoteImages = window.mineworkUiModel?.normalizeNoteImages([...pendingNoteImages, ...images]) || [...pendingNoteImages, ...images].slice(0, 3);
    renderNoteImagePreview();
    toast(`已粘贴 ${images.length} 张图片`);
  } catch (error) {
    toast(error?.message || "图片处理失败，请换一张图片重试");
  }
}

function renderNotes() {
  $("#noteGrid").innerHTML = state.notes.length ? state.notes.map((item) => {
    const images = window.mineworkUiModel?.normalizeNoteImages(item.images) || [];
    const layout = window.mineworkUiModel?.noteCardLayout(images) || "text";
    const media = images.length ? `<div class="note-card-media ${layout}">${images.map((image, index) => `<img src="${image}" alt="${escapeHtml(item.title)} · 图片 ${index + 1}" />`).join("")}</div>` : "";
    return `<article class="note-card ${images.length ? "has-media" : ""}">${media}<div class="note-card-copy"><span class="note-tag">${escapeHtml(item.tag || "NOTE")}</span><h3>${escapeHtml(item.title)}</h3>${item.content ? `<p>${escapeHtml(item.content)}</p>` : `<p class="note-image-caption">图片摘录</p>`}</div><footer><span>${new Date(item.created || Date.now()).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}</span>${uiIcon("quotes")}</footer><button class="note-delete" data-delete-note="${item.id}" aria-label="删除">${uiIcon("trash")}</button></article>`;
  }).join("") : visualEmpty("quotes", "还没有摘录", "捕捉一个想法，让它留下来。");
}

function renderBooks() {
  const labels = { reading: "正在阅读", wishlist: "想读", finished: "已读完" };
  $("#bookGrid").innerHTML = state.books.length ? state.books.map((item) => `<article class="book-card" data-cover-shift="${window.mineworkUiModel?.bookCoverShift(item.title) ?? 0}"><div class="book-spine">${item.icon ? `<img src="${item.icon}" alt="" />` : `<span>${escapeHtml((item.title || "书").slice(0, 1))}</span><i>${uiIcon("book-open")}</i>`}</div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.author || item.format || "未知作者")}</p><small>${item.format || labels[item.status] || labels.reading}</small>${item.path ? `<div class="book-actions"><button data-open-book="${item.id}">${uiIcon("book-open")}打开</button><button data-reveal-book="${item.id}">${uiIcon("folder-open")}位置</button></div>` : ""}<button class="book-delete" data-delete-book="${item.id}" aria-label="删除">${uiIcon("trash")}</button></article>`).join("") : visualEmpty("books", "书架还是空的", "加入你正在读的第一本书，或导入本地电子书。");
  const reading = state.books.filter((item) => item.status === "reading").length;
  $("#homeBookCount").textContent = reading;
  $("#homeBookBar").style.width = `${Math.min(100, reading * 20)}%`;
}

function renderHydrationState(event = { type: "render", goalCrossed: false }) {
  const amount = Math.max(0, Number(state.hydration.amount) || 0);
  const goal = Math.max(1, Number(state.hydration.goal));
  const percent = Math.min(100, Math.round(amount / goal * 100));
  const motion = window.mineworkUiModel.hydrationMotionProjection({ amount, goal, mutation: event.type, goalCrossed: event.goalCrossed, reduceMotion: reducedMotionQuery.matches });
  $("#waterAmount").textContent = amount;
  $("#waterPercent").textContent = `${percent}% COMPLETED`;
  $("#waterGoal").textContent = `${goal} ml`;
  $("#waterRemaining").textContent = `${Math.max(0, goal - amount)} ml`;
  $("#waterRing").style.setProperty("--water-level", motion.level);
  $("#waterRing").setAttribute("aria-valuenow", String(motion.level));
  $("#waterRing").classList.toggle("is-bubbling", motion.bubbles);
  $("#waterRing").classList.toggle("is-goal-crossed", motion.ripple);
  $("#homeHydration").textContent = amount;
  $("#homeHydrationBar").style.width = `${percent}%`;
  $("#undoWater").disabled = !state.hydration.entries.length;
  $("#hydrationGoalInput").value = goal;
  $("#hydrationReminderEnabled").checked = state.hydration.reminder.enabled;
  $("#hydrationReminderInterval").value = state.hydration.reminder.intervalMinutes;
  $("#hydrationReminderStart").value = state.hydration.reminder.activeStart;
  $("#hydrationReminderEnd").value = state.hydration.reminder.activeEnd;
  $("#hydrationLogCount").textContent = `${state.hydration.entries.length} 条`;
  $("#hydrationLog").innerHTML = state.hydration.entries.length ? [...state.hydration.entries].reverse().map((entry) => `<li><time datetime="${escapeHtml(entry.occurredAt)}">${new Date(entry.occurredAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}</time><strong>+${entry.amount} ml</strong></li>`).join("") : '<li class="empty-mini">今天还没有饮水记录</li>';
  $("#hydrationArchives").innerHTML = state.hydration.archives.length ? state.hydration.archives.map((archive) => `<p><span>${escapeHtml(archive.date)}</span><strong>${archive.amount} / ${archive.goal} ml</strong></p>`).join("") : '<p class="empty-mini">暂无历史记录</p>';
  if (motion.bubbles || motion.ripple) setTimeout(() => { $("#waterRing")?.classList.remove("is-bubbling", "is-goal-crossed"); }, 1000);
}

function renderHydration() {
  hydrationController.rollover();
}

function renderReflection() {
  const todayTasks = state.tasks.filter((item) => !item.date || item.date === dateKey());
  const done = todayTasks.filter((item) => item.done).length;
  const percent = todayTasks.length ? Math.round(done / todayTasks.length * 100) : 0;
  $("#reflectionCompletion").textContent = `${percent}%`;
  $("#reflectionTaskMeta").textContent = `${done} / ${todayTasks.length} 待办`;
  $("#reflectionWater").textContent = `${(Number(state.hydration.amount || 0) / 1000).toFixed(1)}L`;
  $("#reflectionWaterGoal").textContent = `目标 ${(Number(state.hydration.goal) / 1000).toFixed(1)}L`;
  $("#reflectionNotes").textContent = state.notes.filter((item) => String(item.created || "").startsWith(dateKey())).length;
  $("#reflectionBooks").textContent = state.books.length;
  const saved = state.reflections[dateKey()] || {};
  if (document.activeElement?.closest?.("#reflectionForm")) return;
  $("#reflectionDid").value = saved.did || "";
  $("#reflectionLearned").value = saved.learned || "";
  $("#reflectionImprove").value = saved.improve || "";
}

function renderPersonalWorkspace() {
  renderTasks();
  renderCalendar();
  renderFavorites();
  renderNotes();
  renderBooks();
  renderHydration();
  renderReflection();
  syncWorkspace();
}

function bindEvents() {
  $$(".nav-item").forEach((button) => {
    button.title = button.dataset.title || button.textContent.trim();
  });
  document.addEventListener("click", (event) => {
    const navigation = event.target.closest(".nav-item[data-page]");
    if (navigation) {
      setPage(navigation.dataset.page, navigation.dataset.title);
      return;
    }
    const shortcut = event.target.closest("[data-go]");
    if (shortcut && !event.target.closest("[data-media]")) setPage(shortcut.dataset.go);
  });
  $$("[data-window]").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.window;
    if (action === "minimize") api.window.minimize();
    if (action === "maximize") api.window.toggleMaximize();
    if (action === "hide") api.window.hide();
    if (action === "close") api.window.close();
  }));
  $("#page-notifications").addEventListener("click", async (event) => {
    const filter = event.target.closest("[data-notification-filter]");
    if (filter) {
      notificationState.filter = filter.dataset.notificationFilter;
      notificationState.limit = 100;
      $$("[data-notification-filter]").forEach((button) => button.classList.toggle("active", button === filter));
      return refreshNotifications();
    }
    const action = event.target.closest("[data-notification-action]");
    if (action) {
      const id = action.dataset.notificationId;
      if (action.dataset.notificationAction === "read") await api.notifications.markRead(id);
      if (action.dataset.notificationAction === "dismiss") await api.notifications.dismiss(id);
      if (action.dataset.notificationAction === "open") {
        const record = (notificationState.snapshot.records || []).find((item) => item.id === id);
        await api.notifications.markRead(id);
        if (record?.targetPage) setPage(record.targetPage);
      }
      return;
    }
    if (event.target.closest("#notificationLoadMore")) { notificationState.limit += 100; renderNotifications(); }
    if (event.target.closest("#notificationMarkAll")) await api.notifications.markAllRead();
    if (event.target.closest("#notificationClear")) await api.notifications.clear();
    if (event.target.closest("#notificationTest") || event.target.closest("#notificationSettingsTest")) await api.notifications.test();
    if (event.target.closest("#notificationReset")) writeNotificationForm(await api.notifications.resetSettings());
  });
  $("#notificationSettingsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = $("#notificationSaveState");
    try { writeNotificationForm(await api.notifications.updateSettings(notificationSettingsPatch())); status.textContent = "已保存"; }
    catch (error) { status.textContent = error.message || "保存失败"; }
  });

  $("#accountEntry").addEventListener("click", () => {
    $("#accountModal").classList.remove("hidden");
    $("#usernameInput").focus();
  });
  $("#closeAccountModal").addEventListener("click", () => $("#accountModal").classList.add("hidden"));
  $("#accountModal").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) event.currentTarget.classList.add("hidden");
  });
  $("#accountForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = $("#usernameInput").value.trim();
    if (!username) return;
    const settings = await api.settings.set({ username, stayResident: $("#stayResident").checked });
    state.username = settings.username;
    state.stayResident = settings.stayResident !== false;
    renderAccount();
    syncWorkspace();
    $("#accountModal").classList.add("hidden");
    toast(`欢迎回来，${state.username}`);
  });
  $("#quotePrev").addEventListener("click", () => setQuote((state.quoteIndex ?? quoteForToday().index) - 1));
  $("#quoteNext").addEventListener("click", () => setQuote((state.quoteIndex ?? quoteForToday().index) + 1));
  $("#quoteShuffle").addEventListener("click", () => {
    const current = state.quoteIndex ?? quoteForToday().index;
    let next = current;
    while (next === current) next = Math.floor(Math.random() * DAILY_QUOTES.length);
    setQuote(next);
  });
  $("#locationForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const location = getLocationSelection();
    if (!location) return toast("请至少选择省份和城市");
    const updated = weatherModel.addWeatherLocation(state, location);
    Object.assign(state, updated);
    const saved = state.weatherSettings.locations.find((item) => item.id === state.selectedWeatherLocationId);
    state.weatherLocation = saved;
    state.city = weatherLocationName(saved);
    persistWeatherSettings();
    renderWeather();
    fetchWeather(saved);
  });
  $("#weatherCountry").addEventListener("change", () => {
    const foreign = $("#weatherCountry").value !== "CN";
    setForeignLocationMode(foreign);
    if (!foreign) {
      fillLocationSelect($("#weatherProvince"), regionData.provinces, "选择省份");
      populateCities();
    }
    updateLocationPath();
  });
  $("#weatherProvince").addEventListener("change", () => populateCities());
  $("#weatherCity").addEventListener("change", () => populateDistricts());
  $("#weatherDistrict").addEventListener("change", updateLocationPath);
  $$(".foreign-location").forEach((input) => input.addEventListener("input", updateLocationPath));
  $("#refreshWeather").addEventListener("click", () => {
    const location = state.weatherSettings.locations.find((item) => item.id === state.selectedWeatherLocationId);
    if (!location) return toast("请先选择天气位置");
    fetchWeather(location, { force: true });
  });
  $("#refreshWeatherAll").addEventListener("click", () => {
    if (!state.weatherSettings.locations.length) return toast("请先添加天气位置");
    fetchWeather(state.weatherSettings.locations, { force: true });
  });
  $("#weatherIslandAutoRotate").addEventListener("change", (event) => {
    state.weatherSettings.islandAutoRotate = event.target.checked;
    persistWeatherSettings();
    syncWorkspace();
  });
  $("#weatherIslandRotateSeconds").addEventListener("change", (event) => {
    state.weatherSettings.islandRotateSeconds = Math.max(5, Math.min(60, Number(event.target.value) || 8));
    renderWeatherIslandSettings();
    persistWeatherSettings();
    syncWorkspace();
  });
  $("#weatherLocationTabs").addEventListener("click", (event) => {
    const select = event.target.closest("[data-weather-select]");
    const remove = event.target.closest("[data-weather-remove]");
    const primary = event.target.closest("[data-weather-primary]");
    const move = event.target.closest("[data-weather-move]");
    if (select) Object.assign(state, weatherModel.selectWeatherLocation(state, select.dataset.weatherSelect));
    if (remove) Object.assign(state, weatherModel.removeWeatherLocation(state, remove.dataset.weatherRemove));
    if (primary) Object.assign(state, weatherModel.setPrimaryWeatherLocation(state, primary.dataset.weatherPrimary));
    if (move) Object.assign(state, weatherModel.moveWeatherLocation(state, move.dataset.weatherId, Number(move.dataset.weatherMove)));
    persistWeatherSettings();
    renderWeather();
    syncWorkspace();
  });
  $("#refreshNews").addEventListener("click", () => fetchNews({ force: true }));
  $("#refreshNewsAll").addEventListener("click", async () => {
    const results = await api.network.newsAll({ force: true });
    for (const result of results || []) newsController.merge(result);
    renderNews();
  });
  $("#newsSearch").value = state.newsQuery;
  $("#newsSearch").addEventListener("input", (event) => {
    newsController.setQuery(event.target.value);
    store.set("newsQuery", event.target.value);
    renderNews();
  });
  $(".news-category-tabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-news-category]");
    if (!tab || !newsController.switchCategory(tab.dataset.newsCategory)) return;
    syncNewsState();
    renderNews();
    if (state.newsCategories[state.activeNewsCategory].status === "idle") fetchNews();
  });

  $("#addShortcut").addEventListener("click", async () => {
    const picked = await api.shortcuts.pickFiles();
    if (!picked?.length) return;
    const existing = new Set(state.shortcuts.map((item) => item.path.toLowerCase()));
    state.shortcuts.push(...picked.filter((item) => !existing.has(item.path.toLowerCase())));
    store.set("shortcuts", state.shortcuts);
    renderShortcuts();
    syncWorkspace();
  });
  $("#addFolder").addEventListener("click", async () => {
    const picked = await api.shortcuts.pickFolder();
    if (!picked) return;
    if (!state.shortcuts.some((item) => item.path.toLowerCase() === picked.path.toLowerCase())) state.shortcuts.push(picked);
    store.set("shortcuts", state.shortcuts);
    renderShortcuts();
    syncWorkspace();
  });
  document.addEventListener("click", (event) => {
    const removeShortcut = event.target.closest("[data-remove-shortcut]");
    if (removeShortcut) {
      event.stopPropagation();
      state.shortcuts.splice(Number(removeShortcut.dataset.removeShortcut), 1);
      store.set("shortcuts", state.shortcuts);
      renderShortcuts();
      syncWorkspace();
      return;
    }
    const shortcut = event.target.closest("[data-open-shortcut]");
    if (shortcut) openShortcut(Number(shortcut.dataset.openShortcut));
    const removeCountdown = event.target.closest("[data-remove-countdown]");
    if (removeCountdown) {
      state.countdowns.splice(Number(removeCountdown.dataset.removeCountdown), 1);
      store.set("countdowns", state.countdowns);
      renderCountdowns();
      syncCountdowns();
      syncWorkspace();
    }
    const media = event.target.closest("[data-media]");
    if (media) {
      event.preventDefault();
      event.stopPropagation();
      controlMedia(media.dataset.media);
    }
  });

  $("#showCountdownForm").addEventListener("click", () => {
    $("#countdownForm").classList.remove("hidden");
    const date = new Date(Date.now() + 86400000);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    $("#countdownDate").value = date.toISOString().slice(0, 16);
    $("#countdownName").focus();
  });
  $("#cancelCountdown").addEventListener("click", () => $("#countdownForm").classList.add("hidden"));
  $("#countdownForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("#countdownName").value.trim();
    const date = $("#countdownDate").value;
    if (!name || !date) return;
    addCountdown(name, date);
    event.target.reset();
    event.target.classList.add("hidden");
  });
  $("#alarmRecurrence")?.addEventListener("change", (event) => $("#alarmWeekdays")?.classList.toggle("hidden", event.target.value !== "weekdays"));
  $("#alarmForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = $("#alarmTitle").value.trim();
    const time = $("#alarmTime").value;
    const recurrence = $("#alarmRecurrence").value;
    const weekdays = $$("#alarmWeekdays input:checked").map((input) => Number(input.value));
    if (!title || !time || (recurrence === "weekdays" && !weekdays.length)) return;
    state.alarms.push({ id: `${Date.now()}-${Math.random()}`, title, time, status: "active", recurrence, weekdays, createdAt: new Date().toISOString() });
    event.target.reset();
    syncAlarms();
  });
  $("#alarmGrid")?.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-toggle-alarm]");
    const remove = event.target.closest("[data-delete-alarm]");
    if (toggle) {
      const alarm = state.alarms.find((item) => item.id === toggle.dataset.toggleAlarm);
      if (alarm) alarm.status = alarm.status === "active" ? "disabled" : "active";
    }
    if (remove) state.alarms = state.alarms.filter((item) => item.id !== remove.dataset.deleteAlarm);
    if (toggle || remove) syncAlarms();
  });
  $$("[data-countdown-minutes]").forEach((button) => button.addEventListener("click", () => {
    const minutes = Number(button.dataset.countdownMinutes);
    const labels = { 5: "快速休息", 10: "短时提醒", 25: "番茄专注", 60: "专注一小时" };
    addCountdown(labels[minutes] || `${minutes} 分钟倒计时`, new Date(Date.now() + minutes * 60000));
    toast(`已创建 ${button.textContent.trim()}倒计时`);
  }));
  $$("[data-countdown-preset]").forEach((button) => button.addEventListener("click", () => {
    const now = new Date();
    if (button.dataset.countdownPreset === "tomorrow") {
      const target = new Date(now);
      target.setDate(target.getDate() + 1);
      target.setHours(8, 0, 0, 0);
      addCountdown("明天早上", target);
    } else {
      addCountdown("一周后", new Date(now.getTime() + 7 * 86400000));
    }
    toast(`已创建 ${button.textContent.trim()}倒计时`);
  }));

  $("#sourceText").addEventListener("input", () => scheduleTranslation());
  $("#sourceLanguage").addEventListener("change", () => scheduleTranslation(120));
  $("#targetLanguage").addEventListener("change", () => scheduleTranslation(120));
  $("#swapLanguages").addEventListener("click", () => {
    const source = $("#sourceLanguage");
    const target = $("#targetLanguage");
    const sourceValue = source.value === "auto" ? "zh-CN" : source.value;
    source.value = target.value;
    target.value = sourceValue;
    const input = $("#sourceText").value;
    $("#sourceText").value = $("#translatedText").value;
    $("#translatedText").value = input;
    $("#charCount").textContent = $("#sourceText").value.length;
    scheduleTranslation(120);
  });
  $("#copyTranslation").addEventListener("click", async () => {
    const value = $("#translatedText").value;
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast("翻译结果已复制");
  });

  $$("[data-web-tabs] [data-provider]").forEach((button) => {
    button.addEventListener("click", () => {
      const group = button.closest("[data-web-tabs]").dataset.webTabs;
      activateWebProvider(group, button.dataset.provider);
    });
    button.addEventListener("pointerenter", () => {
      clearTimeout(providerWarmTimer);
      const group = button.closest("[data-web-tabs]").dataset.webTabs;
      providerWarmTimer = setTimeout(() => primeWebProvider(group, button.dataset.provider), 180);
    });
  });
  $$("[data-refresh]").forEach((button) => button.addEventListener("click", () => {
    const group = button.dataset.refresh;
    $(`#${group}Webviews webview.active`)?.reload();
  }));
  $("#openAiExternal").addEventListener("click", () => api.system.openExternal(providerConfig.ai[state.webProviders.ai].url));
  $("#openMailExternal").addEventListener("click", () => api.system.openExternal(providerConfig.mail[state.webProviders.mail].url));
  $("#secureMailLogin").addEventListener("click", async () => {
    const result = await api.system.openSecureBrowser(providerConfig.mail[state.webProviders.mail].url);
    toast(result.ok ? `已使用 ${result.browser} 打开，登录后会自动保留账号` : result.error);
  });

  $("#islandWidth").addEventListener("input", (event) => {
    const width = Number(event.target.value);
    $("#islandWidthValue").textContent = width;
    $("#islandPreview").style.width = `${width}px`;
    clearTimeout(islandWidthTimer);
    islandWidthTimer = setTimeout(() => api.island.setWidth(width), 100);
  });
  $("#islandVisible").addEventListener("change", (event) => api.island.setVisible(event.target.checked));
  $("#islandLocked").addEventListener("change", async (event) => {
    applyIslandSettings(await api.island.setLocked(event.target.checked));
  });
  $("#showIsland").addEventListener("click", async () => {
    applyIslandSettings(await api.island.setVisible(true));
    toast("灵动岛已显示到桌面");
  });
  $("#hideIsland").addEventListener("click", async () => {
    applyIslandSettings(await api.island.setVisible(false));
    toast("灵动岛已隐藏");
  });

  $("#taskForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const text = $("#taskInput").value.trim();
    if (!text) return;
    state.tasks.push({ id: `${Date.now()}`, text, priority: $("#taskPriority").value, done: false, date: dateKey(), created: new Date().toISOString() });
    store.set("tasks", state.tasks);
    event.target.reset();
    renderPersonalWorkspace();
  });
  $("#clearCompletedTasks").addEventListener("click", () => {
    state.tasks = state.tasks.filter((item) => !item.done);
    store.set("tasks", state.tasks);
    renderPersonalWorkspace();
  });
  $("#calendarPrev").addEventListener("click", () => { state.calendarCursor.setMonth(state.calendarCursor.getMonth() - 1); renderCalendar(); });
  $("#calendarNext").addEventListener("click", () => { state.calendarCursor.setMonth(state.calendarCursor.getMonth() + 1); renderCalendar(); });
  $("#calendarToday").addEventListener("click", () => { state.calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1); state.selectedDate = dateKey(); renderCalendar(); });
  $("#eventForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = $("#eventTitle").value.trim();
    const time = $("#eventTime").value;
    const day = $("#eventDate").value || state.selectedDate || dateKey();
    const date = new Date(`${day}T${time}:00`);
    if (!title || !time || Number.isNaN(date.getTime())) return;
    state.calendarEvents.push({ id: `${Date.now()}-${Math.random()}`, title, date: date.toISOString(), remindMinutes: Number($("#eventReminder").value) || 0, created: new Date().toISOString() });
    store.set("calendar-events", state.calendarEvents);
    event.target.reset();
    $("#eventDate").value = state.selectedDate || dateKey();
    $("#eventReminder").value = "30";
    renderCalendar();
    toast("行程已添加，MineWork 会按时提醒你");
  });
  $("#eventToday").addEventListener("click", () => {
    state.selectedDate = dateKey();
    $("#eventDate").value = dateKey();
    renderCalendar();
    $("#eventTitle").focus();
  });
  $("#focusEventComposer").addEventListener("click", () => {
    $("#eventForm").scrollIntoView({ behavior: reducedMotionQuery.matches ? "auto" : "smooth", block: "nearest" });
    setTimeout(() => $("#eventTitle").focus(), reducedMotionQuery.matches ? 0 : 260);
  });
  $$('[data-calendar-filter]').forEach((input) => input.addEventListener("change", () => {
    state.calendarFilters[input.dataset.calendarFilter] = input.checked;
    store.set("calendar-filters", state.calendarFilters);
    renderCalendar();
  }));
  $("#anniversaryCalendar").addEventListener("change", configureAnniversaryComposer);
  $("#anniversaryAllDay").addEventListener("change", () => { $("#anniversaryTime").disabled = $("#anniversaryAllDay").checked; });
  $("#anniversaryForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const id = $("#anniversaryEditId").value || `anniversary-${Date.now()}`;
    const item = window.mineworkCalendarModel.normalizeAnniversary({ id, title: $("#anniversaryTitle").value, type: $("#anniversaryType").value, calendar: $("#anniversaryCalendar").value, recurrence: $("#anniversaryRecurrence").value, date: $("#anniversaryDate").value, isLeapMonth: $("#anniversaryLeap").checked, allDay: $("#anniversaryAllDay").checked, time: $("#anniversaryTime").value, reminders: $$('[name="anniversaryReminder"]:checked').map((input) => Number(input.value)), enabled: $("#anniversaryEnabled").checked });
    if (!item) return toast("请检查纪念日日期、时间和重复规则");
    const index = state.anniversaries.findIndex((entry) => entry.id === id);
    if (index >= 0) state.anniversaries[index] = item; else state.anniversaries.push(item);
    store.set("anniversaries", state.anniversaries); event.target.reset(); $("#anniversaryEditId").value = ""; configureAnniversaryComposer(); renderCalendar(); toast("纪念日已保存");
  });
  $("#page-calendar").addEventListener("click", (event) => {
    const remove = event.target.closest("[data-delete-anniversary]");
    if (remove) { state.anniversaries = state.anniversaries.filter((item) => item.id !== remove.dataset.deleteAnniversary); store.set("anniversaries", state.anniversaries); renderCalendar(); return; }
    const edit = event.target.closest("[data-edit-anniversary]");
    if (edit) { const item = state.anniversaries.find((entry) => entry.id === edit.dataset.editAnniversary); if (!item) return; $("#anniversaryEditId").value = item.id; $("#anniversaryTitle").value = item.title; $("#anniversaryType").value = item.type; $("#anniversaryCalendar").value = item.calendar; configureAnniversaryComposer(); $("#anniversaryRecurrence").value = item.recurrence; $("#anniversaryDate").value = item.date; $("#anniversaryLeap").checked = item.isLeapMonth; $("#anniversaryAllDay").checked = item.allDay; $("#anniversaryTime").value = item.time; $("#anniversaryTime").disabled = item.allDay; $("#anniversaryEnabled").checked = item.enabled; $$('[name="anniversaryReminder"]').forEach((input) => { input.checked = item.reminders.includes(Number(input.value)); }); }
  });

  $("#favoriteForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const url = $("#favoriteUrl").value.trim();
    if (!url) return;
    state.favorites.unshift({ id: `${Date.now()}`, url, title: $("#favoriteTitle").value.trim(), created: new Date().toISOString() });
    store.set("favorites", state.favorites);
    event.target.reset();
    renderFavorites();
  });
  $("#noteForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const content = $("#noteContent").value.trim();
    const images = window.mineworkUiModel?.normalizeNoteImages(pendingNoteImages) || pendingNoteImages.slice(0, 3);
    if (!content && !images.length) return toast("请写下一段摘录，或粘贴至少一张图片");
    state.notes.unshift({ id: `${Date.now()}`, title: $("#noteTitle").value.trim(), content, images, tag: $("#noteTag").value.trim(), created: new Date().toISOString() });
    store.set("notes", state.notes);
    event.target.reset();
    pendingNoteImages = [];
    renderNoteImagePreview();
    renderPersonalWorkspace();
    toast("摘录已保存到本机");
  });
  $("#noteForm").addEventListener("paste", (event) => {
    const imageFiles = [...(event.clipboardData?.items || [])]
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (!imageFiles.length) return;
    event.preventDefault();
    addNoteImages(imageFiles);
  });
  $("#bookForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = $("#bookTitle").value.trim();
    const author = $("#bookAuthor").value.trim();
    if (!title) return toast("请先填写书名");
    if (state.books.some((item) => !item.path && String(item.title || "").trim().toLowerCase() === title.toLowerCase() && String(item.author || "").trim().toLowerCase() === author.toLowerCase())) return toast("这本书已经在书架上了");
    state.books.push({ id: `${Date.now()}`, title, author, status: $("#bookStatus").value, created: new Date().toISOString() });
    store.set("books", state.books);
    event.target.reset();
    renderPersonalWorkspace();
    toast(`《${title}》已加入书架`);
  });
  $("#importBooks").addEventListener("click", async () => {
    const button = $("#importBooks");
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = "正在选择…";
    try {
      const picked = await api.books.pickFiles();
      if (!picked?.length) return;
      const existing = new Set(state.books.filter((item) => item.path).map((item) => item.path.toLowerCase()));
      const additions = picked.filter((item) => item?.path && !existing.has(item.path.toLowerCase())).map((item) => ({ id: `${Date.now()}-${Math.random()}`, ...item, status: "reading", created: new Date().toISOString() }));
      if (!additions.length) return toast("所选文件已经在书架上了");
      state.books.push(...additions);
      store.set("books", state.books);
      renderPersonalWorkspace();
      toast(`已导入 ${additions.length} 本地文件`);
    } catch (error) {
      toast(error?.message || "本地书籍导入失败，请重试");
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  });
  $$('[data-water]').forEach((button) => button.addEventListener("click", () => { const result = hydrationController.add(Number(button.dataset.water)); $("#hydrationActionState").textContent = result.ok ? `已记录 ${button.dataset.water} ml` : result.error; }));
  $("#undoWater").addEventListener("click", () => { const result = hydrationController.undo(); $("#hydrationActionState").textContent = result.ok ? "已撤销最近一条记录" : result.error; $("#hydrationActionState").classList.toggle("is-error", !result.ok); });
  $$('[data-hydration-goal]').forEach((button) => button.addEventListener("click", () => { $("#hydrationGoalInput").value = button.dataset.hydrationGoal; }));
  $("#hydrationGoalForm").addEventListener("submit", (event) => { event.preventDefault(); const result = hydrationController.setGoal(Number($("#hydrationGoalInput").value)); $("#hydrationGoalState").textContent = result.ok ? "目标已保存" : result.error; $("#hydrationGoalState").classList.toggle("is-error", !result.ok); });
  $("#hydrationReminderForm").addEventListener("submit", (event) => { event.preventDefault(); const result = hydrationController.updateReminder({ enabled: $("#hydrationReminderEnabled").checked, intervalMinutes: Number($("#hydrationReminderInterval").value), activeStart: $("#hydrationReminderStart").value, activeEnd: $("#hydrationReminderEnd").value }); $("#hydrationReminderState").textContent = result.ok ? "提醒设置已保存" : result.error; $("#hydrationReminderState").classList.toggle("is-error", !result.ok); });
  $("#reflectionForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.reflections[dateKey()] = { did: $("#reflectionDid").value.trim(), learned: $("#reflectionLearned").value.trim(), improve: $("#reflectionImprove").value.trim(), savedAt: new Date().toISOString() };
    store.set("reflections", state.reflections);
    toast("今日复盘已保存到本机");
  });
  document.addEventListener("click", (event) => {
    const toggleTask = event.target.closest("[data-toggle-task]");
    if (toggleTask) {
      const task = state.tasks.find((item) => item.id === toggleTask.dataset.toggleTask);
      if (task) task.done = !task.done;
      store.set("tasks", state.tasks);
      renderPersonalWorkspace();
    }
    const deleteTask = event.target.closest("[data-delete-task]");
    if (deleteTask) savePersonal("tasks", state.tasks.filter((item) => item.id !== deleteTask.dataset.deleteTask));
    const calendarDay = event.target.closest("[data-calendar-date]");
    if (calendarDay) { state.selectedDate = calendarDay.dataset.calendarDate; renderCalendar(); }
    const deleteEvent = event.target.closest("[data-delete-event]");
    if (deleteEvent) {
      state.calendarEvents = state.calendarEvents.filter((item) => item.id !== deleteEvent.dataset.deleteEvent);
      store.set("calendar-events", state.calendarEvents);
      renderCalendar();
    }
    const openFavorite = event.target.closest("[data-open-favorite]");
    if (openFavorite) {
      const item = state.favorites.find((value) => value.id === openFavorite.dataset.openFavorite);
      if (item) api.system.openExternal(item.url);
    }
    const deleteFavorite = event.target.closest("[data-delete-favorite]");
    if (deleteFavorite) savePersonal("favorites", state.favorites.filter((item) => item.id !== deleteFavorite.dataset.deleteFavorite));
    const deleteNote = event.target.closest("[data-delete-note]");
    if (deleteNote) savePersonal("notes", state.notes.filter((item) => item.id !== deleteNote.dataset.deleteNote));
    const removeNoteImage = event.target.closest("[data-remove-note-image]");
    if (removeNoteImage) {
      pendingNoteImages.splice(Number(removeNoteImage.dataset.removeNoteImage), 1);
      renderNoteImagePreview();
    }
    const deleteBook = event.target.closest("[data-delete-book]");
    if (deleteBook) savePersonal("books", state.books.filter((item) => item.id !== deleteBook.dataset.deleteBook));
    const openBook = event.target.closest("[data-open-book]");
    if (openBook) {
      const item = state.books.find((value) => value.id === openBook.dataset.openBook);
      if (item?.path) api.books.open(item.path);
    }
    const revealBook = event.target.closest("[data-reveal-book]");
    if (revealBook) {
      const item = state.books.find((value) => value.id === revealBook.dataset.revealBook);
      if (item?.path) api.books.reveal(item.path);
    }
    const newsItem = event.target.closest("[data-open-news]");
    if (newsItem) {
      newsController.open(Number(newsItem.dataset.openNews)).then((opened) => {
        if (!opened) return;
        syncNewsState();
        store.set("newsReadIds", state.newsReadIds);
        renderNews();
      });
    }
    if (event.target.closest("[data-retry-news]")) fetchNews({ force: true });
  });
}

function initialize() {
  hydrationController.initialize();
  document.body.dataset.pageTone = PAGE_TONES[state.page] || "glacier";
  bindEvents();
  $$('[data-calendar-filter]').forEach((input) => { input.checked = state.calendarFilters[input.dataset.calendarFilter] !== false; });
  configureAnniversaryComposer();
  initializeNotifications();
  setTimeout(() => {
    createWebviews();
    configureWebviews();
  }, 0);
  renderDailyQuote();
  initializeAccount();
  renderShortcuts();
  hydrateShortcutIcons();
  renderCountdowns();
  renderAlarms();
  renderPersonalWorkspace();
  initializeCalendarData();
  syncCountdowns();
  schedulerController?.syncAlarms(state.alarms);
  schedulerController?.start();
  api.island.onCountdownRequest?.(() => syncCountdowns());
  api.island.onWorkspaceRequest?.(() => syncWorkspace());
  api.navigation?.onRequest((page) => setPage(page));
  initializeLocationFilters();
  renderWeatherIslandSettings();
  renderWeather();
  syncNewsState();
  renderNews();
  if (state.weatherSettings.locations.length) fetchWeather(state.weatherSettings.locations);
  fetchNews();
  updateClock();
  initializePerformance();
  updateMedia();
  initializeIsland();
  setInterval(updateClock, 1000);
  setInterval(renderCountdowns, 1000);
  setInterval(updateMedia, 2000);
  setInterval(() => state.weatherSettings.locations.length && fetchWeather(state.weatherSettings.locations), 15 * 60000);
  setInterval(() => fetchNews({ force: true }), 15 * 60000);
  setInterval(() => api.webSessions?.flush().catch(() => {}), 45000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") api.webSessions?.flush().catch(() => {});
  });
}

initialize();
