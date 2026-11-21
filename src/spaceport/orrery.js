// The Orrery: the arena the rocket takes you to.
//
// A ring of platforms hung in orbit high over the world, like the planets of
// an orrery round its sun: a broad hub in the middle with a dais, four
// platforms round it at different heights, each a different shape of cover,
// and a little perch off to one side for whoever likes to watch from above.
// Between them is nothing at all. You get from one to another on jump pads,
// which throw you in an arc to the next, or down the stepped bridge to the
// east; and if you miss, it's a long way down.
//
// This is the layout only, as plain numbers: no three.js, so the tests can
// walk it, and the look (arenaLook.js) and the movement (mover.js) read the
// same boxes. Metres, y up; the arena is its own little world round its own
// origin, nowhere near the forest.
//
//   boxes   the solid things: { x0, y0, z0, x1, y1, z1, look }, look one of
//           deck (a platform), step, wall, pillar, bridge
//   pads    jump pads: { id, x, y, z, r, to: { x, y, z }, over } — stand on
//           one and it throws you to land at `to`, `over` m above the higher
//           of the two at the top of the arc
//   spawns  where fighters come in: { x, z, yaw } (y is the floor there)
//   nodes   the way about, for the bots: { id, x, z, pad? } (a node with a
//           pad is the pad itself: walking onto it throws you)
//   links   [from, to, how]: walk (both ways), drop (off an edge, one way),
//           or fly (from a pad to where it lands you)
//   floor   below this (m) you have fallen into the void

export const NAME = 'The Orrery';
export const FLOOR = -36;

const boxes = [];
const add = (x0, y0, z0, x1, y1, z1, look) => boxes.push({ x0, y0, z0, x1, y1, z1, look });
// A platform: its top at y, `thick` deep.
const deck = (x0, z0, x1, z1, y, thick = 2) => add(x0, y - thick, z0, x1, y, z1, 'deck');
// Something standing on a floor at y, `h` tall.
const stand = (x0, z0, x1, z1, y, h, look) => add(x0, y, z0, x1, y + h, z1, look);

// ── The hub ─────────────────────────────────────────────────────────────────
deck(-11, -11, 11, 11, 0);
stand(-4.5, -4.5, 4.5, 4.5, 0, 0.5, 'step'); // the dais, in two steps
stand(-3, -3, 3, 3, 0.5, 0.5, 'step');
for (const sx of [-1, 1]) for (const sz of [-1, 1]) stand(sx * 8 - 0.7, sz * 8 - 0.7, sx * 8 + 0.7, sz * 8 + 0.7, 0, 3.2, 'pillar');

// ── The bridge east, down six steps to the east platform ────────────────────
const BRIDGE = { from: 11, to: 34, half: 1.2, drop: 3, steps: 6 };
for (let i = 0; i < BRIDGE.steps; i++) {
  const a = BRIDGE.from + ((BRIDGE.to - BRIDGE.from) * i) / BRIDGE.steps;
  const b = BRIDGE.from + ((BRIDGE.to - BRIDGE.from) * (i + 1)) / BRIDGE.steps;
  const top = (-BRIDGE.drop * (i + 1)) / BRIDGE.steps;
  add(a, top - 0.6, -BRIDGE.half, b, top, BRIDGE.half, 'bridge');
}

// ── East: low, with a wall to hide behind ───────────────────────────────────
deck(34, -7, 50, 7, -3);
stand(43.6, -3, 44.4, 3, -3, 2.2, 'wall');

// ── South: a wall across its back ───────────────────────────────────────────
deck(-7, 35, 7, 49, 4);
stand(-2.5, 43.6, 2.5, 44.4, 4, 2.2, 'wall');

// ── West: high, with a deck over it up a flight of steps ────────────────────
deck(-49, -7, -35, 7, 9);
deck(-47, -3, -41, 3, 12, 1.2);
for (let i = 0; i < 5; i++) stand(-38.6 - i * 0.6, -1.5, -38 - i * 0.6, 1.5, 9, 0.5 * (i + 1), 'step');

// ── North: two walls, staggered ─────────────────────────────────────────────
deck(-8, -48, 8, -36, 5);
stand(-5, -41, -0.5, -40.4, 5, 2.2, 'wall');
stand(0.5, -44.6, 5, -44, 5, 2.2, 'wall');

