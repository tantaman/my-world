// The real Earth under the world (src/world/earth.js): the land is the
// Earth's, its seas, coasts, plains and mountains where they really are and
// as high as they really are, and each part of it the country its climate
// makes it, from the start in the Hoh rain forest to the far side of the
// world. What matters most here: you start where you should, a hike stands
// on the Earth at its real height, and the Earth is the same whichever order
// its tiles come in.

import test from 'node:test';
import assert from 'node:assert/strict';
import { project, unproject, ORIGIN } from '../src/core/geo.js';
import { Earth, EARTH, MOUNTAIN, encodeTile, decodeTile, inflate, tileName, treelineOf, snowlineOf, TILE_CELLS, CLIMATE_W, CLIMATE_H } from '../src/world/earth.js';
import { EARTH_TILES } from '../src/world/earthTiles.js';
import { COUNTRY, EARTH_COUNTRY } from '../src/world/country.js';
import { growWorld } from '../src/world/lands.js';
import { HIKES } from '../src/world/hikes.js';
import { loadHike, reachOf, Landforms } from '../src/world/landforms.js';
import { SEA } from '../src/world/sea.js';
import { NotYet, isNotYet } from '../src/core/notYet.ts';
import { Searches } from '../src/core/searches.ts';
import { earthFor, around } from './helpers/earth.js';
import { parseKoppen, coastDistance, W, H } from '../tools/earth/build.js';

