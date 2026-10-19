// Base class for routed views. A view renders from state in update(); while
// hidden it only marks itself stale and catches up when shown again.

export class View {
  /** @param {object} ctx shared app context: store, plan, timer, sheet, toast, today */
  constructor(ctx) {
    this.ctx = ctx;
    this.root = null;
    this.active = false;
    this.stale = true;
  }

  render(root) {
    this.root = root;
  }

  /** Called by the router before the view becomes visible (also during a swipe). */
  prepare() {
    if (this.stale) this.#update();
  }

  show() {
    this.active = true;
    this.prepare();
  }

  hide() {
    this.active = false;
  }

  invalidate() {
    this.stale = true;
    if (this.active || this.root?.hidden === false) this.#update();
  }

  /** Re-render, then put focus back on the element that had it (matched by data-focus-key). */
  #update() {
    this.stale = false;
    const focusKey = this.root?.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;
    this.update();
    if (focusKey) this.root.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  }

  update() {}
}
