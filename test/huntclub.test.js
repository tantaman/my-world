// The hunt club: where it is (grown from the seed, and pinned, since it's a
// place on the map people track), that its skeet field is laid out as a real
// one is, that a target flies the way one does, what a shot's pattern breaks
// and why it has to lead, the rules of a round, how the club stands on the
// ground, the field at work, and the shotgun loaded for each throw.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { growWorld, LANDS } from '../src/world/lands.js';
import { toWorld } from '../src/world/frame.js';
import { Sites } from '../src/landmarks/sites.js';
import { Towns } from '../src/towns/towns.js';
import { Caves } from '../src/caves/caves.js';
import { Lines, clearOfPlaces, clearOfCaves } from '../src/railway/lines.js';
import { HIKES } from '../src/world/hikes.js';
import { Landforms } from '../src/world/landforms.js';
import { findSite as findPad, clearOf as padClear } from '../src/spaceport/site.js';
import { findSite as findStore, clearOf as storeClear } from '../src/videostore/site.js';
import { Branches } from '../src/videostore/branches.js';
import { findBuildings, OutlyingBuildings, overlaps } from '../src/abandoned/sites.js';
import { Airports, mayReach } from '../src/airports/airports.js';
import { Tracks } from '../src/racetrack/tracks.js';
import { clearOf as trackClear } from '../src/racetrack/site.js';
import { findSite, candidates, pickSite, clearOf, regionsInTheWay, clubName, farName, farSpot, HuntClubs, FAR, layout, PLAN, CLUB, EDGE, TREAD, RING } from '../src/huntclub/site.js';
import { FIELD, STATIONS, HOUSES, CLAY, SHOT, SCHEDULE, TARGETS, Round, fly, launch, pattern, meeting, missedBy, housesOf, validateRecord } from '../src/huntclub/skeet.js';
import { Range, describe } from '../src/huntclub/range.js';
import { buildClub, COUNTER, HATCH } from '../src/huntclub/club.js';
import { shotgunTool, SHELLS, MOUNT_ZOOM } from '../src/huntclub/shotgun.js';
import { glyph } from '../src/build/font.js';
import { Solids } from '../src/world/solids.js';
import { segDist } from '../src/core/geom.js';
import { matchesGolden } from './helpers/golden.js';

const SEED = 20261119;
const CARDS = HIKES.map(({ load, ...card }) => card);
const near = (a, b, eps) => Math.abs(a - b) < eps;

// ── Where it is ─────────────────────────────────────────────────────────────

// The world as the game has it: the things the clubs keep clear of, made the
// way their features make them.
function worldOf(land, seed = SEED) {
  const gen = growWorld(seed, [], land);
  const start = gen.findSpawn(0, 0);
  const landforms = new Landforms(HIKES);
  const keepHike = (x0, z0, x1, z1) => !!landforms.reaches(x0, z0, x1, z1);
  const sites = new Sites(gen, { start });
  const caves = new Caves({ gen, keepOff: keepHike });
  const lines = new Lines(gen, { start, keepClear: [clearOfPlaces(sites), clearOfCaves((a, b, c, d) => caves.inBox(a, b, c, d))], keepOff: keepHike });
  const towns = new Towns(gen, { start, sites, keepOff: keepHike });
  const pad = findPad(gen, start, padClear({ landforms, sites, towns, caves, lines }));
  const reserved = storeClear({ landforms, sites, towns, caves, lines, spaceport: pad });
  const store = findStore(gen, start, reserved);
  const airports = new Airports(gen, { cards: CARDS, start, keepOff: (a, b, c, d) => reserved(a, b, c, d) });
  const abandoned = findBuildings(gen, start, (...box) => (store && overlaps(box, store.box)) || reserved(...box));
  // the store's branches, beside the villages, clear of the store and the airfields
  const field = (box) => airports.regions.some((g) => mayReach(g, Math.hypot((box[0] + box[2]) / 2 - g.x, (box[1] + box[3]) / 2 - g.z), Math.hypot(box[2] - box[0], box[3] - box[1]) / 2) && airports.site(g.id) && overlaps(box, airports.site(g.id).box));
  const branches = new Branches(gen, { towns, keepOff: reserved, also: (...box) => (store && overlaps(box, store.box)) || field(box) });
  const stores = (...box) => (store && overlaps(box, store.box)) || branches.within(...box).length > 0;
  // the abandoned buildings further out, clear of every store and the airfields
  const districts = new OutlyingBuildings(gen, start, (...box) => stores(...box) || reserved(...box) || field(box));
  const others = (...box) => reserved(...box) || stores(...box) || abandoned.some((s) => overlaps(box, s.box)) || districts.within(...box).length > 0;
  others.ready = reserved.ready;
  const keepOff = clearOf({ reserved: others, airfields: airports });
  // the race tracks beside the towns, clear of the ring round the start the first club may be in
  const startClear = RING[1] + Math.hypot(...PLAN.slice(2)) + 20;
  const buildings = (...box) => [...abandoned.filter((s) => overlaps(s.box, box)), ...districts.within(...box)];
  const tracks = new Tracks(gen, { towns, keepOff: trackClear({ landforms, sites, towns, caves, lines, spaceport: pad, stores: (...box) => [store, ...branches.within(...box)].filter((s) => s && overlaps(s.box, box)), airfield: field, buildings, start, startClear }) });
  // ...which the rest keep clear of
  const farKeepOff = (...box) => keepOff(...box) || tracks.within(...box).length > 0;
  farKeepOff.ready = keepOff.ready;
  const clubs = (opts = {}) => new HuntClubs(gen, { start, keepOff: farKeepOff, away: keepHike, ...opts });
  return { gen, start, keepOff, farKeepOff, store, abandoned, airports, branches, districts, tracks, clubs };
}

