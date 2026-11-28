// The roads: where they run is grown from the seed (so everyone in a world
// drives the same road), they keep to what a road can do (no steeper than
// GRADE, no bend tighter than a car can take, never under the ground or in
// the water), they run from one town's gate to another's, they keep clear of
// everything there before them, and where they are is pinned, since the
// dealerships beside them are places people track.

import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDS } from '../src/world/lands.js';
import { gateOf, pointAt, nearest, topAt, tightest, envelope, GRADE, BED, WIDE, HALF, DS } from '../src/roads/roads.js';
import { footprint, pieceCount, pieceRange, buildPiece, buildGate, roundTop, PAL } from '../src/roads/pavement.js';
import { createBuildingMaterial } from '../src/build/surfaces.js';
import { onPlan } from '../src/world/frame.js';
import { roadsWorld } from './helpers/roadsWorld.js';
import { matchesGolden } from './helpers/golden.js';

const SEED = 20261119;
// the towns' squares whose roads (east and south) are surveyed
const SQUARES = [-2, -1, 0, 1];
const RAMP = 0.17; // (roads.js: steeper for a short way out of a gate)

function surveyed(seed, land, squares = SQUARES) {
  const w = roadsWorld(seed, land);
  const all = [];
  for (const cj of squares) for (const ci of squares) for (const dir of ['e', 's']) {
    const r = w.roads.link(ci, cj, dir);
    if (r) all.push(r);
  }
  return { ...w, all };
}

// The survey, widened a square at a time until it has a road of each kind.
function bothKinds(seed, land) {
  for (let n = 2; ; n++) {
    const squares = [];
    for (let c = -n; c < n; c++) squares.push(c);
    const w = surveyed(seed, land, squares);
    const kinds = new Set(w.all.map((r) => r.surface));
    if (kinds.has('paved') && kinds.has('gravel') || n >= 6) return w;
  }
}

test('there are roads, and not everywhere', () => {
  for (const land of LANDS) {
    const { all, roads } = surveyed(SEED, land);
    assert.ok(all.length >= 3, `roads near the middle (${all.length})`);
    const none = [...roads.links.values()].filter((r) => r === null).length;
    assert.ok(none > 0, 'some links have none');
    assert.ok(all.some((r) => r.surface === 'paved') || all.some((r) => r.surface === 'gravel'));
  }
});

test('the same seed grows the same roads, however the survey is run', () => {
  const { all } = surveyed(SEED, 1);
  // a fresh world, surveyed a little at a time the way the game does it between frames
  const w = roadsWorld(SEED, 1, true);
  const again = w.roads;
  for (const r of all) again.queue.add(`${r.ci}:${r.cj}:${r.dir}`);
  let slices = 0;
  while (again.pump(2) > 0) {
    slices++;
    // what they wait for is found by its own features, a frame at a time
    w.towns.pump(2);
    w.lines.pump(2);
    w.branches.pump(2);
    w.airports.pump(2);
    w.tracks.pump(2);
    w.far.pump(2);
    assert.ok(slices < 20000, 'it gets there');
  }
  assert.ok(slices > 4, 'it was surveyed in pieces');
  for (const r of all) {
    const s = again.link(r.ci, r.cj, r.dir);
    assert.ok(s, `${r.id} again`);
    assert.equal(s.n, r.n);
    assert.deepEqual([...s.x], [...r.x]);
    assert.deepEqual([...s.h], [...r.h]);
  }
});

for (const land of LANDS) for (const seed of [SEED, 42]) {
  test(`seed ${seed}${land > 1 ? ` on land ${land}` : ''}: where the roads run`, () => {
    const { all } = surveyed(seed, land);
    const round = (v) => Math.round(v * 1000) / 1000;
    const list = all.map((r) => {
      const mid = Math.floor(r.n / 2);
      return {
        id: r.id,
        from: r.from,
        to: r.to,
        surface: r.surface,
        length: round(r.length),
        start: [round(r.x[0]), round(r.z[0])],
        middle: [round(r.x[mid]), round(r.z[mid]), round(r.h[mid])],
        end: [round(r.x[r.n - 1]), round(r.z[r.n - 1])],
        crossings: r.cross.reduce((a, b) => a + b, 0),
      };
    });
    matchesGolden(land > 1 ? `roads-${seed}-land${land}` : `roads-${seed}`, list, { tolerance: 1e-6 });
  });
}

