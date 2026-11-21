// Procedural vegetation models. Everything is built from primitives with
// baked vertex colours (including a little fake ambient occlusion: the real
// thing is done on the picture, render/pipeline.js), a per-vertex "sway"
// weight that drives the wind shader, whether it's a leaf (aLeaf), which lets
// sunlight through it from behind, and what sort of surface it is and where
// on it (aCard, foliage.js): the needles and leaves are cut out of flat cards
// by the shader, and bark is furrowed there too.
//
// A tree is built the way one grows: a trunk, branches off it (in whorls on
// a conifer; limbs and their branches on a broadleaf), and on the branches
// cards carrying sprays of needles or clusters of leaves. Inside the crown
// there's a ragged core (CARD.FILL), so you can't see straight through it.
//
// The colours are what the thing reflects, in linear light, and are kept near
// what real ones do: needles and dark bark about 2-5 %, leaves 5-20 % in the
// green, birch bark over half. Darker than that and shade goes black.
//
// Each builder returns { lod0, lod1, lod2 } geometries sharing the same
// attributes so instanced meshes can swap between them as you walk: lod0
// close by (the whole tree, every card), lod1 further (fewer, bigger cards),
// lod2 far off (a ragged silhouette).

import * as THREE from 'three';
import { mulberry32, createSimplex2, phash } from '../noise.js';
import { CARD } from './foliage.js';

const _v = new THREE.Vector3(); // scratch for callbacks
const _gv = new THREE.Vector3(); // builder-internal
const _gn = new THREE.Vector3();
const _guv = new THREE.Vector2();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _a = new THREE.Vector3(); // card builder
const _b = new THREE.Vector3();
const _cn = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const NO_CARD = [0, 0, 0, CARD.SOLID];