test('the hunt club is grown from the seed: the same every time, on flat dry ground, clear of what was there first', () => {
  for (const land of LANDS) {
    const { gen, start, keepOff, store, abandoned, airports, branches } = worldOf(land);
    const site = findSite(gen, start, keepOff);
    assert.ok(site, `land ${land} has a hunt club`);
    assert.deepEqual(findSite(gen, start, keepOff), site, 'and the same one again');
    assert.deepEqual(pickSite(gen, candidates(gen, start), keepOff), site, 'found in two goes, the same');
    // the airfields it waits for: where you start's, and none of a far-off hike's
    const ways = regionsInTheWay(airports.regions, start).map((g) => g.id);
    assert.deepEqual(ways, ['home']);
    assert.ok(airports.regions.length > 1);
    const d = Math.hypot(site.x - start.x, site.z - start.z);
    assert.ok(d >= 440 && d <= 1010, `a longer walk from the start than the video store (${d.toFixed(0)} m)`);
    gen.height(site.x, site.z);
    assert.ok(gen.water.edge >= 40, 'out of the water');
    assert.ok(site.hi - site.lo <= 3.2, `on ground that's flat enough (${(site.hi - site.lo).toFixed(2)} m)`);
    const b = site.box;
    assert.ok(!keepOff(b[0], b[1], b[2], b[3]), 'clear of everything it keeps clear of');
    assert.ok(!overlaps(b, store.box), 'the video store among them');
    for (const s of abandoned) assert.ok(!overlaps(b, s.box), `and ${s.name}`);
    assert.equal(branches.within(...b).length, 0, 'and the video store\'s branches');
    // its clubhouse is towards the start, and you're set down facing it
    const fx = Math.sin(site.yaw);
    const fz = Math.cos(site.yaw);
    assert.ok(((start.x - site.x) * fx + (start.z - site.z) * fz) / d > 0.99, 'the clubhouse is on the side people come from');
    assert.ok(Math.abs(Math.cos(site.door.yaw - site.yaw) - 1) < 1e-9, 'go here sets you down facing the clubhouse');
    assert.match(site.name, / Hunt Club$/);
    // the place on the map people track is where it was
    const round = (v) => Math.round(v * 1000) / 1000;
    matchesGolden(land > 1 ? `huntclub-${SEED}-land${land}` : `huntclub-${SEED}`, { id: site.id, name: site.name, x: round(site.x), z: round(site.z), yaw: round(site.yaw), base: round(site.base) }, { tolerance: 1e-6 });
  }
});

test("an airfield is only asked about where it might reach", () => {
  const g = { x: 0, z: 0, r0: 700, r1: 4000 };
  assert.equal(mayReach(g, 400, 50), false, 'well inside its ring');
  assert.equal(mayReach(g, 500, 50), true, 'its box can come this far in');
  assert.equal(mayReach(g, 9000, 50), false, 'well beyond it');
  // everywhere the club may be is within reach of the regions it waits for
  const regions = [g, { x: 30000, z: 0, r0: 700, r1: 4000 }, { x: 0, z: 5200, r0: 700, r1: 4000 }];
  const ways = regionsInTheWay(regions, { x: 0, z: 0 });
  assert.deepEqual(ways, [regions[0], regions[2]]);
  for (const r of [RING[0], RING[1]]) for (const h of regions) if (!ways.includes(h)) assert.equal(mayReach(h, Math.hypot(r - h.x, h.z), 80), false);
});

test('the hunt club keeps off somewhere it is told to, and a seed names it', () => {
  const gen = growWorld(SEED);
  const start = gen.findSpawn(0, 0);
  const first = findSite(gen, start);
  const box = first.box;
  const second = findSite(gen, start, (x0, z0, x1, z1) => x1 > box[0] && x0 < box[2] && z1 > box[1] && z0 < box[3]);
  assert.ok(second && second.id !== first.id, 'somewhere else');
  assert.ok(!overlaps(second.box, box), 'clear of it');
  assert.equal(clubName(SEED), clubName(SEED));
  const names = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(clubName));
  assert.ok(names.size > 4, `different seeds, different names (${[...names].join(', ')})`);
  // every name can be painted on its sign
  for (let s = 0; s < 60; s++) for (const ch of clubName(s).toUpperCase()) assert.ok(ch === ' ' || glyph(ch), `"${ch}" is in the font`);
});

// ── Further out ─────────────────────────────────────────────────────────────

