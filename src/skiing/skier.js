// One skier, or boarder, sliding down the snow: the physics of it, and
// nothing else. It is handed the ground and what stands on it, and the
// controls each frame, and keeps where you are, which way you're going, what
// you did in the air and whether you're still on your feet. index.js puts the
// hiker there.
//
// On the snow, gravity pulls you down the slope and the snow takes the rest.
// Your edges hold you to the line the skis point along: whatever you slide
// sideways bleeds away, most of it turned into speed along the skis (that's a
// carve), the rest lost (a skid). Friction and the air hold you back, more
// upright than tucked. You turn as quickly as your edges can carry you round
// at the speed you're going, and pivot round at a standstill; braking skids
// you round and slows you hard.
//
// Over the top of something the ground can only pull you round as hard as
// gravity presses you onto it: go faster than that and you leave it, and fly
// until you come down again. In the air you can spin, flip and grab (with a
// key pressed since you left the ground, so a turn you were carving into the
// lip doesn't wind you round). Come down with your skis along the way you're
// going (or the other way round: then you ride backwards until you swing
// round), upright, and not too hard, and you ride away; otherwise you fall.
// So do you hitting a tree or a boulder at speed, or skiing fast onto the
// rocks. Fallen, you tumble, slide to a stop, lie there a moment and get up,
// skis across the slope.
//
// The ground (index.js gives it):
//   height(x, z)          m
//   snow(x, z)            0..1 how much snow lies there (none on rock, grass)
//   hit(x, y, z, r, out)  is anything solid within r of (x, z), for someone
//                         with their feet at y? If so, fill out: nx, nz (the
//                         way out of it), depth (m), what ('a tree')
//
// The controls (step):
//   steer  -1..1  + is right     tuck   0..1  crouch, and push along on the flat
//   brake  0..1                  pop    a jump (pressed this frame)
//   grab   held, in the air      flip   -1..1 + forward, in the air
//
// Emits:
//   'takeoff'  (popped)          off the ground, for long enough to be an air
//   'land'     ({ air, impact, name, points, switched, sketchy })   on your skis
//   'touch'    (impact)          back down after a skip over a bump
//   'bump'     (strength 0..1)   the knees taking a hump in the snow
//   'brush'    (what, speed)     glanced off something
//   'crash'    (why, speed)
//   'up'       ()                back on your feet after a fall

import { Emitter } from '../core/events.js';
import { smoothstep } from '../noise.js';
import { counts, fall, nameOf, score } from './tricks.js';
import { wrapAngle as wrap } from '../core/geom.js';

// m/s²: a little less than the hiker's own (CONFIG.gravity), so airs float a
// little and the slopes don't run away with you.
export const GRAVITY = 12;
// What's underfoot, and how it goes:
//   grip     1/s: how fast the edges take sideways slip away
//   carve    0..1: how much of that slip turns into speed along them
//   brake    m/s² braking (a snowplough, or the board skidded on its heels)
//   push     [m/s, m/s²]: pushing along on the flat (poling, or skating one-footed)
//   pop      m/s: a jump, square off the snow
//   turn     [rad/s at a standstill, m/s² round a carve, rad/s skidding round]
//   spin, flip   rad/s in the air
export const GEAR = {
  skis: { grip: 9, carve: 0.85, brake: 6.5, push: [5, 3.2], pop: 5, turn: [2.8, 16, 2.6], spin: 10, flip: 7 },
  board: { grip: 8, carve: 0.85, brake: 7.5, push: [3, 2.2], pop: 5.5, turn: [2.4, 15, 2.8], spin: 10.5, flip: 7 },
};
const STEP = 1 / 120; // s: the most one step of the sum takes
const SPAN = 1; // m either side to find which way the snow slopes (the ground's grid)
const FRICTION = 0.05; // of the snow, against what presses you into it
// 1/m: the air's drag, upright and tucked, and flying.
const DRAG = { up: 0.014, tuck: 0.008, air: 0.006 };
const SCRAPE = 8; // m/s²: bare ground, under skis
const TURN_EASE = 10; // 1/s: how quickly the skis come round to the turn you ask for
const EDGE_HOLD = 1.5; // m/s: slipping sideways slower than this, the edges hold you
const SWITCH = 0.8; // m/s backwards and you're riding backwards: the skis swing round
const REVERT = 5; // 1/s: how quickly you swing round to face forward again
// In the air: how quickly a spin or flip gets going and dies away (1/s), and,
// with nothing pressed, how quickly you settle square to land (1/s) when within
// this much (radians) of it.
const SPIN_EASE = [14, 9];
const SETTLE = [5, 1.1, 1.4];
// It's an air (and is called one) once you're this high (m) or this long (s) off the snow.
const AIR_GAP = 0.15;
const AIR_TIME = 0.15;
const RADIUS = 0.3; // m: you, to trunks and boulders
// Into something faster than this (m/s, square on) and you fall; slower, you
// glance off. Into the snow faster than BUMP you feel it; faster than SLAM
// you fall.
const CRASH_HIT = 4.5;
const BUMP = 2;
const SLAM = 12;
// Onto rock this steep (1 - the slope's up: about 39°, where snow starts to
// slide off it) faster than this (m/s), and you fall.
const ROCK = { steep: 0.22, speed: 8 };
// Fallen: the snow holds a body this hard (m/s², and per m/s more), it rolls
// this many radians per metre, and you get up this long after, once you've
// stopped (or this long after anyway).
const TUMBLE = { friction: 9, more: 0.3, roll: 1.6, up: 2.2, most: 6 };

