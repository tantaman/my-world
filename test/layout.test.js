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
  .filter((d) => d.isDirectory() && existsSync(new URL(`src/${d.name}/index.js`, ROOT)))
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
