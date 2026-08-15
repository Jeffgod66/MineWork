"use strict";

function text(value, limit) { return Array.from(String(value || "").replace(/\s+/g, " ").trim()).slice(0, limit).join(""); }
function hash(value) { let result = 2166136261; for (const char of value) { result ^= char.codePointAt(0); result = Math.imul(result, 16777619); } return (result >>> 0).toString(36); }
function first(node, selectors) { for (const selector of selectors) { const found = node && node.querySelector(selector); if (found) return found; } return null; }
function all(node, selectors) { for (const selector of selectors) { const found = node && node.querySelectorAll(selector); if (found && found.length) return Array.from(found); } return []; }
function attribute(node, names) { for (const name of names) { const value = node && node.getAttribute && node.getAttribute(name); if (value) return String(value); } return ""; }
function unread(node, classes) { const attributes = `${attribute(node, ["aria-label", "title", "data-unread", "aria-selected"])} ${attribute(node, ["class"])}`.toLowerCase(); return classes.some((value) => attributes.includes(value.toLowerCase())) || /\bunread\b/.test(attributes); }
function badge(documentLike) { const node = first(documentLike, ["[aria-label*=unread]", "[title*=unread]", "[data-unread-count]"]); const value = attribute(node, ["data-unread-count", "aria-label", "title"]) || (node && node.textContent); const match = String(value || "").match(/\b(\d{1,7})\b/); return match ? Number(match[1]) : null; }
function extractWith(documentLike, config) {
  const inbox = first(documentLike, config.inbox);
  const count = badge(documentLike);
  const rows = all(documentLike, config.rows);
  if (!inbox && count === null) return { provider: config.provider, status: "unavailable", reason: "inbox-unrecognized" };
  const messages = rows.filter((row) => unread(row, config.unread)).slice(0, 20).map((row) => {
    const sender = text((first(row, config.sender) || {}).textContent, 120);
    const subject = text((first(row, config.subject) || {}).textContent, 240);
    const identifier = text(attribute(row, ["data-message-id", "data-thread-id", "id", "data-convid"]), 160);
    return { key: identifier || `${config.provider}:${hash(`${sender}\n${subject}`)}`, sender, subject };
  }).filter((message) => message.sender || message.subject);
  if (!inbox && !rows.length && count === null) return { provider: config.provider, status: "unavailable", reason: "inbox-unrecognized" };
  return { provider: config.provider, status: "ready", unreadCount: count === null ? messages.length : count, messages };
}

module.exports = { extractWith };
