// Pure top-down map tile renderer: no DOM, no three.js, so it runs in a Web
// Worker. It reads the same WorldGen fields the 3D world is built from, so
// the map always matches the forest: meadows, woods, footpaths, rock, water,
// and hillshaded relief with contour lines. Zoomed in far enough, it stamps
// every real tree, bush and boulder from the chunk generator.

import { generateVegetation, VEG_KINDS } from '../world/chunkGen.js';
import { hash2i, smoothstep } from '../noise.js';

export const TILE = 128; // map pixels per tile side
export const MIN_LEVEL = -1; // 0.5 m per map pixel
export const MAX_LEVEL = 3; // 8 m per map pixel (further out it's all camouflage)
// Individual trees are drawn at this level and finer.
const TREE_LEVEL = 1;

// sRGB colours, 0..1
const MEADOW = [0.42, 0.5, 0.24];
const MEADOW_DRY = [0.55, 0.54, 0.3];
const MEADOW_LUSH = [0.31, 0.45, 0.2];
const FLOOR = [0.34, 0.31, 0.2];
const MOSS = [0.26, 0.33, 0.17];
const DIRT = [0.7, 0.57, 0.39];
const DIRT_EDGE = [0.5, 0.41, 0.27];
const ROCK = [0.55, 0.53, 0.49];
const BROAD = [0.21, 0.35, 0.15];
const PINE = [0.12, 0.25, 0.18];
const BIRCH = [0.45, 0.55, 0.27];
const BUSH = [0.3, 0.41, 0.17];
const CONTOUR = [0.2, 0.15, 0.08];
const WATER = [0.36, 0.53, 0.6];
const WATER_DEEP = [0.2, 0.35, 0.47];
const WATER_EDGE = [0.25, 0.38, 0.42];

// canopy radius in meters at scale 1
const CANOPY = { pine: 2.5, broad: 3.4, birch: 2.2 };

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const LEVELS = 40;

const NO_COLLIDE = Object.fromEntries(VEG_KINDS.map((k) => [k, 0]));
const VEG_CHUNK = 64;

// Vegetation lists are cached per chunk; they are reused by neighbouring
// tiles and by the levels around them.
export function createVegCache(gen, max = 160) {
  const cache = new Map();
  return (cx, cz) => {
    const k = `${cx},${cz}`;
    let v = cache.get(k);
    if (v) {
      cache.delete(k);
      cache.set(k, v);
      return v;
    }
    v = generateVegetation(gen, cx, cz, VEG_CHUNK, NO_COLLIDE).lists;
    cache.set(k, v);
    if (cache.size > max) cache.delete(cache.keys().next().value);
    return v;
  };
}

const mix3 = (out, a, b, t) => {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
};

function contourInterval(mpp) {
  if (mpp <= 0.5) return 2;
  if (mpp <= 1) return 2.5;
  if (mpp <= 2) return 4;
  if (mpp <= 4) return 5;
  if (mpp <= 8) return 10;
  return 20;
}

