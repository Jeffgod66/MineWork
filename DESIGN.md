---
name: MineWork
description: Personal desk status board in glacier mist blue, pearl ice faces and one steel accent.
colors:
  glacier-base: "#98BEE6"
  glacier-highlight: "#D7E8FB"
  glacier-mid: "#7CA2CD"
  glacier-shadow: "#6A90B9"
  pearl-face: "#F3F9FF"
  pearl-face-hi: "#FFFFFF"
  pearl-face-low: "#C4DCF4"
  steel-ink: "#22354D"
  steel-ink-2: "#3D5A78"
  steel-muted: "#4E6C8B"
  steel-faint: "#5F7A95"
  accent-steel: "#6A90B9"
  accent-steel-ink: "#3C5C80"
  surface-glass: "rgba(255, 255, 255, 0.56)"
  surface-glass-strong: "rgba(255, 255, 255, 0.74)"
  line-steel: "rgba(46, 76, 114, 0.16)"
  line-steel-strong: "rgba(46, 76, 114, 0.30)"
  status-ok: "#4E8F70"
  status-error: "#C96A63"
typography:
  display:
    fontFamily: "Bahnschrift, 'Segoe UI Variable', 'Microsoft YaHei UI', sans-serif"
    fontSize: "30px"
    fontWeight: 620
    lineHeight: 1.12
    letterSpacing: "-0.5px"
  headline:
    fontFamily: "Bahnschrift, 'Segoe UI Variable', 'Microsoft YaHei UI', sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.1px"
  body:
    fontFamily: "'Segoe UI Variable', 'Microsoft YaHei UI', 'Segoe UI', sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "normal"
  label:
    fontFamily: "Consolas, 'Cascadia Mono', monospace"
    fontSize: "8.5px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "1.6px"
rounded:
  sm: "10px"
  md: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "13px"
  lg: "20px"
  xl: "34px"
components:
  button-primary:
    backgroundColor: "linear-gradient(135deg, #D7E8FB 0%, #A9C9EA 55%, #8FB3DC 100%)"
    textColor: "{colors.steel-ink}"
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "38px"
  button-primary-hover:
    backgroundColor: "linear-gradient(135deg, #EAF3FD, #B9D3EF 55%, #98BEE6)"
    textColor: "{colors.steel-ink}"
    rounded: "{rounded.pill}"
  button-secondary:
    backgroundColor: "rgba(255, 255, 255, 0.5)"
    textColor: "{colors.steel-ink}"
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "38px"
  input-field:
    backgroundColor: "rgba(255, 255, 255, 0.72)"
    textColor: "{colors.steel-ink}"
    rounded: "{rounded.sm}"
    padding: "0 13px"
    height: "42px"
  panel-card:
    backgroundColor: "{colors.surface-glass}"
    textColor: "{colors.steel-ink}"
    rounded: "{rounded.md}"
    padding: "22px"
  nav-item-active:
    backgroundColor: "linear-gradient(135deg, #EAF3FD, #A9C9EA)"
    textColor: "{colors.steel-ink}"
    rounded: "11px"
---

# Design System: MineWork

## Overview

**Creative North Star: "The Desk Flip-Board in Glacier Light"**

