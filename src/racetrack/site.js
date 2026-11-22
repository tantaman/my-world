// Where a race track is, and how it stands on the land.
//
// Some of the towns people live in have a race track out past their last
// houses (tracks.js says which): a dirt oval by a western town, a road
// circuit by a village. Where exactly is grown from the seed and the land,
// like the video store's branches (videostore/site.js): the flattest dry
// ground in rings round the town, a little nearer winning over a little
// flatter, inside the town's own square, its grandstand and pits on the side
// nearest the town. Everyone in a world finds the same track in the same
// place, and nothing about where it is is saved.
//
// Nothing about the land changes for it. The racing surface is laid over
// the ground as it is, level across and rising and falling along the lap
// with the land under it (surfaceOf), a little over the highest of the
// ground beneath; the run-off is the ground itself, grassed. The trees,
// bushes and stones on its grounds (inside the barrier, the infield and the
// paddock) are hidden as it comes into view, as a town's are.
//
// No three.js in here: the tests read it.
//
// A site:
//   id        'racetrack:town:<i>:<j>', its town's: a place on the map
//   name      'Broken Gulch Speedway'
//   town      its town's id
//   layout    a key of LAYOUTS (layouts.js): which circuit it is
//   x, z, yaw where the track's frame is in the world (toWorld): the middle
//             of the layout, its +z (the main straight's side) facing the town
//   lo, hi    the lowest and highest ground looked at over its grounds
//   start     { x, z }: the start line's middle, in the track's frame
//   zb        how far out (+z) the barrier along the main straight reaches
//   plan      [[x0, z0, x1, z1]]: the circuit's box and the paddock's, in
//             the track's frame
//   box       [x0, z0, x1, z1] in the world, round the plan
//   door      where `go here` sets you down: at the paddock gate, facing the
//             track ({ x, z, yaw })

import { toWorld, toLocal } from '../landmarks/sites.js';
import { samplesNear, CELL as LINE_CELL } from '../railway/lines.js';
import { circuitOf, LAYOUTS, KERB } from './layouts.js';

// The paddock, in the track's frame: x from the start line, z out from the
// barrier along the main straight.
export const PADDOCK = {
  stand: [-2, 3, 58, 12], // the grandstand: its front row to its back wall
  pits: [-86, 11, -18, 20], // the pit garages, their open fronts facing the track
  apron: [-92, 0.6, -10, 11], // tarmac in front of them, where your car waits
  park: [-98, 20, 66, 36], // gravel behind, where you come in
  car: { x: -24, z: 5 }, // where your car waits, facing along the straight (+x)
  gate: { x: -10, z: 30 }, // where `go here` sets you down, between the pits and the stand, facing the track
};
// Where it may be: this far (m) from the middle of its town past the town's
// own reach (from its middle to the corners of its box), and how much a metre
// nearer is worth (m of rise).
export const RING = [150, 520];
const STEP = 32; // m between the spots looked at, round a ring and between rings
const NEARER = 0.004;
const FLAT_MOST = 30; // m the ground may rise over all of its grounds
// How the racing surface may lie, laid over the ground (lay()): how steep
// along the lap (rise over run), and how high it may stand over the ground
// under it (m), banked up where the land dips.
const GRADE_MOST = 0.16;
const FILL_MOST = 3.5;
// Each spot is tried with the track turned these ways (radians) from
// facing the town square on.
const TURNS = [0, -0.4, 0.4];
// What makes one spot better than another (m, like NEARER): a metre of rise
// over all of it, a metre of bank under the surface, and a rise over run of
// 1 along it anywhere.
const LUMPY = 0.15;
const BANKED = 1.5;
const STEEP = 20;
const LOOK_EVERY = 14; // m between looks along the line, searching
// m from the line to the nearest water, at the least, and from either edge
// of the racing surface and anywhere on the paddock; but a stream may run
// under it, through a culvert, the surface this far (m) over its water
const DRY = 9;
const WET = 3;
const CULVERT = 0.9;
const CLEAR = 16; // m round its grounds kept clear of anything else grown from the seed
const TILE = 90; // m: its grounds are asked about in squares no bigger than this
const YIELD_EVERY = 24; // spots looked at between yields
// The racing surface stands this far (m) over the highest ground across it;
// it leans across as the land does, but no more steeply than CAMBER (rise
// over run); and its rise and fall along the lap, and its lean, are evened
// out over SMOOTH m.
export const LIFT = 0.16;
export const CAMBER = 0.12;
const SMOOTH = 28;
// Off its edge the bank it stands on falls away this steeply (rise over run)
// to the ground.
export const BANK = 0.6;

