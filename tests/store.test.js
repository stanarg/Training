// Store tests: load, save, export, import and validation.
// Run with: node --test tests/

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  Store,
  StoreError,
  STORE_KEY,
  emptyData,
  validate,
  diff,
  backupFileName,
  isISODate,
} from '../js/store.js';

/** Minimal Storage stand-in. `fail` makes the named methods throw. */
function memoryStorage(initial = {}, { fail = [] } = {}) {
  const map = new Map(Object.entries(initial));
  const guard = (name) => {
    if (fail.includes(name)) throw Object.assign(new Error(`${name} failed`), { name: 'QuotaExceededError' });
  };
  return {
    map,
    getItem: (k) => (guard('getItem'), map.has(k) ? map.get(k) : null),
    setItem: (k, v) => (guard('setItem'), map.set(k, String(v))),
    removeItem: (k) => (guard('removeItem'), map.delete(k)),
  };
}

const LOWER_A = { date: '2026-10-19', day: 'Mon' };

function sampleData() {
  return {
    version: 1,
    sessions: [
      {
        date: '2026-10-12',
        day: 'Mon',
        exercises: [
          { exerciseId: 'squat', sets: [{ weightKg: 95, reps: 5, rpe: 8 }] },
          { exerciseId: 'rdl', sets: [{ weightKg: 80, reps: 10 }, { weightKg: 80, reps: 9 }] },
        ],
        notes: 'Felt good',
      },
    ],
    runs: [{ date: '2026-10-14', distanceKm: 5, minutes: 28 }],
    body: [{ date: '2026-10-12', weightKg: 82.4 }],
  };
}

describe('load', () => {
  test('empty storage gives empty data', async () => {
    const store = new Store({ storage: memoryStorage() });
    assert.deepEqual(await store.load(), emptyData());
    assert.deepEqual(store.loadErrors, []);
    assert.equal(store.persistent, true);
  });

  test('reads valid saved data', async () => {
    const storage = memoryStorage({ [STORE_KEY]: JSON.stringify(sampleData()) });
    const store = new Store({ storage });
    assert.deepEqual(await store.load(), sampleData());
  });

  test('corrupt JSON loads as empty and keeps the raw value aside', async () => {
    const storage = memoryStorage({ [STORE_KEY]: '{not json' });
    const store = new Store({ storage });
    assert.deepEqual(await store.load(), emptyData());
    assert.match(store.loadErrors[0], /not valid JSON/);
    const kept = [...storage.map.keys()].find((k) => k.startsWith(`${STORE_KEY}.corrupt-`));
    assert.ok(kept, 'corrupt copy saved');
    assert.equal(storage.map.get(kept), '{not json');
  });

  test('wrong shape loads as empty with errors', async () => {
    const storage = memoryStorage({ [STORE_KEY]: JSON.stringify({ version: 2, sessions: [] }) });
    const store = new Store({ storage });
    assert.deepEqual(await store.load(), emptyData());
    assert.ok(store.loadErrors.some((e) => e.startsWith('version')));
  });

  test('storage that throws on read still loads', async () => {
    const store = new Store({ storage: memoryStorage({}, { fail: ['getItem'] }) });
    assert.deepEqual(await store.load(), emptyData());
    assert.equal(store.persistent, false);
  });

  test('no storage at all still loads, in memory only', async () => {
    const store = new Store({ storage: null });
    assert.deepEqual(await store.load(), emptyData());
    assert.equal(store.persistent, false);
  });

  test('data is frozen', async () => {
    const store = new Store({ storage: memoryStorage({ [STORE_KEY]: JSON.stringify(sampleData()) }) });
    await store.load();
    assert.throws(() => store.data.sessions.push({}), TypeError);
    assert.throws(() => {
      store.data.sessions[0].exercises[0].sets[0].reps = 99;
    }, TypeError);
  });
});

