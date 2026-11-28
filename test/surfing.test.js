// Surfing: where the breaks are (grown from the seed without changing what
// it grows, and pinned: a break's id is in your save once you've tracked
// it), how their waves come in and break, and riding one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { growWorld, LANDS } from '../src/world/lands.js';
import { SurfSpots, SURF } from '../src/surfing/spots.js';
import { Breakers, BREAKER, BREAKER_GLSL, SHORE_N, DEPTH_N, CREST_N, crestTable, depthAt } from '../src/world/breakers.js';
import { Surfer } from '../src/surfing/surfer.js';
import { Ride, RIDE } from '../src/surfing/ride.js';
import { HIKES } from '../src/world/hikes.js';
import { Landforms } from '../src/world/landforms.js';
import { matchesGolden } from './helpers/golden.js';
import { earthAtFirst } from './helpers/earth.js';
// The real Earth under the world, as the game has it when it opens (world/earth.js).
const EARTH = await earthAtFirst();

const SEED = 20261119;
const gen = growWorld(SEED, [], 1, [], EARTH);
const spots = new SurfSpots(gen);
// the squares along the real coast nearest the start: the Strait of Juan de
// Fuca, 36 km north (the Pacific's beaches are a little further, west)
const ALONG = { i: [-9, -2], j: [-28, -23] };
const around = (s) => {
  const list = [];
  for (let j = ALONG.j[0]; j <= ALONG.j[1]; j++) for (let i = ALONG.i[0]; i <= ALONG.i[1]; i++) {
    const b = s.cell(i, j);
    if (b) list.push(b);
  }
  return list;
};
const near = around(spots);
const start = gen.findSpawn(0, 0);
const nearest = near.reduce((a, b) => (Math.hypot(b.x - start.x, b.z - start.z) < Math.hypot(a.x - start.x, a.z - start.z) ? b : a));

for (const land of LANDS) for (const seed of [SEED, 42]) {
  test(`seed ${seed}, land ${land}: where the breaks are`, () => {
    const s = seed === SEED && land === 1 ? spots : new SurfSpots(growWorld(seed, [], land, [], EARTH));
    const list = around(s).map((b) => ({ id: b.id, name: b.name, kind: b.kind, x: b.x, z: b.z, nx: b.nx, nz: b.nz, size: b.size, period: b.period, peel: b.peel, reach: b.reach, far: b.far, fetch: b.fetch }));
    assert.ok(list.length >= 3, `${list.length} squares along the coast have one`);
    matchesGolden(land > 1 ? `surf-spots-${seed}-land${land}` : `surf-spots-${seed}`, list, { tolerance: 1e-6 });
  });
}

test('breaks are grown from the seed: the same every time, one on the coast nearest the start, and none elsewhere for another seed', () => {
  const again = new SurfSpots(growWorld(SEED, [], 1, [], EARTH));
  for (const b of near) assert.deepEqual(again.cell(b.i, b.j), b);
  const d = Math.hypot(nearest.x - start.x, nearest.z - start.z);
  assert.ok(d < 50000, `the nearest is on the real coast, ${d.toFixed(0)} m from the start`);
  const other = new SurfSpots(growWorld(42, [], 1, [], EARTH));
  assert.notDeepEqual(other.cell(nearest.i, nearest.j)?.x, nearest.x);
});

test('a break is on the waterline, open sea in front, its shore and seabed as the land has them', () => {
  const L = gen.sea.level;
  for (const b of near) {
    assert.ok(Math.abs(gen.forestHeight(b.x, b.z, 0) - L) < 1.5, `${b.id}: its point is on the shore`);
    for (const u of SURF.clear.out) assert.ok(L - gen.forestHeight(b.x + b.nx * u, b.z + b.nz * u, 0) > SURF.clear.deep, `${b.id}: open water ${u} m out`);
    assert.ok(gen.forestHeight(b.beach.x, b.beach.z, 0) > L, `${b.id}: dry sand behind it`);
    assert.equal(b.shore.length, SHORE_N);
    assert.equal(b.depth.length, DEPTH_N);
    for (let k = 1; k < DEPTH_N; k++) assert.ok(b.depth[k] >= b.depth[k - 1], `${b.id}: the sea gets no shallower going out`);
    // no steeper than a bar, where the waves are concerned
    for (let k = 1; k < DEPTH_N; k++) assert.ok(b.depth[k] <= SURF.bar * ((b.far * k) / (DEPTH_N - 1)) + 0.01 * k + 1e-4);
    assert.ok(b.reach[0] + b.reach[1] >= SURF.ride, `${b.id}: a ride's worth of shore`);
    assert.ok(['peak', 'left', 'right'].includes(b.kind));
    // each kept well inside its square, so no two are near each other
    assert.ok(b.x >= b.i * SURF.cell + SURF.inset - 120 && b.x <= (b.i + 1) * SURF.cell - SURF.inset + 120);
  }
});

