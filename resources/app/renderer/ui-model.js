"use strict";

(function attachMineWorkUiModel(factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.mineworkUiModel = api;
})(function createMineWorkUiModel() {
  function cloneMutableSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return {};
    try {
      return JSON.parse(JSON.stringify(snapshot));
    } catch {
      return {};
    }
  }

  function responsiveLayoutBand(width) {
    const value = Math.max(0, Number(width) || 0);
    if (value >= 1360) return "wide";
    if (value >= 1080) return "standard";
    if (value >= 840) return "compact";
    return "narrow";
  }

  function finiteNumber(value) {
    if (value === null || typeof value === "undefined" || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function percentage(value) {
    const numeric = finiteNumber(value);
    return numeric === null ? null : Math.min(100, Math.max(0, Math.round(numeric)));
  }

  function bytesText(value) {
    const numeric = finiteNumber(value);
    if (numeric === null || numeric < 0) return null;
    const units = ["B", "KB", "MB", "GB", "TB"];
    let amount = numeric;
    let unit = 0;
    while (amount >= 1024 && unit < units.length - 1) {
      amount /= 1024;
      unit += 1;
    }
    return `${unit >= 3 ? amount.toFixed(1) : Math.round(amount)} ${units[unit]}`;
  }

  function uptimeText(seconds) {
    const value = finiteNumber(seconds);
    if (value === null || value < 0) return "不适用";
    const days = Math.floor(value / 86400);
    const hours = Math.floor((value % 86400) / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    if (days) return `${days} 天 ${hours} 小时`;
    if (hours) return `${hours} 小时 ${minutes} 分钟`;
    return `${minutes} 分钟`;
  }

  function timeLabel(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "等待更新";
    return `${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} 更新`;
  }

  function performanceViewModel(payload = {}, now = new Date()) {
    const cpuUsage = percentage(payload.cpu?.usage);
    const memoryUsage = percentage(payload.memory?.usage);
    const diskUsage = percentage(payload.disk?.usage);
    const speedMHz = finiteNumber(payload.cpu?.speedMHz);
    const physicalCores = finiteNumber(payload.cpu?.physicalCores);
    const logicalCores = finiteNumber(payload.cpu?.logicalCores ?? payload.cpu?.cores);
    const memoryTotal = bytesText(payload.memory?.total);
    const memoryFree = bytesText(payload.memory?.free);
    const diskTotal = bytesText(payload.disk?.total);
    const diskFree = bytesText(payload.disk?.free);
    const gpuMemory = bytesText(payload.gpu?.memory);
    const bootDate = payload.system?.bootTime ? new Date(payload.system.bootTime) : null;
    const sampledAt = payload.sampledAt || (now instanceof Date ? now.toISOString() : now);

    return {
      cpu: {
        usage: cpuUsage,
        usageText: cpuUsage === null ? "--" : `${cpuUsage}%`,
        modelText: String(payload.cpu?.model || "正在识别处理器"),
        speedText: speedMHz && speedMHz > 0 ? `${(speedMHz / 1000).toFixed(2)} GHz` : "不适用",
        topologyText: physicalCores && logicalCores ? `${physicalCores} 核 / ${logicalCores} 线程` : logicalCores ? `${logicalCores} 线程` : "正在识别"
      },
      memory: {
        usage: memoryUsage,
        usageText: memoryUsage === null ? "--" : `${memoryUsage}%`,
        totalText: memoryTotal ? `${memoryTotal} 总计` : "不适用",
        availableText: memoryFree ? `${memoryFree} 可用` : "不适用",
        usedText: memoryTotal && memoryFree ? `${bytesText(Number(payload.memory.total) - Number(payload.memory.free))} / ${memoryTotal} 已使用` : "不适用"
      },
      disk: {
        usage: diskUsage,
        usageText: diskUsage === null ? "--" : `${diskUsage}%`,
        rootText: payload.disk?.root ? `${payload.disk.root} 系统磁盘` : "系统磁盘",
        totalText: diskTotal ? `${diskTotal} 总计` : "不适用",
        freeText: diskFree ? `${diskFree} 剩余` : "不适用",
        usedText: diskTotal && diskFree ? `${bytesText(Number(payload.disk.total) - Number(payload.disk.free))} / ${diskTotal} 已使用` : "不适用"
      },
      gpu: {
        nameText: String(payload.gpu?.name || "正在识别 GPU"),
        memoryText: gpuMemory ? `${gpuMemory} 显存` : "不适用"
      },
      system: {
        osText: String(payload.system?.caption || payload.system?.version || "正在识别"),
        versionText: String(payload.system?.version || "不适用"),
        archText: String(payload.system?.arch || "不适用"),
        hostText: String(payload.system?.hostname || "不适用"),
        bootText: bootDate && !Number.isNaN(bootDate.getTime()) ? bootDate.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "不适用",
        uptimeText: uptimeText(payload.uptime)
      },
      updatedLabel: timeLabel(sampledAt)
    };
  }

  function wrapIndex(index, length) {
    const size = Math.max(0, Math.trunc(Number(length) || 0));
    if (!size) return 0;
    const value = Math.trunc(Number(index) || 0);
    return ((value % size) + size) % size;
  }

  function quoteIndexForDate(dateText, length) {
    const seed = [...String(dateText || "")].reduce(
      (sum, character) => ((sum * 31) + character.charCodeAt(0)) >>> 0,
      17
    );
    return wrapIndex(seed, length);
  }

  function bookCoverShift(title) {
    const seed = [...String(title || "书")].reduce((sum, character) => sum + character.charCodeAt(0), 0);
    return wrapIndex(seed, 4);
  }

  function shortcutKind(item = {}) {
    if (item.kind === "folder") return "folder";
    const filePath = String(item.path || "").toLowerCase();
    if (/\.(exe|lnk|appref-ms|bat|cmd|com)$/i.test(filePath)) return "app";
    if (/\.(pdf|epub|mobi|docx?|xlsx?|pptx?|txt|md|rtf|csv|json)$/i.test(filePath)) return "document";
    return item.kind === "app" ? "app" : "document";
  }

  function nextIslandPage(currentPage, pageCount, deltaY, deltaX) {
    const primaryDelta = Math.abs(Number(deltaY) || 0) >= Math.abs(Number(deltaX) || 0)
      ? Number(deltaY) || 0
      : Number(deltaX) || 0;
    if (!primaryDelta) return wrapIndex(currentPage, pageCount);
    return wrapIndex(Number(currentPage) + (primaryDelta > 0 ? 1 : -1), pageCount);
  }

  function islandPhasePlan(expand, reduceMotion) {
    if (reduceMotion) return [expand ? "expanded" : "collapsed"];
    return expand
      ? ["preparing", "expanding", "expanded"]
      : ["collapsing", "collapsed"];
  }

  function pageTransitionPlan(reduceMotion) {
    return reduceMotion
      ? { exit: 0, enter: 1, stagger: 0 }
      : { exit: 0, enter: 180, stagger: 14 };
  }

  function normalizeNoteImages(images, limit = 3) {
    const maximum = Math.max(0, Math.trunc(Number(limit) || 0));
    return (Array.isArray(images) ? images : [])
      .filter((image) => typeof image === "string" && /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(image))
      .slice(0, maximum);
  }

  function noteCardLayout(images) {
    const count = normalizeNoteImages(images).length;
    return count >= 3 ? "mosaic" : count === 2 ? "duo" : count === 1 ? "single" : "text";
  }

  function localDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function calendarDayMeta(day, tasks = [], events = []) {
    const dayTasks = (Array.isArray(tasks) ? tasks : []).filter((item) => item?.date === day);
    const dayEvents = (Array.isArray(events) ? events : [])
      .filter((item) => localDateKey(item?.date) === day)
      .sort((left, right) => new Date(left.date) - new Date(right.date));
    const firstEvent = dayEvents[0];
    const firstEventDate = firstEvent ? new Date(firstEvent.date) : null;
    return {
      taskCount: dayTasks.length,
      openTaskCount: dayTasks.filter((item) => !item.done).length,
      eventCount: dayEvents.length,
      firstEventTitle: String(firstEvent?.title || ""),
      firstEventTime: firstEventDate && !Number.isNaN(firstEventDate.getTime())
        ? `${String(firstEventDate.getHours()).padStart(2, "0")}:${String(firstEventDate.getMinutes()).padStart(2, "0")}`
        : ""
    };
  }

  function calendarSignalVisibility(filters = {}, signals = {}) {
    const hasDetailedHolidays = ["officialHoliday", "traditionalFestival", "internationalDate"].some((key) => Object.prototype.hasOwnProperty.call(signals, key));
    const officialHoliday = filters.officialHolidays !== false && signals.officialHoliday === true;
    const traditionalFestival = filters.traditionalFestivals !== false && signals.traditionalFestival === true;
    const internationalDate = filters.internationalDates !== false && signals.internationalDate === true;
    const result = {
      event: filters.events !== false && Number(signals.eventCount) > 0,
      task: filters.tasks !== false && Number(signals.taskCount) > 0,
      holiday: filters.holidays !== false && (signals.holiday === true || officialHoliday || traditionalFestival || internationalDate),
      anniversary: filters.anniversaries !== false && signals.anniversary === true
    };
    return hasDetailedHolidays ? { event: result.event, task: result.task, officialHoliday, traditionalFestival, internationalDate, holiday: result.holiday, anniversary: result.anniversary } : result;
  }

  function anniversaryComposerOptions(calendar) {
    return calendar === "lunar"
      ? { recurrences: ["once", "yearly"], showLeapMonth: true, dateInputType: "text", datePlaceholder: "农历 YYYY-MM-DD（允许二月三十）" }
      : { recurrences: ["once", "monthly", "yearly"], showLeapMonth: false, dateInputType: "date", datePlaceholder: "" };
  }

  function islandMotionTiming(reduceMotion) {
    return reduceMotion
      ? { prepare: 0, expand: 1, collapse: 1, page: 1 }
      : { prepare: 40, expand: 380, collapse: 340, page: 240 };
  }

  function islandPageIntent(current, pending, deltaY, deltaX, count) {
    const size = Math.max(0, Math.floor(Number(count) || 0));
    if (!size) return { target: 0, pending: null, direction: "none", delta: 0 };
    const safeCurrent = wrapIndex(Number(current) || 0, size);
    const axis = Math.abs(Number(deltaY) || 0) >= Math.abs(Number(deltaX) || 0)
      ? Number(deltaY) || 0
      : Number(deltaX) || 0;
    if (Math.abs(axis) < 2) {
      const retained = pending === null || pending === undefined ? null : {
        target: wrapIndex(typeof pending === "object" ? pending.target : pending, size),
        direction: typeof pending === "object" && ["next", "previous"].includes(pending.direction) ? pending.direction : "none"
      };
      return { target: safeCurrent, pending: retained, direction: "none", delta: 0 };
    }
    const delta = axis > 0 ? 1 : -1;
    const direction = delta > 0 ? "next" : "previous";
    if (pending !== null && pending !== undefined) {
      return { target: safeCurrent, pending: { target: wrapIndex(safeCurrent + delta, size), direction }, direction, delta };
    }
    return { target: wrapIndex(safeCurrent + delta, size), pending: null, direction, delta };
  }

  function islandAttentionPolicy({ locked = false, attentionActive = false, wasIdle = false } = {}) {
    if (locked) return { interaction: "preserve", restoreIdle: wasIdle === true };
    if (attentionActive) return { interaction: "active", restoreIdle: wasIdle === true };
    if (wasIdle) return { interaction: "idle", restoreIdle: false };
    return { interaction: "schedule", restoreIdle: false };
  }

  function islandInteractionModel({ locked = false, idle = false, expanded = false } = {}) {
    if (locked) return { ignored: true, opacity: 0.3, mode: "locked" };
    if (idle && !expanded) return { ignored: true, opacity: 0.3, mode: "idle" };
    return { ignored: false, opacity: 1, mode: "active" };
  }

  function hydrationMotionProjection({ amount = 0, goal = 1, mutation = "render", goalCrossed = false, reduceMotion = false } = {}) {
    const safeGoal = Math.max(1, Number(goal) || 1);
    const level = Math.min(100, Math.max(0, Math.round((Math.max(0, Number(amount) || 0) / safeGoal) * 100)));
    const isAdd = mutation === "add";
    return {
      level,
      waterTransform: `translateY(${100 - level}%)`,
      bubbles: !reduceMotion && isAdd,
      ripple: !reduceMotion && isAdd && goalCrossed === true,
      instant: reduceMotion === true
    };
  }

  function workspaceSignalModel(workspaceState = {}, performanceState = {}, mediaState = null, now = new Date()) {
    const progress = workspaceState.taskProgress || {};
    const hydration = workspaceState.hydration || {};
    const countdown = workspaceState.countdown || null;
    const signals = [
      {
        kind: "tasks",
        icon: "check-square",
        label: "待办",
        value: `${Math.max(0, Number(progress.done) || 0)} / ${Math.max(0, Number(progress.total) || 0)}`
      },
      {
        kind: "hydration",
        icon: "drop",
        label: "饮水",
        value: `${Math.max(0, Number(hydration.amount) || 0)} / ${Math.max(1, Number(hydration.goal) || 1)} ml`
      }
    ];

    if (countdown?.target) {
      const remaining = new Date(countdown.target).getTime() - new Date(now).getTime();
      if (Number.isFinite(remaining) && remaining > 0) {
        const minutes = Math.ceil(remaining / 60000);
        const value = minutes > 1440
          ? `${Math.ceil(minutes / 1440)}天`
          : minutes >= 60
            ? `${Math.ceil(minutes / 60)}小时`
            : `${minutes}分钟`;
        signals.push({ kind: "countdown", icon: "timer", label: String(countdown.name || "倒计时"), value });
      }
    }

    const cpuUsage = Math.max(0, Math.round(Number(performanceState?.cpu?.usage) || 0));
    const memoryUsage = Math.max(0, Math.round(Number(performanceState?.memory?.usage) || 0));
    signals.push({ kind: "performance", icon: "gauge", label: `内存 ${memoryUsage}%`, value: `CPU ${cpuUsage}%` });

    if (mediaState?.isAvailable) {
      signals.push({ kind: "media", icon: "music-notes", label: String(mediaState.artist || "正在播放"), value: String(mediaState.title || "未知曲目") });
    }
    signals.push(
      { kind: "library", icon: "books", label: "书架", value: `${Math.max(0, Number(workspaceState.bookCount) || 0)} 本` },
      { kind: "shortcuts", icon: "rocket-launch", label: "快捷", value: `${Math.max(0, Number(workspaceState.shortcutCount) || 0)} 个` }
    );
    return signals;
  }

  function weatherWorkspaceProjection({ weatherSettings = {}, weatherResults = {}, describeWeather = () => "" } = {}) {
    const locations = Array.isArray(weatherSettings.locations) ? weatherSettings.locations : [];
    const byId = new Map(locations.map((location) => [location.id, location]));
    const order = Array.isArray(weatherSettings.order) ? weatherSettings.order.filter((id, index, ids) => byId.has(id) && ids.indexOf(id) === index) : [];
    for (const location of locations) if (!order.includes(location.id)) order.push(location.id);
    const primaryWeatherLocationId = order.includes(weatherSettings.primaryLocationId) ? weatherSettings.primaryLocationId : order[0] || null;
    const weatherLocations = order.map((id) => {
      const saved = byId.get(id);
      const result = weatherResults[id] || {};
      const current = result.current || {};
      const daily = result.daily || {};
      return {
        id,
        name: saved.district || saved.city || saved.province || saved.country || result.location?.name || "未知位置",
        isPrimary: id === primaryWeatherLocationId,
        status: result.status || "loading",
        temperature: Number.isFinite(current.temperature_2m) ? Math.round(current.temperature_2m) : null,
        description: Number.isFinite(current.weather_code) ? describeWeather(current.weather_code) : "等待天气数据",
        code: Number.isFinite(current.weather_code) ? current.weather_code : null,
        high: Number.isFinite(daily.temperature_2m_max?.[0]) ? Math.round(daily.temperature_2m_max[0]) : null,
        low: Number.isFinite(daily.temperature_2m_min?.[0]) ? Math.round(daily.temperature_2m_min[0]) : null,
        updatedAt: result.updatedAt || null
      };
    });
    const primary = weatherLocations.find((item) => item.id === primaryWeatherLocationId);
    return {
      weatherLocations,
      primaryWeatherLocationId,
      weatherIslandSettings: {
        autoRotate: weatherSettings.islandAutoRotate === true,
        rotateSeconds: Math.max(5, Math.min(60, Number(weatherSettings.islandRotateSeconds) || 8))
      },
      weather: primary && primary.temperature !== null ? { city: primary.name, temperature: primary.temperature, description: primary.description, code: primary.code, high: primary.high, low: primary.low, updatedAt: primary.updatedAt } : null
    };
  }

  function createWeatherRotationController({ setTimer = setTimeout, clearTimer = clearTimeout, interactionGraceMs = 3000, onChange = () => {} } = {}) {
    let ids = [];
    let selected = null;
    let autoRotate = false;
    let intervalMs = 8000;
    let timer = null;
    const pauses = new Set();
    const clear = () => { if (timer !== null) clearTimer(timer); timer = null; };
    const emit = () => { onChange(selected); return selected; };
    const schedule = (delay = intervalMs) => {
      clear();
      if (!autoRotate || ids.length <= 1 || pauses.size) return;
      timer = setTimer(() => { timer = null; next(false); }, delay);
    };
    const step = (delta, manual) => {
      if (!ids.length) return null;
      selected = ids[wrapIndex(ids.indexOf(selected) + delta, ids.length)];
      emit();
      schedule(manual ? interactionGraceMs : intervalMs);
      return selected;
    };
    const next = (manual = true) => step(1, manual);
    return Object.freeze({
      configure(config = {}) {
        clear();
        ids = Array.isArray(config.locationIds) ? config.locationIds.filter((id, index, values) => id && values.indexOf(id) === index) : [];
        selected = ids.includes(config.primaryId) ? config.primaryId : ids[0] || null;
        autoRotate = config.autoRotate === true;
        intervalMs = Math.max(5, Math.min(60, Number(config.rotateSeconds) || 8)) * 1000;
        schedule();
        return selected;
      },
      current: () => selected,
      next,
      previous: () => step(-1, true),
      select(id) { if (ids.includes(id)) { selected = id; emit(); schedule(interactionGraceMs); } return selected; },
      pause(reason = "manual") { pauses.add(reason); clear(); },
      resume(reason = "manual") { pauses.delete(reason); schedule(interactionGraceMs); },
      isPaused: () => pauses.size > 0,
      dispose() { clear(); pauses.clear(); ids = []; selected = null; }
    });
  }

  return {
    cloneMutableSnapshot,
    responsiveLayoutBand,
    performanceViewModel,
    wrapIndex,
    quoteIndexForDate,
    bookCoverShift,
    shortcutKind,
    nextIslandPage,
    islandPhasePlan,
    pageTransitionPlan,
    normalizeNoteImages,
    noteCardLayout,
    calendarDayMeta,
    calendarSignalVisibility,
    anniversaryComposerOptions,
    islandMotionTiming,
    islandPageIntent,
    islandAttentionPolicy,
    islandInteractionModel,
    hydrationMotionProjection,
    workspaceSignalModel,
    weatherWorkspaceProjection,
    createWeatherRotationController
  };
});