const _n = { x: 0, y: 1, z: 0 };
const _hit = { nx: 0, nz: 0, depth: 0, what: '' };

export class Skier extends Emitter {
  // kind: 'skis' or 'board' (GEAR)
  constructor(ground, kind = 'skis') {
    super();
    this.ground = ground;
    this.x = this.y = this.z = 0;
    this.vx = this.vy = this.vz = 0;
    this.yaw = 0; // which way the skis point (+z at 0, like the hiker)
    this.yawRate = 0;
    this.face = 0; // how far you face round from that (π riding backwards)
    this.grounded = true; // touching the snow
    this.flying = false; // in the air, for long enough to be an air
    this.air = blankAir();
    this.flipA = 0; // head over heels (radians, + forward)
    this.spinRate = 0;
    this.flipRate = 0;
    this._held = { steer: 0, flip: 0 }; // keys still down from before the air
    this._lastSteer = 0;
    this._lastFlip = 0;
    this.grabbing = false;
    this.down = -1; // s since you fell; -1 on your feet
    this.roll = 0; // how far you've tumbled (radians)
    this.why = '';
    this.lateral = 0; // m/s² round the turn you're carving (+ to the left)
    this.compress = 0; // 0..1 the knees taking a bump or a landing
    this.bare = 0; // 0..1 how bare the ground under your skis is
    this.steep = 0; // 1 - the snow's up: 0 flat, 0.3 about 45°
    this.use(kind);
  }

  use(kind) {
    this.kind = GEAR[kind] ? kind : 'skis';
    this.gear = GEAR[this.kind];
  }

  get speed() {
    return Math.hypot(this.vx, this.vy, this.vz);
  }

  // Which way you're going over the ground (radians, like yaw).
  get heading() {
    return Math.hypot(this.vx, this.vz) > 0.3 ? Math.atan2(this.vx, this.vz) : this.yaw;
  }

  // Set off from (x, z), at (vx, vz) along the ground, skis pointing yaw.
  start(x, z, vx = 0, vz = 0, yaw = Math.atan2(vx, vz)) {
    this.x = x;
    this.z = z;
    this.y = this.ground.height(x, z);
    const n = this.normal(x, z, _n);
    this.vx = vx;
    this.vz = vz;
    this.vy = -(vx * n.x + vz * n.z) / n.y; // along the slope
    this.yaw = yaw;
    this.yawRate = this.spinRate = this.flipRate = this.flipA = 0;
    this.face = 0;
    this.grounded = true;
    this.flying = false;
    this.air = blankAir();
    this.down = -1;
    this.roll = 0;
    this.compress = 0;
  }

  // Which way the snow faces at (x, z): out = unit { x, y, z }.
  normal(x, z, out) {
    return normalAt(this.ground.height, x, z, out);
  }

  step(dt, c) {
    // what was held as you left the ground doesn't count in the air
    this._lastSteer = c.steer || 0;
    this._lastFlip = c.flip || 0;
    const n = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / n;
    let pop = !!c.pop;
    for (let i = 0; i < n; i++) {
      if (this.down >= 0) this._tumble(h);
      else if (this.grounded) {
        this._glide(h, c, pop);
        pop = false;
      } else this._fly(h, c);
      if (this.down < 0 && this.grounded) this.face -= wrap(this.face) * (1 - Math.exp(-h * REVERT));
      this.compress *= Math.exp(-h * 4);
    }
    if (!this.grounded || this.down >= 0) this.lateral = 0;
  }