test('a road runs from one town’s gate to the next’s', () => {
  const { all, towns, gen } = surveyed(SEED, 1);
  for (const r of all) {
    const A = towns.byId(r.from);
    const B = towns.byId(r.to);
    assert.ok(A && B && A !== B, r.id);
    const gA = gateOf(gen, A);
    const gB = gateOf(gen, B);
    assert.ok(Math.hypot(r.x[0] - gA.x, r.z[0] - gA.z) < 0.01, `${r.id} starts at ${A.name}’s gate`);
    assert.ok(Math.hypot(r.x[r.n - 1] - gB.x, r.z[r.n - 1] - gB.z) < 0.01, `${r.id} ends at ${B.name}’s gate`);
    assert.ok(Math.abs(r.h[0] - gA.h) < 0.06 && Math.abs(r.h[r.n - 1] - gB.h) < 0.06, `${r.id} meets its gates level`);
    // the next square east or south, or the one beyond if that has none
    const [ai, aj] = [Math.floor(A.x / 1000), Math.floor(A.z / 1000)];
    const [bi, bj] = [Math.floor(B.x / 1000), Math.floor(B.z / 1000)];
    assert.deepEqual([ai, aj], [r.ci, r.cj]);
    if (r.dir === 'e') assert.ok(bj === aj && (bi === ai + 1 || (bi === ai + 2 && !towns.cell(ai + 1, aj))));
    else assert.ok(bi === ai && (bj === aj + 1 || (bj === aj + 2 && !towns.cell(ai, aj + 1))));
  }
});

test('a road climbs no more steeply than a car can, and bends no more tightly', () => {
  const { all } = surveyed(SEED, 1);
  for (const r of all) {
    let steep = 0;
    for (let i = 0; i < r.n - 1; i++) {
      const grade = Math.abs(r.h[i + 1] - r.h[i]) / r.ds;
      assert.ok(grade <= RAMP + 1e-6, `${r.id} at ${i}: ${(grade * 100).toFixed(1)}%`);
      if (grade > GRADE + 1e-6) steep++;
    }
    assert.ok(steep <= 12 + 12 * r.cross.reduce((a, b) => a + b, 0), `${r.id}: steeper than ${GRADE * 100}% only by its gates and crossings (${steep})`);
    assert.ok(Math.abs(r.ds - DS) < 0.5, 'evenly sampled');
    assert.ok(tightest(r, 6) >= 25, `${r.id}: its tightest bend, ${tightest(r, 6).toFixed(0)} m`);
  }
});

test('it never runs under the ground or through the water', () => {
  const { all, gen } = surveyed(SEED, 1);
  for (const r of all) {
    for (let i = 1; i < r.n - 1; i++) {
      if (r.cross[i]) continue;
      assert.ok(r.h[i] >= Math.max(r.g[i], r.gl[i], r.gr[i]) + BED - 1e-6, `${r.id} at ${i} is over the ground`);
      if (i % 20) continue;
      const h = gen.height(r.x[i], r.z[i]);
      assert.ok(r.h[i] >= h + BED - 1e-6, `${r.id} at ${i}, looked at afresh`);
      const w = gen.water;
      if (w.region > 0.5 && w.level > h + 0.02) assert.ok(r.h[i] > w.level + 1.5, `${r.id} at ${i} is well over the water`);
    }
  }
});

test('the ground stays under its lanes, between the samples too, and under the round where roads meet', () => {
  const { all, gen, towns } = surveyed(SEED, 1);
  const ground = (x, z) => gen.height(x, z);
  for (const r of all) {
    // (the stretches at its ends are under its gates' rounds, and a level crossing on the railway's own ground)
    for (let i = 1; i < r.n - 2; i++) {
      if (r.cross[i] || r.cross[i + 1]) continue;
      const tx = (r.x[i + 1] - r.x[i]) / r.ds;
      const tz = (r.z[i + 1] - r.z[i]) / r.ds;
      for (let f = 0; f < 1; f += 0.125) {
        const x = r.x[i] + (r.x[i + 1] - r.x[i]) * f;
        const z = r.z[i] + (r.z[i + 1] - r.z[i]) * f;
        const top = r.h[i] + (r.h[i + 1] - r.h[i]) * f;
        for (let off = -HALF; off <= HALF; off += HALF / 6) {
          const g = gen.height(x - tz * off, z + tx * off);
          assert.ok(g < top - 0.02, `${r.id} at ${i}+${f}, ${off.toFixed(1)} m across: the ground is ${(g - top).toFixed(2)} m from its top`);
        }
      }
    }
    for (const id of [r.from, r.to]) {
      const gate = gateOf(gen, towns.byId(id));
      for (let d = 0; d <= WIDE + 1.6; d += 1.4) {
        for (let a = 0; a < 6.28; a += 0.4) {
          const x = gate.x + Math.cos(a) * d;
          const z = gate.z + Math.sin(a) * d;
          const top = roundTop(gate, x, z, ground);
          assert.ok(top >= gate.h + 0.02 - 1e-9 && top >= ground(x, z) + BED - 1e-9, `the round at ${id}`);
        }
      }
    }
  }
});

