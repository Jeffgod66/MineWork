"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSuccessCache, parseBaiduHotItems, parseRssItems } = require("../network-utils.js");

test("success cache does not pin a failed news result", async () => {
  let attempts = 0;
  const cache = createSuccessCache(() => 1000);
  const loader = async () => {
    attempts += 1;
    return attempts === 1 ? { ok: false, error: "temporary" } : { ok: true, items: [{ title: "恢复" }] };
  };

  assert.deepEqual(await cache.get("news", 600000, loader), { ok: false, error: "temporary" });
  assert.deepEqual(await cache.get("news", 600000, loader), { ok: true, items: [{ title: "恢复" }] });
  assert.equal(attempts, 2);
});

test("RSS parser decodes entities, sorts newest first and drops malformed links", () => {
  const xml = `
    <rss><channel>
      <item><title><![CDATA[较早 &amp; 有效]]></title><link>https://example.com/old</link><source>示例</source><pubDate>Mon, 10 Aug 2026 01:00:00 GMT</pubDate></item>
      <item><title>最新消息</title><link>https://example.com/new</link><pubDate>Tue, 11 Aug 2026 01:00:00 GMT</pubDate></item>
      <item><title>无效</title><link>javascript:alert(1)</link></item>
    </channel></rss>`;
  assert.deepEqual(parseRssItems(xml, "测试源", 10), [
    { title: "最新消息", url: "https://example.com/new", source: "测试源", publishedAt: "Tue, 11 Aug 2026 01:00:00 GMT" },
    { title: "较早 & 有效", url: "https://example.com/old", source: "示例", publishedAt: "Mon, 10 Aug 2026 01:00:00 GMT" }
  ]);
});

test("Baidu hot parser extracts safe ranked stories", () => {
  const payload = {
    success: true,
    data: {
      cards: [{ content: [{ content: [
        { word: "第一条热点", url: "https://m.baidu.com/s?word=1", hotScore: "982000" },
        { word: "不安全链接", url: "javascript:alert(1)" },
        { word: "第二条热点", url: "https://m.baidu.com/s?word=2", hotScore: "720000" }
      ] }] }]
    }
  };

  assert.deepEqual(parseBaiduHotItems(payload, 2), [
    { title: "第一条热点", url: "https://m.baidu.com/s?word=1", source: "百度热榜", publishedAt: "", heat: "982000" },
    { title: "第二条热点", url: "https://m.baidu.com/s?word=2", source: "百度热榜", publishedAt: "", heat: "720000" }
  ]);
});

test("RSS parser preserves mixed entities and source while rejecting non-HTTPS and malformed dates", () => {
  const xml = `<rss><channel>
    <item><title><![CDATA[AI &amp; 云计算 &#20013;&#22269;]]></title><link>https://example.com/a?x=1&amp;y=2</link><source><![CDATA[科技 &amp; 商业]]></source><pubDate>not-a-date</pubDate></item>
    <item><title>不安全</title><link>http://example.com/plain</link><pubDate>Wed, 12 Aug 2026 01:00:00 GMT</pubDate></item>
    <item><title>损坏链接</title><link>https://exa mple.com</link></item>
  </channel></rss>`;

  assert.deepEqual(parseRssItems(xml, "回退来源", 20), [
    { title: "AI & 云计算 中国", url: "https://example.com/a?x=1&y=2", source: "科技 & 商业", publishedAt: "" }
  ]);
});
