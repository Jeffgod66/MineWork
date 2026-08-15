"use strict";

const { app, BrowserWindow, Menu, Notification, Tray, dialog, globalShortcut, ipcMain, nativeImage, net, powerMonitor, screen, session, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFile, spawn } = require("node:child_process");
const { parseWindowsSystemProfile } = require("./system-profile");
const { createNotificationStore } = require("./notifications/notification-store");
const { createNotificationService, validateNotificationId, validateNotificationFilter, validateSettingsPatch, isTrustedNotificationEvent } = require("./notifications/notification-service");
const { createScheduler, validateCountdowns, validateAlarms, isTrustedWorkspaceEvent } = require("./notifications/notification-scheduler");
const { createPerformanceMonitor } = require("./notifications/performance-monitor");
const { createWorkspaceMutationHandlers } = require("./notifications/notification-runtime");
const { createMailBaselineRuntime } = require("./mail-runtime");
const { createMailMainBridge } = require("./mail-integration");
const { createWeatherService } = require("./weather-service");
const { createNewsService } = require("./news-service");
const { normalizeAnniversary, validateHolidaySnapshot } = require("./calendar-model");
const { normalizeHydration } = require("./hydration-model");
const { buildHolidayReminders } = require("./holiday-reminders");
const { readJsonObject, writeJsonAtomic } = require("./atomic-json-store");

const APP_ID = "com.minework.desktop";
const WINDOW_SIZE = { width: 1180, height: 760 };
const APP_ROOT = __dirname;
const ASSET_ROOT = path.join(APP_ROOT, "assets");
const MAIL_PROVIDERS = Object.freeze(["gmail", "outlook", "netease", "qqmail"]);
const BUNDLED_CALENDAR_DATA = Object.freeze({
  china: validateHolidaySnapshot(require("./assets/holidays/cn-2026.json"), 2026),
  international: require("./assets/holidays/international.json")
});
let mainWindow = null;
let splashWindow = null;
let islandWindow = null;
let islandExpanded = false;
let islandToolMode = "";
let islandIdle = false;
let islandShortcutAvailable = true;
let tray = null;
let isQuitting = false;
let pendingWindowReveal = false;
let cpuPrevious = null;
let performanceSnapshot = null;
let systemProfileCache = { at: 0, value: parseWindowsSystemProfile(null, { arch: os.arch(), hostname: os.hostname() }) };
const shortcutIconCache = new Map();
const persistentWebSessions = new Set();
const ISLAND_DEFAULTS = { width: 560, visible: true, locked: false };
const ISLAND_COLLAPSED_SIZE = { width: 306, height: 48 };
const ISLAND_LAYOUTS = {
  default: { width: null, windowHeight: 228, shellHeight: 218, radius: 29 },
  ai: { width: 760, windowHeight: 620, shellHeight: 610, radius: 29 },
  translate: { width: 660, windowHeight: 430, shellHeight: 420, radius: 29 }
};
const DEFAULT_USERNAME = "用户";
const LEGACY_USERNAME = "\u7528\u6237";
const APP_DEFAULTS = { stayResident: true, username: DEFAULT_USERNAME };
const networkCache = new Map();
let workspaceDataCache = null;
const activeNotifications = new Set();