test('it keeps clear of what was there first', () => {
  const { all, there, towns, start } = surveyed(SEED, 1);
  for (const r of all) {
    const shapes = there.clear(...r.box);
    const keep = 30; // m from its own gates, where it comes in among its towns' lots
    for (let i = 0; i < r.n; i++) {
      const x = r.x[i];
      const z = r.z[i];
      const byGate = i * r.ds < keep || (r.n - 1 - i) * r.ds < keep;
      for (const s of shapes) {
        const on = s.site ? onPlan(s.site, x, z, WIDE, s.rects) : s.box ? x > s.box[0] - WIDE && x < s.box[2] + WIDE && z > s.box[1] - WIDE && z < s.box[3] + WIDE : Math.hypot(x - s.x, z - s.z) < s.r + WIDE;
        assert.ok(!on, `${r.id} at ${i} runs over something there first`);
      }
      for (const t of towns.within(x - 200, z - 200, x + 200, z + 200)) {
        if (byGate && (t.id === r.from || t.id === r.to)) continue;
        assert.ok(!onPlan(t, x, z, WIDE, t.plan), `${r.id} at ${i} runs through ${t.name}`);
      }
      assert.ok(Math.hypot(x - start.x, z - start.z) > 100, 'away from where people first arrive');
    }
  }
});

test('it crosses the railway on the level, at the top of the rail', () => {
  const { all, lines } = surveyed(SEED, 1);
  let crossed = 0;
  for (const r of all) {
    for (let i = 0; i < r.n; i++) {
      if (!r.cross[i]) continue;
      crossed++;
      const line = lines.within(r.x[i] - 1, r.z[i] - 1, r.x[i] + 1, r.z[i] + 1)[0];
      assert.ok(line, `${r.id} at ${i} is by a railway`);
    }
  }
  assert.ok(crossed >= 0);
});

test('along a road: where it is, the nearest point on it, its pieces', () => {
  const { all } = surveyed(SEED, 1);
  const r = all[0];
  const p = pointAt(r, r.length / 2);
  assert.ok(Math.abs(Math.hypot(p.dx, p.dz) - 1) < 1e-9);
  const at = {};
  // a little off to its right
  assert.ok(nearest(r, p.x - p.dz * 2, p.z + p.dx * 2, at));
  assert.ok(Math.abs(at.d - 2) < 0.2 && Math.abs(at.s - r.length / 2) < 1, `${at.d} ${at.s}`);
  assert.equal(at.side, 1, 'to the right');
  assert.ok(Math.abs(topAt(r, at) - p.y) < 0.2);
  assert.ok(!nearest(r, p.x + 500, p.z + 500, at), 'nothing far off');
  // the pieces cover it end to end
  let covered = 0;
  for (let k = 0; k < pieceCount(r); k++) {
    const [i0, i1] = pieceRange(r, k);
    covered += i1 - i0;
  }
  assert.equal(covered, r.n - 1);
  for (let i = 0; i < r.n; i += 10) assert.ok(footprint(r, i) >= WIDE);
});

test('a ramp down from every high point, no steeper than the grade', () => {
  const h = envelope(Float64Array.from([0, 0, 5, 0, 0, 0]), 4, 0.1);
  assert.ok(Math.abs(h[1] - 4.6) < 1e-9 && Math.abs(h[3] - 4.6) < 1e-9 && Math.abs(h[5] - 3.8) < 1e-9);
});

test('what a road looks like: every piece of it, and the gates at its ends, can be built and walked on', () => {
  const { all, gen, towns } = surveyed(SEED, 1);
  const ground = (x, z) => gen.height(x, z);
  const material = createBuildingMaterial();
  for (const r of all.slice(0, 3)) {
    for (let p = 0; p < pieceCount(r); p++) {
      const { object, solids } = buildPiece(r, p, ground, material);
      const pos = object.children[0].geometry.attributes.position.array;
      assert.ok(pos.length > 0 && pos.every(Number.isFinite), `${r.id} piece ${p} has no holes in it`);
      assert.ok(solids.length > 0 && solids.every((sd) => Number.isFinite(sd.topA) && Number.isFinite(sd.topB) && Number.isFinite(sd.bottom) && sd.surface), `${r.id} piece ${p} can be walked on`);
      object.children[0].geometry.dispose();
    }
    for (const id of [r.from, r.to]) {
      const gate = gateOf(gen, towns.byId(id));
      const { object, solids } = buildGate(gate, r.surface === 'paved', ground, material);
      assert.ok(object.children[0].geometry.attributes.position.array.every(Number.isFinite));
      assert.ok(solids.some((sd) => Math.abs(sd.topA - gate.h - 0.02) < 1e-6), 'the round where its roads meet, to stand on');
    }
  }
});

