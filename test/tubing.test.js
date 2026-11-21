// Tubing: how an inner tube goes down a river (carried by the current, kept
// off the banks, across a lake to where it drains, knocked off boulders, down
// a step, aground in the shallows, paddled by hand); how the course of the
// forest's own water is read for it (where a lake drains, how far a river
// runs, the nearest one to float down); and other people sat in theirs.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Tube, TUBE, PADDLE } from '../src/tubing/tube.js';
import { Course, FLOAT_ACC, along } from '../src/tubing/course.js';
import { Tubers } from '../src/tubing/others.js';
import { Character } from '../src/player/character.js';
import { growWorld } from '../src/world/lands.js';

const DT = 1 / 30;
const still = { x: 0, z: 0 };

// A straight channel down +z, `half` m either side of x = 0, deepest in the
// middle, the current running down it at `flow` m/s.
function channel({ half = 3, deep = 1.2, flow = 0.6, level = (x, z) => 0, foam = 0 } = {}) {
  return {
    water(x, z, out) {
      if (Math.abs(x) > half + 1) return false;
      const t = Math.min(1, Math.abs(x) / half);
      out.level = level(x, z);
      out.depth = deep * (1 - t * t) - (Math.abs(x) > half ? 0.3 : 0);
      out.flowX = 0;
      out.flowZ = out.depth > 0 ? flow : 0;
      out.foam = foam;
      return true;
    },
    drain: () => null,
    hit: () => false,
  };
}

// A round lake of radius R at the origin, draining towards `to` (or nowhere).
function lake({ R = 30, deep = 3, to = null } = {}) {
  return {
    water(x, z, out) {
      const r = Math.hypot(x, z);
      if (r > R + 2) return false;
      out.level = 0;
      out.depth = deep * (1 - (r / R) ** 2);
      out.flowX = out.flowZ = out.foam = 0;
      return true;
    },
    drain: () => to,
    hit: () => false,
  };
}

function float(world, secs, c = still, at = [0, 0, 0], seed = 3) {
  const t = new Tube(world, seed);
  t.launch(...at);
  const said = [];
  for (const e of ['bump', 'drop', 'ground', 'afloat']) t.on(e, (...a) => said.push([e, ...a]));
  let shallowest = Infinity;
  for (let s = 0; s < secs; s += DT) {
    t.step(DT, c);
    shallowest = Math.min(shallowest, t.depth);
  }
  return { t, said, shallowest };
}

test('the current carries it down the river at the current’s own speed', () => {
  const { t } = float(channel({ flow: 0.6 }), 60);
  assert.ok(t.z > 30 && t.z < 37, `${t.z.toFixed(1)} m down in a minute at 0.6 m/s`);
  assert.ok(Math.abs(t.speed - 0.6) < 0.05, `going at ${t.speed.toFixed(2)} m/s`);
  assert.ok(!t.still && !t.end && !t.aground);
});

test('it keeps off the shallows by the bank, out in the deep water', () => {
  const w = channel({ half: 3 });
  const { t, shallowest } = float(w, 60, still, [2.4, 0, 0]);
  assert.ok(t.depthAt(t.x, t.z) > 0.8, `out where it's deep (x ${t.x.toFixed(2)}, ${t.depthAt(t.x, t.z).toFixed(2)} m)`);
  assert.ok(shallowest >= TUBE.aground, 'never aground on the way');
});

test('round a bend it isn’t carried up onto the outside bank, but goes on round', () => {
  // a channel bending round in a circle of radius 20 m, the current
  // following it at 1.2 m/s
  const R = 20;
  const half = 3;
  const w = {
    water(x, z, out) {
      const r = Math.hypot(x, z);
      const off = Math.abs(r - R);
      if (off > half + 1) return false;
      const t = Math.min(1, off / half);
      out.level = 0;
      out.depth = 1.2 * (1 - t * t) - (off > half ? 0.3 : 0);
      // anticlockwise, seen from above (+y): along (-z, x) / r
      out.flowX = out.depth > 0 ? (-z / r) * 1.2 : 0;
      out.flowZ = out.depth > 0 ? (x / r) * 1.2 : 0;
      out.foam = 0;
      return true;
    },
    drain: () => null,
    hit: () => false,
  };
  const t = new Tube(w, 2);
  t.launch(R, 0, 0);
  let turned = 0;
  let was = Math.atan2(t.z, t.x);
  let shallowest = Infinity;
  for (let s = 0; s < 60; s += DT) {
    t.step(DT, still);
    const a = Math.atan2(t.z, t.x);
    turned += Math.atan2(Math.sin(a - was), Math.cos(a - was));
    was = a;
    shallowest = Math.min(shallowest, t.depth);
  }
  assert.ok(shallowest >= TUBE.draft - 0.05, `kept off the outside bank (${shallowest.toFixed(2)} m at the shallowest)`);
  assert.ok(turned * R > 55, `and carried on round (${(turned * R).toFixed(0)} m)`);
});