const SEED = 20261119;
const S = EARTH.scale;
// Game (x, z) of a real place.
const at = (lat, lon) => project(lat, lon, S);
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`);
// A peak stands at least this much of its real height (the mountains' finer
// heights are a minute of arc apart, from elevation a few hundred metres to a
// pixel: a needle is a little lower than it is).
const PEAK_LEAST = 0.94;

// ── The projection ───────────────────────────────────────────────────────────
test('the world is the Earth laid out round the Hoh, and can be read back', () => {
  assert.deepEqual(unproject(0, 0, S), [ORIGIN.lat, ORIGIN.lon]);
  for (const [lat, lon] of [[29.7467, -90.1377], [20.71, -156.25], [45.46, 6.89], [-33.9, 151.2], [-47.8, 56.1], [64.1, -21.9], [0, 0]]) {
    const [x, z] = at(lat, lon);
    const [la, lo] = unproject(x, z, S);
    // (to a centimetre, even near the far side, where it's weakest)
    near(la, lat, 1e-7, `latitude of ${lat}, ${lon}`);
    near(lo, lon, 1e-7, `longitude of ${lat}, ${lon}`);
  }
  // the Hoh's own coast is west of it, and Seattle east: x is east, z south
  const [x, z] = at(47.6, -122.33);
  assert.ok(x > 20000 && z > 0, 'Seattle is east and a little south of the middle');
});

// ── A tile's bytes ───────────────────────────────────────────────────────────
test('a tile packs down and comes back, to within what it is stored to', () => {
  const N = TILE_CELLS * TILE_CELLS;
  const land = new Float32Array(N);
  const sea = new Float32Array(N);
  const coast = new Float32Array(N);
  const relief = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    const i = k % TILE_CELLS;
    const j = (k - i) / TILE_CELLS;
    land[k] = 1 + ((i * 37 + j * 11) % 4000);
    sea[k] = -((i * 13 + j * 7) % 6000);
    coast[k] = ((i - j) % 120) * 0.5;
    relief[k] = (i * j) % 900;
  }
  const back = decodeTile(encodeTile({ land, sea, coast, relief }));
  for (let k = 0; k < N; k += 7) {
    // the land a quarter of a metre at the shore, a few percent of the height higher up
    near(back.land[k], land[k], 0.3 + land[k] * 0.035, 'land');
    near(back.sea[k], sea[k], 1 + -sea[k] * 0.07, 'sea');
    near(back.coast[k], Math.max(-63, Math.min(63, coast[k])), 0.26, 'coast');
    near(back.relief[k], relief[k], 1 + Math.sqrt(relief[k]) * 0.6, 'relief');
  }
  assert.equal(back.mountains, null, 'and no mountains, where none were');
  // and a range of mountains' finer heights, to within half their step
  const flags = new Uint8Array(N);
  const cells = [];
  for (let k = 0; k < N; k += 11) {
    flags[k] = 1;
    cells.push(k);
  }
  const SUB2 = (MOUNTAIN.perDegree / 12) ** 2;
  const heights = new Float32Array(cells.length * SUB2);
  cells.forEach((k, o) => {
    for (let s = 0; s < SUB2; s++) heights[o * SUB2 + s] = land[k] + 1800 * Math.sin(k + s * 0.7);
  });
  const again = decodeTile(encodeTile({ land, sea, coast, relief, mountains: { flags, heights } }));
  assert.equal(again.mountains.index[1], -1, 'a cell with none says so');
  cells.forEach((k, o) => {
    const at = again.mountains.index[k];
    for (let s = 0; s < SUB2; s++) near(again.mountains.heights[at + s], heights[o * SUB2 + s], MOUNTAIN.step / 2 + 0.01, 'a finer height');
  });
});

test('every tile of the Earth is there, and the climate', async () => {
  assert.equal(Object.keys(EARTH_TILES).length, 288, '24 × 12 tiles, 15° square');
  assert.equal(tileName(0, 0), 'n90w180');
  assert.equal(tileName(23, 11), 's75e165');
  const earth = await earthFor([]);
  const names = earth.climate.names;
  assert.equal(earth.climate.grid.length, CLIMATE_W * CLIMATE_H);
  // every climate the map has is a kind of country
  for (const c of names.slice(1)) assert.ok(COUNTRY[EARTH_COUNTRY.climate[c]], `${c} is a country (country.js, EARTH_COUNTRY)`);
  for (const v of Object.values(EARTH_COUNTRY.climate)) assert.ok(COUNTRY[v], `${v} is in the table`);
});

// ── What the importer works out ──────────────────────────────────────────────
test('the importer reads the climate map, and fills it out over the shore', () => {
  const text = 'Lat Lon Cls\n  47.75 -123.75 Cfb\n  47.75 -124.25 Csb\n  -0.25 10.25 Af\n';
  const { names, grid } = parseKoppen(text);
  assert.deepEqual(names, ['', 'Cfb', 'Csb', 'Af']);
  const cell = (lat, lon) => grid[Math.floor((90 - lat) * 2) * 720 + Math.floor((lon + 180) * 2)];
  assert.equal(names[cell(47.75, -123.75)], 'Cfb');
  assert.equal(names[cell(47.75, -124.75)], 'Csb', 'a cell out to sea takes the climate of the land next to it');
  assert.equal(cell(-30, -30), 0, 'and the open ocean says nothing');
});

test('the coast lies between the land and the sea, where the land is more land than sea', () => {
  const frac = new Float32Array(W * H);
  // a band of land, six cells wide, with a cell three-quarters land along its edge
  const j = 1000;
  for (let i = 0; i < W; i++) {
    for (let k = 0; k < 6; k++) frac[(j + k) * W + i] = 1;
    frac[(j + 6) * W + i] = 0.75;
  }
  const d = coastDistance(frac);
  assert.ok(d[(j + 2) * W + 500] > 15, 'inland, well away from the coast');
  assert.ok(d[(j + 6) * W + 500] > 0 && d[(j + 7) * W + 500] < 0, 'the coast between the mostly-land cell and the sea');
  assert.ok(d[(j + 20) * W + 500] < -100 / 2, 'and out at sea, far from it');
});

// ── The start ────────────────────────────────────────────────────────────────
test('you start in the real Hoh rain forest, by its river, under the Olympics, a walk from the Pacific', async () => {
  const earth = await earthFor([around(0, 0, 25000)]);
  for (const seed of [SEED, 42]) {
    const gen = growWorld(seed, [], 1, [], earth);
    const s = gen.findSpawn(0, 0);
    assert.ok(Math.hypot(s.x, s.z) < 600, `near the middle of the world (${Math.hypot(s.x, s.z).toFixed(0)} m)`);
    const up = (gen.height(s.x, s.z) - SEA.level) / S;
    assert.ok(up > 100 && up < 400, `on the valley floor, as high as it really is (${up.toFixed(0)} m)`);
    assert.ok(gen.forest(s.x, s.z) > 0.45 && gen.countryAt(s.x, s.z) === null, 'among the trees of the forest, which is what the Hoh is');
  }
  const gen = growWorld(SEED, [], 1, [], earth);
  // the Pacific, at Ruby Beach, 35 km west and a little south
  const [px, pz] = at(47.68, -124.45);
  gen.height(px, pz);
  assert.equal(gen.water.kind, 'sea', 'the Pacific is west of the start');
  assert.ok(Math.hypot(px, pz) / S < 45000, 'a long walk west');
  // Mount Olympus, 20 km east, with its glaciers
  const [ox, oz] = at(47.8013, -123.7108);
  let top = null;
  for (let dz = -1500; dz <= 1500; dz += 50) for (let dx = -1500; dx <= 1500; dx += 50) {
    const h = gen.broadHeight(ox + dx, oz + dz);
    if (!top || h > top[2]) top = [ox + dx, oz + dz, h];
  }
  const real = (top[2] - SEA.level) / S;
  assert.ok(real > 1900 && real < 2700, `Mount Olympus stands about as high as it does (${real.toFixed(0)} m)`);
  assert.ok(gen.snow(top[0], top[1], top[2]) > 0.9, 'with snow on its top');
  assert.ok(gen.above(top[0], top[1], top[2]) > 0.9, 'above the trees');
});

// ── Out on the Earth ─────────────────────────────────────────────────────────
// A world with the Earth under it, and the tiles for each place asked about.
async function onEarth(places, hikes = []) {
  const earth = await earthFor(places.map(([lat, lon]) => around(...at(lat, lon), 3000)));
  return growWorld(SEED, [], 1, hikes, earth);
}

test('the oceans are where the oceans are, and the land where the land is', async () => {
  const PACIFIC = [30, -140];
  const GULF = [28.2, -90.5];
  const KANSAS = [38.8, -98.5];
  const ZION = [37.3, -113.1];
  const gen = await onEarth([PACIFIC, GULF, KANSAS, ZION]);
  const height = ([lat, lon]) => gen.height(...at(lat, lon));
  const water = ([lat, lon]) => (gen.height(...at(lat, lon)), gen.water);
  assert.ok(height(PACIFIC) < SEA.level - 600, `the Pacific is deep (${(height(PACIFIC) - SEA.level).toFixed(0)} m)`);
  assert.equal(water(PACIFIC).kind, 'sea');
  assert.equal(water(PACIFIC).level, SEA.level, 'at the one level the sea stands at everywhere');
  assert.ok(height(GULF) < SEA.level, 'the Gulf of Mexico is sea');
  const k = height(KANSAS) - SEA.level;
  assert.ok(k > 300 && k < 800, `Kansas stands about as high as it really does (${k.toFixed(0)} m over the sea)`);
  const z = height(ZION) - SEA.level;
  assert.ok(z > 1250, `and the plateau round Zion higher still (${z.toFixed(0)} m)`);
});

test('a range of mountains is finer: its peaks stand about as high as they really do', async () => {
  // (the summit: lat, lon, and its real height, m)
  const PEAKS = {
    Rainier: [46.8523, -121.7603, 4392],
    Everest: [27.9881, 86.925, 8849],
    Aconcagua: [-32.6532, -70.0109, 6961],
    Denali: [63.0692, -151.007, 6190],
    Kilimanjaro: [-3.0674, 37.3556, 5895],
  };
  const e = {};
  for (const [name, [lat, lon, real]] of Object.entries(PEAKS)) {
    const [x, z] = at(lat, lon);
    const earth = await earthFor([around(x, z, 3000)]);
    // the highest point within a kilometre of the summit (5 km, really)
    let top = -Infinity;
    for (let dz = -1000; dz <= 1000; dz += 25) for (let dx = -1000; dx <= 1000; dx += 25) top = Math.max(top, earth.at(x + dx, z + dz, e).height / S);
    assert.ok(top > real * PEAK_LEAST && top < real * 1.02, `${name} stands ${top.toFixed(0)} m (really ${real})`);
    assert.equal(earth.at(x, z, e).mid, 1, `${name}'s range has its finer heights`);
  }
  // and a plain hasn't
  const [kx, kz] = at(38.8, -98.5);
  assert.equal((await earthFor([around(kx, kz, 3000)])).at(kx, kz, e).mid, 0, 'Kansas has none');
});