test('the rest are out in the forest, grown from the seed, each in its own square, and pinned', () => {
  const { gen, start, keepOff, farKeepOff, tracks, clubs } = worldOf(LANDS[0]);
  const far = clubs();
  const home = findSite(gen, start, keepOff);
  const pinned = {};
  // the squares round the start that have one
  const near = [];
  for (let j = -2; j <= 1; j++) for (let i = -2; i <= 1; i++) if (far.spot(i, j)) near.push([i, j]);
  for (const [i, j] of near) {
    const s = far.cell(i, j);
    if (!s) continue;
    assert.ok(s.box[0] >= i * FAR.cell && s.box[2] < (i + 1) * FAR.cell && s.box[1] >= j * FAR.cell && s.box[3] < (j + 1) * FAR.cell, `${s.name} is inside its own square`);
    const d = Math.hypot(s.x - start.x, s.z - start.z);
    assert.ok(d > FAR.start - FAR.ring[1] - 1, `well away from the start (${(d / 1000).toFixed(1)} km)`);
    assert.ok(!overlaps(s.box, home.box), 'and from the first club');
    gen.height(s.x, s.z);
    assert.ok(gen.water.edge >= 40, 'out of the water');
    assert.ok(s.hi - s.lo <= 3.2, `on ground that's flat enough (${(s.hi - s.lo).toFixed(2)} m)`);
    assert.ok(!farKeepOff(...s.box), 'clear of everything it keeps clear of');
    assert.equal(tracks.within(...s.box).length, 0, 'the race tracks among them');
    assert.ok(Math.abs(Math.sin(2 * (s.yaw - farSpot(SEED, i, j).yaw))) < 1e-9, 'facing the way its square says, or a quarter turn round');
    assert.ok(Math.abs(Math.cos(s.door.yaw - s.yaw) - 1) < 1e-9, 'go here sets you down facing the clubhouse');
    assert.match(s.name, / Hunt Club$/);
    assert.notEqual(s.name, home.name, 'by a name of its own');
    assert.deepEqual(clubs().byId(s.id), s, 'found again by its id, the same');
    const round = (v) => Math.round(v * 1000) / 1000;
    pinned[s.id] = { name: s.name, x: round(s.x), z: round(s.z), yaw: round(s.yaw), base: round(s.base) };
  }
  assert.ok(Object.keys(pinned).length >= 3, `there are some (${Object.keys(pinned).length})`);
  // places people track are where they were
  matchesGolden(`huntclub-far-${SEED}`, pinned, { tolerance: 1e-6 });
  // and none round the start but the first
  assert.deepEqual(far.within(start.x - 1500, start.z - 1500, start.x + 1500, start.z + 1500), []);
  assert.equal(far.byId(home.id), null, "the first club isn't one of the rest");
  assert.equal(far.byId('huntclub:far:x:0'), null);
});

test('a far club is the same looked for a little at a time, waiting on what it keeps clear of', () => {
  const { gen, farKeepOff, clubs } = worldOf(LANDS[0]);
  const outright = clubs();
  // the railway and the airfields "still being looked for" for a while
  let asked = 0;
  const slow = (...box) => farKeepOff(...box);
  slow.ready = () => ++asked > 5;
  const bit = clubs({ keepOff: slow });
  let at = null;
  for (let k = 1; !at; k++) if (bit.spot(k, 1)) at = [k, 1];
  assert.equal(bit.peek(...at), undefined, 'not known at first');
  let rounds = 0;
  while (bit.pump(1) > 0) rounds++;
  assert.ok(rounds > 1 && asked > 5, 'it took a while');
  assert.ok(bit.peek(...at), 'and found');
  assert.deepEqual(bit.peek(...at), outright.cell(...at));
  // a square with nothing in it isn't queued at all
  const empty = [...Array(40).keys()].map((k) => [k, 3]).find(([i, j]) => !farSpot(gen.seed, i, j));
  assert.equal(bit.peek(...empty), null);
  assert.equal(bit.queue.size, 0);
});

test('a club keeps off a real place, and off the airfields until they are known', () => {
  const gen = growWorld(SEED);
  const start = gen.findSpawn(0, 0);
  // a square that's all a real place has nothing looked for in it
  const all = new HuntClubs(gen, { start, away: () => true });
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) assert.equal(all.spot(i, j), null);
  // the readiness of somewhere an airfield might reach waits on that airfield
  const fresh = new Airports(gen, { cards: CARDS, start });
  const keepOff = clearOf({ airfields: fresh });
  assert.equal(keepOff.ready(start.x + 2000, start.z, start.x + 2100, start.z + 100), false, 'the airfield round the start not found yet');
  assert.ok(fresh.queue.has('home'), 'and asked for');
  fresh.site('home');
  assert.equal(keepOff.ready(start.x + 2000, start.z, start.x + 2100, start.z + 100), true, 'and then it is');
  assert.equal(clearOf({ airfields: new Airports(gen, { cards: CARDS, start }) }).ready(start.x + 900000, start.z, start.x + 900100, start.z + 100), true, 'nowhere near one: nothing to wait for');
});

test('no two clubs within three squares of each other share a name, and every name can be painted', () => {
  for (const seed of [SEED, 1, 42]) {
    for (let j = -3; j <= 3; j++) {
      for (let i = -3; i <= 3; i++) {
        const a = farName(seed, i, j);
        assert.notEqual(a, clubName(seed), "never the first club's");
        for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) if (di || dj) assert.notEqual(a, farName(seed, i + di, j + dj), `(${i}, ${j}) and (${i + di}, ${j + dj})`);
        for (const ch of a.toUpperCase()) assert.ok(ch === ' ' || glyph(ch), `"${ch}" is in the font`);
      }
    }
  }
});

// ── The field ───────────────────────────────────────────────────────────────

