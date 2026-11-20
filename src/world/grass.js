// Grass blades and wildflowers in tiles around the player. Built from the
// full-resolution chunk height grids so blades sit exactly on the ground.
// Where there's water the grass stops at the bank; reeds and bulrushes stand
// along the shallows of still water, and lily pads float further out.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { mulberry32, hash2i, smoothstep, createSimplex2 } from '../noise.js';
import { NO_WATER } from './water.js';
import { growRect, cellKey as tileKey } from '../core/geom.js';

const REGROW_EVERY = 0.35; // seconds between regrowing changed ground

// Blade shading multipliers (the hue comes from the ground shader).
const C_ROOT = new THREE.Color(0.5, 0.5, 0.45);
const C_TIP = new THREE.Color(1.3, 1.32, 1.05);
const C_TIP_DRY = new THREE.Color(1.55, 1.35, 0.85);
const C_TIP_LUSH = new THREE.Color(1.05, 1.3, 0.95);
const FLOWERS = [
  new THREE.Color(0.85, 0.85, 0.78),
  new THREE.Color(0.95, 0.72, 0.1),
  new THREE.Color(0.42, 0.24, 0.75),
  new THREE.Color(0.85, 0.32, 0.5),
  new THREE.Color(0.25, 0.4, 0.95),
];
const STEM = new THREE.Color(0.05, 0.1, 0.02);
const REED_ROOT = new THREE.Color(0.05, 0.09, 0.025);
const REED_TIP = new THREE.Color(0.2, 0.24, 0.07);
const CATTAIL = new THREE.Color(0.17, 0.085, 0.035);
const PAD = new THREE.Color(0.065, 0.15, 0.04);
const LILY = [new THREE.Color(0.95, 0.93, 0.85), new THREE.Color(0.95, 0.6, 0.72)];
const LILY_HEART = new THREE.Color(0.95, 0.75, 0.15);

const _tip = new THREE.Color();
const _c = new THREE.Color();
const _g = { h: 0, path: 0, forest: 0, above: 0, snow: 0, wRegion: 0, wLevel: NO_WATER, wSpeed: 0, wFoam: 0 };

// Depth of water over the ground in _g (> 0 under water), or −99 if none.
const waterDepth = () => (_g.wRegion > 0.3 && _g.wLevel > NO_WATER * 0.5 ? _g.wLevel - _g.h : -99);

export class Grass {
  constructor(scene, chunks, material, seed) {
    this.scene = scene;
    this.chunks = chunks;
    this.material = material;
    this.seed = seed;
    this.tiles = new Map();
    this.stale = null; // [x0, z0, x1, z1] waiting to regrow
    this.regrowIn = 0;
    // where reeds and lily pads grow in clumps
    this.nReed = createSimplex2((seed ^ 0x2eed5) >>> 0);
    this.nLily = createSimplex2((seed ^ 0x1117) >>> 0);
    // Places nothing grows: under a floor, in a tent, round a dock. See
    // addClearing().
    this.clearings = [];
  }

  // Keep the grass (and reeds and lilies) off somewhere. `fn(x0, z0, x1, z1)`
  // is asked once per tile as it grows, and answers null if it has nothing
  // there, or a test (x, z) -> true where nothing should grow.
  addClearing(fn) {
    this.clearings.push(fn);
  }