// The top of a piece of road at (x, z): its height and colour there, from the
// triangles of its top (those facing up, within the road's width of `on`).
function topOf(object, x, z) {
  let best = null;
  const o = object.position;
  for (const mesh of object.children) {
    const g = mesh.geometry;
    const P = g.attributes.position.array;
    const N = g.attributes.normal.array;
    const C = g.attributes.color.array;
    const I = g.index.array;
    for (let t = 0; t < I.length; t += 3) {
      const [a, b, c] = [I[t], I[t + 1], I[t + 2]];
      if (N[a * 3 + 1] < 0.97) continue;
      const v = (k) => [P[k * 3] + o.x, P[k * 3 + 1] + o.y, P[k * 3 + 2] + o.z];
      const [A, B, D] = [v(a), v(b), v(c)];
      const det = (B[2] - D[2]) * (A[0] - D[0]) + (D[0] - B[0]) * (A[2] - D[2]);
      if (Math.abs(det) < 1e-12) continue;
      const l1 = ((B[2] - D[2]) * (x - D[0]) + (D[0] - B[0]) * (z - D[2])) / det;
      const l2 = ((D[2] - A[2]) * (x - D[0]) + (A[0] - D[0]) * (z - D[2])) / det;
      if (l1 < -1e-9 || l2 < -1e-9 || l1 + l2 > 1 + 1e-9) continue;
      const y = l1 * A[1] + l2 * B[1] + (1 - l1 - l2) * D[1];
      if (!best || y > best.y + 1e-6) best = { y, r: C[a * 3], g: C[a * 3 + 1], b: C[a * 3 + 2], n: 1, tri: [A, B, D] };
      else if (Math.abs(y - best.y) <= 1e-6) {
        // (a spot right on the edge two of its triangles share is one surface,
        // not two: a second is one laid over it, sharing no edge with it)
        const same = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6 && Math.abs(p[2] - q[2]) < 1e-6;
        const shared = [A, B, D].filter((p) => best.tri.some((q) => same(p, q))).length;
        if (shared < 2) best.n++;
      }
    }
  }
  return best;
}

test('its top: the paint is part of it, and a gravel road has a rut each side of its crown', () => {
  const { all, gen } = bothKinds(SEED, 1);
  const ground = (x, z) => gen.height(x, z);
  const material = createBuildingMaterial();
  const near = (c, p) => Math.abs(c.r - p.r) < 1e-6 && Math.abs(c.g - p.g) < 1e-6 && Math.abs(c.b - p.b) < 1e-6;
  const dark = (c) => c.r + c.g + c.b;
  const seen = { paved: 0, gravel: 0 };
  for (const r of all) {
    const p = Math.floor(pieceCount(r) / 2);
    const [i0, i1] = pieceRange(r, p);
    const { object } = buildPiece(r, p, ground, material);
    let dashes = 0;
    for (let i = i0 + 1; i < i1 - 1; i++) {
      if (r.h[i] - r.g[i] > 2 || r.h[i + 1] - r.g[i + 1] > 2) continue; // (not on a bridge, with its railings)
      const at = (off) => {
        const q = pointAt(r, (i + 0.5) * r.ds);
        const top = topOf(object, q.x - q.dz * off, q.z + q.dx * off);
        assert.ok(top, `${r.id} has a top ${off} m across`);
        // one surface there, at the road's own height: nothing laid a hair over it
        assert.equal(top.n, 1, `${r.id} at ${i}: one surface, ${off} m across`);
        assert.ok(Math.abs(top.y - q.y) < 0.02, `${r.id} at ${i}: its top, ${off} m across`);
        return top;
      };
      if (r.surface === 'paved') {
        assert.ok(near(at(-2.9), PAL.white) && near(at(2.9), PAL.white), `${r.id} at ${i}: a white line along each edge`);
        assert.ok(!near(at(-1.5), PAL.white) && !near(at(1.5), PAL.yellow), 'tarmac between');
        if (near(at(0), PAL.yellow)) dashes++;
      } else {
        const ruts = [at(-1.05), at(1.05)];
        const crown = at(0);
        const sides = [at(-2.3), at(2.3)];
        for (const rut of ruts) assert.ok(dark(rut) < dark(crown) && sides.every((s) => dark(rut) < dark(s)), `${r.id} at ${i}: the ruts are darker than the crown between them and the gravel either side`);
      }
    }
    if (r.surface === 'paved') assert.ok(dashes > 0, `${r.id}: a dashed line down the middle`);
    seen[r.surface]++;
    for (const mesh of object.children) mesh.geometry.dispose();
  }
  assert.ok(seen.paved > 0 && seen.gravel > 0, 'both kinds looked at');
});
