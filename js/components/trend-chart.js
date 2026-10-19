// Responsive SVG line chart of top-set weight. Redraws at the container's real
// pixel size (ResizeObserver) so text and strokes stay crisp. Tap or drag to
// inspect a point; arrow keys do the same from the keyboard.

import { fmtKg, h, svg } from '../dom.js';
import { formatDayMonth } from '../dates.js';

const PAD = { top: 14, right: 14, bottom: 24, left: 40 };

const STEPS = [1, 2, 2.5, 5, 10, 20, 25, 50, 100];

/** Round axis bounds and ticks, with a little room above and below the data. */
export function niceScale(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = STEPS.find((s) => s >= Math.max(max - min, 2.5) / 2) ?? 100;
  let lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  if (min - lo < step * 0.15) lo -= step;
  if (hi - max < step * 0.15) hi += step;
  lo = Math.max(0, lo);
  const ticks = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return { lo, hi, ticks };
}

export class TrendChart {
  #wrap = null;
  #svg = null;
  #tooltip = null;
  #live = null;
  #table = null;
  #points = [];
  #title = '';
  #active = null;
  #size = { width: 0, height: 0 };
  #geometry = [];

  render(root) {
    this.#svg = svg('svg', { role: 'img' });
    this.#tooltip = h('div', { class: 'chart__tooltip', hidden: true, 'aria-hidden': 'true' });
    this.#live = h('p', { class: 'sr-only', 'aria-live': 'polite' });
    this.#table = h('table', { class: 'sr-only' });
    this.#wrap = h(
      'div',
      { class: 'chart', role: 'group', tabindex: '0', 'data-no-swipe': '', 'aria-label': 'Trend chart. Use the arrow keys to inspect each session.' },
      this.#svg,
      this.#tooltip,
      this.#live,
    );
    root.append(this.#wrap, this.#table);

    new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width === this.#size.width && height === this.#size.height) return;
      this.#size = { width, height };
      this.#draw();
    }).observe(this.#wrap);

    this.#wrap.addEventListener('pointerdown', (event) => {
      this.#pick(event);
      const move = (e) => this.#pick(e);
      const up = () => {
        this.#wrap.removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        removeEventListener('pointercancel', up);
      };
      this.#wrap.addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      addEventListener('pointercancel', up);
    });
    this.#wrap.addEventListener('keydown', (event) => this.#onKey(event));
    return this.#wrap;
  }

  /** @param {{ points: { date: string, weightKg: number, reps: number }[], title: string }} data */
  update({ points, title }) {
    const changed = title !== this.#title;
    this.#points = points;
    this.#title = title;
    if (changed || this.#active >= points.length) this.#active = null;
    this.#renderTable();
    this.#draw();
  }

  #renderTable() {
    const rows = this.#points.map((p) =>
      h('tr', {}, h('th', { scope: 'row', text: formatDayMonth(p.date) }), h('td', { text: `${fmtKg(p.weightKg)} kg × ${p.reps}` })),
    );
    this.#table.replaceChildren(
      h('caption', { text: `${this.#title}: top set per session` }),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Date' }), h('th', { scope: 'col', text: 'Top set' }))),
      h('tbody', {}, ...rows),
    );
  }

  #draw() {
    const { width, height } = this.#size;
    const points = this.#points;
    const chart = this.#svg;
    chart.replaceChildren();
    this.#geometry = [];
    if (!width || !height || !points.length) {
      this.#tooltip.hidden = true;
      return;
    }
    chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const first = points[0];
    const last = points.at(-1);
    chart.setAttribute(
      'aria-label',
      points.length === 1
        ? `${this.#title}: ${fmtKg(last.weightKg)} kg on ${formatDayMonth(last.date)}.`
        : `${this.#title}, last ${points.length} sessions: from ${fmtKg(first.weightKg)} kg on ${formatDayMonth(first.date)} to ${fmtKg(last.weightKg)} kg on ${formatDayMonth(last.date)}.`,
    );

    const { lo, hi, ticks } = niceScale(points.map((p) => p.weightKg));
    const plotW = width - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    const x = (i) => (points.length === 1 ? PAD.left + plotW / 2 : PAD.left + (i / (points.length - 1)) * plotW);
    const y = (v) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;

    for (const value of ticks) {
      const gy = Math.round(y(value)) + 0.5;
      chart.append(svg('line', { class: 'chart__grid', x1: PAD.left, x2: width - PAD.right, y1: gy, y2: gy }));
      const label = svg('text', { class: 'chart__axis', x: PAD.left - 8, y: gy, 'text-anchor': 'end', 'dominant-baseline': 'middle' });
      label.textContent = fmtKg(value);
      chart.append(label);
    }
    const dateLabels = points.length === 1 ? [0] : [0, points.length - 1];
    for (const i of dateLabels) {
      const anchor = points.length === 1 ? 'middle' : i === 0 ? 'start' : 'end';
      const label = svg('text', { class: 'chart__axis', x: points.length === 1 ? x(i) : i === 0 ? PAD.left : width - PAD.right, y: height - 4, 'text-anchor': anchor });
      label.textContent = formatDayMonth(points[i].date);
      chart.append(label);
    }

    this.#geometry = points.map((p, i) => ({ x: x(i), y: y(p.weightKg) }));
    if (this.#active !== null) {
      const { x: cx } = this.#geometry[this.#active];
      chart.append(svg('line', { class: 'chart__cursor', x1: cx, x2: cx, y1: PAD.top, y2: height - PAD.bottom }));
    }
    if (points.length > 1) {
      const d = this.#geometry.map((g, i) => `${i ? 'L' : 'M'}${g.x.toFixed(1)} ${g.y.toFixed(1)}`).join(' ');
      chart.append(svg('path', { class: 'chart__line', d }));
    }
    this.#geometry.forEach((g, i) => {
      const dot = svg('circle', { class: 'chart__dot', cx: g.x, cy: g.y, r: i === this.#active ? 6 : 4.5 });
      if (i === this.#active) dot.setAttribute('data-active', '');
      chart.append(dot);
    });
    this.#renderTooltip();
  }

  #renderTooltip() {
    const tip = this.#tooltip;
    if (this.#active === null) {
      tip.hidden = true;
      return;
    }
    const point = this.#points[this.#active];
    const { x, y } = this.#geometry[this.#active];
    tip.replaceChildren(h('strong', { text: `${fmtKg(point.weightKg)} kg × ${point.reps}` }), formatDayMonth(point.date));
    tip.hidden = false;
    const half = tip.offsetWidth / 2;
    tip.style.left = `${Math.min(Math.max(x, half), this.#size.width - half)}px`;
    tip.style.top = `${y}px`;
    this.#live.textContent = `${formatDayMonth(point.date)}: ${fmtKg(point.weightKg)} kg × ${point.reps}`;
  }

  #pick(event) {
    if (!this.#geometry.length) return;
    const rect = this.#wrap.getBoundingClientRect();
    const px = event.clientX - rect.left;
    let best = 0;
    for (let i = 1; i < this.#geometry.length; i++) {
      if (Math.abs(this.#geometry[i].x - px) < Math.abs(this.#geometry[best].x - px)) best = i;
    }
    if (best !== this.#active) {
      this.#active = best;
      this.#draw();
    }
  }

  #onKey(event) {
    const n = this.#points.length;
    if (!n) return;
    const keys = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity };
    if (event.key === 'Escape') {
      this.#active = null;
      return this.#draw();
    }
    if (!(event.key in keys)) return;
    event.preventDefault();
    const step = keys[event.key];
    const current = this.#active ?? (step > 0 ? -1 : n);
    this.#active = Math.min(n - 1, Math.max(0, Number.isFinite(step) ? current + step : step > 0 ? n - 1 : 0));
    this.#draw();
  }
}
