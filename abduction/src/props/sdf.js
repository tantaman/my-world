// Shapes from signed distance functions, meshed once when the page loads:
// for things that are all smooth curves (an animal), which are easier said
// as "these bones and these swellings, blended" than built from boxes.
//
//   const f = (x, y, z) => smin(sphere(x, y, z, 0.3), capsule(...), 0.05);
//   const geometry = mesh(f, { min: [x0, y0, z0], max: [x1, y1, z1], step: 0.02, colour });
//
// The mesher is surface nets: a vertex in each cell the surface passes
// through, at the mean of where it crosses the cell's edges, pulled onto the
// surface, and a quad across each edge the surface crosses. Normals come
// from the field's gradient, so they are smooth. colour(x, y, z) -> [r, g, b]
// (linear) paints each vertex, if given.
import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu';

// ---- distances (iq's, https://iquilezles.org/articles/distfunctions/)

export const sphere = (x, y, z, cx, cy, cz, r) => Math.hypot(x - cx, y - cy, z - cz) - r;

// An ellipsoid's distance, approximate (good near its surface).
export function ellipsoid(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.hypot(px, py, pz);
  const k1 = Math.hypot(px / rx, py / ry, pz / rz);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}

// A cone with round ends between a (radius ra) and b (radius rb).
export function roundCone(x, y, z, a, b, ra, rb) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const pax = x - a[0], pay = y - a[1], paz = z - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const yv = pax * bax + pay * bay + paz * baz;
  const zv = yv - l2;
  const qx = pax * l2 - bax * yv, qy = pay * l2 - bay * yv, qz = paz * l2 - baz * yv;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = yv * yv * l2;
  const z2 = zv * zv * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(zv) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
  if (Math.sign(yv) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
  return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - ra;
}

export const capsule = (x, y, z, a, b, r) => roundCone(x, y, z, a, b, r, r);

// Smooth union over k metres.
export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// Smooth subtraction of b from a.
export function ssub(a, b, k) {
  const h = Math.max(k - Math.abs(-a - b), 0) / k;
  return Math.max(a, -b) + h * h * k * 0.25;
}

// ---- noise in 3D, -1..1, deterministic (for patterns on what is meshed)

const P = new Uint8Array(512);
{
  let s = 97531;
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    s = (s * 1103515245 + 12345) >>> 0;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
}
const G = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const X = xi & 255, Y = yi & 255, Z = zi & 255;
  const g = (i, j, k) => { const v = G[P[P[P[X + i] + Y + j] + Z + k] % 12]; return v[0] * (xf - i) + v[1] * (yf - j) + v[2] * (zf - k); };
  const u = fade(xf), v = fade(yf), w = fade(zf);
  return lerp(
    lerp(lerp(g(0, 0, 0), g(1, 0, 0), u), lerp(g(0, 1, 0), g(1, 1, 0), u), v),
    lerp(lerp(g(0, 0, 1), g(1, 0, 1), u), lerp(g(0, 1, 1), g(1, 1, 1), u), v),
    w,
  );
}

export function fbm3(x, y, z, octaves = 3) {
  let sum = 0, amp = 0.55, f = 1;
  for (let o = 0; o < octaves; o++) { sum += amp * noise3(x * f + o * 7.1, y * f, z * f - o * 3.3); f *= 2.03; amp *= 0.5; }
  return sum;
}

// ---- the mesher

