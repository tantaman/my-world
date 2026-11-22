// Her wake: white water while she's under way. A bow wave curling off her
// stem down both sides, the wash along her sides, and behind her the churned
// water of her propellers spreading out into a long pale V.
//
// Drawn in her own frame, so it goes where she goes, just over the water.
// A foam texture slides along it as fast as she's going, so the water seems
// to stream past her, and it all fades out as she slows to a stop.
//
//   buildWake() -> { object, update(v, dt) }   v: her speed (m/s)

import * as THREE from 'three';
import { hullWidth } from './hull.js';
import { STERN } from './plan.js';
import { mulberry32 } from '../noise.js';

const Y = 0.08; // m over the water
const TILE = 12; // m of foam a repeat of its texture covers
const FULL = 5; // m/s: at this speed and over, her wake is all there
const WAKE = { length: 420, near: 13, far: 70 }; // m behind her stern; how wide where it starts, and at its end
const WASH = 2.2; // m out from her sides
const BOW_WAVE = { from: 136, to: 40, out: 5 }; // along her (m), and how far it stands out

export function buildWake() {
  const tex = foamTexture();
  const material = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const pos = [];
  const uv = [];
  const col = [];
  // a ribbon through [x, z] pairs either side, each with how much of it
  // there is (a, 0..1): [[xl, xr, z, a], ...]; u across, v along (m / TILE)
  const ribbon = (rows) => {
    for (let i = 0; i < rows.length - 1; i++) {
      const [a0, a1, za, aa] = rows[i];
      const [b0, b1, zb, ab] = rows[i + 1];
      const va = -za / TILE;
      const vb = -zb / TILE;
      const quad = [
        [a0, za, 0, va, aa],
        [a1, za, 1, va, aa],
        [b1, zb, 1, vb, ab],
        [a0, za, 0, va, aa],
        [b1, zb, 1, vb, ab],
        [b0, zb, 0, vb, ab],
      ];
      for (const [x, z, u, v, a] of quad) {
        pos.push(x, Y, z);
        uv.push(u, v);
        col.push(1, 1, 1, a);
      }
    }
  };
  // the bow wave and the wash, each side
  for (const s of [1, -1]) {
    const rows = [];
    for (let z = BOW_WAVE.from; z >= STERN; z -= 4) {
      const w = hullWidth(z, 0);
      const flare = z > BOW_WAVE.to ? ((z - BOW_WAVE.to) / (BOW_WAVE.from - BOW_WAVE.to)) * BOW_WAVE.out : 0;
      const inner = s * (w + 0.2);
      const outer = s * (w + WASH + flare);
      // the bow wave curls up white; the wash along her side is less
      const a = z > BOW_WAVE.to ? 0.9 : 0.45;
      rows.push(s > 0 ? [inner, outer, z, a] : [outer, inner, z, a]);
    }
    ribbon(rows);
  }
  // behind her: widening as it goes
  const rows = [];
  for (let d = 0; d <= WAKE.length; d += 10) {
    const w = WAKE.near + (WAKE.far - WAKE.near) * Math.sqrt(d / WAKE.length);
    // churned white close under her stern, thinning out to nothing behind
    rows.push([-w, w, STERN - d, Math.pow(1 - d / WAKE.length, 1.6)]);
  }
  ribbon(rows);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, material);
  mesh.name = 'wake';
  mesh.renderOrder = 1;
  mesh.visible = false;
  let slide = 0;
  return {
    object: mesh,
    update(v, dt) {
      const k = Math.min(1, Math.max(0, v) / FULL);
      mesh.visible = k > 0.01;
      material.opacity = 0.6 * k;
      slide = (slide + (v * dt) / TILE) % 1;
      tex.offset.y = slide;
    },
    dispose() {
      g.dispose();
      tex.dispose();
      material.dispose();
    },
  };
}

// Foam: white flecks and streaks, thinning out across the ribbon's edges
// (its alpha), a tile of it drawn once.
function foamTexture() {
  const W = 64;
  const H = 128;
  const data = new Uint8Array(W * H * 4);
  const rnd = mulberry32(0xf0a3);
  const a = new Float32Array(W * H);
  for (let k = 0; k < 320; k++) {
    const cx = rnd() * W;
    const cy = rnd() * H;
    const r = 1 + rnd() * 3.5;
    const len = 1 + rnd() * 5; // streaked along the way the water goes
    for (let y = Math.floor(cy - r * len); y <= cy + r * len; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = (x - cx) / r;
        const dy = (y - cy) / (r * len);
        const f = 1 - (dx * dx + dy * dy);
        if (f <= 0) continue;
        const i = ((y + H) % H) * W + ((x + W) % W);
        a[i] = Math.min(1, a[i] + f * (0.3 + rnd() * 0.35));
      }
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const edge = Math.sin((Math.PI * (x + 0.5)) / W); // thin at the ribbon's edges
      data.set([255, 255, 255, Math.round(255 * a[i] * edge)], i * 4);
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

