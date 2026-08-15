"use strict";

(function expose(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MineWorkSchedulerController = api;
})(typeof window !== "undefined" ? window : globalThis, () => {
  function createSchedulerController({ scheduler, saveAlarms, applyCountdowns }) {
    let unsubscribe = null;
    let stop = null;
    function start() {
      if (stop) return stop;
      unsubscribe = scheduler.onCountdownsChanged((value) => applyCountdowns(value));
      stop = () => { if (unsubscribe) unsubscribe(); unsubscribe = null; stop = null; };
      return stop;
    }
    function syncCountdowns(value) { scheduler.syncCountdowns(value); }
    function syncAlarms(value) { saveAlarms(value); scheduler.syncAlarms(value); }
    return Object.freeze({ start, syncCountdowns, syncAlarms });
  }
  return { createSchedulerController };
});