test('no break is grown where a real place reaches, and everywhere else they are as they were', () => {
  // told from the hikes' cards alone: their land is never fetched here
  const landforms = new Landforms(HIKES);
  const found = new SurfSpots(gen, { keepOff: (x0, z0, x1, z1) => !!landforms.reaches(x0, z0, x1, z1) });
  for (const card of HIKES) {
    const [i, j] = SurfSpots.square(...card.at);
    assert.equal(found.cell(i, j), null, `none on ${card.id}`);
  }
  for (const b of near) {
    const C = SURF.cell;
    const pad = SURF.span + SURF.far[1];
    if (!landforms.reaches(b.i * C - pad, b.j * C - pad, (b.i + 1) * C + pad, (b.j + 1) * C + pad)) assert.deepEqual(found.cell(b.i, b.j), b);
  }
});

test('a break changes nothing the seed grows', () => {
  const before = near.map((b) => gen.height(b.x + b.nx * 20, b.z + b.nz * 20));
  const after = near.map((b) => growWorld(SEED, [], 1, [], EARTH).height(b.x + b.nx * 20, b.z + b.nz * 20));
  assert.deepEqual(after, before);
});

// ── The waves ───────────────────────────────────────────────────────────────

test('the shader is handed tables as big as the waves are worked out from', () => {
  const uniforms = readFileSync(new URL('../src/render/uniforms.js', import.meta.url), 'utf8');
  const sized = (name) => Number(new RegExp(`${name}: vec4s\\((\\d+)\\)`).exec(uniforms)?.[1]);
  assert.equal(sized('uBreakShore') * 4, SHORE_N);
  assert.equal(sized('uBreakDepth') * 4, DEPTH_N);
  assert.equal(sized('uBreakCrest') * 4, CREST_N);
  assert.equal(sized('uBreakWaves') * 2, BREAKER.waves);
  assert.match(BREAKER_GLSL, /vec4 breakers\(vec2 rel\)/);
});

test('a crest comes in slowing as the water shoals, up the beach and gone', () => {
  const { crest, end } = crestTable(nearest.depth, nearest.far);
  assert.equal(crest[0], nearest.far);
  for (let i = 1; i < CREST_N; i++) assert.ok(crest[i] < crest[i - 1], 'always in');
  assert.ok(crest[CREST_N - 1] <= -BREAKER.runup + 0.5);
  // slower near the shore: the last tenth of the time covers less than the first
  const n = Math.floor(CREST_N / 10);
  assert.ok(crest[CREST_N - 1 - n] - crest[CREST_N - 1] < crest[0] - crest[n]);
  assert.ok(end > 10 && end < 90, `${end.toFixed(0)} s from coming in to gone`);
});

// The break, with a big wave of a set just coming in.
function setWave(b) {
  const br = new Breakers(null);
  br.set(b);
  br.update(3);
  let k = Math.floor(400 / b.period);
  while (br._wave(k).h < 0.8 * b.size) k++;
  br.time = br._wave(k).at + 0.01;
  br.update(0);
  return { br, k };
}
// ...and where its crest is at v along the shore, over its life.
function follow(b, v) {
  const { br, k } = setWave(b);
  const life = [];
  for (let t = 0; t < 120; t += 0.1) {
    const i = br.waves.findIndex((w) => w.k === k);
    if (i < 0 && t > 5) break;
    const a = i >= 0 ? br.waveAt(i, v, {}) : null;
    if (a) life.push({ t, ...a });
    br.update(0.1);
  }
  return life;
}

test('a wave stands up as it comes in, breaks about as high as the water is deep, and rolls in white', () => {
  const life = follow(nearest, 0);
  const broke = life.find((a) => a.r < 1);
  assert.ok(broke, 'it breaks');
  const before = life.filter((a) => a.r >= 1);
  for (let i = 1; i < before.length; i++) assert.ok(before[i].H >= before[i - 1].H - 1e-6, 'taller as it comes in');
  assert.ok(before.at(-1).face < before[0].face, 'its face draws up steeper');
  // breaks where the water is about as deep as the wave stands high
  const last = before.at(-1);
  const depth = depthAt(nearest.depth, nearest.far, broke.U);
  assert.ok(Math.abs(broke.H / BREAKER.gamma - depth) < 0.25 * depth, `${broke.H.toFixed(2)} m high in ${depth.toFixed(2)} m of water`);
  assert.ok(last.H < broke.H * 1.2);
  // the lip falls, then it's white water, smaller, up the beach
  assert.ok(life.some((a) => a.lip > 0 && a.lip < 1) && life.some((a) => a.lip > 1));
  assert.ok(life.at(-1).H < broke.H * 0.5);
  assert.ok(life.at(-1).U < 1, 'up to the shore');
});

