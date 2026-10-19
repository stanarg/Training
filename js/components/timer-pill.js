// Persistent rest-timer pill at the top of the screen. It also mirrors the
// countdown into the document title and announces milestones politely.

import { fromTemplate, setTitle } from '../dom.js';
import { formatClock } from '../timer.js';

const ANNOUNCE_AT = new Set([60, 30, 10]);

export class TimerPill {
  #timer;
  #refs = null;
  #root = null;
  #live = null;
  #lastSecond = null;

  constructor({ timer }) {
    this.#timer = timer;
  }

  /** @param {HTMLElement} root the pill container; its live region is #timer-live. */
  render(root) {
    this.#root = root;
    this.#live = document.getElementById('timer-live');
    const { el, refs } = fromTemplate('tpl-timer-pill');
    this.#refs = refs;
    root.replaceChildren(el);
    refs.add.addEventListener('click', () => this.#timer.add(30));
    refs.cancel.addEventListener('click', () => {
      this.#timer.cancel();
      this.#announce('Rest timer stopped.');
    });
    this.#timer.addEventListener('change', (event) => this.update(event.detail));
    return root;
  }

  update({ state, remaining, duration }) {
    const refs = this.#refs;
    this.#root.hidden = state === 'idle';
    this.#root.dataset.state = state;

    if (state === 'running') {
      const clock = formatClock(remaining);
      const seconds = Math.ceil(remaining / 1000);
      refs.label.textContent = 'Rest';
      refs.time.textContent = clock;
      refs.time.setAttribute('datetime', `PT${seconds}S`);
      refs.cancel.setAttribute('aria-label', 'Stop rest timer');
      setTitle({ prefix: `${clock} rest` });
      if (this.#lastSecond === null) this.#announce(`Rest timer started, ${Math.round(duration / 1000)} seconds.`);
      else if (seconds !== this.#lastSecond && ANNOUNCE_AT.has(seconds)) this.#announce(`${seconds} seconds left.`);
      this.#lastSecond = seconds;
    } else if (state === 'done') {
      refs.label.textContent = 'Rest over';
      refs.time.textContent = '0:00';
      refs.cancel.setAttribute('aria-label', 'Dismiss');
      setTitle({ prefix: 'Rest over' });
      this.#announce('Rest is over. Time for your next set.');
      this.#lastSecond = null;
    } else {
      setTitle({ prefix: '' });
      this.#lastSecond = null;
    }
  }

  #announce(text) {
    if (this.#live) this.#live.textContent = text;
  }
}
