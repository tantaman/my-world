// Caves: grown from the seed without changing what it grows, closed rock
// you can walk the length of, a floor and walls that hold you, and a hole
// in the hillside only where the way in is — on every land. Where they are
// is pinned: a cave's id is in your save once you've been in or tracked it.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { growWorld, LANDS } from '../src/world/lands.js';
import { layoutCave, CAVE, daylight, farthest } from '../src/caves/sites.js';
import { buildCave, finish, step, terrainOf } from '../src/caves/build.js';
import { WALK } from '../src/caves/space.js';
import { Spaces } from '../src/world/spaces.js';
import { cutField, SHRINK } from '../src/world/cuts.js';
import { Player } from '../src/player/player.js';
import { matchesGolden } from './helpers/golden.js';
import { Caves } from '../src/caves/caves.js';
import { cellOf } from '../src/caves/sites.js';
import { HIKES } from '../src/world/hikes.js';
import { Landforms, reachOf } from '../src/world/landforms.js';
import { earthAtFirst } from './helpers/earth.js';
// The real Earth under the world, as the game has it when it opens (world/earth.js).
const EARTH = await earthAtFirst();

const SEED = 20261119;
// The land, and a few squares near the start there that have caves
// (checked below): most of what follows is about these.
const gen = growWorld(SEED, [], 1, [], EARTH);
// ...and on every land, the caves in the squares round the start
const NEAR = [-2, -1, 0, 1];
const SQUARES = NEAR.flatMap((cz) => NEAR.map((cx) => [cx, cz]))
  .filter(([cx, cz]) => layoutCave(gen, cx, cz))
  .slice(0, 4);
const caves = SQUARES.map(([cx, cz]) => layoutCave(gen, cx, cz));
const WORLDS = LANDS.map((land) => {
  const g = land === 1 ? gen : growWorld(SEED, [], land, [], EARTH);
  const found = [];
  for (const cz of NEAR) for (const cx of NEAR) found.push(layoutCave(g, cx, cz));
  return { land, gen: g, caves: found.filter(Boolean) };
});
const built = new Map();
const build = (cave, g = gen) => {
  const k = `${g.land || 1}/${cave.id}`;
  if (!built.has(k)) built.set(k, finish(buildCave(g, cave)));
  return built.get(k);
};

for (const land of LANDS) for (const seed of [SEED, 42]) {
  test(`seed ${seed}, land ${land}: where the caves are`, () => {
    const g = seed === SEED ? WORLDS[land - 1].gen : growWorld(seed, [], land, [], EARTH);
    const list = [];
    for (const cz of NEAR) for (const cx of NEAR) {
      const c = seed === SEED ? WORLDS[land - 1].caves.find((k) => k.cx === cx && k.cz === cz) : layoutCave(g, cx, cz);
      if (c) list.push({ id: c.id, x: c.mouth.x, z: c.mouth.z, name: c.name, nodes: c.nodes.length, rooms: c.rooms.length });
    }
    assert.ok(list.length >= 8, `${list.length} of 16 squares have one`);
    matchesGolden(land > 1 ? `caves-${seed}-land${land}` : `caves-${seed}`, list, { tolerance: 1e-6 });
  });
}

test('on every land, each cave is closed rock you can walk from its mouth to its far end', () => {
  for (const { land, gen: g, caves: list } of WORLDS) {
    // all of them on the newest land, where new worlds are (and the hillsides steepest)
    for (const c of land === LANDS.at(-1) ? list : list.slice(0, 3)) {
      const { mesh, cols } = build(c, g);
      assert.equal(openEdges(mesh), 0, `land ${land}, ${c.id}: no edge left open`);
      assert.deepEqual(unreached(c, cols), [], `land ${land}, ${c.id}: every part can be got to`);
    }
  }
});

test('caves are grown from the seed: the same every time, and some near the start', () => {
  for (const c of caves) assert.ok(c, 'each of these squares has one');
  const again = growWorld(SEED, [], 1, [], EARTH);
  for (const [cx, cz] of SQUARES) assert.deepEqual(layoutCave(again, cx, cz), layoutCave(gen, cx, cz));
  const start = gen.findSpawn(0, 0);
  const nearest = Math.min(...caves.map((c) => Math.hypot(c.mouth.x - start.x, c.mouth.z - start.z)));
  assert.ok(nearest < 1000, `the nearest is ${nearest.toFixed(0)} m from the start`);
  // and another seed has caves of its own
  const other = growWorld(42, [], 1, [], EARTH);
  assert.notDeepEqual(layoutCave(other, 0, 0)?.mouth, caves[0].mouth);
});

