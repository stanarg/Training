// Today: the plan's session for today (from this week's A or B plan). Lift days
// get a progress ring, the exercise list (tap to open the set logger, or log
// "same as last time" in one tap) and rest-timer buttons; run days a run form;
// rest days the step target. When a body scan is due, a reminder card opens the
// scan logger. Everything re-renders from the store.

import { View } from './view.js';
import { flash, fmt1, fmtInt, fmtKg, fromTemplate, h, haptic, numberField, pageHeader, parseNumber, svg } from '../dom.js';
import { formatDayMonth, formatLong } from '../dates.js';
import { isTimed, prescription, sessionFor, targetSets, totalTargetSets, weekFor } from '../plan.js';
import { ProgressRing } from '../components/progress-ring.js';
import { storageWarning } from '../components/set-logger.js';
import { daysAgo, scanDue } from '../components/scan-logger.js';

function shortSet(set, timed) {
  if (timed) return set.weightKg > 0 ? `${fmtKg(set.weightKg)} × ${set.reps} s` : `${set.reps} s`;
  return set.weightKg > 0 ? `${fmtKg(set.weightKg)} × ${set.reps}` : `${set.reps} reps`;
}

function checkIcon() {
  const el = svg('svg', { class: 'icon check-draw', viewBox: '0 0 24 24', 'aria-hidden': 'true' });
  el.append(svg('path', { d: 'M5 12.5l4.5 4.5L19 7.5' }));
  return el;
}

function pace(distanceKm, minutes) {
  if (!minutes || !distanceKm) return '';
  const secondsPerKm = Math.round((minutes * 60) / distanceKm);
  return `${Math.floor(secondsPerKm / 60)}:${String(secondsPerKm % 60).padStart(2, '0')} /km`;
}

export class TodayView extends View {
  #content = null;
  #flashId = null;

  constructor(ctx) {
    super(ctx);
    ctx.store.subscribe(() => this.invalidate());
  }

