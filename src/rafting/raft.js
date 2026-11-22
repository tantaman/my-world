// A whitewater raft on the river: how the water carries it, how the paddles
// drive it, and how it bucks, spins and, now and then, goes over.
//
// It is a body, not a point. The water takes hold of it at six places round
// its hull (the bow, the stern, and either side fore and aft) and drags each
// towards its own speed there: so it's carried down the river at the
// current's pace, and where the water runs differently at the bow than at
// the stern (round a bend, off the edge of a rapid's tongue, past a rock)
// it's turned. It slides along its length more easily than across it. The
// paddles drive it along its length and spin it about; the river doesn't
// care which way it points, so whoever is guiding has to.
//
// It rides the surface a beat behind it, as the tube does: over a rapid's
// lip it drops, and bobs up in the pool below. Through a rapid's standing
// waves (laid out as the water's shader lays them out, by the water's own
// level: a crest every WAVE.drop m of fall) the bow climbs and plunges;
// side-on, one tube is lifted as the other drops. Big water side-on, or a
// rock hit hard side-on, can roll it right over ('flip'): it floats on
// upside down until someone rights it (right()).
//
// The shallows, the banks and the rocks push back at whichever part of it
// runs into them, so it slides along a bank and spins off a rock.
//
// Pure: it is handed what it floats on, as the tube is (tubing/tube.js):
//   world.water(x, z, out)   false where there's none; else fills out
//                            { level, depth, flowX, flowZ, foam } (waterSample)
//   world.drain(x, z)        where still water at (x, z) runs out of it,
//                            { x, z }, or null where it has no way out
//   world.hit(x, z, r, out)  true if something solid is within r of (x, z),
//                            filling out { nx, nz, depth, what }: which way
//                            and how far (m) to go to be clear of it
//
// Emits:
//   'bump'    (speed m/s, what)   knocked against something solid, or the bank
//   'drop'    (height m)          over a step or a rapid's lip
//   'wave'    (size 0..1)         the bow through a big wave
//   'flip'    ()                  gone over
//   'ground'  ()                  run aground in the shallows
//   'afloat'  ()                  and off again

import { Emitter } from '../core/events.js';
import { waterSample } from '../core/geom.js';
import { clamp, mulberry32, smoothstep } from '../noise.js';

