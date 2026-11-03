// Hash router with view caching. Each view is created once, rendered into its
// own <section>, and kept in the DOM (hidden) so it keeps state and scroll.

import { withTransition } from './dom.js';

export class Router extends EventTarget {
  #outlet;
  #routes;
  #fallback;
  #cache = new Map();
  #current = null;

  /**
   * @param {{ outlet: HTMLElement, routes: Record<string, { title: string, create: () => object }>, fallback: string }} options
   */
  constructor({ outlet, routes, fallback }) {
    super();
    this.#outlet = outlet;
    this.#routes = routes;
    this.#fallback = fallback;
  }

  get order() {
    return Object.keys(this.#routes);
  }

  get current() {
    return this.#current;
  }

  title(name) {
    return this.#routes[name]?.title ?? '';
  }

  start() {
    addEventListener('hashchange', () => this.go(this.#fromHash()));
    this.go(this.#fromHash(), { transition: false });
  }

  /** Create and render a view if needed; returns its section element. */
  prepare(name) {
    let entry = this.#cache.get(name);
    if (!entry) {
      const view = this.#routes[name].create();
      const el = document.createElement('section');
      el.className = 'view';
      el.dataset.view = name;
      el.hidden = true;
      el.setAttribute('aria-labelledby', `${name}-title`);
      this.#outlet.append(el);
      view.render(el);
      entry = { view, el };
      this.#cache.set(name, entry);
    }
    entry.view.prepare?.();
    return entry.el;
  }

  element(name) {
    return this.#cache.get(name)?.el ?? null;
  }

  /** Mark every cached view as stale (e.g. when the date or plan changes). */
  invalidateAll() {
    for (const { view } of this.#cache.values()) view.invalidate?.();
  }

  async go(name, { transition = true } = {}) {
    if (!this.#routes[name]) name = this.#fallback;
    const hash = `#/${name}`;
    if (location.hash !== hash) history.replaceState(history.state, '', hash);
    if (name === this.#current) return;

    const from = this.#current;
    const nextEl = this.prepare(name);
    const direction = from && this.order.indexOf(name) < this.order.indexOf(from) ? 'back' : 'forward';
    const swap = () => {
      if (from) {
        const old = this.#cache.get(from);
        old.el.hidden = true;
        old.view.hide?.();
      }
      nextEl.hidden = false;
      this.#cache.get(name).view.show?.();
      this.#current = name;
      this.dispatchEvent(new CustomEvent('change', { detail: { name, from } }));
    };

    if (!from || !transition) swap();
    else await withTransition(`tab-${direction}`, swap, nextEl);
  }

  #fromHash() {
    return location.hash.replace(/^#\/?/, '').split(/[?/]/)[0] || this.#fallback;
  }
}