test('the country is the climate’s: a desert, a jungle, the northern forest, a swamp on the Gulf', async () => {
  const SAHARA = [23, 10];
  const AMAZON = [-3, -60];
  const SIBERIA = [62, 100];
  const BAYOU = [29.55, -90.45];
  const gen = await onEarth([SAHARA, AMAZON, SIBERIA, BAYOU]);
  const kind = ([lat, lon]) => {
    const c = gen.countryAt(...at(lat, lon));
    return Object.keys(COUNTRY).find((k) => COUNTRY[k] === c);
  };
  assert.equal(kind(SAHARA), 'desert');
  assert.equal(kind(AMAZON), 'jungle');
  assert.equal(kind(SIBERIA), 'boreal forest');
  assert.equal(kind(BAYOU), 'bayou', 'low, flat ground on the Gulf is the swamps of the delta');
  assert.ok(gen.forest(...at(...SAHARA)) < 0.05, 'nothing much grows in the Sahara');
  // the treeline comes down toward the poles
  const line = (lat, c = COUNTRY['deciduous forest']) => treelineOf(c, lat)[1];
  assert.ok(line(0) > 3500 && line(46) > 1800 && line(46) < 2300 && line(70) < 300, 'the treeline: high in the tropics, about 2,000 m in the Alps, at the sea in the Arctic');
  assert.ok(snowlineOf(COUNTRY['deciduous forest'], 46)[0] > line(46), 'and the snow that lies all summer above it');
  assert.ok(line(47.8, COUNTRY.forest) < line(47.8) && snowlineOf(COUNTRY.forest, 47.8)[0] < 2100, 'and lower on a wet coast: the Olympics have glaciers under 2,100 m');
});

