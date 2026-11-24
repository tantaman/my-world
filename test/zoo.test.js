// The National Zoo (src/zoo/): a real zoo, life size, on a real place
// brought in at 1 : 1. What's checked here: that the importer reads a city's
// surveyed roofs (Esri's compressed multipatch) and makes walls from them,
// and an OpenStreetMap zoo into a plan; that the plan in the game has the
// zoo's buildings and exhibits, each seen from a path; that each exhibit's
// animals are the right ones (a sea lion is no lion, a red panda no giant
// panda, a sign about tigers no tiger); that pens keep off paths and
// buildings, and a yard the map fences in has that one fence and no other;
// that every body is whole; that the animals stay in their pens, whatever
// they get up to, none of them with its nose or tail in a wall; and that
// the paths lie just over the ground you stand on, never under it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, inflateSync } from 'node:zlib';
import { parseOsm } from '../tools/hike/osm.js';
import { decodePatches, roofFaces, roofWalls, buildPlan, PART } from '../tools/zoo/plan.js';
import { area, inside, edgeDistance } from '../src/zoo/shapes.js';
import PLAN from '../src/zoo/plan.js';
import { ZOO } from '../src/zoo/exhibits.js';
import { Site, USE } from '../src/zoo/site.js';
import { KINDS, kindOf } from '../src/zoo/species.js';
import { makeBody } from '../src/zoo/bodies.js';
import { Residents } from '../src/zoo/residents.js';
import { Zoo } from '../src/zoo/look.js';
import { buildFences } from '../src/zoo/fences.js';
import { buildGrounds } from '../src/zoo/grounds.js';
import * as THREE from 'three';
import { HIKES } from '../src/world/hikes.js';
import { project } from '../src/core/geo.js';
import { EARTH } from '../src/world/earth.js';

// ── The roofs ───────────────────────────────────────────────────────────────

// A multipatch as the city's server hands it over: header, then zlib'd shape.
function patches(parts) {
  const pts = parts.flatMap((p) => p.pts);
  const n = 4 + 32 + 8 + parts.length * 8 + pts.length * 16 + 16 + pts.length * 8;
  const b = Buffer.alloc(n);
  let o = 0;
  const i32 = (v) => (b.writeInt32LE(v, o), (o += 4));
  const f64 = (v) => (b.writeDoubleLE(v, o), (o += 8));
  i32(54);
  for (const v of [0, 0, 1, 1]) f64(v);
  i32(parts.length);
  i32(pts.length);
  let at = 0;
  for (const p of parts) (i32(at), (at += p.pts.length));
  for (const p of parts) i32(p.type);
  for (const [x, y] of pts) (f64(x), f64(y));
  f64(0);
  f64(0);
  for (const [, , z] of pts) f64(z);
  const packed = deflateSync(b);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x81800036, 0);
  head.writeUInt32LE(b.length, 4);
  head.writeUInt32LE(packed.length, 8);
  return Buffer.concat([head, packed]).toString('base64');
}

test("a city's surveyed roof is read as it was sent: each face a ring, every corner at its height", () => {
  const sent = [
    { type: PART.outer, pts: [[0, 0, 10], [4, 0, 10], [4, 3, 12], [0, 3, 12], [0, 0, 10]] },
    { type: PART.outer, pts: [[0, 3, 12], [4, 3, 12], [4, 6, 10], [0, 6, 10], [0, 3, 12]] },
  ];
  const { parts } = decodePatches(patches(sent), inflateSync);
  assert.deepEqual(parts, sent);
  const faces = roofFaces(parts, ([x, y, z]) => [x, -y, z]);
  assert.equal(faces.length, 2);
  assert.equal(faces[0][0].length, 4, 'closed rings are left open');
});

test("a roof's walls are its outer edges down to the ground, and the step where a high roof meets a low one", () => {
  // a gable: two faces meeting along the ridge, which is no wall
  const gable = [[[[0, 0, 10], [4, 0, 10], [4, 3, 12], [0, 3, 12]]], [[[0, 3, 12], [4, 3, 12], [4, 6, 10], [0, 6, 10]]]];
  const walls = roofWalls(gable);
  assert.equal(walls.length, 6, 'the four eaves and the two gable ends, halves of each');
  assert.ok(walls.every((w) => w[6] === null), 'all down to the ground');
  assert.ok(!walls.some((w) => w[1] === 3 && w[4] === 3), 'no wall along the ridge');
  // a flat roof at 8 m against one at 5 m: the step between them is a wall
  const step = roofWalls([[[[0, 0, 8], [2, 0, 8], [2, 2, 8], [0, 2, 8]]], [[[2, 0, 5], [4, 0, 5], [4, 2, 5], [2, 2, 5]]]]);
  const between = step.filter((w) => w[0] === 2 && w[3] === 2);
  assert.equal(between.length, 1);
  assert.deepEqual([between[0][2], between[0][6]], [8, 5], 'from the high roof down to the low');
  // a face seen edge on covers nothing, and isn't a roof
  assert.equal(roofFaces([{ type: PART.outer, pts: [[0, 0, 0], [1, 0, 0], [1, 0, 3], [0, 0, 3], [0, 0, 0]] }], ([x, y, z]) => [x, y, z]).length, 0);
});

