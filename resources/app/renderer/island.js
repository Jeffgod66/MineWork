"use strict";

const api = window.minework;
const islandStore = { ...(api?.storage?.snapshot || {}) };
const shell = document.getElementById("islandShell");
const pageTrack = document.getElementById("islandPageTrack");
const pageDots = [...document.querySelectorAll("[data-island-page]")];
const pageCount = pageDots.length;
let currentPage = Math.max(0, Math.min(pageCount - 1, Number(islandStore["island-page"]) || 0));
let collapseTimer = null;
let idleTimer = null;
let pageTransitionTimer = null;
let pendingPageIntent = null;
let pendingNotificationDelivery = null;
let activeNotification = null;
let islandTranslationTimer = null;
let mediaState = null;
let performanceState = null;
let workspaceState = { username: "朋友", quote: "慢慢来，你正在成为更好的自己。", tasks: [], taskProgress: { done: 0, total: 0 }, weather: null, weatherLocations: [], primaryWeatherLocationId: null, weatherIslandSettings: { autoRotate: false, rotateSeconds: 8 }, hydration: { amount: 0, goal: 1 }, countdown: null, events: [], bookCount: 0, shortcutCount: 0 };
let islandAiProvider = islandStore["island-ai-provider"] || "chatgpt";
if (islandAiProvider === "gemini") islandAiProvider = "claude";
let islandAiLoaded = "";
const islandAiProviders = {
  chatgpt: { url: "https://chatgpt.com/", partition: "persist:minework-v1-chatgpt" },
  deepseek: { url: "https://chat.deepseek.com/", partition: "persist:minework-v1-deepseek" },
  claude: { url: "https://claude.ai/new", partition: "persist:minework-v1-claude" }
};

const ISLAND_PHASES = Object.freeze({
  COLLAPSED: "collapsed",
  PREPARING: "preparing",
  EXPANDING: "expanding",
  EXPANDED: "expanded",
  COLLAPSING: "collapsing"
});
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const islandTiming = window.mineworkUiModel?.islandMotionTiming(reduceMotion) || { prepare: 0, expand: 1, collapse: 1, page: 1 };
let islandPhase = ISLAND_PHASES.COLLAPSED;
let phaseRun = 0;
let islandLocked = false;
const weatherRotation = window.mineworkUiModel.createWeatherRotationController({ onChange: renderIslandWeather });

function islandIcon(name, className = "") {
  return `<svg class="${className}" aria-hidden="true"><use href="./icon-sprite.svg#${name}"/></svg>`;
}

