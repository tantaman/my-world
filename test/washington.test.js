// Washington, DC (src/washington/): the city, life size, round the zoo, on a
// real place of its own. What's checked here: that its ground is placed from
// the zoo and stands at the zoo's heights, with the zoo over it where the
// zoo is; that the city's own survey is read into the shapes the hike
// importer wants (its tidal rivers one water, at one level); that a tile
// goes into bytes and comes back as it went; that a bridge's deck runs from
// bank to bank at the banks' heights; that a tile stands up a little at a
// time, every building with its roof and walls, its streets laid without
// ever covering more than they are, and the forest kept off what's built;
// that every landmark is on a tile and arrived at out from under any roof;
// and that solids are taken out of the world as quickly as they're put in.

import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { Writer, Reader, decodeTile, TILE, PAVING } from '../src/washington/codec.js';
import { encodeTile, buildingFrom, deckOf, pavingKind, treeKind, treeHeight } from '../tools/dc/encode.js';
import { ringsOf, watersOf, streamsOf, coversOf, TIDE_TOP, TIDE_NAME, WOODS } from '../tools/hike/dcgis.js';
import { polygonsOf } from '../src/washington/paving.js';
import { CityTile, makeMaterials, USE } from '../src/washington/look.js';
import { CITY } from '../src/washington/city.js';
import { area, inside } from '../src/core/rings.js';
import { HIKES } from '../src/world/hikes.js';
import { loadHike } from '../src/world/landforms.js';
import { growWorld } from '../src/world/lands.js';
import { Solids } from '../src/world/solids.js';
import { COUNTRY } from '../src/world/country.js';
import { MAX_COUNTRIES } from '../src/render/uniforms.js';
import ZOO_PLAN from '../src/zoo/plan.js';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`);
const city = HIKES.find((h) => h.id === CITY.place);
const zoo = HIKES.find((h) => h.id === 'national-zoo');
// A tile as the game has it: its bytes, inflated.
async function tileBytes(name) {
  const m = await import(`../src/washington/tiles/${name}.js`);
  return inflateRawSync(Buffer.from(m.default, 'base64'));
}

// ── The ground ───────────────────────────────────────────────────────────────

test("Washington's ground is life size, placed from the zoo, and stands at the zoo's heights", () => {
  assert.ok(city && zoo, 'both are real places in the game');
  assert.equal(city.scale, 1);
  assert.deepEqual(city.datum, zoo.datum, 'they share the zoo’s heights');
  assert.ok(city.graded, 'a city’s ground, graded: no bumps on its streets');
  assert.equal(city.country, 'eastern city');
  // the whole District inside it: its four corners, real degrees
  const R = city.radius;
  for (const [lat, lon] of [[38.99555, -77.04102], [38.89301, -76.90939], [38.79165, -77.03898], [38.93424, -77.11975]]) {
    const dn = (lat - city.middle.lat) * 111000;
    const de = (lon - city.middle.lon) * 111000 * Math.cos((lat * Math.PI) / 180);
    assert.ok(Math.hypot(dn, de) < R, `the District's corner at ${lat}, ${lon} is on it`);
  }
});

test('the zoo stands over the city where the zoo is, and the city takes over round it', async () => {
  const [z, c] = await Promise.all([loadHike(zoo), loadHike(city)]);
  const alone = growWorld(20261119, [], 1, [z]);
  // (whichever came first: the zoo, the smaller, is over the city)
  for (const order of [[z, c], [c, z]]) {
    const gen = growWorld(20261119, [], 1, order);
    assert.deepEqual(gen.landforms.map((L) => L.id), [city.id, zoo.id], 'the bigger first, so the zoo is laid over it');
    // in the zoo: the ground and the water as they are with the zoo alone
    for (const [x, y] of [[zoo.at[0] + zoo.view.x, zoo.at[1] + zoo.view.z], [zoo.at[0] + zoo.trailhead.x, zoo.at[1] + zoo.trailhead.z], [zoo.at[0] + 120, zoo.at[1] - 60]]) {
      near(gen.height(x, y), alone.height(x, y), 1e-6, 'the zoo’s own ground');
      assert.equal(gen.realWater(x, y), alone.realWater(x, y), 'its own water');
      assert.equal(gen.countryAt(x, y), alone.countryAt(x, y), 'its own country');
    }
    // out at the Capitol: the city's own, graded
    const C = gen.landforms[0];
    const cap = CITY.landmarks.find((m) => m.id === 'capitol');
    const [cx, cz] = [city.at[0] + cap.at[0], city.at[1] + cap.at[1]];
    near(gen.naturalHeight(cx, cz), C.ground(cx, cz) + C.offset, 1e-6, 'the city’s, with no bumps on it');
  }
});