test('the field is laid out as a real skeet field is', () => {
  const at = (n) => STATIONS[n - 1];
  assert.ok(near(Math.hypot(at(7).x - at(1).x, at(7).z - at(1).z), 36.8, 0.01), 'stations 1 and 7 are 40 yards apart');
  for (let n = 1; n < 7; n++) {
    const gap = Math.hypot(at(n + 1).x - at(n).x, at(n + 1).z - at(n).z);
    assert.ok(near(gap, 8.14, 0.02), `stations ${n} and ${n + 1} are 26 ft 8 in apart (${gap.toFixed(3)} m)`);
  }
  assert.ok(near(Math.hypot(at(4).x, at(4).z), 13.72, 0.02), 'station 4 is 45 ft from station 8');
  assert.deepEqual([at(8).x, at(8).z], [0, 0]);
  // the high house on the left seen from the stations (-x), the low on the right
  assert.ok(HOUSES.H.box[2] < at(1).x && HOUSES.L.box[0] > at(7).x - 0.5);
  assert.ok(HOUSES.H.mouth.up > 3 && HOUSES.L.mouth.up < 1.1, 'the high house throws from 10 ft, the low from 3.5');
  for (const h of Object.values(HOUSES)) {
    for (const s of STATIONS) {
      const p = FIELD.pad;
      assert.ok(s.x + p < h.box[0] || s.x - p > h.box[2] || s.z + p < h.box[1] || s.z - p > h.box[3], `station ${s.n}'s pad is clear of the ${h.name}`);
    }
  }
  // the clubhouse is behind the stations, the field all inside the plan
  assert.ok(EDGE > at(4).z + 5, 'the porch is well back of station 4');
  assert.ok(PLAN[0] < HOUSES.H.box[0] && PLAN[2] > HOUSES.L.box[2] && PLAN[1] < HOUSES.H.box[1] && PLAN[3] > CLUB.z1);
  // each station faces the crossing point
  for (const s of STATIONS) {
    if (s.n === 8) continue;
    const dx = 0 - s.x;
    const dz = FIELD.cross - s.z;
    assert.ok(near(Math.atan2(dx, dz), s.face, 1e-9));
  }
});

test('a target passes over the crossing point at the height it should, and comes down 50–60 m from its house', () => {
  for (const [k, h] of Object.entries(HOUSES)) {
    const from = { x: h.mouth.x, y: h.mouth.up, z: h.mouth.z };
    const over = { x: 0, y: FIELD.crossUp, z: FIELD.cross };
    const v = launch(from, over);
    assert.ok(near(Math.hypot(v.vx, v.vy, v.vz), CLAY.speed, 1e-9), 'thrown at the trap speed');
    const c = { ...from, ...v };
    let t = 0;
    let crossed = null;
    let top = 0;
    while (c.y > 0 && t < 10) {
      const was = { x: c.x, y: c.y, z: c.z };
      fly(c, 1 / 60);
      t += 1 / 60;
      top = Math.max(top, c.y);
      if (crossed === null && Math.sign(was.x) !== Math.sign(c.x)) crossed = c;
      if (crossed === c) crossed = { y: c.y, z: c.z };
    }
    assert.ok(crossed && near(crossed.y, FIELD.crossUp, 0.2), `${k}: over the crossing point at ${crossed && crossed.y.toFixed(2)} m`);
    assert.ok(near(crossed.z, FIELD.cross, 0.3), `${k}: ...over it, not beside it`);
    const far = Math.hypot(c.x - from.x, c.z - from.z);
    assert.ok(far > 50 && far < 60, `${k}: comes down ${far.toFixed(1)} m out`);
    assert.ok(t > 2.5 && t < 4.2, `${k}: in ${t.toFixed(2)} s`);
    assert.ok(top < 7, `${k}: never far up (${top.toFixed(1)} m)`);
    // moved on in one go or many, it's in the same place
    const a = { ...from, ...v };
    const b = { ...from, ...v };
    fly(a, 1);
    for (let i = 0; i < 37; i++) fly(b, 1 / 37);
    assert.ok(near(a.x, b.x, 0.05) && near(a.y, b.y, 0.05), 'whatever the frame rate');
  }
});

test("a shot's pattern opens with distance; a target crossing in front has to be led", () => {
  const from = { x: 0, y: 1.6, z: 0 };
  const o = { ...from };
  const ahead = (x, y, z) => {
    const l = Math.hypot(x - o.x, y - o.y, z - o.z);
    return { x: (x - o.x) / l, y: (y - o.y) / l, z: (z - o.z) / l };
  };
  const p20 = pattern(o, ahead(0, 1.6, -20), { x: 0, y: 1.6, z: -20 }, from);
  assert.equal(p20.chance, 1, 'dead on: broken');
  assert.ok(near(p20.radius, SHOT.spread * 20 + SHOT.core, 1e-9));
  assert.ok(pattern(o, ahead(0, 1.6, -10), { x: 0, y: 1.6, z: -10 }, from).radius < p20.radius, 'tighter nearer');
  assert.ok(pattern(o, ahead(0, 1.6, -20), { x: p20.radius * 0.8, y: 1.6, z: -20 }, from).chance < 1, 'chancier at the edge');
  assert.equal(pattern(o, ahead(0, 1.6, -20), { x: p20.radius + 0.2, y: 1.6, z: -20 }, from).chance, 0, 'outside it: untouched');
  assert.equal(pattern(o, ahead(0, 1.6, -70), { x: 0, y: 1.6, z: -70 }, from).chance, 0, 'too far: the pattern has thinned to nothing');
  assert.equal(pattern(o, ahead(0, 1.6, 20), { x: 0, y: 1.6, z: -20 }, from).chance, 0, 'not behind you');

  // a target crossing 20 m out: shot where it is, it's gone by when the shot
  // gets there; shot where they'll meet, it's broken
  const c = { x: -6, y: 4, z: -20, vx: 19, vy: 0.5, vz: 0 };
  const now = pattern(o, ahead(c.x, c.y, c.z), meeting(c, from).p, from);
  assert.equal(now.chance, 0, `no lead: missed by ${now.off.toFixed(2)} m`);
  const m = meeting(c, from);
  assert.ok(m.t > 0.05 && m.t < 0.08, 'the shot takes a moment to get there');
  assert.equal(pattern(o, ahead(m.p.x, m.p.y, m.p.z), m.p, from).chance, 1, 'led: broken');
  // and what a coach would say
  assert.equal(missedBy(o, ahead(c.x, c.y, c.z), m.p, m.p), 'behind it');
  assert.equal(missedBy(o, ahead(m.p.x + 1.5, m.p.y, m.p.z), m.p, m.p), 'in front of it');
  assert.equal(missedBy(o, ahead(m.p.x, m.p.y + 1, m.p.z), m.p, m.p), 'over it');
  assert.equal(missedBy(o, ahead(m.p.x, m.p.y - 1, m.p.z), m.p, m.p), 'under it');
});