function escapeIslandText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function waitForPhase(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function currentToolMode() {
  return currentPage === 2 ? "ai" : currentPage === 3 ? "translate" : "";
}

function setIslandPhase(phase) {
  islandPhase = phase;
  document.body.dataset.islandPhase = phase;
  document.body.classList.toggle("expanded", phase !== ISLAND_PHASES.COLLAPSED);
}

async function setExpanded(expanded) {
  clearTimeout(collapseTimer);
  if (expanded) {
    if ([ISLAND_PHASES.PREPARING, ISLAND_PHASES.EXPANDING, ISLAND_PHASES.EXPANDED].includes(islandPhase)) return;
    const run = ++phaseRun;
    const plan = window.mineworkUiModel?.islandPhasePlan(true, reduceMotion) || [ISLAND_PHASES.PREPARING, ISLAND_PHASES.EXPANDING, ISLAND_PHASES.EXPANDED];
    setIslandPhase(plan[0]);
    resetIdleFade();
    if (!reduceMotion) await waitForPhase(islandTiming.prepare);
    if (run !== phaseRun) return;
    api.island.setState(true, currentToolMode());
    if (plan.length > 1) setIslandPhase(ISLAND_PHASES.EXPANDING);
    if (!reduceMotion) await waitForPhase(islandTiming.expand);
    if (run !== phaseRun) return;
    setIslandPhase(ISLAND_PHASES.EXPANDED);
    if (currentPage === 2) activateIslandAi(islandAiProvider);
    return;
  }

  if ([ISLAND_PHASES.COLLAPSED, ISLAND_PHASES.COLLAPSING].includes(islandPhase)) return;
  const run = ++phaseRun;
  unloadIslandAi();
  const plan = window.mineworkUiModel?.islandPhasePlan(false, reduceMotion) || [ISLAND_PHASES.COLLAPSING, ISLAND_PHASES.COLLAPSED];
  setIslandPhase(plan[0]);
  if (!reduceMotion) await waitForPhase(islandTiming.collapse);
  if (run !== phaseRun) return;
  api.island.collapseReady();
  setIslandPhase(ISLAND_PHASES.COLLAPSED);
  resetIdleFade();
}

function resetIdleFade() {
  clearTimeout(idleTimer);
  document.body.classList.remove("idle-dim");
  if (!islandLocked) api.island.setInteraction({ idle: false });
  idleTimer = setTimeout(() => {
    if (!document.body.classList.contains("expanded") && !islandLocked) {
      document.body.classList.add("idle-dim");
      api.island.setInteraction({ idle: true });
    }
  }, 8000);
}

function weatherGlyph(code) {
  if (code === 0) return "sun";
  if ([1, 2].includes(code)) return "cloud-sun";
  if (code === 3 || [45, 48].includes(code)) return "cloud";
  if ([71, 73, 75, 77, 85, 86, 95, 96, 99].includes(code)) return "sparkle";
  return "drop";
}

function renderIslandWeather() {
  const locations = Array.isArray(workspaceState.weatherLocations) ? workspaceState.weatherLocations : [];
  const id = weatherRotation.current() || workspaceState.primaryWeatherLocationId;
  const weather = locations.find((item) => item.id === id) || locations.find((item) => item.isPrimary) || null;
  const index = weather ? locations.findIndex((item) => item.id === weather.id) : -1;
  document.getElementById("overviewWeatherTemp").textContent = weather?.temperature !== null && weather?.temperature !== undefined ? `${weather.temperature}°` : "--°";
  document.getElementById("overviewWeatherGlyph").innerHTML = islandIcon(Number.isFinite(weather?.code) ? weatherGlyph(weather.code) : "cloud-sun");
  document.getElementById("overviewWeatherCity").textContent = weather?.name || "尚未选择城市";
  document.getElementById("overviewWeatherDesc").textContent = weather ? `${weather.status === "stale" ? "上次数据 · " : weather.status === "error" ? "暂不可用 · " : ""}${weather.description}${weather.low !== null ? ` · ${weather.low}° / ${weather.high}°` : ""}` : "在每日天气页设置城市";
  document.getElementById("islandWeatherPosition").textContent = `${index < 0 ? 0 : index + 1} / ${locations.length}`;
  document.getElementById("islandWeatherPrevious").disabled = locations.length <= 1;
  document.getElementById("islandWeatherNext").disabled = locations.length <= 1;
}

function configureIslandWeather() {
  weatherRotation.configure({
    locationIds: (workspaceState.weatherLocations || []).map((item) => item.id),
    primaryId: workspaceState.primaryWeatherLocationId,
    autoRotate: workspaceState.weatherIslandSettings?.autoRotate === true,
    rotateSeconds: workspaceState.weatherIslandSettings?.rotateSeconds || 8
  });
  renderIslandWeather();
}

function renderWorkspace() {
  const progress = workspaceState.taskProgress || { done: 0, total: 0 };
  document.getElementById("overviewGreeting").textContent = `你好，${workspaceState.username || "朋友"}`;
  document.getElementById("islandTaskProgress").textContent = `${progress.done || 0} / ${progress.total || 0}`;
  const taskList = document.getElementById("islandTaskList");
  taskList.innerHTML = workspaceState.tasks?.length ? workspaceState.tasks.slice(0, 3).map((item) => `<p class="${item.done ? "done" : ""}"><i>${item.done ? islandIcon("check") : ""}</i><span>${String(item.text || "").replace(/[&<>]/g, "")}</span></p>`).join("") : `<p>${islandIcon("check-square")}<span>今天还没有待办</span></p>`;
  renderIslandWeather();
  document.getElementById("overviewTaskPulse").textContent = `${progress.done || 0} / ${progress.total || 0}`;
  document.getElementById("overviewHydration").textContent = `${Math.max(0, Number(workspaceState.hydration?.amount) || 0)} / ${Math.max(1, Number(workspaceState.hydration?.goal) || 1)} ml`;
  const countdownSignal = window.mineworkUiModel?.workspaceSignalModel(workspaceState, performanceState, mediaState)?.find((item) => item.kind === "countdown");
  document.getElementById("overviewCountdown").textContent = countdownSignal?.value || "暂无";
  renderNewPages();
  refreshIdleCopy();
}

function renderNewPages() {
  const now = new Date();
  const events = Array.isArray(workspaceState.events) ? workspaceState.events : [];
  document.getElementById("islandScheduleDate").textContent = now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
  document.getElementById("islandScheduleList").innerHTML = events.length
    ? events.slice(0, 3).map((item) => `<p><time>${new Date(item.date).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}</time><span>${escapeIslandText(item.title)}</span></p>`).join("")
    : `<p class="empty-line">${islandIcon("calendar")}<span>今天暂无日程，留一点自由时间。</span></p>`;
  const countdown = workspaceState.countdown;
  const target = countdown ? new Date(countdown.target) : null;
  const remaining = target ? Math.max(0, target.getTime() - now.getTime()) : 0;
  document.getElementById("islandCountdownName").textContent = countdown?.name || "下一个重要时刻";
  document.getElementById("islandCountdownDate").textContent = target && !Number.isNaN(target.getTime()) ? target.toLocaleString("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "尚未创建倒计时";
  document.getElementById("islandCountdownUnits").innerHTML = countdown
    ? `<strong>${Math.floor(remaining / 86400000)}天 ${String(Math.floor((remaining % 86400000) / 3600000)).padStart(2, "0")}时</strong><small>距离目标</small>`
    : `<strong>--</strong><small>等待计划</small>`;
  const progress = workspaceState.taskProgress || { done: 0, total: 0 };
  const taskPercent = progress.total ? Math.round(progress.done / progress.total * 100) : 0;
  const waterPercent = Math.min(100, Math.round((Number(workspaceState.hydration?.amount) || 0) / Math.max(1, Number(workspaceState.hydration?.goal) || 1) * 100));
  document.getElementById("islandFocusTasks").textContent = `${taskPercent}%`;
  document.getElementById("islandFocusWater").textContent = `${waterPercent}%`;
  document.getElementById("islandFocusTime").textContent = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  document.getElementById("islandFocusGreeting").textContent = "轻一点，也能走得更远。";
}

function refreshIdleCopy() {
  const primary = document.getElementById("islandPrimary");
  const secondary = document.getElementById("islandSecondary");
  const orb = document.getElementById("islandMediaOrb");
  const progress = workspaceState.taskProgress || { done: 0, total: 0 };
  const pageData = [
    [`你好，${workspaceState.username || "朋友"}`, workspaceState.weather ? `${workspaceState.weather.city} ${workspaceState.weather.temperature}° · ${workspaceState.weather.description}` : "今日从容前行", workspaceState.weather ? weatherGlyph(workspaceState.weather.code) : "house"],
    ["今日待办", `${progress.done || 0} / ${progress.total || 0} 已完成`, "check-square"],
    ["AI 对话", `${islandAiProvider === "deepseek" ? "DeepSeek" : islandAiProvider === "claude" ? "Claude" : "ChatGPT"} · 直接提问`, "sparkle"],
    ["即时翻译", "自动识别 · 多语言互译", "translate"],
    [mediaState?.isAvailable ? mediaState.title || "未知曲目" : "等待音乐播放", mediaState?.isAvailable ? mediaState.artist || "未知艺术家" : "Windows 媒体会话", mediaState?.playbackStatus === "playing" ? "pause" : "music-notes"],
    [`CPU ${Math.round(performanceState?.cpu?.usage || 0)}%`, `内存 ${Math.round(performanceState?.memory?.usage || 0)}% · 磁盘 ${Math.round(performanceState?.disk?.usage || 0)}%`, "gauge"],
    ["MineWork 快捷入口", "天气 · 资讯 · 日历 · 书架", "rocket-launch"],
    ["今日日程", `${workspaceState.events?.length || 0} 项安排`, "calendar"],
    [workspaceState.countdown?.name || "倒计时", workspaceState.countdown ? "重要时刻正在靠近" : "尚未创建计划", "timer"],
    ["专注概览", `${progress.done || 0} / ${progress.total || 0} 待办`, "target"]
  ][currentPage];
  primary.textContent = pageData[0];
  secondary.textContent = pageData[1];
  orb.innerHTML = islandIcon(pageData[2]);
}

function finishPageTransition() {
  clearTimeout(pageTransitionTimer);
  pageTransitionTimer = null;
  pageTrack.classList.remove("is-transitioning");
  pageTrack.dataset.direction = "none";
  if (pendingPageIntent !== null) {
    const target = pendingPageIntent;
    pendingPageIntent = null;
    showPage(target);
    return;
  }
  if (pendingNotificationDelivery) {
    const delivery = pendingNotificationDelivery;
    pendingNotificationDelivery = null;
    showNotificationDelivery(delivery);
  }
}

function showPage(index, direction = "none", initial = false) {
  const previousPage = currentPage;
  currentPage = window.mineworkUiModel?.wrapIndex(index, pageCount) ?? ((index + pageCount) % pageCount);
  if (currentPage === previousPage && !initial) return;
  if (previousPage === 2 && currentPage !== 2) unloadIslandAi();
  islandStore["island-page"] = currentPage;
  api.storage?.set("island-page", currentPage);
  pageTrack.dataset.direction = initial ? "none" : direction;
  pageTrack.classList.toggle("is-transitioning", !initial);
  pageTrack.style.transform = `translateX(-${currentPage * 100}%)`;
  pageDots.forEach((dot, page) => dot.classList.toggle("active", page === currentPage));
  document.body.classList.toggle("tool-ai", currentPage === 2);
  document.body.classList.toggle("tool-translate", currentPage === 3);
  if (islandPhase === ISLAND_PHASES.EXPANDED) {
    api.island.setState(true, currentToolMode());
    if (currentPage === 2) activateIslandAi(islandAiProvider);
  }
  renderNewPages();
  refreshIdleCopy();
  if (!initial) {
    clearTimeout(pageTransitionTimer);
    pageTransitionTimer = setTimeout(finishPageTransition, islandTiming.page);
  }
}

function unloadIslandAi() {
  const host = document.getElementById("islandAiHost");
  host?.querySelector("webview")?.remove();
  islandAiLoaded = "";
  const loading = document.getElementById("islandAiLoading");
  if (loading) {
    loading.textContent = "选择此页面后加载 AI，可以直接在灵动岛中提问。";
    loading.classList.remove("hidden");
  }
  api.webSessions?.flush().catch(() => {});
}

function switchPageByWheel(deltaY, deltaX = 0) {
  const intent = window.mineworkUiModel?.islandPageIntent(currentPage, pageTransitionTimer ? currentPage : null, deltaY, deltaX, pageCount);
  if (!intent || intent.direction === "none") return;
  resetIdleFade();
  if (pageTransitionTimer) {
    pendingPageIntent = intent.pending;
    return;
  }
  showPage(intent.target, intent.direction);
  setExpanded(true);
}

function hideNotificationOverlay() {
  const overlay = document.getElementById("islandNotificationOverlay");
  overlay.classList.remove("visible");
  overlay.setAttribute("aria-hidden", "true");
  activeNotification = null;
}

function showNotificationDelivery(delivery = {}) {
  if (pageTransitionTimer) {
    pendingNotificationDelivery = delivery;
    return;
  }
  const record = delivery.record && typeof delivery.record === "object" ? delivery.record : null;
  if (!record?.id) return;
  activeNotification = record;
  document.getElementById("islandNotificationTitle").textContent = String(record.title || "MineWork 通知");
  document.getElementById("islandNotificationBody").textContent = String(record.body || "");
  document.getElementById("islandNotificationUnread").textContent = String(Math.max(0, Number(delivery.unreadCount) || 0));
  const overlay = document.getElementById("islandNotificationOverlay");
  overlay.classList.add("visible");
  overlay.setAttribute("aria-hidden", "false");
}

function activateIslandAi(provider) {
  const config = islandAiProviders[provider] || islandAiProviders.chatgpt;
  islandAiProvider = islandAiProviders[provider] ? provider : "chatgpt";
  islandStore["island-ai-provider"] = islandAiProvider;
  api.storage?.set("island-ai-provider", islandAiProvider);
  document.querySelectorAll("[data-island-ai]").forEach((button) => button.classList.toggle("active", button.dataset.islandAi === islandAiProvider));
  if (islandAiLoaded === islandAiProvider) return;
  const host = document.getElementById("islandAiHost");
  const loading = document.getElementById("islandAiLoading");
  host.querySelector("webview")?.remove();
  const webview = document.createElement("webview");
  webview.id = "islandAiWebview";
  webview.setAttribute("partition", config.partition);
  webview.setAttribute("webpreferences", "javascript=yes, contextIsolation=yes, nodeIntegration=no, sandbox=yes, backgroundThrottling=no");
  webview.setAttribute("allowpopups", "");
  webview.setAttribute("preload", api.system.islandWebviewPreload);
  host.appendChild(webview);
  loading.classList.remove("hidden");
  loading.textContent = `正在载入 ${islandAiProvider === "deepseek" ? "DeepSeek" : islandAiProvider === "claude" ? "Claude" : "ChatGPT"}…`;
  webview.addEventListener("dom-ready", () => loading.classList.add("hidden"));
  webview.addEventListener("did-fail-load", (event) => {
    if (event.errorCode === -3) return;
    loading.textContent = "AI 服务暂时无法载入，请检查网络后重试。";
    loading.classList.remove("hidden");
  });
  webview.addEventListener("ipc-message", (event) => {
    if (event.channel !== "minework:island-wheel") return;
    const payload = event.args?.[0] || {};
    switchPageByWheel(payload.deltaY, payload.deltaX);
  });
  webview.addEventListener("did-stop-loading", () => api.webSessions?.flush().catch(() => {}));
  webview.src = config.url;
  islandAiLoaded = islandAiProvider;
  refreshIdleCopy();
}

async function runIslandTranslation() {
  const text = document.getElementById("islandSourceText").value.trim();
  const status = document.getElementById("islandTranslateStatus");
  const output = document.getElementById("islandTranslatedText");
  if (!text) {
    status.textContent = "等待输入";
    output.textContent = "翻译结果会显示在这里。";
    return;
  }
  status.textContent = "正在联网翻译…";
  const result = await api.translate({
    text,
    source: document.getElementById("islandSourceLanguage").value,
    target: document.getElementById("islandTargetLanguage").value
  });
  if (result?.ok) {
    output.textContent = result.translated;
    status.textContent = result.detected ? `完成 · 识别为 ${result.detected}` : "翻译完成";
  } else {
    output.textContent = result?.error || "翻译服务暂时不可用";
    status.textContent = "翻译失败";
  }
}

function updateClock() {
  const now = new Date();
  const time = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  document.getElementById("islandTime").textContent = time;
  document.getElementById("islandDate").textContent = now.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric", weekday: "short" });
  document.getElementById("overviewTime").textContent = time;
  document.getElementById("overviewDate").textContent = now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
  if (now.getSeconds() === 0 && workspaceState.countdown) renderWorkspace();
}

function mediaImage(info) {
  const thumbnail = info?.thumbnail;
  if (!thumbnail) return "";
  if (typeof thumbnail === "string") return /^(data:|https?:|blob:)/.test(thumbnail) ? thumbnail : `data:image/jpeg;base64,${thumbnail}`;
  return thumbnail.data ? `data:${thumbnail.contentType || "image/jpeg"};base64,${thumbnail.data}` : "";
}

async function updateMedia() {
  try {
    const info = await api.media.status();
    mediaState = info;
    const available = Boolean(info?.isAvailable);
    const playing = info?.playbackStatus === "playing";
    document.getElementById("islandTrack").textContent = available ? info.title || "未知曲目" : "等待音乐播放";
    document.getElementById("islandArtist").textContent = available ? info.artist || info.albumArtist || "未知艺术家" : "Windows 媒体会话";
    document.getElementById("islandPlay").innerHTML = islandIcon(playing ? "pause" : "play");
    const art = document.getElementById("islandArt");
    const image = mediaImage(info);
    art.innerHTML = image ? `<img src="${image}" alt="" />` : islandIcon("music-notes");
    if (currentPage === 4) refreshIdleCopy();
  } catch {}
}

async function updatePerformance(snapshot) {
  try {
    const data = snapshot || await api.system.performance();
    performanceState = data;
    [["Cpu", data.cpu.usage], ["Memory", data.memory.usage], ["Disk", data.disk.usage]].forEach(([name, raw]) => {
      const value = Math.round(raw || 0);
      document.getElementById(`island${name}`).textContent = `${value}%`;
      document.getElementById(`island${name}Bar`).style.width = `${value}%`;
    });
    renderNewPages();
    if (currentPage === 5) refreshIdleCopy();
  } catch {}
}

shell.addEventListener("mouseenter", () => setExpanded(true));
shell.addEventListener("mouseenter", () => weatherRotation.pause("hover"));
window.addEventListener("mousemove", () => {
  if (document.body.classList.contains("idle-dim") && !islandLocked) resetIdleFade();
}, { passive: true });
shell.addEventListener("mouseleave", () => {
  collapseTimer = setTimeout(() => setExpanded(false), 420);
  weatherRotation.resume("hover");
});
shell.addEventListener("focusin", () => weatherRotation.pause("focus"));
shell.addEventListener("focusout", () => weatherRotation.resume("focus"));
shell.addEventListener("dblclick", () => api.island.openMain("home"));
window.addEventListener("wheel", (event) => {
  event.preventDefault();
  switchPageByWheel(event.deltaY, event.deltaX);
}, { capture: true, passive: false });
pageDots.forEach((dot) => dot.addEventListener("click", (event) => {
  event.stopPropagation();
  const target = Number(dot.dataset.islandPage);
  const direction = target > currentPage ? "next" : target < currentPage ? "previous" : "none";
  if (pageTransitionTimer) pendingPageIntent = target;
  else showPage(target, direction);
  resetIdleFade();
}));
document.querySelectorAll("[data-notification-action]").forEach((button) => button.addEventListener("click", async (event) => {
  event.stopPropagation();
  if (!activeNotification?.id) return;
  const action = button.dataset.notificationAction;
  if (action === "open") await api.notifications.open(activeNotification.id);
  if (action === "dismiss") await api.notifications.dismiss(activeNotification.id);
  if (action === "open") await api.notifications.markRead(activeNotification.id);
  hideNotificationOverlay();
}));
document.querySelectorAll("[data-open-page]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); api.island.openMain(button.dataset.openPage); }));
document.querySelectorAll("[data-island-ai]").forEach((button) => button.addEventListener("click", (event) => {
  event.stopPropagation();
  activateIslandAi(button.dataset.islandAi);
}));
document.getElementById("islandTranslateButton").addEventListener("click", (event) => { event.stopPropagation(); runIslandTranslation(); });
document.getElementById("islandWeatherPrevious").addEventListener("click", (event) => { event.stopPropagation(); weatherRotation.previous(); });
document.getElementById("islandWeatherNext").addEventListener("click", (event) => { event.stopPropagation(); weatherRotation.next(); });
document.getElementById("islandSourceText").addEventListener("input", () => {
  clearTimeout(islandTranslationTimer);
  islandTranslationTimer = setTimeout(runIslandTranslation, 700);
});
document.getElementById("islandSourceText").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    runIslandTranslation();
  }
});
[document.querySelector(".translate-tool-slide"), document.querySelector(".ai-tool-slide")].forEach((slide) => {
  slide.addEventListener("dblclick", (event) => event.stopPropagation());
});
document.getElementById("islandCopyTranslation").addEventListener("click", async (event) => {
  event.stopPropagation();
  const value = document.getElementById("islandTranslatedText").textContent;
  if (value && value !== "翻译结果会显示在这里。") await navigator.clipboard.writeText(value);
});
document.getElementById("islandHide").addEventListener("click", (event) => { event.stopPropagation(); api.island.setVisible(false); });
document.getElementById("islandLock").addEventListener("click", async (event) => {
  event.stopPropagation();
  await api.island.setLocked(true);
});
document.querySelectorAll("[data-island-media]").forEach((button) => button.addEventListener("click", async (event) => {
  event.stopPropagation();
  let action = button.dataset.islandMedia;
  if (action === "play-toggle") action = mediaState?.playbackStatus === "playing" ? "pause" : "play";
  await api.media.control(action);
  setTimeout(updateMedia, 180);
}));

