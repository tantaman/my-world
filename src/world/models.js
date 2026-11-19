// Procedural vegetation models. Everything is built from primitives with
// baked vertex colours (including fake ambient occlusion) and a per-vertex
// "sway" weight that drives the wind shader.
//
// Each builder returns { lod0, lod1, lod2 } geometries sharing the same
// attributes so instanced meshes can swap between them as you walk.

import * as THREE from 'three';
import { mulberry32, createSimplex2 } from '../noise.js';

const _v = new THREE.Vector3(); // scratch for callbacks
const _gv = new THREE.Vector3(); // builder-internal
const _gn = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

const lin = (hex) => new THREE.Color(hex); // sRGB hex -> linear colour

function phash(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.sway = [];
    this.idx = [];
    this.count = 0;
  }

  // Append a three.js geometry, transformed by `matrix`.
  //   deform(p, n)   local-space tweak before the matrix
  //   normal(p, n)   world-space normal override after the matrix
  //   color(p, n)    -> THREE.Color (linear)
  //   sway(p)        -> number
  add(geo, { matrix = _m.identity(), deform, normal, color, sway }) {
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const base = this.count;
    for (let i = 0; i < pos.count; i++) {
      _gv.fromBufferAttribute(pos, i);
      _gn.fromBufferAttribute(nor, i);
      if (deform) deform(_gv, _gn);
      _gv.applyMatrix4(matrix);
      _gn.applyMatrix3(nm).normalize();
      if (normal) normal(_gv, _gn);
      this.pos.push(_gv.x, _gv.y, _gv.z);
      this.nor.push(_gn.x, _gn.y, _gn.z);
      const c = color(_gv, _gn);
      this.col.push(c.r, c.g, c.b);
      this.sway.push(sway ? sway(_gv) : 0);
      this.count++;
    }
    if (geo.index) {
      for (let i = 0; i < geo.index.count; i++) this.idx.push(base + geo.index.getX(i));
    } else {
      for (let i = 0; i < pos.count; i++) this.idx.push(base + i);
    }
    geo.dispose();
  }

  vertex(p, n, c, sway) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.col.push(c.r, c.g, c.b);
    this.sway.push(sway);
    return this.count++;
  }

  // A leaf card: a small diamond facing a random direction.
  leaf(center, size, normal, color, sway, rng) {
    const d = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
    const u = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? THREE.Object3D.DEFAULT_UP : new THREE.Vector3(1, 0, 0)).normalize();
    const w = new THREE.Vector3().crossVectors(d, u).normalize();
    const a = size * (0.55 + rng() * 0.3);
    const b = size * (0.35 + rng() * 0.25);
    const p0 = center.clone().addScaledVector(u, a);
    const p1 = center.clone().addScaledVector(w, b);
    const p2 = center.clone().addScaledVector(u, -a);
    const p3 = center.clone().addScaledVector(w, -b);
    const i0 = this.vertex(p0, normal, color, sway);
    const i1 = this.vertex(p1, normal, color, sway);
    const i2 = this.vertex(p2, normal, color, sway);
    const i3 = this.vertex(p3, normal, color, sway);
    this.idx.push(i0, i1, i2, i0, i2, i3);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

