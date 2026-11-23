// An inner tube on the water, and how it goes where the water goes.
//
// It floats on the surface and the water carries it: down a river at the
// current's own speed, and across still water (a lake the river runs
// through) on a slow drift towards where the water leaves it, so that it
// comes out the far side and carries on down. It keeps to the deep water,
// away from the shallows along the banks, as anything afloat does where the
// current runs strongest; where it does run into the shallows it drags on
// the bottom and slides along them rather than climbing out. It knocks
// against boulders and spins away off them. Your hands, over the sides,
// can paddle it along, slowly, any way you like.
//
// It turns lazily as it goes, swinging round to face the way it's carried
// and spun this way and that in white water. It rides the surface a beat
// behind it, so it drops off the lip of a cascade and bobs up in the pool
// below.
//
// Pure: it is handed what it floats on, so it can be tested without a
// browser or a world.
//   world.water(x, z, out)   false where there's no water; else fills out
//                            { level, depth, flowX, flowZ, foam } (waterSample)
//   world.drain(x, z)        where still water at (x, z) runs out of it,
//                            { x, z }, or null where it has no way out (a lake
//                            that keeps its water, the sea)
//   world.hit(x, z, r, out)  true if something solid is within r of (x, z),
//                            filling out { nx, nz, depth, what }: which way
//                            and how far (m) to go to be clear of it
//
// Emits:
//   'bump'    (speed m/s, what)   knocked against something solid
//   'drop'    (height m)          down a step in the river
//   'ground'  ()                  run aground in the shallows
//   'afloat'  ()                  and off again

import { Emitter } from '../core/events.js';
import { waterSample, wrapAngle as wrap } from '../core/geom.js';
import { clamp, mulberry32, smoothstep } from '../noise.js';

// The tube: its outer radius and the radius of the tube itself (m), how
// deep the water must be to float it clear of the bottom with you sat in it,
// and how shallow before it's sitting on the bottom.
export const TUBE = { r: 0.58, ring: 0.17, draft: 0.32, aground: 0.12 };
// Your hands paddling it along (m/s): easily, and hard (shift).
export const PADDLE = { easy: 0.55, hard: 0.95 };
// Water slower than this (m/s) is still: there it drifts towards where the
// water drains, at this speed (m/s).
export const STILL = 0.12;
const DRIFT = 0.45;
// How quickly (1/s) the water brings it round to its own speed: afloat, and
// dragging on the bottom.
const DRAG = { afloat: 0.8, bottom: 5 };
// Keeping off the shallows: how hard it's turned out towards deeper water
// (m/s for each metre the bed falls per metre across), at most KEEP_MOST m/s,
// in water shallower than KEEP_DEPTH m; it feels for the depth PROBE m
// either side of itself.
const KEEP = 1.4;
const KEEP_MOST = 0.6;
const KEEP_DEPTH = 0.9;
const PROBE = 0.9;
// Knocking against something: how much of its speed into it it comes away
// with, and how much its speed along it spins it (rad/s per m/s). Slower
// than BUMP m/s it only nudges, and it's told about once a BUMP_EVERY s.
const BOUNCE = 0.35;
const SPIN_KICK = 1.2;
const BUMP = 0.25;
const BUMP_EVERY = 0.4;
// Turning (rad/s² for each radian it's off the way it's carried; 1/s for
// how quickly its spin dies away): left to itself, with your hands in the
// water turning it the way you paddle, how much white water spins it
// (rad/s²), and a slow wander of its own (rad/s²).
const TURN = { align: 0.35, damp: 0.9, hands: 2.4, handsDamp: 2.6, churn: 3, wander: 0.07 };
// Riding the surface: how stiffly (1/s²) and how damped (1/s) it springs
// to the water's level, how far under it the weight can push it (m), and
// gravity, for when the water falls away from under it.
const RIDE = { k: 45, damp: 6.5, under: 0.1, g: 9.8 };
// Down a step: the water's level fallen this far (m) within about DROP_TIME
// s, and not again for DROP_EVERY s.
const DROP = 0.22;
const DROP_TIME = 0.5;
const DROP_EVERY = 1.2;
// Rocking (radians): a little all the time, and more in white water.
const ROCK = { calm: 0.025, churn: 0.14 };
// No faster than this (m/s), whatever the water does.
const FASTEST = 7;

const TAU = Math.PI * 2;

export class Tube extends Emitter {
  constructor(world, seed = 1) {
    super();
    this.world = world;
    this.rng = mulberry32(seed >>> 0);
    this.ph = this.rng() * TAU;
    this._w = waterSample();
    this._d = waterSample();
    this._h = { nx: 0, nz: 0, depth: 0, what: '' };
    this.launch(0, 0, 0);
  }

