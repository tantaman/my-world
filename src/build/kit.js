// Flat-sided things made of quads, boxes and panels: a shop and its shelves,
// a clubhouse, a ship's fittings, a car. Vertex-coloured geometry, gathered
// into one mesh per material.
//
// This is the second of the two builders (the other is Mesher, geometry.js,
// which welds whole geometries and carries what each surface is made of, for
// the building material). A Kit is for what is drawn with a plain
// vertex-coloured material: it leaves faces off a box where they'd never be
// seen, gives a quad a uv to take a picture from an atlas, and writes words
// in little squares (font.js).
//
//   const k = new Kit();
//   k.box(x0, y0, z0, x1, y1, z1, color, 'y-');     // no underside
//   k.words('OPEN', x, y, z, 0, 1, 0.05, color);
//   const mesh = new THREE.Mesh(k.build(), material);

import * as THREE from 'three';
import { layout } from './font.js';

export class Kit {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = [];
  }

  // a flat four-cornered piece, a b c d round it (anticlockwise seen from
  // the front), facing n; uv: [u0, v0, u1, v1] across it, v0 at the top
  quad(a, b, c, d, n, color, uv = null) {
    for (const [p, t] of [
      [a, [0, 1]],
      [b, [1, 1]],
      [c, [1, 0]],
      [a, [0, 1]],
      [c, [1, 0]],
      [d, [0, 0]],
    ]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(color.r, color.g, color.b);
      if (uv) this.uv.push(uv[0] + (uv[2] - uv[0]) * t[0], uv[1] + (uv[3] - uv[1]) * t[1]);
      else this.uv.push(0, 0);
    }
  }

  // a box from (x0, y0, z0) to (x1, y1, z1); skip: faces to leave off
  // ('x-', 'x+', 'y-', 'y+', 'z-', 'z+')
  box(x0, y0, z0, x1, y1, z1, color, skip = '') {
    const f = (k) => !skip.includes(k);
    if (f('z+')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], color);
    if (f('z-')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], color);
    if (f('x+')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], color);
    if (f('x-')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], color);
    if (f('y+')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], color);
    if (f('y-')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], color);
  }

  // an upright panel facing (nx, nz), its middle at (x, y, z), w across and
  // h up; uv as for quad
  panel(x, y, z, nx, nz, w, h, color, uv = null) {
    const ux = nz;
    const uz = -nx; // to the right, seen from in front
    const hw = w / 2;
    const hh = h / 2;
    this.quad([x - ux * hw, y - hh, z - uz * hw], [x + ux * hw, y - hh, z + uz * hw], [x + ux * hw, y + hh, z + uz * hw], [x - ux * hw, y + hh, z - uz * hw], [nx, 0, nz], color, uv);
  }

  // words in the 5 × 7 font (small: 3 × 5) on an upright, facing (nx, nz),
  // middled on (x, y, z), each square px across; deep: squares that stand
  // out from what they're on this far, as a sign's letters do
  words(text, x, y, z, nx, nz, px, color, { deep = 0, small = false } = {}) {
    const L = layout(text, small);
    const ux = nz;
    const uz = -nx;
    const left = (-L.width * px) / 2;
    const top = (L.height * px) / 2;
    for (const [i, j] of L.dots) {
      const a = left + i * px;
      const v = top - j * px;
      const cx = x + ux * (a + px / 2) + nx * deep;
      const cz = z + uz * (a + px / 2) + nz * deep;
      this.panel(cx, y + v - px / 2, cz, nx, nz, px * 0.96, px * 0.96, color);
      if (deep > 0.001) {
        // the sides of each square, back to what it's on
        const bx = cx - nx * deep;
        const bz = cz - nz * deep;
        this.box(Math.min(cx, bx) - (Math.abs(ux) * px) / 2, y + v - px, Math.min(cz, bz) - (Math.abs(uz) * px) / 2, Math.max(cx, bx) + (Math.abs(ux) * px) / 2, y + v, Math.max(cz, bz) + (Math.abs(uz) * px) / 2, color.clone().multiplyScalar(0.55), nx > 0 ? 'x+' : nx < 0 ? 'x-' : nz > 0 ? 'z+' : 'z-');
      }
    }
    return L.width * px;
  }

  get empty() {
    return this.pos.length === 0;
  }

  build(withUv = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (withUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}
