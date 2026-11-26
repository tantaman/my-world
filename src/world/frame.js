// A place's own frame: where it stands, which way it is turned, and what of
// the ground it stands on.
//
// Anything set down in the world on a plan of its own (an old cabin, a town
// and each building in it, a launch site, a race track, a ship) has an
// origin (x, z) and a yaw, its front (+z) facing (sin yaw, cos yaw), and is
// laid out in metres from there. These take a point from that frame to the
// world and back, and say what of the world its rectangles cover:
//
//   plan   rectangles [x0, z0, x1, z1] in its frame that it stands on
//   box    [x0, z0, x1, z1] in the world, round its plan (boxOf)
//
// No three.js in here: the tests read it, and so does the map.

/**
 * @typedef {{ x: number, z: number, yaw: number }} Frame
 * @param {Frame} s
 * @param {number} lx
 * @param {number} lz
 * @param {{ x?: number, z?: number }} [out]
 * @returns {{ x: number, z: number }}
 */
export function toWorld(s, lx, lz, out = {}) {
  const c = Math.cos(s.yaw);
  const n = Math.sin(s.yaw);
  out.x = s.x + lx * c + lz * n;
  out.z = s.z - lx * n + lz * c;
  return out;
}

/**
 * @param {Frame} s
 * @param {number} x
 * @param {number} z
 * @param {{ x?: number, z?: number }} [out]
 * @returns {{ x: number, z: number }}
 */
export function toLocal(s, x, z, out = {}) {
  const c = Math.cos(s.yaw);
  const n = Math.sin(s.yaw);
  const dx = x - s.x;
  const dz = z - s.z;
  out.x = dx * c - dz * n;
  out.z = dx * n + dz * c;
  return out;
}

const _l = { x: 0, z: 0 };
// Is the world point (x, z) on one of the site's rectangles, grown by margin?
// (Anything with x, z, yaw and a box round its rectangles will do: a town, a
// building in it.)
export function onPlan(s, x, z, margin = 0, rects = s.plan) {
  if (x < s.box[0] - margin || x > s.box[2] + margin || z < s.box[1] - margin || z > s.box[3] + margin) return false;
  toLocal(s, x, z, _l);
  for (const [x0, z0, x1, z1] of rects) {
    if (_l.x >= x0 - margin && _l.x <= x1 + margin && _l.z >= z0 - margin && _l.z <= z1 + margin) return true;
  }
  return false;
}

// The plan as discs ({ x, z, r } in the world) that cover it: how building
// tools, which think in circles, are told to keep off it.
export function planDiscs(s, spacing = 1.5) {
  const out = [];
  for (const [x0, z0, x1, z1] of s.plan) {
    const nx = Math.max(1, Math.ceil((x1 - x0) / spacing));
    const nz = Math.max(1, Math.ceil((z1 - z0) / spacing));
    const dx = (x1 - x0) / nx;
    const dz = (z1 - z0) / nz;
    const r = Math.hypot(dx, dz) / 2;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const p = toWorld(s, x0 + (i + 0.5) * dx, z0 + (j + 0.5) * dz);
        out.push({ x: p.x, z: p.z, r });
      }
    }
  }
  return out;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export function boxOf(s) {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [a, b, c, d] of s.plan) {
    for (const [lx, lz] of [[a, b], [c, b], [a, d], [c, d]]) {
      const p = toWorld(s, lx, lz);
      x0 = Math.min(x0, p.x);
      z0 = Math.min(z0, p.z);
      x1 = Math.max(x1, p.x);
      z1 = Math.max(z1, p.z);
    }
  }
  return [x0, z0, x1, z1];
}