  // Into the water at (x, z), facing yaw, at rest.
  launch(x, z, yaw = 0) {
    this.x = x;
    this.z = z;
    this.vx = 0;
    this.vz = 0;
    this.yaw = yaw;
    this.spin = 0;
    const w = this._w;
    this.level = this.world.water(x, z, w) ? w.level : 0;
    this.y = this.level;
    this.vy = 0;
    this.pitch = 0;
    this.roll = 0;
    this.t = 0;
    this.fell = 0;
    this.dropAt = -Infinity;
    this.bumpAt = -Infinity;
    // What it's on: the depth, the current (m/s), white water (0..1); whether
    // that's still water, and if it is, whether it drains anywhere; how far
    // aground it is (0 afloat .. 1 sat on the bottom), and whether it's out
    // of the water altogether.
    this.depth = 0;
    this.flowX = 0;
    this.flowZ = 0;
    this.foam = 0;
    this.still = false;
    this.end = false;
    this.ground = 0;
    this.aground = false;
    this.dry = false;
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  // How deep the water is at (x, z): 0 where there's none.
  depthAt(x, z) {
    return this.world.water(x, z, this._d) ? Math.max(0, this._d.depth) : 0;
  }

  // One step of dt s, your hands paddling the way c = { x, z } (world
  // directions, at most 1 long), hard if c.hard.
  step(dt, c) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const W = this.world;
    const w = this._w;
    if (!W.water(this.x, this.z, w) || w.depth <= 0.02) {
      // run out of water altogether: it stops where it is
      this.dry = true;
      const k = Math.exp(-dt * DRAG.bottom);
      this.vx *= k;
      this.vz *= k;
      return;
    }
    this.dry = false;
    const depth = w.depth;
    this.depth = depth;
    this.foam = w.foam;
    // the water's own way: its current, or in still water, towards where it
    // runs out
    let fx = w.flowX;
    let fz = w.flowZ;
    const flow = Math.hypot(fx, fz);
    this.flowX = fx;
    this.flowZ = fz;
    this.still = flow < STILL;
    this.end = false;
    if (this.still) {
      const to = W.drain(this.x, this.z);
      if (to) {
        const dx = to.x - this.x;
        const dz = to.z - this.z;
        const d = Math.hypot(dx, dz) || 1;
        const k = (DRIFT * (1 - flow / STILL) * Math.min(1, d / 2)) / d;
        fx += dx * k;
        fz += dz * k;
      } else this.end = true;
    }
    // which way the bed falls away into deeper water (m per m)
    const gx = (this.depthAt(this.x + PROBE, this.z) - this.depthAt(this.x - PROBE, this.z)) / (2 * PROBE);
    const gz = (this.depthAt(this.x, this.z + PROBE) - this.depthAt(this.x, this.z - PROBE)) / (2 * PROBE);
    // turned out of the shallows towards it, across the current but never
    // against it (a riffle is shallow too, and the river goes over it)
    const shallow = 1 - smoothstep(TUBE.draft, KEEP_DEPTH, depth);
    let kx = gx * KEEP * shallow;
    let kz = gz * KEEP * shallow;
    if (!this.still) {
      const ux = w.flowX / flow;
      const uz = w.flowZ / flow;
      const along = kx * ux + kz * uz;
      kx -= along * ux;
      kz -= along * uz;
    }
    const kl = Math.hypot(kx, kz);
    if (kl > KEEP_MOST) {
      kx *= KEEP_MOST / kl;
      kz *= KEEP_MOST / kl;
    }
    // aground, the bottom holds it against the water, though your hands
    // can still push it off
    const ground = 1 - smoothstep(TUBE.aground, TUBE.draft, depth);
    this.ground = ground;
    if (!this.aground && ground > 0.8) {
      this.aground = true;
      this.emit('ground');
    } else if (this.aground && ground < 0.3) {
      this.aground = false;
      this.emit('afloat');
    }
    const cl = Math.min(1, Math.hypot(c.x, c.z));
    const hands = (c.hard ? PADDLE.hard : PADDLE.easy) * (1 - 0.4 * ground);
    const cx = cl > 1e-4 ? (c.x / Math.hypot(c.x, c.z)) * cl * hands : 0;
    const cz = cl > 1e-4 ? (c.z / Math.hypot(c.x, c.z)) * cl * hands : 0;
    const held = 1 - 0.75 * ground;
    const tx = (fx + kx) * held + cx;
    const tz = (fz + kz) * held + cz;
    const k = 1 - Math.exp(-dt * (DRAG.afloat + (DRAG.bottom - DRAG.afloat) * ground));
    this.vx += (tx - this.vx) * k;
    this.vz += (tz - this.vz) * k;
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > FASTEST) {
      this.vx *= FASTEST / sp;
      this.vz *= FASTEST / sp;
    }

