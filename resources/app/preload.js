"use strict";

const { contextBridge, ipcRenderer } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { createClonedSubscription } = require("./notifications/notification-runtime");
const { sanitizeMailStatus } = require("./mail-integration");

function readWorkspaceSnapshot() {
  try {
    const dataPath = path.join(process.env.APPDATA || "", "MineWork", "minework-data.json");
    const stored = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

const workspaceSnapshot = readWorkspaceSnapshot();

function cloneNotificationValue(value) {
  return value === undefined ? undefined : structuredClone(value);
}

const notifications = Object.freeze({
  list: (filter = {}) => ipcRenderer.invoke("notifications:list", cloneNotificationValue(filter)),
  markRead: (id) => ipcRenderer.invoke("notifications:mark-read", id),
  markAllRead: () => ipcRenderer.invoke("notifications:mark-all-read"),
  dismiss: (id) => ipcRenderer.invoke("notifications:dismiss", id),
  open: (id) => ipcRenderer.invoke("notifications:open", id),
  clear: () => ipcRenderer.invoke("notifications:clear"),
  getSettings: () => ipcRenderer.invoke("notifications:settings:get"),
  updateSettings: (patch) => ipcRenderer.invoke("notifications:settings:update", cloneNotificationValue(patch)),
  resetSettings: () => ipcRenderer.invoke("notifications:settings:reset"),
  test: () => ipcRenderer.invoke("notifications:test"),
  onChanged: (listener) => {
    if (typeof listener !== "function") throw new TypeError("notification listener must be a function");
    const handler = (_event, snapshot) => listener(cloneNotificationValue(snapshot));
    ipcRenderer.on("notifications:changed", handler);
    return () => ipcRenderer.removeListener("notifications:changed", handler);
  },
  onDelivery: (listener) => {
    if (typeof listener !== "function") throw new TypeError("notification delivery listener must be a function");
    const handler = (_event, payload) => listener(cloneNotificationValue(payload));
    ipcRenderer.on("notifications:delivery", handler);
    return () => ipcRenderer.removeListener("notifications:delivery", handler);
  }
});

const mail = Object.freeze({
  signal: (payload) => ipcRenderer.send("mail:signal", cloneNotificationValue(payload)),
  onStatusChanged: (listener) => {
    if (typeof listener !== "function") throw new TypeError("mail status listener must be a function");
    const handler = (_event, value) => {
      const status = sanitizeMailStatus(value);
      if (status) listener(status);
    };
    ipcRenderer.on("mail:status:changed", handler);
    return () => ipcRenderer.removeListener("mail:status:changed", handler);
  }
});

contextBridge.exposeInMainWorld("minework", {
  notifications,
  mail,
  storage: {
    snapshot: workspaceSnapshot,
    set: (key, value) => ipcRenderer.send("store:set", key, value)
  },
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
    hide: () => ipcRenderer.send("window:hide"),
    close: () => ipcRenderer.send("window:close"),
    onMaximized: (callback) => {
      const handler = (_event, value) => callback(Boolean(value));
      ipcRenderer.on("window:maximized", handler);
      return () => ipcRenderer.removeListener("window:maximized", handler);
    }
  },
  settings: {
    get: () => ipcRenderer.invoke("app:settings:get"),
    set: (settings) => ipcRenderer.invoke("app:settings:set", settings)
  },
  shortcuts: {
    pickFiles: () => ipcRenderer.invoke("dialog:pick-shortcuts"),
    pickFolder: () => ipcRenderer.invoke("dialog:pick-folder"),
    hydrateIcons: (filePaths) => ipcRenderer.invoke("shortcuts:icons", filePaths),
    open: (filePath) => ipcRenderer.invoke("system:open-path", filePath),
    reveal: (filePath) => ipcRenderer.invoke("system:show-item", filePath)
  },
  books: {
    pickFiles: () => ipcRenderer.invoke("dialog:pick-books"),
    open: (filePath) => ipcRenderer.invoke("system:open-path", filePath),
    reveal: (filePath) => ipcRenderer.invoke("system:show-item", filePath)
  },
  calendar: {
    syncEvents: (events) => ipcRenderer.send("calendar:events:update", cloneNotificationValue(events)),
    syncAnniversaries: (items) => ipcRenderer.send("calendar:anniversaries:update", cloneNotificationValue(items)),
    getData: () => ipcRenderer.invoke("calendar:data:get"),
    validateSnapshot: (snapshot, expectedYear) => ipcRenderer.invoke("calendar:snapshot:validate", cloneNotificationValue(snapshot), expectedYear)
  },
  scheduler: {
    syncCountdowns: (countdowns) => ipcRenderer.send("island:countdowns:update", cloneNotificationValue(countdowns)),
    syncAlarms: (alarms) => ipcRenderer.send("alarms:update", cloneNotificationValue(alarms)),
    syncHydration: (hydration) => ipcRenderer.send("hydration:update", cloneNotificationValue(hydration)),
    onCountdownsChanged: (listener) => createClonedSubscription(ipcRenderer, "scheduler:countdowns-changed", listener)
  },
  network: {
    weather: (city) => ipcRenderer.invoke("network:weather", city),
    weatherBatch: (locations, options = {}) => ipcRenderer.invoke("network:weather:batch", cloneNotificationValue(locations), cloneNotificationValue(options)),
    news: () => ipcRenderer.invoke("network:news"),
    newsCategory: (category, options = {}) => ipcRenderer.invoke("network:news:category", { category: String(category || ""), force: options?.force === true }),
    newsAll: (options = {}) => ipcRenderer.invoke("network:news:all", { force: options?.force === true })
  },
  system: {
    performance: () => ipcRenderer.invoke("system:performance"),
    onPerformanceChanged: (listener) => {
      if (typeof listener !== "function") throw new TypeError("performance listener must be a function");
      const handler = (_event, value) => listener(cloneNotificationValue(value));
      ipcRenderer.on("system:performance:changed", handler);
      return () => ipcRenderer.removeListener("system:performance:changed", handler);
    },
    openExternal: (url) => ipcRenderer.invoke("system:open-external", url),
    openSecureBrowser: (url) => ipcRenderer.invoke("system:open-secure-browser", url),
    islandWebviewPreload: pathToFileURL(path.join(__dirname, "webview-preload.js")).toString(),
    mailWebviewPreload: pathToFileURL(path.join(__dirname, "mail-webview-preload.js")).toString()
  },
  webSessions: {
    flush: () => ipcRenderer.invoke("web-sessions:flush")
  },
  media: {
    status: () => ipcRenderer.invoke("media:status"),
    control: (action) => ipcRenderer.invoke("media:control", action)
  },
  island: {
    getSettings: () => ipcRenderer.invoke("island:settings:get"),
    setWidth: (width) => ipcRenderer.invoke("island:width:set", width),
    setVisible: (visible) => ipcRenderer.invoke("island:visible:set", visible),
    setInteraction: (interaction) => ipcRenderer.send("island:interaction:set", interaction),
    setLocked: (locked) => ipcRenderer.invoke("island:lock:set", locked),
    setExpanded: (expanded) => ipcRenderer.send("island:expanded", expanded),
    setToolMode: (mode) => ipcRenderer.send("island:tool-mode", mode),
    setState: (expanded, mode) => ipcRenderer.send("island:state", { expanded, mode }),
    collapseReady: () => ipcRenderer.send("island:collapse-ready"),
    openMain: (page) => ipcRenderer.send("island:open-main", page),
    syncWorkspace: (payload) => ipcRenderer.send("island:workspace:update", payload),
    requestCountdowns: () => ipcRenderer.send("island:countdowns:request"),
    requestWorkspace: () => ipcRenderer.send("island:workspace:request"),
    onCountdowns: (callback) => {
      const handler = (_event, countdowns) => callback(Array.isArray(countdowns) ? countdowns : []);
      ipcRenderer.on("island:countdowns", handler);
      return () => ipcRenderer.removeListener("island:countdowns", handler);
    },
    onCountdownRequest: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("island:countdowns:request", handler);
      return () => ipcRenderer.removeListener("island:countdowns:request", handler);
    },
    onWorkspace: (callback) => {
      const handler = (_event, payload) => callback(payload && typeof payload === "object" ? payload : {});
      ipcRenderer.on("island:workspace", handler);
      return () => ipcRenderer.removeListener("island:workspace", handler);
    },
    onWorkspaceRequest: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("island:workspace:request", handler);
      return () => ipcRenderer.removeListener("island:workspace:request", handler);
    },
    onSettingsChanged: (callback) => {
      const handler = (_event, settings) => callback(settings);
      ipcRenderer.on("island:settings-changed", handler);
      return () => ipcRenderer.removeListener("island:settings-changed", handler);
    },
    onWake: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("island:wake", handler);
      return () => ipcRenderer.removeListener("island:wake", handler);
    },
    onShortcutStatus: (callback) => {
      const handler = (_event, available) => callback(Boolean(available));
      ipcRenderer.on("island:shortcut-status", handler);
      return () => ipcRenderer.removeListener("island:shortcut-status", handler);
    }
  },
  navigation: {
    onRequest: (callback) => {
      const handler = (_event, page) => callback(page);
      ipcRenderer.on("app:navigate", handler);
      return () => ipcRenderer.removeListener("app:navigate", handler);
    }
  },
  translate: (request) => ipcRenderer.invoke("translate:text", request)
});
