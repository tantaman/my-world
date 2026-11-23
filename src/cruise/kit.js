// Building blocks for the ship: the video store's vertex-coloured Kit (quads,
// boxes, upright panels, words in the little square font), and the round
// and curved things a ship has that a shop doesn't: cylinders, tubes swept
// along a path, triangles, and a surface lofted through rows of points.
//
// What's drawn can be laid with one of her surfaces (textures.js): kit.on(
// surface, base) and what's drawn after it is carpet, marble, panelling...
// until kit.on(null). Where it is on the surface is worked out from where it
// is in her frame, a repeat every surface.size metres: a floor (or ceiling)
// by its x and z, an upright face by how far along it is and how high over
// `base` (the floor it stands on), so the panelling's rail is at the same
// height all round a room. Every vertex says its layer (the `surface`
// attribute; 0 for plain) and has a uv.
//
// Everything is in the ship's own frame (plan.js), round her own origin, and
// the group it ends up in is what's put in the world (render/origin.js).

import * as THREE from 'three';
import { Kit } from '../build/kit.js';

const _n = [0, 0, 0];

function normal(a, b, c, out = _n) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  let x = uy * vz - uz * vy;
  let y = uz * vx - ux * vz;
  let z = ux * vy - uy * vx;
  const l = Math.hypot(x, y, z) || 1;
  out[0] = x / l;
  out[1] = y / l;
  out[2] = z / l;
  return out;
}

export class ShipKit extends Kit {
  constructor() {
    super();
    this.lay = []; // each vertex's layer
    this.layer = 0;
    this.tile = 1;
    this.base = 0;
  }

  // Lay what's drawn from now on with a surface (textures.js's SURFACES), its
  // upright faces measured from `base` (m); or, given null, plain.
  on(surface, base = 0) {
    this.layer = surface ? surface.layer : 0;
    this.tile = surface ? surface.size : 1;
    this.base = base;
  }

  quad(a, b, c, d, n, color, uv = null) {
    super.quad(a, b, c, d, n, color, uv);
    this.laid(6, n, !uv);
  }

