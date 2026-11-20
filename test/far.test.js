// A long way from the middle of the world.
//
// The game thinks in 64-bit numbers; the graphics card is handed 32-bit
// floats, which 4,000 km out (the far side of the Earth, at the game's 1:5)
// can't tell a quarter of a metre apart. So nothing is handed to it from that
// far: each frame is drawn from an origin near the camera, and everything
// that fills a buffer measures from a spot of its own (src/render/origin.js).
// These check both halves, out where it would show.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Origin, SNAP, anchor } from '../src/render/origin.js';
import { PERIOD } from '../src/render/glsl.js';
import { cellKey } from '../src/core/geom.js';
import { Buildings } from '../src/build/buildings.js';
import { Mesher } from '../src/build/geometry.js';
import { Solids } from '../src/world/solids.js';
import { Chips } from '../src/build/chips.js';
import { PLANS } from '../src/blueprints/plans.js';
import { normalize, place } from '../src/blueprints/plan.js';
import { ghostGeometry } from '../src/blueprints/ghost.js';
import { Splashes } from '../src/splashes/splashes.js';
import { FireFx } from '../src/fires/look.js';
import { FarView } from '../src/hikes/farView.js';
import { ChunkManager } from '../src/world/chunks.js';
import { WorldGen } from '../src/world/worldgen.js';
import { createVegetationMaterial } from '../src/world/materials.js';
import { makePine, makeBroadleaf, makeBirch, makeBush, makeFern, makeRock, makeLog } from '../src/world/models.js';
import { CONFIG } from '../src/config.js';
import { layoutCave, cellOf } from '../src/caves/sites.js';
import { buildCave, finish } from '../src/caves/build.js';
import { caveKit, caveObject } from '../src/caves/look.js';
import { CUTS, setCuts } from '../src/world/cuts.js';

// Game metres: about as far as the world goes, and not a round number.
const FAR = [3_987_654, -2_345_678];
// Nothing handed to the card should be further from zero than this (m): the
// origin's reach, and as far as anything is drawn from it.
const SMALL = 4096;

const scene = { add() {}, remove() {} };
const biggest = (arr) => arr.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const near = (object, [x, z], within, what) => {
  const d = Math.hypot(object.position.x - x, object.position.z - z);
  assert.ok(d <= within, `${what} is put ${d.toFixed(1)} m from what it draws`);
};
// How finely a 32-bit float can place something this far from zero.
const step32 = (v) => {
  const f = Math.fround(v);
  let u = 1;
  while (Math.fround(f + u / 2) !== f) u /= 2;
  return u;
};

test('the origin follows the camera in long strides', () => {
  const o = new Origin();
  assert.equal(o.follow(900, -900), false, 'a walk from the middle leaves it be');
  assert.deepEqual([o.x, o.z], [0, 0]);
  assert.equal(o.follow(...FAR), true);
  assert.ok(o.x % SNAP === 0 && o.z % SNAP === 0, 'it sits on whole strides');
  assert.ok(Math.abs(FAR[0] - o.x) <= SNAP / 2 && Math.abs(FAR[1] - o.z) <= SNAP / 2, 'as near the camera as they allow');
  const [x, z] = [o.x, o.z];
  assert.equal(o.follow(x + SNAP, z - SNAP), false, 'and stays put until the camera is a stride away');
  assert.equal(o.follow(x + SNAP + 1, z), true);
  assert.ok(step32(SNAP * 2) < 0.001, 'so what is drawn is placed to well under a millimetre');
  // where it is within the patterns' period, for the shaders
  o.follow(...FAR);
  const { x: wx, y: wz } = o.wrapped(PERIOD);
  assert.ok(wx >= 0 && wx < PERIOD && wz >= 0 && wz < PERIOD);
  assert.equal(Math.abs((o.x - wx) % PERIOD), 0);
  assert.equal(Math.abs((o.z - wz) % PERIOD), 0);
  assert.equal(PERIOD % SNAP, 0, 'the origin only ever moves by a whole number of metres within it');
});

