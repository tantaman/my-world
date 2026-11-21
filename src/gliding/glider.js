// A hang glider in flight: how it flies, from what you do with the bar.
//
// You fly it the way a real one is flown, by shifting your weight. Push to
// one side and it banks, and banked it turns, more tightly the slower it
// goes. Pull the bar in and it noses down and speeds up; push it out and it
// slows, nearly to a stall. Whatever you do it sinks: least at about its
// best speed (POLAR), more going fast or slow, and more in a steep bank.
// Speed is height: diving trades height for it, and slowing down from fast
// gives a little back. There's no rising air here, so it never climbs for
// long: from wherever you let go, it's a long glide down.
//
// It has to open first. Let go in the air and you drop while the sail fills;
// then it takes your weight and you're flying (open, 0..1).
//
// Near the ground you swing upright to land (upright, 0..1), and you land on
// your feet as long as you come in slowly enough, not straight down and not
// flat out. Fly into a tree or a wall low down and that's the end of the
// flight as well.
//
// What it asks of the world:
//   ground(x, z, y)    the ground (or the top of something built) under
//                      feet at about y, not counting water
//   surface(x, z)      the top of the water there, or -Infinity
//   hit(x, y, z, r)    -> { nx, nz, depth, what } for a tree, a boulder or a
//                      wall a body r wide at (x, y, z) has flown into, or null
//
// Emits:
//   'open'  ()                        the sail has filled and taken your weight
//   'down'  ({ how, speed, sink })    the flight is over: how is 'feet' (a
//                                     landing), 'hard' (too fast), 'water', or
//                                     what you flew into ('a tree'), with
//                                     nx, nz the way out from it
//
// Speeds are m/s, distances m, times s, angles radians.

import { Emitter } from '../core/events.js';
import { clamp, lerp, smoothstep } from '../noise.js';

// Airspeed: pushed right out, trimmed (hands off), pulled in, and pulled
// right in (shift).
export const SPEED = { slow: 8.5, trim: 11, fast: 17, full: 22 };
// How fast it sinks (m/s) at each airspeed, flying straight: its polar.
// Least at about 10 m/s; best glide (about 10 to 1) a little faster.
export const POLAR = [
  [6, 3.2],
  [7.5, 1.9],
  [8.5, 1.3],
  [10, 1.0],
  [12, 1.15],
  [15, 1.7],
  [18, 2.6],
  [22, 4.0],
  [30, 7.5],
];
// The sail takes this long to fill.
export const OPEN_TIME = 0.8;
// Falling while it fills: a real g (walking's is stronger, for snappy jumps).
const G = 9.81;
// Banked as far as weight shift will go, and how quickly it rolls into it (1/s).
export const MAX_BANK = 0.75;
const ROLL = 2.4;
// How quickly it comes to the speed the bar asks for (1/s), and to the sink
// that goes with it.
const SPEED_EASE = 0.9;
const SINK_EASE = 2.5;
// Of the height a dive traded for speed, how much slowing down gives back,
// and how quickly (1/s) the trade is felt.
const ZOOM = 0.6;
const ENERGY_EASE = 3;
// Upright to land from this high (m) down to this.
const UPRIGHT = [5, 1.5];
// Touching down: harder than this (m/s down, or along) and you're off your feet.
export const HARD = { sink: 4, speed: 16 };
// How wide you are to trees and walls (m): you, not the wingtips.
const BODY = 0.45;
// Water deeper than this (m) is coming down in the water.
const WET = 0.35;

// How fast it sinks at airspeed v, flying straight (m/s, positive down).
export function sinkAt(v) {
  if (v <= POLAR[0][0]) return POLAR[0][1];
  for (let i = 1; i < POLAR.length; i++) {
    const [v1, s1] = POLAR[i];
    if (v <= v1) {
      const [v0, s0] = POLAR[i - 1];
      return lerp(s0, s1, (v - v0) / (v1 - v0));
    }
  }
  return POLAR.at(-1)[1];
}

export class Glider extends Emitter {
  constructor(world) {
    super();
    this.world = world;
    this.x = 0;
    this.y = 0; // where your feet would be, standing (m)
    this.z = 0;
    this.heading = 0; // which way it's flying: (sin, cos)
    this.speed = 0; // along (m/s)
    this.vy = 0; // up (m/s)
    this.bank = 0; // rolled to the right
    this.pitch = 0; // nose down
    this.open = 0;
    this.upright = 1;
    this.height = Infinity; // over the ground or the water (m)
    this.flying = false;
    this.down = null; // how it came down, once it has
    this._fall = 0; // m/s down, while it fills
    this._sink = 0; // the steady sink, eased (m/s, negative down)
    this._energy = 0; // up (m/s) from speed traded for height, eased
  }

