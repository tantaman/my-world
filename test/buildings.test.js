// The rules of building: footings to one level, logs held up at both ends,
// notches before anything rests on a crossing, rooms before roofs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Buildings } from '../src/build/buildings.js';
import { Solids } from '../src/build/solids.js';
import { matchesGolden } from './helpers/golden.js';

const scene = { add() {}, remove() {} };
const make = () => new Buildings({ scene, solids: new Solids(), material: null });

// A 4 × 3 m cabin on level ground, built the way you would by hand.
function raiseCabin(B, courses = 6) {
  const said = [];
  const ground = 2;
  for (const [x, z] of [[0, 0], [4, 0], [0, 3], [4, 3]]) assert.ok(B.addFooting(x, z, ground), `footing at ${x},${z}`);
  const b = B.list[0];
  const walls = [['x', 0, 0, 4], ['x', 3, 0, 4], ['z', 0, 0, 3], ['z', 4, 0, 3]];
  for (let c = 0; c < courses; c++) {
    for (const [axis, line, s0, s1] of walls) {
      const L = B.addLog(b, c % 2 ? 'timber' : 'log', axis, line, s0, s1);
      assert.ok(L, `course ${c} ${axis}@${line}: ${B.logCandidate(b, axis, line, s0, s1).reason}`);
      for (const n of [...L.below]) B.notch(b, L, n);
      assert.ok(L.seated);
    }
    said.push(B.roofCandidate(b, 2, 1.5).reason || 'ready for a roof');
  }
  return { b, said };
}

test('a cabin goes up course by course, and says what it still needs', () => {
  const B = make();
  const { b, said } = raiseCabin(B);
  const c = B.roofCandidate(b, 2, 1.5);
  assert.ok(c.ok, c.reason);
  B.addRoof(b, c.roof);
  matchesGolden('cabin', { said, cost: c.cost, rooms: b.rooms.map((r) => [r.x0, r.z0, r.x1, r.z1, r.rect, r.area]), saved: B.serialize() }, { tolerance: 1e-9 });
});

test('what is built can be saved and put up again', () => {
  const A = make();
  const { b } = raiseCabin(A);
  A.addRoof(b, A.roofCandidate(b, 2, 1.5).roof);
  const saved = JSON.parse(JSON.stringify(A.serialize()));
  const B = make();
  B.load(saved);
  assert.deepEqual(B.serialize(), saved);
  assert.equal(B.list[0].rooms.length, 1);
  B.adopt(saved); // someone else's copy of the same thing
  assert.deepEqual(B.serialize(), saved);
  assert.equal(B.list.length, 1);
});

test('the rules say no, and why', () => {
  const B = make();
  B.addFooting(0, 0, 2);
  const b = B.list[0];
  assert.match(B.footingCandidate(0, 0, 2).reason, /already/);
  assert.match(B.footingCandidate(4, 0, 2.5).reason, /too high/);
  assert.match(B.footingCandidate(4, 0, 1.5).reason, /too low/);
  assert.match(B.logCandidate(b, 'x', 0, 0, 4).reason, /both ends need a footing/);
  B.addFooting(4, 0, 2);
  B.addFooting(0, 3, 2);
  B.addFooting(4, 3, 2);
  assert.match(B.logCandidate(b, 'x', 0, 0, 12).reason, /longer than the longest log/);
  const sill = B.addLog(b, 'log', 'x', 0, 0, 4);
  B.addLog(b, 'log', 'x', 3, 0, 4);
  assert.match(B.canRemoveFooting(b, b.footings.get('0,0')), /sill log/);
  const cross = B.addLog(b, 'log', 'z', 0, 0, 3);
  assert.equal(cross.seated, false, 'a crossing log rides high until it is notched');
  assert.match(B.logCandidate(b, 'x', 0, 0, 4).reason, /needs notching/);
  assert.match(B.canRemoveLog(b, sill), /crosses on top/);
  assert.equal(B.notch(b, cross, 0), false);
  assert.equal(B.notch(b, cross, 3), true, 'the last notch seats it');
  assert.equal(B.canRemoveLog(b, cross), null);
  assert.match(B.roofCandidate(b, 2, 1.5).reason, /room/);
});

test('walls and footings are things you bump into', () => {
  const solids = new Solids();
  const B = new Buildings({ scene, solids, material: null });
  raiseCabin(B, 2);
  let n = 0;
  solids.forEachNear(2, 0, 1, () => n++);
  assert.ok(n > 0);
  B.adopt([]);
  n = 0;
  solids.forEachNear(2, 0, 1, () => n++);
  assert.equal(n, 0, 'and they go when the building does');
});