// ── A round ─────────────────────────────────────────────────────────────────

test('a round is 25 targets: singles at every station, doubles at 1, 2, 6 and 7, and the option', () => {
  const kinds = SCHEDULE.map(([n, k]) => `${n}${k}`);
  assert.equal(SCHEDULE.reduce((s, [, k]) => s + housesOf(k).length, 0), TARGETS - 1, '24 and the option');
  for (const n of [1, 2, 6, 7]) assert.ok(kinds.includes(`${n}D`), `a double at ${n}`);
  for (let n = 1; n <= 8; n++) assert.ok(kinds.includes(`${n}H`) && kinds.includes(`${n}L`), `singles at ${n}`);

  // all of them broken: the option is the low house at 8
  const clean = new Round();
  while (!clean.done) clean.record({ H: true, L: true });
  assert.equal(clean.results.length, TARGETS);
  assert.equal(clean.score, TARGETS);
  assert.deepEqual(clean.results.at(-1), { station: 8, house: 'L', dead: true, option: true });

  // the first lost is thrown again straight away, and only the first
  const r = new Round();
  r.record({ H: true }); // 1H
  r.record({ L: false }); // 1L lost
  assert.deepEqual(r.next, { station: 1, kind: 'L', option: true });
  r.record({ L: true });
  assert.deepEqual(r.next, { station: 1, kind: 'D', option: false });
  r.record({ H: true, L: false }); // a double, the low lost: no option left
  assert.deepEqual(r.next, { station: 2, kind: 'H', option: false });
  while (!r.done) r.record({ H: true, L: true });
  assert.equal(r.results.length, TARGETS);
  assert.equal(r.score, TARGETS - 2);
  assert.equal(r.results.filter((x) => x.option).length, 1);
  // a double's lost target is its option, as a single
  const d = new Round();
  for (let i = 0; i < 2; i++) d.record({ H: true, L: true });
  d.record({ H: false, L: true });
  assert.deepEqual(d.next, { station: 1, kind: 'H', option: true });
  assert.equal(describe(d.next), 'high house again, your option');
  assert.equal(describe({ kind: 'D', option: false }), 'a double');
});

test("what's kept of you is made safe before it's believed", () => {
  assert.deepEqual(validateRecord({ gun: true, best: 23, rounds: 4, visited: true, been: ['huntclub:far:1:2'] }), { gun: true, best: 23, rounds: 4, visited: true, been: ['huntclub:far:1:2'] });
  assert.deepEqual(validateRecord(null), { gun: false, best: null, rounds: 0, visited: false, been: [] });
  assert.deepEqual(validateRecord({ gun: 'yes', best: 26, rounds: -1, visited: 1, been: 'all' }), { gun: false, best: null, rounds: 0, visited: false, been: [] });
  assert.deepEqual(validateRecord({ been: ['a', 3, null, 'b', 'c'] }, 2).been, ['a', 'b'], 'only ids, and only so many');
  assert.deepEqual(validateRecord({ best: 2.5 }).best, null);
  assert.deepEqual(validateRecord({ best: 0 }).best, 0);
});

// ── On the ground ───────────────────────────────────────────────────────────

// A club on a slope: it rises 2 m across its plan, towards +x and the porch.
const SITE = { x: 1200, z: -800, yaw: 0.7, base: 0, name: 'Grouse Creek Hunt Club', plan: [PLAN] };
const slope = (x, z) => {
  const dx = x - SITE.x;
  const dz = z - SITE.z;
  const lx = dx * Math.cos(SITE.yaw) - dz * Math.sin(SITE.yaw);
  const lz = dx * Math.sin(SITE.yaw) + dz * Math.cos(SITE.yaw);
  return 0.012 * lx + 0.02 * lz;
};