const SUFFIX = { oval: 'Speedway', trioval: 'Motor Speedway', kidney: 'Circuit', hairpin: 'Raceway' };
export const nameOf = (town, layout) => `${town.name} ${SUFFIX[layout]}`;

// The paddock's rectangle, and where along the barrier it starts (zb), for a
// circuit, in the track's frame.
export function paddockOf(c) {
  const sx = c.layout.start;
  let zb = -Infinity;
  for (let i = 0; i < c.n; i++) {
    if (c.z[i] > 0 && c.x[i] > sx + PADDOCK.park[0] - 10 && c.x[i] < sx + PADDOCK.park[2] + 10) zb = Math.max(zb, c.z[i] + c.barrier);
  }
  return { zb, rect: [sx + PADDOCK.park[0], c.box[3] - 1, sx + PADDOCK.park[2], zb + PADDOCK.park[3] + 2] };
}

// The spots worth asking about, round its grounds (its plan's rectangles
// cut into squares no bigger than TILE), as boxes in the world.
function tiles(s, plan) {
  const out = [];
  const _w = { x: 0, z: 0 };
  for (const [x0, z0, x1, z1] of plan) {
    const nx = Math.ceil((x1 - x0) / TILE);
    const nz = Math.ceil((z1 - z0) / TILE);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = [x0 + ((x1 - x0) * i) / nx, z0 + ((z1 - z0) * j) / nz, x0 + ((x1 - x0) * (i + 1)) / nx, z0 + ((z1 - z0) * (j + 1)) / nz];
        let bx0 = Infinity;
        let bz0 = Infinity;
        let bx1 = -Infinity;
        let bz1 = -Infinity;
        for (const [u, v] of [[a[0], a[1]], [a[2], a[1]], [a[2], a[3]], [a[0], a[3]]]) {
          toWorld(s, u, v, _w);
          bx0 = Math.min(bx0, _w.x);
          bz0 = Math.min(bz0, _w.z);
          bx1 = Math.max(bx1, _w.x);
          bz1 = Math.max(bz1, _w.z);
        }
        out.push([bx0, bz0, bx1, bz1]);
      }
    }
  }
  return out;
}
const _l = { x: 0, z: 0 };
const xz = (p) => [p.x, p.z];
const union = (boxes) => boxes.reduce((b, t) => [Math.min(b[0], t[0]), Math.min(b[1], t[1]), Math.max(b[2], t[2]), Math.max(b[3], t[3])], [Infinity, Infinity, -Infinity, -Infinity]);

// Where across the racing surface the ground is looked at (m to the left
// of the line, for a circuit), and where along it: every LOOK_EVERY m round
// the lap when searching. -> [[x, z]...] in the track's frame, ACROSS of them
// at each look
const latsOf = (c) => {
  const w = c.half + KERB;
  return [-w, -w / 2, 0, w / 2, w];
};
const ACROSS = 5;
function looks(c) {
  const out = [];
  const p = {};
  const n = Math.round(c.length / LOOK_EVERY);
  for (let i = 0; i < n; i++) {
    c.at((i / n) * c.length, p);
    for (const lat of latsOf(c)) out.push([p.x + p.tz * lat, p.z - p.tx * lat]);
  }
  return out;
}
const LOOKS = new Map(); // layout -> looks()

