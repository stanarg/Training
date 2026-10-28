// Log: per-exercise trend of top-set weight, backup (export/import) and the
// full history as a timeline grouped by week, newest first.

import { View } from './view.js';
import { fmt1, fmtKg, h, icon, pageHeader } from '../dom.js';
import { formatShort, fromISO, startOfWeek, toISO, weekLabel } from '../dates.js';
import { exerciseIndex, isTimed, loggedTitle } from '../plan.js';
import { countSets } from '../store.js';
import { TrendChart } from '../components/trend-chart.js';

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
  #selected = null;
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

    this.#chart.render(els.chartHost);
    els.chips.addEventListener('change', (event) => {
      this.#selected = event.target.value;
      this.#renderChart();
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
        backupCard,
        h('h2', { class: 'section-title', id: 'log-history-title', text: 'History' }),
        els.timeline,
      ),
    );
  }

  update() {
    this.#renderTrend();
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
    const points = this.ctx.store.topSets(this.#selected, 8);
    const last = points.at(-1);
    const change = points.length > 1 ? last.weightKg - points[0].weightKg : 0;
    els.trendNote.textContent = `${fmtKg(last.weightKg)} kg × ${last.reps}`;
    els.caption.textContent =
      points.length > 1
        ? `${change >= 0 ? '+' : '−'}${fmtKg(Math.abs(change))} kg over the last ${points.length} sessions. Tap a point for details.`
        : 'One session so far. Tap the point for details.';
    this.#chart.update({ points, title: this.#name(this.#selected) });
  }

  #renderBackup() {
    const { store } = this.ctx;
    const { sessions, runs, body } = store.data;
    const els = this.#els;
    els.counts.textContent =
      sessions.length || runs.length || body.length
        ? `On this device: ${plural(sessions.length, 'session')}, ${plural(countSets(store.data), 'set')}, ${plural(runs.length, 'run')}, ${plural(body.length, 'weigh-in')}.`
        : 'Nothing logged on this device yet. Import a backup to restore your log.';
    els.storage.hidden = store.persistent;
  }

  #renderTimeline() {
    const { store, plan, today } = this.ctx;
    const index = exerciseIndex(plan);
    const byDate = new Map();
    const entry = (date) => {
      if (!byDate.has(date)) byDate.set(date, { sessions: [], run: null, body: null });
      return byDate.get(date);
    };
    for (const session of store.data.sessions) entry(session.date).sessions.push(session);
    for (const run of store.data.runs) entry(run.date).run = run;
    for (const b of store.data.body) entry(b.date).body = b;

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

  #item(date, { sessions, run, body }, index) {
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
    if (body) {
      groups.push(h('div', { class: 'timeline__group timeline__line' }, h('span', { text: 'Bodyweight' }), h('span', { text: `${fmtKg(body.weightKg)} kg` })));
    }
    return h(
      'li',
      { class: 'timeline__item' },
      h('span', { class: 'timeline__marker', 'aria-hidden': 'true' }),
      h('article', { class: 'card' }, h('time', { class: 'timeline__date', datetime: date, text: formatShort(date) }), ...groups),
    );
  }
}