// ── The perch, high off the hub's corner ────────────────────────────────────
deck(13, -19, 19, -13, 17, 1);

export const BOXES = boxes;

// ── Jump pads ───────────────────────────────────────────────────────────────
const PAD_R = 1;
const pad = (id, x, y, z, to, over) => ({ id, x, y, z, r: PAD_R, to, over });
export const PADS = [
  // from the hub out
  pad('hub-north', 0, 0, -8.5, { x: 2.5, y: 5, z: -39 }, 6),
  pad('hub-south', 0, 0, 8.5, { x: -3.5, y: 4, z: 40 }, 6),
  pad('hub-west', -8.5, 0, 0, { x: -37, y: 9, z: -3.5 }, 5),
  pad('dais', 0, 1, 0, { x: 15.2, y: 17, z: -15.8 }, 3),
  // back to the hub
  pad('north-hub', 0, 5, -37.5, { x: 2.5, y: 0, z: -6 }, 5),
  pad('south-hub', 0, 4, 36.5, { x: -2.5, y: 0, z: 6 }, 5),
  pad('west-hub', -36, 9, 5.5, { x: -6, y: 0, z: 2.5 }, 3),
  pad('perch-hub', 17.6, 17, -14.4, { x: 6, y: 0, z: -2 }, 2),
  // round the ring
  pad('east-south', 46, -3, 5, { x: 3.5, y: 4, z: 40 }, 8),
  pad('south-west', -5, 4, 46.5, { x: -39.5, y: 9, z: 2.6 }, 15),
  pad('west-north', -44, 9, -5.5, { x: -4, y: 5, z: -45.5 }, 5),
  pad('north-east', 6, 5, -46.5, { x: 39, y: -3, z: -3.5 }, 14),
];

// ── Where fighters come in ──────────────────────────────────────────────────
// facing the hub, more or less. (A yaw of 0 faces −z, as a camera does: the
// way you face is (−sin yaw, −cos yaw).)
const spawn = (x, z) => ({ x, z, yaw: Math.atan2(x, z) });
export const SPAWNS = [spawn(8.5, -3), spawn(-3, 8.5), spawn(-5, -46), spawn(6, -38.5), spawn(48, -5), spawn(37, 5), spawn(5, 47), spawn(-5.5, 38), spawn(-46, 5), spawn(-45, 0)];

// ── The way about ───────────────────────────────────────────────────────────
const node = (id, x, z, padId) => ({ id, x, z, ...(padId ? { pad: padId } : {}) });
export const NODES = [
  // the hub: round the dais, the pads, the bridge head, where the pads land you
  node('h1', 6, 6),
  node('h2', -6, 6),
  node('h3', -6, -6),
  node('h4', 6, -6),
  node('h-north', 0, -8.5, 'hub-north'),
  node('h-south', 0, 8.5, 'hub-south'),
  node('h-west', -8.5, 0, 'hub-west'),
  node('h-dais', 0, 0, 'dais'),
  node('h-east', 10, 0),
  node('h-from-north', 2.5, -6),
  node('h-from-south', -2.5, 6),
  node('h-from-west', -6, 2.5),
  node('h-from-perch', 6, -2),
  // the bridge
  node('bridge', 22, 0),
  // east
  node('e-west', 36, 0),
  node('e1', 39, -4.5),
  node('e2', 40, 5),
  node('e3', 47, -4),
  node('e-pad', 46, 5, 'east-south'),
  // south
  node('s-pad-hub', 0, 36.5, 'south-hub'),
  node('s1', -3.5, 40),
  node('s2', 3.5, 40),
  node('s3', 0, 47.2),
  node('s4', 4.5, 47),
  node('s-pad', -5, 46.5, 'south-west'),
  // west
  node('w1', -37, -3.5),
  node('w2', -40, 4.5),
  node('w-steps', -37, 0),
  node('w-deck', -44, 0),
  node('w5', -46, 5),
  node('w-pad-hub', -36, 5.5, 'west-hub'),
  node('w-pad', -44, -5.5, 'west-north'),
  // north
  node('n1', 2.5, -39),
  node('n2', -4, -45.5),
  node('n3', -7, -38),
  node('n4', 6.5, -40),
  node('n-pad-hub', 0, -37.5, 'north-hub'),
  node('n-pad', 6, -46.5, 'north-east'),
  // the perch
  node('p1', 15.2, -15.8),
  node('p-pad', 17.6, -14.4, 'perch-hub'),
];