// A track beside a town (tracks.js says which towns have one, and which
// layout): the flattest dry ground in rings round the town, inside the
// town's own square (so no two tracks meet), its paddock towards the town. A
// generator, yielding now and then, and, while patient() says it may, until
// what it keeps clear of there has been surveyed (keepOff.ready).
//   town     { id, name, x, z, box }; cell: [x0, z0, x1, z1], its square
//   keepOff  (x0, z0, x1, z1) -> whether that's somewhere it may not be
// -> a site, or null where there's nowhere for one.
export function* trackSite(gen, town, layout, cell, keepOff = () => false, patient = () => false) {
  const c = circuitOf(layout);
  const pad = paddockOf(c);
  const plan = [c.box, pad.rect];
  if (!LOOKS.has(layout)) LOOKS.set(layout, looks(c));
  const pts = LOOKS.get(layout);
  // a quick look first: the line at every eighth of the lap, and the paddock's corners
  const looksN = pts.length / ACROSS;
  const quick = [];
  for (let i = 0; i < 8; i++) quick.push(pts[Math.floor((i * looksN) / 8) * ACROSS + 2]);
  const [px0, pz0, px1, pz1] = pad.rect;
  quick.push([px0, pz0], [px1, pz0], [px1, pz1], [px0, pz1]);
  const lats = latsOf(c);
  const g = lats.map(() => new Float64Array(looksN));
  const padPts = [];
  for (let v = pz0; v <= pz1 + 0.01; v += (pz1 - pz0) / 2) for (let u = px0; u <= px1 + 0.01; u += (px1 - px0) / 8) padPts.push([u, v]);
  const reach = Math.max(...[[0, 1], [2, 1], [0, 3], [2, 3]].map(([a, b]) => Math.hypot(town.box[a] - town.x, town.box[b] - town.z)));
  const inCell = (b) => b[0] >= cell[0] && b[1] >= cell[1] && b[2] <= cell[2] && b[3] <= cell[3];
  const found = [];
  const spot = { x: 0, z: 0, yaw: 0 };
  const _w = { x: 0, z: 0 };
  let looked = 0;
  for (let r = reach + RING[0]; r <= reach + RING[1]; r += STEP) {
    const n = Math.max(12, Math.round((Math.PI * 2 * r) / STEP));
    const turn = r * 0.618 + 0.7; // each ring starts somewhere else round, so the spots don't line up
    for (let k = 0; k < n * TURNS.length; k++) {
      if (++looked % YIELD_EVERY === 0) yield;
      const a = turn + (Math.floor(k / TURNS.length) / n) * Math.PI * 2;
      spot.x = town.x + Math.cos(a) * r;
      spot.z = town.z + Math.sin(a) * r;
      spot.yaw = Math.atan2(town.x - spot.x, town.z - spot.z) + TURNS[k % TURNS.length];
      // inside the town's square, all of it, and not somewhere that's
      // quickly told it may not be (before the land is looked at, which is dear)
      const ts = tiles(spot, plan);
      const box = union(ts);
      if (!inCell(box)) continue;
      if (keepOff.quick && ts.some((b) => keepOff.quick(b[0] - CLEAR, b[1] - CLEAR, b[2] + CLEAR, b[3] + CLEAR))) continue;
      let lo = Infinity;
      let hi = -Infinity;
      for (const [u, v] of quick) {
        toWorld(spot, u, v, _w);
        const h = gen.height(_w.x, _w.z);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      if (hi - lo > FLAT_MOST) continue;
      // ...and all the way round, only if it's worth it: the surface laid
      // over it, how steep that is, and how high it stands over the ground
      let ok = true;
      for (let i = 0; i < looksN && ok; i++) {
        for (let j = 0; j < ACROSS; j++) {
          const [u, v] = pts[i * ACROSS + j];
          toWorld(spot, u, v, _w);
          let h = gen.height(_w.x, _w.z);
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
          // a stream goes under it, through a culvert in its bank; anything
          // bigger, it keeps away from
          const W = gen.water;
          if (W.edge < (j === 2 ? DRY : WET)) {
            if (W.kind !== 'stream') ok = false;
            else if (W.level > h - CULVERT) h = W.level + CULVERT;
          }
          g[j][i] = h;
        }
      }
      // the paddock, on dry ground
      for (const [u, v] of padPts) {
        if (!ok) break;
        toWorld(spot, u, v, _w);
        const h = gen.height(_w.x, _w.z);
        if (gen.water.edge < WET) ok = false;
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      if (!ok || hi - lo > FLAT_MOST) continue;
      const sf = lay(g, lats, c.length / looksN);
      if (sf.grade > GRADE_MOST || sf.fill > FILL_MOST) continue;
      found.push({ x: spot.x, z: spot.z, yaw: spot.yaw, lo, hi, box, score: (hi - lo) * LUMPY + sf.fill * BANKED + sf.grade * STEEP + r * NEARER });
    }
  }
  const R = reach + RING[1] + Math.hypot(c.box[2] - c.box[0], c.box[3] - c.box[1]);
  while (patient() && keepOff.ready && !keepOff.ready(town.x - R, town.z - R, town.x + R, town.z + R)) yield;
  // the best of them that nothing else is in the way of (asked last, and of
  // as few as can be: it can be dear)
  found.sort((a, b) => a.score - b.score);
  for (const s of found) {
    if (tiles(s, plan).some((b) => keepOff(b[0] - CLEAR, b[1] - CLEAR, b[2] + CLEAR, b[3] + CLEAR))) continue;
    const near = keepOff.points ? keepOff.points(s.box[0] - CLEAR, s.box[1] - CLEAR, s.box[2] + CLEAR, s.box[3] + CLEAR) : [];
    if (near.some((p) => onGrounds(c, pad.rect, ...xz(toLocal(s, p.x, p.z, _l)), p.r, p.infield))) continue;
    const gate = toWorld(s, c.layout.start + PADDOCK.gate.x, pad.zb + PADDOCK.gate.z);
    return {
      id: `racetrack:${town.id}`,
      name: nameOf(town, layout),
      town: town.id,
      layout,
      x: s.x,
      z: s.z,
      yaw: s.yaw,
      lo: s.lo,
      hi: s.hi,
      start: { x: c.layout.start, z: c.at(0).z },
      zb: pad.zb,
      plan,
      box: s.box,
      door: { x: gate.x, z: gate.z, yaw: s.yaw + Math.PI },
    };
  }
  return null;
}

// The racing surface laid over the ground: a little over it all the way
// across, leaning as the land does (a camber, CAMBER at the most), and
// rising and falling along the lap evenly, never under the ground. Where the
// land dips it's banked up; that's `fill`.
//   g      [across][along]: the ground's height at `lats` metres to the left
//          of the line, at looks `step` metres apart round the lap
// -> { mid, fall, grade, fill }: at each look, its height on the line and how
//    much it rises for each metre to the left; how steep it is along the lap
//    at the steepest (rise over run), and how far over the ground it stands
//    at the most (m)
export function lay(g, lats, step) {
  const n = g[0].length;
  const last = lats.length - 1;
  const w = lats[last];
  const m = Math.max(1, Math.round(SMOOTH / step / 2));
  const around = (src, fn) => {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let v = fn === 'max' ? -Infinity : 0;
      for (let j = -m; j <= m; j++) {
        const h = src[(i + j + n) % n];
        v = fn === 'max' ? Math.max(v, h) : v + h;
      }
      out[i] = fn === 'max' ? v : v / (2 * m + 1);
    }
    return out;
  };
  // the lean, as the land leans, evened out
  const lean = new Float64Array(n);
  for (let i = 0; i < n; i++) lean[i] = Math.max(-CAMBER, Math.min(CAMBER, (g[last][i] - g[0][i]) / (2 * w)));
  const fall = around(around(lean, 'mean'), 'mean');
  // the least height on the line that keeps it over the ground all the way
  // across, at that lean; then evened out along the lap without ever coming
  // down under that (the highest within reach, then averaged, then lifted
  // back over it)
  const need = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let h = -Infinity;
    for (let j = 0; j <= last; j++) h = Math.max(h, g[j][i] - fall[i] * lats[j]);
    need[i] = h + LIFT;
  }
  const mid = around(around(around(need, 'max'), 'mean'), 'mean');
  let grade = 0;
  let fill = 0;
  for (let i = 0; i < n; i++) mid[i] = Math.max(mid[i], need[i]);
  for (let i = 0; i < n; i++) {
    grade = Math.max(grade, Math.abs(mid[(i + 1) % n] - mid[i]) / step);
    for (let j = 0; j <= last; j++) fill = Math.max(fill, mid[i] + fall[i] * lats[j] - g[j][i]);
  }
  return { mid, fall, grade, fill };
}