export const lin = (hex) => new THREE.Color(hex); // sRGB hex -> linear colour

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.sway = [];
    this.leafy = [];
    this.cards = [];
    this.idx = [];
    this.count = 0;
  }

  // Append a three.js geometry, transformed by `matrix`.
  //   deform(p, n)   local-space tweak before the matrix
  //   normal(p, n)   world-space normal override after the matrix
  //   color(p, n)    -> THREE.Color (linear)
  //   sway(p)        -> number
  //   leaf           true for foliage: it lets the light through
  //   card(p, n, uv) -> [x, y, length, sort], or one for all (foliage.js)
  add(geo, { matrix = _m.identity(), deform, normal, color, sway, leaf = false, card = NO_CARD }) {
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const uv = geo.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const base = this.count;
    for (let i = 0; i < pos.count; i++) {
      _gv.fromBufferAttribute(pos, i);
      _gn.fromBufferAttribute(nor, i);
      if (uv) _guv.fromBufferAttribute(uv, i);
      if (deform) deform(_gv, _gn);
      _gv.applyMatrix4(matrix);
      _gn.applyMatrix3(nm).normalize();
      if (normal) normal(_gv, _gn);
      this.pos.push(_gv.x, _gv.y, _gv.z);
      this.nor.push(_gn.x, _gn.y, _gn.z);
      const c = color(_gv, _gn);
      this.col.push(c.r, c.g, c.b);
      this.sway.push(sway ? sway(_gv) : 0);
      this.leafy.push(leaf ? 1 : 0);
      this.cards.push(...(typeof card === 'function' ? card(_gv, _gn, _guv) : card));
      this.count++;
    }
    if (geo.index) {
      for (let i = 0; i < geo.index.count; i++) this.idx.push(base + geo.index.getX(i));
    } else {
      for (let i = 0; i < pos.count; i++) this.idx.push(base + i);
    }
    geo.dispose();
  }

  vertex(p, n, c, sway, leaf = false, card = NO_CARD) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.col.push(c.r, c.g, c.b);
    this.sway.push(sway);
    this.leafy.push(leaf ? 1 : 0);
    this.cards.push(...card);
    return this.count++;
  }

  // A card: a strip len m long whose middle runs along spine(t, out) (t: 0
  // where it grows .. 1 at its tip), halfW m either side of it along `side`,
  // in segs pieces along its length so it can bend. The shader cuts `sort`
  // out of it. normal(p, out) is how it's lit there; color(t), sway(p).
  card({ spine, side, len, halfW, segs = 1, sort, normal, color, sway }) {
    const first = this.count;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      spine(t, _a);
      const c = color(t);
      for (const k of [-1, 1]) {
        _b.copy(_a).addScaledVector(side, halfW * k);
        normal(_b, _cn);
        this.vertex(_b, _cn, c, sway(_b), true, [t * len, k * halfW, len, sort]);
      }
    }
    for (let s = 0; s < segs; s++) {
      const i = first + s * 2;
      this.idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
  }

  // A leaf card about size m across, turned a random way, at center.
  leaf(center, size, normal, color, sway, rng, sort = CARD.LEAVES) {
    const d = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
    const u = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).normalize();
    const w = new THREE.Vector3().crossVectors(d, u).normalize();
    const len = size * (1.2 + rng() * 0.4);
    const from = center.clone().addScaledVector(u, -len / 2);
    this.card({
      spine: (t, out) => out.copy(from).addScaledVector(u, t * len),
      side: w,
      len,
      halfW: len * 0.42,
      sort,
      normal: (p, out) => out.copy(normal),
      color: () => color,
      sway: () => sway,
    });
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(this.leafy, 1));
    g.setAttribute('aCard', new THREE.Float32BufferAttribute(this.cards, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export function mat(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

export function jitter(c, p, amt) {
  const j = 1 + (phash(p.x, p.y, p.z) - 0.5) * amt;
  return _c.copy(c).multiplyScalar(j);
}

// ── Bark ───────────────────────────────────────────────────────────────────
export function barkColor(base, dark, p, height) {
  const t = Math.min(1, Math.max(0, p.y / height));
  _c.copy(dark).lerp(base, Math.min(1, t * 3 + 0.15));
  return _c.multiplyScalar(0.85 + phash(p.x * 3, p.y * 7, p.z * 3) * 0.3);
}

// What a trunk's bark is, for the shader: round it, how high (m), and how
// many furrows (or columns of marks) go round it.
export const barkCard = (sort, furrows) => (p, n, uv) => [uv.x, p.y, furrows, sort];

// A limb: a tapering cylinder from `from`, len m along dir, r0 thick at its
// foot and r1 at its tip, with bark.
function limb(b, from, dir, len, r0, r1, { sides = 4, segs = 1, color, sway, sort = CARD.BARK, furrows = 12 }) {
  const geo = new THREE.CylinderGeometry(r1, r0, len, sides, segs, true);
  geo.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, _v.copy(dir).normalize());
  const m = new THREE.Matrix4().compose(from, q, _s.set(1, 1, 1));
  const y0 = from.y;
  b.add(geo, { matrix: m, color, sway, card: (p, n, uv) => [uv.x, y0 + uv.y * len, furrows, sort] });
}

// The way a crown is lit: out from its middle (`center`), with a little of
// the card's own face in it, so a crown shades as a soft volume.
function crownNormal(center, squash = 1, up = 0.25) {
  return (p, out) => {
    out.set(p.x - center.x, (p.y - center.y) * squash, p.z - center.z);
    if (out.lengthSq() < 1e-6) out.set(0, 1, 0);
    out.normalize();
    out.y += up;
    return out.normalize();
  };
}

// A ragged core for a crown: an icosahedron, squashed, its surface cut
// full of holes (CARD.FILL).
function core(b, center, r, { sy = 1, color, sway, detail = 1, normal }) {
  b.add(new THREE.IcosahedronGeometry(r, detail), {
    matrix: mat(center.x, center.y, center.z, 0, 0, 0, 1, sy, 1),
    normal,
    color,
    sway,
    leaf: true,
    card: [0, 0, 0, CARD.FILL],
  });
}

// ── Conifer ────────────────────────────────────────────────────────────────
// A spruce-like tree: a straight trunk, whorls of branches all the way up,
// longest at the bottom, drooping low down and lifting at their tips, each a
// flat spray of needles with another across it so the crown has depth from
// every side; a dark, dense core round the trunk.
export function makePine(seed = 1) {
  const H = 15;
  const R = 0.32;
  const build = (lod) => {
    const rng = mulberry32(seed);
    const b = new GeoBuilder();
    const barkA = lin(0x5a3e2b);
    const barkD = lin(0x3a2a1e);
    const needleDark = lin(0x22382a);
    const needleMid = lin(0x2a4630);
    const needleTip = lin(0x3d5b38);
    const trunkSway = (p) => Math.pow(Math.max(0, p.y) / H, 2) * 0.35;
    const crownSway = (p) => Math.pow(p.y / H, 2) + Math.hypot(p.x, p.z) * 0.06;

    const trunkH = H * 0.97;
    const trunk = new THREE.CylinderGeometry(0.035, R, trunkH, lod === 2 ? 4 : lod ? 6 : 9, lod ? 1 : 5, true);
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
      sway: trunkSway,
      card: barkCard(CARD.BARK, 26),
    });

    const crownBase = 2.4;
    const top = H - 0.7;
    const radius = (y) => R * (1 - (y + 0.4) / trunkH) + 0.035;
    const reachAt = (t) => 3.0 * Math.pow(1 - t, 0.9) + 0.3;
    const fillColor = (p) => jitter(_c.copy(needleDark).multiplyScalar(0.8), p, 0.2);
    const fillNormal = (p, n) => {
      const out = _v.set(p.x, 0, p.z);
      if (out.lengthSq() > 1e-6) out.normalize();
      out.y = 0.6;
      n.copy(out.normalize());
    };

    if (lod === 2) {
      // far off: tiers, ragged at their edges
      for (let i = 0; i < 3; i++) {
        const t = i / 2;
        const y = H * (0.2 + 0.6 * t);
        const r = (3.2 - 2.5 * Math.pow(t, 0.85)) * (0.9 + rng() * 0.2);
        const h = 7.2 - 1.5 * t;
        const cone = new THREE.ConeGeometry(r, h, 7, 1, true);
        cone.translate(0, h / 2, 0);
        b.add(cone, {
          matrix: mat(0, y, 0, 0, rng() * 6, 0),
          normal: fillNormal,
          color: (p) => jitter(_c.copy(needleMid).lerp(needleDark, 0.4), p, 0.2),
          sway: crownSway,
          leaf: true,
          card: [0, 0, 0, CARD.FILL],
        });
      }
      return b.build();
    }

    // the thick of the crown round the trunk, dark: it's what you'd see
    // between the branches
    const coreH = top - crownBase - 1.5;
    const coreCone = new THREE.ConeGeometry(reachAt(0) * 0.42, coreH, lod ? 6 : 9, lod ? 1 : 3, true);
    coreCone.translate(0, crownBase + coreH / 2, 0);
    b.add(coreCone, { normal: fillNormal, color: fillColor, sway: crownSway, leaf: true, card: [0, 0, 0, CARD.FILL] });

    const whorls = lod ? 8 : 15;
    for (let i = 0; i < whorls; i++) {
      const t = i / (whorls - 1);
      const y = crownBase + (top - crownBase) * Math.pow(t, 0.95);
      const reach = reachAt(t) * (0.88 + rng() * 0.24) * (lod ? 1.08 : 1);
      const n = lod ? 4 : t > 0.8 ? 4 : 5;
      const a0 = rng() * Math.PI * 2;
      const ao = 0.72 + 0.28 * t;
      for (let j = 0; j < n; j++) {
        const a = a0 + (j / n) * Math.PI * 2 + (rng() - 0.5) * 0.5;
        const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const across = new THREE.Vector3(-out.z, 0, out.x);
        const slope = THREE.MathUtils.lerp(-0.3, 0.3, t) + (rng() - 0.5) * 0.15;
        const lift = reach * 0.14; // the tip turns up
        const sag = reach * 0.08;
        const from = out.clone().multiplyScalar(radius(y) * 0.4).setY(y);
        const spine = (s, o) =>
          o
            .copy(from)
            .addScaledVector(out, reach * s)
            .addScaledVector(UP, reach * slope * s + lift * Math.pow(s, 2.4) - sag * Math.sin(Math.PI * s));
        const tint = 0.9 + rng() * 0.2;
        const color = (s) => _c.copy(needleDark).lerp(needleMid, Math.min(1, s * 1.6)).lerp(needleTip, Math.max(0, s - 0.55) * 1.6).multiplyScalar(ao * tint).clone();
        const normal = (p, o) => {
          o.set(p.x, 0, p.z);
          const l = o.length();
          if (l > 1e-4) o.multiplyScalar(1 / l);
          o.y = 0.7;
          return o.normalize();
        };
        // the spray, lying nearly flat; and another under it, tipped down
        // on one side, so the branch has some thickness seen side on
        const roll = (rng() - 0.5) * 0.7;
        const flat = across.clone().applyAxisAngle(out, roll);
        const halfW = reach * 0.29 + 0.04;
        b.card({ spine, side: flat, len: reach, halfW, segs: lod ? 1 : 2, sort: CARD.SPRAY, normal, color, sway: crownSway });
        if (t < 0.92) {
          const tipped = across.clone().applyAxisAngle(out, roll + (rng() < 0.5 ? 1 : -1) * (0.55 + rng() * 0.35));
          const under = (s, o) => spine(s, o).addScaledVector(UP, -0.12 * reach * Math.sin(Math.PI * s));
          b.card({ spine: under, side: tipped, len: reach * 0.9, halfW: halfW * 0.85, segs: 1, sort: CARD.SPRAY, normal, color: (s) => color(s).multiplyScalar(0.85), sway: crownSway });
        }
      }
    }
    // the leader: a spray or two pointing straight up
    for (let k = 0; k < 2; k++) {
      const side = new THREE.Vector3(Math.cos(k * 1.6), 0, Math.sin(k * 1.6));
      const from = new THREE.Vector3(0, top - 0.3, 0);
      b.card({
        spine: (s, o) => o.copy(from).addScaledVector(UP, 1.4 * s),
        side,
        len: 1.4,
        halfW: 0.32,
        sort: CARD.SPRAY,
        normal: (p, o) => o.set(side.z, 0.8, -side.x).normalize(),
        color: (s) => _c.copy(needleMid).lerp(needleTip, s).clone(),
        sway: crownSway,
      });
    }
    return b.build();
  };
  return { lod0: build(0), lod1: build(1), lod2: build(2), height: 15, trunkRadius: R };
}

