// The people who aren't hikers, on the hikers' body (src/people/folk.js):
// everyone a town grows can be dressed, the same way every time from the
// same seed; grown-ups have eyes that turn to look at you; they wave with the
// right hand up; and being stood up a little at a time comes out the same
// as all at once.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Folk, growFolk, whoOf } from '../src/people/folk.js';
import { lookOf } from '../src/people/body.js';
import { mulberry32 } from '../src/noise.js';

const DT = 1 / 60;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

// Everyone of a style, as a town grows them, until each kind has been seen.
function looks(style, n = 30) {
  const rnd = mulberry32(7);
  return Array.from({ length: n }, () => lookOf(style, rnd));
}

function drawn(root) {
  let tris = 0;
  let finite = true;
  root.traverse((o) => {
    if (!o.isMesh || o.layers.mask !== 1) return;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    for (const v of g.attributes.position.array) if (!Number.isFinite(v)) finite = false;
  });
  return { tris, finite };
}

test('everyone a town grows can be dressed', () => {
  const kinds = new Set();
  for (const style of ['western', 'village', 'creepy']) {
    looks(style).forEach((look, i) => {
      const folk = new Folk(look, i);
      kinds.add(`${look.child ? 'child' : look.her ? 'her' : 'him'}:${look.hat}`);
      for (let k = 0; k < 30; k++) folk.pose(DT, 1.3, null);
      const { tris, finite } = drawn(folk.mesh);
      assert.ok(finite, `${style} ${i}: nothing out of place`);
      assert.ok(tris > 10000, `${style} ${i}: made of something (${tris} triangles)`);
      folk.dispose();
    });
  }
  for (const k of ['him:cowboy', 'him:none', 'her:bonnet', 'her:none', 'child:none']) assert.ok(kinds.has(k), `among them ${k}`);
});

test('the same seed dresses the same person', () => {
  const [look] = looks('western', 1);
  const a = whoOf(look, 42);
  const b = whoOf(look, 42);
  assert.deepEqual(JSON.parse(JSON.stringify(a.face)), JSON.parse(JSON.stringify(b.face)));
  const c = whoOf(look, 43);
  assert.notDeepEqual(JSON.parse(JSON.stringify(a.face.skull)), JSON.parse(JSON.stringify(c.face.skull)), 'and another, another face');
});

test('grown-ups look at you, the eyes first', () => {
  const look = looks('village').find((l) => !l.child);
  const folk = new Folk(look, 3);
  assert.ok(folk.gaze, 'they have eyes');
  for (let k = 0; k < 5; k++) folk.pose(DT, 0, 0.9);
  assert.ok(folk.gaze.x > 0.2 && folk.headYaw < 0.3, `the eyes turn first (${folk.gaze.x.toFixed(2)}, the head ${folk.headYaw.toFixed(2)})`);
  for (let k = 0; k < 120; k++) folk.pose(DT, 0, 0.9);
  assert.ok(folk.headYaw > 0.8, `then the head (${folk.headYaw.toFixed(2)})`);
  assert.ok(Math.abs(folk.gaze.x) < 0.1, 'and the eyes come back to the middle');
  folk.dispose();
});

test('a wave puts the right hand up over the shoulder', () => {
  const look = looks('western').find((l) => !l.child);
  const folk = new Folk(look, 5);
  for (let k = 0; k < 30; k++) folk.pose(DT, 0, null);
  const c = folk.character;
  const hand = () => {
    folk.mesh.updateMatrixWorld(true);
    return c.hand.getWorldPosition(_v).y - c.armR.shoulder.getWorldPosition(_w).y;
  };
  assert.ok(hand() < -0.4, 'hanging at the side');
  folk.waving = 1.8;
  for (let k = 0; k < 40; k++) folk.pose(DT, 0, 0);
  assert.ok(hand() > 0.1, `up (${hand().toFixed(2)} m over the shoulder)`);
  for (let k = 0; k < 120; k++) folk.pose(DT, 0, 0);
  assert.ok(hand() < -0.4, 'and down again');
  folk.dispose();
});

test('stood up a little at a time, as all at once', () => {
  const look = looks('western').find((l) => !l.child && !l.her);
  const steps = growFolk(look, 9);
  let n = 0;
  let r = steps.next();
  while (!r.done) {
    n++;
    r = steps.next();
  }
  assert.ok(n > 10, `in steps (${n})`);
  const whole = new Folk(look, 9);
  assert.equal(drawn(r.value.mesh).tris, drawn(whole.mesh).tris, 'the same person');
  r.value.dispose();
  whole.dispose();
});