function mat(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

function jitter(c, p, amt) {
  const j = 1 + (phash(p.x, p.y, p.z) - 0.5) * amt;
  return _c.copy(c).multiplyScalar(j);
}

// ── Bark ───────────────────────────────────────────────────────────────────
function barkColor(base, dark, p, height) {
  const t = Math.min(1, Math.max(0, p.y / height));
  _c.copy(dark).lerp(base, Math.min(1, t * 3 + 0.15));
  return _c.multiplyScalar(0.85 + phash(p.x * 3, p.y * 7, p.z * 3) * 0.3);
}

// ── Conifer ────────────────────────────────────────────────────────────────
export function makePine(seed = 1) {
  const build = (lod) => {
    const rng = mulberry32(seed);
    const b = new GeoBuilder();
    const H = 15;
    const barkA = lin(0x5a3e2b);
    const barkD = lin(0x241811);
    const needleDark = lin(0x10261a);
    const needleMid = lin(0x1f4527);
    const needleTip = lin(0x3b6a33);

    const trunkH = H * 0.9;
    const trunk = new THREE.CylinderGeometry(0.05, 0.32, trunkH, lod === 2 ? 3 : lod ? 4 : 6, lod ? 1 : 3, true);
    trunk.translate(0, trunkH / 2 - 0.4, 0);
    b.add(trunk, {
      deform: (p) => {
        if (p.y < 0.3) {
          const f = 1 + (0.3 - p.y) * 0.7;
          p.x *= f;
          p.z *= f;
        }
      },
      color: (p) => barkColor(barkA, barkD, p, 4),
      sway: (p) => Math.pow(Math.max(0, p.y) / H, 2) * 0.35,
    });

    const tiers = lod === 2 ? 2 : lod ? 3 : 8;
    const segs = lod === 2 ? 5 : lod ? 6 : 12;
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      const y = H * (0.24 + 0.62 * t);
      const r = (3.0 - 2.45 * Math.pow(t, 0.85)) * (0.88 + rng() * 0.24) * (lod === 2 ? 1.12 : lod ? 1.08 : 1);
      const h = (lod === 2 ? 7.2 : lod ? 5.2 : 3.4) - 1.5 * t;
      const cone = new THREE.ConeGeometry(r, h, segs, 1, false);
      cone.translate(0, h / 2, 0);
      const rot = rng() * Math.PI * 2;
      const tierSeed = Math.floor(rng() * 1000);
      b.add(cone, {
        matrix: mat(0, y, 0, 0, rot, 0),
        deform: (p) => {
          const rad = Math.hypot(p.x, p.z);
          if (rad > 1e-3) {
            const ang = Math.atan2(p.z, p.x);
            const k = ((Math.round((ang / (Math.PI * 2)) * segs) % segs) + segs) % segs;
            const tip = k % 2 === 0 ? 1.0 : 0.68;
            const f = tip * (0.86 + phash(k, tierSeed, 1) * 0.26);
            p.x *= f;
            p.z *= f;
            // branch tips droop
            const fr = rad / r;
            p.y -= fr * fr * r * 0.28 * tip;
          }
        },
        normal: (p, n) => {
          const out = _v.set(p.x, 0, p.z);
          const l = out.length();
          if (l > 1e-4) out.multiplyScalar(1 / l);
          out.y = 0.75;
          n.multiplyScalar(0.35).addScaledVector(out.normalize(), 0.65).normalize();
        },
        color: (p) => {
          const rad = Math.hypot(p.x, p.z);
          const outer = Math.min(1, rad / r);
          const ao = 0.55 + 0.45 * t;
          _c.copy(needleDark).lerp(needleMid, Math.min(1, outer * 1.4));
          if (outer > 0.6) _c.lerp(needleTip, (outer - 0.6) * 1.2);
          return jitter(_c.multiplyScalar(ao), p, 0.25);
        },
        sway: (p) => Math.pow(p.y / H, 2) + Math.hypot(p.x, p.z) * 0.06,
      });
    }
    return b.build();
  };
  return { lod0: build(0), lod1: build(1), lod2: build(2), height: 15, trunkRadius: 0.32 };
}

