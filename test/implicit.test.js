// Shapes melted into one (render/implicit.js): the surface is closed and
// faces out, it is where the shapes say, two shapes that touch become one
// body with a fillet between them, a crease is darker than the open, a thin
// part is thin, and meshing it a little at a time comes out the same as all
// at once.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Melt } from '../src/render/implicit.js';

const P = (o, i) => [o.pos[i * 3], o.pos[i * 3 + 1], o.pos[i * 3 + 2]];

// every edge in two triangles: closed; each triangle wound to face the way
// its vertices' normals do: facing out
function check(o) {
  const edges = new Map();
  let against = 0;
  for (let t = 0; t < o.idx.length; t += 3) {
    const v = [o.idx[t], o.idx[t + 1], o.idx[t + 2]];
    for (let e = 0; e < 3; e++) {
      const a = v[e];
      const b = v[(e + 1) % 3];
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
    const [A, B, C] = v.map((i) => P(o, i));
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (n[0] * o.nor[v[0] * 3] + n[1] * o.nor[v[0] * 3 + 1] + n[2] * o.nor[v[0] * 3 + 2] <= 0) against++;
  }
  return { open: [...edges.values()].filter((c) => c !== 2).length, against };
}

test('a ball comes out the size it is, closed, facing out', () => {
  const m = new Melt({ cell: 0.02, blend: 0.03 });
  m.ball([0, 1, 0], [0.3, 0.3, 0.3], null, { color: [1, 0, 0] });
  const o = m.mesh();
  const { open, against } = check(o);
  assert.equal(open, 0, 'no holes');
  assert.equal(against, 0, 'every triangle faces out');
  for (let i = 0; i < o.pos.length / 3; i++) {
    const p = P(o, i);
    const r = Math.hypot(p[0], p[1] - 1, p[2]);
    assert.ok(Math.abs(r - 0.3) < 0.006, `on the ball (${r.toFixed(4)})`);
  }
  assert.ok(o.col.every((c, i) => Math.abs(c - [1, 0, 0][i % 3]) < 1e-6), 'its colour');
});

test('two shapes that touch are one body, filleted where they meet, darker in the crease', () => {
  const m = new Melt({ cell: 0.015, blend: 0.06 });
  m.ball([0, 0, 0], [0.2, 0.2, 0.2], null, { color: [1, 1, 1] });
  m.bone([0, 0, 0], [0.5, 0, 0], 0.07, 0.07, { color: [0, 0, 1], surf: 3 });
  const o = m.mesh();
  assert.equal(check(o).open, 0);
  // the fillet: where the bone leaves the ball, the surface stands out from
  // the bone further than the bone's own radius
  let widest = 0;
  let creased = 1;
  let open = 0;
  for (let i = 0; i < o.pos.length / 3; i++) {
    const [x, y, z] = P(o, i);
    if (x > 0.195 && x < 0.215) widest = Math.max(widest, Math.hypot(y, z));
    if (x > 0.17 && x < 0.21 && Math.hypot(y, z) < 0.12) creased = Math.min(creased, o.occ[i]);
    if (x > 0.45) open = Math.max(open, o.occ[i]);
  }
  assert.ok(widest > 0.08, `filleted (${widest.toFixed(3)} m out at the join)`);
  assert.ok(creased < open - 0.1, `the crease is darker (${creased.toFixed(2)} against ${open.toFixed(2)})`);
  // what each part is made of, and its colour, blended over the fillet
  const surfs = new Set(o.surf);
  assert.ok(surfs.has(0) && surfs.has(3));
});

test('a thin part is thin', () => {
  const m = new Melt({ cell: 0.01, blend: 0.01 });
  m.ball([0, 0, 0], [0.4, 0.4, 0.03], null, { color: [1, 1, 1] });
  const o = m.mesh();
  let face = 0;
  for (let i = 0; i < o.pos.length / 3; i++) if (Math.hypot(o.pos[i * 3], o.pos[i * 3 + 1]) < 0.2) face = Math.max(face, o.thin[i]);
  assert.ok(face < 0.12, `through the flat of it (${face.toFixed(3)} m)`);
});

test('a little at a time comes out the same as all at once', () => {
  const make = () => {
    const m = new Melt({ cell: 0.02, blend: 0.04 });
    const rings = [0, 1, 2, 3].map((i) => ({ c: [0, i * 0.2, 0], u: [1, 0, 0], w: [0, 0, 1], a: 0.12 - i * 0.02, b: 0.08, i }));
    m.rings(rings, { color: (i) => [i / 3, 0, 0], sides: 8 });
    m.ball([0.1, 0.3, 0], [0.08, 0.08, 0.08], null, { color: [0, 1, 0] });
    return m;
  };
  const once = make().mesh();
  const work = make().steps();
  let r = work.next();
  let yields = 0;
  while (!r.done) {
    yields++;
    r = work.next();
  }
  assert.ok(yields > 3, 'it stops along the way');
  assert.deepEqual(Array.from(r.value.pos), Array.from(once.pos));
  assert.deepEqual(Array.from(r.value.idx), Array.from(once.idx));
});