  // ── On the snow ───────────────────────────────────────────────────────────
  _glide(h, c, pop) {
    const G = GRAVITY;
    const gear = this.gear;
    const n = this.normal(this.x, this.z, _n);
    const nx = n.x;
    const ny = n.y;
    const nz = n.z;
    const speed = this.speed;

    // round the turn: carved at speed, pivoted at a standstill, skidded braking
    let rate = Math.min(gear.turn[0], gear.turn[1] / Math.max(speed, 0.5));
    if (c.brake > 0) rate = Math.max(rate, gear.turn[2] * c.brake);
    this.yawRate += (-(c.steer || 0) * rate - this.yawRate) * (1 - Math.exp(-h * TURN_EASE));
    this.yaw = wrap(this.yaw + this.yawRate * h);

    // the skis' line on the slope (d), and across it to their left (s)
    let dx = Math.sin(this.yaw);
    let dz = Math.cos(this.yaw);
    let dy = -(dx * nx + dz * nz) / ny;
    const dl = Math.hypot(dx, dy, dz);
    dx /= dl;
    dy /= dl;
    dz /= dl;
    let sx = ny * dz - nz * dy;
    let sy = nz * dx - nx * dz;
    let sz = nx * dy - ny * dx;

    // gravity, along the slope: the snow takes the rest, and while you're
    // hardly slipping sideways, the edges take what pulls you that way
    let gx = G * ny * nx;
    let gy = G * ny * ny - G;
    let gz = G * ny * nz;
    if (Math.abs(this.vx * sx + this.vy * sy + this.vz * sz) < EDGE_HOLD) {
      const gs = gx * sx + gy * sy + gz * sz;
      gx -= gs * sx;
      gy -= gs * sy;
      gz -= gs * sz;
    }
    this.vx += gx * h;
    this.vy += gy * h;
    this.vz += gz * h;

    let va = this.vx * dx + this.vy * dy + this.vz * dz;
    let vs = this.vx * sx + this.vy * sy + this.vz * sz;
    // sliding backwards: turn the skis round, and ride that way for now
    if (va < -SWITCH) {
      this.yaw = wrap(this.yaw + Math.PI);
      this.face += Math.PI;
      va = -va;
      vs = -vs;
      dx = -dx;
      dy = -dy;
      dz = -dz;
      sx = -sx;
      sy = -sy;
      sz = -sz;
    }
    // the edges: sideways slip bleeds away, mostly into speed along the skis
    const brake = c.brake || 0;
    const slip = vs * Math.exp(-h * gear.grip * (1 - 0.35 * brake));
    const keep = gear.carve * (1 - brake);
    va = (va < 0 ? -1 : 1) * Math.sqrt(va * va + keep * (vs * vs - slip * slip));
    vs = slip;

    // the snow, the air, the brakes, and bare ground
    this.bare = 1 - smoothstep(0.2, 0.6, this.ground.snow(this.x, this.z));
    this.steep = 1 - ny;
    const tuck = (c.tuck || 0) * (1 - brake);
    const sp = Math.hypot(va, vs);
    const drag = DRAG.up + (DRAG.tuck - DRAG.up) * tuck;
    const slow = FRICTION * G * ny + drag * sp * sp + brake * gear.brake + this.bare * SCRAPE;
    const k = sp > 1e-6 ? Math.max(0, sp - slow * h) / sp : 0;
    va *= k;
    vs *= k;
    // pushing along on the flat
    if (tuck > 0 && va < gear.push[0] && va > -0.3) va += gear.push[1] * tuck * (1 - Math.max(0, va) / gear.push[0]) * h;

    this.vx = va * dx + vs * sx;
    this.vy = va * dy + vs * sy;
    this.vz = va * dz + vs * sz;
    this.lateral = this.yawRate * Math.max(0, va);

    if (pop) {
      this.vx += nx * gear.pop;
      this.vy += ny * gear.pop;
      this.vz += nz * gear.pop;
      this._leave(true);
    }

    this.x += this.vx * h;
    this.y += this.vy * h;
    this.z += this.vz * h;
    if (this._collide(false)) return;

    // onto the rocks, fast
    if (this.bare > 0.5 && this.steep > ROCK.steep && sp > ROCK.speed) return this._fall('onto the rocks');
    if (!this.grounded) return;

    // still on the snow? It can only pull you round as hard as gravity presses you onto it
    const g = this.ground.height(this.x, this.z);
    const m = this.normal(this.x, this.z, _n);
    const vn = this.vx * m.x + this.vy * m.y + this.vz * m.z;
    if (vn > G * m.y * h && this.y >= g - 0.02) return this._leave(false);
    this.y = g;
    this.vx -= vn * m.x;
    this.vy -= vn * m.y;
    this.vz -= vn * m.z;
    if (-vn > SLAM) return this._fall('into the slope');
    if (-vn > BUMP) {
      const s = Math.min(1, -vn / 8);
      this.compress = Math.max(this.compress, s);
      this.emit('bump', s);
    }
  }

