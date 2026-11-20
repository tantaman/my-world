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
import { parseOsm, trails, waters, coastlines, roads, streams } from '../tools/hike/osm.js';
import { buildHike, splitHike, simplify, signedDistance, coastDistance, walkFromRoad } from '../tools/hike/build.js';
import { placeHike, project, ORIGIN } from '../tools/hike/place.js';
import { Landform, packHeights, unpackHeights, packShore, unpackShore } from '../src/world/landform.js';
import { growWorld, LANDS } from '../src/world/lands.js';
import { generateVegetation } from '../src/world/chunkGen.js';
import { sampleFar } from '../src/hikes/farGrid.js';
import { NO_WATER, LAND_REACH, LAND_DRY } from '../src/world/water.js';
import { NET } from '../src/world/drainage.js';
import { HIKES } from '../src/world/hikes.js';
import { Lands, loadAll, reachOf } from '../src/world/landforms.js';
import { tiffExif, jpegWith, heifWith } from './helpers/photos.js';

const SEED = 20261119;
// A world with these hikes set into it, on the first land unless another is asked for.
const world = (hikes = [], land = 1) => growWorld(SEED, [], land, hikes);
// ("on land 2", for a test's name)
const onLand = (land) => (land > 1 ? `, on land ${land}` : '');
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

test('OpenStreetMap: the coast, joined the way it runs, and where a car can be left', () => {
  // Three stretches of coast given out of order, each running the same way
  // (land on its left); a road, a car park, and a path that is neither.
  const xml = `<osm>
    <node id="1" lat="0" lon="0"/><node id="2" lat="0.01" lon="0"/><node id="3" lat="0.02" lon="0"/><node id="4" lat="0.03" lon="0.01"/>
    <node id="5" lat="0.5" lon="0.5"/><node id="6" lat="0.5" lon="0.51"/><node id="7" lat="0.51" lon="0.5"/>
    <way id="12"><nd ref="3"/><nd ref="4"/><tag k="natural" v="coastline"/></way>
    <way id="10"><nd ref="1"/><nd ref="2"/><tag k="natural" v="coastline"/></way>
    <way id="11"><nd ref="2"/><nd ref="3"/><tag k="natural" v="coastline"/></way>
    <way id="13"><nd ref="5"/><nd ref="6"/><nd ref="7"/><nd ref="5"/><tag k="natural" v="coastline"/></way>
    <way id="20"><nd ref="1"/><nd ref="5"/><tag k="highway" v="tertiary"/></way>
    <way id="21"><nd ref="5"/><nd ref="6"/><nd ref="7"/><nd ref="5"/><tag k="amenity" v="parking"/></way>
    <way id="22"><nd ref="2"/><nd ref="6"/><tag k="highway" v="path"/></way>
  </osm>`;
  const osm = parseOsm(xml);
  const coast = coastlines(osm);
  assert.deepEqual(coast.map((c) => c.map(([lat]) => lat)), [[0, 0.01, 0.02, 0.03], [0.5, 0.5, 0.51, 0.5]], 'one line south to north, and an islet');
  assert.deepEqual(roads(osm).map((r) => r.length), [2, 4], 'the road and the car park, not the path');
});

test('OpenStreetMap: streams and rivers that run all year, the way they flow', () => {
  const xml = `<osm>
    <node id="1" lat="0" lon="0"/><node id="2" lat="0.01" lon="0"/><node id="3" lat="0.02" lon="0"/><node id="4" lat="0.03" lon="0.01"/>
    <way id="10"><nd ref="3"/><nd ref="2"/><nd ref="1"/><tag k="waterway" v="stream"/><tag k="name" v="Beck"/></way>
    <way id="11"><nd ref="4"/><nd ref="3"/><tag k="waterway" v="river"/></way>
    <way id="12"><nd ref="1"/><nd ref="4"/><tag k="waterway" v="stream"/><tag k="intermittent" v="yes"/></way>
    <way id="13"><nd ref="2"/><nd ref="4"/><tag k="waterway" v="ditch"/></way>
  </osm>`;
  const s = streams(parseOsm(xml));
  assert.deepEqual(s.map((w) => [w.name, w.river, w.points.map(([lat]) => lat)]), [['Beck', false, [0.02, 0.01, 0]], ['', true, [0.03, 0.02]]], 'not the gulch that is dry till it rains, nor the ditch');
});

