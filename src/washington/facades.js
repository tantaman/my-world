// Ground-floor details placed on the surveyed wall that faces a road.
// The survey describes roof massing. The doors and street-level uses are
// inferred from the wall, building scale and the surrounding streets.

import * as THREE from 'three';
import { SURF, FACADE } from '../build/surfaces.js';
import { architecture } from './architecture.js';

const TRIM = new THREE.Color(0xd5c3a9);
const STONE = new THREE.Color(0xada69a);
const GLASS = new THREE.Color(0x25343b);
const DOORS = [0x31474b, 0x57352c, 0x354336, 0x422b35, 0x51483c].map((value) => new THREE.Color(value));
const CIVIC = new Set(['Treasury Building', 'Eisenhower Executive Office Building', 'Supreme Court', 'Library of Congress', 'National Archives', 'Old Post Office']);
const COMMERCIAL = [
  [-4920, -1570, -3550, -1210], // M Street and its junction with Wisconsin Avenue
  [1510, 690, 1900, 1480], // Eastern Market and Barracks Row
  [-520, -1130, 2180, -1020], // H Street NE
];

export function streetStyle(name, style, x, z, tall, area) {
  if (CIVIC.has(name) || (!name && style === FACADE.stone && tall > 15 && area > 900 && x > -1650 && x < -330 && z > -330 && z < 95)) return 'civic';
  if (name && name !== 'Eastern Market') return null;
  if ((style === FACADE.row || style === FACADE.stone) && tall < 19 && area > 44 && area < 1050 &&
      (name === 'Eastern Market' || COMMERCIAL.some(([a, b, c, d]) => x > a && x < c && z > b && z < d))) return 'shop';
  return style === FACADE.row && tall < 15 && area >= 42 && area < 330 ? 'house' : null;
}

export function frontage(a, b, side, tops, street, mode) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  if (length < (mode === 'civic' ? 12 : mode === 'shop' ? 4.5 : 3.6) || (mode === 'house' && length > 15)) return null;
  const nx = side * dz / length;
  const nz = -side * dx / length;
  const x = (a[0] + b[0]) / 2;
  const z = (a[1] + b[1]) / 2;
  for (let distance = 2; distance <= (mode === 'civic' ? 28 : 20); distance += 1.5) {
    if (street(x + nx * distance, z + nz * distance)) {
      return { a, dx: dx / length, dz: dz / length, nx, nz, length, tops, distance, score: distance - Math.min(length, mode === 'house' ? 7 : 20) * 0.16 };
    }
  }
  return null;
}

