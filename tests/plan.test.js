// Plan tests: naming logged sessions after the plan moves sessions between days.
// Run with: node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loggedTitle } from '../js/plan.js';

const plan = {
  sessions: [
    { day: 'Mon', title: 'Lower', type: 'lift', exercises: [{ id: 'squat' }, { id: 'rdl' }, { id: 'calf' }] },
    { day: 'Tue', title: 'Upper A', type: 'lift', exercises: [{ id: 'bench' }, { id: 'row' }, { id: 'curl' }] },
    { day: 'Thu', title: 'Pull', type: 'lift', exercises: [{ id: 'pullup' }, { id: 'cablerow' }, { id: 'curl' }] },
    { day: 'Sat', title: 'Easy run', type: 'run', distanceKm: 5 },
  ],
};
const logged = (day, ...ids) => ({ date: '2026-10-24', day, exercises: ids.map((exerciseId) => ({ exerciseId, sets: [] })) });

test('a session logged on a day that moved keeps the title of its exercises', () => {
  assert.equal(loggedTitle(plan, logged('Sat', 'pullup', 'cablerow')), 'Pull');
});

test('a session on an unchanged day keeps its weekday title', () => {
  assert.equal(loggedTitle(plan, logged('Mon', 'squat', 'rdl')), 'Lower');
});

test('ties go to the weekday session', () => {
  assert.equal(loggedTitle(plan, logged('Tue', 'curl')), 'Upper A');
  assert.equal(loggedTitle(plan, logged('Thu', 'curl')), 'Pull');
});

test('falls back to the weekday, then the day name, when no exercise matches', () => {
  assert.equal(loggedTitle(plan, logged('Tue', 'deadlift')), 'Upper A');
  assert.equal(loggedTitle(plan, logged('Fri', 'deadlift')), 'Fri');
});

test('every lift session in data/plan.json is named by its own exercises', () => {
  const real = JSON.parse(readFileSync(new URL('../data/plan.json', import.meta.url), 'utf8'));
  for (const session of real.sessions.filter((s) => s.type === 'lift')) {
    const ids = session.exercises.map((e) => e.id);
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      assert.equal(loggedTitle(real, logged(day, ...ids)), session.title, `${session.title} logged on ${day}`);
    }
  }
});
