// Grass blades and wildflowers in tiles around the player. Built from the
// full-resolution chunk height grids so blades sit exactly on the ground.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { mulberry32, hash2i, smoothstep } from '../noise.js';

const tileKey = (tx, tz) => (tx + 32768) * 65536 + (tz + 32768);

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

const _tip = new THREE.Color();
const _g = { h: 0, path: 0, forest: 0 };

export class Grass {
  constructor(scene, chunks, material, seed) {
    this.scene = scene;
    this.chunks = chunks;
    this.material = material;
    this.seed = seed;
    this.tiles = new Map();
  }

  update(px, pz, budgetMs = 3) {
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
      let density = (0.26 + meadow * 0.74) * (1 - onPath * 0.97);
      if (r1 > density) continue;

      const edgeShort = 1 - smoothstep(0.1, 0.45, _g.path) * 0.6;
      const h = (0.22 + r2 * 0.32) * (0.6 + meadow * 0.75) * edgeShort;
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
