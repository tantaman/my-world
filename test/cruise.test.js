// The cruise ship: where her pier is (grown from the seed, and pinned, since
// it's a place on the map people track); that her decks hang together —
// every room on each can be walked to, nothing sticks out through her side,
// the stairs climb a deck in steps a body can take; that the staterooms are
// numbered the way a ship's are and grown the same every time; the lifts;
// the slides, which have to end in the pool; and the pools themselves, which
// you can swim in and climb out of.

import test from 'node:test';
import assert from 'node:assert/strict';
import { growWorld, LANDS } from '../src/world/lands.js';
import { Sites } from '../src/landmarks/sites.js';
import { Towns } from '../src/towns/towns.js';
import { Caves } from '../src/caves/caves.js';
import { Lines, clearOfPlaces, clearOfCaves } from '../src/railway/lines.js';
import { HIKES } from '../src/world/hikes.js';
import { Landforms } from '../src/world/landforms.js';
import { SEA } from '../src/world/sea.js';
import { Basins } from '../src/world/basins.js';
import { standHeight, SWIM_DEPTH } from '../src/player/player.js';
import { toWorld } from '../src/landmarks/sites.js';
import { findSite as findPad, clearOf as padClear } from '../src/spaceport/site.js';
import { findSite as findStore, clearOf as storeClear } from '../src/videostore/site.js';
import { Airports } from '../src/airports/airports.js';
import { findBerth, clearOf, PIER } from '../src/cruise/site.js';
import { layout, walls, floorStrips, flights, towerFlights, cabinsOn, cabinByNo, roomAt, deckAt, deckY, halfBeam, poolBed, subtract, intersect, DECKS, CORES, CORE, POOLS, TOWER, FIRST, LAST, HALF_BEAM, DRAFT, WALL_T, DECK_H, isCabinDeck } from '../src/cruise/plan.js';
import { stateroom, describe, pickYours, PALETTES } from '../src/cruise/cabins.js';
import { LiftRide, LIFT, travelTime, moveAt, moveTime } from '../src/cruise/lifts.js';
import { SLIDES, path, Ride, RIDE } from '../src/cruise/slides.js';
import { glyph } from '../src/videostore/font.js';
import { matchesGolden } from './helpers/golden.js';

const SEED = 20261119;
const STEP_UP = 0.28; // the player's (player/player.js)

// The world as the game has it: what the berth keeps clear of, made the way
// their features make them.
function worldOf(land) {
  const gen = growWorld(SEED, [], land);
  const start = gen.findSpawn(0, 0);
  const landforms = new Landforms(HIKES);
  const keepHike = (x0, z0, x1, z1) => !!landforms.reaches(x0, z0, x1, z1);
  const sites = new Sites(gen, { start });
  const caves = new Caves({ gen, keepOff: keepHike });
  const lines = new Lines(gen, { start, keepClear: [clearOfPlaces(sites), clearOfCaves((a, b, c, d) => caves.inBox(a, b, c, d))], keepOff: keepHike });
  const towns = new Towns(gen, { start, sites, keepOff: keepHike });
  const clear = padClear({ landforms, sites, towns, caves, lines });
  const pad = findPad(gen, start, clear);
  const store = findStore(gen, start, storeClear({ landforms, sites, towns, caves, lines, spaceport: pad }));
  const keepAir = (x0, z0, x1, z1) => clear(x0, z0, x1, z1) || !!(pad && pad.box[0] <= x1 && pad.box[2] >= x0 && pad.box[1] <= z1 && pad.box[3] >= z0);
  const home = new Airports(gen, { cards: HIKES.map(({ load, ...card }) => card), start, keepOff: keepAir }).site('home');
  const boxes = [pad && pad.box, store && store.box, home && home.box];
  return { gen, start, boxes, keepOff: clearOf({ landforms, sites, towns, caves, lines, boxes }) };
}