test('across still water it drifts to where the lake drains, and where it doesn’t, stays', () => {
  const to = { x: 28, z: 0 };
  const { t } = float(lake({ to }), 120, still, [-20, 0, 0]);
  assert.ok(t.still && !t.end, 'on still water that drains');
  assert.ok(Math.hypot(t.x - to.x, t.z - to.z) < 4, `over to the way out (${t.x.toFixed(1)}, ${t.z.toFixed(1)})`);
  const kept = float(lake(), 30, still, [-20, 0, 0]).t;
  assert.ok(kept.end, 'a lake that keeps its water is the end');
  assert.ok(Math.hypot(kept.x + 20, kept.z) < 0.5, 'and there it stays');
});

test('your hands paddle it along, harder with shift, and turn it to face the way you paddle', () => {
  const easy = float(lake(), 20, { x: 1, z: 0 }, [-10, 0, Math.PI]).t;
  const hard = float(lake(), 20, { x: 1, z: 0, hard: true }, [-10, 0, Math.PI]).t;
  assert.ok(Math.abs(easy.speed - PADDLE.easy) < 0.05, `easy ${easy.speed.toFixed(2)} m/s`);
  assert.ok(Math.abs(hard.speed - PADDLE.hard) < 0.05, `hard ${hard.speed.toFixed(2)} m/s`);
  assert.ok(Math.abs(Math.atan2(Math.sin(easy.yaw - Math.PI / 2), Math.cos(easy.yaw - Math.PI / 2))) < 0.2, `facing along +x (yaw ${easy.yaw.toFixed(2)})`);
});

test('left to itself, it swings round to face the way it’s carried', () => {
  const { t } = float(channel(), 40, still, [0, 0, Math.PI / 2]);
  assert.ok(Math.abs(t.yaw) < 0.4, `facing down the river (yaw ${t.yaw.toFixed(2)})`);
});

test('a boulder in the way: it knocks against it, goes round, and on down', () => {
  const w = channel({ flow: 1.2 });
  w.hit = (x, z, r, out) => {
    const dx = x - 0.1;
    const dz = z - 10;
    const d = Math.hypot(dx, dz);
    if (d > r + 0.6) return false;
    out.nx = dx / d;
    out.nz = dz / d;
    out.depth = r + 0.6 - d;
    out.what = 'a boulder';
    return true;
  };
  const { t, said } = float(w, 30);
  const bump = said.find(([e]) => e === 'bump');
  assert.ok(bump, 'a knock');
  assert.equal(bump[2], 'a boulder');
  assert.ok(t.z > 20, `and on past it (${t.z.toFixed(1)} m)`);
});

test('down a step: it drops behind the water, slaps down, and bobs up', () => {
  // the level falls 0.45 m over a quarter of a metre at z = 10
  const level = (x, z) => -0.45 * Math.min(1, Math.max(0, (z - 10) / 0.25));
  const w = channel({ flow: 1.5, level });
  const t = new Tube(w, 1);
  t.launch(0, 0, 0);
  let drop = null;
  t.on('drop', (h) => (drop = h));
  let above = 0;
  let below = 0;
  for (let s = 0; s < 15; s += DT) {
    t.step(DT, still);
    above = Math.max(above, t.y - t.level);
    below = Math.min(below, t.y - t.level);
  }
  assert.ok(drop > 0.22 && drop <= 0.46, `told it dropped (${drop?.toFixed(2)} m)`);
  assert.ok(above > 0.05, `left in the air a moment (${above.toFixed(2)} m over)`);
  assert.ok(below < -0.02, `and pushed under as it lands (${below.toFixed(2)} m)`);
  assert.ok(Math.abs(t.y - t.level) < 0.01, 'then rides the surface again');
});

