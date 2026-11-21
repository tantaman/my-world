// Kinds of country (src/world/country.js): a real place says which it is,
// and its ground, its plants, its sky and its animals follow. The forest
// itself is one of them, and none of this may change it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRY, COUNTRIES, countryOf, pick, display } from '../src/world/country.js';
import { MAX_COUNTRIES } from '../src/render/uniforms.js';
import { FLORA, TREE_KINDS } from '../src/world/flora.js';
import { SPECIES } from '../src/wildlife/species.js';
import { SPECIES as TIMBER, treeName } from '../src/build/forestry.js';
import { growWorld, LANDS } from '../src/world/lands.js';
import { generateTerrain, generateSurface, generateVegetation, SURFACE_STRIDE } from '../src/world/chunkGen.js';
import { sampleFar } from '../src/hikes/farGrid.js';
import { localFrame } from '../tools/hike/geo.js';
import { buildHike, splitHike } from '../tools/hike/build.js';
import { parseOsm, beaches } from '../tools/hike/osm.js';
import { nearestLandform, deckHeight, weatherAt } from '../src/country/here.js';

const SEED = 20261119;
// A world with these hikes set into it, on the first land unless another is asked for.
const world = (hikes = [], land = 1) => growWorld(SEED, [], land, hikes);
// ("on land 2", for a test's name)
const onLand = (land) => (land > 1 ? `, on land ${land}` : '');
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`);
const TRUNK = { pine: 0.3, broad: 0.4, birch: 0.2, bush: 0, fern: 0, rock: 0.7, log: 0, palm: 0.17, ironwood: 0.26, treefern: 0.2, silversword: 0 };

test('every country says everything, in words the rest of the game knows', () => {
  for (const [name, c] of Object.entries(COUNTRY)) {
    for (const col of [c.ground.tint, c.ground.dirt, c.ground.rock, c.ground.sand, ...c.ground.bare]) assert.ok(col.length === 3 && col.every((v) => v >= 0 && v < 2), `${name}: a colour`);
    assert.ok(c.ground.barren >= 0 && c.ground.barren <= 1 && c.ground.shelf >= 0 && c.ground.rubble >= 0 && c.ground.rubble <= 1, name);
    const L = c.ground.layers;
    if (L) assert.ok(L.upper.length === 3 && L.upper.every((v) => v >= 0 && v < 2) && L.at > 0 && L.bed > 0 && L.varnish >= 0 && L.varnish <= 1, `${name}: its layers`);
    for (const [kind, k] of Object.entries(c.slim)) assert.ok(TIMBER[kind] && k >= 0 && k < 1, `${name}: ${kind} grows slimmer`);
    for (const [kind, col] of Object.entries(c.tints)) assert.ok(FLORA[kind] && col.length === 3 && col.every((v) => v > 0 && v < 2), `${name}: what colour a ${kind} is`);
    for (const line of [c.treeline, c.snowline].filter(Boolean)) assert.ok(line.length === 2 && line[0] < line[1], `${name}: a treeline or snow line, from low to high`);
    for (const [kind, share] of c.trees || []) {
      assert.ok(TREE_KINDS.includes(kind), `${name}: ${kind} is a tree`);
      assert.ok(TIMBER[kind], `${name}: ${kind} can be felled`);
      assert.ok(share > 0 && share <= 1);
    }
    for (const [kind] of c.under ? [...c.under.fern, ...c.under.bush] : []) assert.ok(FLORA[kind] && !FLORA[kind].tree, `${name}: ${kind} grows under the trees`);
    for (const shares of c.trees ? [c.trees] : []) assert.ok(shares.reduce((s, [, v]) => s + v, 0) <= 1 + 1e-9, `${name}: shares come to no more than one`);
    for (const kind of c.animals || []) assert.ok(SPECIES[kind], `${name}: ${kind} is an animal`);
    assert.ok(['beach', 'rock'].includes(c.shore), name);
    assert.ok(c.clouds.cover >= 0 && c.clouds.cover <= 1 && c.clouds.shade >= 0 && c.clouds.shade <= 1 && c.haze > 0, name);
    for (const [kind, called] of Object.entries(c.names)) assert.ok(TIMBER[kind] && called.length === 2, `${name}: a name for a tree`);
    assert.equal(COUNTRIES[c.id], c, `${name} is found by its id`);
  }
  assert.equal(COUNTRY.forest.id, 0, 'the forest is country 0: what a vertex that says nothing is');
  assert.equal(COUNTRY.forest.ground.layers, null, "the forest's rock is plain");
  assert.ok(COUNTRIES.length <= MAX_COUNTRIES, 'and the shaders have room for them all');
  // a tree is called what it's called where it stands
  assert.deepEqual([treeName('broad').a, treeName('broad', COUNTRY.forest).a, treeName('broad', COUNTRY['cloud forest']).a, treeName('palm', COUNTRY['cloud forest']).a], ['an oak', 'an oak', 'an ʻōhiʻa', 'a coconut palm']);
  assert.equal(countryOf('nowhere'), COUNTRY.forest, 'a place that says nothing, or nonsense, is forest');
  assert.equal(countryOf(undefined), COUNTRY.forest);
  assert.deepEqual([0, 0.44, 0.45, 0.76, 0.99].map((r) => pick(COUNTRY['tropical coast'].trees, r)), ['ironwood', 'ironwood', 'broad', 'palm', 'palm']);
  assert.equal(pick([['bush', 0.6]], 0.7), null, 'the share left over is nothing');
  assert.ok(display([0.2, 0.2, 0.2]).every((v) => v > 0.45 && v < 0.5), 'linear to how it looks');
});

// ── A made-up island ─────────────────────────────────────────────────────────
// A cone a kilometre high on a shore: the sea to the east, a beach on it, a
// road along the shore and a path up from it to the top, where the photo was
// taken. (Real metres; a fifth of that in the game.)
const PHOTO = { lat: 20, lon: -156, bearing: 90, hour: 6.5 };
const frame = localFrame(PHOTO.lat, PHOTO.lon);
const toLL = (e, n) => frame.toLatLon(e, n);
const COAST = 1500;
const cone = (lat, lon) => {
  const [e, n] = frame.toEN(lat, lon);
  return e > COAST ? -20 : Math.max(2, 1000 - Math.hypot(e, n) * 0.6) + (COAST - e) * 0.01;
};
const island = (over = {}) =>
  buildHike({
    id: 'island',
    name: 'An Island',
    photo: PHOTO,
    elevation: cone,
    trails: [{ name: '', points: Array.from({ length: 57 }, (_, k) => toLL(1400 - k * 25, 0)) }],
    coast: [[toLL(COAST, -6000), toLL(COAST, 0), toLL(COAST, 6000)]],
    roads: [[toLL(1400, -3000), toLL(1400, 3000)]],
    beaches: [[toLL(1440, 300), toLL(1520, 300), toLL(1520, 600), toLL(1440, 600), toLL(1440, 300)]],
    at: [9000, -4000],
    radius: 2400,
    fade: 600,
    cell: 40,
    ...over,
  }).def;
const AT = [9000, -4000];
const at = (e, n) => [AT[0] + e * 0.2, AT[1] - n * 0.2];

test('a hike says what kind of country it is, and keeps its beaches', () => {
  const plain = island();
  assert.ok(!('country' in plain), 'unsaid, nothing is written: it is forest');
  const def = island({ country: 'lava coast', trees: { cover: 0.2, species: 0 } });
  assert.equal(def.country, 'lava coast');
  assert.equal(splitHike(def).card.country, 'lava coast', 'on its card, where the list and the far view can read it');
  assert.equal(def.beaches.length, 1);
  assert.ok(splitHike(def).land.beaches, 'the beach goes with its land');
  const gen = world([def]);
  const L = gen.landforms[0];
  assert.equal(L.country, COUNTRY['lava coast']);
  assert.ok(L.strand(...at(1480, 450)) < -1, 'on the beach');
  assert.ok(L.strand(...at(1480, 200)) > 5, 'and off the end of it');
  // OpenStreetMap's beaches are closed ways tagged natural=beach
  const osm = parseOsm(`<osm><node id="1" lat="0" lon="0"/><node id="2" lat="0" lon="0.001"/><node id="3" lat="0.001" lon="0"/>
    <way id="5"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="1"/><tag k="natural" v="beach"/></way>
    <way id="6"><nd ref="1"/><nd ref="2"/><tag k="natural" v="beach"/></way></osm>`);
  assert.deepEqual(beaches(osm).map((b) => b.length), [4]);
});

test('the walk starts on top of the mountain: the mountain stands over the forest', () => {
  // The same island with its road run up to the summit. Stood level with the
  // forest, the top would leave the whole mountain in a pit.
  const summit = island({ roads: [[toLL(-30, -3000), toLL(-30, 3000)]], trails: [{ name: '', points: [toLL(-30, 0), toLL(-15, 0), toLL(0, 0)] }] });
  const gen = world([summit]);
  const L = gen.landforms[0];
  const peak = L.raw(...at(0, 0));
  assert.ok(Math.abs(summit.trailhead.x) < 8, 'the walk does start at the top');
  assert.ok(peak > 190, `which is ${Math.round(peak)} m up`);
  assert.ok(summit.datum.anchor < 20, `what stands level with the forest is the land's edge (${summit.datum.anchor} m up), not the top`);
  let forest = 0;
  for (let k = 0; k < 16; k++) forest += gen._baseHeight(L.cx + Math.cos(k * 0.3927) * L.outer, L.cz + Math.sin(k * 0.3927) * L.outer) / 16;
  assert.ok(peak + L.offset - forest > 150, `so the top is ${Math.round(peak + L.offset - forest)} m over the forest round it`);
  // a walk that starts at the foot still stands its start level with the forest
  const shore = island();
  const foot = world([shore]).landforms[0];
  assert.ok(Math.abs(shore.datum.anchor - foot.raw(foot.cx + shore.trailhead.x, foot.cz + shore.trailhead.z)) < 0.01);
});