test('her pier is grown from the seed: the same every time, on the coast, in water deep enough for her, clear of what was there first', () => {
  for (const land of LANDS) {
    const { gen, start, boxes, keepOff } = worldOf(land);
    const b = findBerth(gen, start, keepOff);
    assert.ok(b, `land ${land} has a berth`);
    assert.deepEqual(findBerth(gen, start, keepOff), b, 'and the same one again');
    const d = Math.hypot(b.x - start.x, b.z - start.z);
    assert.ok(d > 300 && d < 2600, `a walk from the start (${d.toFixed(0)} m)`);
    // deep water under her and round her
    const w = {};
    for (const x of [-HALF_BEAM - 4, 0, HALF_BEAM + 4]) {
      for (let z = -150; z <= 150; z += 15) {
        toWorld(b, x, z, w);
        assert.ok(gen.height(w.x, w.z) < SEA.level - DRAFT - 1, `deep enough under her at (${x}, ${z})`);
      }
    }
    // the trestle meets the land as high as its deck, past the pier head
    assert.ok(b.land > PIER.x1, 'the trestle runs out from the land');
    toWorld(b, b.land, 0, w);
    assert.ok(gen.height(w.x, w.z) >= b.top - 0.6, 'it starts on the land, as high as its deck');
    assert.equal(b.y, SEA.level);
    assert.ok(!keepOff(...b.box), 'clear of everything it keeps clear of');
    for (const o of boxes.filter(Boolean)) assert.ok(o[2] < b.box[0] || o[0] > b.box[2] || o[3] < b.box[1] || o[1] > b.box[3], 'the launch site, the video store and the airfield among them');
    const round = (v) => Math.round(v * 1000) / 1000;
    matchesGolden(land > 1 ? `cruise-${SEED}-land${land}` : `cruise-${SEED}`, { id: b.id, x: round(b.x), z: round(b.z), yaw: round(b.yaw), land: round(b.land), door: { x: round(b.door.x), z: round(b.door.z) } }, { tolerance: 1e-6 });
  }
});

test('there is a berth for other seeds too', () => {
  for (const seed of [42, 7, 99]) {
    const gen = growWorld(seed, [], LANDS[LANDS.length - 1]);
    assert.ok(findBerth(gen, gen.findSpawn(0, 0)), `seed ${seed}`);
  }
});

// ── Her decks ────────────────────────────────────────────────────────────────

// Which rooms of deck n can't be walked to from its lift lobbies: the floor
// rasterised finely, the walls drawn on it as thick as a body is wide.
function unreachable(n) {
  const G = 0.2;
  const L = layout(n);
  const W = walls(L);
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const r of L.rooms) {
    z0 = Math.min(z0, r.z0 - 1);
    z1 = Math.max(z1, r.z1 + 1);
  }
  const x0 = -HALF_BEAM - 1;
  const nx = Math.ceil((2 * HALF_BEAM + 2) / G);
  const nz = Math.ceil((z1 - z0) / G);
  const ok = new Uint8Array(nx * nz);
  const inside = (x, z, list) => list.some(([a, b, c, d]) => x > a && x < c && z > b && z < d);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) * G;
      const z = z0 + (j + 0.5) * G;
      if (inside(x, z, L.holes) || inside(x, z, L.pools) || inside(x, z, L.blocks)) continue;
      if (L.rooms.some((m) => !m.crew && x >= m.x0 && x <= m.x1 && z >= m.z0 && z <= m.z1)) ok[j * nx + i] = 1;
    }
  }
  const segD = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax;
    const dz = bz - az;
    const l = dx * dx + dz * dz;
    const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l)) : 0;
    return Math.hypot(px - ax - dx * t, pz - az - dz * t);
  };
  for (const w of W) {
    const a = Math.floor((Math.min(w.x0, w.x1) - 0.4 - x0) / G);
    const b = Math.ceil((Math.max(w.x0, w.x1) + 0.4 - x0) / G);
    const c = Math.floor((Math.min(w.z0, w.z1) - 0.4 - z0) / G);
    const d = Math.ceil((Math.max(w.z0, w.z1) + 0.4 - z0) / G);
    for (let j = Math.max(0, c); j < Math.min(nz, d); j++) {
      for (let i = Math.max(0, a); i < Math.min(nx, b); i++) {
        if (segD(x0 + (i + 0.5) * G, z0 + (j + 0.5) * G, w.x0, w.z0, w.x1, w.z1) < WALL_T / 2 + 0.2) ok[j * nx + i] = 0;
      }
    }
  }
  const seen = new Uint8Array(nx * nz);
  const q = [];
  for (const c of CORES.filter((k) => n <= k.top)) {
    const k = Math.floor((c.z - z0) / G) * nx + Math.floor(-x0 / G);
    seen[k] = 1;
    q.push(k);
  }
  while (q.length) {
    const k = q.pop();
    const i = k % nx;
    const j = (k - i) / nx;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const m = b * nx + a;
      if (seen[m] || !ok[m]) continue;
      seen[m] = 1;
      q.push(m);
    }
  }
  const lost = [];
  for (const r of L.rooms) {
    if (r.crew || r.kind === 'sill') continue;
    let found = false;
    for (let j = Math.floor((r.z0 - z0) / G); j <= Math.floor((r.z1 - z0) / G) && !found; j++) {
      for (let i = Math.floor((r.x0 - x0) / G); i <= Math.floor((r.x1 - x0) / G); i++) {
        if (seen[j * nx + i]) {
          found = true;
          break;
        }
      }
    }
    if (!found) lost.push(r.id);
  }
  return lost;
}