  tri(a, b, c, color, n = null) {
    const m = n || normal(a, b, c);
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(m[0], m[1], m[2]);
      this.col.push(color.r, color.g, color.b);
      this.uv.push(0, 0);
    }
    this.laid(3, m, true);
  }

  // The last `count` vertices are on the surface being laid: where on it,
  // from where they are (facing n), unless they were given a uv.
  laid(count, n, place) {
    for (let i = 0; i < count; i++) this.lay.push(this.layer);
    if (!this.layer || !place) return;
    const ax = Math.abs(n[0]);
    const ay = Math.abs(n[1]);
    const az = Math.abs(n[2]);
    const P = this.pos;
    const U = this.uv;
    const first = P.length / 3 - count;
    for (let k = first; k < first + count; k++) {
      const x = P[k * 3];
      const y = P[k * 3 + 1] - this.base;
      const z = P[k * 3 + 2];
      // along an upright face: to the right, as it's seen from in front
      const u = ay >= ax && ay >= az ? x : ax >= az ? (n[0] > 0 ? -z : z) : n[2] > 0 ? x : -x;
      const v = ay >= ax && ay >= az ? z : y;
      U[k * 2] = u / this.tile;
      U[k * 2 + 1] = v / this.tile;
    }
  }

  // with a uv always, and each vertex's layer
  build() {
    const g = super.build(true);
    g.setAttribute('surface', new THREE.Float32BufferAttribute(this.lay, 1));
    return g;
  }

  // a flat four-cornered piece with its normal worked out from its corners
  // (a b c d anticlockwise seen from the side it faces)
  face(a, b, c, d, color) {
    const n = normal(a, b, c, [0, 0, 0]);
    this.quad(a, b, c, d, n, color);
  }

  // a level rectangle at height y, facing up (or down)
  flat(x0, z0, x1, z1, y, color, down = false) {
    if (down) this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0], color);
    else this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], color);
  }

  // an upright cylinder (or a cone, r0 at the bottom, r1 at the top)
  cyl(x, y0, z, y1, r0, color, seg = 12, r1 = r0, caps = true) {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const b = ((i + 1) / seg) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const cb = Math.cos(b);
      const sb = Math.sin(b);
      this.quad([x + ca * r0, y0, z + sa * r0], [x + cb * r0, y0, z + sb * r0], [x + cb * r1, y1, z + sb * r1], [x + ca * r1, y1, z + sa * r1], [(ca + cb) / 2, 0, (sa + sb) / 2], color);
      if (caps) {
        this.tri([x, y1, z], [x + cb * r1, y1, z + sb * r1], [x + ca * r1, y1, z + sa * r1], color, [0, 1, 0]);
        if (y0 > -1e9) this.tri([x, y0, z], [x + ca * r0, y0, z + sa * r0], [x + cb * r0, y0, z + sb * r0], color, [0, -1, 0]);
      }
    }
  }

  // a round rod from a to b ([x, y, z]), r across
  rod(a, b, r, color, seg = 6) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    const t = [dx / l, dy / l, dz / l];
    // two directions square to it
    const up = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u = [t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0]];
    const ul = Math.hypot(...u);
    u = u.map((v) => v / ul);
    const w = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const o0 = [Math.cos(a0) * u[0] + Math.sin(a0) * w[0], Math.cos(a0) * u[1] + Math.sin(a0) * w[1], Math.cos(a0) * u[2] + Math.sin(a0) * w[2]];
      const o1 = [Math.cos(a1) * u[0] + Math.sin(a1) * w[0], Math.cos(a1) * u[1] + Math.sin(a1) * w[1], Math.cos(a1) * u[2] + Math.sin(a1) * w[2]];
      const p = (base, o) => [base[0] + o[0] * r, base[1] + o[1] * r, base[2] + o[2] * r];
      this.quad(p(a, o0), p(a, o1), p(b, o1), p(b, o0), [(o0[0] + o1[0]) / 2, (o0[1] + o1[1]) / 2, (o0[2] + o1[2]) / 2], color);
    }
  }

  // A tube swept along a path of [x, y, z] points, r across, `seg` round.
  // part: how much of the way round it goes (1: closed; 0.5: an open
  // trough, its bottom half, for a flume); inside: draw its inner face too.
  tube(path, r, color, { seg = 12, part = 1, inside = false, inColor = color } = {}) {
    const rings = [];
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      const q = path[Math.min(path.length - 1, i + 1)];
      const o = path[Math.max(0, i - 1)];
      let t = [q[0] - o[0], q[1] - o[1], q[2] - o[2]];
      const tl = Math.hypot(...t) || 1;
      t = t.map((v) => v / tl);
      // "side" is level and square to the way along; "up" is square to both
      let side = [t[2], 0, -t[0]];
      const sl = Math.hypot(...side) || 1;
      side = side.map((v) => v / sl);
      const up = [t[1] * side[2] - t[2] * side[1], t[2] * side[0] - t[0] * side[2], t[0] * side[1] - t[1] * side[0]];
      const ring = [];
      const n = Math.max(2, Math.round(seg * part));
      for (let k = 0; k <= n; k++) {
        // round from one side, under, to the other (for a trough), or all the way
        const a = part >= 1 ? (k / n) * Math.PI * 2 : Math.PI * (1 - part) + (k / n) * Math.PI * 2 * part;
        const ca = Math.cos(a);
        const sa = -Math.sin(a);
        const dir = [side[0] * ca + up[0] * sa, side[1] * ca + up[1] * sa, side[2] * ca + up[2] * sa];
        ring.push({ p: [p[0] + dir[0] * r, p[1] + dir[1] * r, p[2] + dir[2] * r], n: dir });
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) {
      const A = rings[i];
      const B = rings[i + 1];
      for (let k = 0; k < A.length - 1; k++) {
        const n = A[k].n;
        this.quad(A[k].p, A[k + 1].p, B[k + 1].p, B[k].p, n, color);
        if (inside) this.quad(B[k].p, B[k + 1].p, A[k + 1].p, A[k].p, [-n[0], -n[1], -n[2]], inColor);
      }
    }
  }

  // A surface through rows of points: rows[i][j] = [x, y, z], each row the
  // same length; flip turns which side it faces.
  loft(rows, colorAt, flip = false) {
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < rows[i].length - 1; j++) {
        const a = rows[i][j];
        const b = rows[i + 1][j];
        const c = rows[i + 1][j + 1];
        const d = rows[i][j + 1];
        const col = colorAt(i, j, a);
        if (flip) this.face(a, d, c, b, col);
        else this.face(a, b, c, d, col);
      }
    }
  }
}