  _leave(popped) {
    this.grounded = false;
    this.air = blankAir();
    this.air.popped = popped;
    this._held.steer = Math.sign(this._lastSteer || 0);
    this._held.flip = Math.sign(this._lastFlip || 0);
    this.spinRate = 0;
    this.flipRate = 0;
    if (popped) {
      this.flying = true;
      this.emit('takeoff', true);
    }
  }

  // A key counts in the air only once it has been let go since take-off.
  _fresh(key, v) {
    const s = Math.sign(v || 0);
    if (this._held[key] && s !== this._held[key]) this._held[key] = 0;
    return this._held[key] ? 0 : v || 0;
  }

  // ── In the air ────────────────────────────────────────────────────────────
  _fly(h, c) {
    const G = GRAVITY;
    const gear = this.gear;
    const air = this.air;
    const steer = this._fresh('steer', c.steer);
    const flip = this._fresh('flip', c.flip);
    this.spinRate += (-steer * gear.spin - this.spinRate) * (1 - Math.exp(-h * SPIN_EASE[steer ? 0 : 1]));
    this.flipRate += (flip * gear.flip - this.flipRate) * (1 - Math.exp(-h * SPIN_EASE[flip ? 0 : 1]));
    let spun = this.spinRate * h;
    let flipped = this.flipRate * h;
    // let go of everything, and you settle square to land
    if (!steer && Math.abs(this.spinRate) < 1) {
      const off = wrap(this.yaw - this.heading);
      const square = Math.abs(off) > Math.PI / 2 ? wrap(off - Math.PI) : off;
      if (Math.abs(square) < SETTLE[1]) spun -= square * (1 - Math.exp(-h * SETTLE[0]));
    }
    if (!flip && Math.abs(this.flipRate) < 1) {
      const w = wrap(this.flipA);
      if (Math.abs(w) < SETTLE[2]) flipped -= w * (1 - Math.exp(-h * SETTLE[0]));
    }
    this.yaw = wrap(this.yaw + spun);
    this.flipA += flipped;
    air.spin += spun;
    air.flip += flipped;
    this.grabbing = !!c.grab && this.flying;
    if (this.grabbing) air.grab += h;

    this.vy -= G * h;
    const k = 1 - DRAG.air * this.speed * h;
    this.vx *= k;
    this.vy *= k;
    this.vz *= k;
    this.x += this.vx * h;
    this.y += this.vy * h;
    this.z += this.vz * h;
    if (this._collide(false)) return;

    const g = this.ground.height(this.x, this.z);
    air.time += h;
    air.height = Math.max(air.height, this.y - g);
    if (!this.flying && (air.height > AIR_GAP || air.time > AIR_TIME)) {
      this.flying = true;
      this.emit('takeoff', false);
    }
    if (this.y <= g) this._land(g);
  }

  _land(g) {
    const n = this.normal(this.x, this.z, _n);
    this.y = g;
    const vn = this.vx * n.x + this.vy * n.y + this.vz * n.z;
    const impact = Math.max(0, -vn);
    this.vx -= vn * n.x;
    this.vy -= vn * n.y;
    this.vz -= vn * n.z;
    this.grounded = true;
    const was = this.flying;
    this.flying = false;
    const air = this.air;
    this.spinRate = this.flipRate = 0;
    if (!counts(air)) {
      this.flipA = 0;
      if (was) this.emit('touch', Math.min(1, impact / 8));
      return;
    }
    const off = wrap(this.yaw - this.heading);
    const switched = Math.abs(off) > Math.PI / 2;
    const skew = switched ? wrap(off - Math.PI) : off;
    const why = fall({ skew, upright: this.flipA, impact });
    if (why) return this._fall(`landed ${why}`);
    // on your skis: they come round to the way you're going, and if that's
    // backwards, you ride backwards until you swing round
    if (switched) {
      this.yaw = wrap(this.yaw - Math.PI);
      this.face += Math.PI;
    }
    this.flipA = 0;
    const absorb = 1 - Math.min(0.4, impact * 0.025);
    this.vx *= absorb;
    this.vy *= absorb;
    this.vz *= absorb;
    this.compress = Math.min(1, 0.3 + impact / 10);
    const sketchy = this.grabbing;
    this.grabbing = false;
    this.emit('land', { air: { ...air }, impact, name: nameOf(air, this.kind), points: score(air, { switched, sketchy }), switched, sketchy });
  }