app.setName("MineWork");
app.setAppUserModelId(APP_ID);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function sendToMain(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function revealMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingWindowReveal = true;
    return;
  }
  pendingWindowReveal = false;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function findChromePath() {
  const candidates = [
    path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe")
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function isSupportedWebUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const allowedHosts = [
      "chatgpt.com", "openai.com", "claude.ai", "anthropic.com",
      "mail.google.com", "outlook.office.com", "live.com",
      "mail.163.com", "163.com", "mail.qq.com", "qq.com",
      "chat.deepseek.com", "deepseek.com"
    ];
    return allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

async function openSecureBrowser(url) {
  if (typeof url !== "string" || !isSupportedWebUrl(url)) {
    return { ok: false, error: "不支持的登录地址" };
  }
  const chromePath = findChromePath();
  if (!chromePath) {
    await shell.openExternal(url);
    return { ok: true, browser: "默认浏览器" };
  }
  const child = spawn(chromePath, [`--app=${url}`], {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });
  child.unref();
  return { ok: true, browser: "Chrome" };
}

async function getShortcutIcon(filePath) {
  if (shortcutIconCache.has(filePath)) return shortcutIconCache.get(filePath);
  const icon = await app.getFileIcon(filePath, { size: "large" }).catch(() => null);
  const dataUrl = icon && !icon.isEmpty() ? icon.toDataURL() : null;
  shortcutIconCache.set(filePath, dataUrl);
  return dataUrl;
}

function warmWebSessions() {
  const providers = [
    ["persist:minework-v1-chatgpt", "https://chatgpt.com/"],
    ["persist:minework-v1-claude", "https://claude.ai/new"],
    ["persist:minework-v1-deepseek", "https://chat.deepseek.com/"],
    ["persist:minework-v1-gmail", "https://mail.google.com/"],
    ["persist:minework-v1-outlook", "https://outlook.office.com/"],
    ["persist:minework-v1-netease", "https://mail.163.com/"],
    ["persist:minework-v1-qqmail", "https://mail.qq.com/"]
  ];
  providers.forEach(([partition, url]) => {
    const providerSession = session.fromPartition(partition);
    persistentWebSessions.add(providerSession);
    if (typeof providerSession.preconnect === "function") {
      providerSession.preconnect({ url, numSockets: 4 });
    }
  });
}

function flushPersistentWebSessions() {
  persistentWebSessions.forEach((providerSession) => {
    try {
      providerSession.flushStorageData();
      providerSession.cookies?.flushStore?.().catch(() => {});
    } catch {}
  });
}

function islandSettingsPath() {
  return path.join(app.getPath("userData"), "island-settings.json");
}

function readIslandSettings() {
  try {
    const stored = readJsonObject(islandSettingsPath(), { fallback: ISLAND_DEFAULTS });
    return {
      width: Math.max(420, Math.min(760, Number(stored.width) || ISLAND_DEFAULTS.width)),
      visible: stored.visible !== false,
      locked: stored.locked === true
    };
  } catch {
    return { ...ISLAND_DEFAULTS };
  }
}

function writeIslandSettings(next) {
  const settings = { ...readIslandSettings(), ...next };
  writeJsonAtomic(islandSettingsPath(), settings);
  sendToMain("island:settings-changed", settings);
  if (islandWindow && !islandWindow.isDestroyed()) {
    islandWindow.webContents.send("island:settings-changed", settings);
  }
  return settings;
}

function appSettingsPath() {
  return path.join(app.getPath("userData"), "minework-settings.json");
}

function readAppSettings() {
  try {
    const stored = readJsonObject(appSettingsPath(), { fallback: APP_DEFAULTS });
    const username = typeof stored?.username === "string" && stored.username.trim()
      ? stored.username.trim()
      : DEFAULT_USERNAME;
    return {
      ...APP_DEFAULTS,
      ...stored,
      username: username === LEGACY_USERNAME ? DEFAULT_USERNAME : username
    };
  } catch {
    return { ...APP_DEFAULTS };
  }
}

function writeAppSettings(next) {
  const settings = { ...readAppSettings(), ...next };
  writeJsonAtomic(appSettingsPath(), settings);
  tray?.setToolTip(`MineWork · ${settings.username || "个人工作台"}`);
  return settings;
}

function workspaceDataPath() {
  return path.join(app.getPath("userData"), "minework-data.json");
}

function readWorkspaceData() {
  if (workspaceDataCache) return workspaceDataCache;
  workspaceDataCache = readJsonObject(workspaceDataPath(), { fallback: {} });
  return workspaceDataCache;
}

function writeWorkspaceValue(key, value) {
  if (typeof key !== "string" || !key || key.length > 80) return false;
  const data = readWorkspaceData();
  data[key] = value;
  writeJsonAtomic(workspaceDataPath(), data);
  return true;
}

const notificationStore = createNotificationStore({
  read: (key) => readWorkspaceData()[key],
  write: (key, value) => writeWorkspaceValue(key, value),
  now: Date.now,
  limits: () => readWorkspaceData()["notification-settings"] || {}
});

function showMineWorkNotification(record, onClick, options = {}) {
  if (!Notification.isSupported()) return null;
  const item = new Notification({ title: record.title, body: record.body, silent: options.sound === false });
  activeNotifications.add(item);
  const release = () => activeNotifications.delete(item);
  item.once("click", () => { try { onClick(); } finally { release(); } });
  item.once("close", release);
  item.show();
  return item;
}

const notificationService = createNotificationService({
  store: notificationStore,
  showWindows: showMineWorkNotification,
  publishMain: (snapshot) => sendToMain("notifications:changed", snapshot),
  publishIsland: (record, unreadCount) => {
    if (islandWindow && !islandWindow.isDestroyed()) islandWindow.webContents.send("notifications:delivery", { record, unreadCount });
  },
  navigate: (page) => {
    revealMainWindow();
    sendToMain("app:navigate", page);
  },
  readSettings: () => readWorkspaceData()["notification-settings"] || {},
  writeSettings: (settings) => writeWorkspaceValue("notification-settings", settings),
  now: Date.now
});

const mailBaselineRuntime = createMailBaselineRuntime({
  ingest: (input) => notificationService.ingest(input),
  now: () => new Date().toISOString(),
  privacy: () => notificationService.settings().mailPrivacy === true
});

const mailMainBridge = createMailMainBridge({
  trusted: (event) => Boolean(mainWindow && isTrustedNotificationEvent(event, mainWindow.webContents)),
  allowedProviders: MAIL_PROVIDERS,
  observe: (signal) => mailBaselineRuntime.observe(signal),
  publishStatus: (snapshot) => sendToMain("mail:status:changed", snapshot),
  now: () => new Date().toISOString()
});

const notificationScheduler = createScheduler({
  now: Date.now,
  setTimer: setTimeout,
  clearTimer: clearTimeout,
  ingest: (input) => notificationService.ingest(input),
  readWorkspace: readWorkspaceData,
  writeWorkspace: (key, value) => {
    writeWorkspaceValue(key, value);
    if (key === "countdowns") sendToMain("scheduler:countdowns-changed", value);
  }
});

const performanceMonitor = createPerformanceMonitor({
  sample: sampleSystemPerformance,
  ingest: (input) => notificationService.ingest(input),
  publish: (snapshot) => {
    performanceSnapshot = structuredClone(snapshot);
    sendToMain("system:performance:changed", snapshot);
    if (islandWindow && !islandWindow.isDestroyed()) islandWindow.webContents.send("system:performance:changed", structuredClone(snapshot));
  },
  now: Date.now,
  setTimer: setTimeout,
  clearTimer: clearTimeout,
  settings: notificationService.settings().performanceRules
});

function requireNotificationManager(event) {
  if (!mainWindow || !isTrustedNotificationEvent(event, mainWindow.webContents)) throw new Error("Unauthorized notification request");
}

function requireNotificationConsumer(event) {
  const fromMain = mainWindow && isTrustedNotificationEvent(event, mainWindow.webContents);
  const fromIsland = islandWindow && isTrustedNotificationEvent(event, islandWindow.webContents);
  if (!fromMain && !fromIsland) throw new Error("Unauthorized notification request");
}

function applyIslandBounds(expanded = islandExpanded, toolMode = islandToolMode) {
  if (!islandWindow || islandWindow.isDestroyed()) return;
  const settings = readIslandSettings();
  const workArea = screen.getPrimaryDisplay().workArea;
  islandExpanded = Boolean(expanded);
  islandToolMode = ["ai", "translate"].includes(toolMode) ? toolMode : "";
  const layout = ISLAND_LAYOUTS[islandToolMode] || ISLAND_LAYOUTS.default;
  const width = islandExpanded
    ? layout.width || settings.width
    : ISLAND_COLLAPSED_SIZE.width;
  const desiredHeight = islandExpanded ? layout.windowHeight : ISLAND_COLLAPSED_SIZE.height;
  const height = Math.min(desiredHeight, workArea.height - 20);
  islandWindow.setBounds({
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: workArea.y + 10,
    width,
    height
  }, false);
}

function applyIslandInteraction() {
  if (!islandWindow || islandWindow.isDestroyed()) return;
  const ignore = readIslandSettings().locked || islandIdle;
  islandWindow.setIgnoreMouseEvents(ignore, { forward: true });
}

function setIslandLocked(locked) {
  const settings = writeIslandSettings({ locked: Boolean(locked) });
  if (!settings.locked) {
    islandIdle = false;
    islandWindow?.webContents.send("island:wake");
  }
  applyIslandInteraction();
  refreshTrayMenu();
  return settings;
}

function toggleIslandLocked() {
  return setIslandLocked(!readIslandSettings().locked);
}

function createIslandWindow() {
  if (islandWindow && !islandWindow.isDestroyed()) return islandWindow;
  const settings = readIslandSettings();
  islandWindow = new BrowserWindow({
    title: "",
    width: ISLAND_COLLAPSED_SIZE.width,
    height: ISLAND_COLLAPSED_SIZE.height,
    show: false,
    frame: false,
    titleBarOverlay: false,
    thickFrame: false,
    transparent: true,
    backgroundColor: "#01000000",
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    autoHideMenuBar: true,
    focusable: true,
    icon: path.join(ASSET_ROOT, "minework.ico"),
    webPreferences: {
      preload: path.join(APP_ROOT, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      spellcheck: false
    }
  });
  islandWindow.setAlwaysOnTop(true, "screen-saver");
  islandWindow.setIgnoreMouseEvents(settings.locked, { forward: true });
  islandWindow.setMenuBarVisibility(false);
  islandWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  islandWindow.loadFile(path.join(APP_ROOT, "renderer", "island.html"));
  islandWindow.on("closed", () => {
    islandWindow = null;
  });
  islandWindow.once("ready-to-show", () => {
    applyIslandBounds(false);
    applyIslandInteraction();
  });
  return islandWindow;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    ...WINDOW_SIZE,
    minWidth: 840,
    minHeight: 600,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: "#D7E8FB",
    title: "MineWork",
    icon: path.join(ASSET_ROOT, "minework.ico"),
    webPreferences: {
      preload: path.join(APP_ROOT, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      spellcheck: false
    }
  });

  const showLoadedApplication = () => {
    if (splashWindow && !splashWindow.isDestroyed()) return;
    revealMainWindow();
    if (readIslandSettings().visible) createIslandWindow().showInactive();
  };
  mainWindow.once("ready-to-show", showLoadedApplication);
  mainWindow.webContents.once("did-finish-load", showLoadedApplication);
  mainWindow.webContents.once("did-fail-load", showLoadedApplication);
  mainWindow.loadFile(path.join(APP_ROOT, "renderer", "index.html")).catch(showLoadedApplication);
  setTimeout(showLoadedApplication, 3000);
  mainWindow.on("close", (event) => {
    if (!isQuitting && readAppSettings().stayResident !== false) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.on("maximize", () => sendToMain("window:maximized", true));
  mainWindow.on("unmaximize", () => sendToMain("window:maximized", false));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    title: "",
    width: 660,
    height: 390,
    show: false,
    frame: false,
    titleBarOverlay: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  let startupScheduled = false;
  const finishStartup = (delay = 0) => {
    if (startupScheduled) return;
    startupScheduled = true;
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.webContents.send("splash:leave");
      }
      setTimeout(() => {
        if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
        splashWindow = null;
        revealMainWindow();
        if (readIslandSettings().visible) {
          createIslandWindow().showInactive();
        }
      }, 460);
    }, delay);
  };
  const showSplash = () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.show();
    finishStartup(1980);
  };

  splashWindow.once("ready-to-show", showSplash);
  splashWindow.webContents.once("did-finish-load", showSplash);
  splashWindow.webContents.once("did-fail-load", () => finishStartup());
  splashWindow.loadFile(path.join(APP_ROOT, "renderer", "splash.html")).catch(() => finishStartup());

  // Never leave the application running invisibly if Chromium omits a paint event.
  setTimeout(() => finishStartup(), 4000);
}