test('the ground is made of what the country says, and the forest of what it always was', () => {
  const out = { bare: 9, sand: 9, land: 9, country: 9 };
  const forest = world();
  assert.equal(forest.surface(40, 40, out), null);
  assert.deepEqual(out, { bare: 0, sand: 0, land: 0, country: 0 });
  assert.equal(forest.countryAt(40, 40), null);
  assert.equal(generateSurface(forest, 0, 0, 1, 64), null, 'and no chunk of it carries anything extra');

  // cinder: bare all over
  const cinder = world([island({ country: 'cinder desert', trees: { cover: 0 } })]);
  assert.equal(cinder.surface(...at(200, 200), out), COUNTRY['cinder desert']);
  assert.ok(out.bare > 0.9 && out.land === 1 && out.sand === 0 && out.country === COUNTRY['cinder desert'].id, JSON.stringify(out));
  // half way out through its edge, half of that; past it, none
  cinder.surface(AT[0], AT[1] + 480 + 60, out);
  assert.ok(out.land > 0.3 && out.land < 0.7 && out.bare < 0.7 && out.bare > 0.2, JSON.stringify(out));
  assert.equal(cinder.surface(AT[0], AT[1] + 700, out), null);
  assert.equal(cinder.countryAt(AT[0], AT[1] + 480 + 20), COUNTRY['cinder desert'], 'plants are the country’s to half way out');
  assert.equal(cinder.countryAt(AT[0], AT[1] + 480 + 100), null);

  // a lava coast: grass and bare patches inland, black rock at the sea, sand on the beach
  const lava = world([island({ country: 'lava coast' })]);
  let bare = 0;
  let n = 0;
  for (let e = -1500; e <= 500; e += 100) for (let nn = -1500; nn <= 1500; nn += 100, n++) bare += lava.surface(...at(e, nn), out) ? out.bare : 0;
  assert.ok(bare / n > 0.12 && bare / n < 0.5, `about a third of it is bare (${(bare / n).toFixed(2)})`);
  lava.surface(...at(COAST - 15, -800), out);
  assert.ok(out.bare > 0.95, 'the shelf the sea breaks on is all rock');
  lava.surface(...at(1480, 450), out);
  assert.ok(out.sand > 0.9 && out.bare < 0.1, 'but for the beach');

  // the same numbers, vertex by vertex, for the chunk's mesh: grid, then skirts
  const [cx, cz] = [Math.floor(AT[0] / 64), Math.floor(AT[1] / 64)];
  const s = generateSurface(cinder, cx, cz, 2, 64);
  const t = generateTerrain(cinder, cx, cz, 2, 64);
  assert.equal(s.length / SURFACE_STRIDE, t.pos.length / 3, 'one for every vertex of the terrain');
  cinder.surface(cx * 64 + 10 * 2, cz * 64 + 7 * 2, out);
  const k = (7 * 33 + 10) * SURFACE_STRIDE;
  assert.deepEqual([s[k], s[k + 1], s[k + 2], s[k + 3]], [out.bare, out.sand, out.land, COUNTRY['cinder desert'].id].map(Math.fround));
  const skirt = (33 * 33 + 5) * SURFACE_STRIDE; // the sixth vertex of the first skirt hangs from the sixth of the first row
  assert.deepEqual([...s.subarray(skirt, skirt + 4)], [...s.subarray(5 * SURFACE_STRIDE, 5 * SURFACE_STRIDE + 4)]);
});