describe('save and update', () => {
  test('save writes JSON under the store key', async () => {
    const storage = memoryStorage();
    const store = new Store({ storage });
    await store.load();
    await store.replace(sampleData());
    assert.deepEqual(JSON.parse(storage.map.get(STORE_KEY)), sampleData());
  });

  test('addSet creates the session and exercise, then appends', async () => {
    const storage = memoryStorage();
    const store = new Store({ storage });
    await store.load();
    await store.addSet({ ...LOWER_A, exerciseId: 'squat', set: { weightKg: 100, reps: 5, rpe: 8 } });
    await store.addSet({ ...LOWER_A, exerciseId: 'squat', set: { weightKg: 102.5, reps: 5 } });
    assert.deepEqual(store.setsFor({ ...LOWER_A, exerciseId: 'squat' }), [
      { weightKg: 100, reps: 5, rpe: 8 },
      { weightKg: 102.5, reps: 5 },
    ]);
    const saved = JSON.parse(storage.map.get(STORE_KEY));
    assert.equal(saved.sessions[0].exercises[0].sets.length, 2);
  });

  test('addSet with an index inserts there (used by undo)', async () => {
    const store = new Store({ storage: memoryStorage() });
    await store.load();
    for (const reps of [10, 9]) await store.addSet({ ...LOWER_A, exerciseId: 'rdl', set: { weightKg: 80, reps } });
    await store.addSet({ ...LOWER_A, exerciseId: 'rdl', set: { weightKg: 80, reps: 12 }, index: 0 });
    assert.deepEqual(store.setsFor({ ...LOWER_A, exerciseId: 'rdl' }).map((s) => s.reps), [12, 10, 9]);
  });

  test('sessions stay sorted by date', async () => {
    const store = new Store({ storage: memoryStorage() });
    await store.load();
    await store.addSet({ date: '2026-10-20', day: 'Tue', exerciseId: 'bench', set: { weightKg: 70, reps: 5 } });
    await store.addSet({ date: '2026-10-19', day: 'Mon', exerciseId: 'squat', set: { weightKg: 100, reps: 5 } });
    assert.deepEqual(store.data.sessions.map((s) => s.date), ['2026-10-19', '2026-10-20']);
  });

  test('removeSet removes and cleans up empty exercise and session', async () => {
    const store = new Store({ storage: memoryStorage() });
    await store.load();
    await store.addSet({ ...LOWER_A, exerciseId: 'squat', set: { weightKg: 100, reps: 5 } });
    const removed = await store.removeSet({ ...LOWER_A, exerciseId: 'squat', index: 0 });
    assert.deepEqual(removed, { weightKg: 100, reps: 5 });
    assert.deepEqual(store.data.sessions, []);
  });

  test('invalid change is rejected and nothing changes', async () => {
    const storage = memoryStorage();
    const store = new Store({ storage });
    await store.load();
    await assert.rejects(
      store.addSet({ ...LOWER_A, exerciseId: 'squat', set: { weightKg: -5, reps: 5 } }),
      (e) => e instanceof StoreError && e.errors.some((m) => m.includes('weightKg')),
    );
    await assert.rejects(store.addSet({ ...LOWER_A, exerciseId: 'squat', set: { weightKg: 50, reps: 4.5 } }), StoreError);
    assert.deepEqual(store.data, emptyData());
    assert.equal(storage.map.has(STORE_KEY), false);
  });

  test('subscribers are notified with new data and can unsubscribe', async () => {
    const store = new Store({ storage: memoryStorage() });
    const seen = [];
    const off = store.subscribe((d) => seen.push(d.body.length));
    await store.load();
    await store.saveBody({ date: '2026-10-19', weightKg: 82 });
    off();
    await store.saveBody({ date: '2026-10-20', weightKg: 82.2 });
    assert.deepEqual(seen, [0, 1]);
  });

  test('a throwing subscriber does not stop the others', async () => {
    const store = new Store({ storage: memoryStorage() });
    const reported = [];
    const original = globalThis.reportError;
    globalThis.reportError = (e) => reported.push(e);
    let called = false;
    store.subscribe(() => {
      throw new Error('boom');
    });
    store.subscribe(() => {
      called = true;
    });
    try {
      await store.load();
    } finally {
      globalThis.reportError = original;
    }
    assert.equal(called, true);
    assert.equal(reported[0].message, 'boom');
  });

  test('a full disk rejects but keeps the change in memory', async () => {
    const store = new Store({ storage: memoryStorage({}, { fail: ['setItem'] }) });
    await store.load();
    await assert.rejects(store.saveBody({ date: '2026-10-19', weightKg: 82 }), StoreError);
    assert.equal(store.persistent, false);
    assert.deepEqual(store.data.body, [{ date: '2026-10-19', weightKg: 82 }]);
  });

  test('saveRun and saveBody replace the entry for that date', async () => {
    const store = new Store({ storage: memoryStorage() });
    await store.load();
    await store.saveRun({ date: '2026-10-21', distanceKm: 5 });
    await store.saveRun({ date: '2026-10-21', distanceKm: 5.2, minutes: 29 });
    await store.saveBody({ date: '2026-10-21', weightKg: 82 });
    await store.saveBody({ date: '2026-10-21', weightKg: 81.8 });
    assert.deepEqual(store.data.runs, [{ date: '2026-10-21', distanceKm: 5.2, minutes: 29 }]);
    assert.deepEqual(store.data.body, [{ date: '2026-10-21', weightKg: 81.8 }]);
  });

  test('clear empties storage', async () => {
    const storage = memoryStorage({ [STORE_KEY]: JSON.stringify(sampleData()) });
    const store = new Store({ storage });
    await store.load();
    await store.clear();
    assert.deepEqual(store.data, emptyData());
    assert.equal(storage.map.has(STORE_KEY), false);
  });
});