test('every room on every deck can be walked to from the lifts', () => {
  for (const { n } of DECKS) assert.deepEqual(unreachable(n), [], `deck ${n}`);
});

test('nothing sticks out through her side, and every deck has a floor where its rooms are', () => {
  for (const { n } of DECKS) {
    const L = layout(n);
    for (const r of L.rooms) {
      const reach = Math.min(halfBeam(r.z0), halfBeam(r.z1));
      assert.ok(Math.max(Math.abs(r.x0), Math.abs(r.x1)) <= reach + 0.01, `deck ${n}: ${r.id} is inside her`);
      assert.ok(r.x1 > r.x0 && r.z1 > r.z0, `deck ${n}: ${r.id} has room in it`);
    }
    const strips = floorStrips(L);
    const floored = (x, z) => strips.some((s) => Math.abs(s.x - x) <= s.r && z >= s.z0 && z <= s.z1);
    for (const r of L.rooms) {
      const cx = (r.x0 + r.x1) / 2;
      const cz = (r.z0 + r.z1) / 2;
      const open = [...L.holes, ...L.pools].some(([a, b, c, d]) => cx > a && cx < c && cz > b && cz < d);
      if (!open && !r.crew) assert.ok(floored(cx, cz), `deck ${n}: a floor in the middle of ${r.id}`);
    }
    // every deck's floor has names in the lifts
    assert.ok(DECKS.find((d) => d.n === n).says.length > 3);
  }
  assert.equal(deckAt(deckY(9) + 0.1), 9);
  assert.equal(deckAt(deckY(9) + 2.3), 9);
  assert.equal(deckAt(deckY(9) - 0.3), 9, 'a little under it too, on the stairs');
  assert.equal(roomAt(4, 0, 30).kind, 'atrium');
});

test('her staterooms are numbered as a ship\'s are, each with a door onto a corridor', () => {
  const all = [];
  for (let n = FIRST; n <= LAST; n++) all.push(...cabinsOn(n));
  assert.ok(all.length > 1500 && all.length < 2200, `about the size of a real ship's (${all.length})`);
  assert.equal(new Set(all.map((c) => c.no)).size, all.length, 'no number twice');
  for (const c of all) {
    assert.equal(Math.floor(c.no / 1000), c.deck, `${c.no} starts with its deck`);
    assert.equal(c.no % 2 === 0, c.side > 0, `${c.no}: even to port, odd to starboard`);
    assert.ok(isCabinDeck(c.deck));
    assert.equal(cabinByNo(c.no), c);
    const r = roomAt(c.deck, c.door.x + c.door.nx * 0.3, c.door.z);
    assert.equal(r && r.cabin, c.no, `${c.no}: its door opens into it`);
    const out = roomAt(c.deck, c.door.x - c.door.nx * 0.3, c.door.z);
    assert.equal(out && out.kind, 'corridor', `${c.no}: ...from a corridor`);
    assert.ok(c.x1 - c.x0 >= 5, `${c.no} is deep enough for a bed`);
  }
  // counting up from forward to aft, along each row
  const row = cabinsOn(9).filter((c) => c.side > 0 && c.kind !== 'inside');
  for (let i = 1; i < row.length; i++) assert.ok(row[i].no > row[i - 1].no && row[i].z0 < row[i - 1].z0, 'numbered from forward aft');
  assert.ok(cabinsOn(8).some((c) => c.balcony) && cabinsOn(7).every((c) => !c.balcony) && cabinsOn(13).some((c) => c.kind === 'suite'));
});

test('a stateroom is grown the same every time, and yours is one with a balcony', () => {
  const c = cabinsOn(10)[20];
  assert.deepEqual(stateroom(SEED, c), stateroom(SEED, c));
  let taken = 0;
  let dnd = 0;
  const list = cabinsOn(10);
  for (const k of list) {
    const s = stateroom(SEED, k);
    if (s.taken) taken++;
    if (s.dnd) {
      dnd++;
      assert.ok(s.taken, 'only a booked room wants leaving alone');
    }
    assert.ok(PALETTES.includes(s.palette));
    if (!s.made) assert.equal(s.towel, null, 'no towel animal on a bed not made');
  }
  assert.ok(taken > list.length * 0.7 && taken < list.length, 'most are booked');
  assert.ok(dnd > 0 && dnd < list.length * 0.2);
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 20; i++) {
    const no = pickYours(rnd);
    const k = cabinByNo(no);
    assert.equal(k.kind, 'balcony');
    assert.ok(k.deck >= 8 && k.deck <= 12);
  }
  assert.match(describe(cabinByNo(9100)), /^Stateroom 9100 · balcony · deck 9, port side, forward$/);
});

