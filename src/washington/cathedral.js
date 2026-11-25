// The Cathedral exterior from its survey and its own architectural guide.
// The four corners of the central tower locate the axes. Heights below
// are in the survey's datum, then converted to game heights by the caller.

import * as THREE from 'three';
import { SURF } from '../build/surfaces.js';
import { architecture } from './architecture.js';

const ANGLE = Math.atan2(-6, 16.5);
const C = Math.cos(ANGLE);
const S = Math.sin(ANGLE);
const LIMESTONE = new THREE.Color(0xc7bda9);
const TRIM = new THREE.Color(0xddd0b9);
const DARK = new THREE.Color(0x383b3d);
const DOOR = new THREE.Color(0x392f27);
const ROOF = new THREE.Color(0x515256);
const GLASS = [0x304462, 0x462e4e, 0x375053, 0x635841, 0x51343d].map((color) => new THREE.Color(color));

export function buildCathedral(batch, { x, z, top, ground, detail }) {
  const datum = top - 193.3;
  const point = (u, y, v) => [x + u * C - v * S, y + datum, z + u * S + v * C];
  const form = architecture(batch, point);
  const face = (axis, at, sign) => architecture(batch, (along, y, depth) => axis === 'x'
    ? point(at + sign * depth, y, along)
    : point(along, y, at + sign * depth));
  const foundation = (u, v) => {
    const [gx, , gz] = point(u, 0, v);
    return Math.min(124, ground(gx, gz) - datum) - 0.35;
  };
  const house = (left, right, width, eave, ridge) => {
    form.box(left, Math.min(foundation(left, 0), foundation(right, 0)), -width, right, eave, width, LIMESTONE);
    form.quad([left, eave, -width], [right, eave, -width], [right, ridge, 0], [left, ridge, 0], ROOF, SURF.slate);
    form.quad([left, ridge, 0], [right, ridge, 0], [right, eave, width], [left, eave, width], ROOF, SURF.slate);
    form.triangle([left, eave, -width], [left, ridge, 0], [left, eave, width], LIMESTONE);
    form.triangle([right, eave, width], [right, ridge, 0], [right, eave, -width], LIMESTONE);
    for (const v of [-width, width]) {
      form.box(left, eave - 0.48, v - 0.22, right, eave + 0.16, v + 0.22, TRIM);
    }
  };

  // Nave, side aisles and the eastern choir. The side walls sit lower than
  // the clerestory, leaving space for windows above the aisle roofs.
  house(-87.5, 53, 8.6, 146.5, 158.7);
  for (const side of [-1, 1]) {
    const z0 = Math.min(8.4 * side, 16.8 * side);
    const z1 = Math.max(8.4 * side, 16.8 * side);
    const foot = Math.min(foundation(-74, 13 * side), foundation(50, 13 * side));
    form.box(-80, foot, z0, 52, 131, z1, LIMESTONE);
    form.quad([-80, 131, 16.8 * side], [52, 131, 16.8 * side], [52, 135, 8.4 * side], [-80, 135, 8.4 * side], ROOF, SURF.slate);
    form.box(-9.3, foundation(0, 30 * side), Math.min(8 * side, 30 * side), 9.3, 146, Math.max(8 * side, 30 * side), LIMESTONE);
    form.quad([-9.3, 146, 8 * side], [-9.3, 146, 30 * side], [0, 157, 30 * side], [0, 157, 8 * side], ROOF, SURF.slate);
    form.quad([0, 157, 8 * side], [0, 157, 30 * side], [9.3, 146, 30 * side], [9.3, 146, 8 * side], ROOF, SURF.slate);
    form.triangle([-9.3, 146, 30 * side], [9.3, 146, 30 * side], [0, 157, 30 * side], LIMESTONE);
    const transept = face('z', 30 * side, side);
    arch(transept, 0, 131, 5, 5.2, GLASS[1], detail);
    rose(transept, 0, 141.1, 3.65, detail);
    const clerestory = face('z', 8.6 * side, side);
    const aisle = face('z', 16.8 * side, side);
    for (const u of [-64, -54, -44, -34, -24, -14, 14, 24, 34, 44]) {
      arch(clerestory, u, 136.6, 2.5, 6.8, GLASS[2], detail);
      arch(aisle, u, 122.2, 2.05, 5.7, GLASS[0], detail);
      buttress(form, u - 4, side, foundation(u - 4, side * 18.3), detail);
    }
  }
  form.box(51, Math.min(foundation(55, 0), foundation(51, 7)), -7.3, 59, 137.7, 7.3, LIMESTONE);
  form.box(59, foundation(60, 0), -4.25, 61.5, 135.4, 4.25, LIMESTONE);
  form.quad([52, 137.7, -7.3], [59, 137.7, -7.3], [61.5, 135.4, -4.25], [61.5, 141, 0], ROOF, SURF.slate);
  form.quad([61.5, 141, 0], [61.5, 135.4, 4.25], [59, 137.7, 7.3], [52, 137.7, 7.3], ROOF, SURF.slate);
  arch(face('x', 61.5, 1), 0, 123, 4.6, 10.6, GLASS[0], detail);

  // The landmark's three tower silhouettes are visible even in a distant tile.
  tower(-79.25, -13.85, 6.55, 6.35, 178.6, foundation(-85, -14), false);
  tower(-79.25, 12.65, 6.55, 6.2, 178.8, foundation(-85, 13), false);
  tower(0, 0, 8.8, 8.4, 193.3, 143, true);

  // West entrance, with three portals under the rose window.
  form.box(-88.6, foundation(-89, 0), -7.6, -86.8, 149.2, 7.0, LIMESTONE);
  form.triangle([-88.6, 148.4, -7.6], [-88.6, 156.5, -0.35], [-88.6, 148.4, 7], TRIM);
  const west = face('x', -88.6, -1);
  const entry = Math.max(114, foundation(-89, 0) + 0.45);
  for (const u of [-4.9, -0.3, 4.3]) {
    arch(west, u, entry, u === -0.3 ? 3.5 : 2.7, u === -0.3 ? 9.9 : 7.4, DOOR, detail);
  }
  rose(west, -0.3, 140.5, 5.1, detail);
  west.box(-7.5, 132.4, 0.0, 7, 133, 0.38, TRIM);
  for (let i = 0; i < 4; i++) form.box(-91.7 + i * 0.67, entry - 1.0, -7.3, -88.5, entry - (3 - i) * 0.22, 6.7, TRIM);

  function tower(u, v, w, d, high, low, central) {
    form.box(u - w, low, v - d, u + w, high - 2.5, v + d, LIMESTONE);
    for (const y of [high - 25, high - 13, high - 3]) form.box(u - w - 0.32, y, v - d - 0.32, u + w + 0.32, y + 0.72, v + d + 0.32, TRIM);
    for (const side of [-1, 1]) {
      const front = face('x', u + side * w, side);
      const flank = face('z', v + side * d, side);
      for (const shift of [-0.52, 0, 0.52]) {
        arch(front, v + d * shift, high - 20.8, central ? 2.8 : 2.1, 14, DARK, detail);
        arch(flank, u + w * shift, high - 20.8, central ? 2.8 : 2.1, 14, DARK, detail);
      }
      if (!central) {
        arch(front, v, high - 45, 4.9, 13, GLASS[2], detail);
        arch(flank, u, high - 45, 4.9, 13, GLASS[0], detail);
      }
      for (let k = -2; k <= 2; k++) {
        const a = (k * d) / 2.75;
        const b = (k * w) / 2.75;
        front.box(v + a - 0.48, high - 2.55, -0.7, v + a + 0.48, high + 0.65, 0.25, TRIM);
        flank.box(u + b - 0.48, high - 2.55, -0.7, u + b + 0.48, high + 0.65, 0.25, TRIM);
      }
      for (const other of [-1, 1]) {
        const x = u + side * (w - 0.85);
        const z = v + other * (d - 0.85);
        form.box(x - 1.2, Math.max(low, high - 38), z - 1.2, x + 1.2, high + 2.1, z + 1.2, LIMESTONE);
        pinnacle(form, x, z, high + 2.1, central ? 6.2 : 7.3, 1.22);
      }
    }
  }
}

