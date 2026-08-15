"use strict";

const { NEWS_CATEGORIES, dedupeNewsItems } = require("./news-model");
const { parseBaiduHotItems, parseRssItems } = require("./network-utils");

const QUERY_LABELS = Object.freeze({
  general: "今日热点",
  "china-politics": "中国 时政",
  international: "国际 新闻",
  finance: "财经 金融",
  technology: "科技",
  ai: "人工智能 AI",
  society: "社会 民生",
  "culture-sports": "文化 体育"
});

function rssRequest(id, name, base, query, group, suffix = "") {
  return Object.freeze({ id, name, type: "rss", url: `${base}${encodeURIComponent(query)}${suffix}`, group });
}

const DEFAULT_SOURCE_REGISTRY = Object.freeze(Object.fromEntries(NEWS_CATEGORIES.map((category) => {
  const query = QUERY_LABELS[category];
  if (category === "general") return [category, Object.freeze([
    Object.freeze({ id: "baidu-hot", name: "百度热榜", type: "json", url: "https://top.baidu.com/api/board?platform=wise&tab=realtime", group: "china-politics" }),
    rssRequest("bing-general-international", "Bing News", "https://www.bing.com/news/search?q=", QUERY_LABELS.international, "international", "&format=rss&setlang=zh-cn"),
    rssRequest("google-general-technology", "Google News", "https://news.google.com/rss/search?hl=zh-CN&gl=CN&ceid=CN:zh-Hans&q=", `${QUERY_LABELS.technology} ${QUERY_LABELS.ai}`, "technology")
  ])];
  const sources = [
    rssRequest(`bing-${category}`, "Bing News", "https://www.bing.com/news/search?q=", query, category, "&format=rss&setlang=zh-cn"),
    rssRequest(`google-${category}`, "Google News", "https://news.google.com/rss/search?hl=zh-CN&gl=CN&ceid=CN:zh-Hans&q=", query, category)
  ];
  return [category, Object.freeze(sources)];
})));

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

function dateValue(value) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function timeIso(now) {
  const raw = typeof now === "function" ? now() : Date.now();
  const date = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function ordered(items) {
  return items.map((item, index) => ({ item, index, time: dateValue(item.publishedAt) }))
    .sort((a, b) => {
      if (a.time !== null && b.time !== null) return b.time - a.time || a.index - b.index;
      if (a.time !== null) return -1;
      if (b.time !== null) return 1;
      return a.index - b.index;
    }).map((entry) => entry.item);
}

function balanced(groups, max = 20) {
  const queues = groups.filter((group) => group.items.length).map((group) => ({ ...group, cursor: 0 }));
  const picked = [];
  while (picked.length < max && queues.some((queue) => queue.cursor < queue.items.length)) {
    for (const queue of queues) {
      if (picked.length >= max) break;
      if (queue.cursor < queue.items.length) picked.push(queue.items[queue.cursor++]);
    }
  }
  return picked;
}

function cachedSuccess(raw, category) {
  const candidate = raw?.value && typeof raw.value === "object" ? raw.value : raw;
  if (!candidate || candidate.ok !== true || candidate.category !== category || !Array.isArray(candidate.items) || !candidate.updatedAt) return null;
  const items = ordered(dedupeNewsItems(candidate.items)).slice(0, 20);
  if (!items.length) return null;
  return { ok: true, category, items, updatedAt: candidate.updatedAt, providers: Array.isArray(candidate.providers) ? candidate.providers.map(String) : [], stale: false, error: "" };
}

function createNewsService({ sourceRegistry = DEFAULT_SOURCE_REGISTRY, fetchText, fetchJson, readCache, writeCache, now = Date.now, ttlMs = 600000 } = {}) {
  if (typeof fetchText !== "function" || typeof fetchJson !== "function") throw new TypeError("fetchText and fetchJson are required");
  const read = typeof readCache === "function" ? readCache : async () => null;
  const write = typeof writeCache === "function" ? writeCache : async () => {};
  const memory = new Map();

  function failure(category, error, prior) {
    const message = String(error?.message || error || "News providers unavailable");
    if (prior) return { ...clone(prior), stale: true, error: message };
    return { ok: false, category, items: [], updatedAt: null, providers: [], stale: false, error: message };
  }

  async function loadProvider(provider, category) {
    if (!provider || typeof provider !== "object" || !provider.name || !provider.url) throw new Error("Malformed news provider");
    let url;
    try { url = new URL(provider.url); } catch { throw new Error(`${provider.name} URL is malformed`); }
    if (url.protocol !== "https:") throw new Error(`${provider.name} URL must use HTTPS`);
    const request = { ...provider, category, url: url.toString() };
    const raw = provider.type === "json" ? parseBaiduHotItems(await fetchJson(request), 40) : parseRssItems(await fetchText(request), provider.name, 40);
    const items = raw.map((item) => ({ ...item, category, provider: provider.name, providerGroup: provider.group || provider.id || provider.name }));
    const valid = ordered(dedupeNewsItems(items));
    if (!valid.length) throw new Error(`${provider.name} returned zero valid articles`);
    return { name: String(provider.name), group: String(provider.group || provider.id || provider.name), items: valid };
  }

  async function fetchCategory(category, { force = false } = {}) {
    if (!NEWS_CATEGORIES.includes(category)) return failure(String(category || ""), "Invalid news category");
    const key = `news:${category}`;
    const current = new Date(timeIso(now));
    let prior = memory.get(category) || cachedSuccess(await read(key), category);
    if (prior) memory.set(category, prior);
    if (prior && !force) {
      const age = current.getTime() - new Date(prior.updatedAt).getTime();
      if (Number.isFinite(age) && age >= 0 && age < ttlMs) return clone(prior);
    }
    const providers = Array.isArray(sourceRegistry?.[category]) ? sourceRegistry[category] : [];
    if (!providers.length) return failure(category, "No news providers configured", prior);
    const settled = await Promise.allSettled(providers.map((provider) => loadProvider(provider, category)));
    const successful = settled.filter((entry) => entry.status === "fulfilled").map((entry) => entry.value);
    if (!successful.length) {
      const errors = settled.filter((entry) => entry.status === "rejected").map((entry) => entry.reason?.message).filter(Boolean);
      return failure(category, errors.join("; ") || "News providers unavailable", prior);
    }
    const candidates = category === "general" ? balanced(successful, 40) : successful.flatMap((entry) => entry.items);
    const items = (category === "general" ? dedupeNewsItems(candidates) : ordered(dedupeNewsItems(candidates))).slice(0, 20);
    if (!items.length) return failure(category, "News providers returned zero valid articles", prior);
    const result = { ok: true, category, items, updatedAt: current.toISOString(), providers: successful.map((entry) => entry.name), stale: false, error: "" };
    await write(key, clone(result));
    memory.set(category, clone(result));
    return clone(result);
  }

  async function fetchAll(options = {}) {
    return Promise.all(NEWS_CATEGORIES.map(async (category) => {
      try { return await fetchCategory(category, options); } catch (error) { return failure(category, error, memory.get(category)); }
    }));
  }

  function snapshot(category) {
    if (category !== undefined) return clone(memory.get(category) || null);
    return Object.fromEntries(NEWS_CATEGORIES.map((name) => [name, clone(memory.get(name) || null)]));
  }

  return Object.freeze({ fetchCategory, fetchAll, snapshot });
}

module.exports = { DEFAULT_SOURCE_REGISTRY, createNewsService };