test('a frame is drawn from the origin, and the world put back after', () => {
  const o = new Origin();
  const world = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const tree = new THREE.Object3D();
  const sky = new THREE.HemisphereLight();
  const player = { value: new THREE.Vector3(FAR[0] + 3, 12, FAR[1] - 4) };
  const box = { value: new THREE.Vector2(FAR[0] + 32, FAR[1] + 32) };
  world.add(tree, sky);
  tree.position.set(FAR[0] + 10.25, 30, FAR[1] - 7.5);
  sky.position.set(0, 1, 0);
  camera.position.set(FAR[0] + 0.125, 31.7, FAR[1] + 0.375);
  o.place(player);
  o.place(box);
  o.keep(sky);
  o.follow(camera.position.x, camera.position.z);

  o.begin(world, camera);
  world.updateMatrixWorld(); // as the renderer does
  camera.updateMatrixWorld();
  const drawn = new THREE.Vector3().setFromMatrixPosition(tree.matrixWorld);
  const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  assert.ok(biggest(drawn.toArray()) < SMALL && biggest(eye.toArray()) < SMALL, 'the card sees small numbers');
  assert.deepEqual(drawn.clone().sub(eye).toArray(), [10.125, -1.6999999999999993, -7.875], 'the same way round the camera, to the last bit');
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(sky.matrixWorld).toArray(), [0, 1, 0], 'the sky is still overhead');
  assert.deepEqual([player.value.x - eye.x, player.value.y, player.value.z - eye.z], [2.875, 12, -4.375], 'a uniform that is a place has come too');
  assert.deepEqual([box.value.x - eye.x, box.value.y - eye.z], [31.875, 31.625], 'as (x, z) too');

  o.end(world, camera);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(tree.matrixWorld).toArray(), [FAR[0] + 10.25, 30, FAR[1] - 7.5], 'between frames things are where they are in the world');
  assert.deepEqual(camera.position.toArray(), [FAR[0] + 0.125, 31.7, FAR[1] + 0.375]);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld).toArray(), camera.position.toArray());
  assert.deepEqual(player.value.toArray(), [FAR[0] + 3, 12, FAR[1] - 4]);
  assert.deepEqual(box.value.toArray(), [FAR[0] + 32, FAR[1] + 32]);
  assert.deepEqual(sky.position.toArray(), [0, 1, 0]);
  assert.deepEqual(world.position.toArray(), [0, 0, 0]);
});

test('an anchor keeps up with what is drawn from it', () => {
  const o = new THREE.Object3D();
  assert.equal(anchor(o, 3.7, -2.2), o.position, 'near enough already');
  assert.deepEqual(o.position.toArray(), [0, 0, 0]);
  anchor(o, FAR[0] + 0.4, FAR[1] - 0.4);
  assert.deepEqual(o.position.toArray(), [FAR[0], 0, FAR[1]], 'moved to the nearest whole metre');
  anchor(o, FAR[0] + 200, FAR[1]);
  assert.equal(o.position.x, FAR[0], 'and left there while things stay near');
});

test('chunks, tiles and metres of ground are numbered right round the Earth', () => {
  // 4,000 km is 62,500 chunks, 250,000 grass tiles and 4,000,000 metres:
  // packing two 16-bit numbers into a key ran out at 32,768.
  for (const n of [40_000, 62_500, 250_000, 4_000_000]) {
    const keys = new Set();
    for (const i of [-n, -n + 1, -1, 0, 1, n - 1, n]) for (const j of [-n, -n + 1, -1, 0, 1, n - 1, n]) keys.add(cellKey(i, j));
    assert.equal(keys.size, 49, `no two cells share a key at ${n}`);
    assert.ok(Number.isSafeInteger(cellKey(n, n)) && Number.isSafeInteger(cellKey(-n, -n)));
  }
  assert.ok(cellKey(5, 9) < cellKey(6, -9) && cellKey(5, 8) < cellKey(5, 9), 'keys sort by i, then j');
});

