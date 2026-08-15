"use strict";

const NEWS_CATEGORIES = ["general", "china-politics", "international", "finance", "technology", "ai", "society", "culture-sports"];

function normalizedTitle(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").replace(/\uFF01/g, "!").replace(/\uFF0C/g, ",").replace(/\u3002/g, ".").replace(/[!,.?;:]+$/g, "").trim().toLocaleLowerCase() : "";
}

function cleanUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    for (const key of [...url.searchParams.keys()]) if (/^(utm_[^=]+|fbclid|gclid|mc_[^=]+)$/i.test(key)) url.searchParams.delete(key);
    return url.toString();
  } catch { return null; }
}

function normalizeNewsItem(raw, category) {
  if (!raw || typeof raw !== "object" || !NEWS_CATEGORIES.includes(category)) return null;
  const url = cleanUrl(raw.url);
  const title = typeof raw.title === "string" ? raw.title.trim().replace(/\s+/g, " ") : "";
  if (!url || !title) return null;
  const item = { ...raw, url, title, category };
  if (raw.publishedAt !== undefined) {
    const time = Date.parse(raw.publishedAt);
    if (!Number.isNaN(time)) item.publishedAt = new Date(time).toISOString();
    else delete item.publishedAt;
  }
  return item;
}

function isNewer(candidate, existing) {
  const candidateTime = Date.parse(candidate.publishedAt);
  const existingTime = Date.parse(existing.publishedAt);
  return !Number.isNaN(candidateTime) && (Number.isNaN(existingTime) || candidateTime > existingTime);
}

function dedupeNewsItems(items) {
  const results = [];
  const urlIndex = new Map();
  const titleIndex = new Map();
  for (const raw of Array.isArray(items) ? items : []) {
    const item = normalizeNewsItem(raw, NEWS_CATEGORIES.includes(raw && raw.category) ? raw.category : "general");
    if (!item) continue;
    const key = normalizedTitle(item.title);
    let index = urlIndex.get(item.url);
    if (index === undefined) index = titleIndex.get(key);
    if (index === undefined) {
      index = results.length;
      results.push(item);
    } else if (isNewer(item, results[index])) {
      const previous = results[index];
      urlIndex.delete(previous.url);
      titleIndex.delete(normalizedTitle(previous.title));
      results[index] = item;
    } else continue;
    urlIndex.set(item.url, index);
    titleIndex.set(key, index);
  }
  return results.map((item) => ({ ...item }));
}

function buildCategoryFeed(items, limit = 20) {
  const max = Math.min(20, Math.max(0, Number.isFinite(limit) ? Math.floor(limit) : 20));
  return dedupeNewsItems(items).slice(0, max);
}

module.exports = { NEWS_CATEGORIES, normalizeNewsItem, dedupeNewsItems, buildCategoryFeed };