// How the racing surface lies all the way round, laid (lay()) over the
// ground under each of the circuit's samples. ground(x, z): the height of
// the ground in the world. -> lay()'s, in the world, at each sample
export function surfaceOf(site, ground) {
  const c = circuitOf(site.layout);
  const lats = latsOf(c);
  const p = {};
  const _w = { x: 0, z: 0 };
  const g = lats.map(() => new Float64Array(c.n));
  for (let i = 0; i < c.n; i++) {
    c.at(i * c.step, p);
    lats.forEach((lat, j) => {
      toWorld(site, p.x + p.tz * lat, p.z - p.tx * lat, _w);
      g[j][i] = ground(_w.x, _w.z);
    });
  }
  return lay(g, lats, c.step);
}

// The surface's height at s round the lap, lat metres to the left of the
// line, from surfaceOf's.
export function surfaceAt(c, surface, s, lat = 0) {
  const f = c.wrap(s) / c.step;
  const a = Math.floor(f) % c.n;
  const b = (a + 1) % c.n;
  const t = f - Math.floor(f);
  const { mid, fall } = surface;
  return mid[a] + (mid[b] - mid[a]) * t + (fall[a] + (fall[b] - fall[a]) * t) * lat;
}

// What a track keeps clear of, all of it there first. Things as big as it
// or bigger are asked about by the box (keepOff(x0, z0, x1, z1)): a real
// place's land (world/landforms.js), the launch sites (spaceport/site.js: a
// site, or all of them), towns (towns/towns.js), the video stores, the
// airfields, the abandoned buildings, and where the hunt club may be. Small
// things only have to keep off the track's own grounds, and are told as
// points (keepOff.points(x0, z0, x1, z1) -> [{ x, z, r, infield }]): the old
// places (landmarks/sites.js, any part of one) and the mouths of the caves,
// which may stand in its infield or round about it, and the railway
// (railway/lines.js), which may not cross into its infield either.
//   stores     (x0, z0, x1, z1) -> the video stores there (the one by the
//              start, and the branches)
//   airfield   (box) -> whether an airfield is there
//   buildings  (x0, z0, x1, z1) -> the abandoned buildings there
//   start      where people first arrive: the hunt club is somewhere in a
//              ring round it (huntclub/site.js RING), and a track keeps
//              startClear metres from it, wherever the club turned out to be
// -> keepOff for trackSite.
const OLD_PLACE = 8; // m between an old place and the track's grounds
const OLD_LOOK = 8; // m between the points an old place is looked at by
const MOUTH = 30; // m between a cave's mouth and the grounds
const RAILS = 14; // m between the railway and the grounds
export function clearOf({ landforms, sites, towns, caves, lines, spaceport = null, stores = () => [], airfield = () => false, buildings = () => [], start = null, startClear = 0 }) {
  const over = (b, x0, z0, x1, z1) => b[0] < x1 && b[2] > x0 && b[1] < z1 && b[3] > z0;
  const nearStart = (x0, z0, x1, z1) => {
    if (!start) return false;
    const dx = Math.max(x0 - start.x, 0, start.x - x1);
    const dz = Math.max(z0 - start.z, 0, start.z - z1);
    return Math.hypot(dx, dz) < startClear;
  };
  const keepOff = (x0, z0, x1, z1) => {
    if (nearStart(x0, z0, x1, z1)) return true;
    if (landforms.reaches(x0, z0, x1, z1)) return true;
    const pads = !spaceport ? [] : spaceport.within ? spaceport.within(x0, z0, x1, z1) : [spaceport];
    for (const { box } of pads) if (over(box, x0, z0, x1, z1)) return true;
    if (towns.within(x0, z0, x1, z1).length) return true;
    if (stores(x0, z0, x1, z1).length) return true;
    if (buildings(x0, z0, x1, z1).length) return true;
    return airfield([x0, z0, x1, z1]);
  };
  // (what's quick to tell, asked first: the ring round the start)
  keepOff.quick = nearStart;
  keepOff.points = (x0, z0, x1, z1) => {
    const out = [];
    for (const s of sites.within(x0, z0, x1, z1)) {
      const [a, b, c, d] = s.box;
      const nx = Math.ceil((c - a) / OLD_LOOK);
      const nz = Math.ceil((d - b) / OLD_LOOK);
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) out.push({ x: a + ((c - a) * i) / nx, z: b + ((d - b) * j) / nz, r: OLD_PLACE, infield: false });
    }
    for (const cave of caves.inBox(x0, z0, x1, z1)) out.push({ x: cave.mouth.x, z: cave.mouth.z, r: MOUTH, infield: false });
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    for (const line of lines.within(x0, z0, x1, z1)) samplesNear(line, cx, cz, Math.hypot(x1 - x0, z1 - z0) / 2, (i) => out.push({ x: line.x[i], z: line.z[i], r: RAILS, infield: true }));
    return out;
  };
  // whether the railway there has been surveyed (asking for it if not), so
  // a search can wait for it rather than stall
  keepOff.ready = (x0, z0, x1, z1) => {
    let known = true;
    for (let j = Math.floor(z0 / LINE_CELL); j <= Math.floor(z1 / LINE_CELL); j++) {
      for (let i = Math.floor(x0 / LINE_CELL); i <= Math.floor(x1 / LINE_CELL); i++) if (lines.peek(i, j) === undefined) known = false;
    }
    return known;
  };
  return keepOff;
}

// Whether (u, v) in a track's frame is on its grounds, `margin` metres more
// all round: inside the barrier (c: its circuit), on the paddock (its
// rectangle), or, if infield, in the infield.
export function onGrounds(c, paddock, u, v, margin = 0, infield = false) {
  const [x0, z0, x1, z1] = paddock;
  if (u >= x0 - margin && u <= x1 + margin && v >= z0 - margin && v <= z1 + margin) return true;
  return infield ? c.within(u, v, margin) : c.locate(u, v, _near).d <= c.barrier + margin;
}
const _near = {};

export { LAYOUTS };
