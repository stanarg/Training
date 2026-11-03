// Plan tests: A/B week rotation, and naming logged sessions after the plan
// moves sessions between days. Run with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DAYS, exerciseIndex, loggedTitle, sessionFor, weekIndex } from '../js/plan.js';
import { fromISO } from '../js/dates.js';

const plan = {
  weekStart: '2026-11-02',
  weeks: [
    {
      name: 'Week A',
      sessions: [
        { day: 'Mon', title: 'Lower A', type: 'lift', exercises: [{ id: 'squat' }, { id: 'hacksquat' }, { id: 'calf' }] },
        { day: 'Tue', title: 'Upper A', type: 'lift', exercises: [{ id: 'bench' }, { id: 'tbarrow' }, { id: 'curl' }] },
        { day: 'Thu', title: 'Pull A', type: 'lift', exercises: [{ id: 'pullup' }, { id: 'highrow' }, { id: 'curl' }] },
        { day: 'Sat', title: 'Run', type: 'run' },
      ],
    },
    {
      name: 'Week B',
      sessions: [
        { day: 'Mon', title: 'Lower B', type: 'lift', exercises: [{ id: 'trapbar' }, { id: 'pendulum' }, { id: 'calf' }] },
        { day: 'Tue', title: 'Upper B', type: 'lift', exercises: [{ id: 'ohp' }, { id: 'cablerow' }] },
        { day: 'Sat', title: 'Run', type: 'run' },
      ],
    },
  ],
};
const logged = (date, day, ...ids) => ({ date, day, exercises: ids.map((exerciseId) => ({ exerciseId, sets: [] })) });

test('weeks alternate from weekStart, before and after it', () => {
  assert.equal(weekIndex(plan, fromISO('2026-11-02')), 0);
  assert.equal(weekIndex(plan, fromISO('2026-11-08')), 0, 'Sunday is still the same week');
  assert.equal(weekIndex(plan, fromISO('2026-11-09')), 1);
  assert.equal(weekIndex(plan, fromISO('2026-11-16')), 0);
  assert.equal(weekIndex(plan, fromISO('2026-10-26')), 1, 'the week before weekStart');
  assert.equal(weekIndex(plan, fromISO('2027-03-29')), 1, 'across the clock change');
  assert.equal(weekIndex({ weeks: plan.weeks }, fromISO('2026-11-09')), 0, 'no weekStart means week A');
});

test('sessionFor picks the day from the right week', () => {
  assert.equal(sessionFor(plan, fromISO('2026-11-02')).title, 'Lower A');
  assert.equal(sessionFor(plan, fromISO('2026-11-09')).title, 'Lower B');
  assert.equal(sessionFor(plan, fromISO('2026-11-04')), null);
});

test('a session logged on a day that moved keeps the title of its exercises', () => {
  assert.equal(loggedTitle(plan, logged('2026-11-07', 'Sat', 'pullup', 'highrow')), 'Pull A');
  assert.equal(loggedTitle(plan, logged('2026-11-03', 'Tue', 'ohp', 'cablerow')), 'Upper B');
});

test('ties go to the session planned for that date', () => {
  assert.equal(loggedTitle(plan, logged('2026-11-02', 'Mon', 'calf')), 'Lower A');
  assert.equal(loggedTitle(plan, logged('2026-11-09', 'Mon', 'calf')), 'Lower B');
  assert.equal(loggedTitle(plan, logged('2026-11-05', 'Thu', 'curl')), 'Pull A');
});

test('falls back to the planned session, then the day name, when no exercise matches', () => {
  assert.equal(loggedTitle(plan, logged('2026-11-10', 'Tue', 'deadlift')), 'Upper B');
  assert.equal(loggedTitle(plan, logged('2026-11-06', 'Fri', 'deadlift')), 'Fri');
});

const real = JSON.parse(readFileSync(new URL('../data/plan.json', import.meta.url), 'utf8'));

test('data/plan.json: every week has each day once, and weekStart is a Monday', () => {
  assert.equal(fromISO(real.weekStart).getDay(), 1);
  assert.ok(real.weeks.length >= 2);
  for (const week of real.weeks) assert.deepEqual(week.sessions.map((s) => s.day), DAYS, week.name);
  assert.equal(real.weeks.flatMap((w) => w.sessions).filter((s) => s.type === 'run').length, real.weeks.length, 'one run a week');
});

test('data/plan.json: each exercise id has one name, and no session repeats an id', () => {
  const names = new Map();
  for (const session of real.weeks.flatMap((w) => w.sessions)) {
    const ids = (session.exercises ?? []).map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, `${session.title} repeats an exercise`);
    for (const exercise of session.exercises ?? []) {
      const name = names.get(exercise.id) ?? exercise.name;
      assert.equal(exercise.name, name, `${exercise.id} is named both ${name} and ${exercise.name}`);
      names.set(exercise.id, name);
    }
  }
  assert.equal(exerciseIndex(real).size, names.size);
});

test('data/plan.json: every lift session is named by its own exercises on any day of either week', () => {
  const dates = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-13'];
  for (const session of real.weeks.flatMap((w) => w.sessions).filter((s) => s.type === 'lift')) {
    const ids = session.exercises.map((e) => e.id);
    for (const date of dates) {
      const day = DAYS[(fromISO(date).getDay() + 6) % 7];
      assert.equal(loggedTitle(real, logged(date, day, ...ids)), session.title, `${session.title} logged on ${date}`);
    }
  }
});