// The raft (m): how long and broad it is, how fat its tubes are, how deep it
// sits loaded, and how shallow the water is before it's on the bottom.
export const RAFT = { len: 4.3, beam: 2.0, tube: 0.26, draft: 0.22, aground: 0.08 };
// Where the water takes hold of it, across (+ to its left) and along (+
// forward) from its middle (m); and how near a rock each can come (m).
export const GRIP = [
  [0, 1.95, 0.45],
  [0, -1.95, 0.45],
  [0.85, 1.0, 0.4],
  [-0.85, 1.0, 0.4],
  [0.85, -1.0, 0.4],
  [-0.85, -1.0, 0.4],
];
// How hard the water drags it to its own speed (1/s), along its length and
// across it.
const DRAG = { rate: 0.85, along: 0.7, across: 1 };
// How hard it is to turn, for how hard it is to push: (len² + beam²) / 12.
const INERTIA = (RAFT.len ** 2 + RAFT.beam ** 2) / 12;
// The paddles: how fast (m/s) the guide alone drives it through the water,
// easy and hard, and how fast (rad/s) they spin it round.
export const PADDLE = { speed: [1.2, 1.8], spin: [0.75, 1.15] };
// Turning in the water dies away at this rate (1/s), over what the water's
// grip on it does.
const SPIN_DAMP = 0.6;
// Still water slower than this (m/s): there it drifts towards where the
// water drains, at this speed (m/s).
export const STILL = 0.12;
const DRIFT = 0.4;
// The shallows and the banks: how hard (1/s² for each m too shallow) a part
// of it aground is pushed out to deeper water, at most PUSH_MOST m/s², and
// how hard the bottom holds it (1/s).
const PUSH = 30;
const PUSH_MOST = 6;
const BOTTOM = 4;
// Feeling which way the bed falls away, this far (m) either side.
const PROBE = 0.7;
// Knocking against something: how much of its speed into it it comes away
// with; slower than BUMP m/s it only nudges, and it's told about once a
// BUMP_EVERY s.
const BOUNCE = 0.3;
const BUMP = 0.35;
const BUMP_EVERY = 0.5;
// Riding the surface: how stiffly (1/s²) and how damped (1/s) it springs to
// the water's level, how far under it its weight can push it (m), and
// gravity, for when the water falls away from under it.
const RIDE = { k: 40, damp: 6, under: 0.12, g: 9.8 };
// Tipping fore and aft, and side to side, to the water under it: how stiffly
// (1/s²) and how damped (1/s).
const TIP = { k: 22, damp: 5 };
// Down a step: the level fallen this far (m) within about DROP_TIME s, and
// not again for DROP_EVERY s.
const DROP = 0.3;
const DROP_TIME = 0.5;
const DROP_EVERY = 1.2;
// A rapid's standing waves, as the water's shader draws them (RAPID_WAVES
// in world/waterSurface.js): a crest every `drop` m of fall of the surface,
// where the water runs between `fast` m/s and is white over `foam`; at
// their biggest, `height` m from the middle to a crest; and on a crest's
// face the water runs this much slower, holding back whatever's on it.
export const WAVE = { drop: 0.14, fast: [1.3, 3.2], foam: [0.2, 0.6], height: 0.28, stall: 0.45 };
// Going over: a wave crest the bow goes through, side-on, at this severity
// (how big the wave, how side-on, how fast the water) turns it over this
// often, from never to always; a rock hit side-on at FLIP.rock m/s and over
// can too, at the same odds by speed. Rolled further than FLIP.roll (rad)
// it's gone.
const FLIP = { wave: [0.45, 1.1], rock: [1.6, 3.2], roll: 1.15 };
// White water spins it about (rad/s²) and rocks it (rad).
const CHURN = { spin: 0.9, rock: 0.05 };
// No faster than this (m/s), whatever the water does.
const FASTEST = 7.5;

const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// How much of a rapid's waves are at (flow m/s, foam 0..1): 0..1.
export function waveSize(flow, foam) {
  return smoothstep(WAVE.fast[0], WAVE.fast[1], flow) * smoothstep(WAVE.foam[0], WAVE.foam[1], foam);
}
// The surface's rise (m) over its level at `level`, with waves of `size`.
export function waveRise(level, size) {
  return size * WAVE.height * Math.cos((level / WAVE.drop) * TAU);
}

export class Raft extends Emitter {
  constructor(world, seed = 1) {
    super();
    this.world = world;
    this.rng = mulberry32(seed >>> 0);
    this.ph = this.rng() * TAU;
    this._w = waterSample();
    this._d = waterSample();
    this._h = { nx: 0, nz: 0, depth: 0, what: '' };
    // what the water is at each place it grips: level, depth, the surface
    // with its waves, and where that place is
    this.at = GRIP.map(() => ({ x: 0, z: 0, level: 0, depth: 0, surf: 0, wet: false }));
    this.launch(0, 0, 0);
  }

  // Onto the water at (x, z), facing yaw, at rest and right way up.
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
    this.vpitch = 0;
    this.roll = 0;
    this.vroll = 0;
    this.flipped = false;
    this.t = 0;
    this.fell = 0;
    this.dropAt = -Infinity;
    this.bumpAt = -Infinity;
    this.crestPh = null;
    // What it's on, at its middle: the depth, the current (m/s), white water
    // (0..1), the rapid's waves (0..1); whether that's still water and, if
    // it is, whether it drains anywhere; how far aground it is (0 afloat .. 1
    // sat on the bottom), and whether it's out of the water altogether; and
    // how side-on to the current it lies (0 straight down it .. 1 across).
    this.depth = 0;
    this.flowX = 0;
    this.flowZ = 0;
    this.foam = 0;
    this.waves = 0;
    this.still = false;
    this.end = false;
    this.ground = 0;
    this.aground = false;
    this.dry = false;
    this.side = 0;
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  // Where a place on it (across, along: m, + left and forward) is now, into out.
  toWorld(a, f, out) {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    out.x = this.x + a * c + f * s;
    out.z = this.z - a * s + f * c;
    return out;
  }

