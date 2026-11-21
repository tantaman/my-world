// Golden files: a recorded answer the code has to keep giving.
//
//   UPDATE_GOLDEN=1 npm test     record what the code does now
//
// These pin what other people's saved worlds depend on — the shape of the
// land a seed grows, and how a save is spelled — so not all of them are
// yours to re-record:
//
//   * A frozen land's files are for good (FROZEN in src/world/lands.js):
//     worlds people keep are grown on that land, so UPDATE_GOLDEN leaves them
//     alone and a difference is a failure to fix in the code. A draft land's
//     files are not: while the land is still being shaped they are there to
//     show in review what a change did, and re-recording is the point.
//   * How a save is spelled may only be added to (ADD_ONLY): a new kind may
//     appear, but nothing already written down may change or go, because it
//     is on the save server and in people's browsers.
//
// A file belongs to a land by its name: fields-42-land2 is land 2's,
// fields-42 is land 1's.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { FROZEN } from '../../src/world/lands.js';

const fileFor = (name) => new URL(`../golden/${name}.json`, import.meta.url);

// Golden files that may only be added to, whatever the lands are doing.
const ADD_ONLY = new Set(['save-elements']);

// The land a golden file belongs to, and whether that land is pinned for good.
const landOfFile = (name) => Number(/-land(\d+)$/.exec(name)?.[1] ?? 1);
const isFrozen = (name) => landOfFile(name) <= FROZEN;

// Numbers are compared to within `tolerance` (relative, for big ones) so a
// last-bit difference in Math.sin between engines isn't a failure.
export function matchesGolden(name, actual, { tolerance = 0 } = {}) {
  const file = fileFor(name);
  const plain = JSON.parse(JSON.stringify(actual));

  // A frozen land is never re-recorded: fall through and compare, so that a
  // difference says what moved and why it may not simply be written down.
  if (process.env.UPDATE_GOLDEN && !isFrozen(name)) {
    if (ADD_ONLY.has(name) && existsSync(file)) {
      const before = JSON.parse(readFileSync(file, 'utf8'));
      const lost = wouldChange(before, plain, name);
      assert.equal(lost, null, lost ? `${lost}\n  "${name}" may only be added to: it is what is on the save server and in people's browsers.` : '');
    }
    writeFileSync(file, `${JSON.stringify(plain, null, 1)}\n`);
    return;
  }

  assert.ok(existsSync(file), `no golden file for "${name}": run UPDATE_GOLDEN=1 npm test`);
  const expected = JSON.parse(readFileSync(file, 'utf8'));
  const where = firstDifference(expected, plain, tolerance, name);
  const why = isFrozen(name)
    ? `\n  land ${landOfFile(name)} is frozen (FROZEN in src/world/lands.js): worlds people keep are grown on it, so fix the code, or grow what is new on a land of its own.`
    : '';
  assert.equal(where, null, where ? where + why : '');
}

// What would be lost if `now` replaced `before`: the first thing that was
// written down and is no longer, or is written down differently. Anything
// only in `now` is new, and fine. null when nothing would be lost.
function wouldChange(before, now, path) {
  if (before === null || now === null || typeof before !== 'object' || typeof now !== 'object') {
    return before === now ? null : `${path}: was ${JSON.stringify(before)}, now ${JSON.stringify(now)}`;
  }
  if (Array.isArray(before) !== Array.isArray(now)) return `${path}: one is a list and the other is not`;
  for (const k of Object.keys(before)) {
    if (!(k in now)) return `${path}.${k}: gone`;
    const d = wouldChange(before[k], now[k], `${path}.${k}`);
    if (d) return d;
  }
  return null;
}

function firstDifference(a, b, tol, path) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === b) return null;
    const scale = Math.max(1, Math.abs(a), Math.abs(b));
    return Math.abs(a - b) <= tol * scale ? null : `${path}: expected ${a}, got ${b}`;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return a === b ? null : `${path}: expected ${JSON.stringify(a)}, got ${JSON.stringify(b)}`;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: one is a list and the other is not`;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (!(k in a)) return `${path}.${k}: not expected, got ${JSON.stringify(b[k])}`;
    if (!(k in b)) return `${path}.${k}: missing`;
    const d = firstDifference(a[k], b[k], tol, `${path}.${k}`);
    if (d) return d;
  }
  return null;
}

// A big typed array, boiled down to something worth reading in a diff.
export function summarise(arr, samples = 12) {
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const at = [];
  const stride = Math.max(1, Math.floor(arr.length / samples));
  for (let i = 0; i < arr.length && at.length < samples; i += stride) at.push(arr[i]);
  return { n: arr.length, sum, min: arr.length ? min : 0, max: arr.length ? max : 0, at };
}
