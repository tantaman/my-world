// The plants of other countries than the forest (country.js): a coconut
// palm and an ironwood for a tropical shore, a tree fern for the wet woods
// above it, a silversword for the cinder at the top of the mountain. Built
// the way the forest's own are (models.js): from primitives, with baked
// vertex colours and a sway weight for the wind, each as { lod0, lod1, lod2 }.

import * as THREE from 'three';
import { mulberry32, phash } from '../noise.js';
import { GeoBuilder, mat, jitter, barkColor, lin } from './models.js';

const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// A frond: a strip that arches out from `from` along `dir` and droops at the
// end, wider in the middle, greener at the tip.
//   L       its length
//   rise    how far it lifts before it falls (as a share of L)
//   droop   how far the tip hangs (as a share of L)
//   width   at its widest
//   sway    how much the tip moves in the wind
function frond(b, from, dir, { L, rise, droop, width, segs, base, tip, sway, rng }) {
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const ids = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const c = from.clone().addScaledVector(dir, L * (t - 0.12 * t * t));
    c.y += L * (rise * Math.sin(t * Math.PI * 0.75) - droop * t * t);
    const w = Math.sin(Math.min(1, 0.12 + t * 1.02) * Math.PI) * width * 0.5;
    // lit from above, the way the fall of it faces
    const n = new THREE.Vector3(0, 1, 0).addScaledVector(dir, 0.35 * (t - 0.4)).normalize();
    const col = _c.copy(base).lerp(tip, t).multiplyScalar(0.85 + rng() * 0.3).clone();
    const sw = sway * t * t;
    // a shallow V along the midrib, so it catches the light on one side
    const keel = w * 0.35;
    ids.push(b.vertex(c.clone().addScaledVector(side, w).setY(c.y + keel), n, col, sw, true));
    ids.push(b.vertex(c.clone().addScaledVector(side, -w).setY(c.y + keel), n, col, sw, true));
    ids.push(b.vertex(c, n, col.clone().multiplyScalar(0.8), sw, true));
  }
  for (let s = 0; s < segs; s++) {
    // two faces either side of the midrib
    const [l0, r0, m0, l1, r1, m1] = ids.slice(s * 3, s * 3 + 6);
    b.idx.push(l0, m0, l1, m0, m1, l1, m0, r0, m1, r0, r1, m1);
  }
}

// ── Coconut palm ───────────────────────────────────────────────────────────
export function makePalm(seed = 81) {
  const H = 8.5;
  const build = (lod) => {
    const rng = mulberry32(seed);
    const b = new GeoBuilder();
    const barkA = lin(0x8a7a66);
    const barkD = lin(0x4a3f33);
    const leafDark = lin(0x2a521f);
    const leafTip = lin(0x7fa234);
    // where the trunk is at height y: it leans, and straightens towards the top
    const lean = (y) => {
      const t = Math.max(0, y) / H;
      return [0.9 * (t * t * 0.4 + t * 0.6) - 0.25 * Math.sin(t * Math.PI), 0.25 * t * t];
    };
    const trunk = new THREE.CylinderGeometry(0.11, 0.17, H + 0.4, lod === 2 ? 3 : lod ? 4 : 7, lod ? 3 : 8, true);
    trunk.translate(0, (H + 0.4) / 2 - 0.4, 0);
    b.add(trunk, {
      deform: (p) => {
        if (p.y < 0.5) {
          const f = 1 + (0.5 - p.y) * 0.9; // a swollen foot
          p.x *= f;
          p.z *= f;
        }
        const [lx, lz] = lean(p.y);
        p.x += lx;
        p.z += lz;
      },
      // ringed where old fronds fell away
      color: (p) => barkColor(barkA, barkD, p, 2).multiplyScalar(0.82 + 0.3 * Math.abs(Math.sin(p.y * 7))),
      sway: (p) => Math.pow(Math.max(0, p.y) / H, 2) * 0.5,
    });
    const [tx, tz] = lean(H);
    const top = new THREE.Vector3(tx, H - 0.05, tz);
    const fronds = lod === 2 ? 5 : lod ? 7 : 11;
    for (let f = 0; f < fronds; f++) {
      const a = (f / fronds) * Math.PI * 2 + rng() * 0.5;
      const up = f % 3 === 0 ? 0.42 : 0.2 + rng() * 0.12; // some stand, most arch out
      frond(b, top, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), {
        L: 3.1 + rng() * 0.7,
        rise: up,
        droop: 0.62 - up * 0.5 + rng() * 0.12,
        width: lod ? 1.15 : 0.95,
        segs: lod === 2 ? 2 : lod ? 3 : 6,
        base: leafDark,
        tip: leafTip,
        sway: 1.1,
        rng,
      });
    }
    if (!lod) {
      const nut = lin(0x4b4a1c);
      for (let k = 0; k < 5; k++) {
        const a = k * 1.3 + rng();
        b.add(new THREE.IcosahedronGeometry(0.14, 0), { matrix: mat(top.x + Math.cos(a) * 0.2, top.y - 0.22 - rng() * 0.1, top.z + Math.sin(a) * 0.2), color: (p) => jitter(nut, p, 0.3), sway: () => 0.5 });
      }
    }
    return b.build();
  };
  return { lod0: build(0), lod1: build(1), lod2: build(2), height: H, trunkRadius: 0.17 };
}