for (const land of LANDS) test(`what grows is what grows there${onLand(land)}`, () => {
  const count = (def, kinds) => {
    const gen = world([def], land);
    const sum = Object.fromEntries(kinds.map((k) => [k, 0]));
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -4; dx <= 1; dx++) {
        const v = generateVegetation(gen, Math.floor(AT[0] / 64) + dx, Math.floor(AT[1] / 64) + dz, 64, TRUNK);
        for (const k of kinds) sum[k] += v.lists[k].length / 7;
        for (let i = 0; i < v.colliders.length; i++) assert.ok(Number.isFinite(v.colliders[i]));
      }
    }
    return sum;
  };
  const all = Object.keys(FLORA);
  const cinder = count(island({ country: 'cinder desert', trees: { cover: 0 } }), all);
  assert.deepEqual([cinder.pine, cinder.broad, cinder.birch, cinder.palm, cinder.ironwood, cinder.fern, cinder.bush, cinder.treefern, cinder.log], [0, 0, 0, 0, 0, 0, 0, 0, 0], 'on cinder, nothing');
  assert.ok(cinder.silversword > 3 && cinder.silversword < 200, `but the odd silversword (${cinder.silversword})`);
  assert.ok(cinder.rock > 100, 'and stones');

  const coast = count(island({ country: 'tropical coast', trees: { cover: 0.7, species: 0 } }), all);
  assert.deepEqual([coast.pine, coast.birch], [0, 0], 'no pines or birches by a tropical sea');
  assert.ok(coast.palm > 50 && coast.ironwood > 50 && coast.broad > 50, `palms, ironwoods and broadleaves (${coast.palm}, ${coast.ironwood}, ${coast.broad})`);

  const cloud = count(island({ country: 'cloud forest', trees: { cover: 0.85, species: -0.7 } }), all);
  assert.deepEqual([cloud.pine, cloud.birch, cloud.palm], [0, 0, 0]);
  assert.ok(cloud.treefern > 30 && cloud.fern > 30 && cloud.broad > 200, `tree ferns under broadleaves (${cloud.treefern}, ${cloud.fern}, ${cloud.broad})`);

  // and with no country said, the forest's own, as ever
  const forest = count(island({ trees: { cover: 0.85, species: 0.2 } }), all);
  assert.ok(forest.pine > 50 && forest.palm + forest.ironwood + forest.treefern + forest.silversword === 0);
});

