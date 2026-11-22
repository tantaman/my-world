// The race car: how it goes, stops and turns, as a game's car does rather
// than a real one, but with what makes driving one feel right: it takes a
// while to get up to speed and longer to come down from it, the faster you
// go the less the wheel turns it, and the tyres hold only so hard, so go
// into a bend too fast and it runs wide, or with the handbrake, steps out
// and slides.
//
// It moves over whatever `world` says is under it (the track's surface, its
// kerbs, the grass), and the barrier pushes it back. Each frame:
//
//   car.step(dt, { throttle, brake, steer, handbrake }, world)
//     throttle, brake   0..1
//     steer             -1..1, + to the left
//     handbrake         true while held
//
// What world is asked (index.js makes one over the track):
//   world.under(x, z, out)  fills out.y (the height of what's under (x, z)),
//                           out.kind ('asphalt', 'dirt', 'kerb', 'grass'),
//                           and out.wall: null, or { nx, nz, depth } where the
//                           barrier is, the way back from it and how far in
//                           past it (x, z) is
//
// Emits:
//   'bump'   (speed m/s)   the barrier, hit this hard
//   'land'   (speed m/s)   down again after leaving the ground over a crest
//
// No three.js in here: the tests drive it.

import { Emitter } from '../core/events.js';

export const CAR = {
  wheelbase: 2.5, // m
  half: 0.9, // m, half its width: the barrier keeps it this far off
  length: 3.9, // m, bumper to bumper
  top: 50, // m/s flat out on asphalt (180 km/h)
  power: 12, // m/s² it pulls from a standstill, less as it gets going
  brake: 15, // m/s², hard on the brakes
  coast: 0.6, // m/s² it slows by with nothing pressed, at a standstill...
  drag: 0.00055, // ...and this much more for each (m/s)² of speed
  reverse: 7, // m/s backwards at the most
  steer: 0.6, // rad the front wheels turn, at a standstill...
  steerFast: 0.07, // ...and flat out
  steerRate: 3.2, // rad/s the wheel goes round
  yawRate: 9, // 1/s how quickly it takes up the turn the wheels ask for
  scrub: 0.35, // m/s of speed lost for each m/s it slides sideways, a second
  handbrake: { grip: 0.35, turn: 1.6 }, // the handbrake: what's left of the tyres' hold, and how much harder it turns
  gears: [0, 13, 22, 31, 40, 52], // m/s at the top of each gear
};
// How hard the tyres hold sideways on each surface (m/s²), how much it
// holds the car back (m/s² more), and how fast it will go on it at the most.
export const GROUND = {
  asphalt: { grip: 14, drag: 0, top: CAR.top },
  kerb: { grip: 12.5, drag: 0.3, top: CAR.top },
  dirt: { grip: 11, drag: 0.4, top: 44 },
  grass: { grip: 7, drag: 3.2, top: 20 },
};
const GRAVITY = 19; // m/s², as the hiker falls (config.js)
const BOUNCE = 0.3; // how much of the speed into the barrier it comes off it with
const RUB = 0.35; // ...and how much of its speed along it it loses, hit square on
const AIR = 0.05; // m the ground has to fall away from under it in a frame before it can leave it
const FEEL = 0.5; // m ahead and behind, and to each side, the ground is felt for its pitch and roll

const _u = { y: 0, kind: 'asphalt', wall: null };

export class Car extends Emitter {
  constructor(spec = CAR) {
    super();
    this.spec = spec;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.yaw = 0; // facing (sin yaw, cos yaw)
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;
    this.turn = 0; // rad/s it's turning
    this.wheel = 0; // rad the front wheels are turned (+ left)
    this.pitch = 0; // rad, nose down +
    this.roll = 0; // rad, leaning right +
    this.speed = 0; // m/s forwards (backwards, negative)
    this.slide = 0; // m/s sideways (+ to the right)
    this.kind = 'asphalt'; // what's under it
    this.airborne = false;
    this.spin = 0; // rad the wheels have gone round
    this.gear = 1;
    this.rpm = 0; // 0..1 through the gear
    this.skid = 0; // 0..1 how hard the tyres are scrubbing
    this.held = false; // kept where it is (on the grid, before the start)
  }

