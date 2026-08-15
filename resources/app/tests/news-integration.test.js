"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { NEWS_CATEGORIES } = require("../news-model");
const { createNewsController } = require("../renderer/news-controller");

function item(title, category = "general") { return { title, source: "Source", url: `https://news.test/${encodeURIComponent(title)}`, category }; }

test("category switching is isolated and a failed merge never clears another category", () => {
  const controller = createNewsController();
  controller.merge({ ok: true, category: "general", items: [item("General")], providers: ["A"], updatedAt: "2026-08-13T00:00:00Z" });
  controller.switchCategory("finance");
  controller.merge({ ok: false, category: "finance", items: [], error: "offline" });
  assert.equal(controller.snapshot().activeNewsCategory, "finance");
  assert.equal(controller.snapshot().categories.finance.status, "error");
  assert.equal(controller.snapshot().categories.general.items[0].title, "General");
});

test("local search filters title and source and render projection never exceeds twenty", () => {
  const controller = createNewsController();
  controller.merge({ ok: true, category: "general", items: Array.from({ length: 25 }, (_, i) => ({ ...item(`Story ${i}`), source: i === 4 ? "Needle Source" : "Other" })) });
  assert.equal(controller.projection().length, 20);
  controller.setQuery("needle");
  assert.deepEqual(controller.projection().map((entry) => entry.title), ["Story 4"]);
});

test("read state changes only after a successful HTTPS external open", async () => {
  let succeed = false;
  const controller = createNewsController({ openExternal: async () => ({ ok: succeed }) });
  controller.merge({ ok: true, category: "general", items: [item("Safe"), { ...item("Unsafe"), url: "http://news.test/unsafe" }] });
  assert.equal(await controller.open(0), false);
  assert.equal(controller.snapshot().newsReadIds.length, 0);
  succeed = true;
  assert.equal(await controller.open(0), true);
  assert.equal(controller.snapshot().newsReadIds.length, 1);
  assert.equal(await controller.open(1), false);
  assert.equal(controller.snapshot().newsReadIds.length, 1);
});

test("retry and refresh target the active category", () => {
  const controller = createNewsController();
  controller.switchCategory("ai");
  assert.deepEqual(controller.request("retry"), { category: "ai", force: true });
  assert.deepEqual(controller.request("refresh"), { category: "ai", force: true });
  assert.deepEqual(controller.request("lazy"), { category: "ai", force: false });
});

test("static UI exposes all accessible tabs and news controls", () => {
  const root = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "renderer/index.html"), "utf8");
  const preload = fs.readFileSync(path.join(root, "preload.js"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  for (const category of NEWS_CATEGORIES) assert.match(html, new RegExp(`data-news-category=["']${category}["']`));
  assert.match(html, /role=["']tablist["']/);
  assert.match(html, /id=["']newsSearch["']/);
  assert.match(html, /id=["']refreshNews["']/);
  assert.match(preload, /newsCategory/);
  assert.match(preload, /newsAll/);
  assert.match(main, /network:news:category/);
  assert.match(main, /network:news:all/);
});