test('a cabin far away is built from where it stands', () => {
  // A log laid in the world, far out: its ends, 2 m either side of its
  // middle, have to come out 4 m apart, not 4 m give or take a float.
  const m = new Mesher();
  const mid = [FAR[0] + 0.37, 1.5, FAR[1] - 0.61];
  m.add(new THREE.BoxGeometry(4, 0.3, 0.3), new THREE.Matrix4().makeTranslation(...mid), (p, n, out) => out.setRGB(1, 1, 1));
  const at = m.anchor();
  const built = m.build(at).attributes.position.array;
  assert.ok(Math.hypot(at.x - mid[0], at.z - mid[2]) < 4 && biggest(built) < 8, 'measured from a spot beside it');
  let worst = 0;
  for (let i = 0; i < built.length; i += 3) {
    worst = Math.max(worst, Math.abs(Math.abs(built[i] + at.x - mid[0]) - 2), Math.abs(Math.abs(built[i + 1] + at.y - mid[1]) - 0.15), Math.abs(Math.abs(built[i + 2] + at.z - mid[2]) - 0.15));
  }
  assert.ok(worst < 1e-5, `true to a hundredth of a millimetre (${worst.toExponential(1)} m), where a float that far out has ${step32(FAR[0])} m to work with`);

  // Four walls and a roof, the way you would by hand.
  const B = new Buildings({ scene, solids: new Solids(), material: null });
  const [ox, oz] = FAR;
  for (const [x, z] of [[0, 0], [4, 0], [0, 3], [4, 3]]) assert.ok(B.addFooting(ox + x, oz + z, 2));
  const b = B.list[0];
  for (let c = 0; c < 6; c++) {
    for (const [axis, line, s0, s1] of [['x', 0, 0, 4], ['x', 3, 0, 4], ['z', 0, 0, 3], ['z', 4, 0, 3]]) {
      const [o, p] = axis === 'x' ? [oz, ox] : [ox, oz];
      const L = B.addLog(b, c % 2 ? 'timber' : 'log', axis, o + line, p + s0, p + s1);
      assert.ok(L, `course ${c} ${axis}@${line}`);
      for (const n of [...L.below]) B.notch(b, L, n);
    }
  }
  const c = B.roofCandidate(b, ox + 2, oz + 1.5);
  assert.ok(c.ok, c.reason);
  B.addRoof(b, c.roof);
  near(b.mesh, FAR, 16, 'the cabin');
  const logs = b.mesh.geometry.attributes.position.array;
  assert.ok(logs.length > 1000 && biggest(logs) < 64, 'and its logs, footings and roof are measured from it');
  const box = b.mesh.geometry.boundingBox;
  assert.ok(box.max.x - box.min.x > 4 && box.max.x - box.min.x < 7 && box.max.z - box.min.z > 3 && box.max.z - box.min.z < 6, 'the size it was built');

  // And one still on paper: a blueprint staked out, its ghost and the grade
  // it will be levelled to.
  for (const raw of PLANS) {
    const placed = place(normalize(raw), ...FAR, 1);
    const g = ghostGeometry(placed, { y0: 3, ground: () => 2, trouble: new Set([`${placed.footings[0].x},${placed.footings[0].z}`]), pad: 2 });
    assert.ok(Math.hypot(g.at.x - FAR[0], g.at.z - FAR[1]) < 64, `the ghost of ${raw.name} is put by its plan`);
    for (const geo of [g.pieces, g.trouble]) {
      const drawn = geo.attributes.position.array;
      assert.ok(drawn.length > 0 && biggest(drawn) < 64, 'and measured from there');
    }
  }
});

