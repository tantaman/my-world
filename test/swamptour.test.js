// The swamp tour (src/swamptour/): an airboat round a real bayou, and the
// alligators on the way. What's checked here: that the way round is on the
// water the real place has, and goes where the real tour went; that the boat
// slows to a stand where it means to; that a tidal country's water is all
// one, islands and all (tools/hike/build.js); and that a gator finds the
// water, lies in it or on the bank, and goes when it should.

import test from 'node:test';
import assert from 'node:assert/strict';
import { growWorld } from '../src/world/lands.js';
import { HIKES } from '../src/world/hikes.js';
import { loadHike } from '../src/world/landforms.js';
import { COUNTRY } from '../src/world/country.js';
import { TOURS, onCard } from '../src/swamptour/tours.js';
import { findRoute, Course, CLEAR, PACE } from '../src/swamptour/route.js';
import { buildAirboat, HULL } from '../src/swamptour/airboat.js';
import { buildLanding } from '../src/swamptour/landing.js';
import { gatorLine } from '../src/swamptour/guide.js';
import { tidalWater } from '../tools/hike/build.js';
import { localFrame } from '../src/core/geo.js';
import { localFrame as importersFrame } from '../tools/hike/geo.js';
import { SPECIES } from '../src/wildlife/species.js';
import { Gator, buildGator, waterNear, GATOR_LENGTH } from '../src/wildlife/gators.js';
import * as THREE from 'three';

const SEED = 20261119;

// The tour's real place, grown into a world, and its way round (once: it's
// the slow part).
const tour = TOURS[0];
const card = HIKES.find((h) => h.id === tour.hike);
const def = card && (await loadHike(card));
const gen = def && growWorld(SEED, [], 1, [def]);
const land = gen && gen.landforms.find((L) => L.id === tour.hike);
const shore = (x, z) => land.shore(x, z);
const stops = card && [[...onCard(card, tour.landing.lat, tour.landing.lon)], ...tour.by.map((b) => onCard(card, b.lat, b.lon))];
const route = land && findRoute(shore, [...stops, stops[0]], { cell: 1, clear: CLEAR });

test('the tour is on a real place in the bayou country', () => {
  assert.ok(card, `there is a hike called ${tour.hike}`);
  assert.equal(card.country, 'bayou');
  assert.equal(COUNTRY[card.country].tidal, true, 'where the tide sets the level');
  assert.ok(COUNTRY.bayou.animals.includes('alligator'), 'and alligators live there');
  // a real place's frame is the importer's frame
  const [a, b] = [localFrame(29.7, -90.1).toEN(29.71, -90.13), importersFrame(29.7, -90.1).toEN(29.71, -90.13)];
  assert.deepEqual(a, b);
});

test('the way round is on the water, from the landing past where the real boat went, and back', () => {
  assert.ok(route, 'there is a way round by water');
  const P = route.pts;
  for (let i = 0; i < P.length; i++) {
    // (the narrowest canal on the way is not much wider than the boat:
    // its middle is a quarter metre in from the bank at the least)
    assert.ok(shore(P[i][0], P[i][1]) < -0.25, `point ${i} of the way is in the water (${shore(P[i][0], P[i][1]).toFixed(2)} m)`);
    if (i) assert.ok(Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]) < 1.6, 'and the points are close together');
  }
  // it passes by each place, and starts and ends by the landing
  const nearest = ([x, z]) => Math.min(...P.map((p) => Math.hypot(p[0] - x, p[1] - z)));
  for (const [k, s] of stops.entries()) assert.ok(nearest(s) < 25, `it goes by stop ${k} (${nearest(s).toFixed(1)} m off)`);
  assert.ok(Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 3, 'and comes back where it set out');
  const C = new Course(route);
  assert.ok(C.length > 1500 && C.length < 4000, `a few kilometres round (${C.length.toFixed(0)} m)`);
});