test('a hike on the Earth stands at its real height, its sea at the sea’s', async () => {
  const cards = HIKES.filter((h) => ['kaihalulu', 'haleakala', 'jean-lafitte'].includes(h.id));
  const hikes = await Promise.all(cards.map(loadHike));
  const earth = await earthFor(cards.map((c) => around(c.at[0], c.at[1], reachOf(c) + 3000)));
  const gen = growWorld(SEED, [], 1, hikes, earth);
  for (const L of gen.landforms) near(L.offset, SEA.level + (L.def.base || 0) * L.def.scale, 1e-9, `${L.id}: its heights start from its real base`);
  // where Haleakalā's photo was taken, near the top: 3,000 m up
  const H = gen.landforms.find((L) => L.id === 'haleakala');
  const top = gen.height(H.cx + H.def.view.x, H.cz + H.def.view.z) - SEA.level;
  near(top / S, 2990, 150, 'the summit of Haleakalā, in real metres');
  // and where the real land gives way to the Earth's round it, they meet:
  // the same height on the whole (the Earth is the same land, coarser: it
  // rounds off a summit, so a real top stands a little over it), and no wall
  // between them
  const bare = growWorld(SEED, [], 1, [], earth);
  for (const L of gen.landforms) {
    let mean = 0;
    let worst = 0;
    let n = 0;
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      // (where both are land: a real place's sea has a bed of its own, a
      // few metres down, where the Earth's goes on down to its real depth)
      const real = L.ground(L.cx + Math.cos(a) * L.radius, L.cz + Math.sin(a) * L.radius) + L.offset;
      const round = bare.height(L.cx + Math.cos(a) * L.outer, L.cz + Math.sin(a) * L.outer);
      if (real > SEA.level && round > SEA.level) {
        mean += real - round;
        n++;
      }
      // (every 50 real m, from 500 inside its land to 500 past its edge)
      const step = 50 * S;
      let last = null;
      for (let r = L.radius - 500 * S; r <= L.outer + 500 * S; r += step) {
        const h = gen.height(L.cx + Math.cos(a) * r, L.cz + Math.sin(a) * r);
        if (last !== null && h > SEA.level) worst = Math.max(worst, Math.abs(h - last) / step);
        last = h;
      }
    }
    mean /= Math.max(1, n);
    assert.ok(Math.abs(mean) / S < 500, `${L.id}: the real land and the Earth's round it meet (${(mean / S).toFixed(0)} real m apart on the whole)`);
    assert.ok(worst < 3, `${L.id}: no wall round its edge (steepest ${worst.toFixed(2)})`);
  }
  // the sea off Kaihalulu is the Earth's sea, at its level, right up to the land's own
  const K = gen.landforms.find((L) => L.id === 'kaihalulu');
  assert.ok(K.rim, 'its sea opens onto the sea round it');
  const levels = new Set();
  for (const r of [K.radius * 0.8, K.radius, K.outer, K.outer + 500]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      gen.height(K.cx + Math.cos(a) * r, K.cz + Math.sin(a) * r);
      if (gen.water.region && (gen.water.kind === 'sea' || gen.water.kind === 'lake') && gen.water.edge < -5) levels.add(Math.round(gen.water.level * 100) / 100);
    }
  }
  assert.deepEqual([...levels], [SEA.level], 'one sea, at one level, inside its land and out');
  // and the bayou round Jean Lafitte is the bayou
  const J = gen.landforms.find((L) => L.id === 'jean-lafitte');
  const out = gen.countryAt(J.cx + J.outer + 1500, J.cz);
  assert.equal(out, COUNTRY.bayou, 'past its edge, the same country');
});

