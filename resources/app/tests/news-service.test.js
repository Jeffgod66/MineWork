"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { NEWS_CATEGORIES } = require("../news-model");
const { DEFAULT_SOURCE_REGISTRY, createNewsService } = require("../news-service");

function rss(items) {
  return `<rss><channel>${items.map((item) => `<item><title>${item.title}</title><link>${item.url}</link><source>${item.source || "源"}</source>${item.date ? `<pubDate>${item.date}</pubDate>` : ""}</item>`).join("")}</channel></rss>`;
}

function registryFor(overrides = {}) {
  return Object.fromEntries(NEWS_CATEGORIES.map((category) => [category, overrides[category] || [
    { id: `${category}-a`, name: `${category} A`, type: "rss", url: `https://feeds.test/${category}/a`, group: category },
    { id: `${category}-b`, name: `${category} B`, type: "rss", url: `https://feeds.test/${category}/b`, group: `${category}-b` }
  ]]));
}

function makeService({ registry = registryFor(), responses = {}, clock = { value: Date.parse("2026-08-13T08:00:00Z") }, cache = new Map() } = {}) {
  const calls = [];
  const writes = [];
  const service = createNewsService({
    sourceRegistry: registry,
    fetchText: async (request) => {
      calls.push(request.url);
      const value = responses[request.url];
      if (value instanceof Error) throw value;
      return value === undefined ? rss([{ title: request.name, url: `${request.url}/story` }]) : value;
    },
    fetchJson: async (request) => responses[request.url],
    readCache: async (key) => cache.get(key) || null,
    writeCache: async (key, value) => { writes.push({ key, value }); cache.set(key, value); },
    now: () => clock.value,
    ttlMs: 600000
  });
  return { service, calls, writes, cache, clock };
}

test("default Bing requests use its RSS response contract", () => {
  for (const category of NEWS_CATEGORIES) {
    const bing = DEFAULT_SOURCE_REGISTRY[category].find((provider) => provider.name === "Bing News");
    assert.match(bing.url, /\/news\/search\?q=[^&]+&format=rss&setlang=zh-cn$/);
  }
});

test("production general registry balances at least three meaningful category groups without monopoly", async () => {
  const general = DEFAULT_SOURCE_REGISTRY.general;
  const groups = [...new Set(general.map((provider) => provider.group))];
  assert.ok(groups.length >= 3, `expected at least three production groups, got ${groups.join(", ")}`);
  assert.ok(groups.every((group) => NEWS_CATEGORIES.includes(group) && group !== "general"));

  const responses = Object.fromEntries(general.map((provider) => [provider.url,
    provider.type === "json"
      ? { data: { cards: [{ content: [{ content: Array.from({ length: 12 }, (_, index) => ({ word: `${provider.group} ${index}`, url: `https://news.test/${provider.id}/${index}` })) }] }] } }
      : rss(Array.from({ length: 12 }, (_, index) => ({ title: `${provider.group} ${index}`, url: `https://news.test/${provider.id}/${index}` })))
  ]));
  const result = await makeService({ registry: DEFAULT_SOURCE_REGISTRY, responses }).service.fetchCategory("general", { force: true });
  const counts = result.items.reduce((map, article) => map.set(article.providerGroup, (map.get(article.providerGroup) || 0) + 1), new Map());
  assert.equal(result.items.length, 20);
  assert.ok(counts.size >= 3);
  assert.ok(Math.max(...counts.values()) < result.items.length / 2, `one production group monopolized: ${JSON.stringify([...counts])}`);
});

test("all exact categories are supported and invalid categories fail explicitly", async () => {
  const { service } = makeService();
  for (const category of NEWS_CATEGORIES) {
    const result = await service.fetchCategory(category);
    assert.equal(result.ok, true);
    assert.equal(result.category, category);
  }
  const invalid = await service.fetchCategory("sports");
  assert.deepEqual(invalid.items, []);
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /category/i);
});

test("partial provider success yields honest underfill and records only successful providers", async () => {
  const registry = registryFor({ finance: [
    { id: "bad", name: "Bad", type: "rss", url: "https://feeds.test/bad" },
    { id: "good", name: "Good", type: "rss", url: "https://feeds.test/good" }
  ] });
  const { service } = makeService({ registry, responses: {
    "https://feeds.test/bad": new Error("offline"),
    "https://feeds.test/good": rss([{ title: "Only item", url: "https://news.test/only" }])
  } });
  const result = await service.fetchCategory("finance");
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.providers, ["Good"]);
});

test("dedupes by URL then normalized title, keeps newest winner, orders newest first and unknown dates stably", async () => {
  const registry = registryFor({ ai: [
    { id: "one", name: "One", type: "rss", url: "https://feeds.test/one" },
    { id: "two", name: "Two", type: "rss", url: "https://feeds.test/two" }
  ] });
  const responses = {
    "https://feeds.test/one": rss([
      { title: "Duplicate", url: "https://news.test/dup?utm_source=x", date: "Mon, 10 Aug 2026 01:00:00 GMT" },
      { title: "Unknown A", url: "https://news.test/a" },
      { title: "Same headline!", url: "https://news.test/title-old", date: "Mon, 10 Aug 2026 02:00:00 GMT" }
    ]),
    "https://feeds.test/two": rss([
      { title: "Duplicate newer", url: "https://news.test/dup", date: "Tue, 11 Aug 2026 01:00:00 GMT" },
      { title: "Unknown B", url: "https://news.test/b" },
      { title: "Same headline", url: "https://news.test/title-new", date: "Wed, 12 Aug 2026 01:00:00 GMT" }
    ])
  };
  const result = await makeService({ registry, responses }).service.fetchCategory("ai");
  assert.deepEqual(result.items.map((item) => item.title), ["Same headline", "Duplicate newer", "Unknown A", "Unknown B"]);
});

