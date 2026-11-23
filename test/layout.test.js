// What goes with a feature lives with it: its words in a README in its own
// folder, and its part of the play-through in a file of its own. That is
// what lets two branches each add a feature without editing the same lines,
// so it is checked here rather than left to habit. Nothing below names a
// feature: the folders are the list.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const readme = readFileSync(new URL('README.md', ROOT), 'utf8');
const folders = readdirSync(new URL('src/', ROOT), { withFileTypes: true })
  .filter((d) => d.isDirectory() && ['index.js', 'index.ts'].some((f) => existsSync(new URL(`src/${d.name}/${f}`, ROOT))))
  .map((d) => d.name);

// The first cell of each row of the table under a line starting with `after`.
function firstCells(after) {
  const lines = readme.split('\n');
  const from = lines.findIndex((l) => l.startsWith(after));
  assert.ok(from >= 0, `the README has "${after}"`);
  const start = lines.findIndex((l, i) => i > from && l.startsWith('|---'));
  const cells = [];
  for (let i = start + 1; lines[i]?.startsWith('|'); i++) cells.push(lines[i].split('|')[1].trim());
  return cells;
}
const inOrder = (list) => list.every((v, i) => i === 0 || list[i - 1] <= v);

test('every feature folder has a README of its own', () => {
  for (const name of folders) assert.ok(existsSync(new URL(`src/${name}/README.md`, ROOT)), `src/${name}/README.md`);
});

test('what features plug into is listed by file, so a new row has one place to go', () => {
  const files = firstCells('**What features plug into.**');
  assert.ok(files.length > 20, 'the table was found');
  assert.ok(inOrder(files), `in order of file: ${files.join(' ')}`);
  for (const f of files) assert.ok(existsSync(new URL(`src/${f.replace(/`/g, '')}`, ROOT)), `${f} is a file under src/`);
});

test('the play-through is in parts, and each part can be told from its name', () => {
  const parts = readdirSync(new URL('test/smoke/', ROOT));
  for (const file of parts) assert.match(file, /^\d\d-[a-z-]+\.mjs$/, `test/smoke/${file}: two digits, a dash, a name`);
  const names = parts.map((f) => f.slice(3, -4));
  assert.equal(new Set(names).size, names.length, 'no two parts share a name');
});

// ── Who imports whom ────────────────────────────────────────────────────────
// Read as text, like the rest: every import of a file under src/, by the
// folder it's from and the file it's of.

const SRC = new URL('src/', ROOT).pathname;
const sources = [];
(function walk(dir) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}${d.name}`;
    if (d.isDirectory()) {
      if (path !== `${SRC}world/hikes`) walk(`${path}/`);
    } else if (/\.(js|ts)$/.test(d.name) && !d.name.endsWith('.d.ts')) sources.push(path);
  }
})(SRC);
const imports = []; // { from: 'fires/look.js', folder: 'fires', to: 'world/wind.js', into: 'world' }
for (const file of sources) {
  const from = file.slice(SRC.length);
  for (const m of readFileSync(file, 'utf8').matchAll(/^import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?'(\.[^']+)'/gm)) {
    const to = new URL(m[1], `file://${file}`).pathname.slice(SRC.length);
    imports.push({ from, folder: from.includes('/') ? from.split('/')[0] : '', to, into: to.includes('/') ? to.split('/')[0] : '' });
  }
}
// The engine, from the bottom up: each knows only what is below it.
const ENGINE = ['core', 'render', 'world'];
// The folders that are features: an index that exports an install function
// (a folder with an index that doesn't, like structures/, is only shared things).
const features = folders.filter((name) => ['index.js', 'index.ts'].some((f) => existsSync(new URL(`src/${name}/${f}`, ROOT)) && /^export function install[A-Z]/m.test(readFileSync(new URL(`src/${name}/${f}`, ROOT), 'utf8'))));

test('layers point one way: core, then render, then world, then the features', () => {
  assert.ok(imports.length > 1000, 'the imports were found');
  for (const i of imports) {
    const low = ENGINE.indexOf(i.folder);
    if (low < 0 || !i.into) continue; // (a file beside main.js, config.js or noise.js, is anyone's)
    const high = ENGINE.indexOf(i.into);
    // world may take from a folder that is no feature (structures: what stands in the world by hand)
    const up = high < 0 ? features.includes(i.into) : high > low;
    assert.ok(!up, `src/${i.from} imports ${i.to}: ${i.folder}/ is below ${i.into}/, and doesn't know about it`);
  }
  // and the game itself knows only core
  for (const i of imports) if (i.folder === 'game' && i.into && i.into !== 'game') assert.equal(i.into, 'core', `src/${i.from} imports ${i.to}: the game knows only core/`);
});

test('what several features share is in the engine, or is said to be something they plug into', () => {
  // A helper written for one feature and then borrowed by the next, and the
  // next, ends up as everyone's while still living in the first one's
  // folder. So once a file in a feature's folder is imported from three
  // other features, it has to be one of two things: moved down into the
  // engine, where what is everyone's lives; or a row in the README's table
  // of what features plug into, which is saying it is meant to be shared.
  const listed = new Set(firstCells('**What features plug into.**').map((c) => c.replace(/`/g, '')));
  const users = new Map(); // 'towns/people.js' -> the other features that import it
  for (const i of imports) {
    if (!i.into || ENGINE.includes(i.into) || i.into === 'game' || i.folder === i.into || !features.includes(i.folder)) continue;
    if (!users.has(i.to)) users.set(i.to, new Set());
    users.get(i.to).add(i.folder);
  }
  for (const [file, by] of users) {
    if (by.size < 3) continue;
    assert.ok(listed.has(file), `src/${file} is imported by ${by.size} other features (${[...by].sort().join(', ')}): move what they share into core/, render/ or world/, or give it a row in the README's "what features plug into"`);
  }
});
