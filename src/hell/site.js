// Where the gate is.
//
// There is one in a world, found from the seed and read off the land without
// changing it, like a cave's mouth (src/caves/sites.js): on a hillside in the
// dark of the woods, some way from where the path starts, where a passage
// going in and down is soon under a good roof of earth. The passage runs a
// short way into the hill to a door, and what is past the door is not under
// that hill at all: Hell lies a long way down (TOP), its axis off in the
// direction the passage points, so that walking in is walking toward the
// middle of it.
//
// findGate(gen, keepOff) ->
//   id, name      'hell:gate', and what the map calls it
//   x, z, floor   the lip of the way in, on the hillside
//   ux, uz        which way is in
//   portal        m in where its roof starts
//   w, h          the passage's half-width and height
//   door          { x, z, floor }: the end of the passage, and the middle
//                 of the round chamber there, where the stair goes down
//   passage       all of that as a cave's layout (caves/sites.js), so the
//                 rock of it can be made the way a cave's is
//   hell          { cx, cz, top, turn }: where Hell is (land.js)
// or null, where no hillside will do.

import { mulberry32, lerp } from '../noise.js';
import { layoutCave, cellOf } from '../caves/sites.js';
import { R, TAU } from './plan.js';
import { DOOR } from './land.js';

export const GATE = {
  near: 700, // m from the middle of the world, at the least
  far: 2600, // and at the most
  tries: 1400, // spots looked at
  slope: [0.3, 1.0], // how steep the hillside may be (rise per metre)
  w: 2.0, // m: half the passage's width
  h: 3.3, // m: its height
  room: { r: 4.4, h: 4.6 }, // the chamber at its end: radius and height (m)
  fall: 0.26, // m down per m in
  portal: 10, // m in: its roof must have started by here
  length: 22, // m in: the door
  cover: 2.6, // m of earth over the door's lintel, at the least
  water: 26, // m from any water's edge
  path: 0.02, // off the paths
  pad: 24, // m clear of anything set on the land
  caves: 45, // m clear of a cave
  dark: 0.55, // how thick the woods must be (gen.forest)
};

// The height (world m) of the vestibule's floor: far under any land.
export const TOP = -3000;

const SALT = 0x1ef1;

/**
 * @param {any} gen  the world's land (world/lands.js)
 * @param {(x0: number, z0: number, x1: number, z1: number) => boolean} [keepOff]  whether a box must be kept clear of
 */
export function findGate(gen, keepOff = () => false) {
  const rng = mulberry32((gen.seed ^ SALT) | 0);
  const found = [];
  for (let i = 0; i < GATE.tries; i++) {
    const a = rng() * TAU;
    const d = lerp(GATE.near, GATE.far, Math.sqrt(rng()));
    const jitter = rng();
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    // (what is quickest to ask, first)
    const dark = gen.forest(x, z);
    if (dark < GATE.dark) continue;
    if (gen.pathMask(x, z) > GATE.path || gen.padClearance(x, z) < GATE.pad) continue;
    const h = gen.height(x, z);
    if (gen.water.edge < GATE.water) continue;
    const gx = (gen.height(x + 2, z) - gen.height(x - 2, z)) / 4;
    const gz = (gen.height(x, z + 2) - gen.height(x, z - 2)) / 4;
    const slope = Math.hypot(gx, gz);
    if (slope < GATE.slope[0] || slope > GATE.slope[1]) continue;
    const ux = gx / slope;
    const uz = gz / slope;
    const portal = wayIn(gen, x, z, h, ux, uz);
    if (portal < 0) continue;
    // darker woods and a steeper bank are better, and not too far to walk
    found.push({ x, z, h, ux, uz, portal, score: dark * 0.5 + Math.min(slope, 0.7) - portal * 0.02 - d / 6000 + jitter * 0.1 });
  }
  // the best of them that is clear of the caves and of any real place (which
  // take longer to ask after, so only the likely ones are asked about)
  found.sort((a, b) => b.score - a.score);
  const best = found.find((f) => !keepOff(f.x - 400, f.z - 400, f.x + 400, f.z + 400) && !nearCave(gen, f.x, f.z, f.ux, f.uz));
  if (!best) return null;

  const { x, z, ux, uz } = best;
  const floor = best.h - 0.1;
  const door = { x: x + ux * GATE.length, z: z + uz * GATE.length, floor: floor - GATE.fall * GATE.length };
  const heading = Math.atan2(ux, uz);
  const pad = GATE.room.r + 3;
  const passage = {
    id: 'hell:gate',
    name: 'The Gate',
    cx: 0x1ef,
    cz: 0x1ef,
    mouth: { x, z, floor, ux, uz, portal: best.portal, w: GATE.w, h: GATE.h },
    nodes: [
      { x, z, floor, d: 0, heading },
      { x: door.x, z: door.z, floor: door.floor, d: Math.hypot(GATE.length, GATE.fall * GATE.length), heading },
    ],
    passages: [{ a: 0, b: 1, w: GATE.w, h: GATE.h }],
    rooms: [{ node: 1, rx: GATE.room.r, rz: GATE.room.r, ry: GATE.room.h, yaw: 0 }],
    glow: false,
    crystals: false,
    bounds: [Math.min(x, door.x) - pad, Math.min(z, door.z) - pad, Math.max(x, door.x) + pad, Math.max(z, door.z) + pad],
  };
  // Hell's own door is straight under this one, and its axis straight ahead
  const out = R.wall + DOOR.depth - 2;
  return {
    id: passage.id,
    name: passage.name,
    x,
    z,
    floor,
    ux,
    uz,
    portal: best.portal,
    w: GATE.w,
    h: GATE.h,
    door,
    passage,
    hell: { cx: door.x + ux * out, cz: door.z + uz * out, top: TOP, turn: Math.atan2(-uz, -ux) },
  };
}