api.island.onWorkspace((payload) => { workspaceState = { ...workspaceState, ...payload }; configureIslandWeather(); renderWorkspace(); });
api.island.getSettings().then((settings) => {
  islandLocked = settings?.locked === true;
  document.body.classList.toggle("island-locked", islandLocked);
  document.getElementById("islandLock").classList.toggle("active", islandLocked);
}).catch(() => {});
api.island.onSettingsChanged((settings) => {
  islandLocked = settings?.locked === true;
  document.body.classList.toggle("island-locked", islandLocked);
  document.getElementById("islandLock").classList.toggle("active", islandLocked);
  if (islandLocked) clearTimeout(idleTimer);
  else resetIdleFade();
});
api.island.onWake(() => resetIdleFade());
api.notifications.onDelivery?.(showNotificationDelivery);
document.addEventListener("visibilitychange", () => document.hidden ? weatherRotation.pause("document") : weatherRotation.resume("document"));
window.addEventListener("beforeunload", () => weatherRotation.dispose());
document.querySelectorAll("[data-island-ai]").forEach((button) => button.classList.toggle("active", button.dataset.islandAi === islandAiProvider));
setIslandPhase(ISLAND_PHASES.COLLAPSED);
showPage(currentPage, "none", true);
updateClock();
updateMedia();
api.system.performance().then(updatePerformance).catch(() => {});
api.system.onPerformanceChanged?.(updatePerformance);
renderWorkspace();
api.island.requestWorkspace();
resetIdleFade();
setInterval(updateClock, 1000);
setInterval(updateMedia, 2200);