test('there is room for every country in the shaders', () => {
  assert.ok(Object.keys(COUNTRY).length <= MAX_COUNTRIES);
  assert.ok(!COUNTRY['eastern city'].animals.includes('bear'), 'no bear on the avenues');
});

// ── The city's survey, for the ground ────────────────────────────────────────

test("the city's water: its tidal rivers one water at one level, a pond on its own, a stream turned to run downhill", () => {
  // Esri's rings: outer clockwise, holes anticlockwise ([lon, lat])
  const sq = (x0, y0, s, cw = true) => {
    const r = [[x0, y0], [x0, y0 + s], [x0 + s, y0 + s], [x0 + s, y0], [x0, y0]];
    return cw ? r : r.reverse();
  };
  const { outers, holes } = ringsOf({ rings: [sq(0, 0, 1), sq(0.4, 0.4, 0.2, false)] });
  assert.equal(outers.length, 1);
  assert.equal(holes.length, 1, 'an island in it');
  const f = (kind, rings) => ({ attributes: { DESCRIPTION: kind }, geometry: { rings } });
  const lowLand = () => 0.4; // the tide's
  const feats = [f('River', [sq(-77.03, 38.88, 0.01)]), f('River', [sq(-77.02, 38.88, 0.01)]), f('Lake', [sq(-77.04, 38.88, 0.003)]), f('Pond', [sq(-77.0, 38.9, 0.001)]), f('Pool', [sq(-77.0, 38.91, 0.00005)]), f('Wastewater Holding Ponds', [sq(-77.0, 38.8, 0.002)])];
  const { waters, riverbanks } = watersOf(feats, (lat) => (lat > 38.895 ? 30 : lowLand()));
  assert.equal(waters[0].name, TIDE_NAME);
  assert.equal(waters[0].rings.length, 3, 'two pieces of the river and the basin beside it, one water');
  assert.ok(waters[0].level < TIDE_TOP, 'at the tide’s level');
  assert.equal(waters.length, 2, 'and the pond on its own; not a puddle of a pool, nor a sewage works');
  assert.equal(riverbanks.length, 0, 'every river is the tide’s here');
  // a stream drawn uphill is turned round
  const [s] = streamsOf([{ attributes: { DESCRIPTION: 'Stream' }, geometry: { paths: [[[-77, 38.9], [-77, 38.95]]] } }], (lat) => lat * 100);
  assert.ok(s.points[0][0] > s.points[1][0], 'downhill, the way it flows');
  // woods where a census block is mostly under trees, and open ground elsewhere
  const covers = coversOf([{ attributes: { TCAN_PCT: WOODS + 5 }, geometry: { rings: [sq(0, 0, 1)] } }, { attributes: { TCAN_PCT: 20 }, geometry: { rings: [sq(2, 0, 1)] } }]);
  assert.deepEqual(covers.map((c) => c.kind), ['wood', 'meadow']);
});

// ── A tile, as it's kept ─────────────────────────────────────────────────────