  // ── Into things ───────────────────────────────────────────────────────────
  // Push out of anything solid. -> true if that was a fall.
  _collide(tumbling) {
    if (!this.ground.hit(this.x, this.y, this.z, RADIUS, _hit)) return false;
    this.x += _hit.nx * _hit.depth;
    this.z += _hit.nz * _hit.depth;
    const vn = this.vx * _hit.nx + this.vz * _hit.nz;
    if (vn >= 0) return false;
    if (!tumbling && -vn > CRASH_HIT) {
      // knocked back off it a little
      this.vx -= 1.3 * vn * _hit.nx;
      this.vz -= 1.3 * vn * _hit.nz;
      this._fall(`into ${_hit.what}`);
      return true;
    }
    this.vx -= vn * _hit.nx;
    this.vz -= vn * _hit.nz;
    if (!tumbling && -vn > 1.5) this.emit('brush', _hit.what, -vn);
    return false;
  }

  // ── Falling, and getting up ───────────────────────────────────────────────
  _fall(why) {
    this.down = 0;
    this.why = why;
    this.roll = 0;
    this.flying = false;
    this.grabbing = false;
    this.spinRate = this.flipRate = 0;
    this.emit('crash', why, this.speed);
  }

  _tumble(h) {
    const G = GRAVITY;
    this.down += h;
    const g = this.ground.height(this.x, this.z);
    if (this.y > g + 0.05) {
      this.vy -= G * h;
    } else {
      this.y = g;
      const n = this.normal(this.x, this.z, _n);
      const vn = this.vx * n.x + this.vy * n.y + this.vz * n.z;
      this.vx -= vn * n.x;
      this.vy -= vn * n.y;
      this.vz -= vn * n.z;
      this.vx += G * n.y * n.x * h;
      this.vy += (G * n.y * n.y - G) * h;
      this.vz += G * n.y * n.z * h;
      const sp = this.speed;
      const k = sp > 1e-6 ? Math.max(0, sp - (TUMBLE.friction + TUMBLE.more * sp) * h) / sp : 0;
      this.vx *= k;
      this.vy *= k;
      this.vz *= k;
      this.grounded = true;
    }
    this.x += this.vx * h;
    this.y += this.vy * h;
    this.z += this.vz * h;
    this._collide(true);
    if (this.y < this.ground.height(this.x, this.z)) this.y = this.ground.height(this.x, this.z);
    this.roll += Math.hypot(this.vx, this.vz) * TUMBLE.roll * h;
    // flip the flip back to nothing, as you come to a stop
    this.flipA *= Math.exp(-h * 3);
    if ((this.down > TUMBLE.up && this.speed < 1.2) || this.down > TUMBLE.most) this._getUp();
  }

  // Up again, still, skis across the slope (the way round nearest to how you lay).
  _getUp() {
    const n = this.normal(this.x, this.z, _n);
    this.down = -1;
    this.vx = this.vy = this.vz = 0;
    this.y = this.ground.height(this.x, this.z);
    if (Math.hypot(n.x, n.z) > 0.02) {
      const fall = Math.atan2(n.x, n.z); // straight down the slope
      const a = wrap(fall + Math.PI / 2);
      const b = wrap(fall - Math.PI / 2);
      this.yaw = Math.abs(wrap(a - this.yaw)) < Math.abs(wrap(b - this.yaw)) ? a : b;
    }
    this.face = 0;
    this.flipA = 0;
    this.roll = 0;
    this.yawRate = 0;
    this.grounded = true;
    this.air = blankAir();
    this.emit('up');
  }
}

// Which way the ground faces at (x, z), from height(x, z): out = unit
// { x, y, z }. Measured across SPAN either side, so that over the flat faces
// of the ground's mesh it turns smoothly rather than in jumps.
export function normalAt(height, x, z, out) {
  const gx = (height(x + SPAN, z) - height(x - SPAN, z)) / (2 * SPAN);
  const gz = (height(x, z + SPAN) - height(x, z - SPAN)) / (2 * SPAN);
  const l = Math.hypot(gx, 1, gz);
  out.x = -gx / l;
  out.y = 1 / l;
  out.z = -gz / l;
  return out;
}

function blankAir() {
  return { time: 0, height: 0, spin: 0, flip: 0, grab: 0, popped: false };
}