test('the coast: which side is the sea, and how far', () => {
  // In the game z runs south. A coast drawn going north (z falling) has its
  // land on the left, the west: so the sea is to the east.
  const north = [[[0, 100], [0, 0], [0, -100]]];
  near(coastDistance(north, 30, 10), -30, 1e-9, 'east of it is sea');
  near(coastDistance(north, -30, 10), 30, 1e-9, 'west of it is land');
  // A headland: north, then round a corner to the west. Off its point, to
  // the north-east, it's the corner that is nearest, and that is sea.
  const head = [[[0, 100], [0, 0], [-100, 0]]];
  near(coastDistance(head, 30, -40), -50, 1e-9, 'off the point');
  near(coastDistance(head, -30, 40), 30, 1e-9, 'on the headland');
  near(coastDistance(head, -30, -20), -20, 1e-9, 'north of it, sea again');
  // and a bay, the other way about: in its corner you're in the water
  const bay = [[[-100, 0], [0, 0], [0, 100]]];
  near(coastDistance(bay, -30, 40), -30, 1e-9, 'in the bay');
  near(coastDistance(bay, 30, -40), 50, 1e-9, 'on the land behind it');
  // an islet, drawn round with its land on the left: north up its east side
  const islet = [[[10, 0], [10, -10], [0, -10], [0, 0], [10, 0]]];
  near(coastDistance(islet, 5, -5), 5, 1e-9, 'ashore');
  near(coastDistance(islet, -4, 4), -Math.hypot(4, 4), 1e-9, 'off its corner');
});