  depthAt(x, z) {
    return this.world.water(x, z, this._d) ? Math.max(0, this._d.depth) : 0;
  }

  // Right way up again: someone has hauled it back over (and shown it
  // rolling back, if they wanted it seen).
  right() {
    if (!this.flipped) return;
    this.flipped = false;
    this.roll = 0;
    this.vroll = 0;
  }

  // One step of dt s. c: the paddles, { fwd, turn, hard }: fwd -1..1 drives
  // it along its length (back-paddling, negative), turn -1..1 spins it to
  // its left; more than 1 with a crew paddling too.
  step(dt, c) {
    dt = Math.min(dt, 0.1);
    const n = Math.ceil(dt / 0.034);
    for (let i = 0; i < n; i++) this.#step(dt / n, c);
  }

  #step(dt, c) {
    this.t += dt;
    const W = this.world;
    const w = this._w;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    // forward, and to its left
    const fx = sy;
    const fz = cy;
    const lx = cy;
    const lz = -sy;

    // ── The water at its middle ──
    if (!W.water(this.x, this.z, w) || w.depth <= 0.02) {
      // run out of water altogether: it stops where it is
      this.dry = true;
      const k = Math.exp(-dt * BOTTOM);
      this.vx *= k;
      this.vz *= k;
      this.spin *= k;
      return;
    }
    this.dry = false;
    this.depth = w.depth;
    this.foam = w.foam;
    const flow = Math.hypot(w.flowX, w.flowZ);
    this.flowX = w.flowX;
    this.flowZ = w.flowZ;
    this.waves = waveSize(flow, w.foam);
    this.still = flow < STILL;
    this.end = false;
    // still water drifts it towards where it runs out
    let driftX = 0;
    let driftZ = 0;
    if (this.still) {
      const to = W.drain(this.x, this.z);
      if (to) {
        const dx = to.x - this.x;
        const dz = to.z - this.z;
        const d = Math.hypot(dx, dz) || 1;
        const k = (DRIFT * (1 - flow / STILL) * Math.min(1, d / 2)) / d;
        driftX = dx * k;
        driftZ = dz * k;
      } else this.end = true;
    }
    this.side = flow > STILL ? Math.abs(fx * (w.flowZ / flow) - fz * (w.flowX / flow)) : 0;