// ── OpenStreetMap ───────────────────────────────────────────────────────────

test("an OpenStreetMap zoo becomes a plan: its outline, a building, its exhibits and where each is seen from", () => {
  // a 100 m square zoo round (0, 0) at the equator-ish: a degree is ~111 km
  const d = (m) => (m / 111000).toFixed(7);
  const nodes = [];
  const node = (id, x, z, tags = '') => nodes.push(`<node id="${id}" lat="${d(-z)}" lon="${d(x)}">${tags}</node>`);
  [[1, -50, -50], [2, 50, -50], [3, 50, 50], [4, -50, 50]].forEach(([id, x, z]) => node(id, x, z));
  [[11, -30, -30], [12, -10, -30], [13, -10, -10], [14, -30, -10]].forEach(([id, x, z]) => node(id, x, z));
  [[21, 10, 10], [22, 40, 10], [23, 40, 40], [24, 10, 40]].forEach(([id, x, z]) => node(id, x, z));
  [[31, -45, 0], [32, 45, 0]].forEach(([id, x, z]) => node(id, x, z));
  node(41, -20, 30, '<tag k="attraction" v="animal"/><tag k="name" v="Goat"/>');
  const xml = `<osm>${nodes.join('')}
    <way id="100"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/><tag k="tourism" v="zoo"/><tag k="name" v="A Zoo"/></way>
    <way id="101"><nd ref="11"/><nd ref="12"/><nd ref="13"/><nd ref="14"/><nd ref="11"/><tag k="building" v="yes"/><tag k="name" v="Lion House"/><tag k="building:levels" v="2"/></way>
    <way id="102"><nd ref="21"/><nd ref="22"/><nd ref="23"/><nd ref="24"/><nd ref="21"/><tag k="attraction" v="animal"/><tag k="name" v="Lion"/><tag k="species:en" v="Lion"/></way>
    <way id="103"><nd ref="31"/><nd ref="32"/><tag k="highway" v="footway"/><tag k="name" v="Main Walk"/></way>
  </osm>`;
  const plan = buildPlan({ osm: parseOsm(xml), roofs: [], toGame: (lat, lon, h = 0) => [lon * 111000, -lat * 111000, h] });
  assert.equal(plan.outline.length, 4);
  assert.equal(plan.buildings.length, 1);
  assert.equal(plan.buildings[0].name, 'Lion House');
  assert.ok(plan.buildings[0].h > 6, 'two storeys high, the map having no survey of it');
  assert.deepEqual(plan.exhibits.map((e) => e.id), ['lion', 'goat']);
  const lion = plan.exhibits[0];
  assert.ok(lion.area && Math.abs(area(lion.area)) > 800);
  // seen from the walk, on the walk, looking at it
  assert.ok(Math.abs(lion.view[1]) < 0.01, 'on the path');
  assert.ok(Math.abs(Math.sin(lion.view[2]) * 0) < 1 && Math.cos(lion.view[2]) > 0.5, 'facing it, south of the walk');
  assert.equal(plan.exhibits[1].area, null, 'a point, to have its yard grown round it');
  assert.equal(plan.paths[0].width, 3);
});

// ── The zoo in the game ─────────────────────────────────────────────────────

test('the zoo stands on its real place, life size, where Washington really is', () => {
  const card = HIKES.find((h) => h.id === ZOO.hike);
  assert.ok(card, 'its ground is in the game');
  assert.equal(card.scale, 1, 'life size');
  const [x, z] = project(card.middle.lat, card.middle.lon, EARTH.scale);
  assert.ok(Math.hypot(x - card.at[0], z - card.at[1]) < 1);
  // the zoo is all on its real ground, not out in the land round it
  for (const [px, pz] of PLAN.outline) assert.ok(Math.hypot(px, pz) < card.radius, 'inside the real land');
});