    // On its way, but not out of the deep water into the shallows across
    // the current (along the bank: it slides along them instead), nor up
    // out of the water anywhere (and where even sliding won't do, it stays
    // put). Shallows along the current, a ford or a riffle, it drags its
    // way over.
    let nx = this.x + this.vx * dt;
    let nz = this.z + this.vz * dt;
    let into = this.depthAt(nx, nz);
    if (into < TUBE.draft && into < depth) {
      let ax = gx;
      let az = gz;
      if (!this.still) {
        const ux = w.flowX / flow;
        const uz = w.flowZ / flow;
        const a = ax * ux + az * uz;
        ax -= a * ux;
        az -= a * uz;
      }
      this.#slide(ax, az);
      nx = this.x + this.vx * dt;
      nz = this.z + this.vz * dt;
      into = this.depthAt(nx, nz);
    }
    if (into < TUBE.aground && into < depth) {
      this.#slide(gx, gz);
      nx = this.x + this.vx * dt;
      nz = this.z + this.vz * dt;
      into = this.depthAt(nx, nz);
      if (into < TUBE.aground && into < depth) {
        nx = this.x;
        nz = this.z;
        this.vx *= 0.5;
        this.vz *= 0.5;
      }
    }
    // knocked off anything solid, and spun by it
    const h = this._h;
    if (W.hit(nx, nz, TUBE.r, h)) {
      const px = nx + h.nx * h.depth;
      const pz = nz + h.nz * h.depth;
      if (this.depthAt(px, pz) >= Math.min(TUBE.aground, depth)) {
        nx = px;
        nz = pz;
      } else {
        nx = this.x;
        nz = this.z;
      }
      const vn = this.vx * h.nx + this.vz * h.nz;
      if (vn < 0) {
        this.vx -= (1 + BOUNCE) * vn * h.nx;
        this.vz -= (1 + BOUNCE) * vn * h.nz;
        const vt = this.vz * h.nx - this.vx * h.nz;
        this.spin += vt * SPIN_KICK;
        if (-vn > BUMP && this.t - this.bumpAt > BUMP_EVERY) {
          this.bumpAt = this.t;
          this.emit('bump', -vn, h.what);
        }
      }
    }
    this.x = nx;
    this.z = nz;

    // Up and down with the surface, a beat behind it: buoyed up towards
    // it, and falling free where it has dropped away.
    const lvl = W.water(nx, nz, w) ? w.level : this.level;
    this.fell = this.fell * Math.exp(-dt / DROP_TIME) + Math.max(0, this.level - lvl);
    this.level = lvl;
    const ay = this.y > lvl + 0.02 ? -RIDE.g : RIDE.k * (lvl - this.y) - RIDE.damp * this.vy;
    this.vy += ay * dt;
    this.y += this.vy * dt;
    if (this.y < lvl - RIDE.under) {
      this.y = lvl - RIDE.under;
      if (this.vy < 0) this.vy *= -0.3;
    }
    if (this.fell > DROP && this.t - this.dropAt > DROP_EVERY) {
      this.dropAt = this.t;
      this.emit('drop', this.fell);
    }

    // Turning: round to face the way it's carried (or the way your hands
    // take it), spun about in white water, and wandering a little.
    const speed = Math.hypot(this.vx, this.vz);
    const paddling = cl > 0.05;
    const want = paddling ? Math.atan2(c.x, c.z) : speed > 0.05 ? Math.atan2(this.vx, this.vz) : this.yaw;
    const pull = paddling ? TURN.hands : TURN.align * smoothstep(0.05, 0.4, speed);
    const damp = paddling ? TURN.handsDamp : TURN.damp;
    const churn = (this.rng() * 2 - 1) * TURN.churn * this.foam;
    const wander = TURN.wander * Math.sin(this.t * 0.21 + this.ph);
    this.spin += (wrap(want - this.yaw) * pull + churn + wander - this.spin * damp) * dt;
    this.yaw = wrap(this.yaw + this.spin * dt);

    // Rocking on the water.
    const rock = ROCK.calm + ROCK.churn * this.foam;
    const kr = 1 - Math.exp(-dt * 4);
    this.pitch += (rock * Math.sin(this.t * 1.7 + this.ph) - clamp(this.vy * 0.12, -0.2, 0.2) - this.pitch) * kr;
    this.roll += (rock * Math.sin(this.t * 1.3 + this.ph * 2) - this.roll) * kr;
  }

  // Take out of its way whatever part of it goes against (gx, gz): up the
  // bed, into shallower water.
  #slide(gx, gz) {
    const gl = Math.hypot(gx, gz);
    if (gl < 1e-4) return;
    const vn = (this.vx * gx + this.vz * gz) / gl;
    if (vn >= 0) return;
    this.vx -= (vn * gx) / gl;
    this.vz -= (vn * gz) / gl;
  }
}