test('varints, signed and not, come back as they went', () => {
  const w = new Writer();
  const vals = [0, 1, -1, 127, 128, -300, 1e6, -1e6, 2 ** 40];
  for (const v of vals) w.s(v);
  w.u(5);
  const r = new Reader(w.done());
  assert.deepEqual(vals.map(() => r.s()), vals);
  assert.equal(r.u(), 5);
  assert.ok(r.end);
});

test('a tile goes into bytes and comes back as it went, to the decimetre', () => {
  const b = buildingFrom(
    [
      [[[10, 10, 20], [30, 10, 20], [30, 20, 25], [10, 20, 25]]],
      [[[10, 20, 25], [30, 20, 25], [30, 30, 20], [10, 30, 20]]],
    ],
    'gable',
  );
  assert.equal(b.pts.length, 6, 'each corner once');
  const tile = {
    at: [500, -1000],
    buildings: [{ ...b, pts: b.pts.map(([x, z, y]) => [x + 500, z - 1000, y]) }],
    paving: [{ kind: 'road', rings: [[[510, -990], [600, -990], [600, -980], [510, -980]]] }],
    bridges: [{ a: [520, -900, 12.3], b: [580, -900, 14.1], half: 6, ring: [[520, -906], [580, -906], [580, -894], [520, -894]] }],
    trees: [{ x: 700, z: -800, height: 9.4, kind: 'broad' }],
    names: [[0, 3]],
  };
  const d = decodeTile(encodeTile(tile));
  assert.equal(d.buildings[0].roof, 'gable');
  assert.deepEqual([...d.buildings[0].pts.slice(0, 3)].map((v) => Math.round(v * 10) / 10), [10, 10, 20]);
  assert.deepEqual(d.buildings[0].faces, b.faces);
  assert.equal(d.paving[0].kind, 'road');
  assert.deepEqual([...d.paving[0].rings[0]], [10, 10, 100, 10, 100, 20, 10, 20]);
  near(d.bridges[0].a[2], 12.3, 1e-9, 'a deck’s height at one end');
  assert.equal(d.bridges[0].half, 6);
  assert.deepEqual([...d.trees].map((v) => Math.round(v * 10) / 10), [200, 200, 9.4, 0]);
  assert.equal(d.names.get(0), 3);
});

test("the survey's words for what's paved, and its trees", () => {
  assert.equal(pavingKind('Road'), 'road');
  assert.equal(pavingKind('Sidewalk'), 'sidewalk');
  assert.equal(pavingKind('Unpaved Median Island'), null, 'grass is no paving');
  assert.equal(pavingKind('Hidden Road'), null, 'nor is a road under a bridge');
  for (const k of ['road', 'sidewalk', 'bridge']) assert.ok(PAVING.includes(k));
  assert.equal(treeKind('Quercus'), 'broad');
  assert.equal(treeKind('Pinus'), 'pine');
  assert.equal(treeKind('Betula'), 'birch');
  near(treeHeight({ top: 32, ground: 12, dbh: 10 }), 20, 1e-9, 'as tall as its crown was measured');
  assert.ok(treeHeight({ dbh: 20 }) > treeHeight({ dbh: 4 }), 'else as thick as its trunk');
});

test("a bridge's deck runs from bank to bank, at the banks' heights", () => {
  // a valley 30 m deep along z, a deck across it along x from x = -50 to 50
  const ground = (x) => (Math.abs(x) < 40 ? 0 : 30);
  const d = deckOf([[-50, -5], [50, -5], [50, 5], [-50, 5]], ground);
  near(Math.abs(d.a[0] - d.b[0]), 100, 1e-6, 'its length');
  near(d.half, 5, 1e-6, 'half its width');
  near(d.a[2], 30, 1e-6, 'one end on the bank');
  near(d.b[2], 30, 1e-6, 'and the other');
});

// ── A tile, stood up ─────────────────────────────────────────────────────────

