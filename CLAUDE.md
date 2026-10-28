# Fitness app: build brief for Claude Code

Build a personal, single-user, mobile-first PWA for viewing a weekly training plan and logging lifts. The owner adds it to his homepage. One user, no accounts, no backend.

## Stack (match the owner's previous app)
Vanilla HTML, CSS and JavaScript (ES modules, ES2022+). No framework, no build step, no npm dependencies at runtime. Use the platform to its full extent; the result must feel like a native app, not a web page. Same layout as his last repo:

```
index.html
manifest.webmanifest
sw.js                 offline cache of the app shell + data/
css/
js/
data/plan.json        source of truth for plan and macros (coach edits this; app only reads it)
icons/
tests/                plain JS tests runnable with node
backups/              exported JSON logs the owner commits by hand
README.md
```

## Data
- `data/plan.json` already exists. Do not change its shape without updating this file.
- Logs live in `localStorage` under key `fitness.store.v1`:
  ```
  { version: 1,
    sessions: [{ date, day, exercises: [{ exerciseId, sets: [{ weightKg, reps, rpe? }] }], notes? }],
    runs:     [{ date, distanceKm, minutes? }],
    body:     [{ date, weightKg }] }
  ```
- Export: button downloads `fitness-backup-YYYY-MM-DD.json`. Import: restore from file, replace store after confirm.
- Wrap all localStorage access in try/catch. App must render with empty storage.

## Views (bottom tab bar, three tabs)
1. **Today**: today's session from plan.json. Lift day: list exercises; tapping one opens a set logger (weight kg, reps, optional RPE), pre-filled with the last logged values for that exercise. Rest timer buttons: 90 s and 180 s. Run day: log distance and minutes. Rest day: show the step target. Every day: one-field bodyweight entry.
2. **Plan**: the full week read-only, plus a nutrition card with the macro targets.
3. **Log**: history by date; per-exercise trend of top-set weight (last 8 entries, simple inline SVG or canvas). Export and Import buttons live here.

## Rules
- Metric only. Large thumb-reachable controls. Works offline after first load.

## Visual design (light, modern)
- Light theme only: background `#FAFAF9`, cards `#FFFFFF`, text `#111827`, muted text `#6B7280`, one accent `#0F766E` (deep green) for primary buttons, active tab and trend line. No gradients, no dark mode.
- Font: system stack (`-apple-system, "SF Pro", Inter, system-ui, sans-serif`). Numbers in inputs and the trend use `font-variant-numeric: tabular-nums`.
- Layout: 16 px page gutter, cards with 16 px radius and a soft shadow (`0 1px 2px rgba(0,0,0,.06), 0 4px 12px rgba(0,0,0,.04)`), 12 px spacing between cards, bottom tab bar with safe-area padding and SVG icons.
- Controls: 48 px minimum tap height, numeric inputs with `inputmode="decimal"`, large +/- stepper buttons for weight (2.5 kg) and reps (1). Primary button full width.
- Motion: one subtle transition (150 ms) on tab switch and button press. Nothing else animates.
- Reference feel: Apple Fitness and Linear. Clean, quiet, lots of whitespace.

## Native-app feel (required, use modern platform APIs)
- Architecture: small component modules under `js/` (store, router, views, components), each a class or factory with a `render(root)` method. Hash router with view caching. State changes go through the store, views subscribe; no manual DOM patching scattered across files. Use `<template>` elements, `CSS @layer`, container queries and `:has()` where they simplify things.
- Navigation: View Transitions API for tab switches and opening the set logger (feature-detect, fall back to a 150 ms fade). Swipe left/right between tabs with Pointer Events, with rubber-band resistance at the ends.
- Set logger: opens as a bottom sheet (`<dialog>` plus CSS transform) with drag-to-dismiss. Weight and reps use large steppers; long-press auto-repeats. Completing a set triggers `navigator.vibrate(10)` where available and a short check animation.
- Rest timer: runs in the background via `setTimeout` anchored to `performance.now()`, survives tab switches, shows in a persistent pill at the top, posts a Notification when finished if permission was granted, and updates the document title with the countdown.
- Today: a progress ring (SVG) for sets completed, pre-filled weights from history, and a one-tap "same as last time" per exercise.
- Log: history as a vertical timeline grouped by week; per-exercise trend as a responsive SVG line chart with tap-to-inspect tooltip, drawn from the store, no chart library.
- Plan: week strip at the top (Mon to Sun, today highlighted) that scrolls with `scroll-snap`.
- Offline and install: service worker with versioned cache, stale-while-revalidate for `data/plan.json`, an in-app update toast when a new version is ready ("Reload"), `manifest.webmanifest` with maskable icons, `apple-touch-icon`, standalone display and a splash colour matching the background.
- Resilience: all storage behind an async store module; export writes via `showSaveFilePicker` when available (fallback to download link); import validates the JSON shape and shows a diff summary before replacing.
- Accessibility: focus visible, `aria-live` on the timer, `prefers-reduced-motion` disables transitions, Dynamic Type respected via `rem` units.
- Quality bar: zero console errors, Lighthouse PWA installable, Performance and Accessibility 90+.
- No analytics, no external requests, no fonts loaded from CDNs.
- Write tests in `tests/` for the store (load, save, export, import) using node's built-in `node:test`.

## Done means
`index.html` opens from a static server, installs as a PWA on iPhone, and a full Lower session can be logged, exported and re-imported with no console errors.
