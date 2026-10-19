// Toasts: short status messages with an optional action. When a sheet is open
// the toast goes into the sheet's own region, since the page behind is inert.

import { fromTemplate } from '../dom.js';

export class Toaster {
  #root = null;

  render(root) {
    this.#root = root;
    return root;
  }

  #region() {
    return document.querySelector('dialog[open] [data-toast-region]') ?? this.#root;
  }

  /**
   * @param {string} message
   * @param {{ action?: string, onAction?: () => void, duration?: number, id?: string }} options
   *   duration: ms before it hides itself; Infinity keeps it until acted on.
   */
  show(message, { action, onAction, duration = 3500, id } = {}) {
    if (id) document.querySelector(`.toast[data-toast-id="${id}"]`)?.remove();
    const { el, refs } = fromTemplate('tpl-toast');
    if (id) el.dataset.toastId = id;
    refs.message.textContent = message;
    let timer = 0;
    const dismiss = () => {
      clearTimeout(timer);
      el.remove();
    };
    if (action) {
      refs.action.hidden = false;
      refs.action.textContent = action;
      refs.action.addEventListener('click', () => {
        dismiss();
        onAction?.();
      });
    }
    this.#region().append(el);
    if (Number.isFinite(duration)) timer = setTimeout(dismiss, duration);
    return { dismiss };
  }
}
