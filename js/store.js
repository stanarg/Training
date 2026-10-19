// Async store for training logs, backed by localStorage.
// Every storage access is wrapped in try/catch: if storage is missing, full or
// throws, the app keeps working in memory and `persistent` turns false.
// Data is replaced as a whole on each change and deep-frozen, so the only way
// to change state is through the store's methods. Subscribers get the new data.

export const STORE_KEY = 'fitness.store.v1';
export const STORE_VERSION = 1;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ERRORS = 50;

export class StoreError extends Error {
  constructor(message, { cause, errors = [] } = {}) {
    super(message, { cause });
    this.name = 'StoreError';
    this.errors = errors;
  }
}

export function emptyData() {
  return { version: STORE_VERSION, sessions: [], runs: [], body: [] };
}

export function backupFileName(date = new Date()) {
  return `fitness-backup-${isoDate(date)}.json`;
}

// ---------------------------------------------------------------- validation

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

export function isISODate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Check that `input` has the store shape. Returns `{ ok, errors, data }` where
 * `data` is a normalized deep copy (known fields only, sorted by date).
 */
export function validate(input) {
  const errors = [];
  const fail = (path, message) => {
    if (errors.length < MAX_ERRORS) errors.push(`${path} ${message}`);
  };

  if (!isObject(input)) return { ok: false, errors: ['The file must contain a JSON object.'] };
  if (input.version !== STORE_VERSION) fail('version', `must be ${STORE_VERSION}`);
  for (const key of ['sessions', 'runs', 'body']) {
    if (!Array.isArray(input[key])) fail(key, 'must be a list');
  }
  if (errors.length) return { ok: false, errors };

  const sessionKeys = new Set();
  input.sessions.forEach((session, i) => {
    const p = `sessions[${i}]`;
    if (!isObject(session)) return fail(p, 'must be an object');
    if (!isISODate(session.date)) fail(`${p}.date`, 'must be a YYYY-MM-DD date');
    if (typeof session.day !== 'string' || !session.day) fail(`${p}.day`, 'must be a day name');
    if (session.notes !== undefined && typeof session.notes !== 'string') fail(`${p}.notes`, 'must be text');
    const key = `${session.date}|${session.day}`;
    if (sessionKeys.has(key)) fail(p, `repeats the ${session.day} session on ${session.date}`);
    sessionKeys.add(key);
    if (!Array.isArray(session.exercises)) return fail(`${p}.exercises`, 'must be a list');

    session.exercises.forEach((exercise, j) => {
      const pe = `${p}.exercises[${j}]`;
      if (!isObject(exercise)) return fail(pe, 'must be an object');
      if (typeof exercise.exerciseId !== 'string' || !exercise.exerciseId) fail(`${pe}.exerciseId`, 'must be an exercise id');
      if (!Array.isArray(exercise.sets)) return fail(`${pe}.sets`, 'must be a list');

      exercise.sets.forEach((set, k) => {
        const ps = `${pe}.sets[${k}]`;
        if (!isObject(set)) return fail(ps, 'must be an object');
        if (!isNumber(set.weightKg) || set.weightKg < 0 || set.weightKg > 1000) fail(`${ps}.weightKg`, 'must be a number from 0 to 1000');
        if (!Number.isInteger(set.reps) || set.reps < 0 || set.reps > 10000) fail(`${ps}.reps`, 'must be a whole number from 0');
        if (set.rpe !== undefined && (!isNumber(set.rpe) || set.rpe < 1 || set.rpe > 10)) fail(`${ps}.rpe`, 'must be between 1 and 10');
      });
    });
  });

  const runDates = new Set();
  input.runs.forEach((run, i) => {
    const p = `runs[${i}]`;
    if (!isObject(run)) return fail(p, 'must be an object');
    if (!isISODate(run.date)) fail(`${p}.date`, 'must be a YYYY-MM-DD date');
    if (runDates.has(run.date)) fail(p, `repeats the run on ${run.date}`);
    runDates.add(run.date);
    if (!isNumber(run.distanceKm) || run.distanceKm <= 0 || run.distanceKm > 1000) fail(`${p}.distanceKm`, 'must be a number above 0');
    if (run.minutes !== undefined && (!isNumber(run.minutes) || run.minutes < 0 || run.minutes > 100000)) fail(`${p}.minutes`, 'must be a number from 0');
  });

  const bodyDates = new Set();
  input.body.forEach((entry, i) => {
    const p = `body[${i}]`;
    if (!isObject(entry)) return fail(p, 'must be an object');
    if (!isISODate(entry.date)) fail(`${p}.date`, 'must be a YYYY-MM-DD date');
    if (bodyDates.has(entry.date)) fail(p, `repeats the bodyweight on ${entry.date}`);
    bodyDates.add(entry.date);
    if (!isNumber(entry.weightKg) || entry.weightKg <= 0 || entry.weightKg > 500) fail(`${p}.weightKg`, 'must be a number from 0 to 500');
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], data: normalize(input) };
}

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