// A passage in from a lip at (x, z), height h, along (ux, uz): how far in
// its roof starts (m), or -1 if this hillside won't do: too gentle, a spur
// it would come out of the side of, or water about.
function wayIn(gen, x, z, h, ux, uz) {
  const px = -uz;
  const pz = ux;
  const floor = h - 0.1;
  // the ground falls away in front of it
  if (gen.height(x - ux * 3, z - uz * 3) > floor - 0.2) return -1;
  let portal = -1;
  for (let k = 0.5; k <= GATE.length + 2; k += 0.5) {
    const cx = x + ux * k;
    const cz = z + uz * k;
    const F = floor - GATE.fall * k;
    const C = F + GATE.h;
    const T = gen.height(cx, cz);
    if (gen.water.edge < GATE.water) return -1;
    const side = Math.min(gen.height(cx + px * GATE.w * 1.5, cz + pz * GATE.w * 1.5), gen.height(cx - px * GATE.w * 1.5, cz - pz * GATE.w * 1.5));
    if (portal < 0) {
      // still a cutting: it needs banks either side, not a drop
      if (k > 2 && side < F + 0.25 * (k - 2)) return -1;
      if (T - C >= 0.4) portal = k;
      else if (k > GATE.portal) return -1;
    } else if (T - C < 0.4 || side - C < 0.2) return -1; // under a roof: it has to stay under
  }
  if (portal < 0) return -1;
  // the chamber at the end needs its roof of earth all round
  const ex = x + ux * GATE.length;
  const ez = z + uz * GATE.length;
  const top = floor - GATE.fall * GATE.length + GATE.room.h;
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * TAU;
    const k = i === 8 ? 0 : GATE.room.r;
    if (gen.height(ex + Math.cos(a) * k, ez + Math.sin(a) * k) - top < GATE.cover) return -1;
    if (gen.water.edge < GATE.water) return -1;
  }
  return portal;
}

// Is there a cave whose rock a passage here would run into?
function nearCave(gen, x, z, ux, uz) {
  const [cx, cz] = cellOf(x, z);
  const mx = x + ux * GATE.length * 0.5;
  const mz = z + uz * GATE.length * 0.5;
  const reach = GATE.length * 0.5 + GATE.room.r + GATE.caves;
  for (let j = cz - 1; j <= cz + 1; j++) {
    for (let i = cx - 1; i <= cx + 1; i++) {
      const cave = layoutCave(gen, i, j);
      if (!cave) continue;
      const b = cave.bounds;
      if (mx > b[0] - reach && mx < b[2] + reach && mz > b[1] - reach && mz < b[3] + reach) return true;
    }
  }
  return false;
}
