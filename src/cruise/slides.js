// The waterslides: two of them, from the platform at the top of the slide
// tower (plan.js's TOWER) down into the splash pool on the sun deck.
//
//   the Corkscrew  an open red flume: out aft, over her starboard side and
//                  out over the sea, round her stern and into the pool from aft
//   the Plunge     a closed blue tube: across to port, two turns of a helix
//                  out over the side, and into the pool from port
//
// Each is a smooth curve through a few points (Catmull–Rom), walked into
// short even steps. A ride goes down it the way a body slides down a wet
// chute: gravity along the slope, a little friction and the air holding it
// back, so it's quick on the steep bits and slower on the flat; and it
// leans into the bends as fast as it takes them.
//
// No three.js in here: the tests ride them.
//
//   SLIDES                      [{ id, name, colour, tube, points }]
//   path(slide) -> { pts: [[x, y, z]], s: [m along to each], len }
//   new Ride(path)              ride.update(dt) -> false once it's over;
//                               ride.at: { x, y, z, yaw, bank, v }

import { TOWER } from './plan.js';

const T = TOWER.top + 0.25; // where you sit at the top
export const SLIDES = [
  {
    id: 'corkscrew',
    name: 'the Corkscrew',
    tube: false,
    points: [
      [-13, T, -110.3],
      [-14.2, T - 0.8, -113.5],
      [-18.5, T - 2.4, -117.5],
      [-22.4, T - 4.0, -122.5],
      [-22, T - 5.6, -129],
      [-17, T - 7.2, -134],
      [-10, T - 8.6, -136],
      [-5.5, T - 9.35, -134.5],
      [-3.6, T - 9.75, -131.4],
      [-3.4, T - 11.15, -127.2],
    ],
  },
  {
    id: 'plunge',
    name: 'the Plunge',
    tube: true,
    points: helix(),
  },
];

// The Plunge: off the platform's port side, across, round twice and in.
function helix() {
  const pts = [
    [-7.2, T, -104],
    [-3, T - 0.6, -105.2],
    [2.5, T - 1.4, -107],
  ];
  const c = [9.5, -112.5];
  const r = 5.4;
  const turns = 2;
  const steps = 14;
  const a0 = Math.atan2(-107 - c[1], 2.5 - c[0]) + 0.35;
  const y0 = T - 2.2;
  const y1 = T - 9.6;
  for (let i = 0; i <= turns * steps; i++) {
    const a = a0 - (i / steps) * Math.PI * 2; // clockwise, seen from above
    pts.push([c[0] + Math.cos(a) * r, y0 + (y1 - y0) * (i / (turns * steps)), c[1] + Math.sin(a) * r]);
  }
  pts.push([5.4, T - 10.4, -118.4], [3.4, T - 10.9, -119.2], [0.6, T - 11.2, -119.4]);
  return pts;
}

const STEP = 0.4; // m between the points a path is walked into
const pathCache = new Map();
export function path(slide) {
  if (pathCache.has(slide.id)) return pathCache.get(slide.id);
  const P = slide.points;
  const fine = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[Math.min(P.length - 1, i + 2)];
    const n = 24;
    for (let k = 0; k < n; k++) fine.push(catmull(p0, p1, p2, p3, k / n));
  }
  fine.push(P[P.length - 1].slice());
  // even steps along it
  const pts = [fine[0]];
  const s = [0];
  let carry = 0;
  for (let i = 1; i < fine.length; i++) {
    const a = fine[i - 1];
    const b = fine[i];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    let t = STEP - carry;
    while (t <= l) {
      const f = t / l;
      pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
      s.push(s[s.length - 1] + STEP);
      t += STEP;
    }
    carry = l - (t - STEP);
  }
  const last = fine[fine.length - 1];
  const prev = pts[pts.length - 1];
  const tail = Math.hypot(last[0] - prev[0], last[1] - prev[1], last[2] - prev[2]);
  if (tail > 0.05) {
    pts.push(last.slice());
    s.push(s[s.length - 1] + tail);
  }
  const out = { pts, s, len: s[s.length - 1] };
  pathCache.set(slide.id, out);
  return out;
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const out = [];
  for (let k = 0; k < 3; k++) {
    out.push(0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
  }
  return out;
}

// How a body goes down one.
export const RIDE = {
  g: 9.81,
  friction: 0.06, // of the weight, along the way (a wet chute)
  drag: 0.012, // of v², per metre of... the air and the water in the way (1/m)
  start: 1.6, // m/s: the push off from the top
  least: 1.2, // m/s: never slower than this (the water running down it carries you)
  most: 15, // m/s
  lean: 0.9, // how far into a bend a body leans, as a share of what its speed asks
  leanMost: 1.1, // radians
};

export class Ride {
  constructor(p) {
    this.p = p;
    this.d = 0; // m along
    this.v = RIDE.start;
    this.t = 0;
    this.done = false;
    this.at = { x: 0, y: 0, z: 0, yaw: 0, bank: 0, v: this.v, pitch: 0 };
    this._place();
  }

  update(dt) {
    if (this.done) return false;
    this.t += dt;
    // the slope here: how far it falls per metre along
    const { pts, s } = this.p;
    const i = this._index();
    const a = pts[i];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const ds = Math.max(1e-3, s[Math.min(s.length - 1, i + 1)] - s[i]);
    const fall = (a[1] - b[1]) / ds;
    const acc = RIDE.g * (fall - RIDE.friction) - RIDE.drag * this.v * this.v;
    this.v = Math.min(RIDE.most, Math.max(RIDE.least, this.v + acc * dt));
    this.d += this.v * dt;
    if (this.d >= this.p.len) {
      this.d = this.p.len;
      this.done = true;
    }
    this._place(dt);
    return !this.done;
  }

  _index() {
    const { s } = this.p;
    let lo = 0;
    let hi = s.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (s[m] <= this.d) lo = m;
      else hi = m;
    }
    return lo;
  }

  _place(dt = 0) {
    const { pts, s } = this.p;
    const i = this._index();
    const j = Math.min(pts.length - 1, i + 1);
    const f = s[j] > s[i] ? (this.d - s[i]) / (s[j] - s[i]) : 0;
    const a = pts[i];
    const b = pts[j];
    const at = this.at;
    at.x = a[0] + (b[0] - a[0]) * f;
    at.y = a[1] + (b[1] - a[1]) * f;
    at.z = a[2] + (b[2] - a[2]) * f;
    const k = Math.min(pts.length - 1, i + 3);
    const h = Math.max(0, i - 3);
    const yaw = Math.atan2(pts[k][0] - pts[h][0], pts[k][2] - pts[h][2]);
    // how sharply it's turning here (radians a metre), and so how far to lean
    let turn = 0;
    if (k > h + 1) {
      const y0 = Math.atan2(pts[i][0] - pts[h][0], pts[i][2] - pts[h][2]);
      const y1 = Math.atan2(pts[k][0] - pts[i][0], pts[k][2] - pts[i][2]);
      const dy = Math.atan2(Math.sin(y1 - y0), Math.cos(y1 - y0));
      turn = dy / Math.max(0.1, s[k] - s[h]) * 2;
    }
    const want = Math.max(-RIDE.leanMost, Math.min(RIDE.leanMost, Math.atan((this.v * this.v * turn) / RIDE.g) * RIDE.lean));
    at.bank = dt > 0 ? at.bank + (want - at.bank) * Math.min(1, dt * 6) : want;
    at.yaw = yaw;
    at.pitch = Math.atan2(pts[h][1] - pts[k][1], Math.max(0.1, s[k] - s[h]));
    at.v = this.v;
  }
}
