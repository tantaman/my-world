// Procedural geometry for building pieces: round logs, hewn timbers, chinking,
// stone footings, stumps, felled trunks, roofs, and the tools in your hands.
// Like the plants, everything is vertex coloured (no textures), and each
// piece says what it is made of (surfaces.js), which the building material
// draws: the bark and the grain, the rings at a cut end, the courses of
// shakes, the stone.

import * as THREE from 'three';
import { LOG_D, TIMBER_H, TIMBER_W } from './constants.js';
import { SURF, UPRIGHT } from './surfaces.js';
import { phash } from '../noise.js';

const lin = (hex) => new THREE.Color(hex);
export const WOOD = {
  bark: lin(0x5a4330),
  barkDark: lin(0x2b1f15),
  endLight: lin(0xc39a63),
  endDark: lin(0x7c5a36),
  hewn: lin(0xa07a4c),
  hewnDark: lin(0x6e5032),
  chink: lin(0xb3a68a),
  chalk: lin(0xf0e6c8),
  stone: lin(0x8a857a),
  stoneDark: lin(0x4a4740),
  shake: lin(0x6b5238),
  shakeDark: lin(0x3e2e1f),
  board: lin(0x8c6b45),
  leaf: lin(0x2a4518),
  leafDry: lin(0x5a5a26),
};

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m3 = new THREE.Matrix3();
const _t = new THREE.Vector3();
const _b = new THREE.Vector3();
const _r = new THREE.Vector3();
const WEAR_MOST = 0.95; // (worn is the fraction of a surface's number: see surfaces.js)

