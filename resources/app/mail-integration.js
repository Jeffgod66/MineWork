"use strict";

(function expose(factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.MineWorkMailIntegration = api;
})(function createApi() {
  const PROVIDERS = Object.freeze(["gmail", "outlook", "netease", "qqmail"]);
  const PROVIDER_SET = new Set(PROVIDERS);
  const SIGNAL_KEYS = new Set(["provider", "status", "unreadCount", "messages", "reason"]);

  function clone(value) { return structuredClone(value); }
  function plain(value) { return value && typeof value === "object" && !Array.isArray(value); }

  function validateSignal(value, expectedProvider) {
    if (!plain(value) || !PROVIDER_SET.has(expectedProvider) || value.provider !== expectedProvider || Object.keys(value).some((key) => !SIGNAL_KEYS.has(key))) return null;
    if (value.status === "unavailable") {
      if (typeof value.reason !== "string" || !value.reason || value.reason.length > 80) return null;
      return { provider: expectedProvider, status: "unavailable", reason: value.reason };
    }
    if (value.status !== "ready" || !Number.isInteger(value.unreadCount) || value.unreadCount < 0 || value.unreadCount > 1000000 || !Array.isArray(value.messages) || value.messages.length > 20) return null;
    const messages = [];
    for (const item of value.messages) {
      if (!plain(item) || Object.keys(item).some((key) => !["key", "sender", "subject"].includes(key)) || typeof item.key !== "string" || !item.key || item.key.length > 160 || typeof item.sender !== "string" || Array.from(item.sender).length > 120 || typeof item.subject !== "string" || Array.from(item.subject).length > 240) return null;
      messages.push({ key: item.key, sender: item.sender, subject: item.subject });
    }
    return { provider: expectedProvider, status: "ready", unreadCount: value.unreadCount, messages };
  }

  function parseMailProviderArgument(argv) {
    const prefix = "--minework-mail-provider=";
    const matches = (Array.isArray(argv) ? argv : []).filter((item) => typeof item === "string" && item.startsWith(prefix)).map((item) => item.slice(prefix.length));
    return matches.length === 1 && PROVIDER_SET.has(matches[0]) ? matches[0] : null;
  }

  function sanitizeMailStatus(value) {
    if (!plain(value) || Object.keys(value).some((key) => !["provider", "status", "unreadCount", "observedAt"].includes(key)) || !PROVIDER_SET.has(value.provider) || !["ready", "unavailable"].includes(value.status) || typeof value.observedAt !== "string" || Number.isNaN(Date.parse(value.observedAt))) return null;
    if (value.status === "ready" && (!Number.isInteger(value.unreadCount) || value.unreadCount < 0 || value.unreadCount > 1000000)) return null;
    if (value.status === "unavailable" && value.unreadCount !== null) return null;
    return { provider: value.provider, status: value.status, unreadCount: value.status === "ready" ? value.unreadCount : null, observedAt: new Date(value.observedAt).toISOString() };
  }

  function createMailWebviewHostBridge({ slots, forward }) {
    if (!(slots instanceof Map) || typeof forward !== "function") throw new TypeError("Invalid mail host bridge dependencies");
    return Object.freeze({
      handle(webview, event) {
        const provider = slots.get(webview);
        if (!PROVIDER_SET.has(provider) || !event || event.channel !== "minework:mail-signal" || !Array.isArray(event.args) || event.args.length !== 1) return false;
        const signal = validateSignal(event.args[0], provider);
        if (!signal) return false;
        try { forward(clone({ provider, signal })); } catch { return false; }
        return true;
      }
    });
  }

  function createMailMainBridge({ trusted, allowedProviders, observe, publishStatus, now }) {
    const allowed = new Set(Array.isArray(allowedProviders) ? allowedProviders : []);
    const statuses = new Map();
    if (typeof trusted !== "function" || typeof observe !== "function" || typeof publishStatus !== "function" || typeof now !== "function") throw new TypeError("Invalid mail main bridge dependencies");
    return Object.freeze({
      handle(event, input) {
        if (!trusted(event) || !plain(input) || Object.keys(input).some((key) => !["provider", "signal"].includes(key)) || !allowed.has(input.provider)) return { accepted: false, reason: "unauthorized" };
        const signal = validateSignal(input.signal, input.provider);
        if (!signal) return { accepted: false, reason: "invalid-signal" };
        let outcome;
        try { outcome = observe(clone(signal)); } catch { return { accepted: false, reason: "observe-failed" }; }
        if (!outcome || outcome.accepted !== true) return outcome || { accepted: false, reason: "observe-failed" };
        const snapshot = { provider: input.provider, status: signal.status, unreadCount: signal.status === "ready" ? signal.unreadCount : null, observedAt: new Date(now()).toISOString() };
        statuses.set(input.provider, snapshot);
        try { publishStatus(clone(snapshot)); } catch {}
        return clone(outcome);
      },
      status(provider) { return statuses.has(provider) ? clone(statuses.get(provider)) : null; }
    });
  }

  return Object.freeze({ PROVIDERS, validateSignal, parseMailProviderArgument, sanitizeMailStatus, createMailWebviewHostBridge, createMailMainBridge });
});