// Returns RGBA pixels for tile (tx, tz) at the given level, where
// meters-per-pixel = 2^level. Pixel (i, j) covers world
// x = (tx·TILE + i)·mpp, z = (tz·TILE + j)·mpp; up is north (−z).
export function renderTile(gen, level, tx, tz, vegFor) {
  const S = TILE;
  const mpp = 2 ** level;
  const G = S + 2;
  const x0 = tx * S * mpp;
  const z0 = tz * S * mpp;
  const gi0 = tx * S;
  const gj0 = tz * S;

  // Fields, with a one-pixel border of height for shading and contours.
  // Zoomed out, the small bumps would alias into speckle: shade the broad hills.
  const broad = level >= 2;
  const H = new Float32Array(G * G);
  const PM = new Float32Array(S * S);
  const PE = new Float32Array(S * S);
  const F = new Float32Array(S * S);
  const SP = new Float32Array(S * S);
  const MO = new Float32Array(S * S);
  // water: how much of the pixel is water (0..1), and how deep (m)
  const WA = new Float32Array(S * S);
  const WD = new Float32Array(S * S);
  const water = gen.water;
  for (let gz = 0; gz < G; gz++) {
    const z = z0 + (gz - 0.5) * mpp;
    for (let gx = 0; gx < G; gx++) {
      const x = x0 + (gx - 0.5) * mpp;
      const inner = gx >= 1 && gx <= S && gz >= 1 && gz <= S;
      if (broad) {
        H[gz * G + gx] = gen.broadHeight(x, z, mpp * 5);
        if (!inner) continue;
      }
      const pm = gen.pathMask(x, z);
      // far out, only the main trails and well-trodden side trails. (Read
      // now: the first look at a lake works out its rim from the paths.)
      const pe =
        level >= 3
          ? Math.min(gen.pathEdgeMain, gen.pathSide > 0.75 ? gen.pathEdgeSide + mpp * 0.4 : 1e9)
          : Math.min(gen.pathEdgeMain, gen.pathSide > 0.35 ? gen.pathEdgeSide : 1e9);
      if (!broad) H[gz * G + gx] = gen.height(x, z, pm);
      if (inner) {
        const k = (gz - 1) * S + (gx - 1);
        // Up close, the real water (deep where the ground is far below it).
        // Further out, lines and shapes by their distance to the shore, like
        // the trails: streams only while they're more than a hair.
        if (!broad) {
          const h = H[gz * G + gx];
          const wet = water.region ? water.level - h : -1;
          WA[k] = Math.max(0, Math.min(1, 0.5 - water.edge / mpp));
          if (wet > 0) WA[k] = 1;
          WD[k] = Math.max(0, wet);
        } else {
          water.probe(x, z);
          if (water.kind !== 'stream' || level < 3) {
            const e = water.kind === 'stream' ? water.edge - mpp * 0.15 : water.edge;
            WA[k] = Math.max(0, Math.min(1, 0.5 - e / mpp));
            WD[k] = water.kind === 'lake' ? Math.min(4, -water.edge * 0.15) : 0.5;
          }
        }
        PM[k] = pm;
        PE[k] = pe;
        F[k] = gen.forest(x, z);
        SP[k] = gen.species(x, z);
        MO[k] = gen.moisture(x, z);
      }
    }
  }

  const fine = level <= TREE_LEVEL;
  const ci = contourInterval(mpp);
  // Exaggerate the gentle hills a little; less so far out, where the ridges
  // are only a few pixels wide and strong shading turns them to noise.
  const relief = level <= 2 ? 1.6 + Math.max(0, level) * 0.4 : 1.6;
  // light from the north-west, as on paper maps
  const Lx = -0.55;
  const Ly = 0.62;
  const Lz = -0.55;
  const rgb = new Float32Array(S * S * 3);
  const pathA = new Float32Array(S * S);
  const shadeA = new Float32Array(S * S);
  const c = [0, 0, 0];
  const t = [0, 0, 0];

  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const k = j * S + i;
      const g = (j + 1) * G + (i + 1);
      const h = H[g];
      const dx = (H[g + 1] - H[g - 1]) / (2 * mpp);
      const dz = (H[g + G] - H[g - G]) / (2 * mpp);
      const ny = 1 / Math.hypot(dx, 1, dz);
      const slope = 1 - ny;
      const ex = dx * relief;
      const ez = dz * relief;
      const el = Math.hypot(ex, 1, ez);
      const lit = (-ex * Lx + Ly - ez * Lz) / (el * Ly); // 1 on flat ground
      const shade = Math.min(1.22, Math.max(0.5, 1 + (lit - 1) * 1.15));
      shadeA[k] = shade;

      const gi = gi0 + i;
      const gj = gj0 + j;
      const rnd = hash2i(gi, gj, 0x51ed + level) / 4294967296;
      const f = F[k];
      const m = MO[k];

      // ground: meadow (drier where it's less moist) blending into forest floor
      mix3(c, MEADOW_DRY, MEADOW, smoothstep(0.25, 0.55, m));
      mix3(c, c, MEADOW_LUSH, smoothstep(0.6, 0.85, m) * 0.7);
      mix3(t, FLOOR, MOSS, smoothstep(0.45, 0.8, m) * 0.7);
      mix3(c, c, t, smoothstep(0.3, 0.85, f));

      // canopy, as a texture, when we're too far out to draw single trees
      if (!fine) {
        const cover = smoothstep(0.1, 0.72, f);
        const pineW = smoothstep(-0.3, 0.3, SP[k]);
        const birchW = Math.max(0, 1 - Math.abs(f - 0.4) * 2.4) * 0.5;
        mix3(t, BROAD, PINE, pineW);
        mix3(t, t, BIRCH, birchW * 0.7);
        const crown = level <= 2 ? 0.82 + rnd * 0.34 : 0.93 + rnd * 0.12;
        t[0] *= crown;
        t[1] *= crown;
        t[2] *= crown;
        // at 4 m/px a pixel is about one crown: scatter them; further out, blend
        const amt = level <= 2 ? (rnd < cover * 1.08 ? 0.95 : cover * 0.25) : cover * 0.9;
        mix3(c, c, t, amt);
      }

      // rock on steep ground
      const rock = smoothstep(0.3, 0.45, slope + (rnd - 0.5) * 0.08);
      if (rock > 0) mix3(c, c, ROCK, rock);

      // water over it all; it lies flat, so the hillshade barely shows on it
      const wa = WA[k];
      if (wa > 0) {
        mix3(t, WATER, WATER_DEEP, smoothstep(0.2, 3, WD[k]));
        if (wa < 1) mix3(t, t, WATER_EDGE, 0.5);
        mix3(c, c, t, wa);
        shadeA[k] = 1 + (shade - 1) * (1 - wa * 0.85);
      }

      const grain = level <= 2 ? 0.1 : 0.05;
      c[0] *= 1 - grain * 0.6 + rnd * grain;
      c[1] *= 1 - grain * 0.6 + rnd * grain;
      c[2] *= 1 - grain * 0.6 + rnd * grain;

      // contours; every fifth is an index line
      const lv = Math.floor(h / ci);
      const lr = Math.floor(H[g + 1] / ci);
      const ld = Math.floor(H[g + G] / ci);
      if ((lv !== lr || lv !== ld) && WA[k] < 0.5) {
        const top = Math.max(lv, lr, ld);
        const strong = top % 5 === 0;
        mix3(c, c, CONTOUR, strong ? 0.42 : 0.24);
      }

      // footpaths: the true mask up close, a distance-based line further out
      let pa = 0;
      if (mpp <= 1) pa = smoothstep(0.35, 0.6, PM[k] + (rnd - 0.5) * 0.15);
      else pa = Math.min(1, Math.max(0, 0.5 - PE[k] / mpp) * 1.6);
      // a trail goes into the water and picks up again on the far side
      pathA[k] = pa * (1 - WA[k] * 0.85);

      rgb[k * 3] = c[0];
      rgb[k * 3 + 1] = c[1];
      rgb[k * 3 + 2] = c[2];
    }
  }

  if (fine) stampVegetation(rgb, shadeA, gen, level, x0, z0, vegFor);

  // paths on top, so trails read even under overhanging crowns
  for (let k = 0; k < S * S; k++) {
    const pa = pathA[k];
    if (pa <= 0.02) continue;
    const edge = pa < 0.6 ? DIRT_EDGE : DIRT;
    const a = fine ? pa * 0.9 : Math.min(1, pa * 1.25) * 0.92;
    rgb[k * 3] += (edge[0] - rgb[k * 3]) * a;
    rgb[k * 3 + 1] += (edge[1] - rgb[k * 3 + 1]) * a;
    rgb[k * 3 + 2] += (edge[2] - rgb[k * 3 + 2]) * a;
  }

  // hillshade, then an ordered dither onto a reduced palette, like the 3D view
  const out = new Uint8ClampedArray(S * S * 4);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const k = j * S + i;
      const s = shadeA[k];
      const d = (BAYER[((gj0 + j) & 3) * 4 + ((gi0 + i) & 3)] + 0.5) / 16 - 0.5;
      for (let ch = 0; ch < 3; ch++) {
        const v = Math.min(1, rgb[k * 3 + ch] * s);
        out[k * 4 + ch] = Math.round(Math.floor(v * LEVELS + 0.5 + d) * (255 / LEVELS));
      }
      out[k * 4 + 3] = 255;
    }
  }
  return out;
}

