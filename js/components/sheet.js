// Bottom sheet on a modal <dialog>. Opens and closes with a view transition
// (fade fallback), and can be dragged down by its grabber/header to dismiss.

import { reducedMotion, withTransition } from '../dom.js';

const DISMISS_RATIO = 0.25;
const DISMISS_VELOCITY = 0.5; // px per ms

export class BottomSheet {
  #dialog = null;
  #refs = {};
  #onClose = null;
  #drag = null;
  #closing = false;

  get isOpen() {
    return Boolean(this.#dialog?.open);
  }

  /** @param {HTMLDialogElement} dialog the static sheet markup in index.html */
  render(dialog) {
    this.#dialog = dialog;
    for (const el of dialog.querySelectorAll('[data-ref]')) this.#refs[el.dataset.ref] = el;

    this.#refs.done.addEventListener('click', () => this.close());
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.close();
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) this.close();
    });
    dialog.addEventListener('close', () => this.#cleanup());
    this.#refs.grab.addEventListener('pointerdown', this.#onDown);
    return dialog;
  }

  /**
   * @param {{ title: string, subtitle?: string, content: Node, onClose?: () => void, doneLabel?: string, size?: 'auto' | 'large' }} options
   *   size 'large' fixes the height, so controls stay put while the content grows.
   */
  async open({ title, subtitle = '', content, onClose, doneLabel = 'Done', size = 'auto' }) {
    if (this.isOpen) this.#cleanup();
    this.#onClose = onClose ?? null;
    this.#dialog.dataset.size = size;
    this.setHeader({ title, subtitle });
    this.#refs.done.textContent = doneLabel;
    this.#refs.body.replaceChildren(content);
    this.#refs.body.scrollTop = 0;
    if (this.isOpen) return;
    await withTransition('sheet-open', () => this.#dialog.showModal(), this.#dialog);
  }

  setHeader({ title, subtitle }) {
    if (title !== undefined) this.#refs.title.textContent = title;
    if (subtitle !== undefined) {
      this.#refs.subtitle.textContent = subtitle;
      this.#refs.subtitle.hidden = !subtitle;
    }
  }

  async close() {
    if (!this.isOpen || this.#closing) return;
    this.#closing = true;
    try {
      await withTransition('sheet-close', () => this.#dialog.close());
    } finally {
      this.#closing = false;
    }
  }

  #cleanup() {
    const onClose = this.#onClose;
    this.#onClose = null;
    this.#dialog.style.transform = '';
    this.#dialog.style.removeProperty('--drag-progress');
    onClose?.();
  }

  // ---- drag to dismiss

  #onDown = (event) => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('button')) return;
    this.#drag = { id: event.pointerId, y0: event.clientY, lastY: event.clientY, lastT: event.timeStamp, velocity: 0, dy: 0 };
    this.#refs.grab.setPointerCapture(event.pointerId);
    this.#refs.grab.addEventListener('pointermove', this.#onMove);
    this.#refs.grab.addEventListener('pointerup', this.#onUp);
    this.#refs.grab.addEventListener('pointercancel', this.#onUp);
  };

  #onMove = (event) => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.id) return;
    const raw = event.clientY - drag.y0;
    // Upward drags meet resistance; downward drags follow the finger.
    drag.dy = raw < 0 ? -Math.sqrt(-raw) * 2 : raw;
    const dt = event.timeStamp - drag.lastT;
    if (dt > 0) drag.velocity = 0.7 * ((event.clientY - drag.lastY) / dt) + 0.3 * drag.velocity;
    drag.lastY = event.clientY;
    drag.lastT = event.timeStamp;
    const height = this.#dialog.offsetHeight;
    this.#dialog.style.transform = `translateY(${drag.dy}px)`;
    this.#dialog.style.setProperty('--drag-progress', String(Math.max(0, Math.min(1, drag.dy / height))));
  };

  #onUp = async (event) => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.id) return;
    this.#drag = null;
    const grab = this.#refs.grab;
    grab.removeEventListener('pointermove', this.#onMove);
    grab.removeEventListener('pointerup', this.#onUp);
    grab.removeEventListener('pointercancel', this.#onUp);

    const height = this.#dialog.offsetHeight;
    const dismiss = event.type === 'pointerup' && (drag.dy > height * DISMISS_RATIO || drag.velocity > DISMISS_VELOCITY);
    const to = dismiss ? height : 0;
    const duration = reducedMotion.matches ? 0 : 200;
    // --drag-progress is a registered property, so the backdrop fades along with the slide.
    const animation = this.#dialog.animate(
      [
        { transform: `translateY(${drag.dy}px)`, '--drag-progress': Math.max(0, Math.min(1, drag.dy / height)) },
        { transform: `translateY(${to}px)`, '--drag-progress': dismiss ? 1 : 0 },
      ],
      { duration, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'forwards' },
    );
    this.#dialog.style.removeProperty('--drag-progress');
    await Promise.race([animation.finished.catch(() => {}), new Promise((resolve) => setTimeout(resolve, duration + 100))]);
    if (dismiss) this.#dialog.close();
    this.#dialog.style.transform = '';
    animation.cancel();
  };
}
