// Blood is printed onto the architecture at human scale. Each mark samples
// an atlas of broken palm ridges, worn boot tread, pooled blood and wipe marks.
import * as THREE from 'three';
import { Kit } from '../build/kit.js';
import { mulberry32 } from '../noise.js';

const N = 192,
  WHITE = new THREE.Color(1, 1, 1);
const clamp = (x) => Math.max(0, Math.min(1, x));
const oval = (x, y, cx, cy, rx, ry) => 1 - Math.hypot((x - cx) / rx, (y - cy) / ry);
let material;
function bloodInk() {
  if (material) return material;
  const data = new Uint8Array(4 * N * N * 4);
  const rand = mulberry32(1313);
  const drops = Array.from({ length: 23 }, () => [rand() * 1.64 - 0.82, rand() * 1.68 - 0.84, 0.009 + rand() ** 3 * 0.065]);
  const fingers = [
    [-0.49, -0.38, 0.12, 0.33, -0.34],
    [-0.22, -0.56, 0.12, 0.4, -0.11],
    [0.05, -0.6, 0.125, 0.42, 0.05],
    [0.32, -0.48, 0.111, 0.34, 0.2],
    [0.55, -0.02, 0.13, 0.32, 0.73],
  ];
  for (let row = 0; row < N; row++)
    for (let col = 0; col < N; col++) {
      const x = (2 * (col + 0.5)) / N - 1,
        y = (2 * (row + 0.5)) / N - 1;
      const speck = rand(),
        uneven = 0.032 * Math.sin(x * 39 + y * 17) + 0.022 * Math.sin(x * 21 - y * 56);
      let hand = Math.max(oval(x, y, 0.015, 0.14, 0.435, 0.42), oval(x, y, -0.08, 0.47, 0.27, 0.25));
      if (Math.abs(y - 0.15 - 0.15 * Math.sin(x * 7)) < 0.023 || Math.abs(y - 0.34 + x * 0.35) < 0.016) hand -= 0.65;
      for (const [cx, cy, rx, ry, angle] of fingers) {
        const u = (x - cx) * Math.cos(angle) - (y - cy) * Math.sin(angle),
          v = (x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle);
        let pad = 1 - Math.hypot(u / rx, v / ry);
        if (Math.abs(v + 0.12) < 0.018 || Math.abs(v - 0.08) < 0.014) pad -= 0.49;
        hand = Math.max(hand, pad);
      }
      // A few viscous runs below the heel of the hand.
      for (const [cx, end] of [
        [-0.22, 0.84],
        [0.11, 0.97],
        [0.27, 0.72],
      ])
        if (y > 0.33 && y < end) hand = Math.max(hand, (0.023 - Math.abs(x - cx - 0.014 * Math.sin(11 * y))) * 14);
      const toe = oval(x, y, -0.03, -0.29, 0.51, 0.63),
        heel = oval(x, y, 0.06, 0.62, 0.39, 0.31);
      const lug = Math.cos((y + Math.abs(x) * 0.35) * 46) > 0.36 || Math.abs(x + 0.035 * Math.sin(y * 8)) < 0.045;
      const boot = Math.max(toe, heel) - (lug ? 0.84 : 0);
      const r = Math.hypot(x * 1.22 + 0.08 * Math.sin(5 * y), y * 1.47);
      const pool = 0.85 - r + 0.085 * Math.sin(8 * Math.atan2(y, x)) + 0.065 * Math.sin(y * 21 + x * 6);
      let scatter = -1;
      for (const [a, b, radius] of drops) scatter = Math.max(scatter, (radius - Math.hypot(x - a, y - b)) * 10);
      const width = 0.59 * (1 - (0.46 * (y + 1)) / 2);
      const smear = Math.min(width - Math.abs(x + 0.15 * Math.sin(y * 3)), 0.82 - Math.abs(y)) - 0.22 * (0.5 + 0.5 * Math.sin(73 * x + 4 * y));
      for (const [i, coverage] of [hand, boot, Math.max(pool, scatter), Math.max(smear, scatter)].entries()) {
        const o = (row * N * 4 + i * N + col) * 4;
        const edge = clamp(coverage * 3);
        const pigment = clamp(0.38 + edge * 0.32 + 0.17 * Math.sin(x * 12 + y * 17) + 0.22 * speck);
        data[o] = 95 + pigment * 57;
        data[o + 1] = 10 + (1 - pigment) * 17;
        data[o + 2] = 13 + (1 - pigment) * 13;
        let alpha = clamp((coverage + uneven) * 19);
        if (i < 2) alpha *= speck < 0.085 ? 0.14 : 0.67 + 0.33 * Math.abs(Math.sin(85 * x + 22 * y));
        data[o + 3] = 255 * alpha;
      }
    }
  const atlas = new THREE.DataTexture(data, 4 * N, N);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.magFilter = THREE.LinearFilter;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.generateMipmaps = true;
  atlas.needsUpdate = true;
  material = new THREE.MeshStandardMaterial({ map: atlas, transparent: true, depthWrite: false, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return material;
}

export function bloodTrail(site, doors, stepCount) {
  const kit = new Kit(),
    rnd = mulberry32(site.seed ^ 0xd33f);
  const uv = (i, mirror = false) => [(i + (mirror ? 0.996 : 0.004)) / 4, 0.004, (i + (mirror ? 0.004 : 0.996)) / 4, 0.996];
  function floor(i, x, y, z, w, h, angle = 0, mirror = false) {
    const c = Math.cos(angle),
      s = Math.sin(angle);
    const corner = (u, v) => [x + c * u - s * v, y, z + s * u + c * v];
    kit.quad(corner(-w / 2, h / 2), corner(w / 2, h / 2), corner(w / 2, -h / 2), corner(-w / 2, -h / 2), [0, 1, 0], WHITE, uv(i, mirror));
  }
  function palms(x, y, z, nx, nz, scale = 1) {
    kit.panel(x, y, z, nx, nz, 0.49 * scale, 0.73 * scale, WHITE, uv(0));
    kit.panel(x + nz * 0.46, y - 0.26, z - nx * 0.46, nx, nz, 0.62 * scale, 1.27 * scale, WHITE, uv(0, true));
    kit.panel(x + nz * 0.7, y - 0.9, z - nx * 0.7, nx, nz, 0.39 * scale, 0.94 * scale, WHITE, uv(3));
  }
  // The first pair is on the jamb outside, visible before stepping in.
  palms(2.47, 1.7, site.d + 0.229, 0, 1, 1.27);
  for (let i = 0; i < stepCount; i += 2) {
    const tread = 8 / stepCount;
    floor(1, i % 4 ? 0.23 : -0.14, -0.21 * i + 0.008, site.d + tread * (i + 0.5), 0.39, Math.min(0.56, tread * 0.93), 0, i % 4 === 0);
  }
  const first = doors.filter((p) => p.side === 1).sort((a, b) => b.z - a.z)[0];
  const bend = first.z;
  floor(2, 0.95, 0.009, site.d - 2.4, 2.25, 2.8, 0.29);
  floor(3, 0.58, 0.012, site.d - 4.1, 0.57, 2.9, -0.26);
  function walk(ax, az, bx, bz) {
    const len = Math.hypot(bx - ax, bz - az),
      angle = Math.atan2(bx - ax, az - bz),
      steps = Math.ceil(len / 0.82);
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.35) / steps,
        side = i % 2 ? 0.16 : -0.16;
      floor(1, ax + (bx - ax) * t + Math.cos(angle) * side, 0.024, az + (bz - az) * t + Math.sin(angle) * side, 0.32, 0.49, angle + (rnd() - 0.5) * 0.36, i % 2 === 0);
    }
  }
  walk(0.65, site.d - 0.5, 0.24, bend);
  walk(0.24, bend, site.w - 2, bend);
  floor(2, site.w - 1.7, 0.013, bend, 2.5, 1.7, 0.7);
  palms(site.w - 0.22, 1.58, bend, -1, 0, 1.14);
  for (const [i, p] of doors.entries()) {
    const x = p.x - p.side * 0.164,
      z = p.z + 2.1;
    if (i % 3 === 1 || p === first) palms(x, 1.62, z, -p.side, 0, 1.07);
    if (i % 3 === 0) {
      floor(2, p.x - p.side * 0.8, 0.013, p.z, 1.3 + rnd(), 1.2 + rnd(), rnd() * 3);
      walk(p.x - p.side * 1.6, p.z, p.x + p.side * 3, p.z);
    }
  }
  const mesh = new THREE.Mesh(kit.build(true), bloodInk());
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.name = 'Blood trail';
  return mesh;
}
