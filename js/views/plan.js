// Plan: this week or next week (they alternate between the plan's A and B
// weeks), read-only. A scroll-snapping week strip (today highlighted) jumps to
// each day's card; nutrition targets and the training rules follow.

import { View } from './view.js';
import { fmtInt, h, icon, pageHeader, reducedMotion } from '../dom.js';
import { addDays, formatDayMonth, formatLong, toISO, weekDates } from '../dates.js';
import { DAYS, prescription, sessionFor, typeLabel, weekFor } from '../plan.js';

const DAY_NAMES = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

export class PlanView extends View {
  #content = null;
  #strip = null;
  #selected = null;
  #offset = 0; // weeks from this one: 0 or 1

  render(root) {
    super.render(root);
    this.#content = h('div', { class: 'view-content' });
    root.append(this.#content);
  }

  show() {
    super.show();
    this.#revealToday();
  }

  /** Bring today's chip into view inside the strip without moving the page. */
  #revealToday() {
    const chip = this.#strip?.querySelector('[aria-current="date"]');
    if (chip) this.#strip.scrollLeft = chip.offsetLeft - this.#strip.offsetLeft - 16;
  }

  update() {
    const { plan, today } = this.ctx;
    const dates = weekDates(addDays(today.date, 7 * this.#offset));
    const week = weekFor(plan, dates[0]);
    this.#strip = this.#weekStrip(dates);
    this.#content.replaceChildren(
      pageHeader({ eyebrow: [week?.name, `Week of ${formatDayMonth(toISO(dates[0]))}`].filter(Boolean).join(' · '), title: 'Plan', id: 'plan-title' }),
      this.#weekSwitch(),
      h('nav', { 'aria-label': this.#offset ? 'Days next week' : 'Days this week' }, this.#strip),
      ...dates.map((date, i) => this.#dayCard(DAYS[i], date)),
      this.#nutritionCard(plan.targets ?? {}),
      this.#rulesCard(plan.rules ?? {}),
    );
    if (this.active) this.#revealToday();
  }

  #weekSwitch() {
    const option = (offset, label) => {
      const input = h('input', { type: 'radio', name: 'plan-week', value: String(offset), 'data-focus-key': `plan-week-${offset}` });
      input.checked = offset === this.#offset;
      return h('label', { class: 'segmented__option' }, input, h('span', { text: label }));
    };
    const control = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Week to show' }, option(0, 'This week'), option(1, 'Next week'));
    control.addEventListener('change', (event) => {
      this.#offset = Number(event.target.value);
      this.invalidate();
    });
    return control;
  }

  #weekStrip(dates) {
    const { plan, today } = this.ctx;
    const strip = h('div', { class: 'week-strip', 'data-no-swipe': '' });
    dates.forEach((date, i) => {
      const day = DAYS[i];
      const iso = toISO(date);
      const session = sessionFor(plan, date);
      const button = h(
        'button',
        {
          type: 'button',
          class: 'week-day',
          'aria-current': iso === today.iso ? 'date' : null,
          'aria-label': `${formatLong(iso)}: ${session?.title ?? 'Nothing planned'}`,
          'data-selected': this.#selected === day ? '' : null,
          'data-focus-key': `day-${day}`,
          onclick: () => this.#jumpTo(day),
        },
        h('span', { class: 'week-day__name', text: day }),
        h('span', { class: 'week-day__date', text: String(date.getDate()) }),
        h('span', { class: 'week-day__type', text: typeLabel(session) }),
      );
      strip.append(button);
    });
    return strip;
  }

  #jumpTo(day) {
    this.#selected = day;
    for (const chip of this.#strip.querySelectorAll('.week-day')) {
      chip.toggleAttribute('data-selected', chip.dataset.focusKey === `day-${day}`);
    }
    this.root.querySelector(`#plan-day-${day}`)?.scrollIntoView({
      block: 'start',
      behavior: reducedMotion.matches ? 'auto' : 'smooth',
    });
  }

  #dayCard(day, date) {
    const { plan, today } = this.ctx;
    const iso = toISO(date);
    const session = sessionFor(plan, date);
    const isToday = iso === today.iso;
    const titleId = `plan-day-${day}-title`;
    const card = h(
      'section',
      { class: 'card day-card', id: `plan-day-${day}`, 'aria-labelledby': titleId, 'data-today': isToday ? '' : null },
      h(
        'div',
        { class: 'day-card__head' },
        h('p', { class: 'day-card__day', text: `${DAY_NAMES[day]} · ${formatDayMonth(iso)}` }),
        isToday ? h('span', { class: 'badge', text: 'Today' }) : null,
      ),
      h('h2', { class: 'day-card__title', id: titleId, text: session?.title ?? 'Nothing planned' }),
    );

    if (session?.type === 'lift') {
      card.append(
        h(
          'ul',
          { class: 'rows' },
          ...session.exercises.map((exercise) =>
            h(
              'li',
              { class: 'row' },
              h('span', { class: 'row__text' }, h('span', { class: 'row__title', text: exercise.name })),
              h('span', { class: 'row__meta num', text: exercise.kind === 'main' ? 'Top set' : prescription(exercise) }),
            ),
          ),
        ),
      );
    } else if (session?.type === 'run') {
      card.append(
        h(
          'ul',
          { class: 'rows' },
          h(
            'li',
            { class: 'row' },
            icon('run'),
            h('span', { class: 'row__text' }, h('span', { class: 'row__title', text: session.note ?? 'Easy pace' })),
            session.distanceKm ? h('span', { class: 'row__value', text: `${session.distanceKm} km` }) : null,
          ),
        ),
      );
    } else if (session?.type === 'rest') {
      card.append(
        h(
          'ul',
          { class: 'rows' },
          h(
            'li',
            { class: 'row' },
            icon('rest'),
            h('span', { class: 'row__text' }, h('span', { class: 'row__title', text: 'Recovery' })),
            h('span', { class: 'row__value', text: session.note ?? `${fmtInt(plan.targets?.steps ?? 0)} steps` }),
          ),
        ),
      );
    }
    return card;
  }