  // Let go in the air at (x, y, z) moving (vx, vy, vz), facing yaw.
  launch(x, y, z, vx = 0, vy = 0, vz = 0, yaw = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
    const h = Math.hypot(vx, vz);
    this.heading = h > 1 ? Math.atan2(vx, vz) : yaw;
    this.speed = h;
    this.vy = vy;
    this._fall = vy;
    this._sink = Math.min(0, vy);
    this._energy = 0;
    this.bank = 0;
    this.pitch = 0;
    this.open = 0;
    this.upright = 1;
    this.flying = false;
    this.down = null;
    this.height = Infinity;
  }

  // c: { steer -1..1 (right), bar -1..1 (+1 pulled in), full (pulled right in) }
  step(dt, c) {
    if (this.down) return;
    const was = this.open;
    this.open = Math.min(1, this.open + dt / OPEN_TIME);
    // the sail carries you once it's mostly full
    const lift = smoothstep(0.35, 1, this.open);
    if (was < 1 && this.open >= 1) {
      this.flying = true;
      this.emit('open');
    }

    // the speed the bar asks for, and getting there: a dive trades height
    // for speed, and slowing down gives some of it back
    // (coming in to land, hands off, you push it out to come in slowly)
    const bar = c.full ? 1 : clamp(c.bar, -1, 1);
    let want = bar >= 0 ? lerp(SPEED.trim, c.full ? SPEED.full : SPEED.fast, bar) : lerp(SPEED.trim, SPEED.slow, -bar);
    if (bar <= 0) want = lerp(want, SPEED.slow, this.upright * lift);
    const v0 = this.speed;
    this.speed = lerp(v0, want, 1 - Math.exp(-dt * SPEED_EASE * lift));
    const dv = this.speed - v0;
    const energy = dt > 0 ? (-(v0 * dv) / (G * dt)) * (dv < 0 ? ZOOM : 1) : 0;
    this._energy = lerp(this._energy, energy, 1 - Math.exp(-dt * ENERGY_EASE));

    // weight shift: bank, and banked, turn
    this.bank = lerp(this.bank, clamp(c.steer, -1, 1) * MAX_BANK * lift, 1 - Math.exp(-dt * ROLL));
    const turn = (G * Math.tan(this.bank)) / Math.max(this.speed, 4);
    this.heading -= turn * dt;

    // up and down: falling until the sail fills, then the sink for that
    // speed (more in a bank), eased
    this._fall -= G * dt;
    const steady = -sinkAt(this.speed) / Math.pow(Math.cos(this.bank), 1.5);
    this._sink = lerp(this._sink, steady, 1 - Math.exp(-dt * SINK_EASE));
    this.vy = lerp(this._fall, this._sink + this._energy, lift);

    // nose down along the way it's going, more pulled in; up while it fills
    const path = Math.atan2(-this.vy, Math.max(this.speed, 1));
    const nose = clamp(path * 0.5 + bar * 0.12, -0.35, 0.5) - (1 - lift) * 0.35;
    this.pitch = lerp(this.pitch, nose, 1 - Math.exp(-dt * 3));

    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.y += this.vy * dt;

    // into a tree or a wall
    const hit = this.world.hit(this.x, this.y, this.z, BODY);
    if (hit) return this.#end(hit.what, hit);

    // the ground (or the water) coming up
    const g = this.world.ground(this.x, this.z, this.y + 0.3);
    const w = this.world.surface(this.x, this.z);
    const floor = Math.max(g, w);
    this.height = this.y - floor;
    this.upright = Math.max(1 - lift, 1 - smoothstep(UPRIGHT[1], UPRIGHT[0], this.height));
    if (this.y > floor) return;
    this.y = floor;
    if (w > g + WET) return this.#end('water');
    this.#end(-this.vy > HARD.sink || this.speed > HARD.speed ? 'hard' : 'feet');
  }

  #end(how, hit = null) {
    this.down = { how, speed: this.speed, sink: -this.vy, nx: hit ? hit.nx : 0, nz: hit ? hit.nz : 0, depth: hit ? hit.depth : 0 };
    this.flying = false;
    this.emit('down', this.down);
  }
}
