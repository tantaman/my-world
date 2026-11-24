// The Nautilus Lookout Tower at Owl Creek Landing, and the Whorl down the
// middle of it, in numbers: where its decks, rails and columns are, the line
// the slide's mat runs down, and what you bump into and stand on. No
// three.js in here: the tests walk up it and ride down it.
//
// What's known of it: KristallTurm, who built it, say it is an octagonal
// tower of hot-dip galvanized steel, 20 m high and 25 m across with six
// levels, a ramp over two metres wide winding gently up through them to a
// view all round over the trees, and the longest stainless-steel slide in
// the United States running down through the middle of it back to the
// ground. WTKR says most of the slide is enclosed and you go down it on a
// mat; it takes about ten seconds. The satellite picture has the rest: an
// octagon with flat faces north, south, east and west, two rings round an
// open middle 11 m across, and something out of its south-east face. The
// slide's length is given as 117 feet and as more than 170; this one is
// 54 m (177 ft) along its floor, from the top deck to the end of its run-out.
//
// Here the ramp is the outer ring, six times round, climbing 3.2 m a time
// (4.5%), the last few metres of it level where it comes out onto the top
// deck; the top deck is the inner ring, round the open middle, with nothing
// over either of them; and the Whorl leaves the top deck on its west side,
// winds down the middle a turn and a half, and comes out under the foot of
// the ramp through the south-east face onto a run-out on the ground.
//
// All of it in the tower's own frame: x east, z south, metres from its
// middle; y up from its foot. Bearings are degrees clockwise from north.
//
//   TOWER, SLIDE                the sizes
//   onOctagon, apothemOf, bearingOf, offFace   the octagon
//   lapOf(b), rampY(u), rampAt(u, a)           where the ramp is
//   decksOver(x, z)             the heights of the decks over a spot
//   slidePath()                 the slide's floor: { pts, s, len, open }
//   tubeFrame(p, i)             its tube round the floor there
//   structure()                 columns, decks and rails: { solids, rails, columns }
//   tubeSolids(p)               the tube, to walk into
//   MOUTH, FOOT                 where you get on, and where the ramp starts

import { localFrame } from '../core/geo.js';

const D = Math.PI / 180;
const T8 = Math.tan(22.5 * D);

export const TOWER = {
  outside: 12.5, // m from the middle to each of its eight faces: 25 m across
  core: 5.5, // m to the edge of the open middle the slide winds down
  rampIn: 9.2, // m: the ramp's inner edge...
  rampOut: 12.3, // ...and its outer edge (3.1 m wide)
  top: 19.2, // m: the top deck, over the foot of the ramp
  levels: 6, // times round the ramp goes
  start: 180, // bearing the ramp starts at, on the ground: the south face, toward the footbridge
  landing: 6, // m of the ramp's top that's level, where it comes out onto the top deck
  deck: 0.3, // m thick: steel grating on its beams
  beam: 0.25, // m: how deep the beams under a deck are
  rail: 1.1, // m: the handrails
  railSolid: 2, // m: how high a rail stands to someone trying to hop it
  railFrom: 0.5, // m: the ramp has rails from where it's this far off the ground
  columns: { outer: 12.6, middle: 9.0, inner: 5.3, r: 0.17 }, // the octagons they stand at the corners of (m), and how thick (m)
};
// m round one lap of the ramp, along its middle; and how much it climbs a lap
export const LAP = 16 * ((TOWER.rampIn + TOWER.rampOut) / 2) * T8;
export const RISE = TOWER.top / (TOWER.levels - TOWER.landing / LAP);
// how far round (laps from its foot) the ramp comes level at the top
export const LEVEL_AT = TOWER.levels - TOWER.landing / LAP;

