"use strict";
function safe(value) { if (!value || typeof value !== "object") return { provider: "unknown", status: "unavailable", reason: "invalid-signal" }; const provider = typeof value.provider === "string" ? value.provider : "unknown"; if (value.status === "unavailable") return { provider, status: "unavailable", reason: typeof value.reason === "string" ? value.reason.slice(0, 80) : "unavailable" }; if (value.status !== "ready" || !Number.isInteger(value.unreadCount) || value.unreadCount < 0 || !Array.isArray(value.messages)) return { provider, status: "unavailable", reason: "invalid-signal" }; return { provider, status: "ready", unreadCount: value.unreadCount, messages: value.messages.slice(0, 20).map((item) => ({ key: String(item && item.key || "").slice(0, 160), sender: String(item && item.sender || "").slice(0, 120), subject: String(item && item.subject || "").slice(0, 240) })) }; }
function createMailSignalController({ scan, send, schedule, cancel, observe, disconnect, intervalMs = 30000 }) {
  const delay = Math.max(30000, Number(intervalMs) || 30000); let interval, debounce, observer, active = false, last = "", documentRef;
  const run = (documentLike = documentRef) => { let signal; try { signal = safe(scan(documentLike)); } catch { signal = { provider: "unknown", status: "unavailable", reason: "scan-failed" }; } const serial = JSON.stringify(signal); if (serial !== last) { last = serial; send(structuredClone(signal)); } return signal; };
  const queue = () => { if (!active || debounce) return; debounce = schedule(() => { debounce = undefined; run(); }, 0); };
  const start = (documentLike) => { if (active) return; active = true; documentRef = documentLike; run(documentLike); observer = observe(queue, documentLike); interval = schedule(() => run(), delay); };
  const stop = () => { if (!active) return; active = false; if (debounce !== undefined) cancel(debounce); if (interval !== undefined) cancel(interval); debounce = interval = undefined; if (observer !== undefined) disconnect(observer); observer = undefined; };
  return Object.freeze({ start, stop, run });
}
module.exports = { createMailSignalController };
