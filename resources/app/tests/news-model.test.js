"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../news-model.js");

test("NEWS_CATEGORIES catches missing product category IDs", () => {
  assert.deepEqual(model.NEWS_CATEGORIES, ["general", "china-politics", "international", "finance", "technology", "ai", "society", "culture-sports"]);
});

test("normalizeNewsItem catches insecure URLs and tracking parameter leakage", () => {
  assert.equal(model.normalizeNewsItem({ url: "http://example.com/a", title: "No" }, "general"), null);
  const item = model.normalizeNewsItem({ url: "https://example.com/a?utm_source=x&keep=1&fbclid=y", title: " Hello — world! " }, "general");
  assert.equal(item.url, "https://example.com/a?keep=1");
  assert.equal(item.category, "general");
});

test("dedupeNewsItems catches duplicate URLs and titles choosing an older item", () => {
  const items = [
    { url: "https://x.test/a?utm_source=x", title: "First", publishedAt: "2026-08-10T10:00:00.000Z" },
    { url: "https://x.test/a", title: "Second", publishedAt: "2026-08-11T10:00:00.000Z" },
    { url: "https://x.test/b", title: "Same title", publishedAt: "2026-08-10T10:00:00.000Z" },
    { url: "https://x.test/c", title: " same  title! ", publishedAt: "2026-08-12T10:00:00.000Z" }
  ];
  assert.deepEqual(model.dedupeNewsItems(items).map((item) => item.url), ["https://x.test/a", "https://x.test/c"]);
});

test("dedupeNewsItems catches timestamp-less articles changing source order", () => {
  const items = [{ url: "https://x.test/a", title: "A" }, { url: "https://x.test/b", title: "B" }];
  assert.deepEqual(model.dedupeNewsItems(items).map((item) => item.title), ["A", "B"]);
});

test("buildCategoryFeed catches fabricated fill and category feeds exceeding twenty", () => {
  const short = model.buildCategoryFeed([{ url: "https://x.test/a", title: "A", category: "ai" }]);
  assert.equal(short.length, 1);
  const many = Array.from({ length: 25 }, (_, index) => ({ url: `https://x.test/${index}`, title: String(index), category: "ai" }));
  assert.equal(model.buildCategoryFeed(many, 99).length, 20);
});
