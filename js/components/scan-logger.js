// Body scan logger: bottom-sheet form for one reading from the gym's body
// composition analyser. One scan per date; saving a date again replaces it.
// Also the shared definitions of each reading, so Today and Log show them alike.

import { isISODate } from '../store.js';
import { daysBetween } from '../dates.js';
import { fmt1, fmtInt, h, haptic, numberField, parseNumber } from '../dom.js';
import { storageWarning } from './set-logger.js';

/** Days after the last scan before Today asks for a new one. */
export const SCAN_INTERVAL_DAYS = 28;

/** Readings in form order. min/max bound what the form accepts. */
export const SCAN_METRICS = [
  { key: 'weightKg', label: 'Weight', unit: 'kg', min: 20, max: 400, decimals: 1, required: true },
  { key: 'bodyFatPct', label: 'Body fat', unit: '%', min: 2, max: 75, decimals: 1, required: true },
  { key: 'muscleKg', label: 'Muscle mass', unit: 'kg', min: 5, max: 250, decimals: 1 },
  { key: 'visceralFat', label: 'Visceral fat', unit: '', min: 1, max: 60, decimals: 1 },
  { key: 'bmrKcal', label: 'BMR', unit: 'kcal', min: 500, max: 5000, decimals: 0 },
];

export const formatValue = (metric, value) => (metric.decimals ? fmt1(value) : fmtInt(value));

/** "82.4 kg", "18.2%", "8" (visceral fat is a level, with no unit). */
export function formatMetric(metric, value) {
  const text = formatValue(metric, value);
  if (!metric.unit) return text;
  return metric.unit === '%' ? `${text}%` : `${text} ${metric.unit}`;
}

/** "+0.8 kg", "−1.2%" or "No change" for the difference between two readings. */
export function formatChange(metric, change) {
  const rounded = metric.decimals ? Math.round(change * 10) / 10 : Math.round(change);
  if (rounded === 0) return 'No change';
  return `${rounded > 0 ? '+' : '−'}${formatMetric(metric, Math.abs(rounded))}`;
}

/** "today", "yesterday" or "12 days ago". */
export function daysAgo(iso, todayIso) {
  const days = daysBetween(iso, todayIso);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

export function scanDue(store, todayIso) {
  const last = store.latestScan(todayIso);
  return !last || daysBetween(last.date, todayIso) >= SCAN_INTERVAL_DAYS;
}

export class ScanLogger {
  #ctx;

  /** @param {{ store, sheet, toast, today }} ctx */
  constructor(ctx) {
    this.#ctx = ctx;
  }

  /** @param {{ date?: string }} [options] the scan to show; defaults to today */
  open({ date } = {}) {
    const { sheet, today } = this.#ctx;
    const dateInput = h('input', { class: 'input', id: 'scan-date', name: 'scan-date', type: 'date', max: today.iso, required: true });
    dateInput.value = date ?? today.iso;
    const fields = SCAN_METRICS.map((metric) => ({
      metric,
      ...numberField({ id: `scan-${metric.key}`, label: metric.label, unit: metric.unit, placeholder: metric.required ? '' : 'Optional' }),
    }));
    const error = h('p', { class: 'field__error', role: 'alert' });
    const save = h('button', { type: 'submit', class: 'btn btn--primary' });
    const remove = h('button', { type: 'button', class: 'btn btn--secondary', text: 'Delete this scan', onclick: () => this.#remove(dateInput.value) });

    let shown = null; // the stored scan the fields hold, if any
    const fill = () => {
      const existing = this.#ctx.store.scanOn(dateInput.value);
      // Load the stored scan for this date; keep typed numbers unless they came from another stored scan.
      for (const { metric, input } of fields) {
        if (existing || shown) input.value = existing?.[metric.key] ?? '';
        input.removeAttribute('aria-invalid');
      }
      shown = existing;
      error.textContent = '';
      save.textContent = existing ? 'Update scan' : 'Save scan';
      remove.hidden = !existing;
    };
    dateInput.addEventListener('change', fill);
    fill();

    const form = h(
      'form',
      { class: 'logger', novalidate: true, onsubmit: (event) => this.#save(event, { dateInput, fields, error }) },
      h(
        'div',
        { class: 'fields' },
        h('div', { class: 'field field--wide' }, h('label', { class: 'field__label', for: 'scan-date', text: 'Date' }), dateInput),
        ...fields.map((f) => f.field),
      ),
      error,
      save,
      remove,
    );
    sheet.open({ title: 'Body scan', subtitle: 'Copy the numbers from the analyser printout', content: form });
  }

  async #save(event, { dateInput, fields, error }) {
    event.preventDefault();
    const { store, sheet, toast, today } = this.#ctx;
    const date = dateInput.value;
    const problems = [];
    const badDate = !isISODate(date) || date > today.iso;
    dateInput.setAttribute('aria-invalid', String(badDate));
    if (badDate) problems.push('Pick the date of the scan.');

    const scan = { date };
    for (const { metric, input } of fields) {
      const text = input.value.trim();
      const value = parseNumber(text);
      const bad = text === '' ? Boolean(metric.required) : !(value >= metric.min && value <= metric.max);
      input.setAttribute('aria-invalid', String(bad));
      if (bad) {
        const unit = metric.unit === '%' ? '%' : metric.unit ? ` ${metric.unit}` : '';
        problems.push(text === '' ? `Enter your ${metric.label.toLowerCase()}.` : `${metric.label} should be between ${metric.min} and ${metric.max}${unit}.`);
      } else if (text !== '') {
        scan[metric.key] = metric.decimals ? Math.round(value * 10) / 10 : Math.round(value);
      }
    }
    error.textContent = problems[0] ?? '';
    if (problems.length) return;

    let message = 'Body scan saved.';
    try {
      await store.saveScan(scan);
    } catch (failure) {
      if (failure.errors?.length) {
        error.textContent = 'Check the numbers.';
        return;
      }
      message = storageWarning;
    }
    haptic(10);
    await sheet.close();
    toast.show(message);
  }

  async #remove(date) {
    const { store, sheet, toast } = this.#ctx;
    const scan = store.scanOn(date);
    if (!scan) return;
    let failed = false;
    try {
      await store.removeScan(date);
    } catch {
      failed = true;
    }
    await sheet.close();
    if (failed) toast.show(storageWarning);
    toast.show('Body scan deleted', { action: 'Undo', onAction: () => store.saveScan(scan).catch(() => toast.show(storageWarning)) });
  }
}
