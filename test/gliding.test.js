// Gliding: how the hang glider flies, from what you do with the bar, and how
// it comes down; and the eagle you let go of, which flies off to wait for
// you, and comes and catches you if you whistle while you're still up there.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Glider, sinkAt, SPEED, OPEN_TIME, MAX_BANK } from '../src/gliding/glider.js';
import { Gliders } from '../src/gliding/others.js';
import { HANG } from '../src/gliding/pilot.js';
import { Character } from '../src/player/character.js';
import { Mount } from '../src/mounts/mount.js';
import { MOUNTS } from '../src/mounts/kinds.js';

const DT = 1 / 60;
const flat = (more = {}) => ({ ground: () => 0, surface: () => -Infinity, hit: () => null, ...more });
const hands = (steer = 0, bar = 0, full = false) => ({ steer, bar, full });

// Let go at (0, y, 0) going north at the eagle's cruise, and fly with
// controls c (or c(glider, t)) until down, or for `most` seconds.
function fly(world, y, c, { most = 300, v = 13 } = {}) {
  const g = new Glider(world);
  const said = { open: null, down: null };
  g.on('open', () => (said.open = t));
  g.on('down', (d) => (said.down = d));
  g.launch(0, y, 0, 0, 0, v, 0);
  let t = 0;
  let lowest = y; // the lowest it got while the sail filled
  while (!said.down && t < most) {
    g.step(DT, typeof c === 'function' ? c(g, t) : c);
    t += DT;
    if (t < OPEN_TIME + 0.5) lowest = Math.min(lowest, g.y);
  }
  return { g, t, said, lowest, far: Math.hypot(g.x, g.z) };
}

test('its polar: least sink at about its best speed, and about ten to one at best', () => {
  let least = Infinity;
  let at = 0;
  let best = 0;
  for (let v = 6; v <= 25; v += 0.25) {
    if (sinkAt(v) < least) {
      least = sinkAt(v);
      at = v;
    }
    best = Math.max(best, v / sinkAt(v));
  }
  assert.ok(at >= 9 && at <= 11, `least sink at ${at} m/s`);
  assert.ok(least > 0.8 && least < 1.2, `${least} m/s`);
  assert.ok(best > 9 && best < 12, `best glide ${best.toFixed(1)} to 1`);
  assert.ok(sinkAt(SPEED.full) > 3 * least, 'flat out it comes down fast');
  assert.ok(sinkAt(SPEED.slow) > least, 'and slow, it sinks more than at its best');
});

test('let go up high: you drop while the sail fills, then it takes you and you glide a long way down', () => {
  const { g, said, lowest, far, t } = fly(flat(), 60, hands());
  assert.ok(said.open !== null && Math.abs(said.open - OPEN_TIME) < 0.05, `the sail fills in ${said.open?.toFixed(2)} s`);
  assert.ok(lowest < 59 && lowest > 52, `you drop a little first (to ${lowest.toFixed(1)} m)`);
  assert.equal(said.down.how, 'feet', 'and come in to land on your feet');
  assert.ok(far > 450 && far < 800, `a long glide (${far.toFixed(0)} m from 60 m)`);
  assert.ok(t > 40, `taking a while (${t.toFixed(0)} s)`);
  assert.ok(said.down.speed < SPEED.trim, 'coming in slowly: pushed out to land');
  assert.equal(g.upright, 1, 'upright to land');
});

test('the bar: pulled in it goes faster and comes down sooner, pushed out slower', () => {
  const trim = fly(flat(), 60, hands());
  const fast = fly(flat(), 60, (g) => hands(0, g.height > 8 ? 1 : 0));
  const dive = fly(flat(), 60, (g) => hands(0, 0, g.height > 8));
  const slow = fly(flat(), 60, hands(0, -1));
  assert.ok(fast.t < trim.t && dive.t < fast.t, `down sooner: ${trim.t.toFixed(0)}, ${fast.t.toFixed(0)}, ${dive.t.toFixed(0)} s`);
  assert.ok(slow.far < trim.far, 'slow, it covers less ground than trimmed');
  assert.ok(Math.abs(slow.g.speed - SPEED.slow) < 0.5, 'and goes as slow as pushed out');
  // and it does go fast while it's pulled in
  const g = new Glider(flat());
  g.launch(0, 200, 0, 0, 0, 11, 0);
  for (let t = 0; t < 8; t += DT) g.step(DT, hands(0, 0, true));
  assert.ok(g.speed > SPEED.full - 1, `diving at ${g.speed.toFixed(1)} m/s`);
  assert.ok(-g.vy > 3, 'coming down fast');
  // pulling out of the dive gives some height back
  const y = g.y;
  let top = y;
  for (let t = 0; t < 3; t += DT) {
    g.step(DT, hands(0, -1));
    top = Math.max(top, g.y);
  }
  assert.ok(top > y + 2, `a zoom: up ${(top - y).toFixed(1)} m`);
});

