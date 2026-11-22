// The hikers you can be (src/player/hikers.js): how big each is, that each
// walks without the feet skating however small, that sitting puts the hips
// on the seat whoever sits, that what is held, worn and carried stays on
// when someone else is dressed, and that the others here see who you are.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Character, SEAT_HIPS } from '../src/player/character.js';
import { HIKERS, hiker } from '../src/player/hikers.js';
import { Peers } from '../src/player/peers.js';

const DT = 1 / 60;
const _v = new THREE.Vector3();

// How tall someone stands, after a moment standing still (m).
function height(ch) {
  for (let i = 0; i < 120; i++) ch.update(DT, 0, true, 0, 0);
  return new THREE.Box3().setFromObject(ch.root, true).max.y - ch.root.position.y;
}

test('the hikers: each with an id the save server will pass on, a name and a size', () => {
  const ids = HIKERS.map((h) => h.id);
  assert.equal(new Set(ids).size, ids.length, `ids are different (${ids.join(', ')})`);
  // (worker/world.js passes an id on only if it looks like this)
  for (const h of HIKERS) {
    assert.match(h.id, /^[a-z][a-z0-9-]{0,23}$/, `${h.id} is a short word`);
    assert.ok(h.name, `${h.id} has a name`);
    assert.ok(h.size > 0.3 && h.size <= 1.2, `${h.id} is ${h.size} the grown-up's size`);
  }
  assert.equal(hiker('oliver').name, 'Oliver');
  assert.equal(hiker('somebody-newer'), HIKERS[0], 'someone this build has never heard of is the first');
  assert.equal(hiker(undefined), HIKERS[0]);
});

test('the hiker is a grown-up and Oliver a five-year-old', () => {
  const grown = height(new Character());
  const oliver = height(new Character(hiker('oliver')));
  assert.ok(grown > 1.72 && grown < 1.88, `the hiker stands ${grown.toFixed(2)} m`);
  assert.ok(oliver > 1.1 && oliver < 1.24, `Oliver stands ${oliver.toFixed(2)} m`);
});

// Walking along +z at `speed`, how far a planted foot slides over the ground
// while it is flat on it, as a share of how far the body went meanwhile.
function skid(ch, speed) {
  ch.groundAt = () => 0;
  let worst = 0;
  const was = { L: null, R: null };
  for (let i = 0; i < 360; i++) {
    ch.root.position.z += speed * DT;
    ch.update(DT, speed, true, 0, 0);
    if (i < 180) continue; // up to speed
    ch.root.updateMatrixWorld(true);
    for (const [k, F, leg] of [['L', ch.footL, ch.legL], ['R', ch.footR, ch.legR]]) {
      const flat = F.load === 1 && F.p === 0;
      const z = leg.ankle.getWorldPosition(_v).z;
      if (flat && was[k] !== null) worst = Math.max(worst, Math.abs(z - was[k]) / (speed * DT));
      was[k] = flat ? z : null;
    }
  }
  return worst;
}

test('however small, a planted foot stays put walking and running', () => {
  for (const h of HIKERS) {
    for (const speed of [1.4, 2.2, 7.5]) {
      const s = skid(new Character(h), speed);
      assert.ok(s < 0.05, `${h.id} at ${speed} m/s: a planted foot slides ${(s * 100).toFixed(1)}% of the way the body goes`);
    }
  }
});

test('someone smaller takes quicker steps', () => {
  const steps = (ch) => {
    let n = 0;
    ch.onFootstep = () => n++;
    for (let i = 0; i < 300; i++) ch.update(DT, 2.2, true, 0, 0);
    return n;
  };
  const grown = steps(new Character());
  const oliver = steps(new Character(hiker('oliver')));
  assert.ok(oliver > grown * 1.15, `${oliver} steps to the hiker's ${grown} in five seconds`);
});

test('sat on something, the hips are on the seat whoever sits there', () => {
  for (const h of HIKERS) {
    const ch = new Character(h);
    ch.root.position.set(3, 10, -2);
    ch.seat({ spread: 0.25, hang: 0.55, fwd: 0.1, lean: 0.1 });
    for (let i = 0; i < 120; i++) ch.update(DT, 0, true, 0, 0);
    ch.root.updateMatrixWorld(true);
    const hips = ch.hips.getWorldPosition(_v).y - 10;
    assert.ok(Math.abs(hips - SEAT_HIPS) < 0.01, `${h.id}'s hips ${hips.toFixed(3)} m over the root`);
  }
});