// ── The octagon ──────────────────────────────────────────────────────────────
// Degrees from the middle of the nearest face, -22.5..22.5.
export function offFace(b) {
  return ((((b + 22.5) % 45) + 45) % 45) - 22.5;
}
export const bearingOf = (x, z) => ((Math.atan2(x, -z) / D) % 360 + 360) % 360;
// The point at bearing b on the octagon whose faces are `a` m from the middle.
export function onOctagon(b, a, out = [0, 0]) {
  const r = a / Math.cos(offFace(b) * D);
  out[0] = Math.sin(b * D) * r;
  out[1] = -Math.cos(b * D) * r;
  return out;
}
// How far out (x, z) is, as the octagon through it: its faces' distance.
export function apothemOf(x, z) {
  return Math.hypot(x, z) * Math.cos(offFace(bearingOf(x, z)) * D);
}
// How far round the octagon bearing b is, in faces from the north face's
// western corner (0..8), as you'd pace it out along a face.
function faces(b) {
  const k = (((Math.round(b / 45) % 8) + 8) % 8);
  return k + (Math.tan(offFace(b) * D) / T8 + 1) / 2;
}
// ...and back: the face it's on, and how far along it (0..1).
function faceAt(f) {
  const g = ((f % 8) + 8) % 8;
  const k = Math.min(7, Math.floor(g));
  return [k, g - k];
}

// ── The ramp ─────────────────────────────────────────────────────────────────
// How far round a lap of the ramp bearing b is, from its foot (0..1).
export function lapOf(b) {
  return ((((faces(b) - faces(TOWER.start)) % 8) + 8) % 8) / 8;
}
// The ramp's deck, u laps up it: its height.
export function rampY(u) {
  return Math.min(TOWER.top, Math.max(0, u * RISE));
}
// ...and the point u laps up it, `a` m out (on the octagon of that apothem).
export function rampAt(u, a, out = [0, 0]) {
  const [k, t] = faceAt(faces(TOWER.start) + u * 8);
  const nb = k * 45 * D;
  const s = (2 * t - 1) * T8;
  // the face's middle, and along it clockwise
  out[0] = a * (Math.sin(nb) + s * Math.cos(nb));
  out[1] = a * (-Math.cos(nb) + s * Math.sin(nb));
  return out;
}

// The heights of the decks over (x, z), lowest first: the ramp's laps over
// it, or the top deck. [] off them.
export function decksOver(x, z) {
  const a = apothemOf(x, z);
  if (a >= TOWER.rampIn && a <= TOWER.rampOut) {
    const f = lapOf(bearingOf(x, z));
    const out = [];
    for (let j = 0; j < TOWER.levels; j++) out.push(rampY(f + j));
    return out;
  }
  if (a >= TOWER.core && a < TOWER.rampIn) return [TOWER.top];
  return [];
}

// ── The slide ────────────────────────────────────────────────────────────────
export const SLIDE = {
  tube: 0.5, // m: the inside of the tube, from its middle
  wall: 0.04, // m: its stainless sheet
  lip: 0.06, // m over the top deck its floor starts at
  end: 0.4, // m over the tower's foot its floor ends at
  open: [2.4, 2.6], // m of open trough at the top (where you sit in) and the bottom (the run-out)
  step: 0.25, // m between the points its path is kept at
};
// Where it goes, seen from above: [m from the middle, bearing] (bearings
// counted on round, past 360, the second time round). In off the top deck's
// west edge, heading north, a turn and a half down the middle clockwise, and
// out through the south-east face.
const ROUTE = [
  [4.85, 262],
  [4.75, 275],
  [4.55, 290],
  [4.15, 305],
  [3.9, 320],
  ...Array.from({ length: 31 }, (_, i) => [3.8, 335 + i * 15]),
  [4.3, 820],
  [4.9, 835],
  [6.0, 846],
  [7.6, 852],
  [9.8, 854.5],
  [12.5, 855],
  [13.7, 855],
  [14.8, 855],
];
// How steeply its floor falls (m a metre, seen from above): eased off the
// lip, steady down the middle, levelling out as it heads for the wall (low
// enough to go under the foot of the ramp), and nearly flat from there on,
// under the ramp and along the run-out.
const FALL = { lip: 0.2, lipLen: 1.0, run: 0.065 };
// which points of the route the levelling out is between: where it stops
// going round, and where it's 6 m from the middle
const TURNED = ROUTE.length - 9;
const LEVEL = ROUTE.length - 6;

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function catmull(p0, p1, p2, p3, t, k) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
}