test('the plan has the zoo: its buildings, with their names, and every exhibit seen from a path', () => {
  const names = new Set(PLAN.buildings.map((b) => b.name));
  for (const n of ['Reptile Discovery Center', 'Small Mammal House', 'Great Ape House', 'Elephant Community Center', 'Bird House', 'Amazonia', 'Panda House']) assert.ok(names.has(n), n);
  assert.ok(PLAN.buildings.filter((b) => !b.h).length > 150, 'most with the roofs the city surveyed');
  for (const b of PLAN.buildings) for (const f of b.faces) for (const r of f) for (const p of r) assert.ok(p.every(Number.isFinite));
  // a building's tallest corner over its lowest: no tower blocks in a zoo
  // (one stepping down the hillside has a few storeys between its roofs)
  for (const b of PLAN.buildings.filter((q) => !q.h)) {
    const ys = b.faces.flat(2).map((p) => p[2]);
    assert.ok(Math.max(...ys) - Math.min(...ys) < 40, `${b.name || 'a building'} is the height of a building`);
  }
  assert.ok(ZOO.exhibits.length > 70);
  const ids = new Set();
  for (const e of ZOO.exhibits) {
    assert.ok(!ids.has(e.id), `${e.id} once`);
    ids.add(e.id);
    // its view is on a path
    const on = PLAN.paths.some((p) => {
      for (let k = 0; k + 3 < p.pts.length; k += 2) {
        const [ax, az, bx, bz] = p.pts.slice(k, k + 4);
        const l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
        const t = Math.max(0, Math.min(1, ((e.x - ax) * (bx - ax) + (e.z - az) * (bz - az)) / l2));
        if (Math.hypot(ax + (bx - ax) * t - e.x, az + (bz - az) * t - e.z) < 0.05) return true;
      }
      return false;
    });
    assert.ok(on, `${e.name} is seen from a path`);
  }
});

test("who lives where: each by the exhibit's name, and not those it only sounds like", () => {
  const name = (n, species = '') => kindOf({ name: n, species })?.name ?? null;
  assert.equal(name('Lion', 'Lion'), 'lion');
  assert.equal(name('California Sea Lion', 'California Sea Lion'), 'California sea lion');
  assert.equal(name('Red Panda', 'Red panda'), 'red panda');
  assert.equal(name('Giant Panda', 'giant panda'), 'giant panda');
  assert.equal(name('Sumatran Tiger'), 'Sumatran tiger');
  assert.equal(name('Grevy\'s Zebra'), "Grévy's zebra");
  for (const sign of ['Growing Up Tiger', 'Tiger Tracks', 'Cat Scan', 'Caring Corral', 'Panda House', 'Elephant Overlook']) assert.equal(name(sign), null, sign);
  assert.equal(new Set(KINDS.map((k) => k.name)).size, KINDS.length, 'each kind once');
  // the zoo's best known exhibits all have someone in them
  for (const n of ['Lion', 'Tiger', 'Sumatran Tiger', 'Asian Elephant', 'Giant Panda', 'Red Panda', 'Zebra', 'Sloth Bear', 'Andean Bear', 'Gray Seal', 'California Sea Lion', 'Otters', 'Western Lowland Gorilla', 'Cheetah', 'Flamingo', 'Bald Eagle', 'Prairie dogs', 'Alpacas']) {
    const e = PLAN.exhibits.find((x) => x.name === n);
    assert.ok(e && kindOf(e), n);
  }
});

// A site for the zoo on flat ground, with no water, and its animals.
const flat = () => 0;
let built;
const site = () => (built ||= new Site(PLAN, { at: [0, 0], offset: 0, ground: flat, wet: () => false, kindOf }));

test('pens keep off the paths and the buildings, and an exhibit under a roof has none', () => {
  const s = site();
  const pens = s.exhibits.filter((e) => e.pen);
  assert.ok(pens.length > 50, `${pens.length} pens`);
  for (const e of s.exhibits) {
    if (e.indoors) assert.equal(e.pen, null, `${e.name} is indoors`);
    if (!e.pen || e.area || e.shared) continue;
    // a grown pen: none of it on a path or a building
    for (const [x, z] of e.pen) assert.ok(!(s.use(x, z) & (USE.path | USE.building)), `${e.name}'s yard is off the paths`);
  }
  for (const n of ['Reptile Discovery Center', 'Great Ape House', 'Small Mammal House']) assert.ok(s.exhibits.find((e) => e.name === n).indoors, n);
  // the farm's yards are by the barn, not in it
  const goat = s.exhibits.find((e) => e.name === 'Goat');
  assert.ok(goat.pen && Math.abs(area(goat.pen)) > 10);
});