MineWork is a personal status board on a desk, now lit by glacier mist: the owner pinned the palette from image_colors.js, so the surface is a gradient wash of pearl white-blue (#D7E8FB), glacier blue (#98BEE6), and steel shadow blue (#6A90B9) instead of matte charcoal. The composition is unchanged, a matte instrument becomes a light instrument: pearl ice faces carry the values the owner checks (time, task counts, hydration, system load), hairline steel board rules organize rows and columns, and one steel-blue lamp marks whatever is live or active. The Dynamic Island is the same glacier lamp floating above the desktop, a pearl-to-glacier capsule with steel-ink numerals and a steel-blue live orb; the app icon is the same gradient family with the split-flap M.

The world is airy but physical: gradients carry the surface (app background, panels, buttons, the flip clock), frosted glass panels blur the gradient beneath them, and depth comes from translucent white faces and steel-tinted shadows rather than glow. One animated value remains: the split-flap clock flips on the minute, with a quiet seconds cell ticking beside it. Density stays daily-app level, built for glanceability.

**Key Characteristics:**
- Glacier mist blue gradient background (pearl to steel, top-left light to bottom-right deep)
- Pearl ice frosted-glass faces for values, active navigation, and primary actions
- One steel-blue accent reserved for live state, active indicators, and progress fills
- Bahnschrift numerals with tabular figures as the board voice, in steel ink
- Hairline steel board rules and 16px instrument radii; pills only for small controls

## Colors

One blue family on a light gradient ground, with a single steel accent. Pearl carries value and action, steel carries life, everything else is a blue-gray neutral.

### Primary
- **Glacier Mist Base** (#98BEE6): the palette's base tone; used in gradients, panel tints, and secondary surfaces.
- **Pearl White Blue** (#D7E8FB): the highlight tone; the light end of gradients, the flip clock face, and frosted glass.
- **Steel Shadow Blue** (#6A90B9): the shadow tone; the deep end of gradients, the accent, live-state dots, progress fills, and borders.
- **Glacier Mid** (#7CA2CD): the transition tone between base and shadow in the uploaded gradient.

### Neutral
- **Steel Ink** (#22354D): primary text and digits on light surfaces (≈12:1 on white).
- **Steel Ink Soft** (#3D5A78): secondary copy and page descriptions on the gradient (≥4.5:1 on the light end).
- **Steel Muted** (#4E6C8B): labels, placeholders, timestamps (≈5:1 on white).
- **Steel Faint** (#5F7A95): board codes and tertiary metadata.
- **Surface Glass** (rgba(255,255,255,.56)): frosted instrument faces with backdrop blur over the gradient.
- **Surface Glass Strong** (rgba(255,255,255,.74)): inputs, browser card, raised faces.
- **Line Steel** (rgba(46,76,114,.16)) / **Line Steel Strong** (rgba(46,76,114,.30)): hairline board rules and interactive borders.
- **Status Ok** (#4E8F70) / **Status Error** (#C96A63): semantic only.

### Named Rules
**The One Lamp Rule.** The steel-blue accent is used for live or active state only. It never decorates; a screen should show only a few small lamps at once.
**The Pearl Ink Rule.** Pearl and glass faces carry steel ink text (#22354D); text on light faces must never be low-contrast.
**The Gradient Surface Rule.** Gradients come from the pinned image_colors.js family (highlight to base to mid to shadow) and carry whole surfaces, never scattered decorations. No colored outer glows or blurred blobs; the only light is the lamp ring and the flip clock's inner frost.

## Typography

**Display Font:** Bahnschrift (with 'Segoe UI Variable', 'Microsoft YaHei UI' fallbacks)
**Body Font:** Segoe UI Variable / Microsoft YaHei UI (system UI stack)
**Label/Mono Font:** Consolas / Cascadia Mono

**Character:** The board speaks in a condensed, engineered sans for values and headings (DIN-like Bahnschrift, chosen because the app is offline, CSP forbids CDN fonts, and the letterform is the split-flap board's voice) and a quiet humanist sans for Chinese and body copy. Numerals are always tabular so board columns hold still.

### Hierarchy
- **Display** (620, 30px, 1.12, -0.5px): page titles and the home greeting.
- **Headline** (600, 17px, 1.2, 0.1px): panel and card titles.
- **Title** (600, 13-14px, 1.2): item titles inside panels and cards.
- **Body** (400, 12.5px, 1.7): descriptions, empty states, task text; max ~65ch in paragraphs.
- **Label** (600, 8.5px, 1.6px tracking, mono): board codes, indices, group labels, timestamps.

### Named Rules
**The Board Numeral Rule.** Every number is Bahnschrift with tabular figures in steel ink. No other face renders a number.
**The No-Kicker Rule.** No uppercase micro-label sits above a heading.
**The Flip-Rate Rule.** One animated value per glance: the clock flips on minute change; the seconds cell ticks quietly beside it. Other values update instantly.

## Layout

The window is a two-column board: a frosted 218px index rail (sidebar) and a content board over the glacier gradient. The content column is a single ruled stack per page: page heading, then instrument rows. The home page reads top to bottom as a board: daily note strip, hero (greeting + flip clock), four stat cells in a row, focus and pulse faces, and a two-cell quiet strip for countdown and now playing.

Spacing rhythm is 13px between cells, 14px between board rows, 20px inside faces, 34px page padding. The index rail collapses to 78px (icons only) under 1060px; stat rows collapse to two columns and the focus grid and quiet strip to one under 1180px.

## Elevation & Depth

Depth is light glass over gradient: the app shell carries the glacier gradient, and frosted white faces (backdrop blur + saturation) sit on top of it. Shadows are ambient and soft, always tinted steel blue (rgba(70,100,140,...)) rather than black. One elevation source per element: a face gets either a hairline border or a shadow, never a heavy border under a wide shadow.

### Shadow Vocabulary
- **Ambient face** (`0 16px 40px rgba(70,100,140,.18)`): panels and cards at rest.
- **Floating instrument** (`0 20px 46px rgba(70,100,140,.26)` + inner frost): flip clock, island preview, modal.
- **Pressed control** (`scale(.98)` on :active): physical push feedback on buttons.

## Shapes

One radius system: instrument faces at 16px, inputs and small cells at 10px, pills (999px) only for small controls (buttons, chips, live pills). Active navigation is a pearl-to-glacier gradient cell with a 3px steel rail on the board edge. Flip cells are 16px capsules with an inner hinge hairline, so a value reads as a physical flap even when it does not move.

## Components

### Buttons
- **Shape:** pill (999px), 38px tall.
- **Primary:** pearl-to-glacier gradient with steel ink text; hover lifts the gradient lighter; active presses to 98%.
- **Secondary:** translucent white with a steel hairline border; hover brightens the fill.
- **Text link:** plain, muted, underlines in steel ink on hover; used for quiet actions inside panels.

### Chips / Live Pill
- **Style:** steel hairline border, muted text, 9.5px, pill radius.
- **State:** a steel-blue lamp dot pulses slowly; the chip is the board's "on air" marker.

### Cards / Containers (instrument faces)
- **Corner Style:** 16px radius.
- **Background:** surface glass (rgba(255,255,255,.56)) with backdrop blur over the gradient.
- **Shadow Strategy:** ambient steel-tinted face shadow, no colored glow.
- **Internal Padding:** 20-22px.

### Inputs / Fields
- **Style:** 42px tall, 10px radius, translucent white fill, steel hairline border, steel-muted placeholder.
- **Focus:** border shifts to steel blue; no glow.
- **Error:** status-error border.

### Navigation
- **Style:** 30px icon cell + 12.5px label rows in the frosted rail; icons are authored 24px stroke SVG in one family.
- **Default / hover:** steel-muted text, translucent white fill on hover.
- **Active:** pearl-to-glacier gradient cell with steel ink text and a 3px steel rail; the current page is physically "flipped up" on the board.

### Flip Clock (signature)
- **Style:** 16px ice capsule (white to pearl gradient) with a steel hairline border, inner frost highlight, inner steel shadow, and a horizontal hinge hairline across the middle; steel-ink Bahnschrift digits sit on the hinge. The seconds cell sits to the right, separated by a vertical hairline, rendered smaller and slightly dimmed so the minute value stays dominant.
- **State:** on minute change the digits flip (translateY + scaleY + fade in 300ms); collapses to instant under `prefers-reduced-motion`.
- **Siblings:** countdown unit cells reuse the flap-cell look as white frost cells with steel digits; the island's idle time uses the same ice capsule and steel-ink numerals, and the app icon carries the glacier gradient with the split-flap M mark.

## Do's and Don'ts

### Do:
- **Do** carry surfaces with the pinned glacier gradient family (pearl to base to mid to steel), never scattered color patches.
- **Do** use pearl/glass faces for values, active navigation, and primary actions; steel ink on light, always.
- **Do** reserve steel blue for live or active state, and keep it to a few small lamps per screen.
- **Do** set every numeral in Bahnschrift with tabular figures.
- **Do** let headings speak without a kicker above them.
- **Do** use hairline steel board rules and 16px faces; let frosted glass and the gradient, not the glow, carry depth.

### Don't:
- **Don't** add colored outer glows, gradient text, or blurred blobs; the lamp ring and the clock's inner frost are the only light.
- **Don't** place uppercase micro-labels above headings.
- **Don't** mix accent families; steel blue is the accent, status colors are semantic only.
- **Don't** use em-dashes anywhere in visible copy.
- **Don't** render numbers in the body face or icons as unicode glyphs; values are Bahnschrift, icons are authored SVG.
