// One car on the land: the physics of driving it, and nothing else. It is
// handed the ground and what stands on it, and the controls each frame, and
// keeps where the car is, which way it points, how fast it's going, how it
// sits on its wheels and how far they've turned. index.js puts the driver
// in it and the model round it.
//
// It drives the way a car does, simply: the engine pulls it along the way it
// points, hardest pulling away and less as it nears its top speed; the brakes
// slow it, and held at a standstill, back it up. The front wheels turn it,
// less the faster it goes, as tightly as their angle allows at a crawl and no
// more tightly than its grip allows at speed. It doesn't skid. What's under
// it matters: flat out only on tarmac, a little less on gravel, and off the
// road only as fast as it can take the rough (a four-by-four much faster than
// a saloon). Up a slope gravity holds it back, and past the steepest it can
// climb it can't hold on, and rolls back down. It won't go into water deeper
// than it can wade.
//
// It sits on its four wheels: each finds the ground (or the road) under it,
// and the body pitches and rolls to them, settling on its springs. Over a
// crest taken fast it leaves the ground for a moment and comes down again.
// It stops dead against a trunk, a boulder or a wall, with a bump that's
// harder the faster it was going.
//
// The ground (index.js gives it):
//   at(x, z, out)   fills out.y (the ground or the road's top there),
//                   out.kind ('paved', 'gravel', 'ground', 'snow'), out.water
//                   (how deep the water is, m; 0 out of it) -> out
//   hit(x, y, z, r, out)   is anything solid within r of (x, z), standing higher
//                   than it can drive up onto (its wheels at y)? If so, fill
//                   out: nx, nz (the way out of it), depth (m), what -> true
//
// The controls (step):
//   throttle  0..1    brake  0..1 (held at a standstill: reverse)
//   steer    -1..1    + is right
//
// Emits:
//   'bump'   (impact m/s, what)   ran into something
//   'land'   (strength 0..1)      came down after leaving the ground
//   'deep'   ()                   the water ahead is too deep
//   'steep'  ()                   too steep to climb: rolling back

import { Emitter } from '../core/events.js';
import { KINDS } from './kinds.js';

export const GRAVITY = 9.8; // m/s²
const STEP = 1 / 120; // s: the most one step of the sum takes
const DRAG = 0.0009; // 1/m: the air, at speed
const ROLL = 0.35; // m/s²: the tyres, always
const ENGINE_BRAKE = 0.9; // m/s²: the engine holding it back, with your foot off
const LOW_GEAR = 1.6; // how much harder it pulls at a crawl, in its lowest gear, than at speed
// How much of a kind's top speed (and grip) it has on each kind of ground,
// besides what its `rough` gives it off the road.
const GROUND = {
  paved: { top: 1, grip: 1, roll: 0 },
  gravel: { top: 0.78, grip: 0.8, roll: 0.25 },
  ground: { top: 0, grip: 0.65, roll: 0.9 },
  snow: { top: 0, grip: 0.4, roll: 1.4 },
};
const STEER_RATE = 2.6; // 1/s: how quickly the wheels come round to where you're steering
const STEER_FADE = 22; // m/s at which the most the wheels turn has halved
const STOPPED = 0.4; // m/s: slower than this, it's standing still
const SETTLE = 9; // 1/s: how quickly the body tips to the lie of its wheels
const HOP_FROM = 1.2; // m/s: rising slower than this, it never leaves the ground
const LEAVE = 2.5; // m/s: ...and only when the ground falls away under it faster than this
const RISE_MOST = 7; // m/s: the fastest the ground can lift it
const RISE_EASE = 12; // 1/s: how quickly that follows the lie of the ground
const BUMP_AT = 1.2; // m/s: running into something slower than this is a nudge, not a bump
const BOUNCE = 0.15; // of the speed it ran into something at, it comes back off it

const _g = { y: 0, kind: 'ground', water: 0 };
const _h = { nx: 0, nz: 0, depth: 0, what: '' };

export class Car extends Emitter {
  constructor(kind, ground) {
    super();
    this.ground = ground;
    this.use(kind);
    this.x = 0;
    this.z = 0;
    this.y = 0; // the ground under its middle, where its wheels' feet are
    this.vy = 0; // m/s, its springs, or falling
    this.yaw = 0; // which way it points: (sin, cos)
    this.v = 0; // m/s along the way it points (negative: backing)
    this.steer = 0; // radians the front wheels are turned (+ right)
    this.pitch = 0; // radians, nose up
    this.roll = 0; // radians, rolled to the right
    this.spin = 0; // radians the wheels have turned
    this.flying = false;
    this.kindUnder = 'ground'; // what it's on
    this.wet = 0; // how deep the water is under it (m)
    this.revs = 0; // 0..1 of the way from idle to the red line, for the sound
    this.gear = 1;
    this.load = 0; // 0..1 how hard the engine is working
  }

