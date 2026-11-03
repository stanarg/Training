// Large +/- stepper around a numeric input. Holding a button auto-repeats,
// speeding up the longer it is held. Keyboard activation steps once.

import { fromTemplate, parseNumber } from '../dom.js';

const REPEAT_DELAY = 400;
const REPEAT_START = 140;
const REPEAT_MIN = 45;

let uid = 0;

export class Stepper extends EventTarget {
  #refs = null;
  #value;
  #repeat = 0;

  /**
   * @param {{ label: string, unit?: string, value: number, step: number, min?: number, max?: number, name?: string }} options
   */
  constructor({ label, unit = '', value, step, min = 0, max = 1000, name = '' }) {
    super();
    Object.assign(this, { label, unit, step, min, max, name });
    this.#value = this.#clamp(value);
  }

  get value() {
    return this.#value;
  }

  set value(next) {
    this.#value = this.#clamp(next);
    if (this.#refs) {
      this.#refs.input.value = String(this.#value);
      this.#fit();
    }
  }

  render(root) {
    const { el, refs } = fromTemplate('tpl-stepper');
    this.#refs = refs;
    const id = `stepper-${++uid}`;
    refs.label.textContent = this.label;
    refs.label.htmlFor = id;
    refs.input.id = id;
    refs.input.name = this.name;
    refs.input.value = String(this.#value);
    refs.input.dataset.focusKey = `${this.name}-input`;
    refs.unit.textContent = this.unit;
    const by = `${this.step} ${this.unit}`.trim();
    refs.dec.setAttribute('aria-label', `Decrease ${this.label.toLowerCase()} by ${by}`);
    refs.inc.setAttribute('aria-label', `Increase ${this.label.toLowerCase()} by ${by}`);
    refs.field.addEventListener('click', (event) => {
      if (event.target !== refs.input) refs.input.focus();
    });

    for (const [button, direction] of [[refs.dec, -1], [refs.inc, 1]]) {
      button.addEventListener('pointerdown', (event) => this.#press(event, button, direction));
      button.addEventListener('click', (event) => {
        if (event.detail === 0) this.#nudge(direction); // keyboard: Enter / Space
      });
      button.addEventListener('contextmenu', (event) => event.preventDefault());
    }
    refs.input.addEventListener('change', () => this.#commitInput());
    refs.input.addEventListener('blur', () => this.#commitInput());
    refs.input.addEventListener('focus', () => refs.input.select());
    refs.input.addEventListener('input', () => this.#fit());
    this.#fit();
    root.append(el);
    return el;
  }

  #press(event, button, direction) {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault(); // keep focus where it is and stop text selection
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // Pointer already gone.
    }
    this.#commitInput();
    this.#nudge(direction);
    let interval = REPEAT_START;
    const loop = () => {
      this.#nudge(direction);
      button.classList.add('is-repeating');
      interval = Math.max(REPEAT_MIN, interval * 0.85);
      this.#repeat = setTimeout(loop, interval);
    };
    this.#repeat = setTimeout(loop, REPEAT_DELAY);
    const stop = () => {
      clearTimeout(this.#repeat);
      button.classList.remove('is-repeating');
      button.removeEventListener('pointerup', stop);
      button.removeEventListener('pointercancel', stop);
      button.removeEventListener('lostpointercapture', stop);
    };
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('lostpointercapture', stop);
  }

  /** Size the input to its digits so the unit sits right after the number. */
  #fit() {
    const input = this.#refs.input;
    input.style.width = `${Math.max(1, input.value.length) + 0.6}ch`;
  }

  #nudge(direction) {
    const before = this.#value;
    this.value = this.#value + direction * this.step;
    if (this.#value !== before) this.dispatchEvent(new Event('input'));
  }

  #commitInput() {
    const parsed = parseNumber(this.#refs.input.value);
    if (Number.isFinite(parsed)) this.value = parsed;
    else this.#refs.input.value = String(this.#value);
  }

  #clamp(v) {
    const n = Number.isFinite(v) ? v : this.min;
    return Math.round(Math.min(this.max, Math.max(this.min, n)) * 100) / 100;
  }
}
