// Set logger: bottom-sheet content for one exercise. Steppers are pre-filled
// with the last logged values; the list of today's sets re-renders from the
// store, so the sheet never patches its own state by hand.

import { flash, formatSet, fromTemplate, haptic } from '../dom.js';
import { isTimed, prescription, ruleFor, targetSets } from '../plan.js';
import { formatClock } from '../timer.js';
import { Stepper } from './stepper.js';

const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
export const storageWarning = 'This device did not save that. Export a backup soon.';

function defaultsFor(exercise) {
  if (isTimed(exercise)) return { weightKg: 0, reps: Number.parseInt(exercise.repRange, 10) || 30 };
  if (exercise.kind === 'main') return { weightKg: 20, reps: 5 };
  return { weightKg: 10, reps: Number.parseInt(exercise.repRange, 10) || 10 };
}

export class SetLogger {
  #ctx;
  #state = null;

  /** @param {{ store, sheet, timer, toast, plan }} ctx */
  constructor(ctx) {
    this.#ctx = ctx;
  }

  /** @param {{ exercise: object, date: string, day: string }} target */
  open({ exercise, date, day }) {
    const { store, sheet, timer } = this.#ctx;
    const timed = isTimed(exercise);
    const last = store.lastSet(exercise.id) ?? defaultsFor(exercise);
    const { el, refs } = fromTemplate('tpl-set-logger');

    const weight = new Stepper({ label: timed ? 'Added weight' : 'Weight', unit: 'kg', value: last.weightKg, step: 2.5, min: 0, max: 500, name: 'weight' });
    const reps = new Stepper({ label: timed ? 'Seconds' : 'Reps', unit: timed ? 's' : '', value: last.reps, step: timed ? 5 : 1, min: 0, max: timed ? 600 : 100, name: 'reps' });
    weight.render(refs.steppers);
    reps.render(refs.steppers);
    this.#renderRpe(refs.rpe, last.rpe);
    refs.rule.textContent = ruleFor(this.#ctx.plan, exercise) ?? '';
    refs.rule.hidden = !refs.rule.textContent;

    const state = { exercise, date, day, timed, refs, weight, reps, unsubscribe: [] };
    this.#state = state;

    refs.log.addEventListener('click', () => this.#log());
    for (const button of [refs.rest90, refs.rest180]) {
      button.addEventListener('click', () => timer.start(Number(button.dataset.seconds)));
    }
    refs.sets.addEventListener('click', (event) => {
      const button = event.target.closest('[data-remove-index]');
      if (button) this.#remove(Number(button.dataset.removeIndex));
    });

    const onTimer = (event) => this.#renderRest(event.detail);
    timer.addEventListener('change', onTimer);
    state.unsubscribe.push(store.subscribe(() => this.#renderSets()), () => timer.removeEventListener('change', onTimer));

    this.#renderSets();
    this.#renderRest({ state: timer.state, remaining: timer.remaining });
    sheet.open({
      title: exercise.name,
      subtitle: this.#subtitle(),
      content: el,
      size: 'large',
      onClose: () => {
        for (const off of state.unsubscribe) off();
        if (this.#state === state) this.#state = null;
      },
    });
  }

  #sets() {
    const { date, day, exercise } = this.#state;
    return this.#ctx.store.setsFor({ date, day, exerciseId: exercise.id });
  }

  #subtitle() {
    const { exercise } = this.#state;
    const done = this.#sets().length;
    return `${prescription(exercise)} · ${done} of ${targetSets(exercise)} done`;
  }

  #renderRpe(root, current) {
    const name = 'rpe';
    const options = [{ value: '', label: 'None' }, ...RPE_VALUES.map((v) => ({ value: String(v), label: String(v) }))];
    for (const option of options) {
      const label = document.createElement('label');
      label.className = 'chip';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = name;
      input.value = option.value;
      input.checked = option.value === (current === undefined ? '' : String(current));
      const text = document.createElement('span');
      text.textContent = option.label;
      label.append(input, text);
      root.append(label);
    }
  }

  #renderSets() {
    const state = this.#state;
    if (!state) return;
    const sets = this.#sets();
    const { refs, timed } = state;
    refs.sets.replaceChildren(
      ...sets.map((set, index) => {
        const { el, refs: row } = fromTemplate('tpl-set-row');
        row.n.textContent = String(index + 1);
        row.value.textContent = formatSet(set, { timed });
        row.rpe.textContent = set.rpe ? `RPE ${set.rpe}` : '';
        row.remove.dataset.removeIndex = String(index);
        row.remove.setAttribute('aria-label', `Remove set ${index + 1}`);
        return el;
      }),
    );
    refs.setsSection.hidden = sets.length === 0;
    refs.logLabel.textContent = `Log set ${sets.length + 1}`;
    this.#ctx.sheet.setHeader({ subtitle: this.#subtitle() });
  }

  #renderRest({ state, remaining }) {
    const refs = this.#state?.refs;
    if (!refs) return;
    refs.restLabel.textContent = state === 'running' ? `Resting · ${formatClock(remaining)} left` : state === 'done' ? 'Rest over' : 'Start rest';
  }

  async #log() {
    const state = this.#state;
    const { store, toast } = this.#ctx;
    const reps = Math.round(state.reps.value);
    if (reps < 1) {
      toast.show(state.timed ? 'Add the seconds held first.' : 'Add at least 1 rep.');
      return;
    }
    const checked = state.refs.rpe.querySelector('input:checked');
    const rpe = checked?.value ? Number(checked.value) : undefined;
    const set = { weightKg: state.weight.value, reps, ...(rpe !== undefined && { rpe }) };
    try {
      await store.addSet({ date: state.date, day: state.day, exerciseId: state.exercise.id, set });
    } catch (error) {
      // Invalid input is refused; a storage failure still keeps the set in memory.
      if (error.errors?.length) return toast.show('Check the weight and reps.');
      toast.show(storageWarning);
    }
    haptic(10);
    flash(state.refs.log);
  }

  async #remove(index) {
    const state = this.#state;
    const { store, toast } = this.#ctx;
    const where = { date: state.date, day: state.day, exerciseId: state.exercise.id };
    let removed = null;
    try {
      removed = await store.removeSet({ ...where, index });
    } catch {
      return toast.show(storageWarning);
    }
    if (!removed) return;
    toast.show(`Set ${index + 1} removed`, {
      action: 'Undo',
      onAction: () => store.addSet({ ...where, set: removed, index }),
    });
  }
}
