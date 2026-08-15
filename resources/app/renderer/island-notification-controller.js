"use strict";

(function attach(factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.mineworkIslandNotifications = api;
})(function createApi() {
  function normalizeDelivery(delivery) {
    const record = delivery?.record;
    if (!record || typeof record.id !== "string" || !record.id) return null;
    return {
      id: record.id,
      ids: [record.id],
      group: `${String(record.source || "other")}|${String(record.type || "other")}`,
      source: String(record.source || "other"),
      type: String(record.type || "other"),
      title: String(record.title || "MineWork 通知"),
      body: String(record.body || ""),
      unreadCount: Math.max(0, Number(delivery.unreadCount) || 0),
      count: 1
    };
  }

  function createIslandNotificationController({ actions = {}, onChange = () => {}, onAttention = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, timeoutMs = 8000 } = {}) {
    let active = null;
    let queue = [];
    let blocked = false;
    let timer = null;
    let attention = false;
    const emitAttention = (value) => {
      if (attention === value) return;
      attention = value;
      onAttention(value);
    };
    const arm = () => {
      if (timer) clearTimer(timer);
      timer = active ? setTimer(() => { timer = null; advance(); }, timeoutMs) : null;
    };
    const publish = () => { onChange(active ? { ...active, ids: [...active.ids] } : null); };
    const promote = () => {
      if (!blocked && !active && queue.length) active = queue.shift();
      emitAttention(Boolean(active || queue.length));
      publish();
      arm();
    };
    const advance = () => {
      active = null;
      promote();
      if (!active && !queue.length) emitAttention(false);
    };
    return Object.freeze({
      enqueue(delivery) {
        const item = normalizeDelivery(delivery);
        if (!item) return null;
        const grouped = active?.group === item.group ? active : queue.find((entry) => entry.group === item.group);
        if (grouped) {
          grouped.ids.push(item.id);
          grouped.count += 1;
          grouped.unreadCount = item.unreadCount;
          grouped.title = item.title;
          grouped.body = item.body;
          if (grouped === active) { publish(); arm(); }
        } else {
          queue.push(item);
          promote();
        }
        return item.id;
      },
      setBlocked(value) { blocked = value === true; if (!blocked) promote(); },
      current: () => active ? { ...active, ids: [...active.ids] } : null,
      snapshot: () => ({ active: active ? { id: active.id, count: active.count } : null, queue: queue.map(({ id, count }) => ({ id, count })), blocked }),
      async handle(action) {
        const selected = active;
        const id = selected?.id;
        if (!id || !["open", "read", "dismiss"].includes(action)) return null;
        await actions[action]?.(id);
        if (active === selected) advance();
        return id;
      },
      dispose() { if (timer) clearTimer(timer); timer = null; active = null; queue = []; emitAttention(false); publish(); }
    });
  }

  return { createIslandNotificationController };
});
