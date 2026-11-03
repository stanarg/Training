// Log: per-exercise trend of top-set weight, the latest body scan with a trend
// per reading, backup (export/import) and the full history as a timeline
// grouped by week, newest first.

import { View } from './view.js';
import { fmt1, fmtKg, formatSet, h, icon, pageHeader } from '../dom.js';
import { formatDayMonth, formatShort, fromISO, startOfWeek, toISO, weekLabel } from '../dates.js';
import { exerciseIndex, isTimed, loggedTitle } from '../plan.js';
import { countSets } from '../store.js';
import { TrendChart } from '../components/trend-chart.js';
import { SCAN_METRICS, daysAgo, formatChange, formatMetric, formatValue } from '../components/scan-logger.js';

const SCAN_TREND_LIMIT = 12;

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function summarizeSets(sets, timed) {
  const unit = timed ? ' s' : '';
  const weights = new Set(sets.map((s) => s.weightKg));
  if (weights.size === 1) {
    const [w] = weights;
    const reps = sets.map((s) => s.reps).join(', ');
    return w > 0 ? `${fmtKg(w)} kg × ${reps}${unit}` : `${reps}${unit || ' reps'}`;
  }
  return sets.map((s) => `${fmtKg(s.weightKg)}×${s.reps}${unit}`).join(' · ');
}

export class LogView extends View {
  #chart = new TrendChart();
  #scanChart = new TrendChart();
  #selected = null;
  #scanMetric = null;
  #els = {};

  constructor(ctx) {
    super(ctx);
    ctx.store.subscribe(() => this.invalidate());
  }

