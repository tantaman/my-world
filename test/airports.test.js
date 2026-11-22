// The airports: which parts of the world have an airfield, where each is
// (grown from the seed, and pinned, since each is a place on the map people
// track), the line the strip's top follows, the way the plane taxis, and a
// flight from one to another, start to finish.

import test from 'node:test';
import assert from 'node:assert/strict';
import { growWorld, LANDS, NEWEST_LAND } from '../src/world/lands.js';
import { Sites } from '../src/landmarks/sites.js';
import { Towns } from '../src/towns/towns.js';
import { Caves } from '../src/caves/caves.js';
import { Lines, clearOfPlaces, clearOfCaves } from '../src/railway/lines.js';
import { HIKES } from '../src/world/hikes.js';
import { Landforms } from '../src/world/landforms.js';
import { findSite, clearOf } from '../src/spaceport/site.js';
import { Airports, regionsOf, profile, topAt, outside, SHARE, GRADE, HALF, STRIP } from '../src/airports/airports.js';
import { Flight, FLY, taxiOut, taxiIn, intoWind, canTakeOff, canLand } from '../src/airports/flight.js';
import { PARK } from '../src/airports/airfield.js';
import { matchesGolden } from './helpers/golden.js';

const SEED = 20261119;
const CARDS = HIKES.map(({ load, ...card }) => card);

// The world as the game has it: what the airfields keep clear of, made the
// way their features make them.
const worlds = new Map();
function worldOf(land) {
  if (worlds.has(land)) return worlds.get(land);
  const gen = growWorld(SEED, [], land);
  const start = gen.findSpawn(0, 0);
  const landforms = new Landforms(HIKES);
  const keepHike = (x0, z0, x1, z1) => !!landforms.reaches(x0, z0, x1, z1);
  const sites = new Sites(gen, { start });
  const caves = new Caves({ gen, keepOff: keepHike });
  const lines = new Lines(gen, { start, keepClear: [clearOfPlaces(sites), clearOfCaves((a, b, c, d) => caves.inBox(a, b, c, d))], keepOff: keepHike });
  const towns = new Towns(gen, { start, sites, keepOff: keepHike });
  const clear = clearOf({ landforms, sites, towns, caves, lines });
  const pad = findSite(gen, start, clear);
  const keepOff = (x0, z0, x1, z1) => clear(x0, z0, x1, z1) || !!(pad && pad.box[0] <= x1 && pad.box[2] >= x0 && pad.box[1] <= z1 && pad.box[3] >= z0);
  const w = { gen, start, keepOff, airports: new Airports(gen, { cards: CARDS, start, keepOff }) };
  worlds.set(land, w);
  return w;
}

test('an airfield for where you start, and one for each part of the world with hikes', () => {
  const start = { x: 0, z: 0 };
  const regions = regionsOf(CARDS, start, SEED);
  assert.equal(regions[0].id, 'home', 'home first');
  const by = (id) => regions.find((g) => g.hikes.includes(id));
  // the hikes near enough one another share one
  assert.equal(by('mount-storm-king').id, 'home', 'Mount Storm King, a few km from the start, is home');
  assert.equal(new Set(['waihee-ridge', 'kaihalulu', 'nakalele-point', 'haleakala'].map((id) => by(id).id)).size, 1, 'Maui has one');
  assert.equal(by('tignes'), by('vallee-blanche'), 'and the Alps one');
  assert.notEqual(by('angels-landing'), by('cascade-canyon'), 'but Zion and the Tetons are too far apart to share');
  for (const g of regions) for (const id of g.hikes) {
    const c = CARDS.find((h) => h.id === id);
    assert.ok(Math.hypot(c.at[0] - g.x, c.at[1] - g.z) < SHARE, `${id} is within reach of its airfield's part of the world`);
  }
  assert.equal(new Set(regions.map((g) => g.name)).size, regions.length, `no two named the same (${regions.map((g) => g.name).join(', ')})`);
  // bringing in another hike never changes the airfields already there
  for (let n = 0; n < CARDS.length; n++) {
    const fewer = regionsOf(CARDS.slice(0, n), start, SEED);
    for (const g of fewer) {
      const now = regions.find((r) => r.id === g.id);
      assert.ok(now && now.x === g.x && now.z === g.z && now.name === g.name, `${g.id} stays as it was with ${CARDS[n].id} brought in`);
    }
  }
});

