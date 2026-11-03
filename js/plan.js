// Read-only access to data/plan.json (the app never writes it). The plan is a
// list of weeks that rotate: the week starting `weekStart` is weeks[0], the
// next one weeks[1], and so on, wrapping around.

import { daysBetween, fromISO, startOfWeek, toISO } from './dates.js';

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const PLAN_URL = 'data/plan.json';

export async function loadPlan(url = PLAN_URL) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load the plan (HTTP ${response.status}).`);
  const plan = await response.json();
  if (!Array.isArray(plan?.weeks) || !plan.weeks.length || !plan.weeks.every((w) => Array.isArray(w?.sessions))) {
    throw new Error('The plan file has no weeks.');
  }
  return plan;
}

export function dayOf(date) {
  return DAYS[(date.getDay() + 6) % 7];
}

/** Index into plan.weeks for the week containing `date`. */
export function weekIndex(plan, date) {
  const n = plan.weeks.length;
  const weeks = plan.weekStart ? daysBetween(toISO(startOfWeek(fromISO(plan.weekStart))), toISO(startOfWeek(date))) / 7 : 0;
  return Number.isInteger(weeks) ? ((weeks % n) + n) % n : 0;
}

export function weekFor(plan, date) {
  return plan.weeks[weekIndex(plan, date)];
}

/** The session planned for `date` (a Date), or null. */
export function sessionFor(plan, date) {
  return sessionOn(weekFor(plan, date), dayOf(date));
}

function sessionOn(week, day) {
  return week?.sessions.find((s) => s.day === day) ?? null;
}

export function allSessions(plan) {
  return plan.weeks.flatMap((week) => week.sessions);
}

/** Title for a logged session: the plan session sharing the most exercises with it, so
 *  history keeps the right names when sessions move to other days. Ties go to the
 *  session planned for that date. */
export function loggedTitle(plan, logged) {
  const ids = new Set(logged.exercises.map((e) => e.exerciseId));
  const shared = (session) => (session?.exercises ?? []).filter((e) => ids.has(e.id)).length;
  let best = sessionOn(weekFor(plan, fromISO(logged.date)), logged.day);
  for (const session of allSessions(plan)) if (shared(session) > shared(best)) best = session;
  return best?.title ?? logged.day;
}

export function targetSets(exercise) {
  return exercise.kind === 'main' ? 1 : (exercise.sets ?? 3);
}

export function totalTargetSets(session) {
  return (session?.exercises ?? []).reduce((n, e) => n + targetSets(e), 0);
}

/** Exercises prescribed in seconds (e.g. plank "30-60s"); reps then hold seconds. */
export function isTimed(exercise) {
  return /s$/i.test(exercise.repRange ?? '');
}

export function formatRange(range = '') {
  return range.replace(/(\d)\s*-\s*(\d)/, '$1–$2').replace(/(\d)s$/i, '$1 s');
}

/** Short prescription for lists: "Top set" or "3 × 8–12". */
export function prescription(exercise) {
  if (exercise.kind === 'main') return 'Main lift · top set';
  return `${targetSets(exercise)} × ${formatRange(exercise.repRange)}`;
}

/** The coach's rule text for an exercise kind. */
export function ruleFor(plan, exercise) {
  return exercise.kind === 'main' ? plan.rules?.main : plan.rules?.accessory;
}

/** id -> exercise, across every week. */
export function exerciseIndex(plan) {
  const index = new Map();
  for (const session of allSessions(plan)) {
    for (const exercise of session.exercises ?? []) if (!index.has(exercise.id)) index.set(exercise.id, exercise);
  }
  return index;
}

export function typeLabel(session) {
  return { lift: 'Lift', run: 'Run', rest: 'Rest' }[session?.type] ?? '';
}