test("a yard the map fences in is the pen, behind the map's fence and no other", () => {
  const s = site();
  // the Kids' Farm's goats: a point on their barn, in a yard the map fences
  const goat = s.exhibits.find((e) => e.id === 'goat');
  assert.ok(goat.walled, 'their yard is walled in already');
  const yard = s.barriers.find((b) => {
    for (let k = 0; k + 1 < b.pts.length; k += 2) if (Math.hypot(b.pts[k] - goat.x, b.pts[k + 1] - goat.z) < 30) return true;
    return false;
  });
  assert.ok(yard, "the map's fence round it");
  // the pen is the yard: all of it inside the fence, and most of what's inside
  for (const [x, z] of goat.pen) assert.ok(!(s.use(x, z) & (USE.fence | USE.path)), 'its edge is in from the fence');
  assert.ok(Math.abs(area(goat.pen)) > 100, `the yard, not a corner of it (${Math.abs(area(goat.pen)).toFixed(0)} m²)`);
  // a fence the map draws is in every square it runs through (on the
  // zoo's grid): no gaps to grow a pen out of
  const [x0, z0, x1, z1] = s.box;
  for (const b of s.barriers) {
    for (let k = 0; k + 3 < b.pts.length; k += 2) {
      for (let t = 0; t <= 1; t += 0.05) {
        const [x, z] = [b.pts[k] + (b.pts[k + 2] - b.pts[k]) * t, b.pts[k + 1] + (b.pts[k + 3] - b.pts[k + 1]) * t];
        if (x > x0 && z > z0 && x < x1 && z < z1) assert.ok(s.use(x, z) & USE.fence, 'a gap in a fence');
      }
    }
  }
  // and a grown pen keeps off the map's fences, as it does the paths
  for (const e of s.exhibits) {
    if (!e.pen || e.area || e.shared) continue;
    for (const [x, z] of e.pen) assert.ok(!(s.use(x, z) & USE.fence), `${e.name}'s yard stops at the fence`);
  }
});

test('a fence goes up round a pen only where the map has none of its own', () => {
  const s = site();
  const out = {};
  for (const _ of buildFences(s, flat, out));
  // each stretch of fence: the map's come first, one a segment, then the pens'
  const mapped = s.barriers.reduce((n, b) => n + b.pts.length / 2 - 1, 0);
  const pens = out.solids.slice(mapped);
  assert.ok(pens.length > 100, `fences round the pens (${pens.length} stretches)`);
  const goat = s.exhibits.find((e) => e.id === 'goat');
  // none inside the goats' yard: the map's fence is theirs
  assert.ok(!pens.some((f) => inside(goat.pen, (f.ax + f.bx) / 2, (f.az + f.bz) / 2)), 'no second fence round the goats');
  // and none running along beside a fence or wall the map has, a stride off it
  for (const f of pens) {
    const [mx, mz] = [(f.ax + f.bx) / 2, (f.az + f.bz) / 2];
    const [dx, dz] = [f.bx - f.ax, f.bz - f.az];
    const l = Math.hypot(dx, dz) || 1;
    for (const b of s.barriers) {
      for (let k = 0; k + 3 < b.pts.length; k += 2) {
        const [ax, az, bx, bz] = b.pts.slice(k, k + 4);
        const [ux, uz] = [bx - ax, bz - az];
        const ul = Math.hypot(ux, uz);
        if (ul < 0.5) continue;
        const t = Math.max(0, Math.min(1, ((mx - ax) * ux + (mz - az) * uz) / (ul * ul)));
        const d = Math.hypot(ax + ux * t - mx, az + uz * t - mz);
        const parallel = Math.abs(ux * dx + uz * dz) / (ul * l) > 0.9;
        assert.ok(!(parallel && d < 2 && t > 0 && t < 1), 'two fences side by side');
      }
    }
  }
});

test('every kind of animal has a whole body', () => {
  for (const k of KINDS) {
    for (const male of [true, false]) {
      const b = makeBody(k, 7, { male });
      let verts = 0;
      b.mesh.traverse((o) => {
        if (!o.geometry) return;
        verts += o.geometry.attributes.position.count;
        for (const a of ['position', 'normal', 'color']) {
          const arr = o.geometry.attributes[a]?.array || [];
          for (let i = 0; i < arr.length; i++) assert.ok(Number.isFinite(arr[i]), `${k.name}: a ${a} is NaN`);
        }
      });
      assert.ok(verts > 50, `${k.name} has a body`);
    }
  }
});