test('no cave is grown where a real place reaches, and everywhere else they are as they were', () => {
  // told from the hikes' cards alone: their land is never fetched here
  const landforms = new Landforms(HIKES);
  const found = new Caves({ gen, keepOff: (x0, z0, x1, z1) => !!landforms.reaches(x0, z0, x1, z1) });
  for (const card of HIKES) {
    const [cx, cz] = cellOf(...card.at);
    for (const [i, j] of [[0, 0], [1, 0], [0, -1], [-1, 1]]) assert.equal(found.site(cx + i, cz + j), null, `none on ${card.id}`);
    // a little beyond its reach, the forest's own
    const [fx, fz] = cellOf(card.at[0] + reachOf(card) + 2 * CAVE.cell, card.at[1]);
    if (!landforms.reaches(fx * CAVE.cell, fz * CAVE.cell, (fx + 1) * CAVE.cell, (fz + 1) * CAVE.cell)) assert.deepEqual(found.site(fx, fz), layoutCave(gen, fx, fz));
  }
  for (const [cx, cz] of SQUARES) assert.deepEqual(found.site(cx, cz), layoutCave(gen, cx, cz), 'the caves near the start are where they were');
});

test('a cave changes nothing the seed grows', () => {
  const before = [];
  for (const c of caves) for (const n of c.nodes) before.push(gen.height(n.x, n.z));
  for (const c of caves) build(c);
  const after = [];
  for (const c of caves) for (const n of c.nodes) after.push(growWorld(SEED, [], 1, [], EARTH).height(n.x, n.z));
  assert.deepEqual(after, before);
});

test('every passage keeps a roof of earth over it past the way in, and keeps away from water', () => {
  for (const c of caves) {
    c.passages.forEach((p, i) => {
      if (i === 0) return; // the way in comes up to the hillside
      const a = c.nodes[p.a];
      const b = c.nodes[p.b];
      for (let f = 0; f <= 1; f += 0.1) {
        const x = a.x + (b.x - a.x) * f;
        const z = a.z + (b.z - a.z) * f;
        const land = gen.height(x, z);
        const roof = a.floor + (b.floor - a.floor) * f + p.h;
        assert.ok(land - roof > CAVE.cover - 0.31, `${c.id}: ${(land - roof).toFixed(2)} m over a roof`);
        assert.ok(!gen.water.region || gen.water.edge > CAVE.water, `${c.id}: water over a passage`);
      }
    });
    // the way in reaches full cover before it ends
    const end = c.nodes[1];
    assert.ok(gen.height(end.x, end.z) - (end.floor + c.mouth.h) >= CAVE.cover - 0.01);
    // and everything stays in its own square
    const [x0, z0, x1, z1] = c.bounds;
    assert.ok(x0 >= c.cx * CAVE.cell && x1 <= (c.cx + 1) * CAVE.cell && z0 >= c.cz * CAVE.cell && z1 <= (c.cz + 1) * CAVE.cell, `${c.id} is inside its square`);
  }
});