  render(root) {
    super.render(root);
    this.#content = h('div', { class: 'view-content' });
    root.append(this.#content);
  }

  update() {
    const { plan, today } = this.ctx;
    const session = sessionFor(plan, today.date);
    const eyebrow = [formatLong(today.iso), weekFor(plan, today.date)?.name].filter(Boolean).join(' · ');
    const parts = [pageHeader({ eyebrow, title: session?.title ?? 'Today', id: 'today-title' })];
    if (session?.type === 'lift') parts.push(this.#progressCard(session), this.#exerciseCard(session), this.#restCard());
    else if (session?.type === 'run') parts.push(this.#runCard(session));
    else if (session?.type === 'rest') parts.push(this.#restDayCard(session));
    parts.push(this.#scanCard());
    this.#content.replaceChildren(...parts.filter(Boolean));
    this.#flashId = null;
  }

  #sets(exercise) {
    const { store, today } = this.ctx;
    return store.setsFor({ date: today.iso, day: today.day, exerciseId: exercise.id });
  }

  // ---- lift day

  #progressCard(session) {
    const total = totalTargetSets(session);
    const done = session.exercises.reduce((n, e) => n + Math.min(this.#sets(e).length, targetSets(e)), 0);
    const card = h('section', { class: 'card progress', 'aria-labelledby': 'today-progress-title' });
    const ring = new ProgressRing();
    ring.render(card);
    ring.update({ done, total });
    const cap = this.ctx.plan.rules?.sessionCapMinutes;
    card.append(
      h(
        'div',
        { class: 'progress__text' },
        h('h2', { class: 'progress__title', id: 'today-progress-title', text: done >= total ? 'Session complete' : `${done} of ${total} sets done` }),
        h('p', { class: 'card-text', text: [`${session.exercises.length} exercises`, cap && `${cap} min cap`].filter(Boolean).join(' · ') }),
      ),
    );
    return card;
  }

  #exerciseCard(session) {
    return h(
      'section',
      { class: 'card card--list', 'aria-labelledby': 'today-exercises-title' },
      h(
        'div',
        { class: 'card-header' },
        h('h2', { class: 'card-title', id: 'today-exercises-title', text: 'Exercises' }),
        h('span', { class: 'card-note', text: 'Tap to log a set' }),
      ),
      h('ul', { class: 'rows' }, ...session.exercises.map((exercise) => this.#exerciseRow(exercise))),
    );
  }

  #exerciseRow(exercise) {
    const { store, today } = this.ctx;
    const { el, refs } = fromTemplate('tpl-exercise-row');
    const sets = this.#sets(exercise);
    const target = targetSets(exercise);
    const timed = isTimed(exercise);
    const complete = sets.length >= target;
    const previous = store.previousSets(exercise.id, today.iso);

    if (complete) el.dataset.complete = '';
    refs.name.textContent = exercise.name;
    refs.meta.textContent = `${prescription(exercise)} · ${sets.length} of ${target}`;
    if (sets.length) refs.last.textContent = `Today ${sets.map((s) => shortSet(s, timed)).join(', ')}`;
    else if (previous) refs.last.textContent = `Last ${formatDayMonth(previous.date)}: ${previous.sets.map((s) => shortSet(s, timed)).join(', ')}`;
    else refs.last.textContent = 'No history yet';

    if (complete) refs.status.append(checkIcon());
    else {
      const ring = new ProgressRing({ size: 'small', stroke: 14, label: false });
      ring.render(refs.status);
      ring.update({ done: sets.length, total: target });
    }

    refs.open.dataset.focusKey = `open-${exercise.id}`;
    refs.open.addEventListener('click', () => this.ctx.openLogger(exercise));

    const next = previous && !complete ? previous.sets[Math.min(sets.length, previous.sets.length - 1)] : null;
    if (next) {
      refs.same.hidden = false;
      refs.sameValue.textContent = shortSet(next, timed);
      refs.same.dataset.focusKey = `same-${exercise.id}`;
      refs.sameLabel.textContent = `Same as last time, ${exercise.name}: `;
      refs.same.addEventListener('click', () => this.#logSame(exercise, next));
    }
    if (this.#flashId === exercise.id) flash(el);
    return el;
  }

  async #logSame(exercise, set) {
    const { store, today, toast } = this.ctx;
    this.#flashId = exercise.id;
    try {
      await store.addSet({ date: today.iso, day: today.day, exerciseId: exercise.id, set: { ...set } });
    } catch (error) {
      if (error.errors?.length) return;
      toast.show(storageWarning);
    }
    haptic(10);
  }

  #restCard() {
    const { timer } = this.ctx;
    const button = (seconds) =>
      h(
        'button',
        { type: 'button', class: 'btn btn--secondary', 'data-focus-key': `rest-${seconds}`, onclick: () => timer.start(seconds) },
        `${seconds} s`,
        h('span', { class: 'sr-only', text: ' rest' }),
      );
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'today-rest-title' },
      h(
        'div',
        { class: 'card-header' },
        h('h2', { class: 'card-title', id: 'today-rest-title', text: 'Rest timer' }),
        h('span', { class: 'card-note', text: 'Runs in the background' }),
      ),
      h('div', { class: 'rest-buttons' }, button(90), button(180)),
    );
  }

  // ---- run day

  #runCard(session) {
    const { store, today, toast } = this.ctx;
    const logged = store.data.runs.find((r) => r.date === today.iso);
    const distance = numberField({ id: 'run-distance', label: 'Distance', unit: 'km', value: logged?.distanceKm ?? session.distanceKm ?? '' });
    const minutes = numberField({ id: 'run-minutes', label: 'Time', unit: 'min', value: logged?.minutes ?? '', placeholder: 'Optional' });
    const error = h('p', { class: 'field__error', role: 'alert' });

    const form = h(
      'form',
      {
        novalidate: true,
        onsubmit: async (event) => {
          event.preventDefault();
          const km = parseNumber(distance.input.value);
          const min = parseNumber(minutes.input.value);
          const badKm = !(km > 0 && km <= 200);
          const badMin = minutes.input.value.trim() !== '' && !(min >= 0 && min <= 1440);
          distance.input.setAttribute('aria-invalid', String(badKm));
          minutes.input.setAttribute('aria-invalid', String(badMin));
          error.textContent = badKm ? 'Enter the distance in km.' : badMin ? 'Enter the time in minutes.' : '';
          if (badKm || badMin) return;
          try {
            await store.saveRun({ date: today.iso, distanceKm: Math.round(km * 100) / 100, minutes: Number.isFinite(min) ? Math.round(min * 10) / 10 : undefined });
            toast.show('Run saved.');
            haptic(10);
          } catch {
            toast.show(storageWarning);
          }
        },
      },
      h('div', { class: 'fields' }, distance.field, minutes.field),
      error,
      h('button', { type: 'submit', class: 'btn btn--primary', 'data-focus-key': 'run-save', text: logged ? 'Update run' : 'Log run' }),
    );

    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'today-run-title' },
      h(
        'div',
        { class: 'card-header' },
        h('h2', { class: 'card-title', id: 'today-run-title', text: 'Run' }),
        h('span', { class: 'card-note num', text: session.distanceKm ? `Target ${session.distanceKm} km` : 'Distance is your call' }),
      ),
      logged
        ? h('p', { class: 'run-summary', text: ['Logged', `${fmt1(logged.distanceKm)} km`, logged.minutes && `${fmt1(logged.minutes)} min`, pace(logged.distanceKm, logged.minutes)].filter(Boolean).join(' · ') })
        : null,
      form,
    );
  }

  // ---- rest day

  #restDayCard(session) {
    const steps = this.ctx.plan.targets?.steps;
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'today-steps-title' },
      h('div', { class: 'card-header' }, h('h2', { class: 'card-title', id: 'today-steps-title', text: 'Step target' })),
      h('p', { class: 'steps' }, h('span', { class: 'steps__value', text: steps ? fmtInt(steps) : session.note ?? '' }), steps ? h('span', { class: 'stat__unit', text: 'steps' }) : null),
      h('p', { class: 'card-text', text: 'Rest day. Walk, stretch and sleep well.' }),
    );
  }

  // ---- body scan reminder (monthly)

  #scanCard() {
    const { store, today } = this.ctx;
    if (!scanDue(store, today.iso)) return null;
    const last = store.latestScan(today.iso);
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'today-scan-title' },
      h(
        'div',
        { class: 'card-header' },
        h('h2', { class: 'card-title', id: 'today-scan-title', text: 'Body scan due' }),
        last ? h('span', { class: 'card-note', text: `Last ${formatDayMonth(last.date)}` }) : null,
      ),
      h('p', {
        class: 'card-text',
        text: last
          ? `Your last scan was ${daysAgo(last.date, today.iso)}. Step on the analyser next time you’re in.`
          : 'Log a reading from the gym’s analyser to start tracking weight, body fat and muscle.',
      }),
      h('button', { type: 'button', class: 'btn btn--tinted btn--block', 'data-focus-key': 'scan-open', onclick: () => this.ctx.openScan() }, 'Log scan'),
    );
  }
}