test('the animals stay in their pens, whatever they get up to', () => {
  const s = site();
  const r = new Residents(s, { ground: flat });
  for (const _ of r.populate());
  assert.ok(r.list.length > 100, `${r.list.length} animals`);
  assert.ok(new Set(r.list.map((a) => a.kind.name)).size > 45, 'of many kinds');
  // two pandas, whatever the pens
  assert.equal(r.list.filter((a) => a.kind.name === 'giant panda').length, 2);
  // each keeps as far off the fence as it is long, nose or tail, the
  // elephants a good way off (a pen too small for one may squeeze it some)
  const box = new THREE.Box3();
  let short = 0;
  for (const a of r.list) {
    a.body.mesh.updateMatrixWorld(true);
    box.setFromObject(a.body.mesh);
    const long = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
    if (a.clear < long * 0.9) short++;
  }
  assert.ok(short <= r.list.length / 20, `${short} of ${r.list.length} with less room than they're long`);
  assert.ok(r.list.filter((a) => a.kind.name === 'Asian elephant').every((a) => a.clear > 2), 'an elephant keeps its trunk out of the wall');
  // a few minutes of their day, watched from close by: never into a fence, a
  // wall or a building, all of them, all the time
  for (let t = 0; t < 600; t++) {
    for (const a of r.list) {
      r._step(a, 0.25, { x: a.x + 5, z: a.z });
      if (t % 10 === 0) assert.ok(s.roomIn(a.exhibit.pen, a.x, a.z, a.clear * 0.999), `${a.kind.name} in ${a.exhibit.name} keeps out of the walls`);
    }
  }
  let moved = 0;
  for (const a of r.list) {
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.z), `${a.kind.name} is somewhere`);
    assert.ok(inside(a.exhibit.pen, a.x, a.z) || edgeDistance(a.exhibit.pen, a.x, a.z) < 0.3, `${a.kind.name} is in its pen`);
    if (a.state === 'walk' || a.speed > 0.01 || a.target) moved++;
  }
  assert.ok(moved > r.list.length / 3, 'and they get about');
  r.dispose();
});

test('the paths lie just over the ground you stand on, and never under it, however it rises and falls', () => {
  // ground that's up and down a hand's breadth every metre or two, on a hillside
  const ground = (x, z) => 0.08 * x + 0.06 * Math.sin(x * 2.3) * Math.cos(z * 1.7) + 0.05 * Math.sin(z * 3.1 + x);
  // ...as it's drawn and stood on (Chunk.sampleHeight): flat between whole metres
  const drawn = (x, z) => {
    const [i, j] = [Math.floor(x), Math.floor(z)];
    const [u, v] = [x - i, z - j];
    const [a, b, c, d] = [ground(i, j), ground(i + 1, j), ground(i, j + 1), ground(i + 1, j + 1)];
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  };
  const out = {};
  for (const _ of buildGrounds(site(), ground, out));
  const over = [];
  for (const m of out.paving) {
    const P = m.pos;
    for (let k = 0; k < P.length; k += 9) {
      // the middle of each triangle of it
      const [x, y, z] = [0, 1, 2].map((o) => (P[k + o] + P[k + 3 + o] + P[k + 6 + o]) / 3);
      over.push(y - drawn(x, z));
    }
  }
  over.sort((a, b) => a - b);
  assert.ok(over.length > 50000);
  assert.ok(over[0] > 0, `never under the ground (${over[0].toFixed(3)} m)`);
  const half = over[over.length >> 1];
  assert.ok(half < 0.09, `about a boot's sole over it (${half.toFixed(3)} m), not up round your ankles`);
});

test('the zoo is built a little at a time, and the forest keeps off what is built', () => {
  const zoo = new Zoo({ card: { at: [0, 0] }, offset: 0, ground: flat, wet: () => false, water: () => NaN });
  let steps = 0;
  while (zoo.pump(5)) steps++;
  assert.ok(zoo.ready && steps > 20, `${steps} steps`);
  assert.ok(zoo.group.children.length > 8);
  assert.ok(Object.values(zoo.solids).flat().length > 1000, 'walls and fences to bump into');
  // no tree in the Reptile Discovery Center, nor on the paths; the pens keep theirs
  const reptiles = zoo.site.buildings.find((b) => b.name === 'Reptile Discovery Center').faces[0][0];
  const [x, z] = reptiles.reduce((s, p) => [s[0] + p[0] / reptiles.length, s[1] + p[1] / reptiles.length], [0, 0]);
  assert.ok(zoo.clears(x, z));
  const walk = PLAN.paths.find((p) => p.name === 'Olmsted Walk');
  assert.ok(zoo.clears(walk.pts[0], walk.pts[1]));
  assert.ok(zoo.bare(walk.pts[0], walk.pts[1]), 'no grass on Olmsted Walk');
  zoo.dispose();
});