// ── Broadleaf (oak / beech-ish) ────────────────────────────────────────────
export function makeBroadleaf(seed = 2) {
  const build = (lod) => {
    const rng = mulberry32(seed);
    const b = new GeoBuilder();
    const barkA = lin(0x5d4a3a);
    const barkD = lin(0x2a2018);
    const leafDark = lin(0x1d3511);
    const leafMid = lin(0x3c5f1d);
    const leafLight = lin(0x6f8f2c);
    const trunkH = 5.2;

    const trunk = new THREE.CylinderGeometry(0.17, 0.4, trunkH + 1.2, lod === 2 ? 4 : lod ? 5 : 7, lod ? 1 : 4, true);
    trunk.translate(0, (trunkH + 1.2) / 2 - 0.4, 0);
    b.add(trunk, {
      deform: (p) => {
        const t = (p.y + 0.4) / (trunkH + 1.2);
        p.x += Math.sin(t * 2.6 + 1) * 0.18 * t;
        p.z += Math.cos(t * 1.9) * 0.14 * t;
        if (p.y < 0.5) {
          const f = 1 + (0.5 - p.y) * 0.8;
          p.x *= f;
          p.z *= f;
        }
      },
      color: (p) => barkColor(barkA, barkD, p, 3),
      sway: (p) => Math.pow(Math.max(0, p.y) / 11, 2) * 0.4,
    });

    const center = new THREE.Vector3(0, trunkH + 2.3, 0);
    const clusters = [];
    const nClusters = lod === 2 ? 2 : lod ? 4 : 8;
    for (let i = 0; i < nClusters; i++) {
      const a = (i / nClusters) * Math.PI * 2 + rng() * 0.6;
      let up;
      let dist;
      let r;
      if (lod === 0) {
        up = -0.25 + rng() * 1.1;
        dist = 1.6 + rng() * 1.1;
        r = 1.5 + rng() * 0.7;
      } else if (lod === 1) {
        up = 0.1 + (i % 2) * 0.55;
        dist = 1.45;
        r = 2.25;
      } else {
        up = i === 0 ? -0.05 : 0.75;
        dist = i === 0 ? 0.5 : 0.25;
        r = i === 0 ? 3.2 : 2.5;
      }
      const c = new THREE.Vector3(Math.cos(a) * dist, up * 1.6, Math.sin(a) * dist).add(center);
      if (!lod && i === nClusters - 1) c.set(rng() - 0.5, center.y + 1.6, rng() - 0.5);
      clusters.push({ c, r });
    }

    // branches reaching into the clusters
    if (!lod) {
      for (let i = 0; i < 4; i++) {
        const cl = clusters[i * 2];
        const from = new THREE.Vector3(0, trunkH - 1.2 + i * 0.4, 0);
        const dir = cl.c.clone().sub(from);
        const len = dir.length() * 0.85;
        const br = new THREE.CylinderGeometry(0.05, 0.13, len, 4, 1, true);
        br.translate(0, len / 2, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        const m = new THREE.Matrix4().compose(from, q, new THREE.Vector3(1, 1, 1));
        b.add(br, { matrix: m, color: (p) => barkColor(barkA, barkD, p, 3), sway: (p) => Math.pow(p.y / 11, 2) * 0.6 });
      }
    }

    const sphereNormal = (p, n) => {
      const out = _v.copy(p).sub(center).normalize();
      n.multiplyScalar(0.25).addScaledVector(out, 0.75).normalize();
    };
    const leafColor = (p) => {
      const h = (p.y - (center.y - 3)) / 6.5;
      const side = _v.copy(p).sub(center).normalize().y * 0.5 + 0.5;
      _c.copy(leafDark).lerp(leafMid, Math.min(1, h * 1.3));
      if (side > 0.6) _c.lerp(leafLight, (side - 0.6) * 1.1);
      return jitter(_c, p, 0.3);
    };
    const leafSway = (p) => Math.pow(p.y / 11, 2) * 0.9 + 0.05;

    for (const { c, r } of clusters) {
      const blob = new THREE.IcosahedronGeometry(r * (lod ? 1 : 0.78), 0);
      const bs = Math.floor(rng() * 1000);
      b.add(blob, {
        matrix: mat(c.x, c.y, c.z, rng(), rng() * 6, 0, 1, 0.82, 1),
        deform: (p) => {
          const k = 1 + (phash(Math.round(p.x * 10), Math.round(p.y * 10) + bs, Math.round(p.z * 10)) - 0.5) * 0.35;
          p.multiplyScalar(k);
        },
        normal: sphereNormal,
        color: (p) => leafColor(p).multiplyScalar(0.78),
        sway: leafSway,
      });
      if (!lod) {
        const cards = 22;
        for (let k = 0; k < cards; k++) {
          const d = new THREE.Vector3(rng() * 2 - 1, rng() * 1.6 - 0.5, rng() * 2 - 1).normalize();
          const pc = c.clone().addScaledVector(d, r * (0.7 + rng() * 0.42));
          const n = pc.clone().sub(center).normalize();
          n.y = n.y * 0.8 + 0.25;
          n.normalize();
          const col = leafColor(pc).clone().multiplyScalar(0.95 + rng() * 0.25);
          b.leaf(pc, 0.95, n, col, leafSway(pc), rng);
        }
      }
    }
    return b.build();
  };
  return { lod0: build(0), lod1: build(1), lod2: build(2), height: 11, trunkRadius: 0.4 };
}

// ── Birch ──────────────────────────────────────────────────────────────────
export function makeBirch(seed = 3) {
  const build = (lod) => {
    const rng = mulberry32(seed);
    const b = new GeoBuilder();
    const white = lin(0xd8d2c4);
    const mark = lin(0x2b2722);
    const leafDark = lin(0x3b5418);
    const leafLight = lin(0x9aae3e);
    const H = 12;
    const trunk = new THREE.CylinderGeometry(0.07, 0.2, H, lod === 2 ? 3 : lod ? 4 : 6, lod === 2 ? 1 : lod ? 2 : 10, true);
    trunk.translate(0, H / 2 - 0.3, 0);
    b.add(trunk, {
      deform: (p) => {
        const t = (p.y + 0.3) / H;
        p.x += Math.sin(t * 3.0) * 0.25 * t;
      },
      color: (p) => {
        const band = phash(Math.round(p.y * 3.1), 7, Math.round(Math.atan2(p.z, p.x) * 1.5));
        _c.copy(white);
        if (band > 0.72 || p.y < 0.4) _c.lerp(mark, p.y < 0.4 ? 0.65 : 0.85);
        return _c.multiplyScalar(0.92 + phash(p.x, p.y, p.z) * 0.16);
      },
      sway: (p) => Math.pow(Math.max(0, p.y) / H, 2) * 0.6,
    });

    const center = new THREE.Vector3(0.25, H * 0.72, 0);
    const nClusters = lod === 2 ? 1 : lod ? 2 : 6;
    const leafColor = (p) => {
      const side = _v.copy(p).sub(center).normalize().y * 0.5 + 0.5;
      _c.copy(leafDark).lerp(leafLight, side * 0.9);
      return jitter(_c, p, 0.3);
    };
    const leafSway = (p) => Math.pow(p.y / H, 2) * 1.2 + 0.08;
    for (let i = 0; i < nClusters; i++) {
      const t = i / Math.max(1, nClusters - 1);
      const c = new THREE.Vector3(
        center.x + (rng() - 0.5) * 1.8,
        lod === 2 ? H * 0.7 : H * (0.5 + 0.45 * t),
        (rng() - 0.5) * 1.8,
      );
      const r = (lod === 2 ? 2.6 : lod ? 1.9 : 1.15 + rng() * 0.45) * (1.1 - t * 0.35);
      const blob = new THREE.IcosahedronGeometry(r * (lod ? 1 : 0.7), 0);
      b.add(blob, {
        matrix: mat(c.x, c.y, c.z, rng(), rng() * 6, 0, 1, 1.25, 1),
        normal: (p, n) => n.multiplyScalar(0.3).addScaledVector(_v.copy(p).sub(center).normalize(), 0.7).normalize(),
        color: (p) => leafColor(p).multiplyScalar(0.75),
        sway: leafSway,
      });
      if (!lod) {
        for (let k = 0; k < 16; k++) {
          const d = new THREE.Vector3(rng() * 2 - 1, rng() * 2.4 - 1.1, rng() * 2 - 1).normalize();
          const pc = c.clone().addScaledVector(d, r * (0.65 + rng() * 0.45));
          const n = pc.clone().sub(center).normalize();
          n.y += 0.3;
          n.normalize();
          b.leaf(pc, 0.7, n, leafColor(pc).clone(), leafSway(pc), rng);
        }
      }
    }
    return b.build();
  };
  return { lod0: build(0), lod1: build(1), lod2: build(2), height: 12, trunkRadius: 0.2 };
}

// ── Bush ───────────────────────────────────────────────────────────────────
export function makeBush(seed = 4) {
  const lod0 = buildBush(seed, true);
  const lod1 = buildBush(seed, false);
  return { lod0, lod1, lod2: lod1, height: 1.2, trunkRadius: 0 };
}

function buildBush(seed, cards) {
  const rng = mulberry32(seed);
  const b = new GeoBuilder();
  const dark = lin(0x1c3412);
  const light = lin(0x55762a);
  const center = new THREE.Vector3(0, 0.45, 0);
  const color = (p) => {
    const t = Math.min(1, Math.max(0, p.y / 1.2));
    return jitter(_c.copy(dark).lerp(light, t), p, 0.3);
  };
  const sway = (p) => Math.max(0, p.y) * 0.12;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rng();
    const c = new THREE.Vector3(Math.cos(a) * 0.4, 0.4 + rng() * 0.35, Math.sin(a) * 0.4);
    const r = 0.45 + rng() * 0.25;
    b.add(new THREE.IcosahedronGeometry(r * (cards ? 1 : 1.12), 0), {
      matrix: mat(c.x, c.y, c.z, rng(), rng() * 6, 0, 1, 0.8, 1),
      normal: (p, n) => n.multiplyScalar(0.3).addScaledVector(_v.copy(p).sub(center).normalize(), 0.7).normalize(),
      color: (p) => color(p).multiplyScalar(0.75),
      sway,
    });
    for (let k = 0; k < (cards ? 12 : 0); k++) {
      const d = new THREE.Vector3(rng() * 2 - 1, rng() * 1.6 - 0.4, rng() * 2 - 1).normalize();
      const pc = c.clone().addScaledVector(d, r * (0.75 + rng() * 0.4));
      const n = pc.clone().sub(center).normalize();
      b.leaf(pc, 0.42, n, color(pc).clone(), sway(pc), rng);
    }
  }
  return b.build();
}