test('the break runs along the crest from the peak at the speed it peels', () => {
  const at = (v) => follow(nearest, v).find((a) => a.r < 1).t;
  const side = nearest.kind === 'right' ? -1 : 1;
  const t0 = at(side * 20);
  const t1 = at(side * 80);
  const speed = 60 / (t1 - t0);
  assert.ok(Math.abs(speed - nearest.peel) < nearest.peel * 0.35, `${speed.toFixed(1)} m/s along, peeling at ${nearest.peel}`);
});

test('the water rises with a wave, under its crest, and runs in with it', () => {
  const br = new Breakers(null);
  br.set(nearest);
  br.update(5);
  let most = null;
  const tx = -nearest.nz;
  const tz = nearest.nx;
  for (let u = 0; u < nearest.far; u += 1) {
    const s = br.sample(nearest.x + nearest.nx * u + tx * 10, nearest.z + nearest.nz * u + tz * 10, {});
    if (s && (!most || s.rise > most.rise)) most = { u, ...s, wave: s.wave && { ...s.wave } };
  }
  assert.ok(most && most.rise > 0.3, `a wave stands ${most?.rise.toFixed(2)} m up`);
  assert.ok(Math.abs(most.wave.x) < 2, 'its crest is where it stands highest');
  // the water under it goes in toward the shore
  assert.ok(most.fx * nearest.nx + most.fz * nearest.nz < 0);
  assert.equal(br.sample(nearest.x + 5000, nearest.z, {}), null, 'and nothing away from the break');
});

// ── Riding ──────────────────────────────────────────────────────────────────