test('what flies about far away still flies', () => {
  // drops of water: a few centimetres a frame, which a float that far out would lose
  const s = new Splashes(scene);
  s.burst(FAR[0] + 0.3, 1.02, FAR[1] - 0.7, 1, 20, { up: 2.2, vx: 1.5 });
  near(s.points, FAR, 2, 'the splash');
  // (each drop is thrown its own way, some of them barely at all: judge the
  // twenty together, not any one of them)
  const from = Array.from({ length: 20 }, (_, k) => s.pos[k * 3]);
  let peak = 0;
  let moved = 0;
  for (let f = 0; f < 120; f++) {
    const before = s.pos.slice(0, 60);
    s.update(1 / 60);
    let any = false;
    for (let k = 0; k < 20; k++) {
      if (s.age[k] >= 0 && s.pos[k * 3] !== before[k * 3]) any = true;
      peak = Math.max(peak, s.pos[k * 3 + 1] - 1);
    }
    if (any) moved++;
  }
  const along = Math.max(...from.map((x, k) => Math.abs(s.pos[k * 3] - x)));
  assert.ok(biggest(s.pos) < 64, 'drops are kept from where the splash is');
  assert.ok(peak > 0.1 && s.live === 0, 'up, and back into the water');
  assert.ok(moved > 10 && along > 0.2, `and along, every frame (${moved} frames, ${along} m)`);
  // a second splash somewhere else leaves the first behind rather than dragging it along
  s.burst(FAR[0] + 0.3, 1.02, FAR[1] - 0.7, 1, 5);
  s.burst(FAR[0] + 900, 1.02, FAR[1], 1, 5);
  s.update(1 / 60);
  assert.equal(s.live, 5);
  near(s.points, [FAR[0] + 900, FAR[1]], 2, 'the new splash');

  // chips off an axe
  const chips = new Chips(scene, { heightAt: () => 0 });
  chips.burst({ x: FAR[0], y: 1, z: FAR[1] }, 30, 0xffffff, 3, 0.3);
  chips.update(1 / 60);
  near(chips.mesh, FAR, 2, 'the chips');
  assert.ok(biggest(chips.mesh.instanceMatrix.array.subarray(0, 30 * 16)) < 64);

  // sparks and smoke off a fire
  const fx = new FireFx(scene);
  const fire = { x: FAR[0], y: 5, z: FAR[1] };
  fx.emit(fire, { state: 'burning', heat: 1 }, 2);
  fx.update(1 / 60, null);
  assert.ok(fx.sp.length > 0 && fx.pf.length > 0);
  near(fx.sparksMesh, FAR, 2, 'the sparks');
  near(fx.smokeMesh, FAR, 2, 'the smoke');
  assert.ok(biggest(fx.spGeo.attributes.position.array) < 64 && biggest(fx.pfGeo.attributes.aPuff.array) < 64);
});

test('the land far away is drawn from its own corner', () => {
  // the far view of a hike
  const n = 8;
  const grid = { x0: FAR[0], z0: FAR[1], n, step: 16, h: new Float32Array(n * n).fill(40), water: new Float32Array(n * n).fill(-1e9), forest: new Float32Array(n * n), species: new Float32Array(n * n) };
  const far = new FarView(scene);
  far.add('there', grid);
  const mesh = far.meshes.get('there');
  near(mesh, FAR, 0, 'the far view');
  assert.ok(biggest(mesh.geometry.attributes.position.array) <= (n - 1) * 16);
  assert.equal(far.reach(FAR[0] + 56, FAR[1] + 56), 56, 'and still knows where it is in the world');

  // a chunk: its ground, and every plant on it
  const warn = console.warn;
  console.warn = () => {}; // no Web Workers here: it says so, and grows the chunk itself
  const models = { pine: makePine(11), broad: makeBroadleaf(23), birch: makeBirch(37), bush: makeBush(41), fern: makeFern(53), rock: makeRock(67), log: makeLog(71) };
  const materials = { terrain: null, water: null, vegetation: createVegetationMaterial() };
  const chunks = new ChunkManager(scene, new WorldGen(CONFIG.seed, []), materials, models);
  console.warn = warn;
  chunks.update(...FAR, 30); // a budget (ms) that the first chunk uses up
  const grown = [...chunks.chunks.values()].filter((ch) => ch.terrain);
  assert.ok(grown.length > 0, 'a chunk grew');
  const S = CONFIG.chunkSize;
  let plants = 0;
  for (const ch of grown) {
    assert.ok(Math.abs(ch.x0 - FAR[0]) < 1000 && Math.abs(ch.z0 - FAR[1]) < 1000);
    for (const mesh of [ch.terrain, ch.water, ...ch.veg.map((v) => v.mesh)]) {
      if (!mesh) continue;
      assert.deepEqual([mesh.position.x, mesh.position.z], [ch.x0, ch.z0], 'everything of a chunk is put at its corner');
    }
    const ground = ch.terrain.geometry.attributes.position.array;
    for (let i = 0; i < ground.length; i += 3) assert.ok(ground[i] >= 0 && ground[i] <= S && ground[i + 2] >= 0 && ground[i + 2] <= S);
    for (const { kind, mesh } of ch.veg) {
      const m = mesh.instanceMatrix.array;
      const list = ch.vegLists[kind];
      for (let k = 0; k < mesh.count; k++) {
        const [x, z] = [m[k * 16 + 12], m[k * 16 + 14]];
        assert.ok(x >= 0 && x <= S && z >= 0 && z <= S, `a ${kind} is placed from the chunk's corner`);
        // ... and stands exactly where the world says it does
        assert.ok(Math.abs(ch.x0 + x - list[k * 7]) < 1e-4 && Math.abs(ch.z0 + z - list[k * 7 + 2]) < 1e-4);
        plants++;
      }
    }
  }
  assert.ok(plants > 0, 'with plants on it');
});

