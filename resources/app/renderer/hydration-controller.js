"use strict";

(function attachHydrationController(factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.MineWorkHydrationController = api;
})(function hydrationControllerModule() {
  const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const DEFAULT_REMINDER = Object.freeze({ enabled: false, intervalMinutes: 30, activeStart: "08:00", activeEnd: "22:00" });

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function normalizeReminder(value) {
    const source = value && typeof value === "object" ? value : {};
    const interval = Number(source.intervalMinutes);
    return {
      enabled: source.enabled === true,
      intervalMinutes: Number.isInteger(interval) && interval >= 15 && interval <= 240 ? interval : DEFAULT_REMINDER.intervalMinutes,
      activeStart: TIME_PATTERN.test(source.activeStart || "") ? source.activeStart : DEFAULT_REMINDER.activeStart,
      activeEnd: TIME_PATTERN.test(source.activeEnd || "") ? source.activeEnd : DEFAULT_REMINDER.activeEnd
    };
  }

  function validateReminder(value) {
    if (!value || typeof value !== "object") return "Reminder settings are required.";
    const interval = Number(value.intervalMinutes);
    if (!Number.isInteger(interval) || interval < 15 || interval > 240) return "Reminder interval must be between 15 and 240 minutes.";
    if (!TIME_PATTERN.test(value.activeStart || "") || !TIME_PATTERN.test(value.activeEnd || "") || value.activeStart === value.activeEnd) return "Active hours must use HH:MM and have different start and end times.";
    return "";
  }

  function createHydrationController({ model, load, save, syncWorkspace, reloadScheduler, now, onRender }) {
    if (!model || [load, save, syncWorkspace, reloadScheduler, now, onRender].some((adapter) => typeof adapter !== "function")) throw new TypeError("Hydration controller adapters are required.");
    let state = null;

    function normalize(raw) {
      const normalized = model.normalizeHydration(raw, now());
      return {
        ...normalized,
        reminder: normalizeReminder(raw && raw.reminder),
        goalCrossedDates: [...new Set(Array.isArray(raw && raw.goalCrossedDates) ? raw.goalCrossedDates.filter((date) => typeof date === "string") : [])]
      };
    }

    function publicState() { return clone(state); }
    function emit(event = { type: "render", bubbles: false, goalCrossed: false }) {
      const snapshot = publicState();
      onRender(clone(snapshot), clone(event));
      syncWorkspace(clone(snapshot));
      return snapshot;
    }
    function success(event) { return { ok: true, state: publicState(), event: clone(event) }; }
    function failure(error) { return { ok: false, error }; }
    function commit(next, event, schedulerRelevant = true) {
      state = next;
      save(publicState());
      emit(event);
      if (schedulerRelevant) reloadScheduler();
      return success(event);
    }
    function ensureInitialized() { if (!state) initialize(); }

    function initialize() {
      if (!state) {
        const loaded = load();
        state = normalize(loaded);
        if (loaded && typeof loaded.date === "string" && loaded.date !== state.date) {
          save(publicState());
          reloadScheduler();
        }
      }
      emit({ type: "initialize", bubbles: false, goalCrossed: false });
      return success({ type: "initialize", bubbles: false, goalCrossed: false });
    }

    function setGoal(value) {
      ensureInitialized();
      const goal = Number(value);
      if (!Number.isFinite(goal) || goal < 500 || goal > 6000) return failure("Goal must be between 500 and 6000 ml.");
      const next = { ...model.setHydrationGoal(state, goal), reminder: clone(state.reminder), goalCrossedDates: [...state.goalCrossedDates] };
      return commit(next, { type: "goal", bubbles: false, goalCrossed: false });
    }

    function add(value) {
      ensureInitialized();
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount <= 0) return failure("Hydration amount must be greater than zero.");
      const previousAmount = state.amount;
      let next = model.addHydrationEntry(state, amount, now());
      const crossedBefore = state.goalCrossedDates.includes(state.date);
      const goalCrossed = !crossedBefore && previousAmount < state.goal && next.amount >= state.goal;
      const dates = goalCrossed ? [...state.goalCrossedDates, state.date] : [...state.goalCrossedDates];
      next = { ...next, reminder: clone(state.reminder), goalCrossedDates: dates };
      return commit(next, { type: "add", amount, bubbles: true, goalCrossed });
    }

    function undo() {
      ensureInitialized();
      if (!state.entries.length) return failure("There is no hydration entry to undo.");
      const removed = state.entries[state.entries.length - 1];
      const next = { ...model.undoHydrationEntry(state), reminder: clone(state.reminder), goalCrossedDates: [...state.goalCrossedDates] };
      return commit(next, { type: "undo", amount: removed.amount, bubbles: false, goalCrossed: false });
    }

    function updateReminder(value) {
      ensureInitialized();
      const error = validateReminder(value);
      if (error) return failure(error);
      const reminder = { enabled: value.enabled === true, intervalMinutes: Number(value.intervalMinutes), activeStart: value.activeStart, activeEnd: value.activeEnd };
      return commit({ ...state, reminder }, { type: "reminder", bubbles: false, goalCrossed: false });
    }

    function rollover() {
      ensureInitialized();
      const next = normalize(state);
      if (next.date === state.date) return success({ type: "rollover", bubbles: false, goalCrossed: false });
      return commit(next, { type: "rollover", bubbles: false, goalCrossed: false });
    }

    function snapshot() { ensureInitialized(); return publicState(); }
    return Object.freeze({ initialize, setGoal, add, undo, updateReminder, rollover, snapshot });
  }

  return { createHydrationController, normalizeReminder, validateReminder };
});