// The sea at a break, for a surfer: the waves of the breakers, and the depth
// as the land has it.
function seaAt(b) {
  const br = new Breakers(null);
  br.set(b);
  return seaOf(br);
}
function seaOf(br) {
  return {
    br,
    sea: {
      level: gen.sea.level,
      at(x, z, out) {
        if (!br.sample(x, z, out)) {
          out.rise = out.gx = out.gz = out.fx = out.fz = 0;
          out.wave = null;
        }
        return out;
      },
      depth: (x, z) => gen.sea.level - gen.forestHeight(x, z, 0),
    },
  };
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Steering toward a heading: + is right, which turns you clockwise from above.
const toward = (sf, aim) => -Math.max(-1, Math.min(1, wrap(aim - sf.yaw) * 3));

// Someone who knows what they're doing: waits out past the break facing
// in, paddles as a big one comes, stands up as it takes them, and runs along
// its face the way it peels, holding the middle of it.
function surfAWhile(b, secs) {
  const { br, sea } = seaAt(b);
  const sf = new Surfer(sea);
  const tx = -b.nz;
  const tz = b.nx;
  const side = b.kind === 'right' ? -1 : 1;
  // out past where the set waves break (as world.surfing.go() puts you)
  const out = Math.max(30, (b.size / BREAKER.gamma / SURF.bar) * 1.2);
  const lineup = () => sf.reset(b.x + b.nx * out + tx * 22 * side, b.z + b.nz * out + tz * 22 * side, Math.atan2(-b.nx, -b.nz));
  lineup();
  const got = { rides: [], crashes: [], moves: [] };
  let up = 0;
  sf.on('pop', () => (up = br.time));
  sf.on('off', (why) => got.rides.push({ time: br.time - up, why }));
  sf.on('crash', (why) => got.crashes.push(why));
  sf.on('turn', (t) => got.moves.push(t.name));
  sf.on('beach', () => {
    if (sf.mode === 'riding') got.rides.push({ time: br.time - up, why: 'ridden in' });
    lineup();
  });
  sf.on('up', lineup);
  sf.on('off', lineup);
  const dt = 1 / 60;
  for (let t = 0; t < secs; t += dt) {
    br.update(dt);
    const w = sf.wave;
    const c = { steer: 0, push: 0, pop: false, crouch: false, duck: false, sprint: true };
    if (sf.mode === 'prone') {
      const u = (sf.x - b.x) * b.nx + (sf.z - b.z) * b.nz;
      if (u < out - 8 && !(w && w.x < 0)) {
        // pushed in: back out, ducking what's broken
        c.steer = toward(sf, Math.atan2(b.nx, b.nz));
        c.push = 1;
        c.duck = !!(w && w.lip > 0.3);
      } else {
        c.steer = toward(sf, Math.atan2(-b.nx, -b.nz));
        c.push = w && w.H > 0.5 && w.x > -2 ? 1 : 0;
        c.pop = sf.caught;
      }
    } else if (sf.mode === 'riding') {
      if (w) {
        const along = Math.atan2(w.iz * side, -w.ix * side);
        const inn = Math.atan2(w.ix, w.iz);
        const down = Math.max(-0.7, Math.min(0.7, (w.x / w.face + 0.45) * 0.9));
        c.steer = toward(sf, along + Math.sign(wrap(inn - along)) * down);
      } else c.steer = toward(sf, Math.atan2(tx * side + b.nx * 0.5, tz * side + b.nz * 0.5));
      c.push = 1;
    }
    sf.step(dt, c);
  }
  return got;
}

test('out past the break, someone who knows how catches waves and rides them a good way', () => {
  const got = surfAWhile(nearest, 300);
  assert.ok(got.rides.length >= 3, `${got.rides.length} waves ridden in five minutes`);
  const longest = Math.max(...got.rides.map((r) => r.time));
  assert.ok(longest > 10, `the longest for ${longest.toFixed(1)} s`);
  assert.ok(got.crashes.length < got.rides.length / 3, `and most of them ended on their feet (${got.crashes.length} wipeouts)`);
});

test('stood up under a falling lip, you go over with it; lying down, white water shoves you in, unless you duck', () => {
  const b = nearest;
  // the moment the biggest wave's lip is falling at the peak
  const life = follow(b, 0);
  const falling = life.find((a) => a.lip > 0.55 && a.lip < 0.8);
  const { br, k } = setWave(b);
  const { sea } = seaOf(br);
  br.update(falling.t);
  const i = br.waves.findIndex((w) => w.k === k);
  const a = br.waveAt(i, 0, {});
  const sf = new Surfer(sea);
  // on the face, just under the crest
  sf.reset(b.x + b.nx * (a.u - 0.3), b.z + b.nz * (a.u - 0.3), Math.atan2(-b.nz, b.nx));
  sf.stand();
  sf.fresh = 0;
  let why = null;
  sf.on('crash', (w) => (why = w));
  sf.step(1 / 60, { steer: 0, push: 0 });
  assert.match(why || '', /lip/);

  // lying down in the white water behind it: shoved in, or not, ducking
  const shoved = (duck) => {
    const { br: b2 } = setWave(b);
    const { sea: s2 } = seaOf(b2);
    b2.update(falling.t + 0.8);
    const j = b2.waves.findIndex((w) => w.k === k);
    const c = b2.waveAt(j, 0, {});
    const p = new Surfer(s2);
    p.reset(b.x + b.nx * (c.u - 0.5), b.z + b.nz * (c.u - 0.5), Math.atan2(b.nx, b.nz));
    for (let t = 0; t < 0.8; t += 1 / 60) {
      b2.update(1 / 60);
      p.step(1 / 60, { steer: 0, push: 0, duck });
    }
    return -(p.vx * b.nx + p.vz * b.nz);
  };
  const free = shoved(false);
  const ducked = shoved(true);
  assert.ok(free > 0.5, `shoved in at ${free.toFixed(1)} m/s`);
  assert.ok(ducked < free * 0.5, `ducking, ${ducked.toFixed(1)} m/s`);
});

test("a wave's tally: up on it for long enough, the face and what you did on it, lost if you fall", () => {
  const r = new Ride();
  r.start();
  r.update(1, 8, true);
  assert.equal(r.bank(), 0, 'a wave too short to count');
  r.start();
  for (let t = 0; t < RIDE.least + 1; t += 0.5) r.update(0.5, 6, true);
  assert.equal(r.add('snap', 220), 220);
  assert.equal(r.add('snap', 220), 110, 'the same twice running is worth half');
  assert.equal(r.add('cutback', 300), 300);
  const face = (RIDE.least + 1) * 6 * RIDE.face;
  assert.equal(r.bank(), Math.round(face + 630));
  r.start();
  r.update(3, 6, true);
  r.add('air', 400);
  assert.ok(r.lose() > 400);
  assert.equal(r.bank(), 0, 'nothing banked once fallen');
});
