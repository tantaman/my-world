// What built things are made of (src/build/surfaces.js): each vertex a
// Mesher builds says which surface it is, how worn, and where it is along
// the piece's grain, so the building material can draw bark along a log,
// rings on its cut end and grain along a board, wherever in the world it is.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Mesher, addRoundLog, addTimber, alongMatrix } from '../src/build/geometry.js';
import { SURF, UPRIGHT } from '../src/build/surfaces.js';
import { growWorld } from '../src/world/lands.js';
import { Sites } from '../src/landmarks/sites.js';
import { buildSite } from '../src/landmarks/models.js';

// -> [{ kind, wear, u, v, nx, ny, nz }] for each vertex of a built geometry
function vertices(g) {
  const k = g.attributes.aSurf.array;
  const uv = g.attributes.aUV.array;
  const n = g.attributes.normal.array;
  return [...k].map((s, i) => ({ kind: Math.floor(s + 1e-3), wear: s - Math.floor(s + 1e-3), u: uv[i * 2], v: uv[i * 2 + 1], nx: n[i * 3], ny: n[i * 3 + 1], nz: n[i * 3 + 2] }));
}
const spread = (list, key) => Math.max(...list.map((p) => p[key])) - Math.min(...list.map((p) => p[key]));

test('a log is bark along its length, and its cut ends are end grain round the pith', () => {
  const m = new Mesher();
  addRoundLog(m, alongMatrix('x', 10, 2, 5), 4, 7);
  const all = vertices(m.build());
  assert.equal(all.length, m.n);
  const bark = all.filter((p) => p.kind === SURF.bark);
  const ends = all.filter((p) => p.kind === SURF.end);
  assert.ok(bark.length > 0 && ends.length > 0, 'bark and end grain');
  assert.equal(bark.length + ends.length, all.length, 'and nothing else');
  // the ends face along the log (x), the bark round it
  for (const p of ends) assert.ok(Math.abs(p.nx) > 0.9, 'an end faces along the log');
  for (const p of bark) assert.ok(Math.abs(p.nx) < 0.5, 'bark faces out from it');
  // the bark's grain runs the length of it, and round it as far as it goes round
  assert.ok(Math.abs(spread(bark, 'u') - 4) < 0.05, `along it: ${spread(bark, 'u')}`);
  assert.ok(Math.abs(spread(bark, 'v') - Math.PI * 2 * 0.17) < 0.1, `round it: ${spread(bark, 'v')}`);
  // and the rings go round the middle of the end, near enough
  for (const p of ends) assert.ok(Math.hypot(p.u, p.v) < 0.17 + 0.05, 'an end is measured from its pith');
});

test('a board shows its grain along it, and end grain where it is cut across', () => {
  const m = new Mesher();
  m.surf = SURF.wood;
  m.add(new THREE.BoxGeometry(0.2, 0.05, 2.4), new THREE.Matrix4(), (p, n, out) => out.setRGB(0.5, 0.4, 0.3));
  const all = vertices(m.build());
  const faces = all.filter((p) => p.kind === SURF.wood);
  const ends = all.filter((p) => p.kind === SURF.end);
  assert.equal(ends.length, 8, 'its two ends');
  for (const p of ends) assert.ok(Math.abs(p.nz) > 0.9);
  // on every face along it, u runs its 2.4 m
  for (const dir of ['nx', 'ny']) {
    for (const s of [-1, 1]) {
      const face = faces.filter((p) => p[dir] * s > 0.9);
      assert.ok(Math.abs(spread(face, 'u') - 2.4) < 1e-4, `${dir} ${s}: ${spread(face, 'u')}`);
    }
  }
});

test('a hewn timber is wood, and how worn a mesher is goes with every vertex', () => {
  const m = new Mesher();
  m.wear = 0.4;
  addTimber(m, alongMatrix('z', 0, 0, 0), 3, 1);
  const all = vertices(m.build());
  assert.ok(all.every((p) => p.kind === SURF.wood || p.kind === SURF.end));
  for (const p of all) assert.ok(Math.abs(p.wear - 0.4) < 1e-3, `worn ${p.wear}`);
});

test("a flat face's pattern runs level across it, or up it, and stays small far out in the world", () => {
  const far = 4.0e6; // m: a world is thousands of kilometres across
  const quad = (m, surf) => {
    const a = new THREE.Vector3(far, 10, far);
    const b = new THREE.Vector3(far + 3, 10, far);
    const c = new THREE.Vector3(far + 3, 12, far);
    const d = new THREE.Vector3(far, 12, far);
    m.tris([a, b, c, a, c, d], (p, n, out) => out.setRGB(1, 1, 1), surf);
  };
  const m = new Mesher();
  quad(m, SURF.paint);
  quad(m, SURF.wood | UPRIGHT);
  const all = vertices(m.build(m.anchor()));
  const level = all.slice(0, 6);
  const upright = all.slice(6);
  assert.ok(level.every((p) => p.kind === SURF.paint) && upright.every((p) => p.kind === SURF.wood), 'UPRIGHT is not part of the surface');
  assert.ok(Math.abs(spread(level, 'u') - 3) < 1e-3 && Math.abs(spread(level, 'v') - 2) < 1e-3, 'level: along the wall, then up it');
  assert.ok(Math.abs(spread(upright, 'u') - 2) < 1e-3 && Math.abs(spread(upright, 'v') - 3) < 1e-3, 'upright: up the wall, then along it');
  for (const p of all) assert.ok(Math.abs(p.u) < 20 && Math.abs(p.v) < 20, `small numbers: ${p.u}, ${p.v}`);
});

test('an old cabin is logs, end grain, shakes, boards and stone, and worn', () => {
  const gen = growWorld(20261119, [], 1);
  const site = new Sites(gen).within(-2100, -2100, 2100, 2100).find((s) => s.kind === 'cabin');
  const built = buildSite(site, (x, z) => gen.height(x, z), new THREE.MeshBasicMaterial());
  const kinds = new Set();
  let worn = 0;
  let count = 0;
  built.object.traverse((o) => {
    if (!o.isMesh) return;
    for (const p of vertices(o.geometry)) {
      kinds.add(p.kind);
      worn += p.wear;
      count++;
    }
  });
  for (const k of ['bark', 'end', 'shingle', 'wood', 'stone']) assert.ok(kinds.has(SURF[k]), `it has ${k}`);
  assert.ok(worn / count > 0.3, `it is old: ${(worn / count).toFixed(2)}`);
});