test('a hike changes the Earth only where it is, as it changes the forest', async () => {
  const card = HIKES.find((h) => h.id === 'angels-landing');
  const box = around(card.at[0], card.at[1], reachOf(card) + 800);
  const earth = await earthFor([box]);
  const bare = growWorld(SEED, [], 1, [], earth);
  const real = growWorld(SEED, [], 1, [await loadHike(card)], earth);
  const R = reachOf(card) + 1;
  for (let k = 0; k < 200; k++) {
    const a = (k / 200) * Math.PI * 2 * 3;
    const r = R + (k % 7) * 90;
    const [x, z] = [card.at[0] + Math.cos(a) * r, card.at[1] + Math.sin(a) * r];
    assert.equal(real.height(x, z), bare.height(x, z), `outside its reach, at ${r.toFixed(0)} m, the land is the Earth's`);
    assert.equal(real.water.level, bare.water.level, 'and so is the water');
  }
});

// ── Coming in a tile at a time ───────────────────────────────────────────────
test('asking about the Earth before its tile has come says so, and asks for it', async () => {
  const wanted = [];
  const { EARTH_DETAILS } = await import('../src/world/earthTiles.js');
  const earth = new Earth({ wants: (name) => wanted.push(name), places: HIKES, details: EARTH_DETAILS });
  const gen = growWorld(SEED, [], 1, [], earth);
  const [x, z] = at(29.73, -90.13);
  assert.throws(() => gen.height(x, z), (err) => isNotYet(err) && err instanceof NotYet);
  assert.ok(wanted.length > 0, 'and it was sent for');
  // once it's here, the world is as one grown with it from the start
  const full = await earthFor([around(x, z, 2000)]);
  for (const name of [...full.tiles.keys(), ...full.details.keys()]) gen.addEarth({ name, bytes: await tileBytesOf(name) });
  gen.addEarth({ climate: { names: full.climate.names, bytes: full.climate.grid } });
  const fresh = growWorld(SEED, [], 1, [], full);
  for (let k = 0; k < 40; k++) {
    const [px, pz] = [x + k * 37, z - k * 23];
    assert.equal(gen.height(px, pz), fresh.height(px, pz), 'the same land');
    assert.equal(gen.water.level, fresh.water.level, 'and the same water');
  }
});

// A tile's bytes, as landforms.js hands them over.
const tileBytesOf = async (name) => inflate((await (EARTH_TILES[name] || (await import('../src/world/earthTiles.js')).EARTH_DETAILS[name].load)()).default);

test('a search that asks about the Earth before it has come starts over when it has', () => {
  let here = false;
  let starts = 0;
  const s = new Searches({
    *grow() {
      starts++;
      yield;
      if (!here) throw new NotYet('the Earth');
      return 'found';
    },
  });
  assert.equal(s.peek('a'), undefined);
  s.pump(50);
  assert.equal(s.peek('a', undefined, false), undefined, 'not found while the Earth is away');
  here = true;
  s.pump(50);
  assert.equal(s.peek('a'), 'found', 'and found once it has come');
  assert.equal(starts, 2, 'having started over');
});

test('the Earth under the world is fetched as it is needed, with its climate', async () => {
  const { CLIMATE, EARTH_DETAILS } = await import('../src/world/earthTiles.js');
  const lf = new Landforms([], { tiles: EARTH_TILES, climate: CLIMATE, details: EARTH_DETAILS });
  const got = [];
  lf.on('earth', (t) => got.push(t.name || 'climate'));
  assert.ok(!lf.ready(-1000, -1000, 1000, 1000), 'the start is on it too');
  const [x, z] = at(20.8, -156.3);
  assert.ok(!lf.ready(x - 100, z - 100, x + 100, z + 100), "Maui's isn't here at first");
  await lf.earthUnder([[x - 100, z - 100, x + 100, z + 100]]);
  assert.ok(lf.ready(x - 100, z - 100, x + 100, z + 100), 'and then it is');
  assert.ok(got.includes('climate') && got.includes('n30w165'), `with the climate, and Maui's tile (${got.join(', ')})`);
  assert.equal(lf.earthHere.length, got.length, 'kept, for whoever grows a world of their own later');
});
