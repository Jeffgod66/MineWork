"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createRequire } = require("node:module");

const bundledModules = process.env.MINEWORK_BUNDLED_NODE_MODULES;

test("icon builder can use the configured bundled sharp runtime and an isolated output directory", (t) => {
  if (!bundledModules) {
    t.skip("MINEWORK_BUNDLED_NODE_MODULES is not set; the bundled sharp runtime is unavailable");
    return;
  }

  const output = fs.mkdtempSync(path.join(os.tmpdir(), "minework-icon-"));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [path.join(__dirname, "..", "scripts", "build-icon.js"), "--output-dir", output], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, NODE_PATH: "", MINEWORK_BUNDLED_NODE_MODULES: bundledModules }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(output, "minework.png")), true);
  assert.equal(fs.existsSync(path.join(output, "minework.ico")), true);
});

test("small ICO frames come from the bold variant and keep legible ink on both M stems", async (t) => {
  if (!bundledModules) {
    t.skip("MINEWORK_BUNDLED_NODE_MODULES is not set; the bundled sharp runtime is unavailable");
    return;
  }

  const output = fs.mkdtempSync(path.join(os.tmpdir(), "minework-icon-"));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const script = fs.readFileSync(path.join(__dirname, "..", "scripts", "build-icon.js"), "utf8");
  assert.match(script, /smallSourcePath/);
  assert.match(script, /size <= smallFrameCeiling \? smallSvg : svg/);
  const result = spawnSync(process.execPath, [path.join(__dirname, "..", "scripts", "build-icon.js"), "--output-dir", output], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, NODE_PATH: "", MINEWORK_BUNDLED_NODE_MODULES: bundledModules }
  });
  assert.equal(result.status, 0, result.stderr);
  const sharp = createRequire(path.join(bundledModules, "minework-icon-runtime.cjs"))("sharp");
  const ico = fs.readFileSync(path.join(output, "minework.ico"));
  const count = ico.readUInt16LE(4);
  const frames = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    const size = ico[offset] || 256;
    const bytes = ico.readUInt32LE(offset + 8);
    const imageOffset = ico.readUInt32LE(offset + 12);
    frames.push({ size, png: ico.subarray(imageOffset, imageOffset + bytes) });
  }
  const frame16 = frames.find(({ size }) => size === 16);
  const { data, info } = await sharp(frame16.png).raw().toBuffer({ resolveWithObject: true });
  const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  let ink = 0, inkLeft = 0, inkRight = 0, lightSum = 0, lightCount = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * info.channels;
      const lum = luminance(data[i], data[i + 1], data[i + 2]);
      if (lum < 110) { ink += 1; if (x < 8) inkLeft += 1; else inkRight += 1; }
      if (data[i + 3] > 220) { lightSum += lum; lightCount += 1; }
    }
  }
  assert.ok(ink >= 5, `16px frame needs visible ink, got ${ink} dark pixels`);
  assert.ok(inkLeft >= 2, `left M stem missing at 16px, got ${inkLeft} dark pixels`);
  assert.ok(inkRight >= 2, `right M stem missing at 16px, got ${inkRight} dark pixels`);
  assert.ok(lightCount > 120 && lightSum / lightCount > 150, `16px frame field should stay light and opaque, mean ${(lightSum / lightCount).toFixed(1)}`);
});
