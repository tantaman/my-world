// Golden files: a recorded answer the code has to keep giving.
//
//   UPDATE_GOLDEN=1 npm test     record what the code does now
//
// Only re-record on purpose. These pin things other people's saved worlds
// depend on — the shape of the land a seed grows, and how a save is spelled.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const fileFor = (name) => new URL(`../golden/${name}.json`, import.meta.url);

// Numbers are compared to within `tolerance` (relative, for big ones) so a
// last-bit difference in Math.sin between engines isn't a failure.
export function matchesGolden(name, actual, { tolerance = 0 } = {}) {
  const file = fileFor(name);
  const plain = JSON.parse(JSON.stringify(actual));
  if (process.env.UPDATE_GOLDEN) {
    writeFileSync(file, `${JSON.stringify(plain, null, 1)}\n`);
    return;
  }
  assert.ok(existsSync(file), `no golden file for "${name}": run UPDATE_GOLDEN=1 npm test`);
  const expected = JSON.parse(readFileSync(file, 'utf8'));
  const where = firstDifference(expected, plain, tolerance, name);
  assert.equal(where, null, where || '');
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
