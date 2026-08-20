"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const renderer = path.join(__dirname, "..", "renderer");
const html = fs.readFileSync(path.join(renderer, "island.html"), "utf8");
const js = fs.readFileSync(path.join(renderer, "island.js"), "utf8");
const css = fs.readFileSync(path.join(renderer, "island.css"), "utf8");
const uiModel = require(path.join(renderer, "ui-model.js"));

test("island exposes exactly ten real pages and compact controls", () => {
  assert.equal((html.match(/<article class="island-slide/g) || []).length, 10);
  assert.equal((html.match(/data-island-page="\d+"/g) || []).length, 10);
  assert.match(html, /schedule-slide/);
  assert.match(html, /countdown-slide/);
  assert.match(html, /focus-slide/);
  assert.match(html, /id="islandLock"/);
});

test("island removes the bottom signal information row and wheel hint", () => {
  assert.doesNotMatch(html, /id="islandSignalRail"/);
  assert.doesNotMatch(html, /滚轮切换/);
  assert.doesNotMatch(js, /renderSignalRail/);
});

test("page switching does not force layout or replay blur keyframes", () => {
  assert.doesNotMatch(js, /offsetWidth/);
  assert.doesNotMatch(js, /page-shift/);
  assert.doesNotMatch(css, /page-shift/);
  assert.doesNotMatch(js, /island-r[xy]/);
  assert.match(css, /--island-motion-page:\s*\.24s/);
  assert.doesNotMatch(css, /prism-track-(?:next|previous)/);
});

test("page switching carries direction and calm arc state without extra track writers", () => {
  assert.equal((js.match(/pageTrack\.style\.transform\s*=/g) || []).length, 1);
  assert.match(js, /dataset\.direction/);
  assert.match(js, /is-transitioning/);
  assert.match(css, /--page-arc:\s*5px/);
  assert.match(css, /opacity:\s*\.92/);
  assert.doesNotMatch(css, /@keyframes\s+island-track-(?:next|previous)/);
});

test("motion contract mutation rejects a second transform writer and layout read", () => {
  const extraWriter = `${js}\npageTrack.style.transform = "translateX(0)";`;
  const forcedLayout = `${js}\nvoid pageTrack.offsetWidth;`;
  assert.equal((extraWriter.match(/pageTrack\.style\.transform\s*=/g) || []).length, 2);
  assert.match(forcedLayout, /offsetWidth/);
});

test("notification attention is an overlay, not an eleventh page, and exposes real actions", () => {
  assert.equal((html.match(/<article class="island-slide/g) || []).length, 10);
  assert.match(html, /id="islandNotificationOverlay"/);
  assert.match(html, /id="islandNotificationUnread"/);
  assert.match(html, /id="islandNotificationSource"/);
  assert.match(html, /id="islandNotificationCount"/);
  assert.match(html, /data-notification-action="read"/);
  assert.match(html, /data-notification-action="open"/);
  assert.match(html, /data-notification-action="dismiss"/);
  assert.match(js, /notifications\.onDelivery/);
  assert.match(js, /notifications\.markRead/);
  assert.match(js, /notifications\.dismiss/);
  assert.doesNotMatch(js, /islandNotification[\s\S]{0,160}pageTrack\.style\.transform/);
});

test("notification deliveries run through the queue controller with grouping and a bounded timeout", () => {
  assert.match(html, /island-notification-controller\.js/);
  assert.match(js, /createIslandNotificationController/);
  assert.match(js, /showNotificationDelivery\(delivery[^)]*\)\s*\{[^}]*notificationController\.enqueue\(delivery\)/s);
  assert.match(js, /notificationController\.setBlocked\(true\)/);
  assert.match(js, /notificationController\.setBlocked\(false\)/);
  assert.match(js, /notificationController\.handle\(/);
  assert.match(js, /timeoutMs:\s*8000/);
  assert.doesNotMatch(js, /pendingNotificationDelivery/);
  assert.doesNotMatch(js, /activeNotification/);
});

test("a coalesced page switch retains its stored direction and attention restores idle click-through", () => {
  assert.match(js, /pendingPageIntent = intent\.pending/);
  assert.match(js, /showPage\(intent\.target \?\? intent, intent\.direction \?\? "none"\)/);
  assert.match(js, /pendingPageIntent = \{ target, direction \}/);
  assert.match(js, /islandAttentionPolicy/);
  assert.match(js, /applyNotificationAttention/);
  assert.match(js, /!notificationAttention/);
  assert.match(js, /policy\.interaction === "idle"/);
});

test("idle pass-through uses eight seconds and native interaction IPC", () => {
  assert.match(js, /8000/);
  assert.match(js, /setInteraction\(\{\s*idle:\s*true/);
  assert.match(js, /setInteraction\(\{\s*idle:\s*false/);
  assert.match(js, /setLocked/);
  assert.match(js, /document\.body\.classList\.contains\("idle-dim"\)[\s\S]*resetIdleFade\(\)/);
  assert.match(js, /api\.island\.getSettings\(\)/);
});

test("final calm-motion layer fixes geometry and blur", () => {
  assert.match(css, /CALM ISLAND AUTHORITATIVE LAYER/);
  assert.match(css, /width:\s*306px/);
  assert.match(css, /height:\s*48px/);
  assert.match(css, /border-radius:\s*24px/);
  assert.match(css, /backdrop-filter:\s*blur\(10px\)/);
  assert.match(css, /body\.idle-dim:not\(\.expanded\)\s+\.island-shell\s*\{[^}]*opacity:\s*\.3/s);
});

test("workspace sync supplies real schedule data to the new page", () => {
  const app = fs.readFileSync(path.join(renderer, "app.js"), "utf8");
  assert.match(app, /events:\s*state\.calendarEvents/);
  assert.match(js, /workspaceState\.events/);
  assert.match(js, /轻一点，也能走得更远。/);
});

test("weather projection defaults to primary and retains legacy primary summary", () => {
  const projected = uiModel.weatherWorkspaceProjection({
    weatherSettings: { locations: [
      { id: "a", city: "上海" }, { id: "b", city: "伦敦" }
    ], order: ["b", "a"], primaryLocationId: "a", islandAutoRotate: true, islandRotateSeconds: 9 },
    weatherResults: {
      a: { status: "ok", current: { temperature_2m: 26, weather_code: 1 }, daily: { temperature_2m_max: [30], temperature_2m_min: [22] }, updatedAt: "2026-08-13T01:00:00.000Z" },
      b: { status: "stale", current: { temperature_2m: 18, weather_code: 3 }, daily: { temperature_2m_max: [20], temperature_2m_min: [15] }, updatedAt: "2026-08-13T00:00:00.000Z" }
    },
    describeWeather: (code) => `天气${code}`
  });
  assert.deepEqual(projected.weatherLocations.map((item) => item.id), ["b", "a"]);
  assert.equal(projected.primaryWeatherLocationId, "a");
  assert.equal(projected.weather.city, "上海");
  assert.deepEqual(projected.weatherIslandSettings, { autoRotate: true, rotateSeconds: 9 });
});

test("weather rotation wraps previous/next, suppresses timers when off or one item, and cleans up", () => {
  const scheduled = [];
  const cleared = [];
  const controller = uiModel.createWeatherRotationController({
    setTimer: (fn, ms) => { const timer = { fn, ms }; scheduled.push(timer); return timer; },
    clearTimer: (timer) => cleared.push(timer),
    onChange: () => {}
  });
  controller.configure({ locationIds: ["a"], primaryId: "a", autoRotate: true, rotateSeconds: 8 });
  assert.equal(scheduled.length, 0);
  controller.configure({ locationIds: ["a", "b"], primaryId: "a", autoRotate: false, rotateSeconds: 8 });
  assert.equal(scheduled.length, 0);
  controller.configure({ locationIds: ["a", "b"], primaryId: "a", autoRotate: true, rotateSeconds: 8 });
  assert.equal(controller.current(), "a");
  assert.equal(scheduled.at(-1).ms, 8000);
  assert.equal(controller.previous(), "b");
  assert.equal(controller.next(), "a");
  controller.dispose();
  assert.ok(cleared.length >= 1);
});

test("weather rotation pauses and resumes after interaction grace", () => {
  const scheduled = [];
  const controller = uiModel.createWeatherRotationController({
    setTimer: (fn, ms) => { const timer = { fn, ms }; scheduled.push(timer); return timer; },
    clearTimer: () => {},
    interactionGraceMs: 3000,
    onChange: () => {}
  });
  controller.configure({ locationIds: ["a", "b"], primaryId: "a", autoRotate: true, rotateSeconds: 5 });
  controller.pause("hover");
  assert.equal(controller.isPaused(), true);
  controller.resume("hover");
  assert.equal(controller.isPaused(), false);
  assert.equal(scheduled.at(-1).ms, 3000);
  scheduled.at(-1).fn();
  assert.equal(scheduled.at(-1).ms, 5000);
});

test("weather UI retains location actions and island controls without adding a page", () => {
  const appHtml = fs.readFileSync(path.join(renderer, "index.html"), "utf8");
  assert.match(appHtml, /id="weatherLocationTabs"/);
  assert.match(appHtml, /id="refreshWeatherAll"/);
  assert.match(html, /id="islandWeatherPrevious"/);
  assert.match(html, /id="islandWeatherNext"/);
  assert.match(html, /id="islandWeatherPosition"/);
  assert.equal((html.match(/<article class="island-slide/g) || []).length, 10);
});