const walk = (a, b) => [a, b, 'walk'];
const drop = (a, b) => [a, b, 'drop'];
const fly = (a, b) => [a, b, 'fly'];
export const LINKS = [
  // round the hub
  walk('h1', 'h2'),
  walk('h2', 'h3'),
  walk('h3', 'h4'),
  walk('h4', 'h1'),
  walk('h1', 'h-east'),
  walk('h4', 'h-east'),
  walk('h-from-north', 'h3'),
  walk('h-from-north', 'h4'),
  walk('h-from-south', 'h1'),
  walk('h-from-south', 'h2'),
  walk('h-from-west', 'h2'),
  walk('h-from-west', 'h3'),
  walk('h-from-perch', 'h1'),
  walk('h-from-perch', 'h4'),
  walk('h-from-perch', 'h-east'),
  // onto the hub's pads (one way: a pad throws you)
  drop('h3', 'h-north'),
  drop('h4', 'h-north'),
  drop('h1', 'h-south'),
  drop('h2', 'h-south'),
  drop('h2', 'h-west'),
  drop('h3', 'h-west'),
  drop('h1', 'h-dais'),
  drop('h3', 'h-dais'),
  // across the bridge
  walk('h-east', 'bridge'),
  walk('bridge', 'e-west'),
  // east
  walk('e-west', 'e1'),
  walk('e-west', 'e2'),
  walk('e1', 'e2'),
  walk('e1', 'e3'),
  drop('e2', 'e-pad'),
  drop('e3', 'e-pad'),
  // south
  walk('s1', 's2'),
  walk('s2', 's4'),
  walk('s4', 's3'),
  drop('s1', 's-pad-hub'),
  drop('s2', 's-pad-hub'),
  drop('s1', 's-pad'),
  drop('s3', 's-pad'),
  // west
  walk('w1', 'w-steps'),
  walk('w2', 'w-steps'),
  walk('w-steps', 'w-deck'),
  walk('w2', 'w5'),
  drop('w-deck', 'w5'),
  drop('w-deck', 'w-pad'),
  drop('w1', 'w-pad'),
  drop('w1', 'w-pad-hub'),
  drop('w2', 'w-pad-hub'),
  // north
  walk('n1', 'n3'),
  walk('n1', 'n4'),
  walk('n1', 'n2'),
  walk('n2', 'n3'),
  drop('n1', 'n-pad-hub'),
  drop('n3', 'n-pad-hub'),
  drop('n4', 'n-pad'),
  drop('n2', 'n-pad'),
  // the perch
  drop('p1', 'p-pad'),
  // where the pads throw you
  fly('h-north', 'n1'),
  fly('h-south', 's1'),
  fly('h-west', 'w1'),
  fly('h-dais', 'p1'),
  fly('n-pad-hub', 'h-from-north'),
  fly('s-pad-hub', 'h-from-south'),
  fly('w-pad-hub', 'h-from-west'),
  fly('p-pad', 'h-from-perch'),
  fly('e-pad', 's2'),
  fly('s-pad', 'w2'),
  fly('w-pad', 'n2'),
  fly('n-pad', 'e1'),
];

// The top of whatever is under (x, z), no higher than y (feet height), or
// -Infinity over the void. half: how wide the feet are (m either way).
export function floorAt(x, z, y = Infinity, half = 0) {
  let best = -Infinity;
  for (const b of BOXES) {
    if (x + half <= b.x0 || x - half >= b.x1 || z + half <= b.z0 || z - half >= b.z1) continue;
    if (b.y1 <= y + 1e-6 && b.y1 > best) best = b.y1;
  }
  return best;
}

export const nodeById = new Map(NODES.map((n) => [n.id, n]));
export const padById = new Map(PADS.map((p) => [p.id, p]));

// Where a node is, its y the floor under it.
export function nodeAt(id) {
  const n = nodeById.get(id);
  return { x: n.x, y: floorAt(n.x, n.z), z: n.z };
}

// Who can get to whom: id -> [{ to, how }]. Walks go both ways; drops and
// flights one.
export const WAYS = new Map(NODES.map((n) => [n.id, []]));
for (const [a, b, how] of LINKS) {
  WAYS.get(a).push({ to: b, how });
  if (how === 'walk') WAYS.get(b).push({ to: a, how });
}
