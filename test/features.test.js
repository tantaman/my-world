// Features are found, not listed (src/game/features.js): which folders are
// features, the order they install in, and that the real ones each say what
// they come after.
//
// The order itself is deliberately not written down here. A list of every
// feature in a test would be one more place each new feature had to sign.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { featuresIn, inOrder } from '../src/game/features.js';

const feature = (name, ...after) => ({ name, after, install() {} });
const names = (list) => list.map((f) => f.name);

test('a feature installs after the ones it names, and otherwise by name', () => {
  const order = names(inOrder([feature('tools', 'ground', 'walker'), feature('ground'), feature('walker', 'ground'), feature('birds'), feature('sky')]));
  assert.deepEqual(order, ['birds', 'ground', 'sky', 'walker', 'tools']);
  // and it doesn't matter what order they were found in
  const again = names(inOrder([feature('sky'), feature('birds'), feature('walker', 'ground'), feature('ground'), feature('tools', 'walker', 'ground')]));
  assert.deepEqual(again, order);
});

test('adding a feature leaves the others in the order they were', () => {
  const had = [feature('ground'), feature('walker', 'ground'), feature('tools', 'walker'), feature('fires', 'tools'), feature('map', 'walker')];
  const before = names(inOrder(had));
  for (const added of [feature('aviary'), feature('caves', 'ground'), feature('hikes', 'map', 'fires'), feature('zoo', 'walker')]) {
    const now = names(inOrder([...had, added]));
    assert.deepEqual(now.filter((n) => n !== added.name), before, `with ${added.name}`);
    for (const a of added.after) assert.ok(now.indexOf(a) < now.indexOf(added.name), `${added.name} is after ${a}`);
  }
});

test('coming after something for its place, not its things, works the same', () => {
  // the plan tool is ninth on the tool bar because blueprints comes after fires
  const order = names(inOrder([feature('blueprints', 'build', 'fires'), feature('build'), feature('fires', 'build')]));
  assert.deepEqual(order, ['build', 'fires', 'blueprints']);
});

test('what cannot be put in order is refused, and says which', () => {
  assert.throws(() => inOrder([feature('fires', 'biuld'), feature('build')]), /"fires" comes after "biuld", and there is no such feature \(there are: build, fires\)/);
  assert.throws(() => inOrder([feature('ground'), feature('egg', 'hen'), feature('hen', 'egg')]), /each come after another of them.*: egg, hen$/);
  assert.throws(() => inOrder([feature('alone', 'alone')]), /each come after another of them/);
  assert.throws(() => inOrder([feature('map'), feature('map')]), /two features are called "map"/);
});

test('a folder is a feature if its index.js exports an install function', () => {
  const installFires = () => {};
  const installHud = () => {};
  const found = featuresIn({
    './fires/index.js': { after: ['build'], installFires, FIRE: { ring: 0.45 } },
    './ui/index.js': { installHud },
    './structures/index.js': { STRUCTURES: [] },
    './notes/index.js': { installed: () => true, install: 3 },
  });
  assert.deepEqual(found, [
    { name: 'fires', after: ['build'], install: installFires },
    { name: 'ui', after: [], install: installHud },
  ]);
  assert.throws(() => featuresIn({ './both/index.js': { installOne() {}, installTwo() {} } }), /more than one install function \(installOne, installTwo\)/);
});

// ── The real ones ───────────────────────────────────────────────────────────
// Read as text: a feature's index.js needs a browser to run. This leans on how
// they are all written: `export const after = [...]` on one line, and what
// install takes from the game on its first line, `const { a, b } = game;`.

const SRC = new URL('../src/', import.meta.url);
const real = readdirSync(SRC, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(new URL(`${d.name}/index.js`, SRC)))
  .map((d) => ({ name: d.name, text: readFileSync(new URL(`${d.name}/index.js`, SRC), 'utf8') }))
  .filter((f) => /^export function install[A-Z]\w*\(game\)/m.test(f.text))
  .map((f) => ({
    ...f,
    after: (f.text.match(/^export const after = \[(.*)\];$/m)?.[1] ?? '').split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean),
    takes: (f.text.match(/^ {2}const \{ (.*) \} = game;$/m)?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    provides: [...f.text.matchAll(/game\.provide\('(\w+)'/g)].map((m) => m[1]),
  }));

test('the features in src/ can be put in order', () => {
  assert.ok(real.length > 10, 'they were found');
  const order = names(inOrder(real));
  assert.equal(order.length, real.length);
  for (const f of real) assert.equal(new Set(f.after).size, f.after.length, `${f.name} names each feature once`);
});

test('each comes after the features whose things it takes from the game', () => {
  const provider = new Map();
  for (const f of real) for (const p of f.provides) provider.set(p, f.name);
  const byName = new Map(real.map((f) => [f.name, f]));
  // everything a feature comes after, and everything those come after
  const allAfter = (name, seen = new Set()) => {
    for (const a of byName.get(name).after) {
      if (seen.has(a)) continue;
      seen.add(a);
      allAfter(a, seen);
    }
    return seen;
  };
  for (const f of real) {
    const before = allAfter(f.name);
    for (const thing of f.takes) {
      const from = provider.get(thing);
      // (what no feature provides is the game's own: save, settings, commands)
      if (from && from !== f.name) assert.ok(before.has(from), `src/${f.name}/index.js takes game.${thing}, which ${from} provides: add '${from}' to its \`after\``);
    }
  }
});