test('banked, it turns, more tightly the slower it goes, and sinks faster', () => {
  const turned = (bar) => {
    const g = new Glider(flat());
    g.launch(0, 300, 0, 0, 0, 11, 0);
    for (let t = 0; t < 3; t += DT) g.step(DT, hands(0, bar)); // settled into flight
    const h = g.heading;
    let sink = 0;
    for (let t = 0; t < 2; t += DT) {
      g.step(DT, hands(1, bar));
      sink = -g.vy;
    }
    return { by: h - g.heading, sink, bank: g.bank };
  };
  const trim = turned(0);
  const fast = turned(1);
  assert.ok(trim.by > 0.6, `D turns it right (${trim.by.toFixed(2)} rad in 2 s)`);
  assert.ok(trim.bank > MAX_BANK * 0.8, 'banked over');
  assert.ok(fast.by < trim.by, 'faster, a wider turn');
  assert.ok(trim.sink > sinkAt(SPEED.trim) * 1.2, `sinking faster in the bank (${trim.sink.toFixed(2)} m/s)`);
  // and while the sail is still filling it doesn't bank at all
  const g = new Glider(flat());
  g.launch(0, 300, 0, 0, 0, 11, 0);
  g.step(DT, hands(1));
  assert.ok(Math.abs(g.bank) < 0.01);
});

test('flat out into the ground you come down hard', () => {
  const { said } = fly(flat(), 60, hands(0, 0, true));
  assert.equal(said.down.how, 'hard');
  assert.ok(said.down.speed > 16);
});

test('low into the trees, that is where you come down; over the top of them you fly on', () => {
  // a wood from 80 m on, its trees 10 m tall
  const wood = flat({ hit: (x, y, z) => (z > 80 && y < 10 ? { nx: 0, nz: -1, depth: 0.1, what: 'a tree' } : null) });
  const low = fly(wood, 20, hands());
  assert.equal(low.said.down.how, 'a tree');
  assert.ok(low.g.z > 80 && low.g.z < 200, 'at the edge of the wood');
  assert.deepEqual([low.said.down.nx, low.said.down.nz], [0, -1], 'with the way out from it');
  const high = fly(wood, 60, hands(), { most: 20 });
  assert.equal(high.said.down, null, 'from high up, over the top');
  assert.ok(high.g.z > 200);
});

test('down into a lake is coming down in the water; into a puddle, on your feet', () => {
  const lake = fly(flat({ surface: (x, z) => (z > 100 ? 1.5 : -Infinity) }), 20, hands());
  assert.equal(lake.said.down.how, 'water');
  assert.ok(Math.abs(lake.g.y - 1.5) < 1e-6, 'at the surface');
  const puddle = fly(flat({ surface: () => 0.1 }), 20, hands());
  assert.equal(puddle.said.down.how, 'feet');
});

test('onto a hillside: down where the slope comes up to meet you', () => {
  const hill = flat({ ground: (x, z) => Math.max(0, (z - 100) * 0.2) });
  const { g, said } = fly(hill, 40, hands());
  assert.equal(said.down.how, 'feet');
  assert.ok(Math.abs(g.y - Math.max(0, (g.z - 100) * 0.2)) < 1e-6, 'standing on it');
  assert.ok(g.z > 100, 'up on the slope');
});

// ── The eagle ───────────────────────────────────────────────────────────────

// A world as flat as a table, for an eagle to fly over.
const ctx = {
  ground: () => 0,
  stand: () => 0,
  water: () => 0,
  pushOut() {},
  inView: () => false,
  place: () => null,
  waterNear: () => null,
};
function eagle(x = 0, z = 0) {
  const m = new Mount({ kind: 'eagle', def: MOUNTS.eagle, haunt: { x, z, r: 20 }, Body: null });
  m.tame = true;
  m.taming.trust = 1;
  m.settle(ctx);
  m.rest();
  return m;
}
const you = (g) => ({ x: g.x, y: g.y, z: g.z, d: 0, speed: g.speed, holding: false, vx: Math.sin(g.heading) * g.speed, vy: g.vy, vz: Math.cos(g.heading) * g.speed, air: !g.down });