test('the stairs climb a deck in two flights of steps a body can take, and the next flight starts where the last one ends', () => {
  for (const c of CORES) {
    for (let n = FIRST; n < c.top; n++) {
      const f = flights(c, n);
      const tops = [deckY(n), ...f.map((t) => t.top), deckY(n + 1)];
      for (let i = 1; i < tops.length; i++) assert.ok(tops[i] - tops[i - 1] <= STEP_UP && tops[i] >= tops[i - 1], `core ${c.id}, deck ${n}: step ${i} is a step`);
      assert.ok(Math.abs(f[f.length - 1].top - (deckY(n + 1) - DECK_H / 18)) < 0.01, 'the last tread is a riser under the next deck');
      // the stairwell is open where the flights are, on every deck but the bottom
      if (n > FIRST) assert.ok(layout(n).holes.some(([x0, z0, x1, z1]) => x0 <= -CORE.stair.half && x1 >= CORE.stair.half && z0 <= c.z + CORE.stair.back && z1 >= c.z + CORE.stair.top));
    }
    assert.deepEqual(flights(c, c.top), [], 'none up from the top');
  }
  const t = towerFlights();
  assert.ok(Math.abs(Math.max(...t.map((f) => f.top)) - (TOWER.top - DECK_H / 18)) < 0.01, 'the slide tower goes up to its platform');
});

test('rectangles cut and overlap', () => {
  assert.deepEqual(subtract([[0, 0, 10, 10]], [[2, 2, 4, 4]]).reduce((a, [x0, z0, x1, z1]) => a + (x1 - x0) * (z1 - z0), 0), 96);
  assert.deepEqual(intersect([[0, 0, 10, 10]], [[5, 5, 20, 20]]), [[5, 5, 10, 10]]);
  assert.deepEqual(subtract([[0, 0, 1, 1]], [[-1, -1, 2, 2]]), []);
});

// ── Lifts ────────────────────────────────────────────────────────────────────

test('a lift shuts its doors, goes, slows, and opens them on the deck you chose', () => {
  const from = deckY(5);
  const to = deckY(14);
  const r = new LiftRide(from, to);
  let t = 0;
  let fastest = 0;
  while (r.update(1 / 60)) {
    t += 1 / 60;
    if (r.phase === 'moving') assert.equal(r.doors, 0, 'never moving with its doors open');
    fastest = Math.max(fastest, Math.abs(r.speed));
    assert.ok(t < 60);
  }
  assert.equal(r.y, to);
  assert.equal(r.doors, 1);
  assert.ok(fastest <= LIFT.speed + 1e-6 && fastest > LIFT.speed * 0.9, `up to speed (${fastest.toFixed(2)} m/s)`);
  assert.ok(Math.abs(t - travelTime(from, to)) < 0.05);
  assert.ok(travelTime(deckY(4), deckY(5)) < travelTime(deckY(4), deckY(16)), 'further takes longer');
  // a short hop never gets up to speed, and gets there all the same
  assert.ok(Math.abs(moveAt(1, moveTime(1)) - 1) < 1e-9);
  assert.ok(moveAt(30, moveTime(30) / 2) > 14 && moveAt(30, moveTime(30) / 2) < 16);
});

// ── Slides ───────────────────────────────────────────────────────────────────

