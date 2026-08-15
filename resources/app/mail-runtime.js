"use strict";
const PROVIDERS = new Set(["gmail", "outlook", "netease", "qqmail"]);
function clone(value) { return structuredClone(value); }
function validateMailSignal(payload, expectedProvider) {
  if (!payload || typeof payload !== "object" || Object.keys(payload).some((key) => !["provider", "status", "unreadCount", "messages", "reason"].includes(key)) || payload.provider !== expectedProvider || !PROVIDERS.has(expectedProvider)) return null;
  if (payload.status === "unavailable") return typeof payload.reason === "string" && payload.reason.length <= 80 ? { provider: expectedProvider, status: "unavailable", reason: payload.reason } : null;
  if (payload.status !== "ready" || !Number.isInteger(payload.unreadCount) || payload.unreadCount < 0 || payload.unreadCount > 1000000 || !Array.isArray(payload.messages) || payload.messages.length > 20) return null;
  const messages = payload.messages.map((message) => { if (!message || typeof message !== "object" || Object.keys(message).some((key) => !["key", "sender", "subject"].includes(key)) || typeof message.key !== "string" || !message.key || message.key.length > 160 || typeof message.sender !== "string" || message.sender.length > 120 || typeof message.subject !== "string" || message.subject.length > 240) return null; return { key: message.key, sender: message.sender, subject: message.subject }; });
  return messages.includes(null) ? null : { provider: expectedProvider, status: "ready", unreadCount: payload.unreadCount, messages };
}
function authorizeMailHost({ sender, mainSender, isTopFrame, slotProvider, payloadProvider }) { return sender === mainSender && isTopFrame === true && PROVIDERS.has(slotProvider) && slotProvider === payloadProvider; }
function createMailBaselineRuntime({ ingest, now, privacy }) {
  const states = new Map(); let generation = 0;
  function status(provider) { const value = states.get(provider); return value ? clone({ status: value.status, unreadCount: value.unreadCount, lastObserved: value.lastObserved }) : null; }
  function notification(provider, message, difference) { const privateMode = Boolean(privacy()); const occurrence = `${provider}|${message ? message.key : `count-${generation}`}`; return privateMode ? { source: "mail", targetPage: "mail", entityId: `${provider}:${message ? message.key : generation}`, type: "new-mail", title: `${provider}: ${difference} new mail`, body: `${difference} 封新邮件`, scheduledAt: now(), dedupeKey: `mail|${occurrence}` } : { source: "mail", targetPage: "mail", entityId: `${provider}:${message ? message.key : generation}`, type: "new-mail", title: `${provider}: ${difference} new mail`, body: message ? `${message.sender} · ${message.subject}` : `${difference} new messages`, scheduledAt: now(), dedupeKey: `mail|${occurrence}` }; }
  function observe(input) {
    const signal = validateMailSignal(input, input && input.provider); if (!signal) return { accepted: false, reason: "invalid-signal" }; const prior = states.get(signal.provider);
    if (signal.status === "unavailable") { states.set(signal.provider, { status: "unavailable", unreadCount: null, keys: new Set(), lastObserved: now(), recovering: true }); return { accepted: true, notified: 0 }; }
    const nextKeys = new Set(signal.messages.map((message) => message.key));
    if (!prior || prior.status !== "ready" || prior.recovering) { states.set(signal.provider, { status: "ready", unreadCount: signal.unreadCount, keys: nextKeys, lastObserved: now(), recovering: false }); return { accepted: true, notified: 0 }; }
    const additions = signal.messages.filter((message) => !prior.keys.has(message.key)); const countIncrease = signal.unreadCount - prior.unreadCount; const notices = additions.length ? additions.map((message) => notification(signal.provider, message, 1)) : countIncrease > 0 ? [notification(signal.provider, null, countIncrease)] : [];
    for (const notice of notices) { try { ingest(clone(notice)); } catch { return { accepted: false, reason: "ingest-failed", notified: 0 }; } }
    generation += 1; states.set(signal.provider, { status: "ready", unreadCount: signal.unreadCount, keys: nextKeys, lastObserved: now(), recovering: false }); return { accepted: true, notified: notices.length };
  }
  return Object.freeze({ observe, status });
}
module.exports = { validateMailSignal, createMailBaselineRuntime, authorizeMailHost };