test('let go of in the air, the eagle flies on and comes down to wait where it was sent', () => {
  const m = eagle();
  m.x = 0;
  m.y = 60;
  m.z = 0;
  m.letGo({ x: 40, z: 120 }, 0, 0, 13);
  assert.equal(m.mode, 'land');
  let t = 0;
  for (; t < 60 && m.mode === 'land'; t += DT) m.update(DT, ctx, { x: 0, y: 30, z: 60, d: 100, speed: 11, holding: false, vx: 0, vy: -1, vz: 11, air: true });
  assert.equal(m.mode, 'perch', `down in ${t.toFixed(0)} s`);
  assert.ok(Math.hypot(m.x - 40, m.z - 120) < 2, 'where it was sent');
  assert.equal(m.y, 0, 'on the ground');
  assert.ok(Math.hypot(m.home.x - 40, m.home.z - 120) < 2, 'and it waits there');
});

test('whistled for while you glide, the eagle catches you up there', () => {
  for (const [label, from] of [['from behind', { x: 0, z: -80 }], ['from ahead', { x: 30, z: 150 }], ['from far off to the side', { x: 200, z: 20 }]]) {
    const g = new Glider(flat());
    g.launch(0, 70, 0, 0, 0, 11, 0);
    for (let t = 0; t < 2; t += DT) g.step(DT, hands());
    const m = eagle(from.x, from.z);
    m.catch();
    let t = 0;
    for (; t < 40 && !m.caught; t += DT) {
      g.step(DT, hands(0.3)); // (turning gently, to make it work for it)
      m.update(DT, ctx, you(g));
    }
    assert.ok(m.caught, `${label}: it catches you (in ${t.toFixed(1)} s)`);
    assert.ok(t < 25, `${label}: soon enough (${t.toFixed(1)} s)`);
    assert.ok(!g.down, `${label}: before you're down`);
    assert.ok(Math.abs(g.y - 1 - m.y) < 2.5, `${label}: under you`);
    const v = you(g);
    assert.ok(Math.hypot(m.vx - v.vx, m.vz - v.vz) < 6, `${label}: going about as you go`);
  }
});

test('if you come down before it reaches you, it comes to you on the ground instead', () => {
  const m = eagle(0, -200);
  m.catch();
  m.update(DT, ctx, { x: 0, y: 0, z: 0, d: 200, speed: 0, holding: false, vx: 0, vy: 0, vz: 0, air: false });
  assert.equal(m.mode, 'come');
});

// ── Other people ────────────────────────────────────────────────────────────

test('someone else gliding over: their glider as high as they said, them hanging under it, and gone once they are down', () => {
  const scene = new THREE.Scene();
  const character = new Character();
  const flag = new THREE.Object3D();
  const someone = { id: 'p1', character, flag, pos: new THREE.Vector3(10, 0, 20), yaw: 0.5 };
  const peers = { get: (id) => (id === someone.id ? someone : null) };
  const gliders = new Gliders({ scene, peers });
  const before = scene.children.length;
  gliders.hear('p1', { y: 40, bank: 0.3, open: 1, upright: 0 });
  for (let i = 0; i < 120; i++) {
    character.update(1 / 60, 0, true, 0, 0);
    gliders.update(1 / 60);
  }
  assert.equal(scene.children.length, before + 1, 'their glider');
  const wing = scene.children.at(-1);
  assert.ok(Math.abs(wing.position.y - (40 + HANG)) < 0.01, 'as high as they said');
  assert.ok(Math.abs(wing.rotation.z - 0.3) < 0.01, 'banked as they bank');
  assert.ok(character.hung, 'they hang from it');
  assert.ok(character.root.rotation.x > 1.2, 'lying flat');
  assert.ok(flag.position.y > 40, 'their pennant up there with them');
  gliders.hear('p1', null);
  assert.equal(scene.children.length, before, 'down: the glider is gone');
  assert.equal(character.hung, null);
  assert.equal(character.root.rotation.order, 'YXZ');
  assert.equal(character.root.rotation.x, 0, 'standing straight again');
});
