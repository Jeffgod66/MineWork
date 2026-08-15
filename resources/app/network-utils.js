"use strict";

function decodeXml(value) {
  return String(value || "")
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function rssTag(block, name) {
  const match = String(block || "").match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return decodeXml(match?.[1]?.trim() || "").replace(/<[^>]+>/g, "").trim();
}

function parseRssItems(xml, fallbackSource, limit = 12) {
  return [...String(xml || "").matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map((match) => ({
      title: rssTag(match[1], "title").replace(/\s+-\s+[^-]+$/, ""),
      url: rssTag(match[1], "link"),
      source: rssTag(match[1], "source") || String(fallbackSource || "实时资讯"),
      publishedAt: rssTag(match[1], "pubDate")
    }))
    .map((item) => {
      if (item.publishedAt && Number.isNaN(Date.parse(item.publishedAt))) item.publishedAt = "";
      return item;
    })
    .filter((item) => {
      if (!item.title) return false;
      try { return new URL(item.url).protocol === "https:"; } catch { return false; }
    })
    .sort((left, right) => {
      const leftTime = Date.parse(left.publishedAt) || 0;
      const rightTime = Date.parse(right.publishedAt) || 0;
      return rightTime - leftTime;
    })
    .slice(0, Math.max(0, Math.trunc(Number(limit) || 0)));
}

function parseBaiduHotItems(payload, limit = 12) {
  const groups = Array.isArray(payload?.data?.cards)
    ? payload.data.cards.flatMap((card) => Array.isArray(card?.content) ? card.content : [])
    : [];
  return groups
    .flatMap((group) => Array.isArray(group?.content) ? group.content : [])
    .map((item) => ({
      title: String(item?.word || item?.query || "").trim(),
      url: String(item?.url || "").trim(),
      source: "百度热榜",
      publishedAt: "",
      heat: String(item?.hotScore || item?.hot || "").trim()
    }))
    .filter((item) => {
      if (!item.title) return false;
      try { return new URL(item.url).protocol === "https:"; } catch { return false; }
    })
    .slice(0, Math.max(0, Math.trunc(Number(limit) || 0)));
}

function createSuccessCache(now = Date.now) {
  const values = new Map();
  return {
    async get(key, maxAge, loader) {
      const cached = values.get(key);
      const currentTime = Number(now());
      if (cached && currentTime - cached.at < maxAge) return cached.value;
      const value = await loader();
      if (value?.ok !== false) values.set(key, { at: currentTime, value });
      else values.delete(key);
      return value;
    },
    clear(key) {
      if (typeof key === "undefined") values.clear();
      else values.delete(key);
    }
  };
}

module.exports = { createSuccessCache, decodeXml, parseBaiduHotItems, parseRssItems, rssTag };