test("caps at twenty without fabricating underfilled feeds", async () => {
  const registry = registryFor({ society: [{ id: "many", name: "Many", type: "rss", url: "https://feeds.test/many" }] });
  const items = Array.from({ length: 25 }, (_, index) => ({ title: `Story ${index}`, url: `https://news.test/${index}` }));
  const result = await makeService({ registry, responses: { "https://feeds.test/many": rss(items) } }).service.fetchCategory("society");
  assert.equal(result.items.length, 20);
  const under = await makeService({ registry, responses: { "https://feeds.test/many": rss(items.slice(0, 3)) } }).service.fetchCategory("society");
  assert.equal(under.items.length, 3);
});

test("uses independent category caches, honors force, and returns stale success without overwriting it", async () => {
  const setup = makeService();
  const first = await setup.service.fetchCategory("technology");
  await setup.service.fetchCategory("technology");
  assert.equal(setup.calls.length, 2, "two providers called only on initial load");
  await setup.service.fetchCategory("finance");
  assert.equal(setup.calls.length, 4, "finance has an independent cache key");
  await setup.service.fetchCategory("technology", { force: true });
  assert.equal(setup.calls.length, 6);
  setup.clock.value += 700000;
  for (const url of setup.calls.slice(0, 2)) setup.cache.set(`response:${url}`, new Error("unused"));
  const prior = setup.cache.get("news:technology");
  const failing = createNewsService({
    sourceRegistry: registryFor(), fetchText: async () => { throw new Error("offline now"); }, fetchJson: async () => { throw new Error("offline now"); },
    readCache: async (key) => setup.cache.get(key), writeCache: async () => { throw new Error("must not write failure"); }, now: () => setup.clock.value, ttlMs: 600000
  });
  const stale = await failing.fetchCategory("technology");
  assert.equal(stale.ok, true);
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.items, prior.items);
  assert.match(stale.error, /offline now/);
});

test("zero-valid aggregates fail, while fetchAll isolates failures in category order", async () => {
  const registry = registryFor({ "china-politics": [{ id: "empty", name: "Empty", type: "rss", url: "https://feeds.test/empty" }] });
  const setup = makeService({ registry, responses: { "https://feeds.test/empty": "<rss><channel><item><title>bad</title><link>javascript:x</link></item></channel></rss>" } });
  const empty = await setup.service.fetchCategory("china-politics");
  assert.equal(empty.ok, false);
  assert.deepEqual(empty.items, []);
  const all = await setup.service.fetchAll();
  assert.deepEqual(all.map((entry) => entry.category), NEWS_CATEGORIES);
  assert.equal(all.find((entry) => entry.category === "china-politics").ok, false);
  assert.ok(all.filter((entry) => entry.ok).length >= 7);
});

test("general round-robin balance prevents one provider group monopolizing alternatives", async () => {
  const registry = registryFor({ general: [
    { id: "domestic", name: "Domestic", type: "rss", url: "https://feeds.test/domestic", group: "china-politics" },
    { id: "world", name: "World", type: "rss", url: "https://feeds.test/world", group: "international" },
    { id: "tech", name: "Tech", type: "rss", url: "https://feeds.test/tech", group: "technology" }
  ] });
  const responses = {
    "https://feeds.test/domestic": rss(Array.from({ length: 20 }, (_, i) => ({ title: `Domestic ${i}`, url: `https://news.test/d${i}` }))),
    "https://feeds.test/world": rss(Array.from({ length: 4 }, (_, i) => ({ title: `World ${i}`, url: `https://news.test/w${i}` }))),
    "https://feeds.test/tech": rss(Array.from({ length: 4 }, (_, i) => ({ title: `Tech ${i}`, url: `https://news.test/t${i}` })))
  };
  const result = await makeService({ registry, responses }).service.fetchCategory("general");
  assert.equal(result.items.length, 20);
  assert.ok(result.items.slice(0, 9).some((item) => item.title.startsWith("World")));
  assert.ok(result.items.slice(0, 9).some((item) => item.title.startsWith("Tech")));
  assert.ok(result.items.filter((item) => item.title.startsWith("Domestic")).length < 20);
});

test("snapshot returns defensive category and all-category state", async () => {
  const { service } = makeService();
  await service.fetchCategory("culture-sports");
  const one = service.snapshot("culture-sports");
  one.items.length = 0;
  assert.equal(service.snapshot("culture-sports").items.length, 2);
  assert.deepEqual(Object.keys(service.snapshot()), NEWS_CATEGORIES);
});