  // Put it at (x, z) facing yaw, on the ground there, stopped.
  place(x, z, yaw, world) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.vx = this.vz = this.vy = 0;
    this.turn = this.wheel = this.speed = this.slide = 0;
    world.under(x, z, _u);
    this.y = _u.y;
    this.kind = _u.kind;
    this.airborne = false;
    this._feel(world);
  }

  step(dt, c, world) {
    const S = this.spec;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const rx = -fz; // to its right
    const rz = fx;
    let u = this.vx * fx + this.vz * fz;
    let w = this.vx * rx + this.vz * rz;
    const G = GROUND[this.kind] || GROUND.asphalt;
    const onIt = !this.airborne;

    // the wheel, turned less the faster it goes
    const most = S.steer + (S.steerFast - S.steer) * Math.min(1, Math.abs(u) / S.top);
    const want = Math.max(-1, Math.min(1, c.steer || 0)) * most;
    this.wheel += Math.sign(want - this.wheel) * Math.min(Math.abs(want - this.wheel), S.steerRate * dt);

    // along: the engine, the brakes, the air and the ground holding it back
    const pedal = Math.max(0, Math.min(1, c.throttle || 0));
    const throttle = this.held ? 0 : pedal; // (held, it only revs)
    const brake = Math.max(0, Math.min(1, c.brake || 0));
    if (onIt) {
      if (throttle > 0 && u > -0.5) u += throttle * S.power * Math.max(0, 1 - u / G.top) * dt;
      if (brake > 0) {
        if (u > 0.3) u = Math.max(0, u - brake * S.brake * dt);
        else if (!this.held) u = Math.max(-S.reverse, u - brake * S.power * 0.5 * dt); // backing up
      }
      if (throttle > 0 && u < -0.3) u = Math.min(0, u + throttle * S.brake * dt);
      if (c.handbrake) u -= Math.sign(u) * Math.min(Math.abs(u), 4 * dt);
      const hold = (S.coast + S.drag * u * u + G.drag) * dt;
      u -= Math.sign(u) * Math.min(Math.abs(u), hold);
      if (this.held) u = 0;
    }

    // across: the tyres hold it to the way it points, as hard as they can
    const grip = G.grip * (c.handbrake ? S.handbrake.grip : 1);
    if (onIt) {
      const was = Math.abs(w);
      w -= Math.sign(w) * Math.min(was, grip * dt);
      u -= Math.sign(u) * Math.min(Math.abs(u), was * S.scrub * dt);
      this.skid = Math.min(1, Math.max(0, was - 1.2) / 6);
    } else this.skid = 0;

    // turning: as fast as the wheels ask, as far as the tyres let it
    let turn = (u * Math.tan(this.wheel)) / S.wheelbase;
    const limit = (G.grip * 1.15 * (c.handbrake ? S.handbrake.turn : 1)) / Math.max(4, Math.abs(u));
    turn = Math.max(-limit, Math.min(limit, turn));
    if (onIt) this.turn += (turn - this.turn) * (1 - Math.exp(-dt * S.yawRate));
    this.yaw += this.turn * dt;

    // (the speed stays the way it was going as the car turns under it: next
    // frame that's sideways, for the tyres to take up)
    this.vx = fx * u + rx * w;
    this.vz = fz * u + rz * w;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.speed = u;
    this.slide = w;

    // the barrier
    world.under(this.x, this.z, _u);
    if (_u.wall) {
      const { nx, nz, depth } = _u.wall;
      this.x += nx * depth;
      this.z += nz * depth;
      const into = this.vx * nx + this.vz * nz;
      if (into < 0) {
        const tx = -nz;
        const tz = nx;
        const along = this.vx * tx + this.vz * tz;
        const square = Math.min(1, -into / Math.max(1, Math.hypot(this.vx, this.vz)));
        const keep = 1 - RUB * square;
        this.vx = tx * along * keep - nx * into * BOUNCE;
        this.vz = tz * along * keep - nz * into * BOUNCE;
        // turned to run along it, a little
        const head = Math.atan2(this.vx, this.vz);
        if (Math.hypot(this.vx, this.vz) > 1 && Math.cos(head - this.yaw) > 0) this.yaw += Math.atan2(Math.sin(head - this.yaw), Math.cos(head - this.yaw)) * 0.3;
        this.turn *= 0.5;
        if (-into > 1) this.emit('bump', -into);
      }
      world.under(this.x, this.z, _u);
    }

    // up and down: on the ground, over a crest into the air, and down again
    const ground = _u.y;
    this.kind = _u.kind;
    if (this.airborne) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= ground) {
        const hit = -this.vy;
        this.y = ground;
        this.vy = 0;
        this.airborne = false;
        if (hit > 2) this.emit('land', hit);
      }
    } else {
      const rise = (ground - this.y) / Math.max(dt, 1e-4);
      // the ground falling away faster than it would fall: off it
      if (rise < this.vy - GRAVITY * dt && this.y - ground > AIR && Math.abs(u) > 12) {
        this.airborne = true;
        this.vy -= GRAVITY * dt;
        this.y += this.vy * dt;
      } else {
        this.vy = Math.max(-GRAVITY, Math.min(GRAVITY, rise));
        this.y = ground;
      }
    }
    this._feel(world);

    // the wheels, the gears and the engine
    this.spin += (u / 0.33) * dt;
    const g = S.gears;
    const v = Math.abs(u);
    let k = 1;
    while (k < g.length - 1 && v > g[k]) k++;
    this.gear = k;
    const lo = k > 1 ? g[k - 1] * 0.55 : 0;
    this.rpm = Math.max(0, Math.min(1, (v - lo) / (g[k] - lo)));
    if (this.held || v < 0.5) this.rpm = Math.max(this.rpm, pedal * 0.85);
  }

  // How it sits on the ground under it: its nose up or down, and leaning.
  _feel(world) {
    const fx = Math.sin(this.yaw) * FEEL;
    const fz = Math.cos(this.yaw) * FEEL;
    world.under(this.x + fx, this.z + fz, _u);
    const front = _u.y;
    world.under(this.x - fx, this.z - fz, _u);
    const back = _u.y;
    world.under(this.x - fz, this.z + fx, _u);
    const right = _u.y;
    world.under(this.x + fz, this.z - fx, _u);
    const left = _u.y;
    const k = this.airborne ? 0.04 : 0.35;
    this.pitch += (Math.atan2(back - front, 2 * FEEL) - this.pitch) * k;
    this.roll += (Math.atan2(left - right, 2 * FEEL) - this.roll) * k;
  }

  get kmh() {
    return Math.abs(this.speed) * 3.6;
  }
}