test('what a land has high up stops at the edge of a real place', () => {
  // The second land has a treeline, and snow above it (land2.js). The island
  // stands 200 m over the sea, higher than either: but it is a tropical
  // island, wooded to the top, and no snow lies on it.
  const def = island({ country: 'cloud forest', trees: { cover: 0.85, species: -0.7 } });
  const gen = world([def], 2);
  const bare = world([], 2);
  const [x, z] = at(-100, 0);
  const h = gen.height(x, z);
  assert.ok(h > gen.landforms[0].offset + 150, `near the top (${h - gen.landforms[0].offset} m over the sea)`);
  assert.ok(bare.above(x, z, h) > 0.9 && bare.snow(x, z, h) > 0.9, 'the land itself would have that high up bare, under snow');
  assert.deepEqual([gen.above(x, z, h), gen.snow(x, z, h), gen.groves(x, z)], [0, 0, 0], 'on the island, none of it');
  assert.ok(gen.forest(x, z) > 0.5, `and it is wooded (${gen.forest(x, z)})`);
  // out past the island's edge the land is the land again
  const [ox, oz] = [AT[0], AT[1] + gen.landforms[0].outer + 50];
  assert.deepEqual([gen.above(ox, oz, 200), gen.snow(ox, oz, 200), gen.forest(ox, oz), gen.species(ox, oz)], [bare.above(ox, oz, 200), bare.snow(ox, oz, 200), bare.forest(ox, oz), bare.species(ox, oz)]);
});