// ── Broadleaf (oak / beech-ish) ────────────────────────────────────────────
// A short trunk dividing into four limbs that reach up and out, each with
// branches, and clusters of leaves all over the outside of a broad crown; a
// ragged core inside it.
export function makeBroadleaf(seed = 2) {
  const H = 11;
  const R = 0.4;
  const build = (lod) => {
    const rng = mulberry32(seed);
    const b = new GeoBuilder();
    const barkA = lin(0x5d4a3a);
    const barkD = lin(0x3e3226);
    const leafDark = lin(0x2c451d);
    const leafMid = lin(0x3c5f1d);
    const leafLight = lin(0x597930);
    const trunkH = 4.6;
    const center = new THREE.Vector3(0, 7.4, 0);
    const radii = new THREE.Vector3(3.7, 2.8, 3.7);
    const woodSway = (p) => Math.pow(Math.max(0, p.y) / H, 2) * 0.45;
    const leafSway = (p) => Math.pow(p.y / H, 2) * 0.9 + 0.05;
    const bark = (p) => barkColor(barkA, barkD, p, 3);
    const lean = (y) => [Math.sin((y / trunkH) * 2.6 + 1) * 0.16 * (y / trunkH), Math.cos((y / trunkH) * 1.9) * 0.12 * (y / trunkH)];

    const trunk = new THREE.CylinderGeometry(0.26, R, trunkH + 0.4, lod === 2 ? 5 : lod ? 6 : 9, lod ? 1 : 4, true);
    trunk.translate(0, (trunkH + 0.4) / 2 - 0.4, 0);
    b.add(trunk, {
      deform: (p) => {
        const [lx, lz] = lean(p.y);
        p.x += lx;
        p.z += lz;
        if (p.y < 0.5) {
          const f = 1 + (0.5 - p.y) * 0.8;
          p.x *= f;
          p.z *= f;
        }
      },
      color: bark,
      sway: woodSway,
      card: barkCard(CARD.BARK, 30),
    });

    const crownNorm = crownNormal(center, radii.x / radii.y);
    const leafColor = (p) => {
      const h = (p.y - (center.y - radii.y)) / (radii.y * 2);
      const side = _v.copy(p).sub(center).normalize().y * 0.5 + 0.5;
      _c.copy(leafDark).lerp(leafMid, Math.min(1, h * 1.3));
      if (side > 0.6) _c.lerp(leafLight, (side - 0.6) * 1.1);
      return jitter(_c, p, 0.3);
    };
    const coreColor = (p) => leafColor(p).multiplyScalar(0.72);

    if (lod === 2) {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + rng();
        const c = new THREE.Vector3(Math.cos(a) * 1.1, center.y + (i === 2 ? 0.9 : -0.2), Math.sin(a) * 1.1);
        core(b, c, 2.9, { sy: 0.85, color: coreColor, sway: leafSway, detail: 0, normal: crownNorm });
      }
      return b.build();
    }

    // the core, a little inside where the leaves are
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + rng();
      const c = new THREE.Vector3(Math.cos(a) * 1.2, center.y + (rng() - 0.4) * 1.2, Math.sin(a) * 1.2);
      core(b, c, lod ? 2.6 : 2.2, { sy: 0.8, color: coreColor, sway: leafSway, detail: lod ? 0 : 1, normal: crownNorm });
    }

    // limbs, and branches off them
    const ends = []; // where the branches end, for the leaves to gather round
    const limbs = 4;
    const [tx, tz] = lean(trunkH);
    for (let i = 0; i < limbs; i++) {
      const a = (i / limbs) * Math.PI * 2 + rng() * 0.7;
      const from = new THREE.Vector3(tx, trunkH - 0.9 + rng() * 0.8, tz);
      const dir = new THREE.Vector3(Math.cos(a) * (0.75 + rng() * 0.3), 1, Math.sin(a) * (0.75 + rng() * 0.3)).normalize();
      const len = 3.0 + rng() * 0.9;
      limb(b, from, dir, len, 0.19, 0.07, { sides: lod ? 4 : 5, color: bark, sway: woodSway });
      const tip = from.clone().addScaledVector(dir, len);
      ends.push(tip);
      if (lod) continue;
      for (let k = 0; k < 3; k++) {
        const at = from.clone().addScaledVector(dir, len * (0.45 + 0.2 * k));
        const ba = a + (rng() - 0.5) * 2.2;
        const bdir = new THREE.Vector3(Math.cos(ba), 0.5 + rng() * 0.6, Math.sin(ba)).normalize();
        const blen = 1.6 + rng() * 0.9;
        limb(b, at, bdir, blen, 0.065, 0.02, { sides: 3, color: bark, sway: woodSway, furrows: 5 });
        ends.push(at.clone().addScaledVector(bdir, blen));
      }
    }

    // leaves: clusters over the outside of the crown, thickest round the
    // branch ends
    const cards = lod ? 44 : 120;
    for (let k = 0; k < cards; k++) {
      let p;
      if (k < ends.length * 3) {
        p = ends[k % ends.length].clone().add(new THREE.Vector3(rng() - 0.5, rng() - 0.3, rng() - 0.5).multiplyScalar(2.0));
      } else {
        const d = new THREE.Vector3(rng() * 2 - 1, rng() * 1.7 - 0.6, rng() * 2 - 1).normalize();
        p = center.clone().add(d.multiply(radii).multiplyScalar(0.7 + rng() * 0.32));
      }
      // pull it onto the crown's outer shell
      const rel = p.clone().sub(center).divide(radii);
      const l = rel.length();
      if (l > 1.05) p.copy(center).add(rel.multiplyScalar(1.05 / l).multiply(radii));
      const outward = crownNorm(p, new THREE.Vector3());
      const axis = outward.clone().add(new THREE.Vector3(rng() - 0.5, rng() - 0.7, rng() - 0.5).multiplyScalar(1.4)).normalize();
      const side = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5)).normalize();
      const len = (lod ? 1.9 : 1.25) * (0.85 + rng() * 0.3);
      const from = p.clone().addScaledVector(axis, -len * 0.4);
      const shadeK = 0.9 + rng() * 0.2;
      b.card({
        spine: (s, o) => o.copy(from).addScaledVector(axis, len * s),
        side,
        len,
        halfW: len * 0.42,
        sort: CARD.LEAVES,
        normal: crownNorm,
        color: (s) => leafColor(from).multiplyScalar(shadeK * (0.92 + 0.12 * s)).clone(),
        sway: leafSway,
      });
    }
    return b.build();
  };
  return { lod0: build(0), lod1: build(1), lod2: build(2), height: 11, trunkRadius: R };
}

