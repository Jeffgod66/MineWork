"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appRoot = path.resolve(__dirname, "..");
const releaseFiles = [
  path.resolve(appRoot, "..", "..", "README.md"),
  path.resolve(appRoot, "..", "..", "PRODUCT.md"),
  path.join(appRoot, "main.js"),
  path.join(appRoot, "renderer", "app.js"),
  path.join(appRoot, "renderer", "index.html"),
  path.join(appRoot, "renderer", "splash.html"),
  path.join(appRoot, "package.json")
];

test("release-facing files contain no embedded identity or logged-in defaults", () => {
  const prohibited = [
    "Zhou Wan Qin",
    "周琬芹",
    "颜晟",
    "MineWork · 已登录本机"
  ];

  for (const filePath of releaseFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    for (const value of prohibited) {
      assert.equal(content.includes(value), false, `${path.relative(appRoot, filePath)} contains ${value}`);
    }
    assert.doesNotMatch(content, /[A-Za-z]:\\(?:Users|MineWork(?:-|$))/i, `${path.relative(appRoot, filePath)} contains a personal path`);
  }

  const main = fs.readFileSync(path.join(appRoot, "main.js"), "utf8");
  const renderer = fs.readFileSync(path.join(appRoot, "renderer", "app.js"), "utf8");
  assert.match(main, /const APP_DEFAULTS = \{ stayResident: false, username: "" \};/);
  assert.match(renderer, /username: "",\s+stayResident: false,/);
  assert.match(renderer, /"MineWork · 未登录"/);
});
