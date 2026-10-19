// App-shell consistency: every file the service worker precaches exists, every
// JS module is precached and modulepreloaded, and the manifest icons exist.
// A missing entry would break offline use or install, so it is cheap to guard.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), 'utf8');

function walk(dir) {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(root, path)).isDirectory() ? walk(path) : [path];
  });
}

const sw = read('sw.js');
const shell = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).concat('data/plan.json');
const modules = walk('js').filter((p) => p.endsWith('.js'));
const index = read('index.html');

test('every precached file exists', () => {
  for (const path of shell) {
    if (path === './') continue;
    assert.ok(existsSync(join(root, path)), `${path} is in sw.js SHELL but missing`);
  }
});

test('every module and stylesheet is precached', () => {
  const css = walk('css');
  for (const path of [...modules, ...css]) assert.ok(shell.includes(path), `${path} is not in sw.js SHELL`);
});

test('every module is modulepreloaded and every preload exists', () => {
  const preloads = [...index.matchAll(/rel="modulepreload" href="([^"]+)"/g)].map((m) => m[1]);
  for (const path of modules) assert.ok(preloads.includes(path), `${path} has no modulepreload`);
  for (const path of preloads) assert.ok(existsSync(join(root, path)), `${path} preloaded but missing`);
});

test('manifest icons exist and include a maskable icon', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  for (const icon of manifest.icons) assert.ok(existsSync(join(root, icon.src)), `${icon.src} missing`);
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.background_color, '#FAFAF9');
});

test('every template used in JS exists in index.html', () => {
  const used = new Set(modules.flatMap((p) => [...read(p).matchAll(/fromTemplate\('([^']+)'\)/g)].map((m) => m[1])));
  for (const id of used) assert.ok(index.includes(`id="${id}"`), `template #${id} missing from index.html`);
});

test('modules only import files that exist', () => {
  for (const path of modules) {
    for (const [, spec] of read(path).matchAll(/from '(\.[^']+)'/g)) {
      const target = relative(root, join(root, path, '..', spec));
      assert.ok(existsSync(join(root, target)), `${path} imports missing ${spec}`);
    }
  }
});