function createTray() {
  const trayIcon = nativeImage.createFromPath(path.join(ASSET_ROOT, "minework.png")).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip(`MineWork · ${readAppSettings().username}`);
  refreshTrayMenu();
  tray.on("click", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function refreshTrayMenu() {
  if (!tray) return;
  const locked = readIslandSettings().locked;
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: "显示 MineWork",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    {
      label: "隐藏到后台",
      click: () => mainWindow?.hide()
    },
    {
      label: "显示灵动岛",
      click: () => {
        const settings = writeIslandSettings({ visible: true });
        createIslandWindow().showInactive();
        sendToMain("island:settings-changed", settings);
      }
    },
    {
      label: "隐藏灵动岛",
      click: () => {
        writeIslandSettings({ visible: false });
        islandWindow?.hide();
      }
    },
    {
      label: locked ? "解除锁定" : "锁定灵动岛",
      sublabel: islandShortcutAvailable ? "Ctrl+Alt+I" : "快捷键被占用，请从此处解除",
      click: () => toggleIslandLocked()
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
}

app.on("second-instance", () => {
  revealMainWindow();
});

app.on("web-contents-created", (_event, contents) => {
  const isWebview = contents.getType() === "webview";
  if (isWebview) {
    persistentWebSessions.add(contents.session);
    const chromeVersion = process.versions.chrome || "142.0.0.0";
    contents.setUserAgent(
      `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
    );
    contents.on("did-stop-loading", () => {
      try {
        contents.session.flushStorageData();
        contents.session.cookies?.flushStore?.().catch(() => {});
      } catch {}
    });
  }
  contents.setWindowOpenHandler(({ url }) => {
    const trustedLoginHosts = [
      "accounts.google.com", "myaccount.google.com",
      "login.live.com", "account.live.com",
      "passport.163.com", "reg.163.com",
      "xui.ptlogin2.qq.com", "ssl.ptlogin2.qq.com", "graph.qq.com",
      "auth.openai.com", "chatgpt.com", "claude.ai", "anthropic.com", "deepseek.com"
    ];
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      const trustedLogin = trustedLoginHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
      if (isWebview && trustedLogin) {
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            width: 520,
            height: 720,
            parent: mainWindow || undefined,
            autoHideMenuBar: true,
            title: "登录",
            webPreferences: {
              javascript: true,
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
              session: contents.session
            }
          }
        };
      }
    } catch {}
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  warmWebSessions();
  createSplashWindow();
  createMainWindow();
  createTray();
  islandShortcutAvailable = globalShortcut.register("CommandOrControl+Alt+I", () => toggleIslandLocked());
  sendToMain("island:shortcut-status", islandShortcutAvailable);
  islandWindow?.webContents.send("island:shortcut-status", islandShortcutAvailable);
  refreshTrayMenu();
  notificationScheduler.start().catch(() => {});
  performanceMonitor.start().catch(() => {});
  powerMonitor.on("resume", notificationScheduler.onResume);
});

app.on("before-quit", () => {
  isQuitting = true;
  flushPersistentWebSessions();
});

app.on("will-quit", () => {
  notificationScheduler.stop();
  performanceMonitor.stop();
  powerMonitor.removeListener("resume", notificationScheduler.onResume);
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

app.on("activate", () => {
  mainWindow?.show();
});

ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:toggle-maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on("window:hide", () => mainWindow?.hide());
ipcMain.on("window:close", () => {
  if (readAppSettings().stayResident !== false) {
    mainWindow?.hide();
  } else {
    isQuitting = true;
    app.quit();
  }
});
ipcMain.handle("app:settings:get", () => readAppSettings());
ipcMain.handle("app:settings:set", (_event, next) => writeAppSettings({
  stayResident: next?.stayResident !== false,
  username: typeof next?.username === "string" && next.username.trim() ? next.username.trim().slice(0, 32) : readAppSettings().username
}));
function requireWorkspaceMain(event) {
  if (!mainWindow || !isTrustedWorkspaceEvent(event, mainWindow.webContents)) throw new Error("Unauthorized workspace request");
}
ipcMain.on("store:set", (event, key, value) => {
  try { requireWorkspaceMain(event); writeWorkspaceValue(key, value); } catch {}
});
ipcMain.on("mail:signal", (event, payload) => {
  mailMainBridge.handle(event, payload);
});

ipcMain.handle("notifications:list", (event, filter) => {
  requireNotificationManager(event);
  return notificationService.snapshot(validateNotificationFilter(filter || {}));
});
ipcMain.handle("notifications:mark-read", (event, id) => {
  requireNotificationConsumer(event);
  return notificationService.handleAction({ action: "read", id: validateNotificationId(id) });
});
ipcMain.handle("notifications:mark-all-read", (event) => {
  requireNotificationManager(event);
  return notificationService.handleAction({ action: "read-all" });
});
ipcMain.handle("notifications:dismiss", (event, id) => {
  requireNotificationConsumer(event);
  return notificationService.handleAction({ action: "dismiss", id: validateNotificationId(id) });
});
ipcMain.handle("notifications:open", (event, id) => {
  requireNotificationConsumer(event);
  return notificationService.handleAction({ action: "open", id: validateNotificationId(id) });
});
ipcMain.handle("notifications:clear", (event) => {
  requireNotificationManager(event);
  return notificationService.handleAction({ action: "clear" });
});
ipcMain.handle("notifications:settings:get", (event) => {
  requireNotificationManager(event);
  return notificationService.settings();
});
ipcMain.handle("notifications:settings:update", (event, patch) => {
  requireNotificationManager(event);
  const settings = notificationService.updateSettings(validateSettingsPatch(patch));
  const reminders = buildHolidayReminders({ china: BUNDLED_CALENDAR_DATA.china, international: BUNDLED_CALENDAR_DATA.international, year: BUNDLED_CALENDAR_DATA.china.year, settings: settings.holidayReminder });
  writeWorkspaceValue("holiday-reminders", reminders);
  performanceMonitor.updateSettings(settings.performanceRules || {});
  notificationScheduler.reload().catch(() => {});
  return settings;
});
ipcMain.handle("notifications:settings:reset", (event) => {
  requireNotificationManager(event);
  const settings = notificationService.resetSettings();
  writeWorkspaceValue("holiday-reminders", []);
  performanceMonitor.updateSettings(settings.performanceRules || {});
  notificationScheduler.reload().catch(() => {});
  return settings;
});
ipcMain.handle("notifications:test", (event) => {
  requireNotificationManager(event);
  return notificationService.testNotification();
});

ipcMain.handle("island:settings:get", () => readIslandSettings());
ipcMain.handle("island:width:set", (_event, width) => {
  const settings = writeIslandSettings({ width: Math.max(420, Math.min(760, Number(width) || ISLAND_DEFAULTS.width)) });
  applyIslandBounds();
  islandWindow?.webContents.send("island:settings-changed", settings);
  return settings;
});
ipcMain.handle("island:visible:set", (_event, visible) => {
  const settings = writeIslandSettings({ visible: Boolean(visible) });
  if (settings.visible) {
    createIslandWindow().showInactive();
    applyIslandBounds(false);
  } else {
    islandWindow?.hide();
  }
  return settings;
});
ipcMain.on("island:interaction:set", (_event, interaction) => {
  islandIdle = Boolean(interaction?.idle);
  applyIslandInteraction();
});
ipcMain.handle("island:lock:set", (_event, locked) => setIslandLocked(locked));
ipcMain.on("island:expanded", (_event, expanded) => applyIslandBounds(Boolean(expanded), islandToolMode));
ipcMain.on("island:tool-mode", (_event, mode) => {
  islandToolMode = ["ai", "translate"].includes(mode) ? mode : "";
  applyIslandBounds(islandExpanded, islandToolMode);
});
ipcMain.on("island:state", (_event, state) => {
  const expanded = Boolean(state?.expanded);
  const mode = expanded && ["ai", "translate"].includes(state?.mode) ? state.mode : "";
  if (expanded) applyIslandBounds(true, mode);
});
ipcMain.on("island:collapse-ready", () => applyIslandBounds(false, ""));
ipcMain.handle("web-sessions:flush", async () => {
  const tasks = [];
  persistentWebSessions.forEach((providerSession) => {
    try {
      tasks.push(Promise.resolve(providerSession.flushStorageData()));
      if (providerSession.cookies?.flushStore) tasks.push(providerSession.cookies.flushStore());
    } catch {}
  });
  await Promise.allSettled(tasks);
  return { ok: true };
});
ipcMain.on("island:open-main", (_event, page) => {
  mainWindow?.show();
  mainWindow?.focus();
  if (typeof page === "string") mainWindow?.webContents.send("app:navigate", page);
});
function requireWorkspaceManager(event) {
  if (!mainWindow || !isTrustedWorkspaceEvent(event, mainWindow.webContents)) throw new Error("Unauthorized workspace request");
}

const workspaceMutationHandlers = createWorkspaceMutationHandlers({
  authorize: requireWorkspaceManager,
  validateCountdowns,
  validateAlarms,
  validateCalendarEvents: (events) => Array.isArray(events) ? events.slice(0, 500).map((item) => ({ id: String(item.id || ""), title: String(item.title || "行程").slice(0, 80), date: String(item.date || ""), remindMinutes: Math.max(0, Math.min(10080, Number(item.remindMinutes) || 0)) })).filter((item) => item.id && Number.isFinite(Date.parse(item.date))) : [],
  validateAnniversaries: (items) => {
    if (!Array.isArray(items) || items.length > 500) throw new TypeError("Invalid anniversary workspace");
    return items.map(normalizeAnniversary).filter(Boolean);
  },
  writeWorkspace: writeWorkspaceValue,
  reload: notificationScheduler.reload,
  publishCountdowns: (items) => islandWindow?.webContents.send("island:countdowns", items)
});

ipcMain.on("island:countdowns:update", (event, countdowns) => { try { workspaceMutationHandlers.countdowns(event, countdowns); } catch {} });
ipcMain.on("alarms:update", (event, alarms) => { try { workspaceMutationHandlers.alarms(event, alarms); } catch {} });
ipcMain.on("hydration:update", (event, hydration) => {
  try {
    requireWorkspaceManager(event);
    const safe = normalizeHydration(hydration, new Date());
    safe.reminder = hydration && typeof hydration.reminder === "object" ? structuredClone(hydration.reminder) : undefined;
    safe.goalCrossedDates = Array.isArray(hydration?.goalCrossedDates) ? hydration.goalCrossedDates.filter((value) => typeof value === "string").slice(-31) : [];
    writeWorkspaceValue("hydration", safe);
    notificationScheduler.reload().catch(() => {});
  } catch {}
});
ipcMain.on("island:countdowns:request", () => {
  mainWindow?.webContents.send("island:countdowns:request");
});
ipcMain.on("island:workspace:update", (_event, payload) => {
  const safe = payload && typeof payload === "object" ? payload : {};
  islandWindow?.webContents.send("island:workspace", safe);
});
ipcMain.on("island:workspace:request", () => {
  mainWindow?.webContents.send("island:workspace:request");
});
ipcMain.on("calendar:events:update", (event, events) => {
  try { workspaceMutationHandlers.calendar(event, events); } catch {}
});
ipcMain.on("calendar:anniversaries:update", (event, anniversaries) => {
  try { workspaceMutationHandlers.anniversaries(event, anniversaries); } catch {}
});
ipcMain.handle("calendar:data:get", (event) => {
  requireWorkspaceManager(event);
  const cached = readWorkspaceData()["holiday-snapshot-cache"];
  const chinaSnapshots = [BUNDLED_CALENDAR_DATA.china];
  if (cached) {
    try { const safe = validateHolidaySnapshot(cached); if (!chinaSnapshots.some((item) => item.year === safe.year)) chinaSnapshots.push(safe); } catch {}
  }
  return structuredClone({ china: BUNDLED_CALENDAR_DATA.china, chinaSnapshots, international: BUNDLED_CALENDAR_DATA.international });
});
ipcMain.handle("calendar:snapshot:validate", (event, snapshot, expectedYear) => {
  requireWorkspaceManager(event);
  return validateHolidaySnapshot(snapshot, expectedYear);
});

ipcMain.handle("dialog:pick-shortcuts", async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "添加快捷打开项目",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "程序与文件", extensions: ["exe", "lnk", "url", "bat", "cmd", "ps1", "txt", "pdf", "docx", "xlsx", "*"] }
    ]
  });
  if (result.canceled) return [];
  return Promise.all(result.filePaths.map(async (filePath) => {
    return {
      path: filePath,
      name: path.basename(filePath, path.extname(filePath)),
      icon: await getShortcutIcon(filePath)
    };
  }));
});

ipcMain.handle("dialog:pick-folder", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "添加文件夹",
    properties: ["openDirectory"]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  return { path: filePath, name: path.basename(filePath), icon: await getShortcutIcon(filePath) };
});

ipcMain.handle("dialog:pick-books", async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "导入本地书籍",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "电子书与文档", extensions: ["pdf", "epub", "mobi", "azw", "azw3", "txt", "doc", "docx", "md"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled) return [];
  return Promise.all(result.filePaths.map(async (filePath) => ({
    path: filePath,
    title: path.basename(filePath, path.extname(filePath)),
    format: path.extname(filePath).replace(".", "").toUpperCase() || "FILE",
    icon: await getShortcutIcon(filePath)
  })));
});

ipcMain.handle("shortcuts:icons", async (_event, filePaths) => {
  const safePaths = Array.isArray(filePaths)
    ? filePaths.filter((filePath) => typeof filePath === "string" && filePath.trim()).slice(0, 64)
    : [];
  return Promise.all(safePaths.map(async (filePath) => ({ path: filePath, icon: await getShortcutIcon(filePath) })));
});

ipcMain.handle("system:open-path", async (_event, filePath) => {
  if (typeof filePath !== "string" || !filePath.trim()) return { ok: false, error: "路径无效" };
  const error = await shell.openPath(filePath);
  return error ? { ok: false, error } : { ok: true };
});

ipcMain.handle("system:show-item", (_event, filePath) => {
  if (typeof filePath === "string" && filePath.trim()) shell.showItemInFolder(filePath);
  return true;
});

ipcMain.handle("system:open-external", async (_event, url) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
  await shell.openExternal(url);
  return true;
});

ipcMain.handle("system:open-secure-browser", async (_event, url) => {
  return openSecureBrowser(url);
});

function cacheValue(key, maxAge, loader) {
  const cached = networkCache.get(key);
  if (cached && Date.now() - cached.at < maxAge) return Promise.resolve(cached.value);
  return loader().then((value) => {
    networkCache.set(key, { at: Date.now(), value });
    return value;
  });
}

async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await net.fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url, options = {}, timeout = 20000, attempts = 2) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, options, timeout);
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      lastError = new Error(`网络服务失败 (${response.status})`);
    } catch (error) {
      lastError = error;
    }
    if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError || new Error("网络服务暂时不可用");
}

function sanitizeWeatherLocation(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const location = {
    countryCode: String(source.countryCode || "").trim().slice(0, 2).toUpperCase(),
    country: String(source.country || "").trim().slice(0, 60),
    province: String(source.province || "").trim().slice(0, 60),
    city: String(source.city || "").trim().slice(0, 60),
    district: String(source.district || "").trim().slice(0, 60)
  };
  return (location.countryCode || location.country) && (location.city || location.province || location.district) ? location : null;
}

async function geocodeWeather(locationRequest) {
  const candidates = [...new Set([locationRequest.city, locationRequest.district, locationRequest.province].filter(Boolean))];
  for (const candidate of candidates) {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", candidate);
    url.searchParams.set("count", "10");
    url.searchParams.set("language", "zh");
    url.searchParams.set("format", "json");
    if (locationRequest.countryCode) url.searchParams.set("countryCode", locationRequest.countryCode);
    const response = await fetchWithRetry(url.toString(), {}, 20000, 2);
    if (!response.ok) continue;
    const results = (await response.json()).results || [];
    const score = (item) => {
      const fields = [item.name, item.admin1, item.admin2, item.admin3, item.admin4].map((part) => String(part || ""));
      return (fields.includes(candidate) ? 10 : 0)
        + (locationRequest.province && fields.some((part) => part.includes(locationRequest.province.replace(/[省市]$/, ""))) ? 5 : 0)
        + (locationRequest.city && fields.some((part) => part.includes(locationRequest.city.replace(/市$/, ""))) ? 5 : 0)
        + (locationRequest.district && fields.some((part) => part.includes(locationRequest.district.replace(/[区县]$/, ""))) ? 6 : 0)
        + Math.min(Number(item.population || 0) / 10000000, 2);
    };
    const point = results.sort((left, right) => score(right) - score(left))[0];
    if (point) return point;
  }
  throw new Error(`没有找到“${candidates[0] || "所选位置"}”的天气位置`);
}

async function forecastWeather(point, request) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(point.latitude));
  url.searchParams.set("longitude", String(point.longitude));
  url.searchParams.set("current", "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m");
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "4");
  const response = await fetchWithRetry(url.toString(), {}, 20000, 2);
  if (!response.ok) throw new Error(`天气服务失败 (${response.status})`);
  const data = await response.json();
  return { ...data, location: { name: point.name, admin: point.admin1 || "", admin2: point.admin2 || "", country: point.country || request.country || "" } };
}

const weatherService = createWeatherService({
  geocode: geocodeWeather,
  forecast: forecastWeather,
  readCache: async (key) => readWorkspaceData()[`service-cache:${key}`] || null,
  writeCache: async (key, value) => writeWorkspaceValue(`service-cache:${key}`, value),
  concurrency: 4
});

async function fetchNewsResponse(request, format) {
  const response = await fetchWithRetry(request.url, { headers: {
    Accept: format === "json" ? "application/json, text/plain, */*" : "application/rss+xml, application/xml, text/xml",
    "User-Agent": "MineWork/2.4"
  } }, 12000, 2);
  if (!response.ok) throw new Error(`${request.name} returned ${response.status}`);
  return format === "json" ? response.json() : response.text();
}

const newsService = createNewsService({
  fetchText: (request) => fetchNewsResponse(request, "text"),
  fetchJson: (request) => fetchNewsResponse(request, "json"),
  readCache: async (key) => readWorkspaceData()[`service-cache:${key}`] || null,
  writeCache: async (key, value) => writeWorkspaceValue(`service-cache:${key}`, value)
});

function requireWeatherManager(event) {
  if (!mainWindow || !isTrustedWorkspaceEvent(event, mainWindow.webContents)) throw new Error("Unauthorized weather request");
}

ipcMain.handle("network:weather:batch", async (event, locations, options) => {
  requireWeatherManager(event);
  if (!Array.isArray(locations)) throw new TypeError("Weather locations must be an array");
  if (JSON.stringify(locations).length > 4 * 1024 * 1024) throw new RangeError("Weather request payload is too large");
  const safe = locations.map(sanitizeWeatherLocation);
  if (safe.some((location) => !location)) throw new TypeError("Weather request contains an invalid location");
  const combined = { results: {}, order: [], updatedAt: new Date().toISOString() };
  for (let offset = 0; offset < safe.length; offset += 200) {
    const batch = await weatherService.fetchBatch(safe.slice(offset, offset + 200), { force: options?.force === true });
    for (const id of batch.order) if (!combined.order.includes(id)) combined.order.push(id);
    Object.assign(combined.results, batch.results);
    combined.updatedAt = batch.updatedAt;
  }
  return combined;
});

ipcMain.handle("network:weather", async (event, request) => {
  requireWeatherManager(event);
  const legacyLocation = sanitizeWeatherLocation(request && typeof request === "object" ? request : { country: "legacy", city: String(request || "") });
  if (!legacyLocation) return { ok: false, error: "请选择城市或地区" };
  const legacyResult = await weatherService.fetchOne(legacyLocation);
  return legacyResult.status === "error" ? { ok: false, error: legacyResult.error } : { ...legacyResult, ok: true };
  /* Legacy implementation retained below temporarily for source-level migration context. */
  const source = request && typeof request === "object" ? request : { city: String(request || "") };
  const locationRequest = {
    countryCode: String(source.countryCode || "").trim().slice(0, 2).toUpperCase(),
    country: String(source.country || "").trim().slice(0, 60),
    province: String(source.province || "").trim().slice(0, 60),
    city: String(source.city || "").trim().slice(0, 60),
    district: String(source.district || "").trim().slice(0, 60)
  };
  // City-level names resolve more reliably than Chinese district names in Open-Meteo.
  const candidates = [...new Set([locationRequest.city, locationRequest.district, locationRequest.province].filter(Boolean))];
  if (!candidates.length) return { ok: false, error: "请选择城市或地区" };
  const cacheKey = JSON.stringify(locationRequest).toLowerCase();
  return cacheValue(`weather:${cacheKey}`, 10 * 60000, async () => {
    try {
      let location = null;
      for (const candidate of candidates) {
        const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
        geocodeUrl.searchParams.set("name", candidate);
        geocodeUrl.searchParams.set("count", "10");
        geocodeUrl.searchParams.set("language", "zh");
        geocodeUrl.searchParams.set("format", "json");
        if (locationRequest.countryCode) geocodeUrl.searchParams.set("countryCode", locationRequest.countryCode);
        const locationResponse = await fetchWithRetry(geocodeUrl.toString(), {}, 20000, 2);
        if (!locationResponse.ok) continue;
        const results = (await locationResponse.json()).results || [];
        const score = (item) => {
          let value = 0;
          const fields = [item.name, item.admin1, item.admin2, item.admin3, item.admin4].map((part) => String(part || ""));
          if (fields.some((part) => part === candidate)) value += 10;
          if (locationRequest.province && fields.some((part) => part.includes(locationRequest.province.replace(/[省市]$/, "")))) value += 5;
          if (locationRequest.city && fields.some((part) => part.includes(locationRequest.city.replace(/市$/, "")))) value += 5;
          if (locationRequest.district && fields.some((part) => part.includes(locationRequest.district.replace(/[区县]$/, "")))) value += 6;
          return value + Math.min(Number(item.population || 0) / 10000000, 2);
        };
        location = results.sort((left, right) => score(right) - score(left))[0] || null;
        if (location) break;
      }
      if (!location) return { ok: false, error: `没有找到“${candidates[0]}”的天气位置` };
      const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
      forecastUrl.searchParams.set("latitude", String(location.latitude));
      forecastUrl.searchParams.set("longitude", String(location.longitude));
      forecastUrl.searchParams.set("current", "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m");
      forecastUrl.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
      forecastUrl.searchParams.set("timezone", "auto");
      forecastUrl.searchParams.set("forecast_days", "4");
      const forecastResponse = await fetchWithRetry(forecastUrl.toString(), {}, 20000, 2);
      if (!forecastResponse.ok) throw new Error(`天气服务失败 (${forecastResponse.status})`);
      const forecast = await forecastResponse.json();
      return {
        ok: true,
        location: { name: location.name, admin: location.admin1 || "", admin2: location.admin2 || "", country: location.country || locationRequest.country || "" },
        current: forecast.current,
        currentUnits: forecast.current_units,
        daily: forecast.daily,
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      return { ok: false, error: error?.message || "天气服务暂时不可用" };
    }
  });
});

function requireNewsManager(event) {
  if (!mainWindow || !isTrustedWorkspaceEvent(event, mainWindow.webContents)) throw new Error("Unauthorized news request");
}

ipcMain.handle("network:news:category", async (event, request) => {
  requireNewsManager(event);
  if (!request || typeof request !== "object" || Array.isArray(request)) throw new TypeError("News request must be an object");
  return newsService.fetchCategory(String(request.category || ""), { force: request.force === true });
});

ipcMain.handle("network:news:all", async (event, request = {}) => {
  requireNewsManager(event);
  if (!request || typeof request !== "object" || Array.isArray(request)) throw new TypeError("News request must be an object");
  return newsService.fetchAll({ force: request.force === true });
});

ipcMain.handle("network:news", async (event) => {
  requireNewsManager(event);
  const result = await newsService.fetchCategory("general");
  return { ...result, provider: result.providers?.join("、") || "" };
});

function cpuSnapshot() {
  const current = os.cpus();
  const totals = current.reduce((result, cpu) => {
    const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
    result.idle += cpu.times.idle;
    result.total += total;
    return result;
  }, { idle: 0, total: 0 });
  let usage = 0;
  if (cpuPrevious) {
    const idleDelta = totals.idle - cpuPrevious.idle;
    const totalDelta = totals.total - cpuPrevious.total;
    if (totalDelta > 0) usage = Math.max(0, Math.min(100, 100 - (idleDelta / totalDelta) * 100));
  }
  cpuPrevious = totals;
  return {
    usage: Math.round(usage * 10) / 10,
    model: current[0]?.model?.trim() || "CPU",
    cores: current.length
  };
}

function diskSnapshot() {
  try {
    const root = path.parse(process.cwd()).root;
    const stats = fs.statfsSync(root);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const free = Number(stats.bavail) * Number(stats.bsize);
    return {
      root,
      total,
      free,
      usage: total > 0 ? Math.round((1 - free / total) * 1000) / 10 : 0
    };
  } catch {
    return { root: "C:\\", total: 0, free: 0, usage: 0 };
  }
}

function querySystemProfile() {
  const now = Date.now();
  if (now - systemProfileCache.at < 60000) return Promise.resolve(systemProfileCache.value);
  return new Promise((resolve) => {
    const script = [
      "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8",
      "$cpu=Get-CimInstance Win32_Processor | Select-Object -First 1 Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed",
      "$gpu=Get-CimInstance Win32_VideoController | Select-Object -First 1 Name,AdapterRAM",
      "$os=Get-CimInstance Win32_OperatingSystem | Select-Object -First 1 Caption,Version,LastBootUpTime,OSArchitecture",
      "$profile=@{cpu=$cpu;gpu=$gpu;os=@{Caption=$os.Caption;Version=$os.Version;LastBootUpTime=$os.LastBootUpTime.ToString('o');OSArchitecture=$os.OSArchitecture}}",
      "$profile | ConvertTo-Json -Compress -Depth 4"
    ].join("; ");
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true,
      timeout: 5000,
      encoding: "utf8"
    }, (error, stdout) => {
      if (!error && stdout.trim()) {
        try {
          systemProfileCache = {
            at: now,
            value: parseWindowsSystemProfile(JSON.parse(stdout.trim()), { arch: os.arch(), hostname: os.hostname() })
          };
        } catch {}
      }
      resolve(systemProfileCache.value);
    });
  });
}

async function sampleSystemPerformance() {
  const memoryTotal = os.totalmem();
  const memoryFree = os.freemem();
  const cpu = cpuSnapshot();
  const profile = await querySystemProfile();
  const logicalCores = os.cpus();
  return {
    cpu: {
      ...cpu,
      model: profile.cpu.model || cpu.model,
      speedMHz: logicalCores[0]?.speed || profile.cpu.maxClockMHz,
      physicalCores: profile.cpu.physicalCores,
      logicalCores: profile.cpu.logicalCores || logicalCores.length
    },
    memory: {
      total: memoryTotal,
      free: memoryFree,
      usage: Math.round((1 - memoryFree / memoryTotal) * 1000) / 10
    },
    disk: diskSnapshot(),
    gpu: profile.gpu,
    system: profile.system,
    uptime: os.uptime(),
    sampledAt: new Date().toISOString()
  };
}

ipcMain.handle("system:performance", async () => performanceSnapshot || performanceMonitor.snapshot().sample || sampleSystemPerformance());

function loadMediaHelper() {
  try {
    return require("@eisland/windows-smtc-helper");
  } catch (error) {
    return { error: error?.message || "媒体监控组件不可用" };
  }
}

let mediaHelper = null;
function getMediaHelper() {
  if (!mediaHelper) mediaHelper = loadMediaHelper();
  return mediaHelper;
}

function mineRadioBridgePath(name) {
  return path.join(app.getPath("appData"), "Mineradio", name);
}

function readMineRadioStatus() {
  try {
    const payload = JSON.parse(fs.readFileSync(mineRadioBridgePath("minework-media.json"), "utf8"));
    const age = Date.now() - Number(payload?.updatedAt || 0);
    if (age < 0 || age > 15000 || payload?.isAvailable !== true || !String(payload?.title || "").trim()) return null;
    return {
      ...payload,
      isAvailable: true,
      sourceAppUserModelId: "com.mineradio.desktop"
    };
  } catch {
    return null;
  }
}

function sendMineRadioCommand(action) {
  try {
    const command = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, action, createdAt: Date.now() };
    fs.mkdirSync(path.dirname(mineRadioBridgePath("minework-command.json")), { recursive: true });
    fs.writeFileSync(mineRadioBridgePath("minework-command.json"), JSON.stringify(command), "utf8");
    return { success: true, source: "MineRadio" };
  } catch (error) {
    return { success: false, error: error?.message || "无法向 MineRadio 发送控制命令" };
  }
}

ipcMain.handle("media:status", () => {
  const mineRadioStatus = readMineRadioStatus();
  if (mineRadioStatus) return mineRadioStatus;
  const helper = getMediaHelper();
  if (helper.error) return { isAvailable: false, error: helper.error };
  try {
    return helper.getStatus();
  } catch (error) {
    return { isAvailable: false, error: error?.message || "无法读取媒体状态" };
  }
});

ipcMain.handle("media:control", (_event, action) => {
  const mineRadioStatus = readMineRadioStatus();
  if (mineRadioStatus && ["play", "pause", "next", "previous"].includes(action)) return sendMineRadioCommand(action);
  const helper = getMediaHelper();
  if (helper.error) return { success: false, error: helper.error };
  const allowed = { play: "play", pause: "pause", next: "next", previous: "previous" };
  const method = allowed[action];
  if (!method || typeof helper[method] !== "function") return { success: false, error: "不支持的操作" };
  try {
    return helper[method]();
  } catch (error) {
    return { success: false, error: error?.message || "媒体控制失败" };
  }
});

function normalizeLanguage(code, fallback) {
  const allowed = new Set(["auto", "zh-CN", "en", "ja", "ko", "fr", "de", "es"]);
  return allowed.has(code) ? code : fallback;
}

ipcMain.handle("translate:text", async (_event, request) => {
  const text = String(request?.text || "").trim().slice(0, 5000);
  if (!text) return { ok: false, error: "请输入要翻译的内容" };
  const source = normalizeLanguage(request?.source, "auto");
  const target = normalizeLanguage(request?.target, "zh-CN");
  const endpoint = new URL("https://translate.googleapis.com/translate_a/single");
  endpoint.searchParams.set("client", "gtx");
  endpoint.searchParams.set("sl", source);
  endpoint.searchParams.set("tl", target);
  endpoint.searchParams.set("dt", "t");
  endpoint.searchParams.set("q", text);
  try {
    const response = await fetchWithTimeout(endpoint.toString(), { method: "GET" }, 8000);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const translated = Array.isArray(payload?.[0])
      ? payload[0].map((part) => part?.[0] || "").join("")
      : "";
    if (!translated) throw new Error("翻译结果为空");
    return { ok: true, translated, detected: payload?.[2] || source };
  } catch (error) {
    return { ok: false, error: `在线翻译暂时不可用：${error?.message || "网络错误"}` };
  }
});
