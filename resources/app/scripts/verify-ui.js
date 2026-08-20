"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};

const html = read("renderer/index.html");
const css = read("renderer/styles.css");
const app = read("renderer/app.js");
const islandHtml = read("renderer/island.html");
const islandCss = read("renderer/island.css");
const islandJs = read("renderer/island.js");
const main = read("main.js");
const splash = read("renderer/splash.html");
const uiModel = read("renderer/ui-model.js");
const networkUtils = read("network-utils.js");
const appIcon = read("assets/minework.svg");
const sprite = read("renderer/icon-sprite.svg");

const pages = [
  "home", "tasks", "calendar", "weather", "news", "favorites", "notes", "library", "hydration",
  "reflection", "island", "ai", "shortcuts", "countdown", "translate", "performance", "music", "mail"
];

pages.forEach((page) => check(html.includes(`id="page-${page}"`), `missing page ${page}`));
check(html.includes('data-page="notifications"'), "missing notifications navigation");
check(html.includes('id="page-notifications"'), "missing notifications page");
check(html.includes('data-notification-filter="unread"') && html.includes('data-notification-filter="health"'), "missing notification filters");
check(html.includes('id="notificationSettingsForm"') && html.includes('name="channels.windows"'), "missing notification settings form");
check(html.includes('id="mailPrivacy"') && html.includes('name="mailPrivacy"'), "missing functional mail privacy setting");
check(html.includes("通知总开关") && html.includes("免打扰") && html.includes("节假日提醒") && html.includes("更多提醒设置"), "notification settings are not Chinese-first");
check(html.includes('data-go="calendar"') && html.includes('data-go="hydration"') && html.includes("纪念日提前提醒") && html.includes("喝水间隔与时段"), "notification page lacks anniversary and hydration entry points");
check(app.includes("正在加载通知…") && app.includes('role="alert"'), "notification page lacks visible loading and error states");
check(!/閫氱煡|Mark all read/.test(html), "notification page still contains garbled or English copy");
check(html.includes('id="weatherLocationTabs"') && html.includes('id="refreshWeatherAll"'), "missing multi-location weather controls");
check(html.includes('id="hydrationGoalForm"') && [1500, 2000, 2500, 3000].every((goal) => html.includes(`data-hydration-goal="${goal}"`)), "missing bounded hydration goal controls");
check([150, 250, 350, 500].every((amount) => html.includes(`data-water="${amount}"`)) && html.includes('id="undoWater"') && html.includes('id="hydrationLog"'), "missing hydration quick add undo or log");
check(html.includes('id="hydrationReminderForm"') && html.includes('id="hydrationReminderEnabled"') && html.includes('id="hydrationReminderInterval"'), "missing hydration reminder controls");
check((html.match(/class="water-wave/g) || []).length === 2 && html.includes('class="water-bubbles"') && html.includes('class="goal-ripple"'), "hydration vessel requires two waves bubbles and ripple");
check(html.includes("../hydration-model.js") && html.includes("./hydration-controller.js"), "hydration controller scripts are not loaded");
check(css.includes("--water-level") && css.includes("prefers-reduced-motion") && css.includes(".water-wave") && css.includes(".water-bubbles") && css.includes(".goal-ripple"), "missing hydration motion or reduced-motion CSS");
check(!/\.water-(?:wave|bubbles)|\.goal-ripple/.test(css.replace(/transform|opacity/g, "")) || !/animation[^;}]*\b(?:top|bottom|left|right|width|height|margin|padding)\b/.test(css), "hydration animation uses layout properties");
check(app.includes("createHydrationController") && app.includes("hydrationMotionProjection"), "renderer does not use hydration controller and motion projection");
check(!html.includes("鐩爣 2.0L") && !app.includes("goal) || 2000"), "hydration projections retain a literal target dependency");
check(html.includes('id="weatherIslandAutoRotate"') && html.includes('id="weatherIslandRotateSeconds"') && html.includes('min="5"') && html.includes('max="60"'), "missing bounded island weather rotation settings");
check(app.includes("weatherSettings") && app.includes("weatherResults") && app.includes("selectedWeatherLocationId"), "missing multi-location weather renderer state");
check(islandHtml.includes('id="islandWeatherPrevious"') && islandHtml.includes('id="islandWeatherNext"') && islandHtml.includes('id="islandWeatherPosition"'), "missing island weather rotation controls");
check(islandJs.includes("createWeatherRotationController") && uiModel.includes("weatherWorkspaceProjection"), "missing executable island weather controller/projection");
check(main.includes('network:weather:batch') && main.includes("createWeatherService"), "missing weather service IPC integration");
const newsCategories = ["general", "china-politics", "international", "finance", "technology", "ai", "society", "culture-sports"];
newsCategories.forEach((category) => check(html.includes(`data-news-category="${category}"`), `missing news category ${category}`));
check(html.includes('id="newsSearch"') && html.includes('id="refreshNews"') && html.includes('id="refreshNewsAll"'), "missing categorized news controls");
check(main.includes('network:news:category') && main.includes('network:news:all') && main.includes("createNewsService"), "missing categorized news IPC integration");
["gmail", "outlook", "netease", "qqmail"].forEach((provider) => check(html.includes(`id="mailStatus-${provider}"`), `missing mail status ${provider}`));
check(sprite.includes('symbol id="bell"'), "missing bell symbol");

const quoteBlock = app.match(/const DAILY_QUOTES = \[([\s\S]*?)\n\];/);
check(quoteBlock, "missing DAILY_QUOTES");
const quoteCount = (quoteBlock[1].match(/^\s*"/gm) || []).length;
check(quoteCount === 60, `expected 60 quotes, found ${quoteCount}`);

check(html.includes("./ui-model.js"), "missing ui-model script");
check(html.includes("./ui-effects.js"), "missing ui-effects script");
check(fs.existsSync(path.join(root, "renderer/icon-sprite.svg")), "missing icon sprite");
check(css.includes("--ice-focus"), "missing B+ material tokens");
check(css.includes("--prism-mint") && css.includes("--prism-lavender") && css.includes("--prism-peach") && css.includes("--prism-lemon"), "missing Polar Prism tint tokens");
check(app.includes("PAGE_TONES"), "missing functional page tone mapping");
check(html.includes('class="brand-wordmark"') && !html.includes('class="brand-mark"'), "titlebar wordmark did not replace the app tile");
check(html.includes('src="./brand-wordmark.svg"') && splash.includes('src="./brand-wordmark.svg"'), "titlebar and splash do not share the local wordmark geometry");
check(fs.existsSync(path.join(root, "renderer/brand-wordmark.svg")), "missing local brand wordmark asset");
check(html.includes('id="noteImagePreview"') && app.includes("addNoteImages"), "missing pasted-image excerpt flow");
check(html.includes('class="calendar-workspace"') && html.includes('id="focusEventComposer"'), "missing calendar agenda workspace");
["events", "tasks", "officialHolidays", "traditionalFestivals", "internationalDates", "anniversaries"].forEach((filter) => check(html.includes(`data-calendar-filter="${filter}"`), `missing calendar category filter ${filter}`));
check(html.includes('id="anniversaryForm"') && html.includes('id="selectedDayFestivals"'), "missing lunar holiday anniversary calendar controls");
check(app.includes("calendarSignalVisibility") && app.includes("categoryVisible"), "calendar renderer does not map category switches to badges and labels");
check(main.includes('calendar:data:get') && main.includes('validateHolidaySnapshot') && app.includes('syncAnniversaries'), "missing validated calendar data and anniversary IPC integration");
check(html.includes('class="performance-cockpit"') && html.includes("performance-hero"), "missing adaptive performance cockpit");
[
  "performanceStatus", "performanceUpdated", "cpuSpeed", "cpuTopology", "memoryAvailable",
  "diskFree", "systemOs", "systemArch", "systemHost", "systemBoot"
].forEach((id) => check(html.includes(`id="${id}"`), `missing performance field ${id}`));
check(app.includes("performanceViewModel"), "performance renderer does not use the shared display model");
check(networkUtils.includes("createSuccessCache") && networkUtils.includes("parseRssItems"), "missing resilient news utilities");
check(css.includes("prefers-reduced-transparency"), "missing reduced transparency fallback");
check(css.includes("--page-pad-inline") && css.includes("100dvh"), "missing fluid viewport layout tokens");
check(css.includes("repeat(auto-fit") && css.includes("overflow-x: hidden"), "functional grids are not fluid or overflow guarded");
check(main.includes("minWidth: 840") && main.includes("minHeight: 600"), "main window minimum size does not reach the narrow responsive tier");
check(islandHtml.includes("./ui-model.js"), "island is not using the shared UI model");
check(!islandHtml.includes('id="islandSignalRail"') && !islandHtml.includes("滚轮切换"), "obsolete island bottom information row remains");
check((islandHtml.match(/<article class="island-slide/g) || []).length === 10, "island does not expose exactly ten pages");
check(islandHtml.includes('id="islandNotificationOverlay"') && islandHtml.includes('id="islandNotificationUnread"'), "island notification overlay is missing");
check(islandHtml.includes('id="islandNotificationSource"') && islandHtml.includes('id="islandNotificationCount"') && islandHtml.includes('data-notification-action="read"'), "island overlay lacks source, group count or mark-read action");
check(islandHtml.includes("./island-notification-controller.js") && islandJs.includes("createIslandNotificationController") && islandJs.includes("islandAttentionPolicy"), "island does not use the notification queue controller and attention policy");
check(islandJs.includes("islandPageIntent") && islandJs.includes("notifications.onDelivery"), "island lacks coalesced page intent or notification attention");
check((islandJs.match(/pageTrack\.style\.transform\s*=/g) || []).length === 1 && !/offsetWidth|getBoundingClientRect/.test(islandJs), "island page motion has extra transform writers or forced layout");
check(islandHtml.includes('id="islandLock"'), "missing island pass-through lock control");
check(islandHtml.includes('id="overviewHydration"') && islandHtml.includes('id="overviewCountdown"'), "missing island overview information flow");
check(islandCss.includes("CALM ISLAND AUTHORITATIVE LAYER") && islandCss.includes("--island-motion-page: .24s"), "missing calm island motion layer");
check(islandJs.includes("ISLAND_PHASES"), "missing island phase state machine");
check(!islandJs.includes("renderSignalRail") && islandJs.includes("renderNewPages"), "island page renderer does not match the ten-page design");
check(main.includes("island:collapse-ready"), "missing island collapse handshake");
check(main.includes('startupHolidayReminders = buildHolidayReminders(') && main.includes('writeWorkspaceValue("holiday-reminders", startupHolidayReminders)'), "startup does not rebuild holiday reminders from saved preferences");
const preload = read("preload.js");
const listenerProbe = /UserNotificationListener|NotificationListener|ListenForNotifications|Windows\.UI\.Notifications\.Management|ToastNotificationManagerCompat/.test(main) || /UserNotificationListener|NotificationListener|ListenForNotifications|Windows\.UI\.Notifications\.Management/.test(preload);
check(!listenerProbe, "native system-notification capture listener is present despite the cancelled scope");
check(uiModel.includes("workspaceSignalModel") && uiModel.includes("pageTransitionPlan") && uiModel.includes("islandMotionTiming"), "missing Polar Prism interaction models");
check(!html.includes("startup-overlay"), "duplicate main-window startup overlay remains");
check(splash.includes("PERSONAL WORKSPACE / 2026"), "startup did not restore the selected personal-workspace header");
check(splash.includes("ONE PLACE FOR FOCUSED WORK"), "startup did not restore the selected focus tagline");
check(splash.includes("brand-signature"), "startup is missing the expanded signature wordmark");
check(!splash.includes("assets/minework.svg") && !splash.includes("GLACIER COCKPIT / B+"), "startup still uses the icon or Glacier Cockpit variant");
check(main.includes("finishStartup(1980)") && main.includes("}, 460)"), "main-window reveal is not synchronized with the restored startup exit");

const appIconShapes = (appIcon.match(/<(?:path|rect)\b/g) || []).length;
check(appIconShapes <= 5, `minimal app icon has too many shapes: ${appIconShapes}`);
check(!appIcon.includes("<circle"), "minimal app icon still contains decorative circles");

[
  "house", "check-square", "calendar", "cloud-sun", "newspaper", "bookmark", "quotes", "books", "drop",
  "arrows-clockwise", "sparkle", "rocket-launch", "timer", "translate", "gauge", "music-notes", "envelope",
  "folder-open", "file-text", "trash", "arrow-square-out"
].forEach((id) => check(sprite.includes(`id="${id}"`), `missing icon ${id}`));

const png = fs.readFileSync(path.join(root, "assets/minework.png"));
check(png.toString("ascii", 1, 4) === "PNG", "minework.png is not PNG");
check(fs.existsSync(path.join(root, "assets/minework.ico")), "missing minework.ico");

console.log(`MineWork usability recovery verification passed: ${pages.length} pages, ${quoteCount} quotes, ${appIconShapes} icon shapes`);
