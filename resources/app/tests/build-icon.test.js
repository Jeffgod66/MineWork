"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("icon builder can use the configured bundled sharp runtime and an isolated output directory", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "minework-icon-"));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const bundledModules = "C:\\Users\\<user>\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules";
  const result = spawnSync(process.execPath, [path.join(__dirname, "..", "scripts", "build-icon.js"), "--output-dir", output], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, NODE_PATH: "", MINEWORK_BUNDLED_NODE_MODULES: bundledModules }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(output, "minework.png")), true);
  assert.equal(fs.existsSync(path.join(output, "minework.ico")), true);
});