test('the club stands on the ground as it is: a porch up some steps, pads and houses on the ground', () => {
  const lay = layout(SITE, slope);
  const g = (lx, lz) => {
    const p = toWorld(SITE, lx, lz);
    return slope(p.x, p.z);
  };
  // the porch is over all the ground under the clubhouse, and the steps come down to it
  for (const [u, v] of [[CLUB.x0, EDGE], [CLUB.x1, EDGE], [CLUB.x0, CLUB.z1], [CLUB.x1, CLUB.z1]]) assert.ok(lay.deck > g(u, v) + 0.3, 'the deck is up off the ground');
  const last = lay.steps.at(-1);
  assert.ok(lay.steps.length >= 1);
  assert.ok(last.top - g(0, last.z0) < 0.25, 'the last step is a step over the ground');
  for (let i = 1; i < lay.steps.length; i++) assert.ok(lay.steps[i].top < lay.steps[i - 1].top && near(lay.steps[i].z1, lay.steps[i - 1].z0, 1e-9), 'each step down, and out');
  assert.ok(near(lay.steps[0].z1, EDGE, 1e-9) && near(last.z0, EDGE - lay.steps.length * TREAD, 1e-9));
  for (const p of lay.pads) assert.ok(p.top > p.low && p.top - p.low < 0.4, `pad ${p.n} lies on the ground`);
  for (const k of ['H', 'L']) assert.ok(near(lay.mouths[k].y - lay.houses[k].floor, HOUSES[k].mouth.up, 1e-9), 'each house throws from its height');
  assert.ok(near(lay.cross.y - g(0, FIELD.cross), FIELD.crossUp, 1e-9));
});

test('built: you can walk up the steps to the hatch, stand on every pad, and not walk into a house', () => {
  const lay = layout(SITE, slope);
  const mat = new THREE.MeshBasicMaterial();
  const built = buildClub(SITE, lay, slope, { outside: mat, inside: mat, glow: mat });
  assert.ok(built.object.children.length >= 3);
  const solids = new Solids();
  solids.set(built, built.solids);
  // the top of what you'd stand on at a spot in the club's frame
  const standOn = (lx, lz) => {
    const p = toWorld(SITE, lx, lz);
    let top = slope(p.x, p.z);
    solids.forEachNear(p.x, p.z, 1, (s) => {
      const hit = {};
      segDist(p.x, p.z, s.ax, s.az, s.bx, s.bz, hit);
      if (hit.d < s.r) top = Math.max(top, s.topA + (s.topB - s.topA) * hit.t);
    });
    return top;
  };
  assert.ok(near(standOn(COUNTER.x, COUNTER.z), lay.deck, 0.01), 'at the hatch, on the porch');
  let was = standOn(0, EDGE + 0.5);
  for (const s of lay.steps) {
    const at = standOn(0, (s.z0 + s.z1) / 2);
    assert.ok(was - at < 0.25 && was - at > 0, 'a step down at a time');
    was = at;
  }
  for (const [i, s] of STATIONS.entries()) assert.ok(near(standOn(s.x, s.z), lay.pads[i].top, 0.01), `on station ${s.n}`);
  for (const [k, h] of Object.entries(HOUSES)) {
    const mid = standOn((h.box[0] + h.box[2]) / 2, (h.box[1] + h.box[3]) / 2);
    assert.ok(mid >= lay.houses[k].floor + h.height, `the ${h.name} is solid`);
  }
  assert.ok(standOn(0, (CLUB.z0 + CLUB.z1) / 2) > lay.deck + 3, 'and so is the clubhouse');
  assert.ok(HATCH[2] > COUNTER.x && HATCH[0] < COUNTER.x, 'the hatch is in front of where you stand to be served');
  assert.ok(built.blockers.length >= 5, 'the camera keeps out of the clubhouse and the houses');
});

// ── The field at work ───────────────────────────────────────────────────────

function rangeOn(ground = () => 0) {
  const site = { x: 300, z: 200, yaw: -0.4, base: 0, plan: [PLAN] };
  const lay = layout(site, ground);
  const heard = [];
  const scene = { add() {}, remove() {} };
  let n = 0;
  const range = new Range({ scene, site, lay, ground, chips: null, sound: { call: (kind) => heard.push(kind) }, rnd: () => (n++ % 7) / 7 });
  return { site, lay, range, heard };
}
// eye height on a pad
const eye = (pad) => ({ x: pad.x, y: pad.top + 1.6, z: pad.z });
const run = (range, s, at) => {
  for (let t = 0; t < s; t += 1 / 60) range.update(1 / 60, at.x, at.z);
};
const toward = (from, p) => {
  const l = Math.hypot(p.x - from.x, p.y - from.y, p.z - from.z);
  return { x: (p.x - from.x) / l, y: (p.y - from.y) / l, z: (p.z - from.z) / l };
};

test('on station 1 a click calls for a round; the target is thrown a moment later, and a shot with lead breaks it', () => {
  const { lay, range, heard } = rangeOn();
  const pad = lay.pads[0];
  const me = eye(pad);
  assert.equal(range.stationAt(pad.x, pad.top, pad.z), 1);
  assert.equal(range.stationAt(pad.x + 2, pad.top, pad.z), 0);
  let st = range.status(pad.x, pad.top, pad.z);
  assert.equal(st.state, 'pull');
  assert.equal(st.need, 1, 'a single: one shell');
  assert.match(st.prompt, /station 1 · high house · <b>click<\/b> call pull: a round of skeet/);
  assert.equal(range.status(lay.pads[3].x, lay.pads[3].top, lay.pads[3].z).state, 'wait', 'not from station 4');
  const said = [];
  range.on('scored', (e) => said.push(e));
  assert.ok(range.pull());
  assert.ok(range.round, 'a round under way');
  assert.equal(range.status(pad.x, pad.top, pad.z).state, 'wait', 'pull!');
  assert.equal(range.fired(me, toward(me, lay.cross), me), null, 'nothing to shoot at yet');
  run(range, 1, pad);
  assert.equal(range.air.length, 1, 'thrown');
  assert.deepEqual(heard, ['trap']);
  assert.equal(range.status(pad.x, pad.top, pad.z).state, 'flying');
  run(range, 0.4, pad);
  const c = range.air[0];
  const m = meeting(c, me);
  const hit = range.fired(me, toward(me, m.p), me);
  assert.equal(hit.broke, 1, 'led just right: broken');
  run(range, 0.2, pad);
  assert.equal(range.air.length, 0, 'gone to bits');
  assert.ok(heard.includes('clay'));
  assert.deepEqual(said.map((e) => [e.dead, e.score, e.shot]), [[{ H: true }, 1, 1]]);
  st = range.status(pad.x, pad.top, pad.z);
  assert.equal(st.state, 'pull');
  assert.match(st.prompt, /low house/);
});