function cleanSet({ weightKg, reps, rpe }) {
  return rpe === undefined || rpe === null ? { weightKg, reps } : { weightKg, reps, rpe };
}

function normalize(input) {
  return {
    version: STORE_VERSION,
    sessions: input.sessions
      .map(({ date, day, exercises, notes }) => ({
        date,
        day,
        exercises: exercises.map(({ exerciseId, sets }) => ({ exerciseId, sets: sets.map(cleanSet) })),
        ...(notes !== undefined && { notes }),
      }))
      .sort(byDate),
    runs: input.runs
      .map(({ date, distanceKm, minutes }) => (minutes === undefined ? { date, distanceKm } : { date, distanceKm, minutes }))
      .sort(byDate),
    body: input.body.map(({ date, weightKg }) => ({ date, weightKg })).sort(byDate),
  };
}

// ---------------------------------------------------------------- summaries

export function countSets(data) {
  return data.sessions.reduce((n, s) => n + s.exercises.reduce((m, e) => m + e.sets.length, 0), 0);
}

function dateRange(data) {
  const dates = [...data.sessions, ...data.runs, ...data.body].map((x) => x.date).sort();
  return dates.length ? { from: dates[0], to: dates.at(-1) } : null;
}

function compare(current, incoming, key) {
  const a = new Map(current.map((x) => [key(x), JSON.stringify(x)]));
  const b = new Map(incoming.map((x) => [key(x), JSON.stringify(x)]));
  const out = { current: a.size, incoming: b.size, added: 0, removed: 0, changed: 0, unchanged: 0 };
  for (const [k, v] of b) {
    if (!a.has(k)) out.added++;
    else if (a.get(k) === v) out.unchanged++;
    else out.changed++;
  }
  for (const k of a.keys()) if (!b.has(k)) out.removed++;
  return out;
}

/** What replacing `current` with `incoming` would do, per collection. */
export function diff(current, incoming) {
  const sessions = compare(current.sessions, incoming.sessions, (s) => `${s.date}|${s.day}`);
  const runs = compare(current.runs, incoming.runs, (r) => r.date);
  const body = compare(current.body, incoming.body, (b) => b.date);
  const identical = [sessions, runs, body].every((c) => !c.added && !c.removed && !c.changed);
  return {
    sessions,
    runs,
    body,
    sets: { current: countSets(current), incoming: countSets(incoming) },
    range: dateRange(incoming),
    identical,
  };
}

// ---------------------------------------------------------------- store

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

function report(error) {
  if (typeof globalThis.reportError === 'function') globalThis.reportError(error);
  else console.error(error);
}

