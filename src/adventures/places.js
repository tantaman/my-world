// Finding somewhere for an adventure: water to get into ahead of a fire, a
// mountainside for snow to come down, a clearing to build a camp in, the
// nearest roof or cave out of a storm. Nothing here changes the world; it
// only looks at it, through what it is handed, so it can be tried in Node:
//
//   height(x, z)         the ground there
//   depth(x, z)          how deep the water is there (< 0, or -Infinity, on dry land)
//   trees(x, z, r)       how many trees stand within r of there
//   off(x0, z0, x1, z1)  is any of that box somewhere an adventure mustn't go
//                        (a real place brought in from a photo, say)

// How steep the ground is at (x, z), measured `d` metres either way, and
// which way is down. -> { slope (rise over run), ux, uz (downhill, unit) }
export function slopeAt(height, x, z, d = 6) {
  const gx = (height(x + d, z) - height(x - d, z)) / (2 * d);
  const gz = (height(x, z + d) - height(x, z - d)) / (2 * d);
  const slope = Math.hypot(gx, gz);
  return { slope, ux: slope > 1e-6 ? -gx / slope : 1, uz: slope > 1e-6 ? -gz / slope : 0 };
}

// The nearest water at least `deep` metres deep, within `far` of (x, z),
// looked for ring by ring. -> { x, z, d } or null
export function findWater(depth, x, z, { far = 520, deep = 0.55, step = 8 } = {}) {
  if (depth(x, z) >= deep) return { x, z, d: 0 };
  for (let r = step; r <= far; r += step) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / step));
    let best = null;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.sin(a) * r;
      const pz = z + Math.cos(a) * r;
      if (depth(px, pz) >= deep) {
        // a little further in, where it's surely deep enough
        const qx = x + Math.sin(a) * (r + step * 0.5);
        const qz = z + Math.cos(a) * (r + step * 0.5);
        best = depth(qx, qz) >= deep ? { x: qx, z: qz, d: r + step * 0.5 } : { x: px, z: pz, d: r };
        break;
      }
    }
    if (best) return best;
  }
  return null;
}

// Somewhere steep and high within `far` of (x, z): the best of a grid of
// spots, weighing how steep against how far. -> { x, z, slope, ux, uz } or
// null if nowhere is steep enough.
export function findSlope(height, x, z, { far = 900, steep = 0.38, step = 24, off = () => false } = {}) {
  const here = slopeAt(height, x, z, 10);
  if (here.slope >= steep * 1.15) return { x, z, ...here };
  let best = null;
  let bestScore = -Infinity;
  for (let dz = -far; dz <= far; dz += step) {
    for (let dx = -far; dx <= far; dx += step) {
      const d = Math.hypot(dx, dz);
      if (d > far) continue;
      const px = x + dx;
      const pz = z + dz;
      const s = slopeAt(height, px, pz, 10);
      if (s.slope < steep) continue;
      // the whole fall line above it should be steep too: snow needs a run
      const up = slopeAt(height, px - s.ux * 40, pz - s.uz * 40, 10);
      if (up.slope < steep * 0.8) continue;
      if (off(px - 60, pz - 60, px + 60, pz + 60)) continue;
      const score = s.slope + up.slope - d / 900;
      if (score > bestScore) {
        bestScore = score;
        best = { x: px, z: pz, ...s };
      }
    }
  }
  return best;
}

// A clearing for a camp `radius` across, between `near` and `far` metres
// from (x, z): as flat, dry and treeless as can be found, in reach, and
// clear of whatever `keep(x, z)` says to keep away from. -> { x, z, yaw } or null
export function findClearing({ height, depth, trees, off, keep = () => false }, x, z, { near = 170, far = 260, radius = 22, tries = 48, rnd = Math.random } = {}) {
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < tries; i++) {
    const a = rnd() * Math.PI * 2;
    const r = near + rnd() * (far - near);
    const px = x + Math.sin(a) * r;
    const pz = z + Math.cos(a) * r;
    if (off(px - radius - 10, pz - radius - 10, px + radius + 10, pz + radius + 10) || keep(px, pz)) continue;
    let lo = Infinity;
    let hi = -Infinity;
    let wet = false;
    for (let k = 0; k < 9 && !wet; k++) {
      const b = (k / 8) * Math.PI * 2;
      const q = k === 8 ? 0 : radius;
      const qx = px + Math.sin(b) * q;
      const qz = pz + Math.cos(b) * q;
      const h = height(qx, qz);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
      if (depth(qx, qz) > -0.3) wet = true;
    }
    if (wet) continue;
    const rough = hi - lo;
    if (rough > radius * 0.35) continue;
    const score = -rough * 1.5 - trees(px, pz, radius) * 0.6 - Math.abs(r - (near + far) / 2) / 60;
    if (score > bestScore) {
      bestScore = score;
      best = { x: px, z: pz, yaw: Math.atan2(x - px, z - pz) };
    }
  }
  return best;
}

// The nearest of some places to (x, z): [{ x, z, ... }] -> { ..., d } or null
export function nearest(list, x, z) {
  let best = null;
  for (const p of list) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (!best || d < best.d) best = { ...p, d };
  }
  return best;
}