// Edges of the rock shared by an odd number of faces: holes. (Two sheets
// of rock touching at an edge share it four ways, which is closed.)
function openEdges(mesh) {
  const I = mesh.index;
  const edges = new Map();
  for (let t = 0; t < I.length; t += 3) {
    for (const [u, v] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) {
      const k = u < v ? u * 1e6 + v : v * 1e6 + u;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  let open = 0;
  for (const n of edges.values()) if (n % 2) open++;
  return open;
}

// Faces turned away from the cave's air. Where a quad folds, the mesh can
// leave a tiny face lying all but edge-on to the smoothed rock around it — a
// couple of centimetres across and a fraction of a degree past square, which
// is the fold, not a face looking the wrong way. So a face is judged only
// once it has some area and points away by more than EDGE_ON.
const EDGE_ON = 0.05; // cosine: about 3° past edge-on
function facingAway(mesh) {
  const P = mesh.position;
  const N = mesh.normal;
  const I = mesh.index;
  let away = 0;
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, d] = [I[t], I[t + 1], I[t + 2]];
    const e1 = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]];
    const e2 = [P[d * 3] - P[a * 3], P[d * 3 + 1] - P[a * 3 + 1], P[d * 3 + 2] - P[a * 3 + 2]];
    const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const n = [0, 1, 2].map((k) => N[a * 3 + k] + N[b * 3 + k] + N[d * 3 + k]);
    const fl = Math.hypot(f[0], f[1], f[2]);
    const nl = Math.hypot(n[0], n[1], n[2]);
    if (fl / 2 > 0.02 && nl > 1e-9 && (f[0] * n[0] + f[1] * n[1] + f[2] * n[2]) / (fl * nl) < -EDGE_ON) away++;
  }
  return away;
}

// The nodes of a cave you can't walk to from its lip: [index]. You can
// walk where it's walkable, and in the cutting wherever it's no deeper than
// a step (no walls there to stop you).
function unreached(c, cols) {
  const { nx, res, x0, z0, walk, F, T } = cols;
  const col = (x, z) => Math.round((x - x0) / res) + Math.round((z - z0) / res) * nx;
  const can = (k) => walk[k] || (Number.isFinite(F[k]) && T[k] >= F[k] - 0.02 && T[k] - F[k] < WALK.walls);
  const m = c.mouth;
  const start = col(m.x + m.ux * 0.25, m.z + m.uz * 0.25);
  if (!can(start)) return ['the lip'];
  const seen = new Uint8Array(walk.length);
  const todo = [start];
  seen[start] = 1;
  while (todo.length) {
    const k = todo.pop();
    for (const o of [k - 1, k + 1, k - nx, k + nx]) {
      if (o >= 0 && o < walk.length && can(o) && !seen[o]) {
        seen[o] = 1;
        todo.push(o);
      }
    }
  }
  const out = [];
  c.nodes.forEach((n, i) => {
    let near = false;
    for (let dz = -3; dz <= 3 && !near; dz++) for (let dx = -3; dx <= 3 && !near; dx++) near = seen[col(n.x, n.z) + dx + dz * nx] === 1;
    if (!near) out.push(i);
  });
  return out;
}

test('the rock is closed and faces into the air', () => {
  for (const c of caves) {
    const { mesh } = build(c);
    assert.equal(openEdges(mesh), 0, `${c.id}: no edge is left open`);
    assert.equal(facingAway(mesh), 0, `${c.id}: every face looks into the cave`);
    assert.ok(mesh.count > 1000 && mesh.index.length / 3 < 60000, `${c.id}: ${mesh.index.length / 3} triangles`);
  }
});

test('you can walk from the mouth to the far end', () => {
  for (const c of caves) assert.deepEqual(unreached(c, build(c).cols), [], `${c.id}: you can get to every part of it`);
});

test('in a cave its floor is the ground, and on the hill above it the land is', () => {
  const c = caves[0];
  const { space } = build(c);
  const ground = terrainOf(gen);
  const out = { floor: 0, roof: 0 };
  const deep = c.nodes[farthest(c)];
  assert.ok(space.inside(deep.x, deep.z, deep.floor + 0.05, out), 'standing on its floor, you are in it');
  assert.ok(Math.abs(out.floor - deep.floor) < 0.45, `the floor is where it was laid (${out.floor.toFixed(2)} for ${deep.floor.toFixed(2)})`);
  assert.ok(out.roof - out.floor > WALK.clear, 'with room overhead');
  assert.equal(space.inside(deep.x, deep.z, ground(deep.x, deep.z), out), false, 'up on the hill, you are not');
  assert.ok(daylight(c, deep.d) < 0.01 && space.light(deep.x, deep.z) < 0.01, 'and no daylight gets that far');
  // the cutting at the mouth is open to the sky: in it at any height
  const m = c.mouth;
  const x = m.x + m.ux * m.portal * 0.5;
  const z = m.z + m.uz * m.portal * 0.5;
  const land = ground(x, z);
  assert.ok(space.inside(x, z, land + 1, out) && out.roof === Infinity, 'the cutting has no roof: in it, the ground is its floor');
  assert.equal(space.inside(x, z, land + 30, out), false, 'but flying high over it, you are not in it');
  assert.ok(space.light(x, z) > 0.95, 'and is in daylight');
  // and past the lip is just the hillside
  assert.equal(space.inside(m.x - m.ux * 2.5, m.z - m.uz * 2.5, ground(m.x - m.ux * 2.5, m.z - m.uz * 2.5), out), false);
});

