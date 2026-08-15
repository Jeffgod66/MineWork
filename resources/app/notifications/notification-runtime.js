"use strict";

function clone(value) { return value === undefined ? undefined : structuredClone(value); }

function createClonedSubscription(emitter, channel, listener) {
  if (typeof listener !== "function") throw new TypeError("listener must be a function");
  const handler = (_event, value) => listener(clone(value));
  emitter.on(channel, handler);
  return () => emitter.removeListener(channel, handler);
}

function createWorkspaceMutationHandlers({ authorize, validateCountdowns, validateAlarms, validateCalendarEvents, validateAnniversaries = (value) => value, writeWorkspace, reload, publishCountdowns }) {
  const mutate = (event, value, key, validate, publish) => {
    authorize(event);
    const safeItems = validate(value);
    writeWorkspace(key, safeItems);
    Promise.resolve(reload()).catch(() => {});
    if (publish) publish(safeItems);
    return safeItems;
  };
  return Object.freeze({
    countdowns: (event, value) => mutate(event, value, "countdowns", validateCountdowns, publishCountdowns),
    alarms: (event, value) => mutate(event, value, "alarms", validateAlarms),
    calendar: (event, value) => mutate(event, value, "calendar-events", validateCalendarEvents),
    anniversaries: (event, value) => mutate(event, value, "anniversaries", validateAnniversaries)
  });
}

module.exports = { createClonedSubscription, createWorkspaceMutationHandlers };