  render(root) {
    super.render(root);
    const els = this.#els;
    els.chips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Exercise', 'data-no-swipe': '' });
    els.trendNote = h('span', { class: 'card-note num' });
    els.trendEmpty = h('p', { class: 'empty', text: 'Log a few sessions to see your top-set trend here.' });
    els.chartHost = h('div');
    els.caption = h('p', { class: 'chart-caption' });
    els.counts = h('p', { class: 'card-text num' });
    els.storage = h('p', { class: 'notice', hidden: true, text: 'This browser is not letting the app store data, so entries only last until you close it. Export a backup.' });
    els.file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, 'aria-hidden': 'true', tabindex: '-1' });
    els.timeline = h('div', { class: 'timeline-weeks' });
    els.scanNote = h('span', { class: 'card-note num' });
    els.scanEmpty = h('p', { class: 'empty', text: 'No scans yet. Log one after your next session on the analyser; once a month is plenty.' });
    els.scanStats = h('div', { class: 'stats stats--scan' });
    els.scanSince = h('p', { class: 'card-text' });
    els.scanChips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Reading', 'data-no-swipe': '' });
    els.scanChartHost = h('div');
    els.scanCaption = h('p', { class: 'chart-caption' });

    this.#chart.render(els.chartHost);
    this.#scanChart.render(els.scanChartHost);
    els.chips.addEventListener('change', (event) => {
      this.#selected = event.target.value;
      this.#renderChart();
    });
    els.scanChips.addEventListener('change', (event) => {
      this.#scanMetric = event.target.value;
      this.#renderScanChart();
    });
    els.file.addEventListener('change', async () => {
      const [file] = els.file.files;
      els.file.value = '';
      if (file) await this.ctx.backup.import(file);
    });

    const trendCard = h(
      'section',
      { class: 'card', 'aria-labelledby': 'log-trend-title' },
      h('div', { class: 'card-header' }, h('h2', { class: 'card-title', id: 'log-trend-title', text: 'Top set' }), els.trendNote),
      els.chips,
      els.trendEmpty,
      els.chartHost,
      els.caption,
    );
    const scanCard = h(
      'section',
      { class: 'card', 'aria-labelledby': 'log-scan-title' },
      h('div', { class: 'card-header' }, h('h2', { class: 'card-title', id: 'log-scan-title', text: 'Body scan' }), els.scanNote),
      els.scanEmpty,
      els.scanStats,
      els.scanSince,
      els.scanChips,
      els.scanChartHost,
      els.scanCaption,
      h('button', { type: 'button', class: 'btn btn--tinted btn--block', 'data-focus-key': 'scan-open', onclick: () => this.ctx.openScan() }, 'Log scan'),
    );
    const backupCard = h(
      'section',
      { class: 'card', 'aria-labelledby': 'log-backup-title' },
      h('div', { class: 'card-header' }, h('h2', { class: 'card-title', id: 'log-backup-title', text: 'Backup' })),
      els.counts,
      h('p', { class: 'card-text', text: 'Export a JSON file now and then, and keep it in the backups folder.' }),
      els.storage,
      h(
        'div',
        { class: 'backup-actions' },
        h('button', { type: 'button', class: 'btn btn--secondary', 'data-focus-key': 'export', onclick: () => this.ctx.backup.export() }, icon('export'), 'Export'),
        h('button', { type: 'button', class: 'btn btn--secondary', 'data-focus-key': 'import', onclick: () => els.file.click() }, icon('import'), 'Import'),
      ),
      els.file,
    );

    root.append(
      h(
        'div',
        { class: 'view-content' },
        pageHeader({ eyebrow: 'History', title: 'Log', id: 'log-title' }),
        trendCard,
        scanCard,
        backupCard,
        h('h2', { class: 'section-title', id: 'log-history-title', text: 'History' }),
        els.timeline,
      ),
    );
  }

  update() {
    this.#renderTrend();
    this.#renderScans();
    this.#renderBackup();
    this.#renderTimeline();
  }

  #name(id) {
    return exerciseIndex(this.ctx.plan).get(id)?.name ?? id;
  }

  #renderTrend() {
    const { store } = this.ctx;
    const els = this.#els;
    const ids = store.loggedExerciseIds();
    if (!ids.includes(this.#selected)) this.#selected = ids[0] ?? null;
    els.trendEmpty.hidden = ids.length > 0;
    els.chartHost.hidden = ids.length === 0;
    els.chips.hidden = ids.length === 0;
    els.caption.hidden = ids.length === 0;

    els.chips.replaceChildren(
      ...ids.map((id) => {
        const input = h('input', { type: 'radio', name: 'trend-exercise', value: id, 'data-focus-key': `trend-${id}` });
        input.checked = id === this.#selected;
        return h('label', { class: 'chip' }, input, h('span', { text: this.#name(id) }));
      }),
    );

    this.#renderChart();
  }

  #renderChart() {
    const els = this.#els;
    if (!this.#selected) {
      els.trendNote.textContent = '';
      return;
    }
    // Timed exercises (plank) trend on the seconds held, not the added weight.
    const exercise = exerciseIndex(this.ctx.plan).get(this.#selected);
    const timed = exercise ? isTimed(exercise) : false;
    const value = (set) => (timed ? set.reps : set.weightKg);
    const sets = this.ctx.store.topSets(this.#selected, 8);
    const last = sets.at(-1);
    const change = sets.length > 1 ? value(last) - value(sets[0]) : 0;
    els.trendNote.textContent = formatSet(last, { timed });
    els.caption.textContent =
      sets.length > 1
        ? `${change >= 0 ? '+' : '−'}${fmtKg(Math.abs(change))} ${timed ? 's' : 'kg'} over the last ${sets.length} sessions. Tap a point for details.`
        : 'One session so far. Tap the point for details.';
    const points = sets.map((set) => ({ date: set.date, value: value(set), text: formatSet(set, { timed }) }));
    this.#chart.update({ points, title: this.#name(this.#selected), valueLabel: 'Top set' });
  }

  #renderScans() {
    const { store, today } = this.ctx;
    const els = this.#els;
    const { scans } = store.data;
    const last = scans.at(-1);
    const previous = scans.at(-2);
    for (const el of [els.scanStats, els.scanSince, els.scanChips, els.scanChartHost, els.scanCaption]) el.hidden = !last;
    els.scanEmpty.hidden = Boolean(last);
    els.scanNote.textContent = last ? `${formatDayMonth(last.date)} · ${daysAgo(last.date, today.iso)}` : 'Monthly';
    if (!last) return;

    els.scanStats.replaceChildren(
      ...SCAN_METRICS.filter((m) => last[m.key] !== undefined).map((metric) => {
        const before = previous?.[metric.key];
        return h(
          'div',
          { class: 'stat' },
          h('p', { class: 'stat__label', text: metric.label }),
          h(
            'p',
            {},
            h('span', { class: 'stat__value', text: formatValue(metric, last[metric.key]) }),
            metric.unit ? h('span', { class: 'stat__unit', text: metric.unit }) : null,
          ),
          before === undefined ? null : h('p', { class: 'stat__change num', text: formatChange(metric, last[metric.key] - before) }),
        );
      }),
    );
    els.scanSince.textContent = previous ? `Changes since your scan on ${formatDayMonth(previous.date)}.` : 'Your next scan will show the change from this one.';

    const metrics = SCAN_METRICS.filter((m) => scans.some((scan) => scan[m.key] !== undefined));
    if (!metrics.some((m) => m.key === this.#scanMetric)) this.#scanMetric = metrics[0].key;
    els.scanChips.replaceChildren(
      ...metrics.map((metric) => {
        const input = h('input', { type: 'radio', name: 'trend-scan', value: metric.key, 'data-focus-key': `scan-trend-${metric.key}` });
        input.checked = metric.key === this.#scanMetric;
        return h('label', { class: 'chip' }, input, h('span', { text: metric.label }));
      }),
    );
    this.#renderScanChart();
  }

  #renderScanChart() {
    const metric = SCAN_METRICS.find((m) => m.key === this.#scanMetric);
    if (!metric) return;
    const scans = this.ctx.store.data.scans.filter((scan) => scan[metric.key] !== undefined).slice(-SCAN_TREND_LIMIT);
    const points = scans.map((scan) => ({ date: scan.date, value: scan[metric.key], text: formatMetric(metric, scan[metric.key]) }));
    const change = points.length > 1 ? points.at(-1).value - points[0].value : 0;
    this.#els.scanCaption.textContent =
      points.length > 1
        ? `${formatChange(metric, change)} since ${formatDayMonth(points[0].date)}. Tap a point for details.`
        : 'One scan so far. Tap the point for details.';
    this.#scanChart.update({ points, title: metric.label, valueLabel: 'Reading' });
  }

  #renderBackup() {
    const { store } = this.ctx;
    const { sessions, runs, scans } = store.data;
    const els = this.#els;
    els.counts.textContent =
      sessions.length || runs.length || scans.length
        ? `On this device: ${plural(sessions.length, 'session')}, ${plural(countSets(store.data), 'set')}, ${plural(runs.length, 'run')}, ${plural(scans.length, 'body scan')}.`
        : 'Nothing logged on this device yet. Import a backup to restore your log.';
    els.storage.hidden = store.persistent;
  }

  #renderTimeline() {
    const { store, plan, today } = this.ctx;
    const index = exerciseIndex(plan);
    const byDate = new Map();
    const entry = (date) => {
      if (!byDate.has(date)) byDate.set(date, { sessions: [], run: null, scan: null });
      return byDate.get(date);
    };
    for (const session of store.data.sessions) entry(session.date).sessions.push(session);
    for (const run of store.data.runs) entry(run.date).run = run;
    for (const scan of store.data.scans) entry(scan.date).scan = scan;

    if (!byDate.size) {
      this.#els.timeline.replaceChildren(h('div', { class: 'card' }, h('p', { class: 'empty', text: 'No entries yet. Log your first set from Today.' })));
      return;
    }

    const weeks = new Map();
    for (const date of [...byDate.keys()].sort().reverse()) {
      const monday = toISO(startOfWeek(fromISO(date)));
      if (!weeks.has(monday)) weeks.set(monday, []);
      weeks.get(monday).push(date);
    }

    const sections = [];
    for (const [monday, dates] of weeks) {
      const titleId = `log-week-${monday}`;
      sections.push(
        h(
          'section',
          { class: 'timeline-week', 'aria-labelledby': titleId },
          h('h3', { class: 'timeline-week__title', id: titleId, text: weekLabel(monday, today.iso) }),
          h('ol', { class: 'timeline' }, ...dates.map((date) => this.#item(date, byDate.get(date), index))),
        ),
      );
    }
    this.#els.timeline.replaceChildren(...sections);
  }

  #item(date, { sessions, run, scan }, index) {
    const groups = [];
    for (const session of sessions) {
      const title = loggedTitle(this.ctx.plan, session);
      groups.push(
        h(
          'div',
          { class: 'timeline__group' },
          h('h4', { class: 'timeline__title', text: title }),
          h(
            'ul',
            { class: 'timeline__lines' },
            ...session.exercises.map((e) => {
              const exercise = index.get(e.exerciseId);
              return h(
                'li',
                { class: 'timeline__line' },
                h('span', { text: exercise?.name ?? e.exerciseId }),
                h('span', { text: summarizeSets(e.sets, exercise ? isTimed(exercise) : false) }),
              );
            }),
          ),
          session.notes ? h('p', { class: 'card-text', text: session.notes }) : null,
        ),
      );
    }
    if (run) {
      const parts = [`${fmt1(run.distanceKm)} km`, run.minutes ? `${fmt1(run.minutes)} min` : null].filter(Boolean);
      groups.push(h('div', { class: 'timeline__group timeline__line' }, h('span', { text: 'Run' }), h('span', { text: parts.join(' · ') })));
    }
    if (scan) {
      groups.push(
        h(
          'div',
          { class: 'timeline__group' },
          h(
            'div',
            { class: 'timeline__head' },
            h('h4', { class: 'timeline__title', text: 'Body scan' }),
            h('button', { type: 'button', class: 'btn btn--plain btn--small', 'data-focus-key': `scan-edit-${date}`, 'aria-label': `Edit body scan on ${formatShort(date)}`, onclick: () => this.ctx.openScan({ date }) }, 'Edit'),
          ),
          h(
            'ul',
            { class: 'timeline__lines' },
            ...SCAN_METRICS.filter((m) => scan[m.key] !== undefined).map((m) =>
              h('li', { class: 'timeline__line' }, h('span', { text: m.label }), h('span', { text: formatMetric(m, scan[m.key]) })),
            ),
          ),
        ),
      );
    }
    return h(
      'li',
      { class: 'timeline__item' },
      h('span', { class: 'timeline__marker', 'aria-hidden': 'true' }),
      h('article', { class: 'card' }, h('time', { class: 'timeline__date', datetime: date, text: formatShort(date) }), ...groups),
    );
  }
}