// The slide's floor, where the mat runs: points SLIDE.step apart along it
// ([x, y, z]), how far along each is (m), its length, and how far along it
// is open at the top and from where at the bottom ([to, from]). Worked out once.
let pathMade = null;
export function slidePath() {
  if (pathMade) return pathMade;
  // seen from above: a smooth curve through the route, walked finely
  const P = ROUTE.map(([r, b]) => [Math.sin(b * D) * r, Math.cos(b * D) * -r]);
  const plan = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)];
    const p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < 20; k++) plan.push([catmull(p0, P[i], P[i + 1], p3, k / 20, 0), catmull(p0, P[i], P[i + 1], p3, k / 20, 1)]);
  }
  plan.push(P[P.length - 1].slice());
  const at = [0];
  for (let i = 1; i < plan.length; i++) at.push(at[i - 1] + Math.hypot(plan[i][0] - plan[i - 1][0], plan[i][1] - plan[i - 1][1]));
  // where it stops going round and heads out, and where it's level
  const turned = at[TURNED * 20];
  const level = at[LEVEL * 20];
  // the fall along it, as a share of the steady fall down the middle (g)
  // plus what doesn't depend on it, so the floor ends where it should
  const shape = (s) => {
    const lip = smooth(0, FALL.lipLen, s);
    const easing = smooth(turned, level, s);
    return [lip * (1 - easing), (1 - lip) * FALL.lip + easing * FALL.run];
  };
  let A = 0;
  let B = 0;
  for (let i = 1; i < plan.length; i++) {
    const [g, f] = shape((at[i] + at[i - 1]) / 2);
    A += g * (at[i] - at[i - 1]);
    B += f * (at[i] - at[i - 1]);
  }
  const steady = (TOWER.top + SLIDE.lip - SLIDE.end - B) / A;
  const ys = [TOWER.top + SLIDE.lip];
  for (let i = 1; i < plan.length; i++) {
    const [g, f] = shape((at[i] + at[i - 1]) / 2);
    ys.push(ys[i - 1] - (g * steady + f) * (at[i] - at[i - 1]));
  }
  // and walked again, in even steps along the floor itself
  const fine = plan.map(([x, z], i) => [x, ys[i], z]);
  const pts = [fine[0]];
  const s = [0];
  let carry = 0;
  for (let i = 1; i < fine.length; i++) {
    const a = fine[i - 1];
    const b = fine[i];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    let t = SLIDE.step - carry;
    while (t <= l) {
      const f = t / l;
      pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
      s.push(s[s.length - 1] + SLIDE.step);
      t += SLIDE.step;
    }
    carry = l - (t - SLIDE.step);
  }
  const last = fine[fine.length - 1];
  const tail = Math.hypot(...last.map((v, k) => v - pts[pts.length - 1][k]));
  if (tail > 0.02) {
    pts.push(last.slice());
    s.push(s[s.length - 1] + tail);
  }
  const len = s[s.length - 1];
  pathMade = { pts, s, len, open: [SLIDE.open[0], len - SLIDE.open[1]], steady };
  return pathMade;
}

// The tube round the floor at point i of path p: its way along (t), across
// to the right (r, level) and up from the floor to its middle (u), unit
// vectors [x, y, z] each; and its middle (c).
export function tubeFrame(p, i, out = { t: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0], c: [0, 0, 0] }) {
  const { pts } = p;
  const a = pts[Math.max(0, i - 1)];
  const b = pts[Math.min(pts.length - 1, i + 1)];
  let tx = b[0] - a[0];
  let ty = b[1] - a[1];
  let tz = b[2] - a[2];
  const tl = Math.hypot(tx, ty, tz) || 1;
  tx /= tl;
  ty /= tl;
  tz /= tl;
  // right: along × up, level
  let rx = -tz;
  let rz = tx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  // up: right × along
  const ux = -rz * ty;
  const uy = rz * tx - rx * tz;
  const uz = rx * ty;
  out.t[0] = tx;
  out.t[1] = ty;
  out.t[2] = tz;
  out.r[0] = rx;
  out.r[1] = 0;
  out.r[2] = rz;
  out.u[0] = ux;
  out.u[1] = uy;
  out.u[2] = uz;
  const q = pts[i];
  out.c[0] = q[0] + ux * SLIDE.tube;
  out.c[1] = q[1] + uy * SLIDE.tube;
  out.c[2] = q[2] + uz * SLIDE.tube;
  return out;
}