test('dressed as someone else, what is held, worn and carried stays on, and a strap round the head is fitted', () => {
  const ch = new Character();
  const axe = new THREE.Object3D();
  const radio = new THREE.Object3D();
  const clipped = new THREE.Object3D();
  const lamp = new THREE.Object3D();
  const strap = new THREE.Object3D();
  const jets = new THREE.Object3D();
  const skis = [new THREE.Object3D(), new THREE.Object3D()];
  ch.addHeld('axe', axe);
  ch.addRaised('radio', radio, { stowed: clipped });
  ch.addWorn(lamp, { band: strap });
  ch.addOnBack(jets);
  ch.stance({ shod: skis });
  ch.setTool('axe');
  const first = [...ch.resources];
  let gone = 0;
  for (const r of first) r.addEventListener?.('dispose', () => gone++);
  const crown = { ...ch.cap.crown };

  ch.dress(hiker('oliver'));
  assert.equal(ch.size, hiker('oliver').size);
  assert.equal(gone, first.filter((r) => r.addEventListener).length, 'his clothes were put away');
  assert.ok(first.every((r) => !ch.resources.has(r)), "and none of them are Oliver's");
  for (const [o, what] of [[axe, 'the axe'], [radio, 'the radio'], [clipped, 'the radio clipped on'], [lamp, 'the lamp'], [strap, 'its strap'], [jets, 'the jetpack'], [skis[0], 'a ski']]) {
    let attached = false;
    for (let p = o.parent; p; p = p.parent) if (p === ch.root) attached = true;
    assert.ok(attached, `${what} still on`);
  }
  assert.equal(lamp.parent, ch.cap.brow);
  assert.equal(ch.tool, 'axe', 'still in hand');
  // the strap's holder takes the old crown to the new one
  const holder = ch.worn[0].holder;
  const c = ch.cap.crown;
  _v.set(crown.rx, crown.y, crown.z).multiply(holder.scale).add(holder.position);
  assert.ok(Math.abs(_v.x - c.rx) < 1e-9 && Math.abs(_v.y - c.y) < 1e-9 && Math.abs(_v.z - c.z) < 1e-9, 'the strap fits round his head');

  ch.dress(hiker('hiker'));
  assert.equal(ch.size, 1);
  assert.ok(Math.abs(holder.scale.x - 1) < 1e-9 && holder.position.length() < 1e-9, 'and back round the cap');
  for (let i = 0; i < 30; i++) ch.update(DT, 2, true, 0, 0);
  ch.dispose();
  assert.equal(ch.resources.size, 0);
});

test('the others here are seen as whoever they say they are', () => {
  const scene = new THREE.Scene();
  const sizes = [];
  const peers = new Peers(scene, (x, z, y, size) => {
    sizes.push(size);
    return 0;
  });
  peers.at({ id: 'p1', x: 0, z: 0, yaw: 0, name: 'Oliver', colour: '#4f8fd6', who: 'oliver' });
  const p = peers.get('p1');
  assert.equal(p.character.who.id, 'oliver');
  peers.update(DT);
  assert.ok(sizes.length && sizes.every((s) => s === hiker('oliver').size), 'stood on the ground as someone his size');
  assert.ok(p.flag.position.y < 2, `his pennant over his own head (${p.flag.position.y.toFixed(2)} m)`);
  peers.at({ id: 'p1', x: 1, z: 0, yaw: 0 });
  assert.equal(p.character.who.id, 'oliver', 'saying nothing about it changes nothing');
  peers.at({ id: 'p1', x: 1, z: 0, yaw: 0, who: 'hiker' });
  assert.equal(p.character.who.id, 'hiker', 'and changing, they are seen to');
  peers.at({ id: 'p2', x: 5, z: 0, yaw: 0, who: '' });
  assert.equal(peers.get('p2').character.who, HIKERS[0], 'someone who never said is the first');
  peers.clear();
});
