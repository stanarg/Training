// SVG progress ring. pathLength=100 keeps the dash maths in percent.

import { svg } from '../dom.js';

export class ProgressRing {
  #els = null;

  /** @param {{ size?: 'large' | 'small', stroke?: number, label?: boolean }} options */
  constructor({ size = 'large', stroke = 10, label = true } = {}) {
    Object.assign(this, { size, stroke, label });
  }

  render(root) {
    const wrap = document.createElement('div');
    wrap.className = this.size === 'small' ? 'ring ring--small' : 'ring';
    const r = 50 - this.stroke / 2;
    const ring = svg('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', focusable: 'false' });
    const track = svg('circle', { class: 'ring__track', cx: 50, cy: 50, r, fill: 'none', 'stroke-width': this.stroke });
    const value = svg('circle', {
      class: 'ring__value',
      cx: 50,
      cy: 50,
      r,
      fill: 'none',
      'stroke-width': this.stroke,
      'stroke-linecap': 'round',
      pathLength: 100,
      'stroke-dasharray': '100 100',
      transform: 'rotate(-90 50 50)',
    });
    ring.append(track, value);
    wrap.append(ring);
    const text = document.createElement('div');
    text.className = 'ring__label';
    if (this.label) wrap.append(text);
    this.#els = { wrap, value, text };
    root.append(wrap);
    return wrap;
  }

  update({ done, total }) {
    const ratio = total > 0 ? Math.min(1, done / total) : 0;
    const { value, text, wrap } = this.#els;
    value.setAttribute('stroke-dashoffset', String(100 - ratio * 100));
    value.style.opacity = ratio > 0 ? '1' : '0';
    wrap.dataset.complete = ratio >= 1 ? 'true' : 'false';
    if (this.label) {
      text.replaceChildren();
      const count = document.createElement('span');
      count.className = 'ring__count';
      count.textContent = String(done);
      const of = document.createElement('span');
      of.className = 'ring__total';
      of.textContent = `of ${total}`;
      text.append(count, of);
    }
  }
}