// Accumulates transformed primitives into one vertex-coloured geometry.
// color(p, n, out) gets the *local* position and normal of each vertex.
//
// Each vertex also says what it's made of (surfaces.js): the surface the
// piece is (m.surf when it's added, or one given), how worn (m.wear, 0..1),
// and where it is along the piece's grain and across it (m), for the
// material's patterns. A primitive's grain runs along its longest side, and
// where it is cut across that (the end of a board, of a log) it shows its end
// grain. A flat face's (tris) runs level across it, unless it is UPRIGHT.
//
// Pieces may be added where they are in the world (a cabin's logs are). The
// geometry mustn't hold numbers that big, though: a vertex is a 32-bit float
// (render/origin.js). So such a mesh is built from a spot of its own:
//
//   const at = m.anchor();
//   const mesh = new THREE.Mesh(m.build(at), material);
//   mesh.position.copy(at);
export class Mesher {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
    this.kind = []; // what each vertex is made of, and how worn: SURF + wear
    this.uv = []; // along its grain and across (m)
    this.n = 0;
    this.surf = SURF.plain;
    this.wear = 0;
    this.pieces = 0;
    this.ref = null; // where flat faces measure their pattern from (near the first of them)
  }

  // The number a vertex of surface `surf` carries, with this mesher's wear.
  _kind(surf) {
    return (surf & ~UPRIGHT) + Math.min(WEAR_MOST, Math.max(0, this.wear));
  }

  add(geo, matrix, color, deform, surf = this.surf) {
    const g = geo;
    const P = g.attributes.position;
    const N = g.attributes.normal;
    const UV = g.attributes.uv;
    _m3.getNormalMatrix(matrix);
    const base = this.n;
    // Which way the piece runs: its longest side. A cylinder runs along its
    // axis, and its pattern goes round it.
    const cyl = g.type === 'CylinderGeometry';
    let long = 1;
    let round = 0;
    if (!cyl) {
      let most = -1;
      for (let a = 0; a < 3; a++) {
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 0; i < P.count; i++) {
          const v = P.getComponent(i, a);
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        if (hi - lo > most) {
          most = hi - lo;
          long = a;
        }
      }
    } else round = Math.PI * (g.parameters.radiusTop + g.parameters.radiusBottom);
    // each piece its own patch of grain
    this.pieces++;
    const ou = phash(this.pieces, 3, 1) * 17;
    const ov = phash(this.pieces, 5, 2) * 17;
    const pith = (phash(this.pieces, 7, 3) - 0.5) * 0.04;
    for (let i = 0; i < P.count; i++) {
      _p.fromBufferAttribute(P, i);
      _n.fromBufferAttribute(N, i);
      if (deform) deform(_p, _n);
      const c = color(_p, _n, _c);
      this.col.push(c.r, c.g, c.b);
      // what it is, and where on its grain
      let k = typeof surf === 'function' ? surf(_p, _n) : surf;
      let u;
      let v;
      if (cyl) {
        const cap = Math.abs(_n.y) > 0.9;
        if (cap && (k === SURF.bark || k === SURF.wood)) k = SURF.end;
        if (cap) {
          u = _p.x + (k === SURF.end ? pith : ou);
          v = _p.z + (k === SURF.end ? pith : ov);
        } else {
          u = _p.y + ou;
          v = (UV ? UV.getX(i) : 0) * round + ov;
        }
      } else {
        const ax = Math.abs(_n.x) > Math.abs(_n.y) ? (Math.abs(_n.x) > Math.abs(_n.z) ? 0 : 2) : Math.abs(_n.y) > Math.abs(_n.z) ? 1 : 2;
        const pc = [_p.x, _p.y, _p.z];
        if (ax === long) {
          if (k === SURF.wood || k === SURF.bark) k = SURF.end;
          u = pc[(ax + 1) % 3] + (k === SURF.end ? pith : ou);
          v = pc[(ax + 2) % 3] + (k === SURF.end ? pith : ov);
        } else {
          u = pc[long] + ou;
          v = pc[3 - ax - long] + ov;
        }
      }
      this.kind.push(this._kind(k));
      this.uv.push(u, v);
      _p.applyMatrix4(matrix);
      _n.applyMatrix3(_m3).normalize();
      this.pos.push(_p.x, _p.y, _p.z);
      this.nor.push(_n.x, _n.y, _n.z);
      this.n++;
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < P.count; i++) this.idx.push(base + i);
    geo.dispose();
  }

  // A raw triangle list in world space with flat normals. Their pattern runs
  // level across each face (or up it, if surf is marked UPRIGHT), measured
  // from near the first of them, so the numbers stay small.
  tris(points, color, surf = this.surf) {
    if (!this.ref && points.length) this.ref = new THREE.Vector3(Math.round(points[0].x), Math.round(points[0].y), Math.round(points[0].z));
    const kind = this._kind(surf);
    const upright = (surf & UPRIGHT) !== 0;
    for (let i = 0; i < points.length; i += 3) {
      const a = points[i];
      const b = points[i + 1];
      const c = points[i + 2];
      const e1 = new THREE.Vector3().subVectors(b, a);
      const e2 = new THREE.Vector3().subVectors(c, a);
      const nn = new THREE.Vector3().crossVectors(e1, e2).normalize();
      // level across the face, and up it
      if (Math.abs(nn.y) < 0.95) _t.set(nn.z, 0, -nn.x).normalize();
      else _t.set(1, 0, 0);
      _b.crossVectors(nn, _t);
      for (const p of [a, b, c]) {
        const col = color(p, nn, _c);
        this.pos.push(p.x, p.y, p.z);
        this.nor.push(nn.x, nn.y, nn.z);
        this.col.push(col.r, col.g, col.b);
        _r.subVectors(p, this.ref);
        const u = _r.dot(_t);
        const v = _r.dot(_b);
        this.uv.push(upright ? v : u, upright ? u : v);
        this.kind.push(kind);
        this.idx.push(this.n++);
      }
    }
  }

  get empty() {
    return this.n === 0;
  }

  // A spot to build from: a whole metre near the first vertex, on the level
  // of zero (heights are small as they are).
  anchor() {
    return new THREE.Vector3(Math.round(this.pos[0] || 0), 0, Math.round(this.pos[2] || 0));
  }

  // The geometry, measured from `at` (if given, the mesh must be put there).
  build(at = null) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(this.pos.length);
    const [ax, ay, az] = at ? [at.x, at.y, at.z] : [0, 0, 0];
    for (let i = 0; i < pos.length; i += 3) {
      // taken away as 64-bit numbers, before they're cut down to floats
      pos[i] = this.pos[i] - ax;
      pos[i + 1] = this.pos[i + 1] - ay;
      pos[i + 2] = this.pos[i + 2] - az;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aSurf', new THREE.Float32BufferAttribute(this.kind, 1));
    g.setAttribute('aUV', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Matrix placing a primitive built along local +Y so it runs along `axis`
// ('x' | 'z' | a THREE.Vector3 direction), centred at (x, y, z).
const _Y = new THREE.Vector3(0, 1, 0);
export function alongMatrix(axis, x, y, z, roll = 0) {
  if (axis === 'x') _q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
  else if (axis === 'z') _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  else _q.setFromUnitVectors(_Y, axis);
  if (roll) _q.multiply(new THREE.Quaternion().setFromAxisAngle(_Y, roll));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, _s.set(1, 1, 1));
}

// ── Round log ──────────────────────────────────────────────────────────────
// Length runs along local Y. Bark streaks, lighter cut ends with a bark rim,
// a gentle taper and a slightly irregular section so no two logs match.
export function addRoundLog(m, matrix, len, seed, r = LOG_D / 2, taper = 0.06) {
  const segs = Math.max(2, Math.round(len * 1.6));
  const geo = new THREE.CylinderGeometry(r, r, len, 10, segs, false);
  const flip = phash(seed, 3, 1) > 0.5 ? 1 : -1;
  m.add(
    geo,
    matrix,
    (p, n, out) => {
      if (Math.abs(n.y) > 0.9) {
        const rho = Math.min(1, Math.hypot(p.x, p.z) / r);
        out.copy(WOOD.endLight).lerp(WOOD.endDark, rho * rho);
        if (rho > 0.9) out.lerp(WOOD.barkDark, 0.6);
        return out.multiplyScalar(0.9 + phash(seed, p.y, 7) * 0.2);
      }
      const a = Math.round(((Math.atan2(p.z, p.x) + Math.PI) / (Math.PI * 2)) * 10);
      const streak = phash(a, Math.round(p.y * 2.2), seed);
      out.copy(WOOD.barkDark).lerp(WOOD.bark, 0.45 + streak * 0.55);
      return out.multiplyScalar(0.85 + phash(a * 3, p.y * 5, seed) * 0.3);
    },
    (p) => {
      const t = p.y / len + 0.5;
      const k =
        (1 - taper * (flip > 0 ? t : 1 - t)) *
        (1 + (phash(Math.round(p.x * 50), Math.round(p.y * 50), Math.round(p.z * 50) + seed) - 0.5) * 0.08);
      p.x *= k;
      p.z *= k;
    },
    SURF.bark,
  );
}

// ── Hewn timber ────────────────────────────────────────────────────────────
// Squared on four faces with adze marks, a little bark left on the corners.
export function addTimber(m, matrix, len, seed, h = TIMBER_H, w = TIMBER_W) {
  const segs = Math.max(2, Math.round(len * 3));
  const geo = new THREE.BoxGeometry(w, len, h, 2, segs, 2);
  m.add(geo, matrix, (p, n, out) => {
    if (Math.abs(n.y) > 0.9) {
      out.copy(WOOD.endLight).lerp(WOOD.endDark, phash(p.x * 9, p.z * 9, seed) * 0.6);
      return out;
    }
    const mark = phash(Math.round(p.y * 3.3), Math.round(n.x * 2 + n.z * 3), seed);
    out.copy(WOOD.hewnDark).lerp(WOOD.hewn, 0.55 + mark * 0.45);
    const edge = Math.abs(n.x) > 0.5 ? Math.abs(p.z) / (h / 2) : Math.abs(p.x) / (w / 2);
    if (edge > 0.95 && phash(Math.round(p.y * 2), seed, 5) > 0.45) out.lerp(WOOD.barkDark, 0.55);
    return out.multiplyScalar(0.9 + phash(p.x * 7, p.y * 11, p.z * 7 + seed) * 0.18);
  }, null, SURF.wood);
}

// A strip of clay chinking in the seam between two stacked round logs.
export function addChink(m, matrix, len) {
  const geo = new THREE.BoxGeometry(LOG_D * 0.74, len, 0.09, 1, Math.max(1, Math.round(len * 2)), 1);
  m.add(geo, matrix, (p, n, out) => out.copy(WOOD.chink).multiplyScalar(0.8 + phash(p.y * 4, p.x * 9, 2) * 0.3), null, SURF.clay);
}

// A chalk band around a log where a notch still has to be cut.
export function addChalk(m, matrix, r) {
  const geo = new THREE.CylinderGeometry(r * 1.07, r * 1.07, 0.05, 10, 1, true);
  m.add(geo, matrix, (p, n, out) => out.copy(WOOD.chalk), null, SURF.plain);
}

// ── Footing ────────────────────────────────────────────────────────────────
// A dry-stacked stone pier from just below the ground up to `top`.
export function addFooting(m, x, z, ground, top, seed) {
  const h = top - ground + 0.1;
  const stones = h > 0.3 ? 3 : 2;
  let y = ground - 0.1;
  for (let i = 0; i < stones; i++) {
    const last = i === stones - 1;
    const sh = last ? Math.min(0.14, h * 0.5) : (h - Math.min(0.14, h * 0.5)) / (stones - 1);
    const geo = last ? new THREE.BoxGeometry(0.46, sh, 0.46, 2, 1, 2) : new THREE.IcosahedronGeometry(0.3, 0);
    const sx = last ? 1 : 1 + phash(seed, i, 1) * 0.3;
    const sz = last ? 1 : 1 + phash(seed, i, 2) * 0.3;
    const mat = new THREE.Matrix4().compose(
      new THREE.Vector3(x + (phash(seed, i, 3) - 0.5) * 0.06, y + sh / 2, z + (phash(seed, i, 4) - 0.5) * 0.06),
      new THREE.Quaternion().setFromAxisAngle(_Y, phash(seed, i, 5) * 6),
      new THREE.Vector3(sx, last ? 1 : sh / 0.48, sz),
    );
    m.add(
      geo,
      mat,
      (p, n, out) => {
        out.copy(WOOD.stoneDark).lerp(WOOD.stone, 0.4 + Math.max(0, n.y) * 0.4 + phash(p.x * 13, p.y * 13, p.z * 13 + seed) * 0.3);
        return out;
      },
      last
        ? (p) => {
            if (p.y < 0) {
              p.x *= 1.04;
              p.z *= 1.04;
            }
            p.x += (phash(Math.round(p.x * 40), Math.round(p.z * 40), seed) - 0.5) * 0.04;
            p.z += (phash(Math.round(p.z * 40), Math.round(p.x * 40), seed + 1) - 0.5) * 0.04;
          }
        : null,
      SURF.stone,
    );
    y += sh;
  }
}

// ── Stump ──────────────────────────────────────────────────────────────────
export function stumpGeometry(r, seed = 1) {
  const m = new Mesher();
  const h = 0.42;
  const geo = new THREE.CylinderGeometry(r * 0.96, r * 1.25, h, 9, 2, false);
  m.add(
    geo,
    new THREE.Matrix4().makeTranslation(0, h / 2 - 0.08, 0),
    (p, n, out) => {
      if (n.y > 0.9) {
        const rho = Math.min(1, Math.hypot(p.x, p.z) / r);
        out.copy(WOOD.endLight).lerp(WOOD.endDark, rho * rho * 0.8);
        if (rho > 0.88) out.lerp(WOOD.barkDark, 0.7);
        return out;
      }
      const a = Math.round(((Math.atan2(p.z, p.x) + Math.PI) / (Math.PI * 2)) * 9);
      return out.copy(WOOD.barkDark).lerp(WOOD.bark, 0.35 + phash(a, seed, 2) * 0.5);
    },
    (p) => {
      if (p.y > 0.1) {
        // an uneven, slightly sloped saw cut
        p.y += p.x * 0.12 + (phash(Math.round(p.x * 30), Math.round(p.z * 30), seed) - 0.5) * 0.03;
      }
    },
    SURF.bark,
  );
  return m.build();
}

// ── Felled trunk ───────────────────────────────────────────────────────────
// A limbed trunk lying along `dir` from `base`, `len` long. Both ends cut.
export function addTrunk(m, base, dir, len, r0, r1, seed) {
  const geo = new THREE.CylinderGeometry(r1, r0, len, 9, Math.max(2, Math.round(len)), false);
  const c = base.clone().addScaledVector(dir, len / 2);
  const mat = alongMatrix(dir.clone().normalize(), c.x, c.y, c.z, phash(seed, 1, 1) * 6);
  m.add(geo, mat, (p, n, out) => {
    if (Math.abs(n.y) > 0.9) {
      const rho = Math.min(1, Math.hypot(p.x, p.z) / (n.y > 0 ? r1 : r0));
      out.copy(WOOD.endLight).lerp(WOOD.endDark, rho * rho);
      if (rho > 0.88) out.lerp(WOOD.barkDark, 0.6);
      return out;
    }
    const a = Math.round(((Math.atan2(p.z, p.x) + Math.PI) / (Math.PI * 2)) * 9);
    out.copy(WOOD.barkDark).lerp(WOOD.bark, 0.4 + phash(a, Math.round(p.y * 2), seed) * 0.6);
    return out.multiplyScalar(0.85 + phash(a * 5, p.y * 3, seed) * 0.3);
  }, null, SURF.bark);
}

// Limbs and tops left after limbing: a low heap of brush.
export function addSlash(m, center, dir, seed, conifer) {
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  for (let i = 0; i < 5; i++) {
    const t = phash(seed, i, 1) * 2.4 - 0.6;
    const s = (phash(seed, i, 2) - 0.5) * 1.6;
    const p = center.clone().addScaledVector(dir, t).addScaledVector(side, s);
    const r = 0.45 + phash(seed, i, 3) * 0.4;
    const geo = new THREE.IcosahedronGeometry(r, 0);
    const mat = new THREE.Matrix4().compose(
      p.setY(p.y + r * 0.2),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(phash(seed, i, 4), phash(seed, i, 5) * 6, 0)),
      new THREE.Vector3(1.2, 0.45, 1),
    );
    m.add(geo, mat, (pp, n, out) => {
      out.copy(conifer ? WOOD.leaf : WOOD.leafDry).lerp(WOOD.barkDark, 0.25 + phash(pp.x * 9, pp.y * 9, i) * 0.4);
      return out.multiplyScalar(0.7 + Math.max(0, n.y) * 0.5);
    });
  }
}

