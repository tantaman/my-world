// Small bits of plan-view geometry and chance that several systems share.
// (Seeded, repeatable randomness for growing the world lives in noise.js;
// what is here is for things that are allowed to differ every time.)

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Distance in xz from p to the segment a→b. Fills `out` with d (the
// distance), t (how far along the segment the nearest point is, 0..1) and
// nx, nz (the direction to push p to get it out).
export function segDist(px, pz, ax, az, bx, bz, out) {
  const ex = bx - ax;
  const ez = bz - az;
  const l2 = ex * ex + ez * ez;
  let t = l2 > 1e-9 ? ((px - ax) * ex + (pz - az) * ez) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (ax + ex * t);
  const dz = pz - (az + ez * t);
  const d = Math.hypot(dx, dz);
  out.d = d;
  out.t = t;
  out.nx = d > 1e-6 ? dx / d : 1;
  out.nz = d > 1e-6 ? dz / d : 0;
  return out;
}

// Grow a rectangle [x0, z0, x1, z1] (or start one) to take in a padded point.
export function growRect(r, x, z, pad = 0) {
  if (!r) return [x - pad, z - pad, x + pad, z + pad];
  return [Math.min(r[0], x - pad), Math.min(r[1], z - pad), Math.max(r[2], x + pad), Math.max(r[3], z + pad)];
}

// A scratch record for ChunkManager.waterAt(x, z, out).
export const waterSample = () => ({ level: 0, depth: 0, flowX: 0, flowZ: 0, foam: 0 });