// Draws real trees, bushes and boulders from the chunk generator.
function stampVegetation(rgb, shadeA, gen, level, x0, z0, vegFor) {
  const S = TILE;
  const mpp = 2 ** level;
  const span = S * mpp;
  const pad = 6;
  const cx0 = Math.floor((x0 - pad) / VEG_CHUNK);
  const cx1 = Math.floor((x0 + span + pad) / VEG_CHUNK);
  const cz0 = Math.floor((z0 - pad) / VEG_CHUNK);
  const cz1 = Math.floor((z0 + span + pad) / VEG_CHUNK);

  const trees = [];
  const small = [];
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const lists = vegFor(cx, cz);
      for (const kind of ['pine', 'broad', 'birch']) {
        const L = lists[kind];
        for (let n = 0; n < L.length; n += 7) trees.push(kind, L[n], L[n + 2], L[n + 3], L[n + 4], L[n + 5]);
      }
      if (level <= 0) {
        const B = lists.bush;
        for (let n = 0; n < B.length; n += 7) small.push('bush', B[n], B[n + 2], B[n + 3], B[n + 4], B[n + 5]);
      }
      const R = lists.rock;
      for (let n = 0; n < R.length; n += 7) if (level <= 0 || R[n + 4] > 0.6) small.push('rock', R[n], R[n + 2], R[n + 3], R[n + 4], R[n + 5]);
    }
  }

  const px = (x) => (x - x0) / mpp - 0.5;
  const pz = (z) => (z - z0) / mpp - 0.5;
  const col = [0, 0, 0];

  // cast shadows to the south-east first, so crowns overlap them
  for (let n = 0; n < trees.length; n += 6) {
    const r = (CANOPY[trees[n]] * trees[n + 4]) / mpp;
    const off = r * 0.45;
    disc(px(trees[n + 1]) + off, pz(trees[n + 2]) + off, r * 0.95, (k) => {
      rgb[k * 3] *= 0.62;
      rgb[k * 3 + 1] *= 0.64;
      rgb[k * 3 + 2] *= 0.68;
    });
  }

  for (let n = 0; n < small.length; n += 6) {
    const kind = small[n];
    const s = small[n + 4];
    const tint = small[n + 5];
    const r = Math.max(0.6, ((kind === 'rock' ? 0.62 : 0.85) * s) / mpp);
    const base = kind === 'rock' ? ROCK : BUSH;
    const b = 0.88 + tint * 0.24;
    drawCrown(rgb, shadeA, px(small[n + 1]), pz(small[n + 2]), r, base, b, 0, 0, col);
  }

  for (let n = 0; n < trees.length; n += 6) {
    const kind = trees[n];
    const s = trees[n + 4];
    const tint = trees[n + 5];
    const r = (CANOPY[kind] * s) / mpp;
    const base = kind === 'pine' ? PINE : kind === 'birch' ? BIRCH : BROAD;
    const lobes = kind === 'pine' ? 9 : kind === 'broad' ? 5 : 0;
    drawCrown(rgb, shadeA, px(trees[n + 1]), pz(trees[n + 2]), r, base, 0.86 + tint * 0.28, lobes, trees[n + 3], col);
  }

  function disc(cx, cz, r, fn) {
    const i0 = Math.max(0, Math.floor(cx - r));
    const i1 = Math.min(S - 1, Math.ceil(cx + r));
    const j0 = Math.max(0, Math.floor(cz - r));
    const j1 = Math.min(S - 1, Math.ceil(cz + r));
    const r2 = r * r;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = i - cx;
        const dz = j - cz;
        if (dx * dx + dz * dz <= r2) fn(j * S + i);
      }
    }
  }
}