// ── Roof ───────────────────────────────────────────────────────────────────
// A gable roof over the rectangle [x0, x1] × [z0, z1] (node coordinates) with
// the eaves at `eave`. The ridge runs along `axis`. Shake courses, board
// gables, a ridge log, and purlin ends poking out under the eaves.
export function addRoof(m, { x0, z0, x1, z1, eave, axis }, pitch, overhang, seed) {
  // Work in a frame where u runs along the ridge and v across it.
  const along = axis === 'x';
  const u0 = (along ? x0 : z0) - overhang;
  const u1 = (along ? x1 : z1) + overhang;
  const vc = along ? (z0 + z1) / 2 : (x0 + x1) / 2;
  const half = (along ? z1 - z0 : x1 - x0) / 2;
  const tan = Math.tan(pitch);
  const ridgeY = eave + half * tan;
  const toW = (u, y, v) => (along ? new THREE.Vector3(u, y, v) : new THREE.Vector3(v, y, u));
  const thick = 0.1;

  // Two slopes, built from overlapping courses of shakes.
  const vEdge = half + overhang;
  const yEdge = eave - overhang * tan;
  const slope = Math.hypot(vEdge, ridgeY - yEdge);
  const rows = Math.max(3, Math.round(slope / 0.34));
  for (const sgn of [-1, 1]) {
    for (let r = 0; r < rows; r++) {
      const ta = r / rows;
      const tb = (r + 1) / rows + 0.04;
      const va = vc + sgn * vEdge * (1 - ta);
      const vb = vc + sgn * vEdge * (1 - Math.min(1, tb));
      const ya = yEdge + (ridgeY - yEdge) * ta;
      const yb = yEdge + (ridgeY - yEdge) * Math.min(1, tb);
      const cols = Math.max(2, Math.round((u1 - u0) / 0.3));
      for (let c = 0; c < cols; c++) {
        const ua = u0 + ((u1 - u0) * c) / cols;
        const ub = u0 + ((u1 - u0) * (c + 1)) / cols;
        const j = phash(r, c, seed);
        const drop = 0.025 + j * 0.02; // each shake's butt sits a touch proud
        const A = toW(ua, ya + thick - drop, va);
        const B = toW(ub, ya + thick - drop, va);
        const C = toW(ub, yb + thick, vb);
        const D = toW(ua, yb + thick, vb);
        const shade = 0.7 + j * 0.5;
        const col = (p, n, out) => out.copy(WOOD.shakeDark).lerp(WOOD.shake, Math.min(1, shade * (0.6 + 0.4 * Math.abs(n.y))));
        if (sgn > 0) m.tris([A, C, B, A, D, C], col, SURF.shingle);
        else m.tris([A, B, C, A, C, D], col, SURF.shingle);
        // the butt end of the course
        const A2 = toW(ua, ya - drop * 0.5, va);
        const B2 = toW(ub, ya - drop * 0.5, va);
        const dark = (p, n, out) => out.copy(WOOD.shakeDark).multiplyScalar(0.6 + j * 0.3);
        if (sgn > 0) m.tris([A2, B, A, A2, B2, B], dark, SURF.wood);
        else m.tris([A2, A, B, A2, B, B2], dark, SURF.wood);
      }
    }
    // underside (soffit)
    const S0 = toW(u0, yEdge, vc + sgn * vEdge);
    const S1 = toW(u1, yEdge, vc + sgn * vEdge);
    const S2 = toW(u1, ridgeY, vc);
    const S3 = toW(u0, ridgeY, vc);
    const und = (p, n, out) => out.copy(WOOD.board).multiplyScalar(0.55);
    if (sgn > 0) m.tris([S0, S1, S2, S0, S2, S3], und, SURF.wood | UPRIGHT);
    else m.tris([S0, S2, S1, S0, S3, S2], und, SURF.wood | UPRIGHT);
  }

  // Gable ends: vertical boards in the triangle above the eaves.
  for (const [u, out] of [
    [along ? x0 : z0, -1],
    [along ? x1 : z1, 1],
  ]) {
    const boards = Math.max(3, Math.round((half * 2) / 0.22));
    for (let b = 0; b < boards; b++) {
      const va = vc - half + ((half * 2) * b) / boards;
      const vb = vc - half + ((half * 2) * (b + 1)) / boards;
      const ha = eave + (half - Math.abs(va - vc)) * tan;
      const hb = eave + (half - Math.abs(vb - vc)) * tan;
      const j = phash(b, u, seed);
      const col = (p, n, o) => o.copy(WOOD.board).lerp(WOOD.hewnDark, 0.2 + j * 0.4);
      const off = out * 0.04;
      const P0 = toW(u + off, eave - 0.05, va);
      const P1 = toW(u + off, eave - 0.05, vb);
      const P2 = toW(u + off, hb, vb);
      const P3 = toW(u + off, ha, va);
      if ((out > 0) === along) m.tris([P0, P1, P2, P0, P2, P3], col, SURF.wood | UPRIGHT);
      else m.tris([P0, P2, P1, P0, P3, P2], col, SURF.wood | UPRIGHT);
      // and the inside face
      const Q0 = toW(u - off, eave - 0.05, va);
      const Q1 = toW(u - off, eave - 0.05, vb);
      const Q2 = toW(u - off, hb, vb);
      const Q3 = toW(u - off, ha, va);
      const inner = (p, n, o) => o.copy(WOOD.board).multiplyScalar(0.5 + j * 0.15);
      if ((out > 0) === along) m.tris([Q0, Q2, Q1, Q0, Q3, Q2], inner, SURF.wood | UPRIGHT);
      else m.tris([Q0, Q1, Q2, Q0, Q2, Q3], inner, SURF.wood | UPRIGHT);
    }
  }

  // Ridge log and purlins.
  const ridgeLen = u1 - u0 + 0.2;
  const rc = toW((u0 + u1) / 2, ridgeY + thick + 0.04, vc);
  addRoundLog(m, alongMatrix(axis, rc.x, rc.y, rc.z), ridgeLen, seed + 11, 0.13, 0.03);
  for (const f of [0.5]) {
    for (const sgn of [-1, 1]) {
      const v = vc + sgn * half * f;
      const y = eave + half * (1 - f) * tan - 0.12;
      const pc = toW((u0 + u1) / 2, y, v);
      addRoundLog(m, alongMatrix(axis, pc.x, pc.y, pc.z), ridgeLen - 0.1, seed + 20 + sgn, 0.1, 0.03);
    }
  }
}