test("the strip's top: over the ground, no steeper than a bush strip, and no sharp crests or dips", () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let trial = 0; trial < 600; trial++) {
    const ds = [4, 10, 24][trial % 3];
    const n = Math.round(STRIP.length / ds) + 1;
    const g = [];
    let h = rnd() * 50;
    let slope = 0;
    for (let i = 0; i < n; i++) {
      slope += (rnd() - 0.5) * 0.08 * ds;
      h += slope * ds * 0.1 + (rnd() - 0.5) * (trial % 7) * 0.3;
      g.push(h);
    }
    const top = profile(g, ds);
    const bend = (ds * ds) / 900;
    for (let i = 0; i < n; i++) {
      assert.ok(top[i] >= g[i] + 0.3 - 1e-9, 'never under the ground');
      if (i > 0) assert.ok(Math.abs(top[i] - top[i - 1]) <= GRADE * ds + 1e-9, 'never steeper than a bush strip');
      if (i > 0 && i < n - 1) assert.ok(Math.abs(top[i - 1] - 2 * top[i] + top[i + 1]) <= bend * (1 + 1e-9) + 1e-12, 'no crest or dip sharper than it should be');
    }
  }
});

test('the airfields are grown from the seed: the same every time, on dry ground, clear of what was there first', () => {
  const round = (v) => Math.round(v * 1000) / 1000;
  for (const land of LANDS) {
    const { gen, keepOff, airports } = worldOf(land);
    // home on every land; on the newest, every one
    const ids = land === NEWEST_LAND ? airports.regions.map((g) => g.id) : ['home'];
    const pinned = [];
    for (const id of ids) {
      const s = airports.site(id);
      assert.ok(s, `land ${land} has an airfield for ${id}`);
      const g = airports.region(id);
      const d = Math.hypot(s.x - g.x, s.z - g.z);
      assert.ok(d >= g.r0 && d <= g.r1 + 4000, `${s.name} is in its ring (${d.toFixed(0)} m out)`);
      assert.ok(s.fill <= 8.5, `on a bank no taller than it should be (${s.fill.toFixed(2)} m)`);
      assert.ok(s.clear[0] || s.clear[1], 'with clear air off one end at least');
      for (let lz = -HALF; lz <= HALF; lz += 20) {
        const fx = Math.sin(s.yaw);
        const fz = Math.cos(s.yaw);
        const y = gen.height(s.x + fx * lz, s.z + fz * lz);
        assert.ok(gen.water.edge >= 12, `${s.name} is out of the water`);
        assert.ok(topAt(s, lz) >= y + 0.25, `${s.name}'s strip is over the ground along it`);
      }
      pinned.push({ id: s.id, region: s.region, name: s.name, x: round(s.x), z: round(s.z), yaw: round(s.yaw), mid: round(topAt(s, 0)), clear: s.clear });
    }
    // the same again, from a world that hasn't looked before
    const again = new Airports(gen, { cards: CARDS, start: airports.regions[0], keepOff });
    assert.equal(again.site('home').id, airports.site('home').id, 'and the same one again');
    // the places on the map people track are where they were
    matchesGolden(land > 1 ? `airports-${SEED}-land${land}` : `airports-${SEED}`, pinned, { tolerance: 1e-6 });
  }
});

test('the plane taxis on the strip and the apron, whichever way it stands and goes', () => {
  const on = (p) => outside(p.x, p.z, {}) <= 0.6;
  for (const facing of [1, -1]) {
    for (const way of [1, -1]) {
      const out = taxiOut(facing, way);
      assert.ok(out.every(on), `out from the stand, facing ${facing}, to take off going ${way}`);
      const end = out[out.length - 1];
      assert.ok(Math.abs(Math.cos(end.h) - way) < 0.05, 'lined up the way it takes off');
      assert.ok(Math.abs(end.z + way * (HALF - 16)) < 1, 'at the far end');
      for (let i = 1; i < out.length; i++) assert.ok(Math.abs(out[i].h - out[i - 1].h) < 0.3, 'turning smoothly');
    }
  }
  for (const way of [1, -1]) {
    for (const z of [-30 * way, -12 * way]) {
      const inn = taxiIn(z, way);
      assert.ok(inn.every(on), `in from the strip at ${z}, having landed going ${way}`);
      const end = inn[inn.length - 1];
      assert.ok(Math.hypot(end.x - PARK.x, end.z - PARK.z) < 0.01, 'to the stand');
    }
  }
});

test('taking off and landing into the wind, where the air off that end is clear', () => {
  const both = { yaw: 0, clear: [true, true] };
  assert.equal(intoWind(both, { x: 0, z: 1 }), -1, 'the wind blowing toward +z, it takes off toward -z');
  assert.equal(intoWind(both, { x: 0, z: -1 }), 1);
  assert.equal(intoWind(both, { x: 0, z: 1 }, true), -1, 'and lands toward -z too');
  const oneWay = { yaw: 0, clear: [false, true] };
  for (const wind of [{ x: 0, z: 1 }, { x: 0, z: -1 }]) {
    assert.ok(canTakeOff(oneWay, intoWind(oneWay, wind)), 'only ever off the end that is clear');
    assert.ok(canLand(oneWay, intoWind(oneWay, wind, true)), 'and in over it');
  }
});