// ── Birch ──────────────────────────────────────────────────────────────────
// A slim white trunk, sinuous, marked dark; thin branches climbing off it,
// and from them long strips of small leaves hanging down.
export function makeBirch(seed = 3) {
  const H = 12;
  const R = 0.2;
  const build = (lod) => {
    const rng = mulberry32(seed);
    const b = new GeoBuilder();
    const white = lin(0xd8d2c4);
    const twig = lin(0x3a2d24);
    const leafDark = lin(0x3b5418);
    const leafLight = lin(0x688734);
    const bend = (y) => Math.sin((y / H) * 3.0) * 0.25 * (y / H);
    const woodSway = (p) => Math.pow(Math.max(0, p.y) / H, 2) * 0.6;
    const leafSway = (p) => Math.pow(p.y / H, 2) * 1.2 + 0.08;
    const trunk = new THREE.CylinderGeometry(0.05, R, H, lod === 2 ? 4 : lod ? 5 : 8, lod === 2 ? 1 : lod ? 3 : 10, true);
    trunk.translate(0, H / 2 - 0.3, 0);
    b.add(trunk, {
      deform: (p) => {
        p.x += bend(p.y + 0.3);
      },
      color: (p) => _c.copy(white).multiplyScalar(0.92 + phash(p.x, p.y, p.z) * 0.1),
      sway: woodSway,
      card: barkCard(CARD.BIRCH, 7),
    });

    const center = new THREE.Vector3(0.25, H * 0.66, 0);
    const crownNorm = crownNormal(center, 0.55);
    const leafColor = (p) => {
      const side = _v.copy(p).sub(center).normalize().y * 0.5 + 0.5;
      _c.copy(leafDark).lerp(leafLight, side * 0.9);
      return jitter(_c, p, 0.3);
    };
    // a slim core, dark, so the crown has some body behind its leaves
    core(b, center, lod === 2 ? 2.4 : 1.1, { sy: lod === 2 ? 1.5 : 2.4, color: (p) => leafColor(p).multiplyScalar(lod === 2 ? 0.8 : 0.6), sway: leafSway, detail: lod ? 0 : 1, normal: crownNorm });
    if (lod === 2) return b.build();

    const branches = lod ? 8 : 16;
    for (let i = 0; i < branches; i++) {
      const t = (i + 0.5) / branches;
      const y = H * (0.38 + 0.5 * t);
      const a = i * 2.4 + rng() * 0.6;
      const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const dir = out.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, 0.75 + rng() * 0.5, 0)).normalize();
      const len = (2.4 - 1.3 * t) * (0.85 + rng() * 0.3);
      const from = new THREE.Vector3(bend(y), y, 0);
      if (!lod) limb(b, from, dir, len, 0.04, 0.012, { sides: 3, color: () => twig, sway: woodSway, sort: CARD.SOLID });
      // the hanging strips, from the outer part of the branch
      const strips = lod ? 3 : 6;
      for (let k = 0; k < strips; k++) {
        const at = from.clone().addScaledVector(dir, len * (0.35 + 0.65 * (k / Math.max(1, strips - 1))));
        const hang = out.clone().multiplyScalar(0.3 + rng() * 0.2).add(new THREE.Vector3((rng() - 0.5) * 0.3, -1, (rng() - 0.5) * 0.3)).normalize();
        const slen = (lod ? 1.8 : 1.2) * (0.75 + rng() * 0.5);
        const side = new THREE.Vector3(-out.z, 0, out.x).applyAxisAngle(UP, (rng() - 0.5) * 0.8);
        b.card({
          spine: (s, o) => o.copy(at).addScaledVector(hang, slen * s).addScaledVector(out, 0.15 * slen * s * s),
          side,
          len: slen,
          halfW: lod ? 0.3 : 0.2,
          segs: lod ? 1 : 2,
          sort: CARD.SMALL,
          normal: crownNorm,
          color: (s) => leafColor(at).multiplyScalar(0.95 + 0.1 * s).clone(),
          sway: leafSway,
        });
      }
    }
    return b.build();
  };
  return { lod0: build(0), lod1: build(1), lod2: build(2), height: 12, trunkRadius: R };
}