// ── Hand tools ─────────────────────────────────────────────────────────────
// Built so the hand grips at the origin and the business end points along
// local -Y (the direction the forearm points). A cutting edge faces local -Z,
// the back of the hand: the way the head travels when the arm swings forward
// and down, so a downward swing lands on the edge.
const toolMat = (hex, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal });

export function makeAxe() {
  const g = new THREE.Group();
  const wood = toolMat(0x8a6038);
  const steel = toolMat(0x8a8d90, 0.45, 0.6);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.72, 6), wood);
  handle.position.y = -0.26;
  g.add(handle);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.17), steel);
  head.position.set(0, -0.58, -0.05);
  g.add(head);
  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, 0.05), steel);
  bit.position.set(0, -0.58, -0.14);
  g.add(bit);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}

export function makeShovel() {
  const g = new THREE.Group();
  const wood = toolMat(0x93693f);
  const steel = toolMat(0x6f7378, 0.55, 0.5);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 1.0, 6), wood);
  handle.position.y = -0.38;
  g.add(handle);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.025), wood);
  grip.position.y = 0.12;
  g.add(grip);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.02), steel);
  blade.position.set(0, -0.98, 0.0);
  blade.rotation.x = 0.18;
  g.add(blade);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}

// A grade stake with a bright ribbon, and a string-line height mark.
export function makeStake() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.05), toolMat(0xb08a5a));
  post.position.y = 0.3;
  post.castShadow = true;
  g.add(post);
  const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.16), toolMat(0xe0662a, 0.9));
  ribbon.position.set(0, 0.74, 0.08);
  g.add(ribbon);
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.09), toolMat(0xf2ead0, 0.9));
  g.add(mark); // sits exactly at grade
  return g;
}