// A shaded crown: lit from the north-west, darker rim, optional lobes
// (spiky for pines, lumpy for broadleaf).
function drawCrown(rgb, shadeA, cx, cz, r, base, bright, lobes, yaw, col) {
  const S = TILE;
  const rr = r * 1.15;
  const i0 = Math.max(0, Math.floor(cx - rr));
  const i1 = Math.min(S - 1, Math.ceil(cx + rr));
  const j0 = Math.max(0, Math.floor(cz - rr));
  const j1 = Math.min(S - 1, Math.ceil(cz + rr));
  if (i0 > i1 || j0 > j1) return;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = i - cx;
      const dz = j - cz;
      const d = Math.hypot(dx, dz);
      let edge = r;
      if (lobes) edge *= (lobes > 6 ? 0.86 : 0.92) + (lobes > 6 ? 0.18 : 0.1) * Math.cos(lobes * Math.atan2(dz, dx) + yaw);
      if (d > edge) continue;
      const u = d / Math.max(edge, 1e-3);
      const lit = 1 + ((-dx - dz) / Math.max(r, 0.5)) * 0.22 - u * u * 0.18;
      const rim = u > 0.78 && r > 1.5 ? 0.8 : 1;
      const v = bright * lit * rim;
      col[0] = base[0] * v;
      col[1] = base[1] * v;
      col[2] = base[2] * v;
      const k = j * S + i;
      rgb[k * 3] = col[0];
      rgb[k * 3 + 1] = col[1];
      rgb[k * 3 + 2] = col[2];
      // crowns carry their own light; soften the terrain hillshade under them
      shadeA[k] = 1 + (shadeA[k] - 1) * 0.35;
    }
  }
}
