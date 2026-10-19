// Swipe left/right between tabs with Pointer Events. The current view follows
// the finger with its neighbour alongside; past the first and last tab the drag
// meets rubber-band resistance. Vertical drags are left to native scrolling.

import { reducedMotion } from './dom.js';

const LOCK_DISTANCE = 10;
const COMMIT_RATIO = 0.3;
const COMMIT_VELOCITY = 0.35; // px per ms
const SETTLE_MS = 150;

/** iOS-style rubber band: resistance grows with distance, never passing `limit`. */
export function rubberBand(offset, limit, coefficient = 0.55) {
  const distance = Math.abs(offset);
  return Math.sign(offset) * ((distance * limit * coefficient) / (limit + coefficient * distance));
}

export class SwipeNav {
  #outlet;
  #router;
  #drag = null;
  #settling = false;

  constructor({ outlet, router }) {
    this.#outlet = outlet;
    this.#router = router;
  }

  render(root = this.#outlet) {
    root.addEventListener('pointerdown', this.#onDown);
    return root;
  }

  #onDown = (event) => {
    if (this.#settling || !event.isPrimary || event.button !== 0) return;
    if (document.querySelector('dialog[open]')) return;
    if (event.target.closest('input, textarea, select, [contenteditable], [data-no-swipe]')) return;
    this.#drag = {
      id: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      lastX: event.clientX,
      lastT: event.timeStamp,
      velocity: 0,
      locked: false,
      offset: 0,
    };
    addEventListener('pointermove', this.#onMove, { passive: false });
    addEventListener('pointerup', this.#onUp);
    addEventListener('pointercancel', this.#onCancel);
  };

  #onMove = (event) => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x0;
    const dy = event.clientY - drag.y0;

    if (!drag.locked) {
      if (Math.hypot(dx, dy) < LOCK_DISTANCE) return;
      if (Math.abs(dx) <= Math.abs(dy) * 1.2) return this.#stop();
      this.#begin(event);
    }

    event.preventDefault();
    const dt = event.timeStamp - drag.lastT;
    if (dt > 0) drag.velocity = 0.7 * ((event.clientX - drag.lastX) / dt) + 0.3 * drag.velocity;
    drag.lastX = event.clientX;
    drag.lastT = event.timeStamp;
    this.#apply(dx);
  };

  #begin(event) {
    const drag = this.#drag;
    const name = this.#router.current;
    drag.locked = true;
    drag.width = this.#outlet.clientWidth;
    drag.index = this.#router.order.indexOf(name);
    drag.currentEl = this.#router.element(name);
    drag.neighbors = new Map();
    try {
      this.#outlet.setPointerCapture(event.pointerId);
    } catch {
      // Pointer already released; the up handler cleans up.
    }
    document.documentElement.classList.add('is-swiping');
  }

  #neighbor(direction) {
    const drag = this.#drag;
    if (!drag.neighbors.has(direction)) {
      const name = this.#router.order[drag.index + direction];
      drag.neighbors.set(direction, name ? { name, el: this.#router.prepare(name) } : null);
    }
    return drag.neighbors.get(direction);
  }

  #apply(dx) {
    const drag = this.#drag;
    const direction = dx < 0 ? 1 : -1;
    const neighbor = this.#neighbor(direction);
    const other = drag.neighbors.get(-direction);
    if (other) {
      other.el.hidden = true;
      other.el.style.transform = '';
    }

    const offset = neighbor ? dx : rubberBand(dx, drag.width);
    drag.offset = offset;
    drag.direction = direction;
    drag.target = neighbor;
    drag.currentEl.style.transform = `translate3d(${offset}px, 0, 0)`;
    if (neighbor) {
      neighbor.el.hidden = false;
      neighbor.el.style.transform = `translate3d(${offset + direction * drag.width}px, 0, 0)`;
    }
  }

  #onUp = (event) => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.locked) return this.#stop();

    const { offset, width, velocity, target, direction } = drag;
    const flung = Math.abs(velocity) > COMMIT_VELOCITY && Math.sign(velocity) === Math.sign(offset);
    const commit = Boolean(target) && (Math.abs(offset) > width * COMMIT_RATIO || flung);
    this.#suppressClick();
    this.#settle(commit ? -direction * width : 0, commit ? target : null);
  };

  #onCancel = () => {
    if (this.#drag?.locked) this.#settle(0, null);
    else this.#stop();
  };

  async #settle(finalOffset, target) {
    const drag = this.#drag;
    this.#stop({ keepDrag: true });
    this.#settling = true;
    const { currentEl, offset, direction, width } = drag;
    const neighbor = drag.target;
    const duration = reducedMotion.matches ? 0 : SETTLE_MS;
    const options = { duration, easing: 'cubic-bezier(0.2, 0, 0, 1)' };
    const animations = [];
    const move = (el, from, to) => {
      el.style.transform = `translate3d(${to}px, 0, 0)`;
      animations.push(el.animate([{ transform: `translate3d(${from}px, 0, 0)` }, { transform: `translate3d(${to}px, 0, 0)` }], options));
    };

    move(currentEl, offset, finalOffset);
    if (neighbor) move(neighbor.el, offset + direction * width, finalOffset + direction * width);
    // Don't wait on a throttled animation clock (app backgrounded mid-swipe).
    await Promise.race([
      Promise.allSettled(animations.map((a) => a.finished)),
      new Promise((resolve) => setTimeout(resolve, duration + 100)),
    ]);
    for (const animation of animations) animation.cancel();

    if (target) await this.#router.go(target.name, { transition: false });
    else if (neighbor) neighbor.el.hidden = true;
    currentEl.style.transform = '';
    if (neighbor) neighbor.el.style.transform = '';
    for (const n of drag.neighbors.values()) if (n && n.name !== this.#router.current) n.el.hidden = true;
    this.#drag = null;
    this.#settling = false;
  }

  #stop({ keepDrag = false } = {}) {
    removeEventListener('pointermove', this.#onMove);
    removeEventListener('pointerup', this.#onUp);
    removeEventListener('pointercancel', this.#onCancel);
    document.documentElement.classList.remove('is-swiping');
    if (!keepDrag) this.#drag = null;
  }

  /** A drag must not also count as a tap on whatever was under the finger. */
  #suppressClick() {
    const swallow = (e) => {
      e.stopPropagation();
      e.preventDefault();
    };
    addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', swallow, { capture: true }), 400);
  }
}