// Where you get on: on the top deck by the slide's mouth, facing the way it
// goes (yaw: the way the hiker faces, 0 south, as player.js has it), and
// the gap in the deck's inner rail you get into it through (bearings); and
// where the ramp starts, on the ground, facing the tower.
const p0 = slidePath().pts;
export const MOUTH_BEARING = ROUTE[0][1];
const mouthAt = onOctagon(MOUTH_BEARING, TOWER.core + 0.6);
export const MOUTH = { x: mouthAt[0], z: mouthAt[1], y: TOWER.top, yaw: Math.atan2(p0[8][0] - p0[0][0], p0[8][2] - p0[0][2]) };
const MOUTH_GAP = [MOUTH_BEARING - 8, MOUTH_BEARING + 9];
export const FOOT = { x: 0, z: TOWER.outside + 3, yaw: Math.PI };

// ── Getting there ────────────────────────────────────────────────────────────
// Where the tower stands: its middle, which the real place round it is
// centred on (world/hikes.js: owl-creek-landing). And the footbridge over
// Owls Creek from the South Building's side, as OpenStreetMap has it (way
// 1527852442), with the path on from its north end up through the woods to
// the foot of the ramp, which the map doesn't have yet.
export const WHERE = { lat: 36.81704, lon: -75.98999 };
const BRIDGE_ENDS = [
  [36.8158196, -75.9894721],
  [36.8163074, -75.9899979],
];
export const BRIDGE = {
  width: 2.4, // m
  rail: 1.1, // m
  over: 0.7, // m over the water, at the least
  path: 2.2, // m: the gravel path on from it
};
const frame = localFrame(WHERE.lat, WHERE.lon);
const here = ([lat, lon]) => {
  const [e, n] = frame.toEN(lat, lon);
  return [e, -n];
};
// [[x, z], [x, z]]: the bridge, south end first
export const bridgeLine = () => BRIDGE_ENDS.map(here);
// [[x, z], ...]: the path, from the bridge's north end to the foot of the ramp
export function pathLine() {
  const [x, z] = here(BRIDGE_ENDS[1]);
  return [[x, z], [x * 0.4 - 1.2, z * 0.55 + 4], [FOOT.x, TOWER.outside + 0.3]];
}

