(function (global) {
  "use strict";

  const SPRITE = "./icon-sprite.svg";
  const reducedMotion = global.matchMedia?.("(prefers-reduced-motion: reduce)");

  function icon(name, className = "") {
    return `<svg class="${className}" aria-hidden="true"><use href="${SPRITE}#${name}"/></svg>`;
  }

  function decorateActionIcons(root = document) {
    const actions = [
      [".task-delete, .archive-delete, .note-delete, .book-delete, .remove-countdown", "trash", "删除"],
      [".card-menu", "dots-three", "更多操作"]
    ];

    actions.forEach(([selector, glyph, label]) => {
      const nodes = root instanceof Element && root.matches(selector)
        ? [root, ...root.querySelectorAll(selector)]
        : [...root.querySelectorAll(selector)];
      nodes.forEach((node) => {
        if (node.dataset.iconReady) return;
        node.dataset.iconReady = "true";
        node.setAttribute("aria-label", node.getAttribute("aria-label") || label);
        node.innerHTML = icon(glyph);
      });
    });

    root.querySelectorAll(".fallback-icon:not([data-icon-ready])").forEach((node) => {
      const card = node.closest(".shortcut-card, .mini-shortcut");
      const path = card?.querySelector("p")?.textContent || card?.dataset.path || "";
      let glyph = "file";
      if (/^(https?:\/\/)|\.(url|html?)$/i.test(path)) glyph = "globe";
      else if (/\.(exe|lnk)$/i.test(path)) glyph = "app-window";
      else if (/\.(txt|md|docx?|pdf)$/i.test(path)) glyph = "file-text";
      else if (/^[a-z]:\\[^.]+$/i.test(path)) glyph = "folder-open";
      node.dataset.iconReady = "true";
      node.innerHTML = icon(glyph);
    });
  }

  function addSectionSignals() {
    const codes = {
      tasks: "FOCUS", calendar: "TIME", weather: "CLIMATE", news: "SIGNAL",
      favorites: "ARCHIVE", notes: "EXCERPT", library: "LIBRARY", hydration: "FLOW",
      reflection: "REVIEW", island: "ISLAND", ai: "INTELLIGENCE", shortcuts: "LAUNCH",
      countdown: "TIMER", translate: "LANGUAGE", performance: "SYSTEM", music: "MEDIA",
      mail: "INBOX"
    };
    Object.entries(codes).forEach(([page, code]) => {
      const heading = document.querySelector(`#page-${page} .page-head > div:first-child`);
      if (heading && !heading.querySelector(".section-signal")) {
        heading.insertAdjacentHTML("afterbegin", `<span class="section-signal"><i></i>${code}</span>`);
      }
    });
  }

  function attachMagneticSurface(node) {
    if (node.dataset.motionReady || reducedMotion?.matches) return;
    node.dataset.motionReady = "true";
    node.addEventListener("pointermove", (event) => {
      const rect = node.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      node.style.setProperty("--glow-x", `${Math.round(px * 100)}%`);
      node.style.setProperty("--glow-y", `${Math.round(py * 100)}%`);
      node.style.setProperty("--tilt-y", `${((px - .5) * 3.2).toFixed(2)}deg`);
      node.style.setProperty("--tilt-x", `${((.5 - py) * 3.2).toFixed(2)}deg`);
    });
    node.addEventListener("pointerleave", () => {
      node.style.removeProperty("--tilt-x");
      node.style.removeProperty("--tilt-y");
      node.style.removeProperty("--glow-x");
      node.style.removeProperty("--glow-y");
    });
  }

  function attachMotion(root = document) {
    const selector = ".overview-stat, .shortcut-card, .book-card, .note-card, .metric-panel, .mini-feature, .countdown-card";
    const surfaces = root instanceof Element && root.matches(selector)
      ? [root, ...root.querySelectorAll(selector)]
      : [...root.querySelectorAll(selector)];
    surfaces.forEach(attachMagneticSurface);
  }

  function attachAmbientPointer() {
    const shell = document.querySelector(".app-shell");
    if (!shell || reducedMotion?.matches) return;
    let frame = 0;
    shell.addEventListener("pointermove", (event) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        shell.style.setProperty("--pointer-x", `${Math.round(event.clientX / innerWidth * 100)}%`);
        shell.style.setProperty("--pointer-y", `${Math.round(event.clientY / innerHeight * 100)}%`);
      });
    }, { passive: true });
  }

  function attachPressFeedback() {
    document.addEventListener("pointerdown", (event) => {
      const button = event.target.closest("button:not(:disabled)");
      if (!button || reducedMotion?.matches) return;
      const rect = button.getBoundingClientRect();
      button.style.setProperty("--press-x", `${event.clientX - rect.left}px`);
      button.style.setProperty("--press-y", `${event.clientY - rect.top}px`);
      button.classList.remove("press-wave");
      void button.offsetWidth;
      button.classList.add("press-wave");
    });
  }

  function observeGeneratedUI() {
    const observer = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        decorateActionIcons(node);
        attachMotion(node);
      }));
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    addSectionSignals();
    decorateActionIcons();
    attachMotion();
    attachAmbientPointer();
    attachPressFeedback();
    observeGeneratedUI();
    requestAnimationFrame(() => document.documentElement.classList.add("ui-ready"));
  }

  global.MineWorkUI = { icon, decorateActionIcons, attachMotion };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