test('a cave far away is built from its own spot, and its mouth cut where it is drawn', () => {
  const gen = new WorldGen(CONFIG.seed, []);
  const [cx, cz] = cellOf(...FAR);
  let cave = null;
  for (let r = 0; r < 4 && !cave; r++) {
    for (let i = -r; i <= r && !cave; i++) for (let j = -r; j <= r && !cave; j++) cave = layoutCave(gen, cx + i, cz + j);
  }
  assert.ok(cave, 'there is a cave out there');
  const built = finish(buildCave(gen, cave));
  const group = caveObject(caveKit({ rock: makeRock(67) }, createVegetationMaterial()), built);
  near(group, [cave.mouth.x, cave.mouth.z], 400, 'a cave');
  let things = 0;
  group.traverse((o) => {
    const pos = o.geometry && o.geometry.attributes.position;
    if (pos && !o.isInstancedMesh) assert.ok(biggest(pos.array) < SMALL, `${o.type} is measured from the cave`);
    if (!o.isInstancedMesh) return;
    const m = o.instanceMatrix.array;
    for (let k = 0; k < o.count; k++) assert.ok(biggest([m[k * 16 + 12], m[k * 16 + 13], m[k * 16 + 14]]) < SMALL, 'and so is each thing in it');
    things += o.count;
  });
  assert.ok(things > 0, 'there are boulders at its mouth, at least');
  // ... and stands exactly where the cave says it does
  const boulders = group.children.findLast((o) => o.isInstancedMesh);
  const at = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(boulders.instanceMatrix.array, (built.rocks.length - 1) * 16));
  const last = built.rocks[built.rocks.length - 1];
  assert.ok(Math.abs(group.position.x + at.x - last.x) < 1e-3 && Math.abs(group.position.z + at.z - last.z) < 1e-3);

  // the hole in the hillside is drawn where the ground is
  setCuts(built.cuts);
  const o = new Origin();
  o.place(CUTS.uCutAt);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(cave.mouth.x + 3, 0, cave.mouth.z - 2);
  o.follow(camera.position.x, camera.position.z);
  o.begin(new THREE.Scene(), camera);
  const c = built.cuts[0];
  const drawn = CUTS.uCutAt.value[0];
  assert.ok(biggest(drawn.toArray()) < SMALL, 'the card is told where a cut is from the origin');
  assert.ok(Math.abs(drawn.x - camera.position.x - (c.ax - cave.mouth.x - 3)) < 1e-3 && Math.abs(drawn.y - camera.position.z - (c.az - cave.mouth.z + 2)) < 1e-3, 'the same way round the camera');
  o.end(new THREE.Scene(), camera);
  assert.deepEqual(CUTS.uCutAt.value[0].toArray(), [c.ax, c.az], 'and put back after');
  setCuts([]);
});