// ── Ironwood (casuarina) ───────────────────────────────────────────────────
// A tall, loose, grey-green tree of the shore: its "needles" hang in soft
// sprays, so it's built of thin drooping tufts rather than tiers.
export function makeIronwood(seed = 83) {
  const H = 13;
  const build = (lod) => {
    const rng = mulberry32(seed);
    const b = new GeoBuilder();
    const barkA = lin(0x6b5a4c);
    const barkD = lin(0x2c231c);
    const dark = lin(0x2e4030);
    const mid = lin(0x4d6646);
    const light = lin(0x8ba07a);
    const trunkH = H * 0.92;
    const trunk = new THREE.CylinderGeometry(0.05, 0.26, trunkH, lod === 2 ? 3 : lod ? 4 : 6, lod ? 1 : 4, true);
    trunk.translate(0, trunkH / 2 - 0.4, 0);
    const bend = (y) => Math.sin((y / H) * 2.2 + 0.4) * 0.35 * (y / H);
    b.add(trunk, {
      deform: (p) => {
        p.x += bend(p.y);
        if (p.y < 0.3) {
          const f = 1 + (0.3 - p.y) * 0.6;
          p.x *= f;
          p.z *= f;
        }
      },
      color: (p) => barkColor(barkA, barkD, p, 4),
      sway: (p) => Math.pow(Math.max(0, p.y) / H, 2) * 0.45,
    });
    const tufts = lod === 2 ? 4 : lod ? 7 : 16;
    for (let i = 0; i < tufts; i++) {
      const t = (i + 0.5) / tufts;
      const y = H * (0.3 + 0.68 * t);
      const reach = (2.3 - 1.7 * t) * (0.75 + rng() * 0.5);
      const a = i * 2.4 + rng() * 0.8;
      const c = new THREE.Vector3(bend(y) + Math.cos(a) * reach * 0.55, y, Math.sin(a) * reach * 0.55);
      const r = (lod === 2 ? 1.9 : lod ? 1.45 : 1.05) * (1.1 - 0.5 * t) * (0.85 + rng() * 0.3);
      const ts = Math.floor(rng() * 1000);
      b.add(new THREE.IcosahedronGeometry(r, 0), {
        // taller than wide, and hanging: the bottom drawn down and in
        matrix: mat(c.x, c.y, c.z, 0, rng() * 6, 0, 1, 1.25, 1),
        deform: (p) => {
          const k = 1 + (phash(Math.round(p.x * 9), Math.round(p.y * 9) + ts, Math.round(p.z * 9)) - 0.5) * 0.4;
          p.multiplyScalar(k);
          if (p.y < 0) {
            p.x *= 0.6;
            p.z *= 0.6;
            p.y *= 1.35;
          }
        },
        normal: (p, n) => n.multiplyScalar(0.3).addScaledVector(new THREE.Vector3(p.x - bend(p.y), 0.6, p.z).normalize(), 0.7).normalize(),
        color: (p) => {
          const out = Math.min(1, Math.hypot(p.x - bend(p.y), p.z) / 2.2);
          _c.copy(dark).lerp(mid, Math.min(1, out * 1.3 + (p.y - y) * 0.25 + 0.2));
          if (p.y > y) _c.lerp(light, Math.min(1, (p.y - y) / r) * 0.5);
          return jitter(_c.multiplyScalar(0.7 + 0.3 * t), p, 0.25);
        },
        sway: (p) => Math.pow(p.y / H, 2) * 0.9 + 0.08,
        leaf: true,
      });
      if (!lod) {
        // the sprays that hang off it
        for (let k = 0; k < 7; k++) {
          const d = new THREE.Vector3(rng() * 2 - 1, -0.2 - rng() * 0.9, rng() * 2 - 1).normalize();
          const pc = c.clone().addScaledVector(d, r * (0.8 + rng() * 0.5));
          b.leaf(pc, 0.7, UP, _c.copy(mid).lerp(light, rng() * 0.6).multiplyScalar(0.7 + 0.3 * t).clone(), Math.pow(pc.y / H, 2) + 0.15, rng);
        }
      }
    }
    return b.build();
  };
  return { lod0: build(0), lod1: build(1), lod2: build(2), height: H, trunkRadius: 0.26 };
}

