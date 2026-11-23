// Geometry written a face at a time, straight into a Mesher (geometry.js),
// with flat normals: the thousands of ties and planks of a railway, the
// panels of a hangar or a plane, don't each need a BufferGeometry of their
// own to be welded in.
//
//   const m = new Mesher();
//   quad(m, a, b, c, d, color);              // corners [x, y, z], in order round it
//   beam(m, from, to, wide, deep, color);
//   box(m, cx, cy, cz, hx, hy, hz, yaw, color);
//   new THREE.Mesh(m.build(), material);
//
// Each vertex goes in by the Mesher's own vertex(), which gives it what it's
// made of and its grain as well: the material that draws it reads those, and
// a mesh missing them isn't drawn at all.

import * as THREE from 'three';

const _base = new THREE.Color();
const _shade = new THREE.Color();

// Component k of (q - p) × (s - r), for [x, y, z] points.
function cross(p, q, r, s, k) {
  const i = (k + 1) % 3;
  const j = (k + 2) % 3;
  return (q[i] - p[i]) * (s[j] - r[j]) - (q[j] - p[j]) * (s[i] - r[i]);
}

// A flat four-sided face, its corners in order round it as seen from the
// side it faces. Corners are [x, y, z]; color is one THREE.Color, or one
// for each corner. A triangle is a quad with a corner given twice: c and d
// the same, or a and d (a fan round a hub, as a drum's end is).
export function quad(m, a, b, c, d, color) {
  // the way it faces: across its first corner, or, where that is no corner
  // (a and d the same), across its diagonals, which turn the same way
  let nx = cross(a, b, a, d, 0);
  let ny = cross(a, b, a, d, 1);
  let nz = cross(a, b, a, d, 2);
  if (Math.hypot(nx, ny, nz) < 1e-12) {
    nx = cross(a, c, b, d, 0);
    ny = cross(a, c, b, d, 1);
    nz = cross(a, c, b, d, 2);
  }
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  const [ca, cb, cc, cd] = Array.isArray(color) ? color : [color, color, color, color];
  const i = m.vertex(a[0], a[1], a[2], nx, ny, nz, ca);
  m.vertex(b[0], b[1], b[2], nx, ny, nz, cb);
  m.vertex(c[0], c[1], c[2], nx, ny, nz, cc);
  m.vertex(d[0], d[1], d[2], nx, ny, nz, cd);
  m.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
}

// A box from its eight corners: c[0..3] the bottom, c[4..7] the top, each
// going round the same way.
function box8(m, c, color) {
  _base.copy(color);
  const s = (k) => _shade.copy(_base).multiplyScalar(k);
  quad(m, c[4], c[5], c[6], c[7], s(1.08)); // top
  quad(m, c[3], c[2], c[1], c[0], s(0.7)); // bottom
  for (let k = 0; k < 4; k++) {
    const a = k;
    const b = (k + 1) % 4;
    quad(m, c[a], c[b], c[b + 4], c[a + 4], s(k % 2 ? 0.9 : 0.97));
  }
}

// A beam from a to b ([x, y, z]), w wide and h deep; `up` says which way
// its depth is turned (straight up, unless it runs straight up itself).
export function beam(m, a, b, w, h, color, up = null) {
  let dx = b[0] - a[0];
  let dy = b[1] - a[1];
  let dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return;
  dx /= len;
  dy /= len;
  dz /= len;
  let ux = up ? up[0] : 0;
  let uy = up ? up[1] : 1;
  let uz = up ? up[2] : 0;
  if (Math.abs(dx * ux + dy * uy + dz * uz) > 0.95) [ux, uy, uz] = [1, 0, 0];
  // side = d × up, top = side × d
  let sx = dy * uz - dz * uy;
  let sy = dz * ux - dx * uz;
  let sz = dx * uy - dy * ux;
  const sl = Math.hypot(sx, sy, sz);
  sx /= sl;
  sy /= sl;
  sz /= sl;
  const tx = sy * dz - sz * dy;
  const ty = sz * dx - sx * dz;
  const tz = sx * dy - sy * dx;
  const corner = (p, a1, a2) => [p[0] + sx * a1 * w * 0.5 + tx * a2 * h * 0.5, p[1] + sy * a1 * w * 0.5 + ty * a2 * h * 0.5, p[2] + sz * a1 * w * 0.5 + tz * a2 * h * 0.5];
  box8(m, [corner(a, -1, -1), corner(a, 1, -1), corner(b, 1, -1), corner(b, -1, -1), corner(a, -1, 1), corner(a, 1, 1), corner(b, 1, 1), corner(b, -1, 1)], color);
}

// A box turned to `yaw` about its middle (cx, cy, cz): hx across, hy up and
// hz along (half sizes).
export function box(m, cx, cy, cz, hx, hy, hz, yaw, color) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const at = (a, b, e) => [cx + a * hx * c + e * hz * s, cy + b * hy, cz - a * hx * s + e * hz * c];
  box8(m, [at(-1, -1, -1), at(1, -1, -1), at(1, -1, 1), at(-1, -1, 1), at(-1, 1, -1), at(1, 1, -1), at(1, 1, 1), at(-1, 1, 1)], color);
}
