// Hikes: real places imported from photos (tools/hike.mjs) and grown into the
// world (src/world/landform.js). What matters most here is the last test: a
// hike changes the world only where it is, so the forest people have built
// in is left alone.

import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { readPhoto } from '../tools/hike/exif.js';
import { decodePng, encodePng } from '../tools/hike/png.js';
import { localFrame, tileXY, terrarium } from '../tools/hike/geo.js';
import { parseOsm, trails, waters } from '../tools/hike/osm.js';
import { buildHike, simplify, signedDistance } from '../tools/hike/build.js';
import { packHeights, unpackHeights, packShore, unpackShore } from '../src/world/landform.js';
import { WorldGen as Land1 } from '../src/world/worldgen.js';
import { withRealPlaces } from '../src/world/realPlaces.js';
import { generateVegetation } from '../src/world/chunkGen.js';
import { sampleFar } from '../src/hikes/farGrid.js';
import { NO_WATER } from '../src/world/water.js';
import { NET } from '../src/world/drainage.js';
import { HIKES } from '../src/world/hikes.js';
import { tiffExif, jpegWith, heifWith } from './helpers/photos.js';

// The first land with real places set into it, as lands.js grows every world.
const WorldGen = withRealPlaces(Land1);

const SEED = 20261119;
const TRUNK = { pine: 0.3, broad: 0.4, birch: 0.2, bush: 0, fern: 0, rock: 0.7, log: 0 };
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`);

// ── The photo ────────────────────────────────────────────────────────────────
const SHOT = { lat: 47.6062, lon: -121.2346, alt: 1210.5, bearing: 280.5, taken: '2019:07:14 09:45:12' };

for (const [kind, wrap] of [
  ['JPEG', jpegWith],
  ['HEIC', heifWith],
]) {
  test(`a ${kind} says where it was taken, which way it looked and when`, () => {
    const p = readPhoto(wrap(tiffExif(SHOT)));
    near(p.lat, SHOT.lat, 1e-6, 'latitude');
    near(p.lon, SHOT.lon, 1e-6, 'longitude (west is negative)');
    near(p.alt, SHOT.alt, 1e-3, 'altitude');
    near(p.bearing, SHOT.bearing, 1e-3, 'bearing');
    assert.equal(p.taken, SHOT.taken);
    near(p.hour, 9.75, 1e-9, 'hour');
  });
}

test('a photo with no EXIF is said to have none', () => {
  assert.throws(() => readPhoto(Uint8Array.of(0xff, 0xd8, 0xff, 0xda, 0, 2)), /no EXIF/);
});

// ── Elevation tiles ──────────────────────────────────────────────────────────
test('PNG rows come back whatever filter each was saved with', () => {
  const W = 5;
  const H = 5;
  const px = Uint8Array.from({ length: W * H * 3 }, (_, k) => (k * 37 + (k >> 2) * 11) & 255);
  // each row filtered a different way (0 none, 1 sub, 2 up, 3 average, 4 Paeth)
  const raw = [];
  const at = (x, y, c) => (x < 0 || y < 0 ? 0 : px[(y * W + x) * 3 + c]);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < H; y++) {
    raw.push(y);
    for (let x = 0; x < W; x++) {
      for (let c = 0; c < 3; c++) {
        const v = at(x, y, c);
        const pred = [0, at(x - 1, y, c), at(x, y - 1, c), (at(x - 1, y, c) + at(x, y - 1, c)) >> 1, paeth(at(x - 1, y, c), at(x, y - 1, c), at(x - 1, y - 1, c))][y];
        raw.push((v - pred) & 255);
      }
    }
  }
  const plain = Buffer.from(encodePng(W, H, px));
  // swap the plain encoding's pixels for the filtered ones
  const idat = deflateSync(Buffer.from(raw));
  const ihdrEnd = 8 + 25;
  const len = Buffer.alloc(4);
  len.writeUInt32BE(idat.length);
  const chunk = Buffer.concat([len, Buffer.from('IDAT'), idat, Buffer.alloc(4)]);
  const png = Buffer.concat([plain.subarray(0, ihdrEnd), chunk, plain.subarray(plain.length - 12)]);
  assert.deepEqual(decodePng(png).data, px);
  assert.deepEqual(decodePng(plain).data, px);
});

test('terrarium tiles and the tile grid', () => {
  assert.equal(terrarium(128, 0, 0), 0);
  near(terrarium(131, 52, 128), 820.5, 1e-9, 'elevation');
  const [x, y] = tileXY(0, 0, 3);
  assert.deepEqual([x, y], [4, 4]);
  const f = localFrame(48, -123);
  const [e, n] = f.toEN(48.01, -122.99);
  near(n, 1112, 2, 'a hundredth of a degree north');
  near(e, 745, 2, 'and east');
  const [la, lo] = f.toLatLon(e, n);
  near(la, 48.01, 1e-9, 'back');
  near(lo, -122.99, 1e-9, 'back');
});

test('OpenStreetMap: trails, and lakes joined from their ways', () => {
  const xml = `<osm>
    <node id="1" lat="0" lon="0"/><node id="2" lat="0" lon="0.01"/><node id="3" lat="0.01" lon="0.01"/>
    <node id="4" lat="0.01" lon="0"/><node id="5" lat="0.02" lon="0.02"><tag k="natural" v="peak"/><tag k="name" v="Top"/></node>
    <way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/></way>
    <way id="11"><nd ref="3"/><nd ref="4"/><nd ref="1"/></way>
    <way id="12"><nd ref="1"/><nd ref="5"/><tag k="highway" v="path"/><tag k="name" v="Up &amp; over"/></way>
    <relation id="20"><member type="way" ref="10" role="outer"/><member type="way" ref="11" role="outer"/>
      <tag k="type" v="multipolygon"/><tag k="natural" v="water"/><tag k="name" v="Mere"/></relation>
  </osm>`;
  const osm = parseOsm(xml);
  assert.deepEqual(trails(osm).map((t) => [t.name, t.points.length]), [['Up & over', 2]]);
  const w = waters(osm);
  assert.equal(w.length, 1);
  assert.equal(w[0].name, 'Mere');
  assert.equal(w[0].rings[0].length, 5, 'a closed ring of the four corners');
});

// ── Packing ──────────────────────────────────────────────────────────────────
test('heights and shores pack small and come back as they went', () => {
  const n = 23;
  const h = Float32Array.from({ length: n * n }, (_, k) => 40 * Math.sin(k * 0.3) + (k % n) * 3.7 - 12);
  const back = unpackHeights(packHeights(h, n), n);
  for (let k = 0; k < h.length; k++) near(back[k], h[k], 0.051, `height ${k}`);
  const d = Float32Array.from({ length: 50 }, (_, k) => (k - 25) * 1.3);
  const shore = unpackShore(packShore(d));
  for (let k = 0; k < d.length; k++) near(shore[k], Math.max(-63.5, Math.min(63.5, d[k])), 0.26, `shore ${k}`);
});

test('geometry: lines thin out, and inside is negative', () => {
  const line = Array.from({ length: 50 }, (_, k) => [k, Math.sin(k / 8) * 0.01]);
  assert.equal(simplify(line, 0.25).length, 2);
  const square = [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]];
  near(signedDistance(square, 5, 5), -5, 1e-9, 'middle');
  near(signedDistance(square, 13, 5), 3, 1e-9, 'outside');
});

// ── A made-up hike ───────────────────────────────────────────────────────────
// A round mountain, 600 m high, with a lake at its foot to the west and a
// trail up its west side to the top, where the photo was taken looking west.
const PHOTO = { lat: 46, lon: -121, bearing: 270, hour: 15.5 };
const frame = localFrame(PHOTO.lat, PHOTO.lon);
const LAKE_AT = [-1600, 0]; // east, north (real metres)
const LAKE_R = 500;
const LAKE_LEVEL = 400;
function elevation(lat, lon) {
  const [e, n] = frame.toEN(lat, lon);
  const r = Math.hypot(e, n);
  const ground = 400 + 600 * Math.exp(-((r / 900) ** 2)) + 60 * Math.max(0, r - 1200) / 1200;
  return Math.hypot(e - LAKE_AT[0], n - LAKE_AT[1]) < LAKE_R ? LAKE_LEVEL : ground;
}
const toLL = (e, n) => frame.toLatLon(e, n);
const TRAIL = Array.from({ length: 41 }, (_, k) => toLL(-1000 + k * 25, Math.sin(k / 3) * 20));
const LAKE = Array.from({ length: 49 }, (_, k) => toLL(LAKE_AT[0] + Math.cos((k / 48) * Math.PI * 2) * LAKE_R, LAKE_AT[1] + Math.sin((k / 48) * Math.PI * 2) * LAKE_R));
const AT = [5000, 2000];
const built = buildHike({
  id: 'made-up',
  name: 'Made-up Mountain',
  photo: PHOTO,
  elevation,
  trails: [{ name: 'Up', points: TRAIL }],
  waters: [{ name: 'Mere', rings: [LAKE] }],
  at: AT,
  radius: 2400,
  fade: 600,
  cell: 40,
});
const hike = built.def;

test('a hike is built from a photo, the land, the trails and the lakes', () => {
  assert.equal(hike.id, 'made-up');
  assert.deepEqual(hike.at, AT);
  assert.equal(hike.radius, 480);
  assert.equal(hike.fade, 120);
  assert.deepEqual(hike.view, { x: 0, z: 0, bearing: 270, hour: 15.5 });
  assert.equal(hike.trail.name, 'Up');
  near(hike.trail.length, 1000 * 0.2, 8, 'the walk is the trail to the photo, at 1:5');
  near(hike.trail.climb, (1000 - elevation(...toLL(-1000, 0))) * 0.2, 4, 'and it climbs to the top');
  // it starts at the trail's low end, heading up it (east)
  near(hike.trailhead.x, -200, 1, 'trailhead');
  near(Math.sin(hike.trailhead.yaw), 1, 0.05, 'heading east');
  assert.equal(hike.lakes.length, 1);
  assert.equal(hike.lakes[0].name, 'Mere');
  near(hike.lakes[0].level, 0, 1e-6, 'the lake is the lowest ground');
  assert.equal(built.preview.width, hike.ground.n);
  // and it can be written out and read back
  assert.deepEqual(JSON.parse(JSON.stringify(hike)), hike);
});

test('the world grows a hike: the real land, its trail, its lake', () => {
  const gen = new WorldGen(SEED, [], [hike]);
  const L = gen.lands[0];
  const at = (e, n) => [AT[0] + e * 0.2, AT[1] - n * 0.2];
  // the top is 600 real metres over the foot of the mountain: 120 m in the game
  const top = gen.height(...at(0, 0));
  const lake = gen.height(...at(-1600, 0));
  assert.ok(top - gen.water.level > 100, `the top stands ${top - lake} m over the lake`);
  // in the lake
  gen.height(...at(-1600, 0));
  assert.equal(gen.water.kind, 'lake');
  assert.ok(gen.water.region && gen.water.edge < -50, 'well out in the water');
  assert.ok(lake < gen.water.level - 3, 'over a deep bed');
  // on the trail, half way up
  const [tx, tz] = at(-500, Math.sin(20 / 3) * 20);
  assert.ok(gen.pathMask(tx, tz) > 0.9, 'on the trail');
  // its tread is cut level into the hillside: across it, the ground is the
  // height of the trail's middle
  L.trail(tx, tz + 0.4);
  near(L.ground(tx, tz + 0.4), L.raw(L.tx, L.tz), 1e-6, 'the tread is level');
  // the trailhead stands at the level of the forest round the hike
  let sum = 0;
  for (let k = 0; k < 64; k++) sum += gen._baseHeight(L.cx + Math.cos((k / 64) * Math.PI * 2) * L.outer, L.cz + Math.sin((k / 64) * Math.PI * 2) * L.outer);
  near(L.raw(L.cx + L.trailhead.x, L.cz + L.trailhead.z) + L.offset, sum / 64, 1e-6, 'settled');
  // and nothing of the forest's own water is on it
  for (let z = -480; z <= 480; z += 40) {
    for (let x = -480; x <= 480; x += 40) {
      gen.height(AT[0] + x, AT[1] + z);
      if (gen.water.region) assert.equal(gen.water.kind, 'lake', `${gen.water.kind} at ${x}, ${z}`);
    }
  }
});

test('nothing grows where the photo was taken, nor in front of it', () => {
  const gen = new WorldGen(SEED, [], [hike]);
  const [vx, vz] = AT;
  for (const [cx, cz] of [[Math.floor(vx / 64) - 1, Math.floor(vz / 64)], [Math.floor(vx / 64), Math.floor(vz / 64)], [Math.floor(vx / 64), Math.floor(vz / 64) - 1]]) {
    const v = generateVegetation(gen, cx, cz, 64, TRUNK);
    for (const k of ['pine', 'broad', 'birch']) {
      for (let o = 0; o < v.lists[k].length; o += 7) {
        const dx = v.lists[k][o] - vx;
        const dz = v.lists[k][o + 2] - vz;
        assert.ok(Math.hypot(dx, dz) > 5.5, `a ${k} ${Math.hypot(dx, dz).toFixed(1)} m from the view`);
        // the photo looked west: nothing straight in front for 20 m
        if (dx < 0 && Math.abs(dz) < -dx * 0.5) assert.ok(-dx > 20, `a ${k} ${-dx} m in front of the view`);
      }
    }
  }
});

test('a hike leaves the water outside it alone', () => {
  const plain = new WorldGen(SEED, []);
  const withHike = new WorldGen(SEED, [], [hike]);
  // the drainage network is worked out over the forest alone: the same, node
  // for node, so no river is rerouted and no lake raised anywhere
  const ci = Math.floor(AT[0] / NET.cell);
  const cj = Math.floor(AT[1] / NET.cell);
  for (let j = -12; j <= 12; j += 2) {
    for (let i = -12; i <= 12; i += 2) {
      const [a, b] = [plain.water.net, withHike.water.net];
      const na = a.node(ci + i, cj + j);
      const nb = b.node(ci + i, cj + j);
      assert.deepEqual([b.acc(nb), b.level(nb)], [a.acc(na), a.level(na)], `node ${i}, ${j}`);
    }
  }
  // and once clear of the hike, the water on the ground is the same too
  const L = withHike.lands[0];
  for (let k = 0; k < 96; k++) {
    const t = (k / 96) * Math.PI * 2;
    const x = L.cx + Math.cos(t) * (L.outer + 300);
    const z = L.cz + Math.sin(t) * (L.outer + 300);
    const [ha, hb] = [plain.height(x, z), withHike.height(x, z)];
    const [wa, wb] = [plain.water, withHike.water];
    assert.deepEqual([hb, wb.level, wb.kind, wb.edge], [ha, wa.level, wa.kind, wa.edge], `at ${Math.round(x)}, ${Math.round(z)}`);
  }
});

test('the far view sees the lake from the top', () => {
  const gen = new WorldGen(SEED, [], [hike]);
  const g = sampleFar(gen, AT[0] - 400, AT[1] - 200, 21, 20);
  let wet = 0;
  let level = NO_WATER;
  for (let k = 0; k < g.water.length; k++) {
    if (g.water[k] > NO_WATER * 0.5) wet++;
    level = Math.max(level, g.water[k]);
  }
  assert.ok(wet > 20, `${wet} points of lake`);
  assert.ok(g.h[10 * 21 + 20] > level + 100, 'and the mountain over it');
});

// ── The hikes in the game ────────────────────────────────────────────────────
test('the hikes in the game keep their distance from each other and from where people start', () => {
  assert.equal(new Set(HIKES.map((h) => h.id)).size, HIKES.length, 'each has its own id');
  for (const h of HIKES) {
    assert.ok(Math.hypot(...h.at) - h.radius - h.fade > 1500, `${h.id} is out in the world`);
    for (const o of HIKES) if (o !== h) assert.ok(Math.hypot(h.at[0] - o.at[0], h.at[1] - o.at[1]) > h.radius + h.fade + o.radius + o.fade, `${h.id} and ${o.id} overlap`);
  }
});

test('the hikes leave the rest of the world exactly as it was', () => {
  const plain = new WorldGen(SEED, []);
  const withHikes = new WorldGen(SEED, [], HIKES);
  for (let z = -600; z <= 600; z += 37) {
    for (let x = -600; x <= 600; x += 37) {
      const a = [plain.height(x, z), plain.water.level, plain.pathMask(x, z), plain.forest(x, z), plain.species(x, z), plain.padClearance(x, z)];
      const b = [withHikes.height(x, z), withHikes.water.level, withHikes.pathMask(x, z), withHikes.forest(x, z), withHikes.species(x, z), withHikes.padClearance(x, z)];
      assert.deepEqual(b, a, `at ${x}, ${z}`);
    }
  }
  assert.deepEqual(withHikes.findSpawn(0, 0), plain.findSpawn(0, 0));
  const v0 = generateVegetation(plain, 2, -3, 64, TRUNK);
  const v1 = generateVegetation(withHikes, 2, -3, 64, TRUNK);
  for (const k of Object.keys(v0.lists)) assert.deepEqual(v1.lists[k], v0.lists[k], k);
});