test('the walk starts where the car is left, by whatever paths lead to the photo', () => {
  // A road along the south. A path runs north from it to a fork; one branch
  // goes on to where the photo was taken, the other back down to the road a
  // long way round. None of them has a name.
  const road = [[[-200, 100], [200, 100]]];
  const line = (pts) => ({ name: '', pts });
  const up = line([[0, 100], [0, 60], [0, 20]]);
  const on = line([[0, 20], [2, 5], [0, 0]]);
  const round = line([[0, 20], [-80, 20], [-80, 100]]);
  const w = walkFromRoad([on, round, up], road);
  assert.deepEqual([w.pts[0], w.pts[w.pts.length - 1]], [[0, 100], [0, 0]], 'from the road to the photo');
  near(w.length, 80 + Math.hypot(2, 15) + Math.hypot(2, 5), 1e-9, 'the short way');
  near(Math.cos(w.yaw), -1, 1e-9, 'setting off north');
  // downhill or up makes no odds: a cove is walked down to
  assert.equal(walkFromRoad([on, round, up], []), null, 'no road: left to the old rule');
  assert.equal(walkFromRoad([on, up], road, [300, 300]), null, 'nor if the photo is nowhere near a path');
  // it takes its name from the named path most of it is on
  const named = walkFromRoad([{ ...on, name: 'Spur' }, { ...up, name: 'Main Trail' }], road);
  assert.equal(named.name, 'Main Trail');
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

for (const land of LANDS) test(`the world grows a hike: the real land, its trail, its lake${onLand(land)}`, () => {
  const gen = world([hike], land);
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
  near(L.raw(L.cx + L.trailhead.x, L.cz + L.trailhead.z) + L.offset, sum / 64, 1e-3, 'settled (its datum is kept to the millimetre)');
  // and nothing of the forest's own water is on it
  for (let z = -480; z <= 480; z += 40) {
    for (let x = -480; x <= 480; x += 40) {
      gen.height(AT[0] + x, AT[1] + z);
      if (gen.water.region) assert.equal(gen.water.kind, 'lake', `${gen.water.kind} at ${x}, ${z}`);
    }
  }
});

// The same mountain by the sea: the land falls away to the east, and a
// little over a kilometre out the coast runs north. A road runs along the
// shore, and the trail comes up from it.
const COAST_AT = 1300; // real metres east of the photo
const byTheSea = (lat, lon) => {
  const [e] = frame.toEN(lat, lon);
  // the sea floor, as elevation data has it: falling away from the shore
  return e > COAST_AT ? -(e - COAST_AT) * 0.1 : Math.max(1, elevation(lat, lon) - 395);
};
const coastal = buildHike({
  id: 'by-the-sea',
  name: 'By the Sea',
  photo: PHOTO,
  elevation: byTheSea,
  trails: [{ name: '', points: Array.from({ length: 41 }, (_, k) => toLL(1000 - k * 25, 0)) }],
  // going north, so the land is on its left (west) and the sea to the east
  coast: [[toLL(COAST_AT, -6000), toLL(COAST_AT, 0), toLL(COAST_AT, 6000)]],
  roads: [[toLL(1000, -3000), toLL(1000, 3000)]],
  at: AT,
  radius: 2400,
  fade: 600,
  cell: 40,
  trees: { cover: 0 },
}).def;

test('a hike by the sea has the sea, and is walked up to from the road', () => {
  assert.deepEqual(coastal.lakes.map((l) => [l.name, l.sea, l.level]), [['the sea', true, 0]], 'the sea is the lowest ground there is');
  assert.deepEqual(splitHike(coastal).card.lakes, [{ name: 'the sea', sea: true }]);
  near(coastal.base, 0, 1e-9, 'heights are measured from sea level, not the sea floor');
  // the walk comes up from the road by the shore to the top, though its path has no name
  near(coastal.trailhead.x, 1000 * 0.2, 0.5, 'it starts at the road');
  near(coastal.trail.length, 1000 * 0.2, 2, 'and is the kilometre up from it');
  near(coastal.trail.climb, (byTheSea(...toLL(0, 0)) - byTheSea(...toLL(1000, 0))) * 0.2, 3, 'climbing from it');

  const gen = world([coastal]);
  const L = gen.lands[0];
  const at = (e, n) => [AT[0] + e * 0.2, AT[1] - n * 0.2];
  const shore = (e, n) => L.shore(...at(e, n));
  near(shore(COAST_AT + 100, 300), -20, 0.6, 'a hundred metres out to sea (20 in the game)');
  near(shore(COAST_AT - 100, -300), 20, 0.6, 'and a hundred inland');
  assert.ok(L.sea, 'it is the sea that is near');
  // out in it there is water, standing at sea level, over a bed
  const bed = gen.height(...at(COAST_AT + 400, 0));
  assert.equal(gen.water.kind, 'lake');
  assert.ok(gen.water.region && bed < gen.water.level - 3, 'deep water');
  near(gen.water.level, L.offset, 1e-9, 'at the level of the sea');
  assert.ok(gen.water.foam > 0.25 && gen.water.foam < 0.4, `a chop out there (${gen.water.foam})`);
  // it breaks on the shore
  gen.height(...at(COAST_AT + 10, 0));
  assert.ok(gen.water.foam > 0.7, `surf (${gen.water.foam})`);
  // the real sea runs on past the land that was imported; the game's stops
  // short of its edge, at a low shore, with nothing under the water beyond
  const rim = gen.height(...at(2350, 0));
  assert.ok(rim > gen.water.level || !gen.water.region, 'dry land at the rim');
  for (let e = -2300; e <= 2300; e += 115) assert.ok(L.raw(...at(e, 200)) >= -0.01, 'no ground is left under sea level');
  // a lake in the hills has no surf
  const inland = world([hike]);
  inland.height(AT[0] - 1600 * 0.2, AT[1]);
  assert.equal(inland.water.foam, 0);
  assert.ok(!inland.lands[0].sea);
});

// The same shore again, with water running to it, and a cove cut into it: a
// brook down the mountain into the sea, drawn on the map as two lines end to
// end; a beck that runs into it half way down; a rill that gives out on dry
// land; and a river that comes onto the land at its edge.
const COVE = 30; // real m: half the cove's width, and half how far in it's cut
const coved = (lat, lon) => {
  const [e, n] = frame.toEN(lat, lon);
  const wet = e > COAST_AT || (e > COAST_AT - 2 * COVE && Math.abs(n) < COVE);
  return wet ? -Math.max(5, (e - COAST_AT) * 0.1) : Math.max(1, elevation(lat, lon) - 395);
};
const brookAt = (k) => [300 + k * 50, 500 + Math.sin(k / 2) * 30]; // east, north (real m)
const watered = buildHike({
  id: 'watered',
  name: 'Watered',
  photo: PHOTO,
  elevation: coved,
  trails: [{ name: '', points: Array.from({ length: 41 }, (_, k) => toLL(1000 - k * 25, 0)) }],
  coast: [[toLL(COAST_AT, -6000), toLL(COAST_AT, -COVE), toLL(COAST_AT - 2 * COVE, -COVE), toLL(COAST_AT - 2 * COVE, COVE), toLL(COAST_AT, COVE), toLL(COAST_AT, 6000)]],
  roads: [[toLL(1000, -3000), toLL(1000, 3000)]],
  streams: [
    { name: 'Brook', river: false, points: Array.from({ length: 23 }, (_, k) => toLL(...brookAt(k))) },
    { name: 'Brook', river: false, points: [toLL(100, 300), toLL(...brookAt(0))] },
    { name: 'Beck', river: false, points: [toLL(400, 200), toLL(...brookAt(8))] },
    { name: '', river: false, points: Array.from({ length: 9 }, (_, k) => toLL(-300 - k * 50, -600)) },
    { name: 'Out', river: true, points: Array.from({ length: 30 }, (_, k) => toLL(-3200 + k * 100, -1200)) },
  ],
  at: AT,
  radius: 2400,
  fade: 600,
  cell: 40,
  trees: { cover: 0 },
}).def;

test("a hike's streams are kept the way they flow, as far as its land goes", () => {
  const runs = watered.streams.map((r) => [r.name, r.big, r.pts.slice(0, 2), r.pts.slice(-2)]);
  // the brook is cut short where it runs out to sea past the land, the river where it comes onto it
  assert.deepEqual(runs[0].slice(0, 3), ['Brook', 0, [60, -100]], 'the brook, from its spring (1:5, north up)');
  near(runs[0][3][0], 280, 1, 'to the sea');
  assert.deepEqual(runs[1], ['Brook', 0, [20, -60], [60, -100]], 'the stretch above it, down to where it begins');
  assert.equal(runs[4][0], 'Out');
  assert.equal(runs[4][1], 1, 'a river');
  assert.ok(Math.hypot(...runs[4][2]) < 480 && runs[4][2][0] < -370, `it begins at the edge of the land (${runs[4][2]})`);
  // the card names them, once each, for the list of hikes; the lines are with the land
  const { card, land } = splitHike(watered);
  assert.deepEqual(card.streams, [{ name: 'Brook' }, { name: 'Beck' }, { name: 'Out' }]);
  assert.deepEqual(land.streams, watered.streams);
  assert.deepEqual({ ...card, ...land }, watered, 'and together they are the hike again');
  // importing another hike splits the cards already there again: they come out as they went in
  assert.deepEqual(splitHike(card).card, card);
  assert.deepEqual(splitHike(splitHike(coastal).card).card, splitHike(coastal).card);
  // a hike with none says nothing of them
  assert.ok(!('streams' in hike) && !('streams' in splitHike(hike).card));
});

test('a real stream runs downhill all the way, into what the map says it runs into', () => {
  const gen = world([watered]);
  const L = gen.lands[0];
  const at = (e, n) => [AT[0] + e * 0.2, AT[1] - n * 0.2];
  const sea = L.offset;
  // no piece of any of them rises as it goes
  assert.ok(L.segs.length > 12, `${L.segs.length} pieces of channel`);
  for (const s of L.segs) for (let i = 1; i <= s.count; i++) assert.ok(s.W[i] <= s.W[i - 1] + 1e-9, 'water does not run uphill');
  // on the brook there is water, in a channel cut into the ground, going east
  const [be, bn] = brookAt(5);
  const bed = gen.height(...at(be, bn));
  const w = gen.water;
  assert.ok(w.region && bed < w.level - 0.5, `water over a bed (${w.level - bed} m)`);
  assert.ok(w.kind === 'stream' && w.edge < -1.5, `in midstream (${w.kind}, ${w.edge})`);
  assert.ok(w.flowX > 0.5, `running east, to the sea (${w.flowX})`);
  near(w.level, L.raw(...at(be, bn)) + L.offset, 1, 'lying just under the ground the line was drawn over');
  // and a bank stands over it to either side, though the hill falls away beyond
  for (const side of [-15, 15]) {
    const bank = gen.height(...at(be, bn + side));
    assert.ok(gen.water.edge > 0 && bank > gen.water.level, `a bank (${bank - gen.water.level} m over the water)`);
  }
  // The two lines of the brook are one stream: where they meet it neither
  // gives out nor starts again, and is as wide as it was
  gen.height(...at(...brookAt(0)));
  assert.ok(gen.water.region && gen.water.edge < -0.8, `running through the join (${gen.water.edge})`);
  // the beck comes in half way down, and the brook is the bigger for it
  const fed = L.segs.filter((s) => s.acc1 - s.acc0 > 12);
  assert.equal(fed.length, 1, 'one stretch takes on more than it gathers');
  assert.ok(fed[0].W[0] > fed[0].W[fed[0].count], 'falling still');
  gen.height(...at(550, 350));
  assert.ok(gen.water.region && gen.water.kind === 'stream', 'the beck, on its way down');
  // it comes down to the sea, at the sea's level
  gen.height(...at(COAST_AT + 20, brookAt(20)[1]));
  assert.equal(gen.water.kind, 'lake');
  near(gen.water.level, sea, 1e-9, 'the sea');
  const mouth = L.segs.find((s) => Math.abs(s.pts[s.count * 2] - at(...brookAt(22))[0]) < 6 && s.W[s.count] === s.LB);
  near(mouth.W[mouth.count], sea, 1e-9, 'the last of the brook lies at sea level');
  // the rill gives out: half way along it runs, at its end there's none
  gen.height(...at(-500, -600));
  assert.ok(gen.water.region, 'the rill');
  gen.height(...at(-700, -600));
  assert.ok(!gen.water.region, 'and where it ends');
  // the river is a river from where it comes onto the land
  gen.height(...at(-1500, -1200));
  assert.ok(gen.water.region && gen.water.kind === 'river' && gen.water.edge < -3, `the river (${gen.water.kind}, ${gen.water.edge})`);
  // the map sees them too, without working out the ground
  gen.water.probe(...at(be, bn));
  assert.ok(gen.water.kind === 'stream' && gen.water.edge < 0, 'on the map');
  // and none of it is felt beyond the land
  const plain = world();
  for (let k = 0; k < 96; k++) {
    const t = (k / 96) * Math.PI * 2;
    const [x, z] = [L.cx + Math.cos(t) * (L.outer + 300), L.cz + Math.sin(t) * (L.outer + 300)];
    assert.equal(gen.height(x, z), plain.height(x, z), `at ${Math.round(x)}, ${Math.round(z)}`);
    assert.equal(gen.water.level, plain.water.level);
  }
});

test('a cove a few metres across is a cove: the shore is kept finer than the ground', () => {
  const sea = watered.lakes[0];
  assert.ok(sea.sea && sea.cell < watered.ground.cell / 2 && !sea.box, `on a grid of its own, ${sea.cell} m to the ground's ${watered.ground.cell}`);
  const gen = world([watered]);
  const L = gen.lands[0];
  const shore = (e, n) => L.shore(AT[0] + e * 0.2, AT[1] - n * 0.2);
  // the cove is 12 m across in the game, and 12 deep: less than two of the ground's cells
  near(shore(COAST_AT - COVE, 0), -COVE * 0.2, 0.5, 'in the middle of the cove, 6 m from its sides');
  near(shore(COAST_AT - 2 * COVE - 10, 0), 2, 0.5, 'on the land behind it');
  near(shore(COAST_AT - COVE, COVE + 10), 2, 0.5, 'and on the point beside it');
  // and there is water in it
  const bed = gen.height(AT[0] + (COAST_AT - COVE) * 0.2, AT[1]);
  assert.ok(gen.water.region && gen.water.kind === 'lake' && bed < gen.water.level - 0.5, `the sea comes into it (${gen.water.level - bed} m deep)`);
});

test('seen from the land, the sea runs on to the horizon', () => {
  const gen = world([watered]);
  const L = gen.lands[0];
  const at = (e, n) => [AT[0] + e * 0.2, AT[1] - n * 0.2];
  assert.ok(L.openSea(...at(2600, 0)), 'out past the edge of the land, to the east');
  assert.ok(L.openSea(...at(6000, 2500)), 'and far out');
  assert.ok(!L.openSea(...at(-2600, 0)), 'not inland');
  assert.ok(!L.openSea(...at(1500, 0)), 'nor on the land itself, where the sea is its own');
  assert.ok(!gen.lands.length || !world([hike]).lands[0].openSea(AT[0] + 600, AT[1]), 'a land with a lake has no sea');
  // the game's own ground out there is forest: it is only the far view that sees water
  gen.height(...at(2600, 0));
  assert.notEqual(gen.water.kind, 'lake');
  const n = 25;
  const g = sampleFar(gen, AT[0] - 240, AT[1] - 240, n, 40); // 240 m west of the middle to 720 m east
  const row = Array.from({ length: n }, (_, i) => g.water[12 * n + i]);
  for (let i = 0; i < n; i++) {
    const e = (-240 + i * 40) / 0.2;
    if (e > COAST_AT + 100) {
      near(row[i], L.offset, 1e-6, `sea level ${e} m east`);
      assert.ok(g.h[12 * n + i] < row[i], 'over a bed');
    } else if (e < COAST_AT - 100) assert.ok(row[i] < NO_WATER * 0.5 || row[i] !== L.offset, `no sea ${e} m east`);
  }
});

test('land with no trees has none at all', () => {
  // The forest plants the odd tree even where it's thinnest. Above the tree
  // line there are none.
  const L = new Landform(coastal);
  const bare = generateVegetation(world([coastal]), Math.floor(AT[0] / 64), Math.floor(AT[1] / 64), 64, TRUNK);
  assert.ok(L.forest(AT[0] + 40, AT[1] + 40) < -0.025);
  assert.deepEqual(['pine', 'broad', 'birch', 'log'].map((k) => bare.lists[k].length), [0, 0, 0, 0]);
  const wooded = generateVegetation(world([hike]), Math.floor(AT[0] / 64), Math.floor(AT[1] / 64), 64, TRUNK);
  assert.ok(wooded.lists.pine.length + wooded.lists.broad.length + wooded.lists.birch.length > 0, 'where the same mountain, wooded, has plenty');
});

test('nothing grows where the photo was taken, nor in front of it', () => {
  const gen = world([hike]);
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

for (const land of LANDS) test(`a hike leaves the water outside it alone${onLand(land)}`, () => {
  const plain = world([], land);
  const withHike = world([hike], land);
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

// ── Fetched when it's needed ─────────────────────────────────────────────────
// A hike's land comes after the world is made (world/landforms.js), and nothing
// within its reach is grown until it has. That is only right if land added
// later grows the same world, and nothing past the reach depends on it.

const fields = (gen, x, z) => {
  const h = gen.height(x, z);
  const w = gen.water;
  return [h, w.level, w.kind, w.edge, w.region, gen.pathMask(x, z), gen.pathEdge, gen.forest(x, z), gen.species(x, z), gen.padClearance(x, z)];
};

for (const land of LANDS) test(`a hike's land added later grows the same world as one there from the start${onLand(land)}`, () => {
  const first = world([hike], land);
  const later = world([], land);
  later.height(AT[0], AT[1]); // grown a little without it first, as the forest round it would be
  later.addHike(hike);
  for (let z = -560; z <= 560; z += 35) {
    for (let x = -560; x <= 560; x += 35) assert.deepEqual(fields(later, AT[0] + x, AT[1] + z), fields(first, AT[0] + x, AT[1] + z), `at ${x}, ${z}`);
  }
});

for (const land of LANDS) test(`nothing past a hike's reach depends on its land${onLand(land)}`, () => {
  const plain = world([], land);
  const withHike = world([hike], land);
  const reach = reachOf(hike);
  for (let k = 0; k < 160; k++) {
    const t = (k / 160) * Math.PI * 2;
    for (const r of [reach + 0.5, reach + 20, reach + 90]) {
      const x = AT[0] + Math.cos(t) * r;
      const z = AT[1] + Math.sin(t) * r;
      assert.deepEqual(fields(withHike, x, z), fields(plain, x, z), `at ${Math.round(x)}, ${Math.round(z)}`);
    }
  }
});

for (const land of LANDS) test(`no pond or lake of the forest's reaches further than LAND_REACH allows for${onLand(land)}`, () => {
  // a basin gives way within its size, beach and LAND_DRY of real land, and
  // shapes the ground for its size and beach again past that
  const net = world([], land).water.net;
  let most = 0;
  let seen = 0;
  for (let j = -30; j <= 30; j++) {
    for (let i = -30; i <= 30; i++) {
      const n = net.node(i, j);
      const b = net.down(n) ? null : net.basin(n);
      if (!b) continue;
      seen++;
      most = Math.max(most, b.maxR + b.blend + 2);
    }
  }
  assert.ok(seen > 20, `${seen} ponds and lakes looked at`);
  assert.ok(LAND_DRY + 2 * most <= LAND_REACH, `a basin reaches ${most.toFixed(1)} m: LAND_REACH needs ${(LAND_DRY + 2 * most).toFixed(1)}`);
});

test('a hike splits into its card and its land, and back', () => {
  const { card, land } = splitHike(hike);
  assert.deepEqual({ ...card, ...land }, hike);
  assert.equal(card.ground, undefined, 'the card has no land in it');
  assert.ok(JSON.stringify(card).length < 2000, 'and is small');
  assert.deepEqual(card.lakes, [{ name: 'Mere' }], 'but names the lakes');
});

test("a hike's land is fetched once, and only when something near it asks", async () => {
  const { card, land } = splitHike(hike);
  let fetched = 0;
  const lands = new Lands([{ ...card, load: async () => (fetched++, { default: land }) }]);
  const arrived = [];
  lands.on('land', (def) => arrived.push(def.id));
  const reach = reachOf(card);
  const box = (x, z, s = 64) => [x, z, x + s, z + s];
  assert.ok(lands.ready(...box(AT[0] + reach + 10, AT[1])), 'far off, nothing waits');
  assert.equal(fetched, 0, 'and nothing is fetched');
  assert.ok(!lands.ready(...box(AT[0] + reach - 10, AT[1]), false), 'within reach it waits');
  assert.equal(fetched, 0, 'but only fetches when asked to');
  assert.ok(!lands.ready(...box(AT[0], AT[1])), 'on it, it waits');
  await Promise.all([lands.ensure('made-up'), lands.ensure('made-up')]);
  assert.equal(fetched, 1, 'fetched once');
  assert.deepEqual(arrived, ['made-up'], 'and said so once');
  assert.ok(lands.ready(...box(AT[0], AT[1])), 'then it is ready');
  assert.deepEqual(lands.defs.get('made-up'), hike, 'with the whole hike');
  // Whose reach a place is in is known from the cards alone, fetched or not:
  // what else is grown from the seed (the forest's old places) keeps off it
  const cards = new Lands([{ ...card, load: async () => ({ default: land }) }]);
  assert.equal(cards.reaches(...box(AT[0], AT[1])).id, 'made-up', 'on it');
  assert.equal(cards.reaches(...box(AT[0] + reach - 10, AT[1])).id, 'made-up', 'and as far as it changes the land');
  assert.equal(cards.reaches(...box(AT[0] + reach + 10, AT[1])), null, 'not beyond');
});

test("land that can't be fetched is asked for again, but not every frame", async () => {
  const { card, land } = splitHike(hike);
  let tries = 0;
  let up = false;
  const lands = new Lands([{ ...card, load: async () => (tries++, up ? { default: land } : Promise.reject(new Error('offline'))) }]);
  const failed = [];
  lands.on('failed', (c) => failed.push(c.id));
  const here = [AT[0], AT[1], AT[0] + 64, AT[1] + 64];
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.ok(!lands.ready(...here));
    await lands.ensure('made-up').catch(() => {});
    for (let k = 0; k < 50; k++) lands.ready(...here); // fifty frames
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(tries, 1, 'not asked again straight away');
    assert.deepEqual(failed, ['made-up'], 'and said so');
    lands.failures.get('made-up').until = 0; // the wait is over
    up = true;
    lands.ready(...here);
    await lands.ensure('made-up');
    assert.equal(tries, 2);
    assert.ok(lands.ready(...here), 'here at last');
  } finally {
    console.warn = warn;
  }
});

test('the far view sees the lake from the top', () => {
  const gen = world([hike]);
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

// ── Where they go: where they are ────────────────────────────────────────────
const haversine = (a, b) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
};

test('hikes lie as far apart as they really are, at their own scale', () => {
  assert.deepEqual(project(ORIGIN.lat, ORIGIN.lon, 0.2).map((v) => v + 0), [0, 0], 'the middle of the world');
  const stormKing = { lat: 48.0554, lon: -123.7734 };
  const mailbox = { lat: 47.4676, lon: -121.6746 };
  const [a, b] = [project(stormKing.lat, stormKing.lon, 0.2), project(mailbox.lat, mailbox.lon, 0.2)];
  const game = Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.2;
  const real = haversine(stormKing, mailbox);
  assert.ok(Math.abs(game - real) / real < 0.01, `${Math.round(game)} m in the game for ${Math.round(real)} m in fact`);
  assert.ok(b[0] > a[0] && b[1] > a[1], 'and in the same direction: east-south-east');
  const card = { radius: 800, fade: 200, scale: 0.2 };
  assert.throws(() => placeHike({ photo: ORIGIN, ...card }), /where everyone starts/);
  // The whole Earth is in reach. What gives, far out, is the shape of the
  // map: true along the line from the middle, wider than life across it.
  const sydney = placeHike({ photo: { lat: -33.87, lon: 151.21 }, ...card }); // ~12,400 km
  assert.ok(Math.abs(Math.hypot(...sydney.at) / 0.2 - haversine(ORIGIN, { lat: -33.87, lon: 151.21 })) < 20000, 'Sydney is as far from the middle as it really is');
  assert.ok(sydney.stretch > 2 && sydney.stretch < 2.2, `and the map round it is twice as wide as life (${sydney.stretch.toFixed(2)})`);
  assert.match(sydney.notes.join(), /wider than life/, 'which the importer says');
  const placed = placeHike({ photo: stormKing, ...card });
  assert.ok(placed.stretch < 1.001 && !placed.notes.length, 'near the middle it is true every way');
  assert.deepEqual([placed.datum, placed.near], [null, null], 'far from any other, it sets its own heights');
});

test('hikes that overlap line up exactly, and stand on the same heights', () => {
  // A mountainside rolling for kilometres, and two photos 2 km apart on it
  const wave = (lat, lon) => 600 + 240 * Math.sin(lat * 260) * Math.cos(lon * 170) + 90 * Math.sin(lat * 900 + lon * 400);
  const opts = { radius: 2400, fade: 600, cell: 40, trails: [], waters: [] };
  const photoA = { lat: 46.5, lon: -121.6, bearing: 90, hour: 12 };
  const photoB = { lat: 46.512, lon: -121.585, bearing: 200, hour: 12 };
  const placeA = placeHike({ photo: photoA, scale: 0.2, radius: 480, fade: 120 });
  const A = buildHike({ id: 'a', name: 'A', photo: photoA, elevation: wave, at: placeA.at, ...opts }).def;
  const placeB = placeHike({ photo: photoB, scale: 0.2, radius: 480, fade: 120 }, [splitHike(A).card]);
  assert.equal(placeB.near.id, 'a', 'B is placed from A');
  const [e, n] = localFrame(photoA.lat, photoA.lon).toEN(photoB.lat, photoB.lon);
  near(placeB.at[0], A.at[0] + e * 0.2, 0.06, 'east of A by as much as it really is');
  near(placeB.at[1], A.at[1] - n * 0.2, 0.06, 'and north');
  assert.deepEqual(placeB.datum, A.datum, 'B shares A’s heights');
  const B = buildHike({ id: 'b', name: 'B', photo: photoB, elevation: wave, at: placeB.at, datum: placeB.datum, ...opts }).def;
  const gen = world([A, B]);
  const [LA, LB] = gen.lands;
  // where both are real land, they say the same thing
  let worst = 0;
  for (let k = 0; k < 200; k++) {
    const x = (A.at[0] + B.at[0]) / 2 + ((k % 20) - 10) * 12;
    const z = (A.at[1] + B.at[1]) / 2 + (Math.floor(k / 20) - 5) * 12;
    worst = Math.max(worst, Math.abs(LA.raw(x, z) + LA.offset - (LB.raw(x, z) + LB.offset)));
  }
  assert.ok(worst < 0.25, `the same ground ${worst.toFixed(3)} m apart`);
  // and adding B didn't move A
  const alone = world([A]);
  near(gen.lands[0].offset, alone.lands[0].offset, 0, 'A stands where it stood');
});

// ── The hikes in the game ────────────────────────────────────────────────────
test('the hikes in the game are where they really are, and those that meet share their heights', () => {
  assert.equal(new Set(HIKES.map((h) => h.id)).size, HIKES.length, 'each has its own id');
  for (const h of HIKES) {
    assert.ok(Math.hypot(...h.at) - h.radius - h.fade > 1500, `${h.id} is out in the world, clear of where people start`);
    const [x, z] = project(h.photo.lat, h.photo.lon, h.scale);
    assert.ok(Math.hypot(x - h.at[0], z - h.at[1]) < 400, `${h.id} is where it really is`);
    assert.ok(h.datum && h.base !== undefined, `${h.id} says what its heights stand on`);
    for (const o of HIKES) {
      if (o === h || Math.hypot(h.at[0] - o.at[0], h.at[1] - o.at[1]) > h.radius + h.fade + o.radius + o.fade) continue;
      assert.deepEqual(o.datum.at, h.datum.at, `${h.id} and ${o.id} overlap, so they share their heights`);
    }
  }
});

for (const land of LANDS) test(`the hikes leave the rest of the world exactly as it was${onLand(land)}`, async () => {
  const plain = world([], land);
  const withHikes = world(await loadAll(HIKES), land);
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