test('the boat slows to a stand at its stops, and keeps to the pace the water allows', () => {
  const plain = new Course(route);
  const halts = [plain.length * 0.3, plain.length * 0.6];
  const C = new Course(route, halts);
  assert.equal(C.at(0).v, 0, 'it starts from a stand');
  assert.equal(C.at(C.length).v, 0, 'and ends at one');
  for (const h of halts) assert.ok(C.at(h).v < 0.01, `it stops at ${h.toFixed(0)} m`);
  for (let s = 0; s < C.length; s += 7) {
    const p = C.at(s);
    assert.ok(p.v <= PACE.open + 1e-6, 'never faster than open water allows');
    assert.ok(Number.isFinite(p.yaw) && Number.isFinite(p.x) && Number.isFinite(p.z));
  }
  // in the open it goes faster than in the narrows
  const fast = [];
  const slow = [];
  for (let s = 30; s < C.length - 30; s += 5) {
    const p = C.at(s);
    if (halts.some((h) => Math.abs(h - s) < 80)) continue;
    (p.clear > 8 ? fast : p.clear < 2 ? slow : []).push(p.v);
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(fast.length && slow.length && mean(fast) > mean(slow) * 1.5, `quicker on the open bayou (${mean(fast).toFixed(1)}) than in the canals (${mean(slow).toFixed(1)})`);
});

test('in tidal country the water is all one, at the level of the sea, islands and all', () => {
  // a square of water 100 m across with an island in it, and a canal line
  // out from it east; scale 1 : 5
  const s = 0.2;
  const toGame = ([lat, lon]) => [lon * s, lat * s];
  const fromGame = (x, z) => [z / s, x / s];
  const ring = (x0, z0, x1, z1) => [[z0, x0], [z0, x1], [z1, x1], [z1, x0], [z0, x0]];
  const areas = [{ name: 'Bayou Test', rings: [ring(-250, -250, 250, 250), ring(-80, -80, 80, 80)] }];
  const canals = [{ name: 'The Cut', points: [[0, 250], [0, 700]], width: 30 }];
  const t = tidalWater({ areas, canals, streams: [], toGame, fromGame, elevation: () => 1, R: 300, s, near: [-40, 0] });
  assert.ok(t, 'there is water');
  assert.equal(t.levelReal, 0, 'at the level of the sea');
  const at = (x, z) => {
    const f = t.own;
    const i = Math.round((x - f.x) / f.cell);
    const j = Math.round((z - f.z) / f.cell);
    return t.d[j * f.w + i];
  };
  assert.ok(at(0, 0) > 0, 'the island is land');
  assert.ok(at(-35, 0) < 0, 'the water round it is water');
  assert.ok(at(60, 0) < 0, 'and so is the canal');
  assert.ok(at(60, 20) > 0, 'but not past its banks');
  assert.equal(t.name, 'Bayou Test', 'named for the water nearest the photo');
  // the elevation data's channels under the sea join it, where they touch it
  const deep = (lat, lon) => (Math.abs(lon) < 20 && lat > 200 && lat < 450 ? -2 : 1);
  const t2 = tidalWater({ areas, canals: [], streams: [], toGame, fromGame, elevation: deep, R: 300, s });
  const f = t2.own;
  const at2 = (x, z) => t2.d[Math.round((z - f.z) / f.cell) * f.w + Math.round((x - f.x) / f.cell)];
  assert.ok(at2(0, 70) < 0, 'a channel the map left out is water, where it joins the rest');
  assert.ok(at2(20, 70) > 0, 'but not the land beside it');
  const lone = (lat, lon) => (Math.abs(lon) < 20 && lat > 600 && lat < 800 ? -2 : 1);
  const t3 = tidalWater({ areas, canals: [], streams: [], toGame, fromGame, elevation: lone, R: 300, s });
  assert.ok(t3.d[Math.round((140 - f.z) / f.cell) * f.w + Math.round((0 - f.x) / f.cell)] > 0, 'nor a hollow that joins nothing');
});

test('the airboat and the landing are built round their own origins', () => {
  const m = { paint: null, dark: null, metal: null, wood: null };
  const boat = buildAirboat(m);
  const box = new THREE.Box3().setFromObject(boat.object);
  assert.ok(box.max.z - box.min.z > HULL.len - 0.1 && box.max.z - box.min.z < HULL.len + 1.2, 'as long as an airboat');
  assert.ok(box.max.y > 2 && box.max.y < 3, 'with its propeller up behind the guide');
  assert.equal(boat.seats.length, 10, 'nine passengers and the guide');
  assert.ok(boat.seats[9].y > boat.seats[0].y + 1, "the guide's seat high over the front row");
  const at = { x: 1000, y: 2, z: 500, yaw: 0.7 };
  const L = buildLanding({ at, dock: { a: { x: 1000, z: 505 }, b: { x: 1000, z: 512 }, top: 2.5 }, ground: () => 2, name: 'Bayou Tours', materials: m });
  assert.ok(L.solids.length >= 3 && L.solids.every((s) => Number.isFinite(s.ax + s.az + s.bx + s.bz + s.r)), 'the dock, the shack and the pen are solid');
  assert.ok(L.gator.mesh, 'and there is a gator in the pen');
});

test('the guide says where a gator is, and how big, in feet', () => {
  assert.match(gatorLine({ L: 3.5, pose: 'bask' }, 'left', 0), /on your left.*11 foot/);
  assert.match(gatorLine({ L: 1.4, pose: 'bask' }, 'right', 2), /young one, on your right.*yellow stripes/);
  assert.match(gatorLine({ L: 2.4, pose: 'float' }, 'right', 0), /eyes and the nose/);
});

// A world for a gator to be in: flat ground at 0, and water 1.2 m deep east
// of x = 10.
function pond() {
  const w = { level: 0, depth: 0 };
  return {
    dt: 1 / 30,
    time: 0,
    ground: (x) => (x > 10 ? -1.2 : 0.1),
    water: (x) => (x > 9 ? ((w.level = 0), (w.depth = x > 10 ? 1.2 : -0.1), w) : null),
    nearest: () => ({ d: Infinity, x: 0, z: 0 }),
    call() {},
  };
}

test('an alligator finds the water, and lies by it or in it', () => {
  assert.ok(SPECIES.alligator.only, 'it lives only where a country names it');
  const ctx = pond();
  const w = waterNear(ctx, 0, 0);
  assert.ok(w && w.bank.x <= 10 && w.deep.x > 10, 'the bank, and the water past it');
  for (let k = 0; k < 20; k++) {
    const g = new Gator(SPECIES.alligator, { x: 0, z: 0 }, ctx, 0);
    assert.ok(!g.done, 'it found the water');
    assert.ok(g.L >= GATOR_LENGTH[0] && g.L <= GATOR_LENGTH[1]);
    if (g.state === 'bask') assert.ok(g.x < 10, 'basking on the bank');
    else assert.ok(g.state === 'float' && g.x > 10, 'or lying in the water');
  }
  // with no water near, it doesn't stay
  const dry = { ...ctx, water: () => null };
  assert.ok(new Gator(SPECIES.alligator, { x: 0, z: 0 }, dry, 0).done);
});

test('come too close and it slides into the water, or sinks out of sight; one used to the boats lets you closer', () => {
  const ctx = pond();
  const run = (g, d, secs) => {
    ctx.nearest = () => ({ d, x: g.x - d, z: g.z });
    for (let t = 0; t < secs; t += ctx.dt) {
      ctx.time = t;
      g.update(ctx);
    }
  };
  const bask = new Gator(SPECIES.alligator, { x: 8.5, z: 0, yaw: Math.PI / 2, pose: 'bask', length: 2.5 }, ctx);
  run(bask, 30, 3);
  assert.equal(bask.state, 'bask', 'left alone it basks');
  run(bask, 3.5, 4);
  assert.ok(['slide', 'swim', 'sink'].includes(bask.state), `close to, it goes for the water (${bask.state})`);
  assert.ok(bask.x > 8.5, 'off the bank, into the water');
  const float = new Gator(SPECIES.alligator, { x: 14, z: 0, pose: 'float', length: 2 }, ctx);
  run(float, 3, 1);
  assert.equal(float.state, 'sink', 'lying in the water, it sinks out of sight');
  run(float, 3, 6);
  assert.ok(float.done, 'and is gone');
  const calm = new Gator(SPECIES.alligator, { x: 14, z: 0, pose: 'float', length: 2, calm: true }, ctx);
  run(calm, 4, 3);
  assert.equal(calm.state, 'float', 'one used to the boats stays put a few metres off');
});

test('a gator is one skinned mesh, young ones banded', () => {
  const g = buildGator(7, 1.4);
  const old = buildGator(7, 3.6);
  assert.ok(g.young && !old.young);
  assert.ok(g.mesh.isSkinnedMesh && g.spine.length > 8 && g.legs.length === 4);
  const box = new THREE.Box3().setFromBufferAttribute(old.mesh.geometry.attributes.position);
  assert.ok(box.max.z - box.min.z > 3.3 && box.max.z - box.min.z < 4, `as long as it is (${(box.max.z - box.min.z).toFixed(2)} m)`);
  assert.ok(box.max.y - box.min.y < 0.7, 'and low to the ground');
});
