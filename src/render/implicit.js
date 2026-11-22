// Shapes melted into one: a body made of balls, bones and skins over spines,
// run together the way clay is when it's worked, into one surface with no
// seams, a muscle swelling smoothly out of the next. Then a mesh of that
// surface, as fine as it's asked for.
//
//   const m = new Melt({ cell: 0.02, blend: 0.05 });
//   m.ball([0, 1, 0], [0.2, 0.25, 0.15], null, { color, surf: 0 });
//   m.bone([0, 1, 0], [0, 0.5, 0.1], 0.08, 0.05, { color });
//   m.rings(rings, { color: (i, k) => colour, sides: 8 });
//   const out = m.mesh();  // { pos, nor, col, hot, tag, surf, occ, thin, idx }
//
// Each shape is a signed distance: how far a point is outside it (inside,
// negative). The body is all of them together, each joined to what it
// touches with a fillet `blend` m wide (a smooth minimum) rather than a
// crease. That distance is worked out at the corners of a grid `cell` m
// apart, near each shape, and the surface is found between them (surface
// nets: a vertex in each cell the surface passes through, at the middle of
// where it crosses the cell's edges, and a square between the four cells
// round every edge it crosses).
//
// Then for each vertex, from the shapes near it: which way it faces (how the
// distance changes there), what colour it is and what it's made of (the
// nearest shapes', blended across the fillet), how open it is to the light
// round it (how much nearer than it should be the surface is, a little way
// out along the normal: a crease, the inside of an elbow), and how thick it
// is through there (how deep inside it gets, a little way in), for the light
// that comes through a thin part (render/skin.js).
//
// Plain numbers in, plain arrays out: nothing here knows about three.js.

const BIG = 1e9;
const MOST = 6.0e6; // grid corners, at the most: past that the cells are made bigger

// A bucket's number, from its place (within a thousand buckets of the middle).
const bucketKey = (i, j, k) => ((i + 1024) * 2048 + (j + 1024)) * 2048 + (k + 1024);