test('snowy mountains: snow on all of it; and a hike can say where its own lies', () => {
  // The island again, a thousand metres high. Snowy mountains are under snow
  // top to bottom; the forest has none; a hike can say where its own lies
  // (the photo was taken in winter), or that none does.
  const snowy = world([island({ country: 'snowy mountains' })]);
  const forest = world([island()]);
  const winter = world([island({ snowline: [600, 800] })]);
  const none = world([island({ country: 'snowy mountains', snowline: null })]);
  const top = at(-100, 0);
  const low = at(-1300, 0);
  const snowAt = (gen, [x, z]) => gen.snow(x, z, gen.height(x, z));
  const L = winter.landforms[0];
  assert.ok(snowAt(snowy, top) > 0.99 && snowAt(snowy, low) > 0.99, 'snowy mountains: top to bottom');
  assert.equal(snowAt(forest, top), 0, 'the forest: none');
  assert.ok(L.realHeight(...top) > 800 && snowAt(winter, top) > 0.99, `its own line: snow on the top (${Math.round(L.realHeight(...top))} m)`);
  assert.ok(L.realHeight(...low) < 600 && snowAt(winter, low) === 0, `and none down at ${Math.round(L.realHeight(...low))} m`);
  assert.equal(snowAt(none, top), 0, 'or none at all');
  // land with no high ground of its own has some, once a snowy place is set into it
  const box = (gen, [x, z]) => gen.highIn(x - 32, z - 32, x + 32, z + 32);
  assert.deepEqual([box(world(), top), box(forest, top), box(snowy, top), box(winter, top)], [false, false, true, true]);
  const t = generateTerrain(snowy, Math.floor(top[0] / 64), Math.floor(top[1] / 64), 1, 64);
  assert.ok(t.high && Math.max(...t.high.filter((_, i) => i % 2)) > 0.99, 'and the ground knows it, to be painted white');
  // past its edge it's the forest's again: none on land 1, the land's own on land 2
  const out = [AT[0], AT[1] + snowy.landforms[0].outer + 50];
  assert.equal(snowy.snow(...out, 300), 0);
  assert.equal(world([island({ country: 'snowy mountains' })], 2).snow(...out, 300), world([], 2).snow(...out, 300));
  // and snow lies on what grows there; it doesn't change it
  const [cx, cz] = [Math.floor(top[0] / 64), Math.floor(top[1] / 64)];
  const v0 = generateVegetation(none, cx, cz, 64, TRUNK);
  const v1 = generateVegetation(snowy, cx, cz, 64, TRUNK);
  for (const k of Object.keys(v0.lists)) assert.deepEqual(v1.lists[k], v0.lists[k], k);
  // the firs thin out to none at the tree line: an island whose top is over it
  const [from, to] = COUNTRY['snowy mountains'].treeline;
  const raised = (lat, lon) => cone(lat, lon) + to - 900;
  const alpine = world([island({ country: 'snowy mountains', elevation: raised, coast: [], beaches: [], roads: [] })]);
  assert.ok(alpine.landforms[0].realHeight(...top) > to && alpine.forest(...top) < 0, 'over the tree line, nothing stands');
  assert.ok(alpine.landforms[0].realHeight(...low) < from && alpine.forest(...low) > 0.5, `under it, wooded (${alpine.forest(...low).toFixed(2)})`);
});

test('high mountains: woods up to the treeline, turf and stones over it, snow on the tops', () => {
  // A mountain a kilometre high on ground 2,400 m up: its top is over the
  // treeline, where the snow starts to lie.
  const peak = (lat, lon) => {
    const [e, n] = frame.toEN(lat, lon);
    return 2400 + Math.max(0, 1000 - Math.hypot(e, n) * 0.6);
  };
  const def = buildHike({
    id: 'peak',
    name: 'A Peak',
    photo: PHOTO,
    elevation: peak,
    trails: [{ name: '', points: Array.from({ length: 57 }, (_, k) => toLL(1400 - k * 25, 0)) }],
    at: AT,
    radius: 2400,
    fade: 600,
    cell: 40,
    country: 'high mountains',
    trees: { cover: 0.85, species: 0.9 },
  }).def;
  const [low, top] = [at(-1500, 0), at(0, 0)];
  for (const land of LANDS) {
    const gen = world([def], land);
    const L = gen.landforms[0];
    near(L.realHeight(...top), 3400, 15, 'the top');
    near(L.realHeight(...low), 2500, 15, 'low down');
    assert.ok(L.high && gen.highIn(top[0] - 32, top[1] - 32, top[0] + 32, top[1] + 32), 'it has high ground');
    assert.ok(gen.forest(...low) > 0.5, `wooded low down (${gen.forest(...low)})`);
    assert.deepEqual([gen.above(...low, 0), gen.snow(...low, 0)], [0, 0], 'under the trees, no snow');
    assert.ok(gen.forest(...top) < 0, 'over the treeline, no trees');
    assert.ok(gen.above(...top, 0) > 0.99, 'but turf and stones');
    assert.ok(gen.snow(...top, 0) > 0.3 && gen.snow(...top, 0) < 0.8, `and snow lying in drifts (${gen.snow(...top, 0)})`);
    // its trees are spruces, slimmer than the forest's pines, with an aspen here and there
    const v = generateVegetation(gen, Math.floor(low[0] / 64), Math.floor(low[1] / 64), 64, TRUNK).lists;
    assert.ok(v.pine.length / 7 > 20 && v.broad.length === 0, `spruces (${v.pine.length / 7})`);
    for (let o = 6; o < v.pine.length; o += 7) near(v.pine[o], COUNTRY['high mountains'].slim.pine, 1e-6, 'slim');
  }
  assert.equal(treeName('pine', COUNTRY['high mountains']).a, 'a spruce');
  assert.equal(treeName('birch', COUNTRY['high mountains']).a, 'an aspen');
});