  update(px, pz, budgetMs = 3, dt = 0) {
    this.regrowIn -= dt;
    if (this.stale && this.regrowIn <= 0) {
      this.invalidate(...this.stale);
      this.stale = null;
      this.regrowIn = REGROW_EVERY;
    }
    const T = CONFIG.grassTile;
    const R = CONFIG.grassRadius;
    const tx0 = Math.floor((px - R) / T);
    const tx1 = Math.floor((px + R) / T);
    const tz0 = Math.floor((pz - R) / T);
    const tz1 = Math.floor((pz + R) / T);

    for (const [k, tile] of this.tiles) {
      const cx = (tile.tx + 0.5) * T - px;
      const cz = (tile.tz + 0.5) * T - pz;
      if (Math.hypot(cx, cz) > R + T * 1.2) {
        if (tile.mesh) {
          this.scene.remove(tile.mesh);
          tile.mesh.geometry.dispose();
        }
        this.tiles.delete(k);
      }
    }

    const todo = [];
    for (let tz = tz0; tz <= tz1; tz++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (this.tiles.has(tileKey(tx, tz))) continue;
        const cx = (tx + 0.5) * T - px;
        const cz = (tz + 0.5) * T - pz;
        const d = Math.hypot(cx, cz);
        if (d > R + T * 0.72) continue;
        todo.push({ tx, tz, d });
      }
    }
    if (!todo.length) return;
    todo.sort((a, b) => a.d - b.d);
    const t0 = performance.now();
    for (const t of todo) {
      if (performance.now() - t0 > budgetMs) break;
      const mesh = this.buildTile(t.tx, t.tz);
      if (mesh === false) continue; // ground not ready yet
      this.tiles.set(tileKey(t.tx, t.tz), { tx: t.tx, tz: t.tz, mesh });
      if (mesh) this.scene.add(mesh);
    }
  }

  // The ground changed around (x, z): regrow the turf there. Changes that keep
  // coming (a long dig) are gathered up and regrown a few times a second.
  touch(x, z, pad = 1) {
    this.stale = growRect(this.stale, x, z, pad);
  }

  // Drop tiles overlapping a rectangle so they regrow from the current ground
  // (after digging, clearing or building).
  invalidate(x0, z0, x1, z1) {
    const T = CONFIG.grassTile;
    for (const [k, tile] of this.tiles) {
      const ox = tile.tx * T;
      const oz = tile.tz * T;
      if (ox > x1 || ox + T < x0 || oz > z1 || oz + T < z0) continue;
      if (tile.mesh) {
        this.scene.remove(tile.mesh);
        tile.mesh.geometry.dispose();
      }
      this.tiles.delete(k);
    }
  }

  buildTile(tx, tz) {
    const T = CONFIG.grassTile;
    const ox = tx * T;
    const oz = tz * T;
    // Every chunk under this tile must be at full resolution.
    for (const [x, z] of [
      [ox + 0.1, oz + 0.1],
      [ox + T - 0.1, oz + 0.1],
      [ox + 0.1, oz + T - 0.1],
      [ox + T - 0.1, oz + T - 0.1],
    ]) {
      if (!this.chunks.groundAt(x, z, _g)) return false;
    }

    const kept = [];
    for (const fn of this.clearings) {
      const test = fn(ox, oz, ox + T, oz + T);
      if (test) kept.push(test);
    }
    const bare = (x, z) => {
      for (let i = 0; i < kept.length; i++) if (kept[i](x, z)) return true;
      return false;
    };

    const rng = mulberry32(hash2i(tx, tz, this.seed ^ 0x51f15e));
    const candidates = Math.floor(T * T * CONFIG.grassDensity);
    const pos = [];
    const col = [];
    const blade = [];
    const gnd = [];
    const idx = [];
    let v = 0;

    let gPath = 0;
    let gForest = 0;
    const vert = (x, y, z, c, rx, ry, rz, hf) => {
      pos.push(x, y, z);
      col.push(c.r, c.g, c.b);
      blade.push(rx, ry, rz, hf);
      gnd.push(gPath, gForest);
      return v++;
    };

    for (let i = 0; i < candidates; i++) {
      const lx = rng() * T;
      const lz = rng() * T;
      const r1 = rng();
      const r2 = rng();
      const r3 = rng();
      const r4 = rng();
      const r5 = rng();
      const r6 = rng();
      this.chunks.groundAt(ox + lx, oz + lz, _g);
      const meadow = 1 - smoothstep(0.25, 0.9, _g.forest);
      const onPath = smoothstep(0.3, 0.62, _g.path);
      // none under water, and thinning out on the damp edge of the bank
      const wd = waterDepth();
      const bank = wd > -0.4 ? smoothstep(-0.03, -0.3, wd) : 1;
      // above the trees it's short and thin, and none grows through the snow
      const high = 1 - _g.above * 0.45;
      let density = (0.26 + meadow * 0.74) * (1 - onPath * 0.97) * bank * high * (1 - smoothstep(0.15, 0.5, _g.snow));
      if (r1 > density) continue;
      if (kept.length && bare(ox + lx, oz + lz)) continue;

      const edgeShort = 1 - smoothstep(0.1, 0.45, _g.path) * 0.6;
      const h = (0.22 + r2 * 0.32) * (0.6 + meadow * 0.75) * edgeShort * high;
      const w = 0.08 + r3 * 0.07;
      const yaw = r4 * Math.PI * 2;
      const sx = Math.cos(yaw);
      const sz = Math.sin(yaw);
      const lean = (r5 - 0.3) * 0.5 * h;
      const fx = -sz;
      const fz = sx;
      const y0 = _g.h - 0.03;

      // tip shading: some blades dry and golden, some lush
      _tip.copy(C_TIP);
      if (r6 > 0.8) _tip.lerp(C_TIP_DRY, (r6 - 0.8) * 5 * meadow);
      else if (r6 < 0.3) _tip.lerp(C_TIP_LUSH, 0.7);
      if (_g.above > 0) _tip.lerp(C_TIP_DRY, _g.above * 0.5);
      _tip.multiplyScalar(0.82 + r2 * 0.36);
      const mid = C_ROOT.clone().lerp(_tip, 0.6);
      gPath = 0;
      gForest = _g.forest;

      const a = vert(lx - sx * w * 0.5, y0, lz - sz * w * 0.5, C_ROOT, lx, y0, lz, 0);
      const b = vert(lx + sx * w * 0.5, y0, lz + sz * w * 0.5, C_ROOT, lx, y0, lz, 0);
      const ml = lean * 0.3;
      const c = vert(lx - sx * w * 0.32 + fx * ml, y0 + h * 0.5, lz - sz * w * 0.32 + fz * ml, mid, lx, y0, lz, 0.5);
      const d = vert(lx + sx * w * 0.32 + fx * ml, y0 + h * 0.5, lz + sz * w * 0.32 + fz * ml, mid, lx, y0, lz, 0.5);
      const e = vert(lx + fx * lean, y0 + h, lz + fz * lean, _tip, lx, y0, lz, 1);
      idx.push(a, b, c, b, d, c, c, d, e);

      // wildflowers in the open: lupine-like spikes and little daisy heads
      if (meadow > 0.5 && rng() < 0.035 * meadow) {
        const kind = Math.floor(rng() * FLOWERS.length);
        const fc = FLOWERS[kind];
        const spike = kind >= 2;
        const top = h * (spike ? 1.25 + rng() * 0.35 : 1.0 + rng() * 0.25);
        const bx = lx + fx * lean * 0.5;
        const bz = lz + fz * lean * 0.5;
        const sy = spike ? top * 0.55 : top;
        // stem
        gPath = 0;
        const s0 = vert(lx - sx * 0.012, y0, lz - sz * 0.012, STEM, lx, y0, lz, 0);
        const s1 = vert(lx + sx * 0.012, y0, lz + sz * 0.012, STEM, lx, y0, lz, 0);
        const s2 = vert(bx + sx * 0.01, y0 + sy, bz + sz * 0.01, STEM, lx, y0, lz, 1);
        const s3 = vert(bx - sx * 0.01, y0 + sy, bz - sz * 0.01, STEM, lx, y0, lz, 1);
        idx.push(s0, s1, s2, s0, s2, s3);
        gPath = -1;
        if (spike) {
          const fw = 0.035 + rng() * 0.02;
          const base = _tip.copy(fc).multiplyScalar(0.6).clone();
          const f0 = vert(bx - sx * fw, y0 + sy, bz - sz * fw, base, lx, y0, lz, 1);
          const f1 = vert(bx + sx * fw, y0 + sy, bz + sz * fw, base, lx, y0, lz, 1);
          const f2 = vert(bx + fx * lean * 0.3, y0 + top, bz + fz * lean * 0.3, fc, lx, y0, lz, 1);
          idx.push(f0, f1, f2);
        } else {
          const fs = 0.045 + rng() * 0.03;
          const fy = y0 + sy;
          const f0 = vert(bx - fs, fy, bz, fc, lx, y0, lz, 1);
          const f1 = vert(bx, fy + fs * 0.5, bz - fs, fc, lx, y0, lz, 1);
          const f2 = vert(bx + fs, fy, bz, fc, lx, y0, lz, 1);
          const f3 = vert(bx, fy + fs * 0.5, bz + fs, fc, lx, y0, lz, 1);
          idx.push(f0, f1, f2, f0, f2, f3);
        }
      }
    }

    // ── by the water ──
    // Reeds stand in the shallows and on the wet bank of still or slow water,
    // in clumps; some carry a bulrush head. Lily pads float on still water a
    // little further out. Their own colours (path = −1), so they don't take
    // the ground's.
    const wrng = mulberry32(hash2i(tx, tz, this.seed ^ 0x3a7e5));
    const spots = Math.floor(T * T * 0.9);
    for (let i = 0; i < spots; i++) {
      const lx = wrng() * T;
      const lz = wrng() * T;
      const r1 = wrng();
      const r2 = wrng();
      const r3 = wrng();
      const r4 = wrng();
      const wx = ox + lx;
      const wz = oz + lz;
      this.chunks.groundAt(wx, wz, _g);
      const wd = waterDepth();
      if (wd < -0.3 || wd > 1.5) continue;
      if (kept.length && bare(wx, wz)) continue;
      // still, and not broken: nothing roots in rapids, or in the sea's surf and chop
      const calm = (1 - smoothstep(0.2, 0.6, _g.wSpeed)) * (1 - smoothstep(0.12, 0.28, _g.wFoam));
      gPath = -1;
      gForest = 0;
      const reedP = smoothstep(0.05, 0.45, this.nReed(wx / 11, wz / 11)) * (1 - smoothstep(0.35, 0.6, wd)) * (0.25 + 0.75 * calm) * (1 - smoothstep(0.2, 0.28, _g.wFoam));
      if (r1 < reedP * 0.55) {
        const y0 = _g.h - 0.05;
        const blades = 3 + Math.floor(r2 * 5);
        const tall = 0.9 + r3 * 0.8;
        for (let b = 0; b < blades; b++) {
          const a = wrng() * Math.PI * 2;
          const bx = lx + Math.cos(a) * wrng() * 0.18;
          const bz = lz + Math.sin(a) * wrng() * 0.18;
          const h = tall * (0.7 + wrng() * 0.4);
          const yaw = wrng() * Math.PI;
          const sx = Math.cos(yaw) * 0.022;
          const sz = Math.sin(yaw) * 0.022;
          const lean = (wrng() - 0.5) * 0.25;
          const tx2 = bx + Math.cos(a) * lean;
          const tz2 = bz + Math.sin(a) * lean;
          _c.copy(REED_TIP).multiplyScalar(0.8 + wrng() * 0.4);
          const p0 = vert(bx - sx, y0, bz - sz, REED_ROOT, bx, y0, bz, 0);
          const p1 = vert(bx + sx, y0, bz + sz, REED_ROOT, bx, y0, bz, 0);
          const p2 = vert(tx2, y0 + h, tz2, _c, bx, y0, bz, 1);
          idx.push(p0, p1, p2);
          if (b === 0 && r4 < 0.4) {
            // a bulrush: a brown head near the top of the stalk
            const hy = y0 + h * 0.8;
            const hx = bx + (tx2 - bx) * 0.8;
            const hz = bz + (tz2 - bz) * 0.8;
            for (const [cx, cz] of [
              [0.03, 0],
              [0, 0.03],
            ]) {
              const q0 = vert(hx - cx, hy, hz - cz, CATTAIL, bx, y0, bz, 0.8);
              const q1 = vert(hx + cx, hy, hz + cz, CATTAIL, bx, y0, bz, 0.8);
              const q2 = vert(hx + cx, hy + 0.17, hz + cz, CATTAIL, bx, y0, bz, 0.9);
              const q3 = vert(hx - cx, hy + 0.17, hz - cz, CATTAIL, bx, y0, bz, 0.9);
              idx.push(q0, q1, q2, q0, q2, q3);
            }
          }
        }
        continue;
      }
      const lilyP = smoothstep(0.15, 0.5, this.nLily(wx / 7, wz / 7)) * smoothstep(0.25, 0.45, wd) * calm * calm;
      if (r1 < reedP * 0.55 + lilyP * 0.5) {
        // a lily pad: a disc with a notch, floating
        const y = _g.wLevel + 0.012;
        const r = 0.13 + r2 * 0.17;
        const notch = r3 * Math.PI * 2;
        _c.copy(PAD).multiplyScalar(0.75 + r4 * 0.5);
        const c0 = vert(lx, y, lz, _c, lx, y, lz, 0);
        const seg = 9;
        let prev = -1;
        for (let k = 0; k <= seg; k++) {
          const a = notch + 0.35 + (k / seg) * (Math.PI * 2 - 0.7);
          const e = vert(lx + Math.cos(a) * r, y, lz + Math.sin(a) * r, _c, lx, y, lz, 0);
          if (prev >= 0) idx.push(c0, e, prev);
          prev = e;
        }
        if (r4 > 0.86) {
          // and now and then a flower
          const fc = LILY[r2 > 0.5 ? 1 : 0];
          const fy = y + 0.05;
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2 + r3;
            const p0 = vert(lx, fy - 0.03, lz, fc, lx, y, lz, 0);
            const p1 = vert(lx + Math.cos(a - 0.3) * 0.07, fy, lz + Math.sin(a - 0.3) * 0.07, fc, lx, y, lz, 0);
            const p2 = vert(lx + Math.cos(a) * 0.1, fy + 0.03, lz + Math.sin(a) * 0.1, fc, lx, y, lz, 0);
            idx.push(p0, p2, p1);
          }
          const h0 = vert(lx - 0.02, fy, lz, LILY_HEART, lx, y, lz, 0);
          const h1 = vert(lx + 0.02, fy, lz, LILY_HEART, lx, y, lz, 0);
          const h2 = vert(lx, fy + 0.03, lz + 0.02, LILY_HEART, lx, y, lz, 0);
          idx.push(h0, h1, h2);
        }
      }
    }

    if (v === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('aBlade', new THREE.Float32BufferAttribute(blade, 4));
    geo.setAttribute('aGround', new THREE.Float32BufferAttribute(gnd, 2));
    const nor = new Float32Array(v * 3);
    for (let i = 0; i < v; i++) nor[i * 3 + 1] = 1; // lit like the ground beneath
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    geo.boundingSphere.radius += 1;
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(ox, 0, oz);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }
}