function arch(form, x, y, width, height, glass, detail) {
  const half = width / 2;
  const spring = height - half * 0.95;
  const ring = (scale, depth) => {
    const a = [[x - half * scale, y, depth], [x + half * scale, y, depth]];
    const steps = detail ? 10 : 6;
    for (let k = 0; k <= steps; k++) {
      const t = (k / steps) * 2 - 1;
      a.push([x - half * scale * t, y + spring + half * scale * 0.95 * (1 - Math.abs(t) ** 1.55), depth]);
    }
    return a;
  };
  const a = ring(1, 0.13);
  const b = ring(1.18, 0.25);
  for (let k = 2; k < a.length; k++) form.triangle(a[0], a[k - 1], a[k], glass, SURF.plain);
  for (let k = 1; k < a.length; k++) form.quad(a[k - 1], b[k - 1], b[k], a[k], TRIM);
  if (width > 2 && glass !== DOOR) {
    form.box(x - 0.065, y + 0.05, 0.13, x + 0.065, y + height - 0.3, 0.27, TRIM);
    form.box(x - half * 0.98, y + spring * 0.69, 0.12, x + half * 0.98, y + spring * 0.69 + 0.16, 0.24, TRIM);
  }
  form.box(x - half * 1.2, y - 0.23, 0.01, x + half * 1.2, y + 0.025, 0.34, LIMESTONE);
}