test('a flight: boarded, taxied, flown over the clouds, carried across, landed, and taxied in', () => {
  const { gen, airports } = worldOf(NEWEST_LAND);
  const from = airports.site('home');
  const to = airports.site('cascade-canyon');
  const wind = { x: 0.9, z: 0.4 };
  const flight = new Flight({ from, to, ground: (x, z) => gen.height(x, z), way: intoWind(from, wind), land: intoWind(to, wind, true), facing: 1, cruise: 14 });
  const phases = [];
  const events = [];
  flight.on('phase', (p) => phases.push(p));
  for (const e of ['liftoff', 'jump', 'touchdown', 'done']) flight.on(e, () => events.push(e));
  const dt = 1 / 30;
  let was = { ...flight.pose };
  let wasPart = flight.part;
  let high = -Infinity;
  for (let n = 0; n < 30 * 600 && !flight.done; n++) {
    const p = flight.update(dt);
    // waiting in the cloud until the land under the way in has grown
    if (flight.part === 'hold' && flight.t > 1) flight.ready = true;
    const ground = gen.height(p.x, p.z);
    const field = [from, to].some((s) => Math.hypot(p.x - s.x, p.z - s.z) < HALF + 30);
    if (!field) assert.ok(p.y >= ground - 0.01, `never under the ground (${phases.at(-1)}: ${(p.y - ground).toFixed(2)} m)`);
    if (p.aloft && !field && flight.part !== 'hold') assert.ok(p.y > ground + 3, `flying, well clear of it (${phases.at(-1)}: ${(p.y - ground).toFixed(1)} m)`);
    // nothing jumps but the plane carried across in the cloud
    const step = Math.hypot(p.x - was.x, p.y - was.y, p.z - was.z);
    if (!(wasPart === 'down' && flight.part === 'hold')) assert.ok(step < 45 * dt + 0.2, `smoothly (${step.toFixed(2)} m in a frame, ${phases.at(-1)})`);
    if (flight.part === 'cruise') high = Math.max(high, p.y - flight.deck);
    was = { ...p };
    wasPart = flight.part;
  }
  assert.ok(flight.done, 'it gets there');
  assert.deepEqual(phases, ['start', 'taxi', 'lineup', 'roll', 'climb', 'cruise', 'down', 'hold', 'approach', 'landing', 'taxi-in', 'shutdown', 'done']);
  assert.deepEqual(events, ['liftoff', 'jump', 'touchdown', 'done']);
  assert.ok(Math.abs(high - FLY.above) < 1, `over the clouds, by ${high.toFixed(1)} m`);
  // ...and stands on the other's apron, engines off, door down
  const p = flight.pose;
  const sx = p.x - to.x;
  const sz = p.z - to.z;
  const lx = sx * Math.cos(to.yaw) - sz * Math.sin(to.yaw);
  const lz = sx * Math.sin(to.yaw) + sz * Math.cos(to.yaw);
  assert.ok(Math.hypot(lx - PARK.x, lz - PARK.z) < 0.05, `on the stand (${lx.toFixed(2)}, ${lz.toFixed(2)})`);
  assert.ok(Math.abs(p.y - topAt(to, PARK.z)) < 1e-6, 'on the apron');
  assert.equal(p.power, 0);
  assert.equal(p.door, 1);
});

test("a plane and an airfield are drawn whole: every vertex says what it's made of", async () => {
  const THREE = await import('three');
  const { Plane } = await import('../src/airports/plane.js');
  const { buildAirfield } = await import('../src/airports/airfield.js');
  const { gen, airports } = worldOf(NEWEST_LAND);
  const material = new THREE.MeshBasicMaterial();
  const plane = new Plane({ material, glow: material });
  const field = buildAirfield(airports.site('home'), (x, z) => gen.height(x, z), { body: material, paint: material, lamps: material });
  for (const [what, object] of [['the plane', plane.object], ['the airfield', field.object]]) {
    let meshes = 0;
    object.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      // one short of a vertex, and the building material doesn't draw it at all
      const n = o.geometry.attributes.position.count;
      for (const [name, a] of Object.entries(o.geometry.attributes)) assert.equal(a.count, n, `${what}: ${name} for every vertex`);
    });
    assert.ok(meshes > 0, `${what} is made`);
  }
});
