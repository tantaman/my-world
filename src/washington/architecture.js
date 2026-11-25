// Small solids drawn straight into a city batch, in the axes of a façade.

import { SURF } from '../build/surfaces.js';

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function architecture(batch, point) {
  const quad = (a, b, c, d, color, surface = SURF.masonry) => {
    const u = distance(a, b);
    const v = distance(a, d);
    batch.quad(point(...a), point(...b), point(...c), point(...d), color.r, color.g, color.b, surface, [0, 0, u, 0, u, v, 0, v]);
  };
  const triangle = (a, b, c, color, surface = SURF.masonry) => {
    const [p, q, r] = [point(...a), point(...b), point(...c)];
    const [ux, uy, uz] = q.map((v, i) => v - p[i]);
    const [vx, vy, vz] = r.map((v, i) => v - p[i]);
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (!length) return;
    const k = batch.n;
    for (const [i, v] of [p, q, r].entries()) {
      batch.vertex(...v, nx / length, ny / length, nz / length, color.r, color.g, color.b, surface, i === 1 ? distance(a, b) : 0, i === 2 ? distance(a, c) : 0);
    }
    batch.tri(k, k + 1, k + 2);
  };
  const box = (x0, y0, z0, x1, y1, z1, color, surface) => {
    if (x0 >= x1 || y0 >= y1 || z0 >= z1) return;
    const a = [x0, y0, z0], b = [x1, y0, z0], c = [x1, y0, z1], d = [x0, y0, z1];
    const e = [x0, y1, z0], f = [x1, y1, z0], g = [x1, y1, z1], h = [x0, y1, z1];
    quad(b, a, e, f, color, surface);
    quad(d, c, g, h, color, surface);
    quad(a, d, h, e, color, surface);
    quad(c, b, f, g, color, surface);
    quad(e, h, g, f, color, surface);
    quad(a, b, c, d, color, surface);
  };
  return { quad, triangle, box };
}
