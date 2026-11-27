// Shared pieces for the materials, procedural: noise in metres, a
// coordinate on whichever face a fragment is on, and a bump from any height.
// (The photo-scanned surfaces are materials/textures.js.)
import {
  Fn, vec2, vec3, float, mx_noise_float, mx_fractal_noise_float, positionWorld, normalWorld, positionView, normalView,
  abs, select, dFdx, dFdy, cross, dot, normalize, sign, faceDirection, smoothstep, hash, floor, fract, mix, min, length,
} from 'three/tsl';

// Perlin noise in -1..1 (roughly), at a scale of `size` metres.
export const noise3 = (p, size = 1) => mx_noise_float(p.div(size));
export const noise2 = (p, size = 1) => mx_noise_float(vec3(p.div(size), 0.0));

// Fractal noise in about -1..1.
export const fbm3 = (p, size = 1, octaves = 4) => mx_fractal_noise_float(p.div(size), octaves, 2.0, 0.5).mul(0.9);
export const fbm2 = (p, size = 1, octaves = 4) => mx_fractal_noise_float(vec3(p.div(size), 0.0), octaves, 2.0, 0.5).mul(0.9);

// A 0..1 version.
export const fbm01 = (p, size = 1, octaves = 4) => fbm3(p, size, octaves).mul(0.5).add(0.5);

// The coordinate across the face a fragment is on, in metres: xz on floors
// and ceilings, zy on walls facing X, xy on walls facing Z. (A box's faces
// are flat, so this is all the "UV" a weathered surface needs.)
export const faceUV = Fn(() => {
  const n = normalWorld;
  const p = positionWorld;
  return select(abs(n.y).greaterThan(0.6), p.xz, select(abs(n.x).greaterThan(abs(n.z)), vec2(p.z, p.y), vec2(p.x, p.y)));
});

// The view-space normal bent by the screen-space slope of a height (metres
// times scale): the surface's own normal, or `base` (a view-space normal
// already bent by a normal map).
export const bumpNormal = Fn(([height, scale, base]) => {
  const dHdxy = vec2(dFdx(height), dFdy(height)).mul(scale);
  const vSigmaX = dFdx(positionView);
  const vSigmaY = dFdy(positionView);
  const vN = base ?? normalView;
  const R1 = cross(vSigmaY, vN);
  const R2 = cross(vN, vSigmaX);
  const fDet = dot(vSigmaX, R1).mul(faceDirection);
  const vGrad = sign(fDet).mul(dHdxy.x.mul(R1).add(dHdxy.y.mul(R2)));
  return normalize(abs(fDet).mul(vN).sub(vGrad));
});

// Cells of a 2D Voronoi pattern: distance to the nearest edge, for cracks.
export const cellEdge = Fn(([p]) => {
  const cell = floor(p);
  const f = fract(p);
  const best = vec2(8.0, 8.0).toVar();
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const g = vec2(i, j);
      const c = cell.add(g);
      const o = vec2(hash(c.x.add(c.y.mul(57.0))), hash(c.x.mul(13.0).add(c.y.mul(31.0)).add(7.0)));
      const d = length(g.add(o).sub(f));
      const closer = d.lessThan(best.x);
      best.y.assign(select(closer, best.x, min(best.y, d)));
      best.x.assign(select(closer, d, best.x));
    }
  }
  return best.y.sub(best.x);
});
