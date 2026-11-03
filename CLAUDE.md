# Fitness app: build brief for Claude Code

Build a personal, single-user, mobile-first PWA for viewing an alternating two-week (A/B) training plan, logging lifts and runs, and tracking monthly body scans. The owner adds it to his homepage. One user, no accounts, no backend.

## Stack (match the owner's previous app)
Vanilla HTML, CSS and JavaScript (ES modules, ES2022+). No framework, no build step, no npm dependencies at runtime. Use the platform to its full extent; the result must feel like a native app, not a web page. Same layout as his last repo:

```
index.html
manifest.webmanifest
sw.js                 offline cache of the app shell + data/
css/
js/
data/plan.json        source of truth for plan and macros (edited by hand; app only reads it)
icons/
tests/                plain JS tests runnable with node
backups/              exported JSON logs the owner commits by hand
README.md
```

## Data
- `data/plan.json` already exists. Do not change its shape without updating this file:
  ```
  { weekStart: "YYYY-MM-DD",            Monday of a week that uses weeks[0]
    targets: { kcal, protein, fat, carbs, steps },
    rules:   { main, accessory, machines, sessionCapMinutes },
    weeks:   [{ name, sessions: [{ day, title, type: lift|run|rest,
                                  exercises?: [{ id, name, kind: main|accessory, sets?, repRange? }],
                                  distanceKm?, note? }] }] }
  ```
  Weeks rotate from `weekStart` (A, B, A, B…). Every week lists Mon to Sun once. Exercise ids are unique
  across the whole plan (history is keyed by id), so the same movement in both weeks shares one id.
  The run day has no `distanceKm`: the distance is decided on the day.
- Logs live in `localStorage` under key `fitness.store.v2` (v2 started fresh for the new gym; v1 data is left
  untouched under `fitness.store.v1` and v1 backups are refused on import):
  ```
  { version: 2,
    sessions: [{ date, day, exercises: [{ exerciseId, sets: [{ weightKg, reps, rpe? }] }], notes? }],
    runs:     [{ date, distanceKm, minutes? }],
    scans:    [{ date, weightKg, bodyFatPct, muscleKg?, visceralFat?, bmrKcal? }] }
  ```
  `scans` are readings from the gym's body composition analyser, roughly monthly; they replace the old daily
  bodyweight entries.
- Export: button downloads `fitness-backup-YYYY-MM-DD.json`. Import: restore from file, replace store after confirm.
- Wrap all localStorage access in try/catch. App must render with empty storage.

## Views (bottom tab bar, three tabs)
1. **Today**: today's session from this week's plan (A or B). Lift day: list exercises; tapping one opens a set logger (weight kg, reps, optional RPE), pre-filled with the last logged values for that exercise. Rest timer buttons: 90 s and 180 s. Run day: log distance and minutes (no target distance). Rest day: show the step target. When the last body scan is 28 or more days old (or there is none), a reminder card opens the scan form.
2. **Plan**: this week or next week (a segmented switch), read-only, plus a nutrition card with the macro targets and the training rules.
3. **Log**: history by date; per-exercise trend of top-set weight (last 8 entries); the latest body scan with the change since the previous one and a trend per reading. Export and Import buttons live here.

## Rules
- Metric only. Large thumb-reachable controls. Works offline after first load.

## Visual design (light, modern)
- Light theme only, sand and white: background `#F4EFE6` (light beige), cards `#FFFFFF`, text `#111827`, muted text `#665F55` (warm grey). One accent, sand `#A8906F`, fills primary buttons, selected chips, today's day, the progress ring and the trend lines, with dark text (`#111827`) on top. Accent-coloured text, icons and focus rings use the darker sand `#7A6345` so they pass contrast. No gradients, no dark mode.
- Font: system stack (`-apple-system, "SF Pro", Inter, system-ui, sans-serif`). Numbers in inputs and the trend use `font-variant-numeric: tabular-nums`.
- Layout: 16 px page gutter, cards with 16 px radius and a soft shadow (`0 1px 2px rgba(0,0,0,.06), 0 4px 12px rgba(0,0,0,.04)`), 12 px spacing between cards, bottom tab bar with safe-area padding and SVG icons.
- Controls: 48 px minimum tap height, numeric inputs with `inputmode="decimal"`, large +/- stepper buttons for weight (1 kg) and reps (1). Primary button full width.
- Motion: one subtle transition (150 ms) on tab switch and button press. Nothing else animates.
- Reference feel: Apple Fitness and Linear. Clean, quiet, lots of whitespace.

## Native-app feel (required, use modern platform APIs)
- Architecture: small component modules under `js/` (store, router, views, components), each a class or factory with a `render(root)` method. Hash router with view caching. State changes go through the store, views subscribe; no manual DOM patching scattered across files. Use `<template>` elements, `CSS @layer`, container queries and `:has()` where they simplify things.
- Navigation: View Transitions API for tab switches and opening the set logger (feature-detect, fall back to a 150 ms fade). Swipe left/right between tabs with Pointer Events, with rubber-band resistance at the ends.
- Set logger: opens as a bottom sheet (`<dialog>` plus CSS transform) with drag-to-dismiss. Weight and reps use large steppers; long-press auto-repeats. Completing a set triggers `navigator.vibrate(10)` where available and a short check animation.
- Rest timer: runs in the background via `setTimeout` anchored to `performance.now()`, survives tab switches, shows in a persistent pill at the top, posts a Notification when finished if permission was granted, and updates the document title with the countdown.
- Today: a progress ring (SVG) for sets completed, pre-filled weights from history, and a one-tap "same as last time" per exercise.
- Body scans: a bottom-sheet form (date, weight, body fat %, and optional muscle mass, visceral fat level and BMR). One scan per date; saving a date again replaces it, and a scan can be edited or deleted from the Log history.
- Log: history as a vertical timeline grouped by week; per-exercise trend as a responsive SVG line chart with tap-to-inspect tooltip, drawn from the store, no chart library.
- Plan: This week / Next week switch, then a week strip (Mon to Sun, today highlighted) that scrolls with `scroll-snap`.
- Offline and install: service worker with versioned cache, stale-while-revalidate for `data/plan.json`, an in-app update toast when a new version is ready ("Reload"), `manifest.webmanifest` with maskable icons, `apple-touch-icon`, standalone display and a splash colour matching the background.
- Resilience: all storage behind an async store module; export writes via `showSaveFilePicker` when available (fallback to download link); import validates the JSON shape and shows a diff summary before replacing.
- Accessibility: focus visible, `aria-live` on the timer, `prefers-reduced-motion` disables transitions, Dynamic Type respected via `rem` units.
- Quality bar: zero console errors, Lighthouse PWA installable, Performance and Accessibility 90+.
- No analytics, no external requests, no fonts loaded from CDNs.
- Write tests in `tests/` for the store (load, save, export, import) using node's built-in `node:test`.

## Done means
`index.html` opens from a static server, installs as a PWA on iPhone, and a full Lower A session plus a body scan can be logged, exported and re-imported with no console errors.