test('a rocky shore keeps its cliff; a beach comes down to the water', () => {
  // The same island with a cliff at the sea: 30 real metres straight up.
  const cliff = (lat, lon) => {
    const [e] = frame.toEN(lat, lon);
    return e > COAST ? -20 : e > COAST - 60 ? 30 : cone(lat, lon) + 30;
  };
  const height = (country, e, n) => {
    const gen = world([island({ elevation: cliff, country })]);
    return gen.height(...at(e, n)) - gen.landforms[0].offset;
  };
  // 5 real m in from the water: one in the game
  const [rock, beach, strand] = [height('lava coast', COAST - 5, -800), height(undefined, COAST - 5, -800), height('lava coast', COAST - 5, 450)];
  assert.ok(rock > 2.5, `the cliff stands at the water (${rock.toFixed(1)} m)`);
  assert.ok(beach < 1.2, `where a beach would have been laid over it (${beach.toFixed(1)} m)`);
  assert.ok(strand < 1.2, `and is, where the map has one (${strand.toFixed(1)} m)`);
});

test('the weather is the country’s, as far as you are onto it', () => {
  const cinder = world([island({ country: 'cinder desert', trees: { cover: 0 } })]);
  const cloud = world([island({ country: 'cloud forest' })]);
  const L = cinder.landforms[0];
  assert.equal(nearestLandform([], 0, 0), null);
  assert.equal(nearestLandform(cinder.landforms, 0, 0), L);
  // its cloud lies at 2250 real metres: on this island (1000 m high), far overhead
  const deck = deckHeight(L);
  const top = L.raw(...at(0, 0)) + L.offset;
  assert.ok(Math.abs(deck - top - (2250 - 1015) * 0.2) < 2, `${Math.round(deck - top)} m over a 1015 m top`);
  assert.ok(Number.isNaN(deckHeight(world([island()]).landforms[0])), 'the forest has none');
  // under it, on the land: its cover, and (cinder desert: shade 0) the sun still out
  assert.deepEqual(weatherAt(L, ...AT, top), { cover: 0.97, haze: 0.35, overcast: 0 });
  const C = cloud.landforms[0];
  const under = weatherAt(C, ...AT, deckHeight(C) - 50);
  assert.ok(Math.abs(under.overcast - 0.35 * 0.8) < 1e-9, 'under a cloud forest’s cloud, the light is flat');
  assert.equal(weatherAt(C, ...AT, deckHeight(C) + 50).overcast, 0, 'over it, the sun is out');
  // it clears as you walk off the land
  const edge = weatherAt(C, AT[0] + 600 + 250, AT[1], 0);
  assert.ok(edge.cover > 0.2 && edge.cover < 0.6 && edge.haze > 1 && edge.haze < 1.5);
  assert.deepEqual(weatherAt(C, AT[0] + 600 + 600, AT[1], 0), { cover: 0, haze: 1, overcast: 0 });
  assert.deepEqual(weatherAt(null, 0, 0, 0), { cover: 0, haze: 1, overcast: 0 });
});

test('from far off the land is its own colour too', () => {
  const gen = world([island({ country: 'cinder desert', trees: { cover: 0 } })]);
  const g = sampleFar(gen, AT[0] - 320, AT[1] - 320, 5, 160);
  assert.ok(g.bare[12] > 0.9 && g.land[12] === 1 && g.country[12] === COUNTRY['cinder desert'].id, 'bare cinder at the middle');
  assert.ok(g.forest[12] < 0, 'and nothing standing on it to raise a canopy');
  const out = sampleFar(world(), 0, 0, 3, 100);
  assert.deepEqual([...out.bare, ...out.land], new Array(18).fill(0));
});
