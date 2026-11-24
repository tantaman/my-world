// A ride down the Whorl: sat on a mat at the mouth, a push off, and down the
// tube the way a body goes on felt over stainless steel. Gravity along the
// slope; the mat's friction against how hard the tube presses on it, which
// is harder in the turns, where you're pressed into the outside wall; and
// the air. So it's quick down the middle but never runs away (the faster you
// go round, the harder the wall holds you back), and the run-out at the
// bottom slows you to a stop. Round the turns you ride up the outside wall,
// as far as the turn asks, and lean in.
//
// No three.js in here: the tests ride it.
//
//   new Ride(path)   path: slidePath() (tower.js)
//   ride.update(dt)  -> false once it's over (stopped on the run-out, or off the end)
//   ride.at          { x, y, z: where your hips are (the tower's frame);
//                      yaw, pitch, roll: how you're turned (Euler YXZ, as
//                      the hiker's root has it); v: m/s; s: m down it;
//                      inside: whether you're in the tube (not the open
//                      trough at either end) }

import { tubeFrame, SLIDE } from './tower.js';

export const RIDE = {
  g: 9.81,
  friction: 0.25, // the mat on the steel, of how hard it's pressed on
  drag: 0.011, // of v², a metre (1/m): the air, the mat flapping
  push: 1.5, // m/s: the push off from the mouth
  scoot: 0.7, // m/s: never slower than this in the tube (you'd shuffle along it on your hands)
  stop: 0.15, // m/s: on the run-out, this slow is stopped
  climb: 5, // 1/s: how quickly you ride up the wall, and back down it
  most: 1.2, // rad: the furthest up the wall
  hips: 0.13, // m over the mat
  look: 3, // points either side a bend is measured over
};

// What a path is like at each point: how much it falls a metre along,
// which way it heads (yaw: 0 south, as the hiker's), how sharply it turns
// right (radians a metre), and how sharply it curls up (1/m). Kept with it.
const shapes = new WeakMap();
function shapeOf(p) {
  let sh = shapes.get(p);
  if (sh) return sh;
  const n = p.pts.length;
  const fall = new Float64Array(n);
  const yaw = new Float64Array(n);
  const turn = new Float64Array(n);
  const curl = new Float64Array(n);
  const k = RIDE.look;
  for (let i = 0; i < n; i++) {
    const a = p.pts[Math.max(0, i - 1)];
    const b = p.pts[Math.min(n - 1, i + 1)];
    const ds = Math.max(1e-6, p.s[Math.min(n - 1, i + 1)] - p.s[Math.max(0, i - 1)]);
    fall[i] = (a[1] - b[1]) / ds;
    yaw[i] = Math.atan2(b[0] - a[0], b[2] - a[2]);
  }
  for (let i = 0; i < n; i++) {
    const [h, j] = [Math.max(0, i - k), Math.min(n - 1, i + k)];
    const ds = Math.max(1e-6, p.s[j] - p.s[h]);
    const dy = Math.atan2(Math.sin(yaw[j] - yaw[h]), Math.cos(yaw[j] - yaw[h]));
    turn[i] = -dy / ds; // yaw falls as you turn right
    curl[i] = (fall[h] - fall[j]) / ds; // levelling out presses you down
  }
  sh = { fall, yaw, turn, curl };
  shapes.set(p, sh);
  return sh;
}

const _f = { t: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0], c: [0, 0, 0] };

export class Ride {
  constructor(p) {
    this.p = p;
    this.sh = shapeOf(p);
    this.s = 0; // m along
    this.v = RIDE.push;
    this.t = 0; // s on it
    this.top = this.v; // the fastest it went
    this.roll = 0;
    this.done = false;
    this.at = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, v: this.v, s: 0, inside: false };
    this._place();
  }

  // Go on down for dt. → whether it's still going.
  update(dt) {
    if (this.done) return false;
    this.t += dt;
    const { fall, turn, curl } = this.sh;
    const i = this._index();
    const g = RIDE.g;
    const cos = 1 / Math.sqrt(1 + fall[i] * fall[i]);
    const sin = fall[i] * cos;
    // how hard the tube presses on you: your weight into the floor, more as
    // it levels out under you, and the turn pressing you into the wall
    const down = Math.max(0, g * cos + this.v * this.v * curl[i]);
    const side = this.v * this.v * turn[i] * cos;
    const press = Math.hypot(down, side);
    const acc = g * sin - RIDE.friction * press - RIDE.drag * this.v * this.v;
    this.v = Math.max(0, this.v + acc * dt);
    const open = this.s > this.p.open[1];
    if (!open) this.v = Math.max(RIDE.scoot, this.v);
    this.top = Math.max(this.top, this.v);
    this.s += this.v * dt;
    // up the wall as far as the turn asks
    const want = Math.max(-RIDE.most, Math.min(RIDE.most, Math.atan2(side, Math.max(down, 0.5))));
    this.roll += (want - this.roll) * (1 - Math.exp(-dt * RIDE.climb));
    if (this.s >= this.p.len || (open && this.v < RIDE.stop)) {
      this.s = Math.min(this.s, this.p.len);
      this.done = true;
    }
    this._place();
    return !this.done;
  }

  // the point of the path at or before where you are
  _index() {
    const { s } = this.p;
    let lo = 0;
    let hi = s.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (s[m] <= this.s) lo = m;
      else hi = m;
    }
    return lo;
  }

  _place() {
    const { pts, s } = this.p;
    const i = this._index();
    const j = Math.min(pts.length - 1, i + 1);
    const f = s[j] > s[i] ? (this.s - s[i]) / (s[j] - s[i]) : 0;
    const F = tubeFrame(this.p, i, _f);
    const [a, b] = [pts[i], pts[j]];
    // the tube's middle here, and you down from it toward the wall you're on
    const ax = a[0] + (b[0] - a[0]) * f + F.u[0] * SLIDE.tube;
    const ay = a[1] + (b[1] - a[1]) * f + F.u[1] * SLIDE.tube;
    const az = a[2] + (b[2] - a[2]) * f + F.u[2] * SLIDE.tube;
    const rho = SLIDE.tube - RIDE.hips;
    const [c, sn] = [Math.cos(this.roll), Math.sin(this.roll)];
    const at = this.at;
    at.x = ax - rho * (c * F.u[0] + sn * F.r[0]);
    at.y = ay - rho * (c * F.u[1] + sn * F.r[1]);
    at.z = az - rho * (c * F.u[2] + sn * F.r[2]);
    const { yaw, fall } = this.sh;
    const dy = Math.atan2(Math.sin(yaw[j] - yaw[i]), Math.cos(yaw[j] - yaw[i]));
    at.yaw = yaw[i] + dy * f;
    at.pitch = Math.atan(fall[i] + (fall[j] - fall[i]) * f);
    at.roll = this.roll;
    at.v = this.v;
    at.s = this.s;
    at.inside = this.s > this.p.open[0] && this.s < this.p.open[1];
  }
}
