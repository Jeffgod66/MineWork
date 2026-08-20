import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["pack", "--dry-run", "--json"], {
  encoding: "utf8",
  shell: process.platform === "win32",
  stdio: ["ignore", "pipe", "pipe"]
});

if (result.status !== 0) {
  process.stderr.write(result.error?.message || result.stderr || result.stdout || "npm pack failed\n");
  process.exit(result.status || 1);
}

let report;
try {
  report = JSON.parse(result.stdout.trim());
} catch (error) {
  process.stderr.write(`Unable to parse npm pack output: ${error.message}\n`);
  process.exit(1);
}

const files = (Array.isArray(report) ? report[0]?.files : report.files) || [];
const paths = files.map((entry) => String(entry.path || entry)).sort();
const forbiddenPath = /(^|\/)(?:node_modules|\.git|\.edge-qa|\.visual-qa|\.codex-backup|\.superpowers|\.tools|session-data|user-data|browser-data|cache|cookie|token|credential|journal)(\/|$)/i;
const forbiddenExtension = /\.(?:db|sqlite|ldb|local|tmp|log|exe|dll|pak|dat|bin)$/i;
const forbiddenText = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}|[A-Za-z]:[\\/](?:Users|MineWork)(?:[\\/]|$)/i;
const binaryExtension = /\.(?:bmp|gif|ico|jpeg|jpg|png|webp|woff|woff2|eot|ttf|otf|node|dll|exe|pak|dat|bin)$/i;
const violations = [];

for (const path of paths) {
  if (forbiddenPath.test(path)) violations.push(`${path}: forbidden runtime/privacy path`);
  if (forbiddenExtension.test(path)) violations.push(`${path}: forbidden packaged extension`);
}

if (violations.length > 0) {
  for (const violation of violations) console.error(violation);
  process.exit(1);
}

for (const path of paths) {
  if (forbiddenText.test(path)) {
    console.error(`${path}: privacy-shaped filename`);
    process.exit(1);
  }

  if (binaryExtension.test(path)) continue;
  const content = readFileSync(resolve(path), "utf8");
  if (forbiddenText.test(content)) {
    console.error(`${path}: privacy-shaped content`);
    process.exit(1);
  }
}

console.log(`Package contents clean: ${paths.length} files.`);