test('the hillside is cut open for the way in, and nowhere else', () => {
  for (const c of caves) {
    const { cuts } = build(c);
    const ground = terrainOf(gen);
    const m = c.mouth;
    const k = m.portal * 0.6;
    const x = m.x + m.ux * k;
    const z = m.z + m.uz * k;
    const land = ground(x, z);
    assert.ok(land > m.floor - CAVE.mouth.fall * k + 0.2, `${c.id}: the land is above the floor in the cutting`);
    assert.ok(cutField(x, land, z, cuts[0]) < -SHRINK, `${c.id}: so it is cut away there`);
    // over the far end, the hill is whole
    const far = c.nodes[farthest(c)];
    assert.ok(cutField(far.x, ground(far.x, far.z), far.z, cuts[0]) > 1, `${c.id}: but not over the rest of the cave`);
  }
});

test('a build can be done a little at a time', () => {
  const job = buildCave(gen, caves[1]);
  let steps = 0;
  let result = null;
  while (!(result = step(job, 0))) steps++;
  assert.ok(steps > 5, `it took ${steps} steps`);
  assert.deepEqual(Array.from(result.mesh.index.subarray(0, 60)), Array.from(build(caves[1]).mesh.index.subarray(0, 60)), 'and comes out the same');
});

test('Spaces: which one you are in, and making them on demand', () => {
  const spaces = new Spaces();
  const { space } = build(caves[0]);
  const deep = caves[0].nodes[farthest(caves[0])];
  assert.equal(spaces.at(deep.x, deep.z, deep.floor), null);
  const asked = [];
  spaces.onDemand((x, z) => {
    asked.push([x, z]);
    spaces.add(space);
  });
  spaces.ensure(deep.x, deep.z);
  assert.deepEqual(asked, [[deep.x, deep.z]]);
  assert.equal(spaces.at(deep.x, deep.z, deep.floor + 0.1), space);
  assert.ok(spaces.air(deep.x, deep.floor + 1.2, deep.z, 0.2), 'head height is open air');
  assert.equal(spaces.air(deep.x, deep.floor - 1, deep.z, 0), false, 'under the floor is rock');
  spaces.remove(space);
  assert.equal(spaces.at(deep.x, deep.z, deep.floor + 0.1), null);
});

// A hiker, with nobody at the controls, walked by `steer`.
function hiker(spaces) {
  const ground = terrainOf(gen);
  const world = { heightAt: ground, waterAt: () => false, forEachCollider() {} };
  const input = { consumeLook: () => ({ x: 0, y: 0 }), lookRate: () => ({ x: 0, y: 0 }), consumeZoom: () => 0, isDown: () => false, moveAxes: () => ({ x: 0, y: 0 }), running: () => false, jumped: () => false };
  return new Player({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), world, input, spaces });
}
// (and, as anyone would, steps round what stands in the way: a column in a
// chamber, say)
const walkTo = (p, x, z, run = false, frames = 1500) => {
  p.steer = { x, z, run };
  let was = Infinity;
  let side = 1;
  for (let i = 0; i < frames && Math.hypot(p.pos.x - x, p.pos.z - z) > 0.2; i++) {
    p.update(1 / 60);
    if (i % 60 !== 59) continue;
    const left = Math.hypot(p.pos.x - x, p.pos.z - z);
    if (left > was - 0.2) {
      // no headway in a second: a step to the side, then on again
      const [dx, dz] = [(x - p.pos.x) / left, (z - p.pos.z) / left];
      p.steer = { x: p.pos.x - dz * 2 * side + dx, z: p.pos.z + dx * 2 * side + dz, run };
      for (let k = 0; k < 40; k++) p.update(1 / 60);
      p.steer = { x, z, run };
      side = -side;
    }
    was = left;
  }
};

