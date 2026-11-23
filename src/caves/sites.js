// Where the caves are, and the shape of each one's passages.
//
// Caves are grown from the seed like the rest of the forest, but read off the
// land rather than written into it: nothing here changes what worldgen grows,
// so no saved cabin moves when a cave turns up under the hill behind it.
//
// The world is cut into squares CAVE.cell on a side, and a square holds one
// cave or none: by chance, and by whether its land will take one. A cave
// opens on a hillside, where the ground rises steeply enough that a passage
// going in and a little down is soon under a good roof of earth, and goes on
// from there, branching, into rooms here and there. Everything about it stays
// inside its square, so neighbouring caves never meet.
//
// A cave (layoutCave) is
//
//   id, name        'cave:3:-1' and what it's called on the map
//   mouth           { x, z, floor, ux, uz, portal, w, h }: the lip, on the
//                   hillside; which way is in; how far in the roof starts
//   nodes           [{ x, z, floor, d }]: where passages meet, bend and end.
//                   d is how far that is from the lip, along the passages
//   passages        [{ a, b, w, h }]: a tunnel from node a to node b (their
//                   indices), w its half-width and h its height. The first
//                   is the way in.
//   rooms           [{ node, rx, rz, ry, yaw }]: a chamber round a node
//   glow, crystals  glowworms on the roofs of its rooms; a grotto of
//                   crystals in the room furthest in
//   bounds          [x0, z0, x1, z1], with room for its walls
//
// Its passages keep CAVE.cover of ground over their roofs past the mouth
// (more than a spade can dig), keep away from water, and keep rock between
// themselves and any passage they don't join, so there is only ever one floor
// under any spot in a cave.

import { mulberry32, hash2i, lerp } from '../noise.js';

export const CAVE = {
  cell: 320, // m: one cave at most to a square this size
  chance: 0.8, // that a square has one, if its land will take it
  inset: 70, // m: a mouth is at least this far inside its square
  edge: 22, // m: and its passages this far
  tries: 72, // spots on a square's hillsides looked at for a mouth
  slope: [0.28, 1.1], // how steep the hillside at a mouth may be (rise per metre)
  cover: 2.6, // m of ground over the roof, past the mouth (a spade cuts at most 1.6)
  water: 8, // m from the water's edge to the side of a passage, at the least
  rock: 2.6, // m of rock between passages that don't meet
  length: [70, 150], // m of passage a cave grows
  deepest: 28, // m below its lip a cave's floor may go
  steepest: 0.36, // a passage's floor rises or falls at most this much per metre
  mouth: { w: 1.55, h: 2.5, fall: 0.3, portal: 7, inner: 16 }, // the way in: half-width, height, m down per m in; the most m in its roof may start and its cover be reached
  passage: { w: [1.2, 1.9], h: [2.4, 3.4], len: [7, 14] },
  room: { chance: 0.45, r: [3.6, 7.4], ry: [3.2, 6] },
  light: 4.5, // m in past the roof's start for daylight to fall to a third
};

const SALT = 0x6a7e;
const TAU = Math.PI * 2;

// The square (cx, cz) a point is in.
export const cellOf = (x, z) => [Math.floor(x / CAVE.cell), Math.floor(z / CAVE.cell)];

// How much daylight reaches d metres along a cave's passages, 0..1.
export function daylight(cave, d) {
  const past = d - cave.mouth.portal;
  return past <= 0 ? 1 : Math.exp(-past / CAVE.light);
}