// ── Bush ───────────────────────────────────────────────────────────────────
export function makeBush(seed = 4) {
  const lod0 = buildBush(seed, true);
  const lod1 = buildBush(seed, false);
  return { lod0, lod1, lod2: lod1, height: 1.2, trunkRadius: 0 };
}

// A few ragged lumps of leaf, and (close by) clusters of leaves standing out
// from them.
function buildBush(seed, cards) {
  const rng = mulberry32(seed);
  const b = new GeoBuilder();
  const dark = lin(0x2a4420);
  const light = lin(0x55762a);
  const center = new THREE.Vector3(0, 0.45, 0);
  const color = (p) => {
    const t = Math.min(1, Math.max(0, p.y / 1.2));
    return jitter(_c.copy(dark).lerp(light, t), p, 0.3);
  };
  const sway = (p) => Math.max(0, p.y) * 0.12;
  const normal = crownNormal(center, 1, 0.3);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rng();
    const c = new THREE.Vector3(Math.cos(a) * 0.4, 0.4 + rng() * 0.35, Math.sin(a) * 0.4);
    const r = 0.45 + rng() * 0.25;
    core(b, c, r * (cards ? 0.95 : 1.12), { sy: 0.8, color: (p) => color(p).multiplyScalar(0.8), sway, detail: 0, normal });
    for (let k = 0; k < (cards ? 10 : 0); k++) {
      const d = new THREE.Vector3(rng() * 2 - 1, rng() * 1.6 - 0.4, rng() * 2 - 1).normalize();
      const pc = c.clone().addScaledVector(d, r * (0.75 + rng() * 0.4));
      const n = pc.clone().sub(center).normalize();
      b.leaf(pc, 0.42, n, color(pc).clone(), sway(pc), rng);
    }
  }
  return b.build();
}

// ── Fern ───────────────────────────────────────────────────────────────────
// Fronds arching out from the middle, each cut into leaflets (CARD.FROND).
export function makeFern(seed = 5) {
  const rng = mulberry32(seed);
  const b = new GeoBuilder();
  const base = lin(0x2a4a1e);
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
      // (a little wider than the frond, so the leaflets come to its edge)
      const wc = w + 0.006;
      ids.push(b.vertex(c.clone().addScaledVector(side, wc), n, col, sway, true, [L * t, wc, L, CARD.FROND]));
      ids.push(b.vertex(c.clone().addScaledVector(side, -wc), n, col, sway, true, [L * t, -wc, L, CARD.FROND]));
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
  const dark = lin(0x4a4741);
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
  const dark = lin(0x33261b);
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
