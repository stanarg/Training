# Fitness app

Personal PWA for the weekly training plan and lift logging. See `CLAUDE.md` for the build brief.

Plan data: `data/plan.json` (edited by the coach). Logs: device localStorage, exported as JSON into `backups/`.

## Run it

Any static server works. From this folder:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open <http://localhost:8765/>. Service workers need `localhost` or HTTPS.

To preview another day of the plan, add `?date=YYYY-MM-DD`, for example
`/?date=2026-10-24` for the run day or `/?date=2026-10-25` for a rest day.

## Test

```bash
node --test
```

- `tests/store.test.js`: load, save, export, import, validation and the import diff.
- `tests/plan.test.js`: history names logged sessions by their exercises, so moving a session to another day
  keeps past entries labelled correctly.
- `tests/shell.test.js`: every file in the service worker's precache list exists, every JS module and
  stylesheet is precached and modulepreloaded, the manifest icons exist, templates used in JS exist.

## Deploy

Copy the folder to any static host. **Bump `VERSION` in `sw.js` on every deploy**: the new version
installs in the background and the app shows a "A new version is ready · Reload" toast. Adding a file
means adding it to `SHELL` in `sw.js` and a `modulepreload` in `index.html` (the shell test checks both).

`data/plan.json` is served stale-while-revalidate: the app opens with the cached plan, fetches the new
one in the background, and re-renders with a "The plan was updated" toast when it changed. Coach edits
to the plan do not need a version bump.

## Install on iPhone

Open the site in Safari, Share → Add to Home Screen. It runs standalone, works offline after the first
load, and keeps its data in the home-screen app's own storage (separate from Safari's).

## Backups

Log → Export saves `fitness-backup-YYYY-MM-DD.json` (save picker where the browser has one, otherwise a
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
js/components/            tab bar, sheet, set logger, stepper, ring, chart, pill, toast, backup
```

Weights are kg. Timed exercises (repRange ending in `s`, e.g. plank) store the seconds held in `reps`.