test("shot where it is, a target is lost, and the coach says why; one that's never shot at is lost when it comes down", () => {
  const { lay, range } = rangeOn();
  const pad = lay.pads[0];
  const me = eye(pad);
  const said = [];
  range.on('scored', (e) => said.push(e));
  range.pull();
  run(range, 1.4, pad);
  const c = range.air[0];
  // a metre and a half behind it, as you see it go
  const look = toward(me, c);
  const along = c.vx * look.x + c.vy * look.y + c.vz * look.z;
  const across = { x: c.vx - along * look.x, y: c.vy - along * look.y, z: c.vz - along * look.z };
  const l = Math.hypot(across.x, across.y, across.z);
  const miss = range.fired(me, toward(me, { x: c.x - (across.x / l) * 1.5, y: c.y - (across.y / l) * 1.5, z: c.z - (across.z / l) * 1.5 }), me);
  assert.equal(miss.broke, 0);
  assert.deepEqual(miss.lost, ['H'], 'its shell spent: lost');
  assert.equal(said[0].said, 'behind it');
  assert.equal(range.fired(me, toward(me, c), me), null, "there's nothing left to shoot at in this throw");
  run(range, 4, pad);
  assert.equal(range.air.length, 0);
  assert.equal(range.landed.length, 1, 'it lies on the field, whole');
  // the option: thrown again
  assert.deepEqual(range.next, { station: 1, kind: 'H', option: true });
  range.pull();
  run(range, 6, pad);
  assert.equal(said.length, 2, 'never shot at: lost when it came down');
  assert.equal(said[1].dead.H, false);
  assert.equal(range.round.score, 0);
});

test('a double is thrown from both houses at once and wants two shells; a round left behind is given up', () => {
  const { lay, range } = rangeOn();
  const pad = lay.pads[0];
  // the singles at station 1 shot
  range.round = new Round();
  range.round.record({ H: true });
  range.round.record({ L: true });
  assert.equal(range.status(pad.x, pad.top, pad.z).need, 2);
  range.pull();
  run(range, 1, pad);
  assert.deepEqual(range.air.map((c) => c.house).sort(), ['H', 'L']);
  const me = eye(pad);
  const first = range.fired(me, { x: 0, y: -1, z: 0 }, me);
  assert.deepEqual(first.lost, [], 'one shot in: neither lost yet');
  const second = range.fired(me, { x: 0, y: -1, z: 0 }, me);
  assert.deepEqual(second.lost.sort(), ['H', 'L'], 'both shells spent');
  let gaveUp = false;
  range.on('abandon', () => (gaveUp = true));
  run(range, 0.1, { x: pad.x + 400, z: pad.z });
  assert.ok(gaveUp && !range.round, 'walked away: no round');
});

test('a whole round shot clean is 25 of 25, from station 1 round to 8', () => {
  const { lay, range } = rangeOn();
  let done = null;
  range.on('round', (e) => (done = e));
  const stations = [];
  for (let k = 0; k < 40 && !done; k++) {
    const next = range.next;
    const pad = lay.pads[next.station - 1];
    stations.push(next.station);
    assert.equal(range.status(pad.x, pad.top, pad.z).state, 'pull', `station ${next.station}`);
    range.pull();
    run(range, 1, pad);
    const me = eye(pad);
    for (const c of [...range.air]) {
      while (c.t < 0.45) range.update(1 / 60, pad.x, pad.z);
      const m = meeting(c, me);
      range.fired(me, toward(me, m.p), me);
    }
    run(range, 4, pad);
  }
  assert.deepEqual(done, { score: 25, of: 25 });
  assert.deepEqual([...new Set(stations)], [1, 2, 3, 4, 5, 6, 7, 8]);
  const card = range.card();
  assert.equal(card.done, true);
  assert.equal(card.results.filter(Boolean).length, 25);
});

// ── The shotgun ─────────────────────────────────────────────────────────────