function rose(form, x, y, r, detail) {
  const points = (a, size, depth) => [x + Math.cos(a) * size, y + Math.sin(a) * size, depth];
  const n = detail ? 36 : 18;
  for (let k = 0; k < n; k++) {
    const a = k * 2 * Math.PI / n;
    const b = (k + 1) * 2 * Math.PI / n;
    form.triangle([x, y, 0.20], points(a, r, 0.20), points(b, r, 0.20), GLASS[Math.floor(k / 2) % GLASS.length], SURF.plain);
    form.quad(points(a, r, 0.21), points(b, r, 0.21), points(b, r * 1.13, 0.33), points(a, r * 1.13, 0.33), TRIM);
    if (k % 3 === 0) form.quad(points(a - 0.021, r, 0.25), points(a + 0.021, r, 0.25), points(a + 0.11, r * 0.17, 0.25), points(a - 0.11, r * 0.17, 0.25), TRIM);
    form.quad(points(a, r * 0.53, 0.25), points(b, r * 0.53, 0.25), points(b, r * 0.59, 0.25), points(a, r * 0.59, 0.25), TRIM);
  }
}

function pinnacle(form, x, z, y, height, w) {
  const top = [x, y + height, z];
  const v = [[x - w, y, z - w], [x + w, y, z - w], [x + w, y, z + w], [x - w, y, z + w]];
  for (let i = 0; i < v.length; i++) form.triangle(v[i], top, v[(i + 1) % v.length], TRIM);
}

function buttress(form, x, side, low, detail) {
  const pier = 18.25 * side;
  form.box(x - 0.92, low, pier - 1.0, x + 0.92, 132.4, pier + 1.0, LIMESTONE);
  form.box(x - 1.08, 130.5, pier - 1.12, x + 1.08, 131.15, pier + 1.12, TRIM);
  pinnacle(form, x, pier, 132.4, 3.5, 0.93);
  const n = detail ? 6 : 3;
  const bridge = (t, dx, high) => [x + dx, 130.0 + 12.7 * (1 - (1 - t) ** 1.7) + high, (18.25 - 9.9 * t) * side];
  for (let i = 0; i < n; i++) {
    const a = i / n, b = (i + 1) / n;
    for (const edge of [-0.46, 0.46]) form.quad(bridge(a, edge, 0), bridge(b, edge, 0), bridge(b, edge, 1.2), bridge(a, edge, 1.2), LIMESTONE);
    form.quad(bridge(a, -0.46, 1.2), bridge(a, 0.46, 1.2), bridge(b, 0.46, 1.2), bridge(b, -0.46, 1.2), TRIM);
  }
}