// The cave in square (cx, cz), or null. Deterministic for a seed.
export function layoutCave(gen, cx, cz) {
  const rng = mulberry32(hash2i(cx, cz, (gen.seed ^ SALT) | 0));
  if (rng() > CAVE.chance) return null;
  const x0 = cx * CAVE.cell;
  const z0 = cz * CAVE.cell;
  const span = CAVE.cell - CAVE.inset * 2;
  const ground = (x, z) => gen.height(x, z);

  // ── A mouth: the best spot on the steeper hillsides that will take a way in.
  let best = null;
  for (let i = 0; i < CAVE.tries; i++) {
    const x = x0 + CAVE.inset + rng() * span;
    const z = z0 + CAVE.inset + rng() * span;
    const jitter = rng();
    const h = ground(x, z);
    if (gen.water.edge < CAVE.water + 8) continue;
    if (gen.pathMask(x, z) > 0.02 || gen.padClearance(x, z) < 14) continue;
    const gx = (ground(x + 2, z) - ground(x - 2, z)) / 4;
    const gz = (ground(x, z + 2) - ground(x, z - 2)) / 4;
    const slope = Math.hypot(gx, gz);
    if (slope < CAVE.slope[0] || slope > CAVE.slope[1]) continue;
    const ux = gx / slope;
    const uz = gz / slope;
    const way = wayIn(gen, x, z, h, ux, uz);
    if (!way) continue;
    // steeper is better (a shorter cutting), and a shorter way in under cover
    const score = Math.min(slope, 0.7) - way.inner * 0.02 + jitter * 0.08;
    if (!best || score > best.score) best = { x, z, h, ux, uz, ...way, score };
  }
  if (!best) return null;

  const m = CAVE.mouth;
  const mouth = { x: best.x, z: best.z, floor: best.h - 0.08, ux: best.ux, uz: best.uz, portal: best.portal, w: m.w, h: m.h };
  const nodes = [
    { x: mouth.x, z: mouth.z, floor: mouth.floor, d: 0, heading: Math.atan2(mouth.ux, mouth.uz) },
    { x: mouth.x + mouth.ux * best.inner, z: mouth.z + mouth.uz * best.inner, floor: mouth.floor - m.fall * best.inner, d: 0, heading: Math.atan2(mouth.ux, mouth.uz) },
  ];
  nodes[1].d = Math.hypot(best.inner, m.fall * best.inner);
  const passages = [{ a: 0, b: 1, w: m.w, h: m.h }];
  const rooms = [];
  const cave = { id: `cave:${cx}:${cz}`, cx, cz, mouth, nodes, passages, rooms, glow: false, crystals: false, name: '', bounds: null };

  // ── The passages: grown out from the end of the way in, branching now and
  // then, until there's enough of them or nowhere left to go.
  const inside = { x0: x0 + CAVE.edge, z0: z0 + CAVE.edge, x1: x0 + CAVE.cell - CAVE.edge, z1: z0 + CAVE.cell - CAVE.edge };
  const target = lerp(CAVE.length[0], CAVE.length[1], rng());
  const lowest = mouth.floor - CAVE.deepest;
  let total = best.inner;
  const queue = [1];
  while (queue.length && total < target && nodes.length < 30) {
    const ni = queue.shift();
    const n = nodes[ni];
    const kids = ni === 1 ? 1 : rng() < 0.3 ? 2 : 1;
    for (let kid = 0; kid < kids; kid++) {
      const side = rng() < 0.5 ? -1 : 1;
      for (let attempt = 0; attempt < 8; attempt++) {
        const heading = n.heading + (kid === 0 ? (rng() - 0.5) * 1.5 * (1 + attempt * 0.25) : side * lerp(0.9, 1.7, rng()));
        const L = lerp(CAVE.passage.len[0], CAVE.passage.len[1], rng());
        const w = lerp(CAVE.passage.w[0], CAVE.passage.w[1], rng());
        const h = lerp(CAVE.passage.h[0], CAVE.passage.h[1], rng());
        const want = n.floor + lerp(-0.12, 0.06, rng()) * L;
        const q = tryPassage(gen, cave, ni, heading, L, w, h, want, inside, lowest);
        if (!q) continue;
        const qi = nodes.length;
        nodes.push({ x: q.x, z: q.z, floor: q.floor, d: n.d + Math.hypot(L, q.floor - n.floor), heading });
        passages.push({ a: ni, b: qi, w, h });
        total += L;
        queue.push(qi);
        if (rng() < CAVE.room.chance) tryRoom(gen, cave, qi, rng, inside);
        break;
      }
    }
  }
  if (total < CAVE.length[0] * 0.5) return null;

  // At least one room: at the far end, if nowhere else.
  const far = farthest(cave);
  if (!rooms.length) tryRoom(gen, cave, far, rng, inside, 0.7);
  cave.glow = rooms.length > 0 && rng() < 0.45;
  cave.crystals = rooms.length > 0 && rng() < 0.4;
  cave.name = nameFor(cave, rng);
  cave.bounds = boundsOf(cave);
  return cave;
}