export function mesh(f, { min, max, step, colour = null, refine = 2 }) {
  const nx = Math.ceil((max[0] - min[0]) / step), ny = Math.ceil((max[1] - min[1]) / step), nz = Math.ceil((max[2] - min[2]) / step);
  const sx = nx + 1, sy = ny + 1;
  const v = new Float32Array(sx * sy * (nz + 1));
  for (let k = 0; k <= nz; k++) {
    const z = min[2] + k * step;
    for (let j = 0; j <= ny; j++) {
      const y = min[1] + j * step;
      for (let i = 0; i <= nx; i++) v[i + sx * (j + sy * k)] = f(min[0] + i * step, y, z);
    }
  }
  const at = (i, j, k) => v[i + sx * (j + sy * k)];
  const cell = new Int32Array(nx * ny * nz).fill(-1);
  const cid = (i, j, k) => i + nx * (j + ny * k);
  const pos = [];
  const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const c = new Float32Array(8);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let inside = 0;
        for (let q = 0; q < 8; q++) { c[q] = at(i + CORNERS[q][0], j + CORNERS[q][1], k + CORNERS[q][2]); if (c[q] < 0) inside++; }
        if (inside === 0 || inside === 8) continue;
        let px = 0, py = 0, pz = 0, n = 0;
        for (const [a, b] of EDGES) {
          if ((c[a] < 0) === (c[b] < 0)) continue;
          const t = c[a] / (c[a] - c[b]);
          px += CORNERS[a][0] + (CORNERS[b][0] - CORNERS[a][0]) * t;
          py += CORNERS[a][1] + (CORNERS[b][1] - CORNERS[a][1]) * t;
          pz += CORNERS[a][2] + (CORNERS[b][2] - CORNERS[a][2]) * t;
          n++;
        }
        cell[cid(i, j, k)] = pos.length / 3;
        pos.push(min[0] + (i + px / n) * step, min[1] + (j + py / n) * step, min[2] + (k + pz / n) * step);
      }
    }
  }
  const idx = [];
  const quad = (a, b, cc, d, flip) => {
    if (a < 0 || b < 0 || cc < 0 || d < 0) return;
    if (flip) idx.push(a, cc, b, a, d, cc); else idx.push(a, b, cc, a, cc, d);
  };
  for (let k = 0; k <= nz; k++) {
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const v0 = at(i, j, k) < 0;
        if (i < nx && j > 0 && k > 0 && j < ny && k < nz && v0 !== (at(i + 1, j, k) < 0)) {
          quad(cell[cid(i, j - 1, k - 1)], cell[cid(i, j, k - 1)], cell[cid(i, j, k)], cell[cid(i, j - 1, k)], !v0);
        }
        if (j < ny && i > 0 && k > 0 && i < nx && k < nz && v0 !== (at(i, j + 1, k) < 0)) {
          quad(cell[cid(i - 1, j, k - 1)], cell[cid(i - 1, j, k)], cell[cid(i, j, k)], cell[cid(i, j, k - 1)], !v0);
        }
        if (k < nz && i > 0 && j > 0 && i < nx && j < ny && v0 !== (at(i, j, k + 1) < 0)) {
          quad(cell[cid(i - 1, j - 1, k)], cell[cid(i, j - 1, k)], cell[cid(i, j, k)], cell[cid(i - 1, j, k)], !v0);
        }
      }
    }
  }
  // Onto the surface, and the gradient for normals.
  const e = step * 0.25;
  const nor = new Float32Array(pos.length);
  const col = colour ? new Float32Array(pos.length) : null;
  for (let p = 0; p < pos.length; p += 3) {
    let x = pos[p], y = pos[p + 1], z = pos[p + 2];
    let gx = 0, gy = 0, gz = 0;
    for (let r = 0; r <= refine; r++) {
      gx = f(x + e, y, z) - f(x - e, y, z);
      gy = f(x, y + e, z) - f(x, y - e, z);
      gz = f(x, y, z + e) - f(x, y, z - e);
      if (r === refine) break;
      const g2 = (gx * gx + gy * gy + gz * gz) / (4 * e * e);
      if (g2 < 1e-8) break;
      const d = f(x, y, z);
      const move = Math.max(-step * 0.5, Math.min(step * 0.5, d / g2));
      x -= (gx / (2 * e)) * move;
      y -= (gy / (2 * e)) * move;
      z -= (gz / (2 * e)) * move;
    }
    pos[p] = x; pos[p + 1] = y; pos[p + 2] = z;
    const l = Math.hypot(gx, gy, gz) || 1;
    nor[p] = gx / l; nor[p + 1] = gy / l; nor[p + 2] = gz / l;
    if (col) { const rgb = colour(x, y, z); col[p] = rgb[0]; col[p + 1] = rgb[1]; col[p + 2] = rgb[2]; }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  if (col) g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