    // ── Where the water holds it: dragged towards its speed at each place ──
    let ax = 0;
    let az = 0;
    let aw = 0; // spin, rad/s²
    let grounded = 0;
    const k = DRAG.rate / GRIP.length;
    for (let i = 0; i < GRIP.length; i++) {
      const [a, f] = GRIP[i];
      const p = this.at[i];
      const rx = a * lx + f * fx;
      const rz = a * lz + f * fz;
      p.x = this.x + rx;
      p.z = this.z + rz;
      // how fast that place is going
      const px = this.vx + this.spin * rz;
      const pz = this.vz - this.spin * rx;
      p.wet = W.water(p.x, p.z, w);
      p.depth = p.wet ? Math.max(0, w.depth) : 0;
      p.level = p.wet ? w.level : this.level;
      const size = p.wet ? waveSize(Math.hypot(w.flowX, w.flowZ), w.foam) : 0;
      p.surf = p.level + waveRise(p.level, size);
      // (on a wave's face the water piles up and holds it back: a crest
      // under the bow stalls it, and the stern comes round)
      const crest = Math.max(0, Math.cos((p.level / WAVE.drop) * TAU));
      const held = 1 - WAVE.stall * size * crest * crest;
      const ux = (p.wet ? w.flowX * held : 0) + driftX - px;
      const uz = (p.wet ? w.flowZ * held : 0) + driftZ - pz;
      const along = (ux * fx + uz * fz) * DRAG.along;
      const across = (ux * lx + uz * lz) * DRAG.across;
      let Fx = (along * fx + across * lx) * k;
      let Fz = (along * fz + across * lz) * k;
      // aground there: pushed out towards deeper water, and held by the bottom
      const short = RAFT.draft - p.depth;
      if (short > 0) {
        const gx = this.depthAt(p.x + PROBE, p.z) - this.depthAt(p.x - PROBE, p.z);
        const gz = this.depthAt(p.x, p.z + PROBE) - this.depthAt(p.x, p.z - PROBE);
        const gl = Math.hypot(gx, gz);
        // (no way down to be felt: back towards its middle)
        const nx = gl > 1e-4 ? gx / gl : -rx / (Math.hypot(rx, rz) || 1);
        const nz = gl > 1e-4 ? gz / gl : -rz / (Math.hypot(rx, rz) || 1);
        const push = Math.min(PUSH_MOST, PUSH * short);
        Fx += nx * push / GRIP.length;
        Fz += nz * push / GRIP.length;
        const hold = BOTTOM * smoothstep(0, RAFT.draft - RAFT.aground, short) / GRIP.length;
        Fx -= px * hold;
        Fz -= pz * hold;
        // running into it: that part stops going that way
        const vn = px * nx + pz * nz;
        if (vn < 0) {
          Fx -= vn * nx * (1 + BOUNCE) / (dt * GRIP.length * 2);
          Fz -= vn * nz * (1 + BOUNCE) / (dt * GRIP.length * 2);
          if (-vn > BUMP * 2 && this.t - this.bumpAt > BUMP_EVERY && short > RAFT.draft * 0.6) {
            this.bumpAt = this.t;
            this.emit('bump', -vn, 'the bank');
          }
        }
        grounded += smoothstep(0, RAFT.draft - RAFT.aground, short);
      }
      ax += Fx;
      az += Fz;
      aw += (Fx * rz - Fz * rx) / INERTIA;
    }
    this.ground = grounded / GRIP.length;
    if (!this.aground && this.ground > 0.5) {
      this.aground = true;
      this.emit('ground');
    } else if (this.aground && this.ground < 0.2) {
      this.aground = false;
      this.emit('afloat');
    }

    // ── The paddles (not while it's upside down) ──
    if (!this.flipped && c) {
      const hard = c.hard ? 1 : 0;
      const sp = PADDLE.speed[0] + (PADDLE.speed[1] - PADDLE.speed[0]) * hard;
      const fwd = clamp(c.fwd || 0, -3, 3) * sp * DRAG.rate * DRAG.along * (1 - 0.6 * this.ground);
      ax += fx * fwd;
      az += fz * fwd;
      const spinRate = PADDLE.spin[0] + (PADDLE.spin[1] - PADDLE.spin[0]) * hard;
      aw += clamp(c.turn || 0, -3, 3) * spinRate * (SPIN_DAMP + 1.2 * DRAG.rate);
    }
    // white water spins it about
    aw += (this.rng() * 2 - 1) * CHURN.spin * this.foam * 6 * (this.rng() < 0.2 ? 1 : 0);
    aw -= this.spin * SPIN_DAMP;

