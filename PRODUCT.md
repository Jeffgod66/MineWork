# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (Electron desktop shell on Windows; the UI is HTML/CSS/JS rendered by Chromium, so impeccable's web vocabulary applies, but the product is a native-style desktop app with custom frameless windows)

## Stack

Vanilla HTML/CSS/JS in an Electron shell. No framework, no build step: `resources/app/renderer/` holds `index.html`, `styles.css`, `app.js`, `island.html`, `island.css`, `island.js`. Main process `main.js` owns the window, tray, and IPC. CSP is strict (`script-src 'self'`), so all styling and scripting must stay local; no CDN fonts or scripts.

## Users

One primary user: an individual using a private desktop workspace. [Inferred: a Chinese-speaking Windows user who keeps a personal productivity hub open while working, checking it throughout the day; the account dialog has no password and the copy addresses a single person.]

## Product Purpose

A private desktop workspace that collects an individual's daily tools in one place: greeting/clock, daily quote, tasks, calendar, weather, news, favorites, notes, library, hydration, reflection, countdown, translate, device performance, music monitor, AI chat (ChatGPT/Claude/DeepSeek webviews), mail (Gmail/Outlook/163/QQ webviews), quick-open shortcuts, and a floating Dynamic Island that keeps time, weather, tasks, AI, translate, music, performance, and shortcuts one glance away on top of the desktop. Success means the user can orient and act on the day without leaving this window or its island.

## Positioning

A single-user desktop workspace that blends a dashboard, a set of personal tools, and an always-available floating status island into one private space. The Dynamic Island is the differentiating mechanism: the workspace's most useful status lives on top of the desktop, not inside the window.

## Operating Context

- Windows desktop app; main window 1180x760, frameless with custom titlebar, dark color scheme. [Inferred from the incumbent dark UI and evening greeting: used at a desk, often in lower light.]
- The Dynamic Island is an always-on-top, frameless, transparent, taskbar-less window at the top center of the screen; it collapses to a pill (~306x51) and expands on hover/click, with wheel-scroll between pages.
- Music monitoring integrates with Windows media session and Mineradio; mail and AI providers load as webviews (login state kept locally).
- Everything is local and private: account login is name-only with no password; data stays on the machine.

## Capabilities and Constraints

- 18 sidebar entries (workbench, tasks, calendar, weather, news, favorites, notes, library, hydration, reflection, island, AI, shortcuts, countdown, translate, performance, music, mail). IA and page IDs are stable and must not be renamed.
- Strict CSP (`script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob: https:`). No external fonts, scripts, or styles.
- Fonts are system fonts only (Segoe UI Variable / Microsoft YaHei UI). [Decision point: a self-hosted font would require bundling it locally, which is possible but must be verified; default to system stack.]
- Custom window chrome: `-webkit-app-region: drag` on titlebar, no-drag on interactive elements.
- Dynamic Island is width-configurable 420-760 px from the settings page; layout must survive that range plus collapsed/expanded states and tool-specific heights (overview 228px, translate 430px, AI 620px).
- Tray icon is a 16px resize of the 256px app PNG; the icon must stay legible at 16px.
- The app ships as `MineWork.exe`; assets live in `resources/app/assets/`.

## Brand Commitments

- Product name "MineWork". Wordmark must not change.
- Existing visual identity: dark near-black surfaces, glassy panels, blue-to-purple gradient accent, 24px radius, system sans. [Inferred: this is a personal brand with no written guidelines; the redesign replaces the visual world but must keep the name, IA, and copy voice.]
- Copy voice: warm, calm, self-directed Chinese ("慢慢来，你正在成为更好的自己。" / "今天的一切，从这里开始。保持专注，稳步向前。"), with small English kickers as metadata labels. Preserve this voice.

## Evidence on Hand

- Complete incumbent implementation in `resources/app/renderer/` (HTML, CSS, JS) and `resources/app/assets/minework.{svg,png,ico}`.
- No PRODUCT.md or DESIGN.md existed before this file. No user interviews were possible in this session: the structured question tool is unavailable in Default mode, so facts marked [Inferred] were read from code, copy, and the incumbent UI instead of confirmed by interview.

## Product Principles

- One glance, one action: the owner should read the state of the day (time, tasks, weather, music, system) and act without friction.
- Quiet and personal: the workspace is a private space, not a marketing surface; it should feel calm, warm, and owned, never noisy or corporate.
- The island is the product's signature: it must feel native, lightweight, and premium at every state (collapsed, expanded, tool pages).
- Consistency is trust: one component vocabulary across all 18 surfaces and the island.
- Performance is a feature: no external requests for UI assets, no heavy animation, instant local feel.

## Accessibility & Inclusion

[Inferred] The owner works in low light on a desktop; contrast must hold for body text (>= 4.5:1) and large text (>= 3:1), focus states must be visible, and motion must respect `prefers-reduced-motion`. Chinese text needs generous line-height and legible sizes; the incumbent island uses extremely small type (6-9px), which is a known weakness to fix.