// The way in from a lip at (x, z), height h, going in along (ux, uz): where
// its roof starts (portal) and where it has full cover (inner), in metres, or
// null if this hillside won't do — too gentle, a ridge it would come out of
// the side of, or water about.
function wayIn(gen, x, z, h, ux, uz) {
  const m = CAVE.mouth;
  const px = -uz;
  const pz = ux;
  const floor = h - 0.08;
  // the ground falls away in front of it
  if (gen.height(x - ux * 2, z - uz * 2) > floor - 0.15) return null;
  let portal = -1;
  for (let k = 0.5; k <= m.inner; k += 0.5) {
    const cx = x + ux * k;
    const cz = z + uz * k;
    const F = floor - m.fall * k;
    const C = F + m.h;
    const T = gen.height(cx, cz);
    if (gen.water.edge < CAVE.water + m.w) return null;
    const side = Math.min(gen.height(cx + px * m.w * 1.4, cz + pz * m.w * 1.4), gen.height(cx - px * m.w * 1.4, cz - pz * m.w * 1.4));
    if (portal < 0) {
      // still a cutting: it needs banks either side, not a drop
      if (k > 1.5 && side < F + 0.25 * (k - 1.5)) return null;
      if (T - C >= 0.4) portal = k;
      else if (k > m.portal) return null;
    } else {
      // under a roof: it has to stay under, and not come out of the side
      if (T - C < 0.4 || side - C < 0.2) return null;
      if (T - C >= CAVE.cover && side - C >= CAVE.cover * 0.8) return { portal, inner: k };
    }
  }
  return null;
}

// A passage from node ni, heading off at `heading` for L metres, if one fits
// there: -> { x, z, floor } or null.
function tryPassage(gen, cave, ni, heading, L, w, h, want, inside, lowest) {
  const n = cave.nodes[ni];
  const dx = Math.sin(heading);
  const dz = Math.cos(heading);
  const x = n.x + dx * L;
  const z = n.z + dz * L;
  if (x < inside.x0 || x > inside.x1 || z < inside.z0 || z > inside.z1) return null;
  // The floor may not come so high that the roof loses its cover anywhere
  // along the way: the most it can rise, from the land over each step.
  let floor = want;
  const steps = Math.ceil(L / 1.5);
  for (let s = 0; s <= steps; s++) {
    const f = s / steps;
    const T = gen.height(n.x + dx * L * f, n.z + dz * L * f);
    if (gen.water.edge < CAVE.water + w) return null;
    const most = T - h - CAVE.cover;
    if (f === 0) {
      if (n.floor > most + 0.3) return null;
      continue;
    }
    floor = Math.min(floor, n.floor + (most - n.floor) / f);
  }
  if ((n.floor - floor) / L > CAVE.steepest || (floor - n.floor) / L > CAVE.steepest || floor < lowest) return null;
  // ...nor come near another passage or room it doesn't join.
  const seg = { ax: n.x, az: n.z, bx: x, bz: z };
  for (const p of cave.passages) {
    const a = cave.nodes[p.a];
    const b = cave.nodes[p.b];
    if (p.a === ni || p.b === ni) {
      // a passage from the same node: apart once clear of it
      const near = Math.min(L, w + p.w + 3);
      const from = { ax: n.x + dx * near, az: n.z + dz * near, bx: x, bz: z };
      if (segSeg(from, { ax: a.x, az: a.z, bx: b.x, bz: b.z }) < w + p.w + CAVE.rock * 0.6) return null;
      continue;
    }
    if (segSeg(seg, { ax: a.x, az: a.z, bx: b.x, bz: b.z }) < w + p.w + CAVE.rock) return null;
  }
  for (const r of cave.rooms) {
    if (r.node === ni) continue;
    const c = cave.nodes[r.node];
    if (pointSeg(c.x, c.z, seg) < Math.max(r.rx, r.rz) + w + CAVE.rock) return null;
  }
  return { x, z, floor };
}