test('in the shallows it runs aground and drags, but hands push it off', () => {
  const w = channel({ deep: 0.1, flow: 0.6 });
  const { t, said } = float(w, 10);
  assert.ok(said.some(([e]) => e === 'ground'), 'aground');
  assert.ok(t.aground && t.speed < 0.25, `dragging (${t.speed.toFixed(2)} m/s)`);
  const pushed = float(w, 10, { x: 0, z: 1 }).t;
  assert.ok(pushed.speed > t.speed + 0.2, `hands push it along (${pushed.speed.toFixed(2)} m/s)`);
});

test('out of the water altogether, it stops', () => {
  const t = new Tube(channel(), 1);
  t.launch(10, 0, 0);
  t.step(DT, still);
  assert.ok(t.dry);
});

// ── The forest's own water ──────────────────────────────────────────────────

const gen = growWorld(20261119, [], 3);
const depthAt = (x, z) => {
  const h = gen.height(x, z);
  const w = gen.water;
  return w.region ? Math.max(0, w.level - h) : 0;
};
const course = new Course(gen.water, depthAt);
const net = gen.water.net;

test('the nearest river to float down: deep enough where you’d get in, and running on a good way', () => {
  const r = course.nearest(0, 0);
  assert.ok(r, 'there is one');
  assert.ok(depthAt(r.x, r.z) >= TUBE.draft, `deep enough there (${depthAt(r.x, r.z).toFixed(2)} m)`);
  assert.ok(r.far >= 150, `runs on ${Math.round(r.far)} m`);
  assert.ok(Math.abs(r.d - Math.hypot(r.x, r.z)) < 0.01);
  const at = course.at(r.x, r.z);
  // (read from there, it may be a lake the river runs into, from its middle)
  assert.ok(at && at.far <= r.far + 1 && at.far > r.far - 60, `and much the same is read from there (${at && Math.round(at.far)} m)`);
});

test('a lake the river runs through drains down its outflow; one at the end of it doesn’t', () => {
  // follow the river from the nearest spot down to where its water stops,
  // noting the lakes on the way
  const r = course.nearest(300, -200);
  let seg = null;
  for (const s of net.near(Math.floor(r.x / 96), Math.floor(r.z / 96)).segs) {
    const p = along(s, 0, { x: 0, z: 0 });
    if (s.acc0 >= FLOAT_ACC && (!seg || Math.hypot(p.x - r.x, p.z - r.z) < Math.hypot(along(seg, 0, { x: 0, z: 0 }).x - r.x, along(seg, 0, { x: 0, z: 0 }).z - r.z))) seg = s;
  }
  let n = seg.a;
  let through = null;
  for (let i = 0; i < 400 && net.next(n); i++) {
    if (!net.down(n) && net.basin(n) && !through) through = net.basin(n);
    n = net.next(n);
  }
  assert.ok(through, 'a lake on the way');
  const to = course.drain(through.x, through.z);
  const out = net.segment(through.node);
  const exit = along(out, out.sa, { x: 0, z: 0 });
  assert.ok(to && Math.hypot(to.x - through.x, to.z - through.z) > 1, 'from its middle, somewhere to drift to');
  // towards the way out: nearer it than the middle is
  assert.ok(Math.hypot(to.x - exit.x, to.z - exit.z) < Math.hypot(through.x - exit.x, through.z - exit.z), 'on the way out of it');
  // the end of the river: a hollow with no way on (or the sea)
  assert.equal(net.next(n), null);
  const end = course.run(seg.a);
  assert.equal(end.end, n.k, 'the run ends where the water stops');
  assert.ok(end.far > 300, `${Math.round(end.far)} m from the top`);
  const b = !net.isSea(n) && net.basin(n);
  if (b) assert.equal(course.drain(b.x, b.z), null, 'a lake at the end keeps its water');
  // ...and from there, another river is one whose water ends somewhere else
  const other = course.nearest(n.gx, n.gz, { not: end.end });
  assert.ok(other, 'another river');
  assert.notEqual(course.at(other.x, other.z).end, end.end);
});