// Down the passages from the end of the way in (node 1), each to the next
// grown out from it.
const chainOf = (c) => {
  const chain = [1];
  for (let k = 0; k < 2; k++) {
    const next = c.passages.find((q) => q.a === chain[chain.length - 1]);
    if (next) chain.push(next.b);
  }
  return chain;
};
// (A cave whose way in meets its first passage a step lower than that
// passage's floor can stop a hiker walking straight on from it: cave:-2:-2,
// on the real Olympics, does. This walks one that doesn't, the first near
// the start.)
const walked = (c, spaces) => {
  const p = hiker(spaces);
  const m = c.mouth;
  p.spawn(m.x - m.ux * 3, m.z - m.uz * 3, Math.atan2(m.ux, m.uz));
  for (const i of chainOf(c)) {
    walkTo(p, c.nodes[i].x, c.nodes[i].z);
    if (Math.hypot(p.pos.x - c.nodes[i].x, p.pos.z - c.nodes[i].z) >= 0.5) return false;
  }
  return true;
};

test('a hiker walks in at the mouth, down the passages, and is kept in by the walls', () => {
  const c = caves.find((k) => {
    const sp = new Spaces();
    sp.add(build(k).space);
    return walked(k, sp);
  });
  assert.ok(c, 'a cave near the start can be walked into');
  const { space } = build(c);
  const spaces = new Spaces();
  spaces.add(space);
  const ground = terrainOf(gen);
  const p = hiker(spaces);
  const m = c.mouth;
  p.spawn(m.x - m.ux * 3, m.z - m.uz * 3, Math.atan2(m.ux, m.uz));
  assert.equal(p.space, null, 'outside, on the hillside');
  const chain = chainOf(c);
  for (const i of chain) {
    const n = c.nodes[i];
    walkTo(p, n.x, n.z);
    assert.ok(Math.hypot(p.pos.x - n.x, p.pos.z - n.z) < 0.5, `got to node ${i}`);
    assert.equal(p.space, space, 'in the cave');
    assert.ok(Math.abs(p.pos.y - n.floor) < 0.45, `on its floor (${p.pos.y.toFixed(2)} for ${n.floor.toFixed(2)})`);
    assert.ok(p.pos.y < ground(p.pos.x, p.pos.z) - 2, 'well under the land');
    const cam = p.camera.position;
    // (and never in the rock: in the cave's air, or, just in at the mouth of
    // one in a steep hillside, still out in the open air behind you)
    assert.ok(spaces.air(cam.x, cam.y, cam.z, 0) || (!spaces.at(cam.x, cam.z, cam.y) && cam.y > ground(cam.x, cam.z)), 'and the camera keeps to the cave');
  }
  // run at the wall: it holds
  const a = c.nodes[chain[1]];
  const b = c.nodes[chain[2]];
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  walkTo(p, b.x - ((b.z - a.z) / len) * 20, b.z + ((b.x - a.x) / len) * 20, true, 240);
  assert.equal(p.space, space, 'still in the cave');
  assert.ok(p.pos.y < ground(p.pos.x, p.pos.z) - 2, 'and still under the land');
  assert.ok(p.pos.y > Math.min(a.floor, b.floor) - 1, 'and not fallen through the floor');
  // back out the way it came
  for (const i of [2, 1]) walkTo(p, c.nodes[i].x, c.nodes[i].z);
  walkTo(p, m.x - m.ux * 3, m.z - m.uz * 3);
  assert.equal(p.space, null, 'and out again');
  assert.ok(Math.abs(p.pos.y - ground(p.pos.x, p.pos.z)) < 0.3, 'on the hillside');
});

test('set down in a cave by its height, you land on its floor, not the hill', () => {
  const c = caves[0];
  const spaces = new Spaces();
  spaces.onDemand(() => spaces.add(build(c).space));
  const p = hiker(spaces);
  const n = c.nodes[farthest(c)];
  p.spawn(n.x, n.z, 0, Math.PI, n.floor);
  assert.ok(p.space, 'in the cave');
  assert.ok(Math.abs(p.pos.y - n.floor) < 0.45);
  p.spawn(n.x, n.z, 0);
  assert.equal(p.space, null, 'without a height, on the hill above');
});