// ── Fern ───────────────────────────────────────────────────────────────────
export function makeFern(seed = 5) {
  const rng = mulberry32(seed);
  const b = new GeoBuilder();
  const base = lin(0x1e3a12);
  const tip = lin(0x5e8a2a);
  const fronds = 9;
  const segs = 6;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rng() * 0.4;
    const L = 0.75 + rng() * 0.4;
    const lift = 0.55 + rng() * 0.35;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const ids = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const c = dir.clone().multiplyScalar(L * t);
      c.y = Math.sin(t * Math.PI * 0.85) * lift * L * 0.7;
      const w = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.16 * L;
      const n = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -0.2).normalize();
      const col = _c.copy(base).lerp(tip, t).multiplyScalar(0.9 + rng() * 0.2).clone();
      const sway = t * t * 0.25;
      ids.push(b.vertex(c.clone().addScaledVector(side, w), n, col, sway));
      ids.push(b.vertex(c.clone().addScaledVector(side, -w), n, col, sway));
    }
    for (let s = 0; s < segs; s++) {
      const i = s * 2;
      b.idx.push(ids[i], ids[i + 1], ids[i + 2], ids[i + 1], ids[i + 3], ids[i + 2]);
    }
  }
  const g = b.build();
  return { lod0: g, lod1: g, lod2: g, height: 0.8, trunkRadius: 0 };
}