test('a real river floated for a few minutes: on down it, never aground for long, the river left getting less', () => {
  const r = course.nearest(300, -200);
  const world = {
    water(x, z, out) {
      const h = gen.height(x, z);
      const w = gen.water;
      if (!w.region) return false;
      out.level = w.level;
      out.depth = w.level - h;
      out.flowX = w.flowX;
      out.flowZ = w.flowZ;
      out.foam = w.foam;
      return true;
    },
    drain: (x, z) => course.drain(x, z),
    hit: () => false,
  };
  const t = new Tube(world, 5);
  t.launch(r.x, r.z, 0);
  const left = course.at(r.x, r.z).far;
  let aground = 0;
  let far = 0;
  for (let s = 0; s < 180; s += 1 / 15) {
    const x = t.x;
    const z = t.z;
    t.step(1 / 15, still);
    far += Math.hypot(t.x - x, t.z - z);
    if (t.ground > 0.5) aground += 1 / 15;
    assert.ok(!t.dry, 'still in the water');
  }
  const now = course.at(t.x, t.z).far;
  assert.ok(far > 50, `${Math.round(far)} m floated in three minutes`);
  assert.ok(aground < 10, `aground for ${aground.toFixed(1)} s`);
  assert.ok(left - now > 40, `the river left went from ${Math.round(left)} to ${Math.round(now)} m`);
});

// ── Other people ────────────────────────────────────────────────────────────

test('someone else in a tube: theirs drawn under them on the water, and them sat in it', () => {
  const scene = new THREE.Scene();
  const ch = new Character();
  const flag = new THREE.Object3D();
  const peer = { id: 'p', character: ch, pos: new THREE.Vector3(5, 0, 7), yaw: 0.5, flag };
  const peers = { get: (id) => (id === 'p' ? peer : null) };
  const seat = { spread: 0.16, hang: 0.08, fwd: 0.72, lean: -0.42, rest: 1 };
  const tubers = new Tubers({ scene, peers, surface: () => 2, seat, sit: { sink: 0.14, back: 0.07 } });
  tubers.hear('p', { on: true });
  tubers.update();
  const tube = scene.children.find((o) => o.isMesh);
  assert.ok(tube, 'a tube');
  assert.deepEqual([tube.position.x, tube.position.y, tube.position.z], [5, 2, 7]);
  assert.equal(ch.seated, seat, 'sat in it');
  assert.ok(ch.root.position.y < 2 - 0.9, 'hips down in the hole');
  tubers.hear('p', { on: 'yes' });
  assert.equal(scene.children.filter((o) => o.isMesh).length, 0, 'and gone when they get out (or say nonsense)');
  assert.equal(ch.seated, null);
});

test('sat with the arms out over the sides, the hands are wide; reaching in a stroke, forward', () => {
  const ch = new Character();
  const hands = () => {
    ch.root.updateMatrixWorld(true);
    const l = ch.handL.getWorldPosition(new THREE.Vector3());
    const r = ch.hand.getWorldPosition(new THREE.Vector3());
    return { wide: l.distanceTo(r), ahead: (l.z + r.z) / 2 };
  };
  const seat = { spread: 0.16, hang: 0.08, fwd: 0.72, lean: -0.42, reins: 0 };
  ch.seat(seat);
  for (let i = 0; i < 60; i++) ch.update(DT, 0, true, 0, 0);
  const sat = hands();
  seat.rest = 1;
  for (let i = 0; i < 60; i++) ch.update(DT, 0, true, 0, 0);
  const rest = hands();
  assert.ok(rest.wide > sat.wide + 0.3, `arms out (${sat.wide.toFixed(2)} -> ${rest.wide.toFixed(2)} m apart)`);
  seat.stroke = 0;
  for (let i = 0; i < 30; i++) ch.update(DT, 0, true, 0, 0);
  const reach = hands();
  assert.ok(reach.ahead > rest.ahead + 0.05, `reaching forward (${rest.ahead.toFixed(2)} -> ${reach.ahead.toFixed(2)} m)`);
});
