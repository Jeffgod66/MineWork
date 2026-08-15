"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const renderer = path.join(__dirname, "..", "renderer");

test("titlebar and splash reuse the same local path-based MineWork wordmark", () => {
  const wordmark = fs.readFileSync(path.join(renderer, "brand-wordmark.svg"), "utf8");
  const index = fs.readFileSync(path.join(renderer, "index.html"), "utf8");
  const splash = fs.readFileSync(path.join(renderer, "splash.html"), "utf8");
  assert.match(wordmark, /<path\b/);
  assert.doesNotMatch(wordmark, /<(?:text|use)\b|(?:href|src)=["']https?:\/\//i);
  assert.match(index, /<img[^>]+class="brand-wordmark"[^>]+src="\.\/brand-wordmark\.svg"/);
  assert.match(splash, /<img[^>]+class="brand-signature"[^>]+src="\.\/brand-wordmark\.svg"/);
});

test("splash draws the signature in about 520ms and reduced motion shows its final state", () => {
  const splash = fs.readFileSync(path.join(renderer, "splash.html"), "utf8");
  assert.match(splash, /\.signature-mask\s*\{[^}]*clip-path:\s*inset\(0 100% 0 0\)[^}]*animation:[^;}]*520ms/s);
  assert.match(splash, /@keyframes\s+signature-reveal\s*\{[^}]*clip-path:\s*inset\(0 0 0 0\)/s);
  assert.match(splash, /<div class="signature-mask"><img class="brand-signature"/);
  assert.doesNotMatch(splash, /stroke-dash(?:array|offset)/);
  assert.match(splash, /prefers-reduced-motion:\s*reduce[\s\S]*\.signature-mask[^}]*animation:\s*none\s*!important[^}]*clip-path:\s*inset\(0\)/s);
});