// ── Rock ───────────────────────────────────────────────────────────────────
export function makeRock(seed = 6) {
  const noise = createSimplex2(seed);
  const b = new GeoBuilder();
  const stone = lin(0x77736b);
  const dark = lin(0x3d3a36);
  const moss = lin(0x3b5220);
  const geo = new THREE.IcosahedronGeometry(1, 1); // already non-indexed: flat facets
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i);
    const k = 1 + noise(_v.x * 1.3 + _v.y, _v.z * 1.3 - _v.y) * 0.22 + noise(_v.x * 3 + 5, _v.z * 3 + _v.y * 2) * 0.08;
    _v.multiplyScalar(k);
    _v.y = _v.y * 0.62 + 0.18;
    pos.setXYZ(i, _v.x, _v.y, _v.z);
  }
  geo.computeVertexNormals(); // flat facets: chunky, chiselled
  b.add(geo, {
    color: (p, n) => {
      _c.copy(dark).lerp(stone, Math.min(1, Math.max(0, p.y + 0.4)));
      if (n.y > 0.55) _c.lerp(moss, Math.min(1, (n.y - 0.55) * 2.6));
      return jitter(_c, p, 0.3);
    },
  });
  const g = b.build();
  return { lod0: g, lod1: g, lod2: g, height: 1, trunkRadius: 0.9 };
}

// ── Fallen log ─────────────────────────────────────────────────────────────
export function makeLog(seed = 7) {
  const b = new GeoBuilder();
  const bark = lin(0x4a3627);
  const dark = lin(0x1f1610);
  const moss = lin(0x40581f);
  const wood = lin(0x9c7a52);
  const L = 4.5;
  const cyl = new THREE.CylinderGeometry(0.28, 0.34, L, 7, 3, false);
  b.add(cyl, {
    matrix: mat(0, 0.22, 0, 0, 0, Math.PI / 2),
    deform: (p) => {
      p.x += Math.sin(p.y * 0.9) * 0.06;
    },
    color: (p, n) => {
      if (Math.abs(n.x) > 0.9) return jitter(_c.copy(wood), p, 0.2); // cut ends
      _c.copy(dark).lerp(bark, Math.min(1, (p.y + 0.05) * 2.2));
      if (n.y > 0.45) _c.lerp(moss, (n.y - 0.45) * 1.6);
      return jitter(_c, p, 0.3);
    },
  });
  const g = b.build();
  return { lod0: g, lod1: g, lod2: g, height: 0.6, trunkRadius: 0 };
}
