// Plan: the week read-only. A scroll-snapping week strip (today highlighted)
// jumps to each day's card; nutrition targets and the coach's rules follow.

import { View } from './view.js';
import { fmtInt, h, icon, pageHeader, reducedMotion } from '../dom.js';
import { formatDayMonth, formatLong, toISO, weekDates } from '../dates.js';
import { DAYS, prescription, sessionFor, typeLabel } from '../plan.js';

const DAY_NAMES = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

export class PlanView extends View {
  #content = null;
  #strip = null;
  #selected = null;

  render(root) {
    super.render(root);
    this.#content = h('div', { class: 'view-content' });
    root.append(this.#content);
  }

  show() {
    super.show();
    // Bring today's chip into view inside the strip without moving the page.
    const chip = this.#strip?.querySelector('[aria-current="date"]');
    if (chip) this.#strip.scrollLeft = chip.offsetLeft - this.#strip.offsetLeft - 16;
  }

  update() {
    const { plan, today } = this.ctx;
    const dates = weekDates(today.date);
    this.#strip = this.#weekStrip(dates);
    this.#content.replaceChildren(
      pageHeader({ eyebrow: `Week of ${formatDayMonth(toISO(dates[0]))}`, title: 'Plan', id: 'plan-title' }),
      h('nav', { 'aria-label': 'Days this week' }, this.#strip),
      ...dates.map((date, i) => this.#dayCard(DAYS[i], toISO(date))),
      this.#nutritionCard(plan.targets ?? {}),
      this.#rulesCard(plan.rules ?? {}),
    );
  }

  #weekStrip(dates) {
    const { plan, today } = this.ctx;
    const strip = h('div', { class: 'week-strip', 'data-no-swipe': '' });
    dates.forEach((date, i) => {
      const day = DAYS[i];
      const iso = toISO(date);
      const session = sessionFor(plan, day);
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

  #dayCard(day, iso) {
    const { plan, today } = this.ctx;
    const session = sessionFor(plan, day);
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
            h('span', { class: 'row__text' }, h('span', { class: 'row__title', text: 'Easy pace' })),
            h('span', { class: 'row__value', text: `${session.distanceKm} km` }),
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
        ...item('Session length', rules.sessionCapMinutes ? `Keep each lifting session under ${rules.sessionCapMinutes} minutes.` : ''),
      ),
    );
  }
}

