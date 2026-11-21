// Where boats go, worked out from the land and the water alone, so it can be
// tested without a game: where one would lie if it were built here, where it
// goes when it's pushed off, how it rests where it was left, and where you
// can step out of it.
//
// `world` is what these are handed of the land:
//   ground(x, z)    height of the ground (m)
//   depth(x, z)     how deep the water is there (m, 0 where it's dry)
//   surface(x, z)   the height of the water there, or null where it's dry
//
// `def` is a boat's entry in BOATS (kinds.js).

// How deep the water may be where a boat is built: you build it standing on
// the bank or in the shallows, not swimming (m).
export const WADE = 0.5;
// How far from it (m) water deep enough to float it has to be, so it can be
// pushed off.
export const LAUNCH = 5;
// Water no deeper than this (m) is somewhere to step out into.
export const STEP_OUT = 0.7;
// How far (m) you can step out of a boat to.
const STEP_REACH = 2.6;
// How far the land may rise from one end of a boat to the other, as a share
// of its length, for it to be built there.
const STEEP = 0.35;
// Directions looked in for water, all round.
const AROUND = 24;

// Is there water enough to float it at (x, z), and `def.carrier.bow` ahead of
// it along (dx, dz) too?
export function floats(world, def, x, z, dx = 0, dz = 0) {
  const k = def.carrier.keel;
  if (world.depth(x, z) < k) return false;
  return !(dx || dz) || world.depth(x + dx * def.carrier.bow, z + dz * def.carrier.bow) >= k;
}

// The way to the nearest water deep enough to float it, from (x, z), within
// `reach`. -> { dx, dz, d } (a unit direction, and how far), or null.
export function waterWay(world, def, x, z, reach = LAUNCH) {
  for (let d = 0.5; d <= reach + 1e-6; d += 0.5) {
    let best = null;
    for (let i = 0; i < AROUND; i++) {
      const a = (i / AROUND) * Math.PI * 2;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      const depth = world.depth(x + dx * d, z + dz * d);
      if (depth >= def.carrier.keel + 0.05 && (!best || depth > best.depth)) best = { dx, dz, d, depth };
    }
    if (best) return { dx: best.dx, dz: best.dz, d: best.d };
  }
  return null;
}

// Where a boat built at (x, z) would lie: its bow towards the water it'll be
// pushed off into. -> { ok: true, x, z, yaw } or { ok: false, why, where }
// (where: it's the place that won't do)
export function site(world, def, x, z) {
  if (world.depth(x, z) > WADE) return { ok: false, why: 'too deep to build in: build it on the bank, at the water’s edge', where: true };
  const way = waterWay(world, def, x, z);
  if (!way) return { ok: false, why: 'a boat is built at the water’s edge, with water deep enough to float it close by', where: true };
  const yaw = Math.atan2(way.dx, way.dz);
  const h = (s) => restHeight(world, def, x + way.dx * s, z + way.dz * s);
  const L = def.len * 0.45;
  if (Math.abs(h(L) - h(-L)) > def.len * STEEP) return { ok: false, why: 'too steep a bank to build it on: find somewhere it slopes gently into the water', where: true };
  if (!launch(world, def, x, z, yaw)) return { ok: false, why: 'too little water here to float it in: find a pond, a lake or a river', where: true };
  return { ok: true, x, z, yaw };
}

// Where a boat lying at (x, z), facing yaw, ends up when it's pushed off: slid
// bow first until it floats, or failing that, the nearest water deep enough
// for it. -> { x, z, yaw } or null if there's none within reach.
export function launch(world, def, x, z, yaw) {
  const dx = Math.sin(yaw);
  const dz = Math.cos(yaw);
  if (floats(world, def, x, z, dx, dz)) return { x, z, yaw };
  for (let d = 0.25; d <= LAUNCH + def.len / 2; d += 0.25) {
    if (floats(world, def, x + dx * d, z + dz * d, dx, dz)) return { x: x + dx * d, z: z + dz * d, yaw };
  }
  const way = waterWay(world, def, x, z, LAUNCH + def.len / 2);
  if (!way) return null;
  // out along that way until it floats, bow first
  for (let d = way.d; d <= LAUNCH + def.len; d += 0.25) {
    const px = x + way.dx * d;
    const pz = z + way.dz * d;
    if (floats(world, def, px, pz, way.dx, way.dz)) return { x: px, z: pz, yaw: Math.atan2(way.dx, way.dz) };
  }
  return null;
}

// How high a boat's keel rests at (x, z): on the ground, or afloat.
export function restHeight(world, def, x, z) {
  const g = world.ground(x, z);
  const s = world.surface(x, z);
  return s === null ? g : Math.max(g, s - def.draft);
}

// How a boat left at (x, z) facing yaw lies: afloat, or pulled up on the bank
// and tipped to its slope. -> { y, pitch, afloat }
export function rest(world, def, x, z, yaw) {
  const L = def.len * 0.4;
  const dx = Math.sin(yaw) * L;
  const dz = Math.cos(yaw) * L;
  const bow = restHeight(world, def, x + dx, z + dz);
  const stern = restHeight(world, def, x - dx, z - dz);
  const mid = restHeight(world, def, x, z);
  return { y: Math.max(mid, (bow + stern) / 2), pitch: Math.atan2(bow - stern, 2 * L), afloat: world.depth(x, z) > def.draft };
}

// Where to step out of a boat at (x, z) facing yaw: the nearest dry ground or
// shallows over either side, or else off the bow or the stern. blocked(x, z)
// says where you can't stand (a trunk). -> { x, z } or null
export function stepOut(world, def, x, z, yaw, blocked = () => false) {
  const sides = [Math.PI / 2, -Math.PI / 2, 0, Math.PI];
  let best = null;
  for (const a of sides) {
    const along = a === 0 || a === Math.PI;
    const from = along ? def.len / 2 + 0.3 : def.beam / 2 + 0.35;
    for (let d = from; d <= from + STEP_REACH; d += 0.25) {
      const px = x + Math.sin(yaw + a) * d;
      const pz = z + Math.cos(yaw + a) * d;
      const depth = world.depth(px, pz);
      if (depth > STEP_OUT || blocked(px, pz)) continue;
      const score = d + depth * 3;
      if (!best || score < best.score) best = { x: px, z: pz, score };
      break;
    }
  }
  return best ? { x: best.x, z: best.z } : null;
}
