// Read-only access to data/plan.json (the coach edits it; the app never writes it).

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const PLAN_URL = 'data/plan.json';

export async function loadPlan(url = PLAN_URL) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load the plan (HTTP ${response.status}).`);
  const plan = await response.json();
  if (!Array.isArray(plan?.sessions)) throw new Error('The plan file has no sessions.');
  return plan;
}

export function dayOf(date) {
  return DAYS[(date.getDay() + 6) % 7];
}

export function sessionFor(plan, day) {
  return plan.sessions.find((s) => s.day === day) ?? null;
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

/** id -> exercise, across the whole week. */
export function exerciseIndex(plan) {
  const index = new Map();
  for (const session of plan.sessions) {
    for (const exercise of session.exercises ?? []) if (!index.has(exercise.id)) index.set(exercise.id, exercise);
  }
  return index;
}

export function typeLabel(session) {
  return { lift: 'Lift', run: 'Run', rest: 'Rest' }[session?.type] ?? '';
}