  #nutritionCard(targets) {
    const stat = (label, value, unit) =>
      h(
        'div',
        { class: 'stat' },
        h('p', { class: 'stat__label', text: label }),
        h('p', {}, h('span', { class: 'stat__value', text: fmtInt(value) }), h('span', { class: 'stat__unit', text: unit })),
      );
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'plan-nutrition-title' },
      h(
        'div',
        { class: 'card-header' },
        h('h2', { class: 'card-title', id: 'plan-nutrition-title', text: 'Nutrition' }),
        h('span', { class: 'card-note', text: 'Daily targets' }),
      ),
      h('p', { class: 'kcal' }, h('span', { class: 'kcal__value', text: fmtInt(targets.kcal ?? 0) }), h('span', { class: 'stat__unit', text: 'kcal' })),
      h(
        'div',
        { class: 'stats' },
        stat('Protein', targets.protein ?? 0, 'g'),
        stat('Carbs', targets.carbs ?? 0, 'g'),
        stat('Fat', targets.fat ?? 0, 'g'),
        stat('Steps', targets.steps ?? 0, ''),
      ),
    );
  }

  #rulesCard(rules) {
    const item = (term, text) => (text ? [h('div', {}, h('dt', { text: term }), h('dd', { text }))] : []);
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'plan-rules-title' },
      h('div', { class: 'card-header' }, h('h2', { class: 'card-title', id: 'plan-rules-title', text: 'How to train' })),
      h(
        'dl',
        { class: 'rules' },
        ...item('Main lifts', rules.main),
        ...item('Accessories', rules.accessory),
        ...item('Machines', rules.machines),
        ...item('Session length', rules.sessionCapMinutes ? `Keep each lifting session under ${rules.sessionCapMinutes} minutes.` : ''),
      ),
    );
  }
}