export function buildFront(batch, edge, { mode, ground, foot, wall, variant, street, solids }) {
  const { a, dx, dz, nx, nz, length, tops } = edge;
  const point = (u, y, d) => [a[0] + u * dx + d * nx, y, a[1] + u * dz + d * nz];
  const { box, quad } = architecture(batch, point);
  const level = (u, d = 0) => {
    const [x, , z] = point(u, 0, d);
    return ground(x, z);
  };
  const overRoad = (u, d) => {
    const [x, , z] = point(u, 0, d);
    return street(x, z);
  };
  const head = Math.min(...tops);
  const accent = DOORS[Math.floor(variant * DOORS.length)];
  const brick = SURF.masonry + 0.35;
  if (mode === 'house') {
    const u = length * (variant < 0.5 ? 0.22 : 0.78);
    const threshold = Math.max(level(u) + 0.18, Math.min(foot + 0.44, level(u) + 0.6));
    if (head < threshold + 2.8) return;
    // Stone jamb, painted panel, fanlight and raised lintel.
    box(u - 0.62, threshold, -0.05, u + 0.62, threshold + 2.44, 0.08, TRIM);
    box(u - 0.48, threshold, 0.08, u + 0.48, threshold + 2.17, 0.11, accent, SURF.paint);
    box(u - 0.38, threshold + 2.20, 0.07, u + 0.38, threshold + 2.34, 0.10, GLASS, SURF.glass);
    box(u - 0.52, threshold + 2.37, 0.07, u + 0.52, threshold + 2.52, 0.15, TRIM);
    if (!overRoad(u, 1.02)) {
      const footY = Math.min(level(u, 0.95), threshold - 0.06);
      for (let step = 0; step < 3; step++) {
        const depth = 0.99 - step * 0.29;
        const y = footY + (threshold - footY) * (step + 1) / 3;
        box(u - 0.66, footY - 0.14, -0.02, u + 0.66, y, depth, STONE);
        const [ax, , az] = point(u - 0.43, y, depth / 2);
        const [bx, , bz] = point(u + 0.43, y, depth / 2);
        solids.push({ ax, az, bx, bz, r: depth / 2, bottom: footY - 0.14, topA: y, topB: y, step: 0.32 });
      }
    }
    if (head > threshold + 5.5 && length > 4.6 && variant > 0.25) {
      const center = length - u;
      const low = Math.max(foot + 0.7, threshold + 0.24);
      const high = Math.min(head - 0.5, foot + 6.4);
      const a = center - 1.05, b = center + 1.05, c = a + 0.40, d = b - 0.40;
      for (const [left, lz, right, rz] of [[a, 0, c, 0.49], [c, 0.49, d, 0.49], [d, 0.49, b, 0]]) {
        quad([left, low, lz], [right, low, rz], [right, high, rz], [left, high, lz], wall, brick);
        for (let sill = low + 0.53; sill + 1.46 < high; sill += 3) {
          const p = (u, y, bias) => [left + (right - left) * u, y, lz + (rz - lz) * u + bias];
          quad(p(0.13, sill, 0.02), p(0.87, sill, 0.02), p(0.87, sill + 1.45, 0.02), p(0.13, sill + 1.45, 0.02), TRIM);
          quad(p(0.23, sill + 0.12, 0.04), p(0.77, sill + 0.12, 0.04), p(0.77, sill + 1.33, 0.04), p(0.23, sill + 1.33, 0.04), GLASS, SURF.glass);
          quad(p(0.23, sill + 0.66, 0.06), p(0.77, sill + 0.66, 0.06), p(0.77, sill + 0.73, 0.06), p(0.23, sill + 0.73, 0.06), TRIM);
        }
      }
      quad([a, high, 0], [c, high, 0.49], [d, high, 0.49], [b, high, 0], STONE, SURF.slate);
      quad([b, low, 0], [d, low, 0.49], [c, low, 0.49], [a, low, 0], STONE);
    }
    if (Math.abs(tops[1] - tops[0]) < 0.35) {
      box(0.02, head - 0.36, -0.03, length - 0.02, head - 0.14, 0.15, TRIM);
      box(0.02, head - 0.16, -0.03, length - 0.02, head - 0.06, 0.23, TRIM);
    }
  } else if (mode === 'shop') {
    const count = Math.max(1, Math.min(8, Math.round(length / 5.8)));
    const width = length / count;
    for (let k = 0; k < count; k++) {
      const left = k * width + 0.25;
      const right = (k + 1) * width - 0.25;
      const base = level((left + right) / 2) + 0.07;
      if (base + 3.6 >= head) continue;
      const door = right - 0.95;
      box(left, base, -0.01, right, base + 3.35, 0.12, accent, SURF.paint);
      box(left + 0.15, base + 0.60, 0.12, door - 0.10, base + 2.55, 0.15, GLASS, SURF.glass);
      box(door + 0.055, base + 0.2, 0.12, right - 0.13, base + 2.55, 0.15, GLASS, SURF.glass);
      box(left + 0.14, base + 2.68, 0.12, right - 0.14, base + 2.99, 0.15, GLASS, SURF.glass);
      box(left, base + 3.06, 0.12, right, base + 3.42, 0.21, TRIM);
      if ((k + Math.round(variant * 9)) % 3 === 0 && !overRoad((left + right) / 2, 1)) {
        quad([left, base + 3.02, 0.2], [right, base + 3.02, 0.2], [right, base + 2.77, 1.04], [left, base + 2.77, 1.04], accent, SURF.cloth);
        quad([left, base + 2.77, 1.04], [right, base + 2.77, 1.04], [right, base + 2.64, 1.04], [left, base + 2.64, 1.04], accent, SURF.cloth);
      }
    }
  } else {
    const footY = level(length / 2);
    const base = footY + 4.75;
    const top = Math.min(base + 9, head - 0.65);
    if (top - base < 3) return;
    const count = Math.max(3, Math.min(12, Math.round(length / 4.2)));
    const stone = wall.clone().lerp(TRIM, 0.35);
    box(0, base - 0.32, -0.02, length, base, 0.22, stone);
    box(0, top - 0.07, -0.02, length, top + 0.36, 0.33, stone);
    for (let k = 0; k < count; k++) {
      const u = (k + 0.5) * length / count;
      box(u - 0.29, base, -0.02, u + 0.29, top, 0.25, stone);
      box(u - 0.43, base, -0.02, u + 0.43, base + 0.42, 0.35, stone);
      box(u - 0.43, top - 0.42, -0.02, u + 0.43, top, 0.35, stone);
    }
    const u = length / 2;
    box(u - 1.65, footY, -0.02, u + 1.65, base - 0.31, 0.24, stone);
    box(u - 1.29, footY + 0.12, 0.24, u + 1.29, base - 0.95, 0.26, accent, SURF.paint);
    box(u - 1.48, base - 0.89, 0.22, u + 1.48, base - 0.52, 0.36, stone);
  }
}