// Polynomial smooth minimum: a fillet k wide where a and b meet.
function smin(a, b, k) {
  if (a >= BIG) return b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// ── The shapes ─────────────────────────────────────────────────────────────
// Each: { lo, hi } (its bounds), d(x, y, z) its signed distance, and what it
// is: color (or colorAt(x, y, z, out)), hot, tag, surf.

// A ball, squashed to radii r = [rx, ry, rz] along axes (unit columns
// [ux, uy, uz, vx, vy, vz, wx, wy, wz], or null for x, y, z). The distance is
// Quilez's close bound, good near the surface, which is where it's needed.
function ellipsoid(c, r, axes) {
  const [cx, cy, cz] = c;
  const [rx, ry, rz] = r;
  const A = axes || [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const ext = (i) => Math.abs(A[i]) * rx + Math.abs(A[3 + i]) * ry + Math.abs(A[6 + i]) * rz;
  const e = [ext(0), ext(1), ext(2)];
  const least = Math.min(rx, ry, rz);
  return {
    area: ((4 * Math.PI) / 3) * (rx * ry + ry * rz + rx * rz),
    lo: [cx - e[0], cy - e[1], cz - e[2]],
    hi: [cx + e[0], cy + e[1], cz + e[2]],
    d(x, y, z) {
      const px = x - cx;
      const py = y - cy;
      const pz = z - cz;
      const a = (px * A[0] + py * A[1] + pz * A[2]) / rx;
      const b = (px * A[3] + py * A[4] + pz * A[5]) / ry;
      const g = (px * A[6] + py * A[7] + pz * A[8]) / rz;
      const k0 = Math.sqrt(a * a + b * b + g * g);
      const k1 = Math.sqrt((a * a) / (rx * rx) + (b * b) / (ry * ry) + (g * g) / (rz * rz));
      if (k1 < 1e-12) return -least;
      return (k0 * (k0 - 1)) / k1;
    },
  };
}

// A bone: a cone with a ball at either end, ra at a and rb at b (Quilez's
// round cone: exact).
function roundCone(a, b, ra, rb) {
  const [ax, ay, az] = a;
  const bax = b[0] - ax;
  const bay = b[1] - ay;
  const baz = b[2] - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const lo = [Math.min(ax - ra, b[0] - rb), Math.min(ay - ra, b[1] - rb), Math.min(az - ra, b[2] - rb)];
  const hi = [Math.max(ax + ra, b[0] + rb), Math.max(ay + ra, b[1] + rb), Math.max(az + ra, b[2] + rb)];
  const area = Math.PI * (ra + rb) * Math.sqrt(l2) + 2 * Math.PI * (ra * ra + rb * rb);
  // (one end swallows the other: it's only a ball)
  if (a2 <= 1e-12) {
    const [c, r] = ra >= rb ? [a, ra] : [b, rb];
    return { lo, hi, area, d: (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r };
  }
  const il2 = 1 / l2;
  return {
    area,
    lo,
    hi,
    d(x, y, z) {
      const pax = x - ax;
      const pay = y - ay;
      const paz = z - az;
      const yy = pax * bax + pay * bay + paz * baz;
      const zz = yy - l2;
      const xvx = pax * l2 - bax * yy;
      const xvy = pay * l2 - bay * yy;
      const xvz = paz * l2 - baz * yy;
      const x2 = xvx * xvx + xvy * xvy + xvz * xvz;
      const y2 = yy * yy * l2;
      const z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - ra;
    },
  };
}

// A skin over a spine: rings [{ c, u, w, a, b, i }] (a ring's middle, its
// across and deep directions, and how far it reaches each way; i, which
// point of the spine it was made at), each run into the next. Between two
// rings, a point is measured from the ring that far along, as if from a
// ball as wide and deep as it, and as long as it is narrow: so the ends are
// rounded, and between rings it is the ring's own outline.
function ringChain(rings) {
  const n = rings.length;
  const lo = [BIG, BIG, BIG];
  const hi = [-BIG, -BIG, -BIG];
  for (const r of rings) {
    const e = Math.max(r.a, r.b);
    for (let j = 0; j < 3; j++) {
      lo[j] = Math.min(lo[j], r.c[j] - e);
      hi[j] = Math.max(hi[j], r.c[j] + e);
    }
  }
  const segs = [];
  for (let s = 0; s < n - 1; s++) {
    const p = rings[s];
    const q = rings[s + 1];
    const ax = q.c[0] - p.c[0];
    const ay = q.c[1] - p.c[1];
    const az = q.c[2] - p.c[2];
    const l2 = ax * ax + ay * ay + az * az;
    const e = Math.max(p.a, p.b, q.a, q.b);
    segs.push({
      p,
      q,
      ax,
      ay,
      az,
      l2: Math.max(l2, 1e-12),
      lo: [Math.min(p.c[0], q.c[0]) - e, Math.min(p.c[1], q.c[1]) - e, Math.min(p.c[2], q.c[2]) - e],
      hi: [Math.max(p.c[0], q.c[0]) + e, Math.max(p.c[1], q.c[1]) + e, Math.max(p.c[2], q.c[2]) + e],
    });
  }
  // how far past a segment's own bounds it is still worth measuring from
  // (the fillets reach that far): set when meshing
  let area = 0;
  for (const g of segs) area += Math.PI * (g.p.a + g.p.b + g.q.a + g.q.b) * 0.5 * Math.sqrt(g.l2);
  const chain = { lo, hi, area, pad: BIG, parts: segs };
  // each stretch's numbers in one flat array, for speed: where it starts,
  // which way and how long, its ring at either end (across, deep, how far)
  const S = 26;
  const N = new Float64Array(segs.length * S);
  segs.forEach((g, n) => {
    const { p, q } = g;
    N.set([p.c[0], p.c[1], p.c[2], g.ax, g.ay, g.az, 1 / g.l2, p.u[0], p.u[1], p.u[2], q.u[0] - p.u[0], q.u[1] - p.u[1], q.u[2] - p.u[2], p.w[0], p.w[1], p.w[2], q.w[0] - p.w[0], q.w[1] - p.w[1], q.w[2] - p.w[2], p.a, q.a - p.a, p.b, q.b - p.b], n * S);
    N.set([g.lo[0], g.lo[1], g.lo[2]], n * S + 23);
  });
  const H = new Float64Array(segs.length * 3);
  segs.forEach((g, n) => H.set(g.hi, n * 3));
  // the point of the chain nearest (x, y, z), filled in by near()
  const hit = { s: 0, t: 0, x: 0, y: 0, d: BIG };
  const near = (x, y, z) => {
    let best = BIG;
    const pad = chain.pad;
    for (let s = 0, o = 0; s < segs.length; s++, o += S) {
      if (x < N[o + 23] - pad || y < N[o + 24] - pad || z < N[o + 25] - pad || x > H[s * 3] + pad || y > H[s * 3 + 1] + pad || z > H[s * 3 + 2] + pad) continue;
      const px = x - N[o];
      const py = y - N[o + 1];
      const pz = z - N[o + 2];
      let t = (px * N[o + 3] + py * N[o + 4] + pz * N[o + 5]) * N[o + 6];
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = px - N[o + 3] * t;
      const dy = py - N[o + 4] * t;
      const dz = pz - N[o + 5] * t;
      // the ring there: across and deep, and how far it reaches each way
      let ux = N[o + 7] + N[o + 10] * t;
      let uy = N[o + 8] + N[o + 11] * t;
      let uz = N[o + 9] + N[o + 12] * t;
      let wx = N[o + 13] + N[o + 16] * t;
      let wy = N[o + 14] + N[o + 17] * t;
      let wz = N[o + 15] + N[o + 18] * t;
      const iu = 1 / Math.sqrt(ux * ux + uy * uy + uz * uz || 1);
      const iw = 1 / Math.sqrt(wx * wx + wy * wy + wz * wz || 1);
      const ra = Math.max(1e-5, N[o + 19] + N[o + 20] * t);
      const rb = Math.max(1e-5, N[o + 21] + N[o + 22] * t);
      const rl = ra < rb ? ra : rb;
      const u = (dx * ux + dy * uy + dz * uz) * iu;
      const w = (dx * wx + dy * wy + dz * wz) * iw;
      // along: what's left over once across and deep are taken out
      const l2 = Math.max(0, dx * dx + dy * dy + dz * dz - u * u - w * w);
      const a = u / ra;
      const b = w / rb;
      const rl2 = rl * rl;
      const k0 = Math.sqrt(a * a + b * b + l2 / rl2);
      const k1 = Math.sqrt((a * a) / (ra * ra) + (b * b) / (rb * rb) + l2 / (rl2 * rl2));
      const d = k1 < 1e-12 ? -rl : (k0 * (k0 - 1)) / k1;
      if (d < best) {
        best = d;
        hit.s = s;
        hit.t = t;
        hit.x = a;
        hit.y = b;
      }
    }
    hit.d = best;
    return best;
  };
  return Object.assign(chain, { d: near, near, hit, rings });
}

// A box, half-extents h along axes (as for ellipsoid), its edges rounded by r.
function roundBox(c, h, axes, r) {
  const A = axes || [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const ext = (i) => Math.abs(A[i]) * h[0] + Math.abs(A[3 + i]) * h[1] + Math.abs(A[6 + i]) * h[2];
  const e = [ext(0), ext(1), ext(2)];
  return {
    area: 8 * (h[0] * h[1] + h[1] * h[2] + h[0] * h[2]),
    lo: [c[0] - e[0], c[1] - e[1], c[2] - e[2]],
    hi: [c[0] + e[0], c[1] + e[1], c[2] + e[2]],
    d(x, y, z) {
      const px = x - c[0];
      const py = y - c[1];
      const pz = z - c[2];
      const qx = Math.abs(px * A[0] + py * A[1] + pz * A[2]) - h[0] + r;
      const qy = Math.abs(px * A[3] + py * A[4] + pz * A[5]) - h[1] + r;
      const qz = Math.abs(px * A[6] + py * A[7] + pz * A[8]) - h[2] + r;
      const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
      return out + Math.min(Math.max(qx, qy, qz), 0) - r;
    },
  };
}

// ── Melting them ───────────────────────────────────────────────────────────
// look: { color: [r, g, b] | (i, k) -> [r, g, b] (a chain's: its spine's
// point and how far round, of `sides`), hot, tag, surf, sides, blend }.
// `blend` is that shape's own fillet, if it wants one narrower or wider
// than the body's (a horn sharply set into a skull).
//
// `cell` is the finest it is meshed; it is meshed coarser if that would make
// more than about `budget` triangles of it (by the area of its shapes).
export class Melt {
  constructor({ cell = 0.02, blend = 0.04, budget = 60000 } = {}) {
    this.cell = cell;
    this.blend = blend;
    this.budget = budget;
    this.prims = [];
  }

  get empty() {
    return this.prims.length === 0;
  }

  _add(prim, look) {
    prim.color = look.color || [0.5, 0.5, 0.5];
    prim.hot = look.hot || 0;
    prim.tag = look.tag || 0;
    prim.surf = look.surf || 0;
    prim.k = look.blend ?? this.blend;
    prim.sides = look.sides || 8;
    this.prims.push(prim);
    return prim;
  }

  ball(c, r, axes, look) {
    return this._add(ellipsoid(c, r, axes), look);
  }

  bone(a, b, ra, rb, look) {
    return this._add(roundCone(a, b, ra, rb), look);
  }

  rings(rings, look) {
    return this._add(ringChain(rings), look);
  }

  box(c, half, axes, round, look) {
    return this._add(roundBox(c, half, axes, round), look);
  }

  // ── The distance, anywhere ───────────────────────────────────────────────
  // The shapes are put in buckets (BUCKET cells a side) by their bounds, so a
  // point is measured only from those that might be near it.
  _index() {
    const B = this.cell * 8;
    const pad = this.blend * 2 + this.cell * 2;
    this._B = B;
    const buckets = new Map();
    this.prims.forEach((p, n) => {
      const i0 = Math.floor((p.lo[0] - pad) / B);
      const j0 = Math.floor((p.lo[1] - pad) / B);
      const k0 = Math.floor((p.lo[2] - pad) / B);
      const i1 = Math.floor((p.hi[0] + pad) / B);
      const j1 = Math.floor((p.hi[1] + pad) / B);
      const k1 = Math.floor((p.hi[2] + pad) / B);
      for (let k = k0; k <= k1; k++)
        for (let j = j0; j <= j1; j++)
          for (let i = i0; i <= i1; i++) {
            const key = bucketKey(i, j, k);
            let b = buckets.get(key);
            if (!b) buckets.set(key, (b = []));
            b.push(n);
          }
    });
    this._buckets = buckets;
  }

  _near(x, y, z) {
    const B = this._B;
    return this._buckets.get(bucketKey(Math.floor(x / B), Math.floor(y / B), Math.floor(z / B)));
  }

  // The body's signed distance at (x, y, z).
  field(x, y, z) {
    const list = this._near(x, y, z);
    if (!list) return BIG;
    let d = BIG;
    for (const n of list) {
      const p = this.prims[n];
      d = smin(d, p.d(x, y, z), p.k);
    }
    return d;
  }

  // ── The mesh ─────────────────────────────────────────────────────────────
  // The mesh, all at once.
  mesh() {
    const work = this.steps();
    let r = work.next();
    while (!r.done) r = work.next();
    return r.value;
  }

  // The same, a little at a time: a generator that stops every so often
  // (it yields), so that a frame's few milliseconds can be spent on it and
  // the rest left for the next. What it returns at the end is the mesh.
  //   const work = melt.steps();
  //   let r; do r = work.next(); while (!r.done && performance.now() < until);
  *steps() {
    const prims = this.prims;
    if (!prims.length) return null;
    // as fine as it may be, and no finer than the budget allows (shapes
    // overlap, so their areas add up to more than the body's)
    let area = 0;
    for (const p of prims) area += p.area || 0;
    this.cell = Math.max(this.cell, Math.sqrt((area * 0.55 * 2) / this.budget));
    for (const p of prims) if (p.parts) p.pad = p.k + this.cell * 2;
    this._index();
    // the grid: over everything, with room for the fillets and a cell more
    const pad = this.blend + this.cell * 2;
    const lo = [BIG, BIG, BIG];
    const hi = [-BIG, -BIG, -BIG];
    for (const p of prims) {
      for (let j = 0; j < 3; j++) {
        lo[j] = Math.min(lo[j], p.lo[j] - pad);
        hi[j] = Math.max(hi[j], p.hi[j] + pad);
      }
    }
    let h = this.cell;
    const count = (h) => (Math.ceil((hi[0] - lo[0]) / h) + 1) * (Math.ceil((hi[1] - lo[1]) / h) + 1) * (Math.ceil((hi[2] - lo[2]) / h) + 1);
    while (count(h) > MOST) h *= 1.15;
    this.used = h;
    const nx = Math.ceil((hi[0] - lo[0]) / h) + 1;
    const ny = Math.ceil((hi[1] - lo[1]) / h) + 1;
    const nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
    const sxy = nx * ny;
    yield;
    const F = new Float32Array(nx * ny * nz).fill(BIG);
    // which shape last measured each corner, so that one measured from two
    // stretches of the same spine is counted once
    const seen = new Int32Array(nx * ny * nz);
    // each shape, at the corners round it (a spine's, round each stretch of it)
    for (let id = 0; id < prims.length; id++) {
      const p = prims[id];
      yield;
      const reach = p.k + h;
      for (const b of p.parts || [p]) {
        const i0 = Math.max(0, Math.floor((b.lo[0] - reach - lo[0]) / h));
        const j0 = Math.max(0, Math.floor((b.lo[1] - reach - lo[1]) / h));
        const k0 = Math.max(0, Math.floor((b.lo[2] - reach - lo[2]) / h));
        const i1 = Math.min(nx - 1, Math.ceil((b.hi[0] + reach - lo[0]) / h));
        const j1 = Math.min(ny - 1, Math.ceil((b.hi[1] + reach - lo[1]) / h));
        const k1 = Math.min(nz - 1, Math.ceil((b.hi[2] + reach - lo[2]) / h));
        for (let k = k0; k <= k1; k++) {
          if ((k - k0) % 4 === 3) yield;
          const z = lo[2] + k * h;
          for (let j = j0; j <= j1; j++) {
            const y = lo[1] + j * h;
            let at = i0 + j * nx + k * sxy;
            for (let i = i0; i <= i1; i++, at++) {
              if (seen[at] === id + 1) continue;
              seen[at] = id + 1;
              const d = p.d(lo[0] + i * h, y, z);
              // (far outside its own fillet it changes nothing: skip the sum)
              if (d >= BIG || (d > reach && F[at] < BIG)) continue;
              F[at] = smin(F[at], d, p.k);
            }
          }
        }
      }
    }

    // a vertex in each cell the surface goes through
    const cells = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
    const cxy = (nx - 1) * (ny - 1);
    const pos = [];
    const E = [
      [0, 1], [2, 3], [4, 5], [6, 7],
      [0, 2], [1, 3], [4, 6], [5, 7],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    const corner = new Float32Array(8);
    const across = h * 1.75; // a cell's diagonal: a corner further than this from the surface has none in its cell
    for (let k = 0; k < nz - 1; k++) {
      if (k % 8 === 0) yield;
      for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
          const f0 = F[i + j * nx + k * sxy];
          if (f0 > across || f0 < -across) continue;
          let inside = 0;
          for (let c = 0; c < 8; c++) {
            const v = F[i + (c & 1) + (j + ((c >> 1) & 1)) * nx + (k + ((c >> 2) & 1)) * sxy];
            corner[c] = v;
            if (v < 0) inside++;
          }
          if (inside === 0 || inside === 8) continue;
          let sx = 0;
          let sy = 0;
          let sz = 0;
          let m = 0;
          for (const [a, b] of E) {
            const va = corner[a];
            const vb = corner[b];
            if (va < 0 === vb < 0) continue;
            const t = va / (va - vb);
            sx += (a & 1) + (((b & 1) - (a & 1)) * t);
            sy += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t);
            sz += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * t);
            m++;
          }
          cells[i + j * (nx - 1) + k * cxy] = pos.length / 3;
          pos.push(lo[0] + (i + sx / m) * h, lo[1] + (j + sy / m) * h, lo[2] + (k + sz / m) * h);
        }
      }
    }

    // a square (two triangles) between the four cells round each edge the
    // surface crosses, facing out
    const idx = [];
    const cell = (i, j, k) => cells[i + j * (nx - 1) + k * cxy];
    const quad = (a, b, c, d, flip) => {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      // (cut along the shorter diagonal: no long slivers)
      const dac = (pos[a * 3] - pos[c * 3]) ** 2 + (pos[a * 3 + 1] - pos[c * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[c * 3 + 2]) ** 2;
      const dbd = (pos[b * 3] - pos[d * 3]) ** 2 + (pos[b * 3 + 1] - pos[d * 3 + 1]) ** 2 + (pos[b * 3 + 2] - pos[d * 3 + 2]) ** 2;
      if (flip) [b, d] = [d, b];
      if (dac <= dbd) idx.push(a, b, c, a, c, d);
      else idx.push(a, b, d, b, c, d);
    };
    for (let k = 1; k < nz - 1; k++) {
      if (k % 8 === 0) yield;
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const here = F[i + j * nx + k * sxy] < 0;
          // along x
          if (i < nx - 1 && here !== F[i + 1 + j * nx + k * sxy] < 0) quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), !here);
          // along y
          if (j < ny - 1 && here !== F[i + (j + 1) * nx + k * sxy] < 0) quad(cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1), !here);
          // along z
          if (k < nz - 1 && here !== F[i + j * nx + (k + 1) * sxy] < 0) quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), !here);
        }
      }
    }

    yield;
    // what each vertex is, from the shapes near it
    const n = pos.length / 3;
    const nor = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const hot = new Float32Array(n);
    const tag = new Float32Array(n);
    const surf = new Float32Array(n);
    const occ = new Float32Array(n);
    const thin = new Float32Array(n);
    const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    const AO = size * 0.012; // m: the occlusion's first step out
    const IN = Math.max(h * 0.5, size * 0.004); // and the thickness's first step in
    const rgb = [0, 0, 0];
    for (let v = 0; v < n; v++) {
      if (v % 128 === 0) yield;
      const x = pos[v * 3];
      const y = pos[v * 3 + 1];
      const z = pos[v * 3 + 2];
      // which way it faces: how the distance on the grid changes there
      const fi = (x - lo[0]) / h;
      const fj = (y - lo[1]) / h;
      const fk = (z - lo[2]) / h;
      const i0 = Math.min(nx - 3, Math.max(1, Math.floor(fi)));
      const j0 = Math.min(ny - 3, Math.max(1, Math.floor(fj)));
      const k0 = Math.min(nz - 3, Math.max(1, Math.floor(fk)));
      const tx = fi - i0;
      const ty = fj - j0;
      const tz = fk - k0;
      let gx = 0;
      let gy = 0;
      let gz = 0;
      for (let c = 0; c < 8; c++) {
        const ci = i0 + (c & 1);
        const cj = j0 + ((c >> 1) & 1);
        const ck = k0 + ((c >> 2) & 1);
        const w = ((c & 1) ? tx : 1 - tx) * (((c >> 1) & 1) ? ty : 1 - ty) * (((c >> 2) & 1) ? tz : 1 - tz);
        const at = ci + cj * nx + ck * sxy;
        // (a corner nobody measured is far outside: as far as its neighbour, and a cell more)
        const f = (q) => (F[q] >= BIG ? F[at] + h : F[q]);
        gx += (f(at + 1) - f(at - 1)) * w;
        gy += (f(at + nx) - f(at - nx)) * w;
        gz += (f(at + sxy) - f(at - sxy)) * w;
      }
      const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
      gx /= gl;
      gy /= gl;
      gz /= gl;
      nor[v * 3] = gx;
      nor[v * 3 + 1] = gy;
      nor[v * 3 + 2] = gz;
      // colour and the rest: the nearest shapes', blended over their fillets
      const list = this._near(x, y, z) || [];
      let wsum = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let ht = 0;
      let best = BIG;
      let bestP = null;
      const ds = [];
      for (const q of list) {
        const d = prims[q].d(x, y, z);
        ds.push(d);
        if (d < best) {
          best = d;
          bestP = prims[q];
        }
      }
      for (let q = 0; q < list.length; q++) {
        const p = prims[list[q]];
        const w = Math.exp(-(ds[q] - best) / (Math.max(p.k, h) * 0.35));
        if (w < 1e-3) continue;
        const c = colorOf(p, x, y, z, rgb);
        r += c[0] * w;
        g += c[1] * w;
        b += c[2] * w;
        ht += p.hot * w;
        wsum += w;
      }
      if (wsum > 0) {
        col[v * 3] = r / wsum;
        col[v * 3 + 1] = g / wsum;
        col[v * 3 + 2] = b / wsum;
        hot[v] = ht / wsum;
      }
      if (bestP) {
        tag[v] = bestP.tag;
        surf[v] = bestP.surf;
      }
      // how open: out along the normal, the surface should be as far off as
      // the step; where it is nearer, something is over this spot
      let shut = 0;
      let wt = 0;
      for (let s = 1; s <= 4; s++) {
        const step = AO * s * 1.25;
        const d = this.field(x + gx * step, y + gy * step, z + gz * step);
        const k = 1 / s;
        shut += Math.max(0, Math.min(1, (step - Math.min(d, step)) / step)) * k;
        wt += k;
      }
      occ[v] = Math.max(0.05, 1 - (shut / wt) * 1.6);
      // how thick: the deepest it gets, a little way in (twice that, through)
      let deep = 0;
      for (let s = 0; s < 5; s++) {
        const step = IN * 2 ** s;
        const d = -this.field(x - gx * step, y - gy * step, z - gz * step);
        if (d > deep) deep = d;
        if (d < step * 0.1 && s > 1) break;
      }
      thin[v] = Math.max(h * 0.5, deep * 2);
    }
    return { pos: Float32Array.from(pos), nor, col, hot, tag, surf, occ, thin, idx: n > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx), cell: h };
  }
}

// The colour of shape p at (x, y, z): its own, or, for a chain coloured
// point by point and round, the colour of the ring and side nearest.
function colorOf(p, x, y, z, out) {
  const c = p.color;
  if (typeof c !== 'function') return c;
  if (!p.near) return c(0, 0);
  p.near(x, y, z);
  const h = p.hit;
  const ring = p.rings[Math.min(p.rings.length - 1, h.s + (h.t > 0.5 ? 1 : 0))];
  const ang = Math.atan2(h.y, h.x);
  const k = (((Math.round((ang / (Math.PI * 2)) * p.sides) % p.sides) + p.sides) % p.sides);
  const got = c(ring.i, k);
  out[0] = got[0];
  out[1] = got[1];
  out[2] = got[2];
  return out;
}