// ── What's solid ─────────────────────────────────────────────────────────────
// Capsules as world/solids.js has them, in the tower's frame: its decks (to
// stand on), rails and columns (to bump into). And the lines its rails run
// along, and its columns, for drawing them.
//
//   solids    [{ ax, az, bx, bz, r, bottom, topA, topB, surface }]
//   rails     [{ a: [x, y, z], b: [x, y, z] }]: a rail's foot, along it
//   columns   [{ x, z, top }]
let made = null;
export function structure() {
  if (made) return made;
  const T = TOWER;
  const solids = [];
  const rails = [];
  const mid = (T.rampIn + T.rampOut) / 2;
  const deck = (a, b, ya, yb, r) => solids.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], r, bottom: Math.min(ya, yb) - T.deck, topA: ya, topB: yb, surface: 'grating' });
  const rail = (a, b, ya, yb) => {
    solids.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], r: 0.05, bottom: Math.min(ya, yb) - T.deck, topA: ya + T.railSolid, topB: yb + T.railSolid });
    rails.push({ a: [a[0], ya, a[1]], b: [b[0], yb, b[1]] });
  };

  // The ramp, half a face at a time, and the two rails along it: from where
  // it's off the ground; the inner one stops where it comes out onto the top
  // deck, the outer goes on to the end.
  const steps = [];
  for (let k = 0; k <= T.levels * 16; k++) steps.push(k / 16);
  const railFrom = T.railFrom / RISE;
  steps.push(LEVEL_AT, railFrom);
  steps.sort((a, b) => a - b);
  for (let i = 1; i < steps.length; i++) {
    const [u0, u1] = [steps[i - 1], steps[i]];
    if (u1 - u0 < 1e-6) continue;
    const [y0, y1] = [rampY(u0), rampY(u1)];
    deck(rampAt(u0, mid), rampAt(u1, mid), y0, y1, (T.rampOut - T.rampIn) / 2);
    if (u0 < railFrom - 1e-6) continue;
    rail(rampAt(u0, T.rampOut - 0.05), rampAt(u1, T.rampOut - 0.05), y0, y1);
    if (u1 <= LEVEL_AT + 1e-6) rail(rampAt(u0, T.rampIn + 0.05), rampAt(u1, T.rampIn + 0.05), y0, y1);
  }
  // across its top end
  rail(rampAt(T.levels, T.rampIn), rampAt(T.levels, T.rampOut), T.top, T.top);

  // The top deck, round the open middle: a rail on its inner edge but for the
  // slide's mouth, and on its outer edge but where the ramp comes out onto it.
  const tmid = (T.core + T.rampIn) / 2;
  const landing = [bearingAlong(LEVEL_AT - (T.levels - 1)), T.start];
  for (let k = 0; k < 16; k++) {
    // half faces, from the middle of the north face round
    const [b0, b1] = [k * 22.5, (k + 1) * 22.5];
    deck(onOctagon(b0, tmid), onOctagon(b1, tmid), T.top, T.top, (T.rampIn - T.core) / 2);
    for (const [c0, c1] of cut(b0, b1, ...MOUTH_GAP)) rail(onOctagon(c0, T.core + 0.05), onOctagon(c1, T.core + 0.05), T.top, T.top);
    for (const [c0, c1] of cut(b0, b1, ...landing)) rail(onOctagon(c0, T.rampIn - 0.05), onOctagon(c1, T.rampIn - 0.05), T.top, T.top);
  }

  // The columns, at the corners of three octagons, up from the ground.
  const columns = [];
  const C = T.columns;
  for (let k = 0; k < 8; k++) {
    const b = 22.5 + k * 45;
    for (const [a, top] of [[C.outer, T.top + T.rail], [C.middle, T.top - T.deck], [C.inner, T.top + T.rail]]) {
      const [x, z] = onOctagon(b, a);
      columns.push({ x, z, top });
      solids.push({ ax: x, az: z, bx: x, bz: z, r: C.r, bottom: -1, topA: top, topB: top });
    }
  }
  made = { solids, rails, columns };
  return made;
}

// The bearing a share f of a lap round from the ramp's foot.
function bearingAlong(f) {
  const [x, z] = rampAt(f, 10);
  return bearingOf(x, z);
}
// The pieces of [b0, b1] outside the bearings c0..c1 (which may wrap past 360).
function cut(b0, b1, c0, c1) {
  const lo = ((c0 % 360) + 360) % 360;
  let hi = ((c1 % 360) + 360) % 360;
  if (hi <= lo) hi += 360;
  const out = [];
  let from = b0;
  for (const shift of [-360, 0, 360]) {
    const [l, h] = [lo + shift, hi + shift];
    if (h <= from || l >= b1) continue;
    if (l > from) out.push([from, l]);
    from = Math.max(from, h);
  }
  if (from < b1) out.push([from, b1]);
  return out.filter(([a, b]) => b - a > 0.2);
}

// The tube, as capsules, to bump into (and stand on, where it's low enough
// to climb onto): every metre or so along it.
export function tubeSolids(p = slidePath()) {
  const out = [];
  const f = { t: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0], c: [0, 0, 0] };
  const every = 4;
  for (let i = 0; i + every < p.pts.length; i += every) {
    const a = tubeFrame(p, i, { ...f, c: [0, 0, 0] }).c;
    const b = tubeFrame(p, i + every, { ...f, c: [0, 0, 0] }).c;
    const R = SLIDE.tube + SLIDE.wall;
    const open = p.s[i] < p.open[0] || p.s[i] > p.open[1];
    const lid = open ? 0.1 : R;
    out.push({ ax: a[0], az: a[2], bx: b[0], bz: b[2], r: R, bottom: Math.min(a[1], b[1]) - R - 0.05, topA: a[1] + lid, topB: b[1] + lid, surface: 'grating' });
  }
  return out;
}