test('even-odd rings are polygons with their holes, however they come', () => {
  const sq = (x, z, s) => [x, z, x + s, z, x + s, z + s, x, z + s];
  const polys = polygonsOf([sq(2, 2, 2), sq(0, 0, 10), sq(20, 0, 5)].map((r) => Float32Array.from(r)));
  assert.equal(polys.length, 2);
  const big = polys.find((p) => Math.abs(area(p.outer)) > 50);
  assert.equal(big.holes.length, 1, 'the small square is a hole in the big one');
});

test('a tile of the city stands up a little at a time: its buildings, its streets laid as they are, its trees, the forest kept off', async () => {
  // the Capitol's, and its grounds' sidewalks round eighty-odd lawns
  const name = '0_0';
  assert.ok(CITY.tiles.split(' ').includes(name));
  const bytes = await tileBytes(name);
  const gx = (x) => 2 + x * 0.004;
  const t = new CityTile({ key: name, corner: [0, 0], bytes, ground: (x) => gx(x), offset: 0, names: (k) => CITY.names[k], materials: makeMaterials(), trees: null });
  let steps = 0;
  while (t.pump(2)) steps++;
  assert.ok(t.ready && steps > 3, `built over ${steps} steps`);
  const d = t.data;
  assert.ok(d.buildings.length > 10, `its buildings (${d.buildings.length})`);
  assert.ok([...d.names.values()].some((k) => CITY.names[k] === 'United States Capitol'), 'the Capitol among them, by name');
  // every building's walls stand on the ground and its roof over them
  const meshes = [];
  t.group.traverse((o) => o.isMesh && meshes.push(o));
  assert.ok(meshes.length >= 3, 'roofs, walls and paving');
  // the paving covers no more than the survey's polygons do (a polygon whose
  // holes touch its edge can come out of the triangles over all its holes)
  const paved = meshes.find((m) => m.material.polygonOffset);
  const P = paved.geometry.attributes.position.array;
  const I = paved.geometry.index.array;
  let laid = 0;
  for (let k = 0; k < I.length; k += 3) {
    const [a, b, c] = [I[k] * 3, I[k + 1] * 3, I[k + 2] * 3];
    laid += Math.abs((P[b] - P[a]) * (P[c + 2] - P[a + 2]) - (P[c] - P[a]) * (P[b + 2] - P[a + 2])) / 2;
  }
  let surveyed = 0;
  for (const p of d.paving) for (const poly of polygonsOf(p.rings)) surveyed += Math.abs(area(poly.outer)) - poly.holes.reduce((s, h) => s + Math.abs(area(h)), 0);
  assert.ok(laid < surveyed * 1.15 + 2000, `the streets cover what they are (${Math.round(laid)} m² laid, ${Math.round(surveyed)} m² surveyed), not the whole tile`);
  // what's where, and the forest kept off it
  const b0 = d.buildings[0];
  const [bx, bz] = [b0.pts[0], b0.pts[1]];
  let roofed = null;
  for (let k = 0; k < 400 && !roofed; k++) {
    const [x, z] = [bx + Math.cos(k) * (k % 20) * 0.5, bz + Math.sin(k) * (k % 20) * 0.5];
    if (b0.faces.some((f) => inside(f[0].map((i) => [b0.pts[i * 3], b0.pts[i * 3 + 1]]), x, z))) roofed = [x, z];
  }
  assert.ok(roofed, 'a spot under a roof');
  assert.ok(t.use(...roofed) & USE.building, 'is a building');
  assert.ok(t.clears(...roofed) && t.clears(...roofed, true), 'and no plant grows there');
  assert.ok(t.bare(...roofed), 'nor grass');
  // what's where reaches as far as anything the tile holds (the Capitol's
  // grounds' sidewalks, one polygon, reach well over into the next tile)
  for (const p of d.paving) for (const r of p.rings) for (let i = 0; i < r.length; i += 2) assert.ok(r[i] >= t.box[0] && r[i] <= t.box[2] && r[i + 1] >= t.box[1] && r[i + 1] <= t.box[3], 'all its paving is on its grid');
  // solids: the walls, and nothing in the middle of nowhere
  assert.ok(t.solids.some((s) => s.wall), 'the walls stop you');
  assert.ok(t.solids.every((s) => Number.isFinite(s.ax + s.az + s.bx + s.bz + s.topA + s.topB + s.bottom)));
  t.dispose();
});

