// The surveyed Capitol roof records the dome as a few stepped shells. Fit
// the silhouette and East Front entrance to those same surveyed positions.
// Reference: Architect of the Capitol, Capitol Dome and Corinthian Columns.

import * as THREE from 'three';
import { SURF } from '../build/surfaces.js';

const STONE = new THREE.Color(0xe8e4da);
const IRON = new THREE.Color(0xeeeae0);
const SHADE = new THREE.Color(0x677077);
const BRONZE = new THREE.Color(0x36413a);
const UV = [0, 0, 0, 1, 1, 1, 1, 0];

// The height coordinates are relative to the surveyed base of the dome.
export function buildCapitol(batch, { x, z, base, ground, detail }) {
  const round = (r, y, nextR, nextY, color) => band(batch, x, z, base, r, y, nextR, nextY, color, detail ? 64 : 32);
  round(20.6, 0, 20.6, 3.2, STONE);
  round(20.6, 3.2, 16.3, 3.2, STONE);
  round(16.3, 3.2, 16.3, 21.8, SHADE);
  round(19.6, 20.8, 21, 21.3, IRON);
  round(21, 21.3, 21, 23, IRON);
  round(21, 23, 18.1, 23.5, IRON);
  // The curved iron shell springs from the colonnade and tapers to a lantern.
  const shell = [[18.1, 23.5], [17.8, 28], [17, 32.5], [15, 37], [12.4, 41], [9.2, 44.8], [5.2, 47.4], [4.5, 49]];
  for (let i = 1; i < shell.length; i++) round(...shell[i - 1], ...shell[i], IRON);
  round(4.5, 49, 4.5, 50.6, IRON);
  round(3.2, 50.6, 3.2, 57.2, SHADE);
  round(4.3, 56.6, 4.3, 58, IRON);
  round(4.3, 58, 2, 60.6, IRON);
  round(2, 60.6, 1.6, 61.8, IRON);
  round(1.25, 61.8, 0.8, 64.3, BRONZE);
  round(0.8, 64.3, 0.85, 65.9, BRONZE);
  round(0.85, 65.9, 0.42, 67.5, BRONZE);

  const ring = (count, radius, y0, y1, shaft) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      column(batch, x + radius * Math.cos(a), z + radius * Math.sin(a), base + y0, base + y1, shaft, IRON, detail);
    }
  };
  ring(36, 18.6, 3.2, 21.3, 0.52);
  ring(12, 3.75, 50.6, 56.8, 0.2);

  // The portico lines up with the center bay of the surveyed east façade.
  const front = x + 36.7;
  const left = z - 12.2;
  const right = z + 11.6;
  const eave = base - 2.2;
  for (let i = 0; i < 8; i++) {
    const at = left + 0.8 + (i / 7) * (right - left - 1.6);
    column(batch, front, at, ground(front, at) + 1.6, eave, 0.55, STONE, detail);
  }
  const ledge = front + 1;
  const quad = (a, b, c, d) => batch.quad(a, b, c, d, STONE.r, STONE.g, STONE.b, SURF.concrete, UV);
  quad([ledge, eave, right], [ledge, eave, left], [ledge, eave + 1, left], [ledge, eave + 1, right]);
  const a = [ledge, eave + 1, right];
  const b = [ledge, eave + 1, left];
  const peak = [ledge, eave + 6, (left + right) / 2];
  const k = batch.n;
  for (const [px, py, pz] of [a, b, peak]) batch.vertex(px, py, pz, 1, 0, 0, STONE.r * 0.85, STONE.g * 0.85, STONE.b * 0.85, SURF.concrete, pz, py);
  batch.tri(k, k + 1, k + 2);
  const back = x + 34.4;
  const ridge = [back, peak[1], peak[2]];
  quad(b, [back, b[1], b[2]], ridge, peak);
  quad(peak, ridge, [back, a[1], a[2]], a);
}

function column(batch, x, z, y0, y1, r, color, detail) {
  const steps = detail ? 10 : 6;
  const h = y1 - y0;
  band(batch, x, z, y0, r * 1.35, 0, r * 1.35, 0.65, color, steps);
  band(batch, x, z, y0, r, 0.65, r * 0.83, h - 0.7, color, steps);
  band(batch, x, z, y0, r * 0.83, h - 0.7, r * 1.32, h - 0.24, color, steps);
  band(batch, x, z, y0, r * 1.32, h - 0.24, r * 1.32, h, color, steps);
}

function band(batch, x, z, base, r0, y0, r1, y1, color, steps) {
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const b = ((i + 1) / steps) * Math.PI * 2;
    const point = (radius, y, angle) => [x + radius * Math.cos(angle), base + y, z + radius * Math.sin(angle)];
    batch.quad(point(r0, y0, a), point(r1, y1, a), point(r1, y1, b), point(r0, y0, b), color.r, color.g, color.b, SURF.concrete, UV);
  }
}
