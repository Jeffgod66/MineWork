"use strict";

const { ipcRenderer } = require("electron");

window.addEventListener("wheel", (event) => {
  event.preventDefault();
  ipcRenderer.sendToHost("minework:island-wheel", {
    deltaX: Number(event.deltaX) || 0,
    deltaY: Number(event.deltaY) || 0
  });
}, { capture: true, passive: false });