// ── Tree fern (hāpuʻu) ─────────────────────────────────────────────────────
// A fern on a short, thick, shaggy trunk, its fronds as long as you are tall.
export function makeTreeFern(seed = 85) {
  const build = (lod) => {
    const rng = mulberry32(seed);
    const b = new GeoBuilder();
    const fibre = lin(0x4a2f1c);
    const fibreD = lin(0x2e2015);
    const base = lin(0x284a1e);
    const tip = lin(0x6c9a2e);
    const trunkH = 1.5;
    const trunk = new THREE.CylinderGeometry(0.2, 0.16, trunkH + 0.3, lod ? 4 : 6, 1, true);
    trunk.translate(0, (trunkH + 0.3) / 2 - 0.3, 0);
    b.add(trunk, { color: (p) => barkColor(fibre, fibreD, p, 1.2), sway: () => 0 });
    const top = new THREE.Vector3(0, trunkH - 0.05, 0);
    const fronds = lod ? 6 : 10;
    for (let f = 0; f < fronds; f++) {
      const a = (f / fronds) * Math.PI * 2 + rng() * 0.5;
      frond(b, top, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), {
        L: 1.7 + rng() * 0.5,
        rise: 0.3 + rng() * 0.2,
        droop: 0.35 + rng() * 0.2,
        width: lod ? 0.85 : 0.7,
        segs: lod ? 2 : 5,
        base,
        tip,
        sway: 0.35,
        rng,
      });
    }
    return b.build();
  };
  const lod1 = build(1);
  return { lod0: build(0), lod1, lod2: lod1, height: 2.4, trunkRadius: 0.2 };
}

// ── Silversword (ʻāhinahina) ───────────────────────────────────────────────
// A ball of silver blades, knee high, alone on the cinder.
export function makeSilversword(seed = 87) {
  const build = (lod) => {
    const rng = mulberry32(seed);
    const b = new GeoBuilder();
    const core = lin(0x7f8f7a);
    const silver = lin(0xcfd8cb);
    const blades = lod ? 26 : 60;
    const R = 0.34;
    for (let i = 0; i < blades; i++) {
      // spread over the upper two thirds of a ball
      const y = 1 - (i / blades) * 1.45;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const a = i * 2.39996 + rng() * 0.2;
      const d = new THREE.Vector3(Math.cos(a) * ring, y * 0.75 + 0.32, Math.sin(a) * ring).normalize();
      const len = R * (0.85 + rng() * 0.3);
      const side = new THREE.Vector3().crossVectors(d, UP).normalize().multiplyScalar(0.022 + rng() * 0.012);
      const root = new THREE.Vector3(0, 0.16, 0).addScaledVector(d, 0.05);
      const end = new THREE.Vector3(0, 0.16, 0).addScaledVector(d, len);
      const n = d.clone().lerp(UP, 0.5).normalize();
      const shade = 0.75 + rng() * 0.35;
      const c0 = _c.copy(core).multiplyScalar(shade).clone();
      const c1 = _c.copy(silver).multiplyScalar(shade).clone();
      const i0 = b.vertex(root.clone().add(side), n, c0, 0, true);
      const i1 = b.vertex(root.clone().sub(side), n, c0, 0, true);
      const i2 = b.vertex(end, n, c1, 0.03, true);
      b.idx.push(i0, i1, i2);
    }
    return b.build();
  };
  const lod1 = build(1);
  return { lod0: build(0), lod1, lod2: lod1, height: 0.5, trunkRadius: 0 };
}