describe('queries', () => {
  test('lastSet, previousSets, topSets and loggedExerciseIds', async () => {
    const store = new Store({ storage: memoryStorage() });
    await store.load();
    const weights = [80, 85, 87.5, 90, 92.5, 95, 97.5, 100, 102.5];
    for (const [i, w] of weights.entries()) {
      const date = `2026-08-${String(i + 1).padStart(2, '0')}`;
      await store.addSet({ date, day: 'Mon', exerciseId: 'squat', set: { weightKg: w - 20, reps: 5 } });
      await store.addSet({ date, day: 'Mon', exerciseId: 'squat', set: { weightKg: w, reps: 5 } });
    }
    await store.addSet({ date: '2026-08-10', day: 'Thu', exerciseId: 'deadlift', set: { weightKg: 140, reps: 5 } });

    assert.deepEqual(store.lastSet('squat'), { weightKg: 102.5, reps: 5 });
    assert.equal(store.lastSet('bench'), null);

    const prev = store.previousSets('squat', '2026-08-09');
    assert.equal(prev.date, '2026-08-08');
    assert.deepEqual(prev.sets.map((s) => s.weightKg), [80, 100]);

    const top = store.topSets('squat');
    assert.equal(top.length, 8);
    assert.deepEqual(top.map((t) => t.weightKg), weights.slice(1));
    assert.deepEqual(store.loggedExerciseIds(), ['deadlift', 'squat']);
  });

  test('topSets breaks weight ties on reps', async () => {
    const store = new Store({ storage: memoryStorage() });
    await store.load();
    for (const reps of [8, 11, 10]) await store.addSet({ ...LOWER_A, exerciseId: 'rdl', set: { weightKg: 80, reps } });
    assert.deepEqual(store.topSets('rdl'), [{ date: LOWER_A.date, weightKg: 80, reps: 11 }]);
  });

  test('latestBody respects the date', async () => {
    const store = new Store({ storage: memoryStorage() });
    await store.load();
    await store.saveBody({ date: '2026-10-10', weightKg: 83 });
    await store.saveBody({ date: '2026-10-20', weightKg: 82 });
    assert.equal(store.latestBody('2026-10-19').weightKg, 83);
    assert.equal(store.latestBody().weightKg, 82);
  });
});

describe('export', () => {
  test('backup file name uses the local date', () => {
    assert.equal(backupFileName(new Date(2026, 9, 19, 23, 30)), 'fitness-backup-2026-10-19.json');
    assert.equal(backupFileName(new Date(2026, 0, 5)), 'fitness-backup-2026-01-05.json');
  });

  test('exportJSON is pretty JSON of the full store', async () => {
    const store = new Store({ storage: memoryStorage({ [STORE_KEY]: JSON.stringify(sampleData()) }) });
    await store.load();
    const text = store.exportJSON();
    assert.ok(text.endsWith('\n'));
    assert.ok(text.includes('\n  "sessions": ['));
    assert.deepEqual(JSON.parse(text), sampleData());
  });
});