  use(kind) {
    this.kind = kind;
    this.k = KINDS[kind];
  }

  // Stand it at (x, z) pointing `yaw`, still, on the ground.
  place(x, z, yaw) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.v = 0;
    this.vy = 0;
    this.steer = 0;
    this.flying = false;
    const lie = this._lie();
    this.y = lie.y;
    this.pitch = lie.pitch;
    this.roll = lie.roll;
  }

  get speed() {
    return Math.abs(this.v);
  }

  get stopped() {
    return Math.abs(this.v) < STOPPED;
  }

  step(dt, c) {
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(STEP, left);
      this._step(h, c);
      left -= h;
    }
    // the engine, for the sound: which gear, and how far up it
    const k = this.k;
    const s = Math.abs(this.v) / k.top;
    const gears = k.sound.gears;
    this.gear = Math.min(gears, 1 + Math.floor(s * gears * 1.05));
    const inGear = s * gears - (this.gear - 1);
    this.revs = Math.max(0, Math.min(1, 0.08 + inGear * 0.85));
    this.load = c.throttle;
  }

  _step(dt, c) {
    const k = this.k;
    const g = this.ground.at(this.x, this.z, _g);
    const on = this.flying ? 'air' : g.kind;
    this.kindUnder = g.kind;
    this.wet = g.water;
    const G = GROUND[g.kind] || GROUND.ground;
    const top = k.top * (g.kind === 'paved' || g.kind === 'gravel' ? G.top : k.rough * (g.kind === 'snow' ? 0.6 : 1));
    const grip = k.grip * G.grip;

    // ── along the way it points ──
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    let a = 0;
    if (on !== 'air') {
      // the tyres, and the air
      const resist = ROLL * (1 + G.roll) + DRAG * this.v * this.v;
      // the engine, and the brakes (held at a standstill: reverse)
      if (c.throttle > 0) {
        if (this.v < -STOPPED) a += k.brake * c.throttle;
        else {
          // pulling harder in the low gears, and enough to beat the air up to its top speed
          const low = 1 + LOW_GEAR * Math.max(0, 1 - this.v / (top * 0.3));
          a += c.throttle * (k.accel * low * Math.max(0, 1 - (this.v / top) ** 2) + resist * Math.min(1, Math.max(0, top - this.v)));
        }
      }
      if (c.brake > 0) {
        if (this.v > STOPPED) a -= k.brake * c.brake;
        else a -= k.accel * 0.7 * c.brake * Math.max(0, 1 - (this.v / -k.reverse) ** 2);
      }
      // going faster than this ground lets it, it slows: the rough shakes it back
      if (Math.abs(this.v) > top) a -= Math.sign(this.v) * Math.min(k.brake, (Math.abs(this.v) - top) * 1.5);
      // gravity, along the slope it's on
      const grade = Math.tan(this.pitch);
      const pull = (-GRAVITY * grade) / Math.sqrt(1 + grade * grade);
      a += pull;
      if (Math.abs(grade) > k.climb && Math.sign(this.v || -grade) === Math.sign(grade)) {
        // past the steepest it can climb: it can't hold on, whatever you do
        if (c.throttle > 0 || c.brake > 0) this.emit('steep');
        a = pull * 0.6;
      } else if (Math.abs(this.v) < STOPPED && !c.throttle && !c.brake) {
        // standing, on its brakes
        a = 0;
        this.v = 0;
      } else {
        // and with your foot off, the engine holds it back too
        const hold = resist + (c.throttle ? 0 : ENGINE_BRAKE);
        a -= Math.min(Math.abs(this.v) / dt, hold) * Math.sign(this.v);
      }
      // in water it drags
      if (g.water > 0.05) a -= this.v * Math.min(1, g.water / k.wade) * 1.2;
    }
    this.v += a * dt;

    // ── turning ──
    const most = k.steer / (1 + Math.abs(this.v) / STEER_FADE);
    const want = c.steer * most;
    this.steer += (want - this.steer) * (1 - Math.exp(-STEER_RATE * 2 * dt));
    if (on !== 'air') {
      let rate = (this.v * Math.tan(this.steer)) / k.base;
      // no tighter than the tyres can hold it round
      const lat = Math.abs(rate * this.v);
      if (lat > grip) rate *= grip / lat;
      this.yaw += rate * dt;
    }

    // ── moving ──
    const wx = this.x;
    const wz = this.z;
    this.x += fx * this.v * dt;
    this.z += fz * this.v * dt;
    this.spin += (this.v * dt) / k.wheel;

    // not into water deeper than it can wade
    if (this.v !== 0) {
      const ahead = Math.sign(this.v) * (k.len / 2);
      const w = this.ground.at(this.x + fx * ahead, this.z + fz * ahead, _g).water;
      if (w > k.wade && w > this.wet) {
        this.x = wx;
        this.z = wz;
        if (Math.abs(this.v) > STOPPED) this.emit('deep');
        this.v = 0;
      }
    }

    // ── what it runs into ──
    // three circles down its length, its width across
    const r = k.wide / 2;
    const span = Math.max(0, k.len / 2 - r);
    for (const along of [-span, 0, span]) {
      const cx = this.x + fx * along;
      const cz = this.z + fz * along;
      if (!this.ground.hit(cx, this.y, cz, r, _h)) continue;
      this.x += _h.nx * _h.depth;
      this.z += _h.nz * _h.depth;
      // the part of its speed into it
      const into = -(fx * _h.nx + fz * _h.nz) * this.v;
      if (into > 0) {
        if (into > BUMP_AT) this.emit('bump', into, _h.what);
        this.v = -Math.sign(this.v) * into * BOUNCE;
      }
    }

    // ── on its wheels ──
    const lie = this._lie();
    const ease = 1 - Math.exp(-SETTLE * dt);
    if (this.flying) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= lie.y) {
        const hard = Math.min(1, -this.vy / 8);
        this.y = lie.y;
        this.vy = 0;
        this.flying = false;
        this.emit('land', hard);
      }
      this.pitch += (lie.pitch - this.pitch) * ease * 0.3;
      this.roll += (lie.roll - this.roll) * ease * 0.3;
    } else {
      // over a crest taken fast enough, the ground falls away under the way
      // it was rising, and it flies
      const ahead = this.y + this.vy * dt - (GRAVITY * dt * dt) / 2;
      if (this.vy > HOP_FROM && lie.y < ahead - LEAVE * dt) {
        this.flying = true;
        this.y = ahead;
        this.vy -= GRAVITY * dt;
      } else {
        // on the ground: how fast it's rising, smoothed (a kerb is a nudge, not a launch)
        const rise = Math.max(-RISE_MOST, Math.min(RISE_MOST, (lie.y - this.y) / dt));
        this.vy += (rise - this.vy) * Math.min(1, dt * RISE_EASE);
        this.y = lie.y;
      }
      this.pitch += (lie.pitch - this.pitch) * ease;
      this.roll += (lie.roll - this.roll) * ease;
    }
  }

  // How it would sit on its four wheels here: the height under its middle,
  // and its pitch (nose up) and roll (to the right).
  _lie() {
    const k = this.k;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    // looking along (fx, fz), the right hand is (-fz, fx)
    const rx = -fz;
    const rz = fx;
    const a = k.base / 2;
    const b = k.track / 2;
    const y = (u, v) => this.ground.at(this.x + fx * u + rx * v, this.z + fz * u + rz * v, _g).y;
    const fl = y(a, -b);
    const fr = y(a, b);
    const rl = y(-a, -b);
    const rr = y(-a, b);
    const front = Math.max(fl, fr) * 0.6 + Math.min(fl, fr) * 0.4;
    const rear = Math.max(rl, rr) * 0.6 + Math.min(rl, rr) * 0.4;
    const left = Math.max(fl, rl) * 0.6 + Math.min(fl, rl) * 0.4;
    const right = Math.max(fr, rr) * 0.6 + Math.min(fr, rr) * 0.4;
    return {
      y: (front + rear) / 2,
      pitch: Math.atan2(front - rear, k.base),
      roll: Math.atan2(left - right, k.track),
    };
  }

  // Where a spot in the car's own frame (across: to its left, up, along: to
  // its front) is in the world, as it sits now. -> out { x, y, z }
  toWorld(across, up, along, out = {}) {
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const lx = fz; // its left
    const lz = -fx;
    out.x = this.x + fx * along + lx * across;
    out.z = this.z + fz * along + lz * across;
    out.y = this.y + up + Math.sin(this.pitch) * along - Math.sin(this.roll) * across * -1;
    return out;
  }
}
