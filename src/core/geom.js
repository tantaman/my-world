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

// One number for a pair of whole numbers (a chunk, a tile, a grid node, a
// metre of ground), to key a Map by. Good for 33 million either way: at a
// metre to the cell, several times round the Earth. Keys sort by i, then j.
const KEY_OFF = 2 ** 25;
const KEY_SPAN = 2 ** 26;
export const cellKey = (i, j) => (i + KEY_OFF) * KEY_SPAN + (j + KEY_OFF);

// A scratch record for ChunkManager.waterAt(x, z, out).
export const waterSample = () => ({ level: 0, depth: 0, flowX: 0, flowZ: 0, foam: 0, rise: 0 });

// How far along a ray (origin, dir: anything with x, y, z) it meets a box
// { inv, half }: `inv` takes the world into the box's frame (a Matrix4, read
// through its elements) and `half` is its half-size there. Infinity if it
// misses, or if the ray starts inside it: the camera, say, in a room, which
// its walls shouldn't stop.
export function rayBox(origin, dir, { inv, half }) {
  const e = inv.elements;
  const o = [
    e[0] * origin.x + e[4] * origin.y + e[8] * origin.z + e[12],
    e[1] * origin.x + e[5] * origin.y + e[9] * origin.z + e[13],
    e[2] * origin.x + e[6] * origin.y + e[10] * origin.z + e[14],
  ];
  const dx = e[0] * dir.x + e[4] * dir.y + e[8] * dir.z;
  const dy = e[1] * dir.x + e[5] * dir.y + e[9] * dir.z;
  const dz = e[2] * dir.x + e[6] * dir.y + e[10] * dir.z;
  const l = Math.hypot(dx, dy, dz) || 1;
  const d = [dx / l, dy / l, dz / l];
  let t0 = 0;
  let t1 = Infinity;
  for (let a = 0; a < 3; a++) {
    const h = half[a];
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < -h || o[a] > h) return Infinity;
      continue;
    }
    let u = (-h - o[a]) / d[a];
    let v = (h - o[a]) / d[a];
    if (u > v) [u, v] = [v, u];
    if (u > t0) t0 = u;
    if (v < t1) t1 = v;
    if (t0 > t1) return Infinity;
  }
  const inside = Math.abs(o[0]) < half[0] && Math.abs(o[1]) < half[1] && Math.abs(o[2]) < half[2];
  return inside ? Infinity : t0;
}

// Where a ray from o along d (unit) first meets a capsule round the segment
// a–b of radius r, within `far`: -> t, or null. (The entry point is taken
// as the closest approach, less how far the ray runs inside the radius
// there: exact for a ray square on to the capsule, near enough otherwise.)
export function rayCapsule(o, d, a, b, r, far = Infinity) {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const wx = o.x - a.x;
  const wy = o.y - a.y;
  const wz = o.z - a.z;
  const bb = d.x * ux + d.y * uy + d.z * uz;
  const cc = ux * ux + uy * uy + uz * uz;
  const dd = d.x * wx + d.y * wy + d.z * wz;
  const ee = ux * wx + uy * wy + uz * wz;
  const den = cc - bb * bb;
  // the closest points: u along the segment, t along the ray
  let u = cc < 1e-12 ? 0 : den > 1e-9 ? Math.min(1, Math.max(0, (ee - bb * dd) / den)) : 0;
  let t = Math.max(0, u * bb - dd);
  if (cc > 1e-12) u = Math.min(1, Math.max(0, (ee + t * bb) / cc));
  t = Math.max(0, u * bb - dd);
  const px = o.x + d.x * t - (a.x + ux * u);
  const py = o.y + d.y * t - (a.y + uy * u);
  const pz = o.z + d.z * t - (a.z + uz * u);
  const miss = px * px + py * py + pz * pz;
  if (miss > r * r) return null;
  const at = Math.max(0, t - Math.sqrt(r * r - miss));
  return at <= far ? at : null;
}