    this.vx += ax * dt;
    this.vz += az * dt;
    this.spin += aw * dt;
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > FASTEST) {
      this.vx *= FASTEST / sp;
      this.vz *= FASTEST / sp;
    }

    // ── On its way, knocked off anything solid ──
    let nx = this.x + this.vx * dt;
    let nz = this.z + this.vz * dt;
    this.yaw = wrap(this.yaw + this.spin * dt);
    const h = this._h;
    const c2 = Math.cos(this.yaw);
    const s2 = Math.sin(this.yaw);
    for (let i = 0; i < GRIP.length; i++) {
      const [a, f, r] = GRIP[i];
      const rx = a * c2 + f * s2;
      const rz = -a * s2 + f * c2;
      if (!W.hit(nx + rx, nz + rz, r, h)) continue;
      nx += h.nx * h.depth;
      nz += h.nz * h.depth;
      const px = this.vx + this.spin * rz;
      const pz = this.vz - this.spin * rx;
      const vn = px * h.nx + pz * h.nz;
      if (vn >= 0) continue;
      // an impulse at that place: it bounces, and spins off
      const rn = rx * h.nz - rz * h.nx;
      const j = (-(1 + BOUNCE) * vn) / (1 + (rn * rn) / INERTIA);
      this.vx += j * h.nx;
      this.vz += j * h.nz;
      this.spin += (j * (h.nx * rz - h.nz * rx)) / INERTIA;
      // hit side-on, it rolls away from the rock: hard enough, right over
      const sideOn = Math.abs(h.nx * c2 - h.nz * s2);
      this.vroll += -vn * sideOn * 0.8 * Math.sign(h.nx * c2 - h.nz * s2 || 1);
      if (-vn > BUMP && this.t - this.bumpAt > BUMP_EVERY) {
        this.bumpAt = this.t;
        this.emit('bump', -vn, h.what);
      }
      if (!this.flipped && this.rng() < smoothstep(FLIP.rock[0], FLIP.rock[1], -vn * sideOn) * 0.5) this.#over(Math.sign(h.nx * c2 - h.nz * s2 || 1));
    }
    this.x = nx;
    this.z = nz;

    // ── Up and down with the surface, a beat behind it ──
    const P = this.at;
    const bow = P[0].surf;
    const stern = P[1].surf;
    const left = (P[2].surf + P[4].surf) / 2;
    const right = (P[3].surf + P[5].surf) / 2;
    const surf = (bow + stern + left + right) / 4;
    const lvl = W.water(nx, nz, w) ? w.level : this.level;
    this.fell = this.fell * Math.exp(-dt / DROP_TIME) + Math.max(0, this.level - lvl);
    this.level = lvl;
    const ay = this.y > surf + 0.03 ? -RIDE.g : RIDE.k * (surf - this.y) - RIDE.damp * this.vy;
    this.vy += ay * dt;
    this.y += this.vy * dt;
    if (this.y < surf - RIDE.under) {
      this.y = surf - RIDE.under;
      if (this.vy < 0) this.vy *= -0.3;
    }
    if (this.fell > DROP && this.t - this.dropAt > DROP_EVERY) {
      this.dropAt = this.t;
      this.emit('drop', this.fell);
    }

    // tipped to the water under it: bow down where the bow's surface is lower
    const span = Math.abs(GRIP[0][1] - GRIP[1][1]);
    const rock = CHURN.rock * this.foam;
    const pitchTo = Math.atan2(stern - bow, span) + rock * Math.sin(this.t * 2.3 + this.ph) - clamp(this.vy * 0.05, -0.15, 0.15);
    this.vpitch += (TIP.k * (pitchTo - this.pitch) - TIP.damp * this.vpitch) * dt;
    this.pitch += this.vpitch * dt;
    const rollTo = (this.flipped ? Math.sign(this.roll || 1) * Math.PI : 0) + Math.atan2(left - right, Math.abs(GRIP[2][0] * 2)) + rock * Math.sin(this.t * 1.9 + this.ph * 2);
    this.vroll += (TIP.k * (rollTo - this.roll) - TIP.damp * this.vroll) * dt;
    this.roll += this.vroll * dt;
    if (!this.flipped && Math.abs(this.roll) > FLIP.roll) this.#over(Math.sign(this.roll));

    // ── Through the waves ──
    // Each crest the bow goes through: a big one side-on may turn it over.
    if (this.waves > 0.05 && !this.flipped) {
      const ph = Math.floor(P[0].level / WAVE.drop);
      if (this.crestPh !== null && ph !== this.crestPh) {
        const size = this.waves;
        if (size > 0.3) this.emit('wave', size);
        const severity = size * this.side * this.side * (flow / 4);
        if (this.rng() < smoothstep(FLIP.wave[0], FLIP.wave[1], severity)) this.#over(this.rng() < 0.5 ? -1 : 1);
        else this.vroll += (this.rng() * 2 - 1) * size * this.side * 1.4;
      }
      this.crestPh = ph;
    } else this.crestPh = null;
  }

  // Over it goes, rolling to its left (way > 0) or right.
  #over(way) {
    this.flipped = true;
    this.vroll += way * 6;
    this.emit('flip');
  }
}