test('both slides go down, quickly but not too, clear of the decks, and end in the splash pool', () => {
  const pool = POOLS.find((p) => p.splash);
  const level = deckY(pool.deck) + pool.rim - pool.free;
  const strips = new Map([15, 16].map((n) => [n, floorStrips(layout(n))]));
  const over = (n, x, z) => strips.get(n).some((s) => Math.abs(s.x - x) <= s.r && z >= s.z0 && z <= s.z1);
  for (const sl of SLIDES) {
    const p = path(sl);
    const r = new Ride(p);
    let fastest = 0;
    let t = 0;
    while (r.update(1 / 60)) {
      t += 1 / 60;
      fastest = Math.max(fastest, r.v);
      assert.ok(t < 60);
    }
    assert.ok(r.t > 5 && r.t < 30, `${sl.id}: ${r.t.toFixed(1)} s down`);
    assert.ok(fastest <= RIDE.most && fastest > 5, `${sl.id}: ${fastest.toFixed(1)} m/s at most`);
    const end = p.pts[p.pts.length - 1];
    assert.ok(end[0] > pool.x0 && end[0] < pool.x1 && end[2] > pool.z0 && end[2] < pool.z1, `${sl.id} ends over the pool`);
    assert.ok(end[1] > level && end[1] < level + 1.2, `${sl.id} ends just over the water`);
    // clear of the decks it goes over, but where it comes down over the
    // pool's edge into it
    const M = 2.5;
    for (const q of p.pts) {
      const nearPool = q[0] > pool.x0 - M && q[0] < pool.x1 + M && q[2] > pool.z0 - M && q[2] < pool.z1 + M;
      if (nearPool) continue;
      for (const n of [15, 16]) if (q[1] > deckY(n) && over(n, q[0], q[2])) assert.ok(q[1] - deckY(n) > 2.1, `${sl.id} clears deck ${n} at (${q.map((v) => v.toFixed(1))})`);
    }
    assert.ok(Math.abs(p.pts[0][1] - TOWER.top) < 0.5, `${sl.id} starts at the top of the tower`);
  }
  const [a, b] = SLIDES.map((s) => path(s).pts);
  let closest = Infinity;
  for (const p of a) for (const q of b) closest = Math.min(closest, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
  assert.ok(closest > 3, `the slides keep apart (${closest.toFixed(1)} m)`);
});

// ── Pools ────────────────────────────────────────────────────────────────────

test('a pool is water held up on her deck: deep enough to swim in, with steps out', () => {
  const basins = new Basins();
  const p = POOLS.find((k) => k.id === 'main');
  const y = deckY(p.deck);
  const level = y + p.rim - p.free;
  const owner = {};
  basins.set(owner, [{ x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1, level, contains: (x, z) => x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1, bedAt: (x, z) => y + poolBed(p, x, z) }]);
  const out = {};
  const mid = [(p.x0 + p.x1) / 2 + 3, (p.z0 + p.z1) / 2];
  // over the sea, as she is: the land's water is far below
  const world = { heightAt: () => -60, waterAt: (x, z, o) => Object.assign(o, { level: -32, depth: 28, flowX: 0, flowZ: 0, foam: 0 }) };
  assert.ok(basins.at(mid[0], mid[1], level - 1, out));
  assert.equal(out.level, level);
  assert.ok(out.depth > SWIM_DEPTH, 'out of your depth in the middle');
  assert.equal(standHeight(world, mid[0], mid[1], SWIM_DEPTH, level - 1, null, basins), level - SWIM_DEPTH, 'so you float');
  assert.equal(basins.at(mid[0], mid[1], level + 5, out), null, 'not from high over it');
  assert.equal(basins.at(p.x0 - 1, mid[1], level, out), null, 'nor beside it');
  // the steps at the aft end: each a step up from the last, from floating to the rim
  const sx = (p.x0 + p.x1) / 2;
  let prev = level - SWIM_DEPTH;
  for (let z = p.z0 + 2.6; z > p.z0; z -= 0.2) {
    const bed = y + poolBed(p, sx, z);
    assert.ok(bed - prev <= STEP_UP + 1e-9, `the steps at ${z.toFixed(1)} are a step up`);
    prev = Math.max(prev, bed);
  }
  assert.ok(y + p.rim - prev <= p.rim + 0.08, 'and the rim a step from the top one');
  basins.clear(owner);
  assert.equal(basins.at(mid[0], mid[1], level - 1, out), null);
  // the hot tubs have a bench to sit on, and are shallow enough to stand in
  for (const t of POOLS.filter((k) => k.tub)) assert.ok(t.deep < SWIM_DEPTH && poolBed(t, t.x0 + 0.2, (t.z0 + t.z1) / 2) > poolBed(t, (t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2));
});

test('her name and every sign aboard can be spelled in the little font', () => {
  const words = ['HALCYON', 'MERIDIAN', 'THE LANTERN ROOM', 'GUEST SERVICES', 'WELCOME ABOARD', 'AFTERGLOW', 'CASINO', 'THE COMPASS BAR', 'CAFE MISTRAL', 'BUBBLES', 'THEATRE', 'THE GALLEY MARKET', 'PROMENADE', 'POOL BAR', 'MINI GOLF', 'THE CORKSCREW', 'THE PLUNGE', 'ALL ABOARD', 'CRUISE TERMINAL', 'TIDEWATER CRUISES', 'DECK 16', 'FWD 9100-9152'];
  for (const w of words) for (const ch of w) assert.ok(glyph(ch), `"${ch}" in "${w}"`);
});
