// Small DOM helpers shared by views and components.

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** Clone a <template> and collect its [data-ref] elements. */
export function fromTemplate(id) {
  const template = document.getElementById(id);
  if (!(template instanceof HTMLTemplateElement)) throw new Error(`Missing template #${id}`);
  const fragment = template.content.cloneNode(true);
  const refs = {};
  for (const el of fragment.querySelectorAll('[data-ref]')) refs[el.dataset.ref] = el;
  return { el: fragment.firstElementChild, refs };
}

/** Create an element: h('p', { class: 'x', text: 'hi' }, child...). */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

/** Inline icon from the sprite in index.html. */
export function icon(name, className = 'icon') {
  const el = svg('svg', { class: className, 'aria-hidden': 'true', focusable: 'false' });
  el.append(svg('use', { href: `#i-${name}` }));
  return el;
}

export function pageHeader({ eyebrow, title, id }) {
  return h(
    'header',
    { class: 'page-header' },
    h('p', { class: 'page-eyebrow', text: eyebrow }),
    h('h1', { class: 'page-title', id, tabindex: '-1', text: title }),
  );
}

export function canViewTransition() {
  return typeof document.startViewTransition === 'function' && !reducedMotion.matches && document.visibilityState === 'visible';
}

/**
 * Run a DOM update inside a view transition of the given type, or with a
 * 150 ms fade on `fadeEl` when view transitions are not available.
 */
export async function withTransition(type, update, fadeEl) {
  if (reducedMotion.matches) return update();
  if (canViewTransition()) {
    const root = document.documentElement;
    root.dataset.vt = type;
    const transition = document.startViewTransition(update);
    // If the animation is skipped or aborted (page hidden, another transition
    // started) the DOM update still runs; only a failing update is an error.
    transition.ready.catch(() => {});
    try {
      await transition.updateCallbackDone;
      await transition.finished.catch(() => {});
    } finally {
      if (root.dataset.vt === type) delete root.dataset.vt;
    }
    return;
  }
  await update();
  fadeEl?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
}

/** navigator.vibrate where available (not iOS), and only after a real tap, as browsers require. */
export function haptic(pattern = 10) {
  if (typeof navigator.vibrate !== 'function') return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Blocked by the browser: skip silently.
  }
}

const flashTimers = new WeakMap();

/** Replay a one-shot CSS animation class on an element. */
export function flash(el, className = 'is-done-flash', ms = 900) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  clearTimeout(flashTimers.get(el));
  flashTimers.set(el, setTimeout(() => el.classList.remove(className), ms));
}

// ---- numbers

const kgFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
const oneDecimal = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

export const fmtKg = (v) => kgFormat.format(v);
export const fmt1 = (v) => oneDecimal.format(v);
export const fmtInt = (v) => integer.format(v);

/** Parse user number input, accepting a decimal comma. NaN when empty. */
export function parseNumber(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  return text === '' ? Number.NaN : Number(text);
}

export function formatSet(set, { timed = false } = {}) {
  const reps = timed ? `${set.reps} s` : `${set.reps}`;
  return set.weightKg > 0 ? `${fmtKg(set.weightKg)} kg × ${reps}` : timed ? reps : `${reps} reps`;
}

// ---- document title (the rest timer prefixes the countdown)

const title = { base: document.title, prefix: '' };
export function setTitle({ base, prefix } = {}) {
  if (base !== undefined) title.base = base;
  if (prefix !== undefined) title.prefix = prefix;
  document.title = title.prefix ? `${title.prefix} · ${title.base}` : title.base;
}