describe('import', () => {
  test('round trip: export, clear, import gives identical data', async () => {
    const storage = memoryStorage();
    const store = new Store({ storage });
    await store.load();
    await store.replace(sampleData());
    await store.addSet({ ...LOWER_A, exerciseId: 'squat', set: { weightKg: 100, reps: 5, rpe: 8 } });
    const before = store.data;
    const text = store.exportJSON();

    await store.clear();
    assert.deepEqual(store.data, emptyData());

    const result = await store.importJSON(text);
    assert.equal(result.imported, true);
    assert.deepEqual(store.data, before);
    assert.deepEqual(JSON.parse(storage.map.get(STORE_KEY)), before);

    const fresh = new Store({ storage });
    assert.deepEqual(await fresh.load(), before);
  });

  test('preview reports a diff summary and changes nothing', async () => {
    const store = new Store({ storage: memoryStorage() });
    await store.load();
    await store.addSet({ ...LOWER_A, exerciseId: 'squat', set: { weightKg: 100, reps: 5 } });
    await store.saveBody({ date: '2026-10-12', weightKg: 83 });
    const before = store.data;

    const preview = store.previewImport(JSON.stringify(sampleData()));
    assert.equal(preview.ok, true);
    assert.deepEqual(preview.diff.sessions, { current: 1, incoming: 1, added: 1, removed: 1, changed: 0, unchanged: 0 });
    assert.deepEqual(preview.diff.runs, { current: 0, incoming: 1, added: 1, removed: 0, changed: 0, unchanged: 0 });
    assert.deepEqual(preview.diff.body, { current: 1, incoming: 1, added: 0, removed: 0, changed: 1, unchanged: 0 });
    assert.deepEqual(preview.diff.sets, { current: 1, incoming: 3 });
    assert.deepEqual(preview.diff.range, { from: '2026-10-12', to: '2026-10-14' });
    assert.equal(preview.diff.identical, false);
    assert.equal(store.data, before);
  });

  test('confirm returning false keeps the current data', async () => {
    const store = new Store({ storage: memoryStorage() });
    await store.load();
    let shown = null;
    const result = await store.importJSON(JSON.stringify(sampleData()), {
      confirm: async (preview) => ((shown = preview), false),
    });
    assert.equal(result.imported, false);
    assert.equal(shown.diff.sessions.added, 1);
    assert.deepEqual(store.data, emptyData());
  });

  test('invalid JSON is refused before confirm', async () => {
    const store = new Store({ storage: memoryStorage() });
    await store.load();
    let asked = false;
    const result = await store.importJSON('{"version": 1,', { confirm: async () => (asked = true) });
    assert.equal(result.imported, false);
    assert.equal(result.ok, false);
    assert.equal(asked, false);
    assert.match(result.errors[0], /not valid JSON/);
  });

  test('wrong shape is refused with the path of each problem', async () => {
    const store = new Store({ storage: memoryStorage() });
    await store.load();
    const bad = sampleData();
    bad.sessions[0].date = '2026-02-30';
    bad.sessions[0].exercises[1].sets[0].reps = '10';
    bad.runs[0].distanceKm = 0;
    delete bad.body;
    let result = store.previewImport(JSON.stringify(bad));
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, ['body must be a list']);

    bad.body = [{ date: '2026-10-12', weightKg: 82 }, { date: '2026-10-12', weightKg: 83 }];
    result = store.previewImport(JSON.stringify(bad));
    assert.deepEqual(result.errors, [
      'sessions[0].date must be a YYYY-MM-DD date',
      'sessions[0].exercises[1].sets[0].reps must be a whole number from 0',
      'runs[0].distanceKm must be a number above 0',
      'body[1] repeats the bodyweight on 2026-10-12',
    ]);
  });

  test('a UTF-8 BOM is tolerated', async () => {
    const store = new Store({ storage: memoryStorage() });
    await store.load();
    assert.equal(store.previewImport(`﻿${JSON.stringify(sampleData())}`).ok, true);
  });
});

describe('validate', () => {
  test('normalizes: drops unknown fields and sorts by date', () => {
    const input = sampleData();
    input.extra = true;
    input.sessions.unshift({ date: '2026-10-19', day: 'Mon', exercises: [], junk: 1 });
    input.sessions[1].exercises[0].sets[0].note = 'x';
    const { ok, data } = validate(input);
    assert.equal(ok, true);
    assert.equal('extra' in data, false);
    assert.deepEqual(data.sessions.map((s) => s.date), ['2026-10-12', '2026-10-19']);
    assert.deepEqual(data.sessions[0].exercises[0].sets[0], { weightKg: 95, reps: 5, rpe: 8 });
    assert.equal('junk' in data.sessions[1], false);
  });

  test('rejects non-objects and out-of-range RPE', () => {
    assert.equal(validate([]).ok, false);
    assert.equal(validate(null).ok, false);
    const data = sampleData();
    data.sessions[0].exercises[0].sets[0].rpe = 11;
    assert.deepEqual(validate(data).errors, ['sessions[0].exercises[0].sets[0].rpe must be between 1 and 10']);
  });

  test('isISODate checks real calendar dates', () => {
    assert.equal(isISODate('2026-10-19'), true);
    assert.equal(isISODate('2028-02-29'), true);
    assert.equal(isISODate('2026-02-29'), false);
    assert.equal(isISODate('2026-1-9'), false);
    assert.equal(isISODate(20261019), false);
  });

  test('diff of identical data is identical', () => {
    assert.equal(diff(sampleData(), sampleData()).identical, true);
  });
});