function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export class Store {
  #storage;
  #key;
  #data = deepFreeze(emptyData());
  #listeners = new Set();

  /** False once storage has failed; data then lives in memory only. */
  persistent = true;
  /** Problems found in saved data on the last load (the raw value is kept aside). */
  loadErrors = [];

  constructor({ storage = defaultStorage(), key = STORE_KEY } = {}) {
    this.#storage = storage;
    this.#key = key;
    if (!storage) this.persistent = false;
  }

  /** Current data. Frozen: change it through the store's methods. */
  get data() {
    return this.#data;
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async load() {
    this.loadErrors = [];
    const raw = this.#read();
    let data = emptyData();
    if (raw != null) {
      const result = parseBackup(raw);
      if (result.ok) data = result.data;
      else {
        this.loadErrors = result.errors;
        this.#quarantine(raw);
      }
    }
    this.#data = deepFreeze(data);
    this.#emit();
    return this.#data;
  }

  async save() {
    if (!this.#storage) throw new StoreError('Device storage is not available.');
    try {
      this.#storage.setItem(this.#key, JSON.stringify(this.#data));
      this.persistent = true;
    } catch (cause) {
      this.persistent = false;
      throw new StoreError('Could not save to device storage.', { cause });
    }
  }

  /** Apply `mutator` to a copy of the data, validate, save and notify. */
  async update(mutator) {
    const draft = structuredClone(this.#data);
    const next = (await mutator(draft)) ?? draft;
    const result = validate(next);
    if (!result.ok) throw new StoreError('That change is not valid.', { errors: result.errors });
    return this.#commit(result.data);
  }

  async replace(data) {
    const result = validate(data);
    if (!result.ok) throw new StoreError('That data is not valid.', { errors: result.errors });
    return this.#commit(result.data);
  }

  async clear() {
    try {
      this.#storage?.removeItem(this.#key);
    } catch {
      this.persistent = false;
    }
    this.#data = deepFreeze(emptyData());
    this.#emit();
    return this.#data;
  }

  // ---- lifts

  addSet({ date, day, exerciseId, set, index }) {
    return this.update((d) => {
      let session = d.sessions.find((s) => s.date === date && s.day === day);
      if (!session) d.sessions.push((session = { date, day, exercises: [] }));
      let exercise = session.exercises.find((e) => e.exerciseId === exerciseId);
      if (!exercise) session.exercises.push((exercise = { exerciseId, sets: [] }));
      const at = index === undefined ? exercise.sets.length : Math.min(Math.max(index, 0), exercise.sets.length);
      exercise.sets.splice(at, 0, cleanSet(set));
    });
  }

  /** Remove one set; empty exercises and sessions are removed too. Resolves to the removed set. */
  async removeSet({ date, day, exerciseId, index }) {
    let removed = null;
    await this.update((d) => {
      const session = d.sessions.find((s) => s.date === date && s.day === day);
      const exercise = session?.exercises.find((e) => e.exerciseId === exerciseId);
      if (!exercise || !exercise.sets[index]) return;
      [removed] = exercise.sets.splice(index, 1);
      if (!exercise.sets.length) session.exercises = session.exercises.filter((e) => e !== exercise);
      if (!session.exercises.length && !session.notes) d.sessions = d.sessions.filter((s) => s !== session);
    });
    return removed;
  }

  // ---- runs and bodyweight (one entry per date)

  saveRun({ date, distanceKm, minutes }) {
    return this.update((d) => {
      const run = minutes === undefined || minutes === null ? { date, distanceKm } : { date, distanceKm, minutes };
      d.runs = d.runs.filter((r) => r.date !== date).concat(run);
    });
  }

  removeRun(date) {
    return this.update((d) => {
      d.runs = d.runs.filter((r) => r.date !== date);
    });
  }

  saveBody({ date, weightKg }) {
    return this.update((d) => {
      d.body = d.body.filter((b) => b.date !== date).concat({ date, weightKg });
    });
  }

  removeBody(date) {
    return this.update((d) => {
      d.body = d.body.filter((b) => b.date !== date);
    });
  }

  // ---- queries

  session(date, day) {
    return this.#data.sessions.find((s) => s.date === date && s.day === day) ?? null;
  }

  setsFor({ date, day, exerciseId }) {
    return this.session(date, day)?.exercises.find((e) => e.exerciseId === exerciseId)?.sets ?? [];
  }

  /** Most recent set ever logged for an exercise, or null. */
  lastSet(exerciseId) {
    for (let i = this.#data.sessions.length - 1; i >= 0; i--) {
      const sets = this.#data.sessions[i].exercises.find((e) => e.exerciseId === exerciseId)?.sets;
      if (sets?.length) return sets.at(-1);
    }
    return null;
  }

  /** Sets from the latest session before `beforeDate` that has this exercise. */
  previousSets(exerciseId, beforeDate) {
    for (let i = this.#data.sessions.length - 1; i >= 0; i--) {
      const session = this.#data.sessions[i];
      if (session.date >= beforeDate) continue;
      const sets = session.exercises.find((e) => e.exerciseId === exerciseId)?.sets;
      if (sets?.length) return { date: session.date, sets };
    }
    return null;
  }

  /** Heaviest set per session (ties go to more reps), oldest first, last `limit` sessions. */
  topSets(exerciseId, limit = 8) {
    const out = [];
    for (const session of this.#data.sessions) {
      const sets = session.exercises.find((e) => e.exerciseId === exerciseId)?.sets;
      if (!sets?.length) continue;
      const top = sets.reduce((best, s) =>
        s.weightKg > best.weightKg || (s.weightKg === best.weightKg && s.reps > best.reps) ? s : best,
      );
      out.push({ date: session.date, weightKg: top.weightKg, reps: top.reps });
    }
    return out.slice(-limit);
  }

  /** Exercise ids with at least one set, most recently logged first. */
  loggedExerciseIds() {
    const ids = [];
    for (let i = this.#data.sessions.length - 1; i >= 0; i--) {
      for (const e of this.#data.sessions[i].exercises) {
        if (e.sets.length && !ids.includes(e.exerciseId)) ids.push(e.exerciseId);
      }
    }
    return ids;
  }

  /** Latest bodyweight entry on or before `date` (default: any). */
  latestBody(date) {
    for (let i = this.#data.body.length - 1; i >= 0; i--) {
      const entry = this.#data.body[i];
      if (date === undefined || entry.date <= date) return entry;
    }
    return null;
  }

  // ---- backup

  exportJSON() {
    return `${JSON.stringify(this.#data, null, 2)}\n`;
  }

  /** Parse and validate a backup without changing anything. */
  previewImport(text) {
    const result = parseBackup(text);
    if (!result.ok) return { ok: false, errors: result.errors, data: null, diff: null };
    return { ok: true, errors: [], data: result.data, diff: diff(this.#data, result.data) };
  }

  /**
   * Replace the store with a backup after `confirm(preview)` resolves true.
   * Resolves to `{ imported, ...preview }`.
   */
  async importJSON(text, { confirm = async () => true } = {}) {
    const preview = this.previewImport(text);
    if (!preview.ok) return { imported: false, ...preview };
    if (!(await confirm(preview))) return { imported: false, ...preview };
    await this.replace(preview.data);
    return { imported: true, ...preview };
  }

  // ---- internals

  async #commit(data) {
    this.#data = deepFreeze(data);
    let failure = null;
    try {
      await this.save();
    } catch (error) {
      failure = error;
    }
    this.#emit();
    if (failure) throw failure;
    return this.#data;
  }

  #read() {
    if (!this.#storage) return null;
    try {
      return this.#storage.getItem(this.#key);
    } catch {
      this.persistent = false;
      return null;
    }
  }

  #quarantine(raw) {
    try {
      this.#storage?.setItem(`${this.#key}.corrupt-${Date.now()}`, raw);
    } catch {
      // Nothing more we can do; the bad value stays where it is until the next save.
    }
  }

  #emit() {
    for (const listener of this.#listeners) {
      try {
        listener(this.#data);
      } catch (error) {
        report(error);
      }
    }
  }
}

function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text).replace(/^﻿/, ''));
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] };
  }
  return validate(parsed);
}