// A room round node ni, if one fits: added to the cave.
function tryRoom(gen, cave, ni, rng, inside, scale = 1) {
  const n = cave.nodes[ni];
  const R = CAVE.room;
  const rx = lerp(R.r[0], R.r[1], rng()) * scale;
  const rz = lerp(R.r[0], R.r[1], rng()) * scale;
  const ry = lerp(R.ry[0], R.ry[1], rng()) * Math.max(scale, 0.85);
  const yaw = rng() * TAU;
  const r = Math.max(rx, rz);
  if (n.x - r < inside.x0 || n.x + r > inside.x1 || n.z - r < inside.z0 || n.z + r > inside.z1) return false;
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * TAU;
    const k = i === 8 ? 0 : 0.85;
    const x = n.x + Math.cos(a) * rx * k;
    const z = n.z + Math.sin(a) * rz * k;
    if (gen.height(x, z) - (n.floor + ry) < CAVE.cover) return false;
    if (gen.water.edge < CAVE.water + r * (1 - k)) return false;
  }
  for (const p of cave.passages) {
    if (p.a === ni || p.b === ni) continue;
    const a = cave.nodes[p.a];
    const b = cave.nodes[p.b];
    if (pointSeg(n.x, n.z, { ax: a.x, az: a.z, bx: b.x, bz: b.z }) < r + p.w + CAVE.rock) return false;
  }
  for (const o of cave.rooms) {
    const c = cave.nodes[o.node];
    if (Math.hypot(c.x - n.x, c.z - n.z) < r + Math.max(o.rx, o.rz) + CAVE.rock) return false;
  }
  cave.rooms.push({ node: ni, rx, rz, ry, yaw });
  return true;
}

// The node furthest in.
export function farthest(cave) {
  let best = 0;
  for (let i = 1; i < cave.nodes.length; i++) if (cave.nodes[i].d > cave.nodes[best].d) best = i;
  return best;
}

function boundsOf(cave) {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  const grow = (x, z, r) => {
    x0 = Math.min(x0, x - r);
    z0 = Math.min(z0, z - r);
    x1 = Math.max(x1, x + r);
    z1 = Math.max(z1, z + r);
  };
  for (const p of cave.passages) {
    for (const i of [p.a, p.b]) grow(cave.nodes[i].x, cave.nodes[i].z, p.w + 3);
  }
  for (const r of cave.rooms) grow(cave.nodes[r.node].x, cave.nodes[r.node].z, Math.max(r.rx, r.rz) + 3);
  return [x0, z0, x1, z1];
}

// ── Names ───────────────────────────────────────────────────────────────────
// What's inside comes first, so a name on the map is a hint.
const FIRST = ['Owl', 'Fern', 'Bear', 'Moss', 'Echo', 'Fox', 'Raven', 'Badger', 'Dripping', 'Whispering', 'Long', 'Hollow', 'Hidden', 'Old'];
const LAST = ['Cave', 'Cave', 'Cavern', 'Hole', 'Hollow'];
function nameFor(cave, rng) {
  const pick = (list) => list[Math.floor(rng() * list.length)];
  if (cave.crystals) return `Crystal ${pick(['Cave', 'Cavern', 'Grotto'])}`;
  if (cave.glow) return `Glowworm ${pick(['Grotto', 'Cave', 'Hollow'])}`;
  const first = pick(FIRST);
  let last = pick(LAST);
  if (first === 'Hollow' && last === 'Hollow') last = 'Cave';
  return `${first} ${last}`;
}

// ── Plan-view distances ────────────────────────────────────────────────────
function pointSeg(px, pz, s) {
  const ex = s.bx - s.ax;
  const ez = s.bz - s.az;
  const l2 = ex * ex + ez * ez;
  let t = l2 > 1e-9 ? ((px - s.ax) * ex + (pz - s.az) * ez) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - s.ax - ex * t, pz - s.az - ez * t);
}

function segSeg(s, o) {
  // segments that cross are 0 apart
  const d1x = s.bx - s.ax;
  const d1z = s.bz - s.az;
  const d2x = o.bx - o.ax;
  const d2z = o.bz - o.az;
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) > 1e-9) {
    const t = ((o.ax - s.ax) * d2z - (o.az - s.az) * d2x) / den;
    const u = ((o.ax - s.ax) * d1z - (o.az - s.az) * d1x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(pointSeg(s.ax, s.az, o), pointSeg(s.bx, s.bz, o), pointSeg(o.ax, o.az, s), pointSeg(o.bx, o.bz, s));
}

// The mouths of caves, as something for what's grown later to keep clear of
// (world/claims.ts): a box holds one if a mouth is in it, or within `clear`
// metres of it. caves: whatever answers inBox(x0, z0, x1, z1) with the
// caves whose mouths could be (the Caves, or a stand-in).
export const caveMouths = (caves, clear) => ({
  holds(x0, z0, x1, z1) {
    for (const c of caves.inBox(x0, z0, x1, z1)) {
      const m = c.mouth;
      if (m.x > x0 - clear && m.x < x1 + clear && m.z > z0 - clear && m.z < z1 + clear) return true;
    }
    return false;
  },
});