test('every landmark is on a tile there is, and arrived at out from under any roof', async () => {
  const tiles = new Set(CITY.tiles.split(' '));
  for (const m of CITY.landmarks) {
    const name = `${Math.floor(m.at[0] / TILE)}_${Math.floor(m.at[1] / TILE)}`;
    assert.ok(tiles.has(name), `${m.name} is on a tile`);
  }
  // the Capitol's, looked at closely: you arrive across its plaza, facing it
  const cap = CITY.landmarks.find((m) => m.id === 'capitol');
  const back = Math.hypot(cap.x - cap.at[0], cap.z - cap.at[1]);
  assert.ok(back > 40 && back < 220, `far enough back to see it whole (${Math.round(back)} m)`);
  const d = decodeTile(await tileBytes(`${Math.floor(cap.at[0] / TILE)}_${Math.floor(cap.at[1] / TILE)}`));
  const [lx, lz] = [cap.at[0] - Math.floor(cap.at[0] / TILE) * TILE, cap.at[1] - Math.floor(cap.at[1] / TILE) * TILE];
  for (const b of d.buildings) for (const f of b.faces) assert.ok(!inside(f[0].map((i) => [b.pts[i * 3], b.pts[i * 3 + 1]]), lx, lz), 'not under a roof');
  near(Math.atan2(cap.x - cap.at[0], cap.z - cap.at[1]), cap.yaw, 1e-3, 'facing it');
});

test('nothing of the city is inside the zoo’s fence: the zoo stands up its own', async () => {
  const fence = ZOO_PLAN.outline.map(([x, z]) => [x + zoo.at[0] - city.at[0], z + zoo.at[1] - city.at[1]]);
  let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, z] of fence) [x0, z0, x1, z1] = [Math.min(x0, x), Math.min(z0, z), Math.max(x1, x), Math.max(z1, z)];
  for (let i = Math.floor(x0 / TILE); i <= Math.floor(x1 / TILE); i++) {
    for (let j = Math.floor(z0 / TILE); j <= Math.floor(z1 / TILE); j++) {
      if (!CITY.tiles.split(' ').includes(`${i}_${j}`)) continue;
      const d = decodeTile(await tileBytes(`${i}_${j}`));
      for (const b of d.buildings) {
        let [mx, mz] = [0, 0];
        const n = b.pts.length / 3;
        for (let k = 0; k < n; k++) [mx, mz] = [mx + b.pts[k * 3] / n, mz + b.pts[k * 3 + 1] / n];
        assert.ok(!inside(fence, mx + i * TILE, mz + j * TILE), 'no building of the city’s in the zoo');
      }
    }
  }
});

// ── Solids ───────────────────────────────────────────────────────────────────

test("a tile's worth of walls goes out of the world as quickly as it came, and leaves nothing behind", () => {
  const solids = new Solids();
  const walls = [];
  for (let k = 0; k < 20000; k++) {
    const [x, z] = [(k % 200) * 2.5, Math.floor(k / 200) * 2.5];
    walls.push({ ax: x, az: z, bx: x + 2, bz: z, r: 0.25, bottom: 0, topA: 5, topB: 5 });
  }
  solids.set('a', walls);
  solids.set('b', [{ ax: 10, az: 10, bx: 12, bz: 10, r: 0.3, bottom: 0, topA: 1, topB: 1 }]);
  const t0 = performance.now();
  solids.clear('a');
  assert.ok(performance.now() - t0 < 200, 'quickly');
  let left = 0;
  solids.forEachNear(250, 125, 400, () => left++);
  assert.equal(left, 1, 'only what someone else put there');
  solids.clear('b');
  assert.equal(solids.grid.size, 0, 'and nothing at all once that goes');
});
