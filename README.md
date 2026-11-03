# Fitness app

Personal PWA for an alternating two-week training plan (Week A and Week B), lift and run logging, and monthly
body scans from the gym's analyser. See `CLAUDE.md` for the build brief.

Plan data: `data/plan.json` (edited by hand). Logs: device localStorage, exported as JSON into `backups/`.

## Run it

Any static server works. From this folder:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open <http://localhost:8765/>. Service workers need `localhost` or HTTPS.

To preview another day of the plan, add `?date=YYYY-MM-DD`, for example `/?date=2026-11-09` for Lower B,
`/?date=2026-11-07` for the run day or `/?date=2026-11-08` for a rest day.

## Test

```bash
node --test
```

- `tests/store.test.js`: load, save, export, import, validation, body scans and the import diff.
- `tests/plan.test.js`: A/B week rotation from `weekStart`, the shape of `data/plan.json` (each day once per
  week, unique exercise ids), and history naming logged sessions by their exercises, so moving a session to
  another day keeps past entries labelled correctly.
- `tests/shell.test.js`: every file in the service worker's precache list exists, every JS module and
  stylesheet is precached and modulepreloaded, the manifest icons exist, templates used in JS exist.

## Deploy

Copy the folder to any static host. **Bump `VERSION` in `sw.js` on every deploy**: the new version
installs in the background and the app shows a "A new version is ready · Reload" toast. Adding a file
means adding it to `SHELL` in `sw.js` and a `modulepreload` in `index.html` (the shell test checks both).

`data/plan.json` is served stale-while-revalidate: the app opens with the cached plan, fetches the new
one in the background, and re-renders with a "The plan was updated" toast when it changed. Edits to the
plan do not need a version bump.

## Changing the plan

`weeks` holds Week A and Week B; `weekStart` is a Monday that uses Week A, and the weeks alternate from there
(add a third week and they rotate A, B, C). Each week lists Mon to Sun once. Give every exercise its own `id`:
history and trends are keyed by it, so renaming an exercise is fine but changing its id starts a new history.

## Updating from the first version

Version 2 starts with an empty log (new gym, fresh start). The old log stays on the phone under its old
storage key and is not deleted, but this version does not show it, and backups from the first version can't
be imported. Export a backup from the old app first if you want to keep a copy.

## Install on iPhone

Open the site in Safari, Share → Add to Home Screen. It runs standalone, works offline after the first
load, and keeps its data in the home-screen app's own storage (separate from Safari's).

## Backups

Log → Export saves `fitness-backup-YYYY-MM-DD.json` (lifts, runs and body scans) (save picker where the browser has one, otherwise a
download). Commit those files to `backups/`. Log → Import checks the file, shows what would change on
this device, and replaces the log only after you confirm.

## How it is built

No framework, no build step, no runtime dependencies.

```
index.html                app shell, SVG icon sprite, <template> elements
manifest.webmanifest
sw.js                     versioned precache, stale-while-revalidate for data/plan.json
css/tokens.css            @layer order + design tokens (colour, type, space, motion)
css/base.css              reset, base, layout (views, tab bar), utilities, reduced motion
css/components.css        cards, buttons, stepper, chips, sheet, pill, toast, ring, timeline, chart
css/views.css             per-view layout and the view-transition animations
js/app.js                 wires everything together
js/store.js               async localStorage store, validation, export, import, diff
js/plan.js, js/dates.js   plan helpers, local-date helpers
js/router.js              hash router with cached views and view transitions
js/swipe.js               pointer-events tab swiping with rubber-band ends
js/timer.js               rest timer (performance.now anchored), notification
js/pwa.js                 service worker registration and update toast
js/dom.js                 template, element and transition helpers
js/views/                 Today, Plan, Log (each renders from store state)
js/components/            tab bar, sheet, set logger, scan logger, stepper, ring, chart, pill, toast, backup
```

Weights are kg and the weight stepper moves in 1 kg steps. Timed exercises (repRange ending in `s`, e.g. plank) store the seconds held in `reps`.