// A bench with nothing round it (build/builder.js): flat ground, no animals,
// the buttons as `io` (right-click as `alt`, pressed that frame); and a
// skeet field that says what it's told to.
function bench(field) {
  const flashed = [];
  const taps = new Set();
  const b = {
    aimO: new THREE.Vector3(0, 3, 4),
    aimD: new THREE.Vector3(0, -0.05, -1).normalize(),
    player: { pos: new THREE.Vector3(0, 0, 0), eye: 1.6, sight: null, character: { tools: {}, play() {} } },
    input: { holding: () => false, tapped: (w) => taps.has(w) },
    sound: { sfx() {} },
    chips: { burst() {} },
    chunks: { heightAt: () => 0, forEachPlant() {} },
    buildings: null,
    act: null,
    idle: false,
    face() {},
    dropHold() {},
    deny() {
      flashed.push('denied');
    },
    flash: (m) => flashed.push(m),
    swing(anim, dur, hitAt, onHit) {
      this.act = { t: 0, dur, hitAt: dur * hitAt, hit: false, onHit };
    },
  };
  const tool = shotgunTool({ wildlife: { aimed: () => null, kill() {}, startle() {} }, which: () => true, carcasses: { near: () => null }, skeet: field });
  b.current = tool;
  tool.setup(b);
  // a frame of the bench: a swing runs on, or the tool works the buttons
  b.frame = ({ alt = false, ...io } = {}, dt = 1 / 30) => {
    if (alt) taps.add('alt');
    tool.update(b, dt);
    taps.clear();
    if (b.act) {
      const a = b.act;
      a.t += dt;
      if (!a.hit && a.t >= a.hitAt) {
        a.hit = true;
        a.onHit();
      }
      if (a.t >= a.dur) b.act = null;
      return;
    }
    b.tgt = tool.target(b);
    tool.work(b, b.tgt, { use: false, alt, useTap: false, altTap: alt, dt, ...io });
  };
  b.until = (fn) => {
    for (let i = 0; i < 300 && !fn(); i++) b.frame();
    return fn();
  };
  return { b, tool, flashed };
}

test('the shotgun is loaded for each throw as skeet is shot: one shell for a single, two for a double, then the call', () => {
  const calls = [];
  const fired = [];
  let state = 'pull';
  let need = 1;
  const field = {
    status: () => ({ state, need, prompt: 'station 1' }),
    pull: () => calls.push(need),
    fired: (o, d, from) => {
      fired.push(from);
      return { broke: 1, lost: [] };
    },
  };
  const { b, tool } = bench(field);
  assert.equal(tool.shells, SHELLS);
  assert.equal(tool.kit, 'guns', "in the rifle's slot");
  b.frame();
  assert.match(b.tgt.prompt, /station 1 · <b>right-click<\/b> mount/);
  b.frame({ useTap: true });
  assert.ok(tool.loading, 'broken open to load one');
  assert.ok(b.until(() => calls.length === 1), 'and then the call');
  assert.equal(tool.shells, 1);
  // the target's in the air: a click shoots, and the field is told
  state = 'flying';
  b.until(() => !b.act);
  b.frame({ useTap: true });
  assert.equal(fired.length, 1);
  assert.ok(near(fired[0].y, 1.6, 1e-9), 'from the eye');
  assert.equal(tool.shells, 0);
  b.until(() => !b.act);
  b.frame({ useTap: true });
  assert.equal(fired.length, 1, 'empty, with a throw in the air: nothing');
  assert.ok(!tool.loading, "and it doesn't load till the throw is over");
  // a double: two in, then the call
  state = 'pull';
  need = 2;
  b.frame({ useTap: true });
  assert.ok(b.until(() => calls.length === 2));
  assert.equal(tool.shells, 2);
  // waiting for the targets: a click does nothing
  state = 'wait';
  b.frame({ useTap: true });
  assert.equal(calls.length, 2);
  // off the field, empty: two shells in
  state = null;
  field.status = () => null;
  tool.fill(0);
  b.frame();
  assert.ok(tool.loading);
  b.until(() => !tool.loading);
  assert.equal(tool.shells, SHELLS);
});

test("a shotgun that isn't yours does nothing, and says where to get one", () => {
  let fired = 0;
  const field = { status: () => ({ state: 'flying', prompt: '' }), pull() {}, fired: () => fired++ };
  const { b, flashed } = bench(field);
  let mine = false;
  const tool = shotgunTool({ wildlife: { aimed: () => null, kill() {}, startle() {} }, which: () => true, carcasses: { near: () => null }, skeet: field, owned: () => mine, notYours: 'ask at the club' });
  b.current = tool;
  tool.setup(b);
  b.tgt = tool.target(b);
  assert.deepEqual(b.tgt, { type: 'none', bad: true, prompt: 'ask at the club' });
  tool.work(b, b.tgt, { useTap: true, dt: 1 / 30 });
  assert.equal(fired, 0);
  assert.deepEqual(flashed, ['denied']);
  mine = true;
  b.tgt = tool.target(b);
  tool.work(b, b.tgt, { useTap: true, dt: 1 / 30 });
  assert.equal(fired, 1, 'given one: it fires');
});

test('right-click mounts the shotgun and it stays mounted till right-click again; loaded for a throw, it comes down and back up', () => {
  let state = 'pull';
  const field = { status: () => ({ state, need: 1, prompt: 'station 1' }), pull() {}, fired: () => ({ broke: 1, lost: [] }) };
  const { b, tool } = bench(field);
  b.frame({ alt: true });
  assert.ok(tool.mounted, 'mounted');
  assert.deepEqual(b.player.sight, { zoom: MOUNT_ZOOM });
  for (let i = 0; i < 20; i++) b.frame();
  assert.ok(tool.mounted, 'and still, with the button let go');
  assert.match(b.tgt.prompt, /station 1 · <b>right-click<\/b> lower it/);
  // the call: loaded with one, down for it, and up again after
  b.frame({ useTap: true });
  b.frame();
  assert.ok(tool.loading && !tool.mounted, 'down to load it');
  assert.ok(b.until(() => !tool.loading));
  b.frame();
  assert.ok(tool.mounted, 'and up again');
  state = 'flying';
  b.frame({ alt: true });
  assert.ok(!tool.mounted, 'right-click again: lowered');
  assert.equal(b.player.sight, null);
  // mounted and put away: down, and still down when taken up again
  b.frame({ alt: true });
  tool.put(b);
  b.frame();
  assert.ok(!tool.mounted);
});
