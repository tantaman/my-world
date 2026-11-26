// One skater on a skateboard: the physics of it, and nothing else. It is
// handed what's under the wheels and what stands about, and the controls each
// frame, and keeps where you are, which way the board goes, what you did in
// the air and whether you're still on it. index.js puts the hiker there.
//
// The wheels roll along the board's line and nowhere else: whatever the
// trucks turn it to, you go. Down a hill gravity takes you along; the wheels
// and the air hold you back, the air less crouched. A push (one foot down on
// the ground, kicked back) gets you going on the flat, up to about a running
// speed and no faster. The trucks turn you as tightly as the wheels' grip
// allows at the speed you're going, and kick you round on the tail at a
// standstill. Braking drags a foot along the ground, slowly; at speed it
// slides the board out sideways (a powerslide) and scrubs it off fast. Roll
// backwards and you're riding fakie, the other way round on the board, until
// a push turns you round.
//
// A push can come from the jets on your back instead (`jets`, the jetpack):
// they don't care how fast the wheels are already turning, so they take you
// on past anything a foot or a hill can do, until the air holds you — much
// further crouched — and they burn on in the air, carrying you a little
// further over a gap. Carve with them lit and they swing out across your
// back, away from the turn, and push you round it as well as along: you can
// carve far harder than the wheels' grip alone allows, or you'd never make
// a bend at their speed.
//
// What's under the wheels matters. Tarmac rolls best; stone and boards a
// little worse; gravel badly, and at speed a stone in it stops a wheel and
// throws you. Off the hard stuff, onto the grass or the dirt or into the
// water, the wheels dig in: slowly enough, you step off and run it out;
// faster, you're thrown. A step up onto something higher than the wheels can
// roll over stops them too: ollie up onto it. Roll off the edge of something
// and you drop off it, and come down again.
//
// An ollie pops you off the ground. In the air, with a key pressed since you
// left it (so a push or a carve going into it doesn't count), the board can
// flip over about its length (a kickflip, a heelflip: once for a tap, on and
// on while it's held), turn under you (a shove-it, half a turn at a time),
// or you can turn round with it (a 180, a 360). Let go and the board finishes
// the flip or the turn it's in, if there's time. Come down with it wheels
// down, along you, along the way you're going (either way round: backwards,
// you roll away fakie) and not too hard, and you ride away; otherwise you
// bail. So do you running into a tree or a wall at more than a jog.
// Bailed, you tumble and slide to a stop on the tarmac, the board shoots off
// on its own, and you get up a moment later with it back under your feet.
//
// The ground (index.js gives it):
//   at(x, z, reach, out)   fills out.y (the top of what's under the wheels
//                          there: the highest solid thing no higher than
//                          `reach`, or else the land), out.surface ('tarmac',
//                          'boards', 'gravel'... or 'ground', the land itself),
//                          out.what (to say so: 'the grass'), out.water (how
//                          deep the water is over it, m) -> out
//   hit(x, y, z, r, out)   is anything solid within r of (x, z), standing
//                          higher than the wheels roll up onto (they're at
//                          y)? If so, fill out: nx, nz (the way out of it),
//                          depth (m), what ('a tree') -> true
//
// The controls (step):
//   push    held: kick along        brake   0..1: a foot down, or slide it out
//   steer   -1..1, + is right       crouch  held: down low, out of the wind
//   pop     an ollie (pressed this frame)
//   flip    -1..1 in the air: + a kickflip, - a heelflip
//   shove   held, in the air: the board turns under you
//   jets    0..1: the jets on your back, pushing you along
//
// Emits:
//   'push'     ()                   a foot down on the ground, kicking
//   'takeoff'  (popped)             off the ground for long enough to be an air
//   'land'     ({ air, impact, name, points, fakie })   on the board
//   'touch'    (impact)             back down after a hop
//   'bump'     (strength 0..1)      the knees taking a bump
//   'brush'    (what, speed)        glanced off something
//   'crash'    (why, speed)         bailed
//   'clatter'  (strength 0..1)      the loose board coming down
//   'up'       ()                   back on your feet, on the board
//   'off'      (what)               rolled off onto ground the wheels won't take,
//                                   slowly enough to step off

import { Emitter } from '../core/events.js';
import { wrapAngle as wrap } from '../core/geom.js';
import { counts, bail, nameOf, score } from './tricks.js';

// m/s²: the hiker's own.
export const GRAVITY = 9.8;
// What the wheels roll on, and how: roll, m/s² of rolling resistance; set,
// whether you can set off on it; pebbles, how often a stone in it stops a
// wheel (per second, per m/s over PEBBLE_FROM). Anything else (the land,
// grass, dirt, snow, sand, carpet) stops them dead.
export const SURFACES = {
  tarmac: { roll: 0.2, set: true },
  asphalt: { roll: 0.2, set: true },
  marble: { roll: 0.14, set: true },
  stone: { roll: 0.4, set: true },
  boards: { roll: 0.5, set: true },
  gravel: { roll: 1.8, pebbles: 0.12 },
  built: { roll: 0.5 }, // something built that doesn't say what it's made of: a floor, a footing
};
export const rolls = (surface) => Object.hasOwn(SURFACES, surface);
export const setsOff = (surface) => rolls(surface) && !!SURFACES[surface].set;
const PEBBLE_FROM = 3; // m/s

// m from the ground to the top of the deck, where your soles are.
export const DECK = 0.09;
const STEP = 1 / 120; // s: the most one step of the sum takes
const STEP_FAR = 0.2; // m: ...and the furthest it may take you, so that at jet speeds a trunk still comes between two of them
export const REACH = 0.1; // m: the wheels roll up onto something no higher than this over them (with a bump)
const SPAN = 0.35; // m either way along the board to find how the ground slopes
const GRADE_MOST = 0.45; // rise over run: no steeper than this is felt (an edge between samples)
// 1/m: the air's drag, standing, crouched, and flying.
const DRAG = { up: 0.006, crouch: 0.0035, air: 0.004 };
// Pushing: no faster than `top` (m/s) by pushing, `acc` (m/s²) while the
// foot is kicking, one push every `period` (s), the foot on the ground from
// `kick[0]` to `kick[1]` of the way through it.
export const PUSH = { top: 7, acc: 6, period: 0.75, kick: [0.25, 0.65] };
// The jets on your back (the jetpack), pushing you along the board: m/s² at
// full thrust. Nothing but the air holds them back, so on the flat that's
// about 95 km/h standing up and 125 crouched, and more down a hill.
export const JETS = 4.5;
// ...and how much harder (m/s², on top of the wheels' TURN.carve) they let
// you carve at full thrust, swung out to push you round the turn: at 95
// km/h, round a bend of about 40 m where the wheels alone would need 115.
export const JETS_CARVE = 12;
// Braking: a foot dragged (m/s²); at `from` m/s or faster, a powerslide.
export const BRAKE = { drag: 2.2, slide: 5.5, from: 3.5 };
// Turning: rad/s at a standstill (a kick turn), m/s² round a carve (more
// crouched), and how quickly (1/s) the trucks come round to it.
const TURN = { still: 2.4, carve: 6, crouch: 1.25, ease: 10 };
const SWITCH = 0.5; // m/s backwards, and you're riding fakie
export const POP = 3.4; // m/s: an ollie, straight up
// In the air: how quickly (rad/s) you spin, the board flips and turns under
// you; how quickly a spin gets going and dies away (1/s); and, with nothing
// pressed, how quickly you settle square to land (1/s) within this much
// (radians) of it.
const SPIN = 9;
const FLIP = 17;
const SHOVE = 12;
const SPIN_EASE = [14, 9];
const SETTLE = [5, 1.1];
// Up this far (m) or this long (s), and you're in the air, not over a bump.
const FLY = { gap: 0.12, time: 0.15 };
// The ground falling away faster than this (m/s) than you were going down
// with it, and you leave it: an edge, a kerb, the end of a ramp.
const LAUNCH = 2.5;
const BUMP = 1.5; // m/s: the ground coming up at you faster than this, the knees feel it
const RADIUS = 0.3; // m: you, to trunks and walls
// Into something faster than this (m/s, square on) and you bail; slower,
// you glance off.
const CRASH_HIT = 3;
// Onto the grass slower than this (m/s) and you step off and run it out.
const RUN_OUT = 2.6;
const WET = 0.06; // m of water, and the wheels are in it
// Bailed: the ground holds a body this hard (m/s², and per m/s more), it
// rolls this many radians per metre, and you get up this long after, once
// you've stopped (or this long after anyway).
const TUMBLE = { friction: 7, more: 0.4, roll: 1.8, up: 1.4, most: 4.5 };
// The board on its own: how hard it stops off the hard stuff, or wheels up
// (m/s²), how much of your speed it shoots off with, and how much of its
// fall it bounces back.
const LOOSE = { stop: 7, shoot: 0.9, bounce: 0.3 };

const _g = { y: 0, surface: 'ground', what: '', water: 0 };
const _a = { y: 0, surface: 'ground', what: '', water: 0 };
const _hit = { nx: 0, nz: 0, depth: 0, what: '' };
const sign = (v) => (v < 0 ? -1 : 1);

export class Skater extends Emitter {
  // rnd: () => 0..1, for the stones in the gravel and how the board tumbles
  constructor(ground, { rnd = Math.random } = {}) {
    super();
    this.ground = ground;
    this.rnd = rnd;
    this.x = this.y = this.z = 0;
    this.v = 0; // m/s along the board's line, the way it's going (yaw)
    this.vx = this.vy = this.vz = 0;
    this.yaw = 0; // which way the board is going (+z at 0, like the hiker)
    this.yawRate = 0;
    this.face = 0; // how far you face round from that: π riding fakie
    this.grounded = true;
    this.flying = false; // in the air, for long enough to be an air
    this.air = blankAir();
    this.spinRate = 0;
    this.flip = 0; // how far the board has rolled over in this air (radians)
    this.shove = 0; // how far it has turned under you in this air (radians)
    this._flipWay = 0; // which way it is flipping, or turning under you, to finish
    this._shoveWay = 0;
    this._held = { steer: 0, flip: 0, shove: 0 }; // keys still down from before the air
    this._last = { steer: 0, flip: 0, shove: 0 };
    this.pushT = -1; // s into a push, or -1 with both feet on the board
    this.slide = 0; // 0..1 how far into a powerslide
    this.dragging = false; // a foot dragged to brake
    this.crouch = 0; // 0..1
    this.jets = 0; // 0..1 how hard the jets on your back are pushing you along
    this.lateral = 0; // m/s² round the turn you're carving (+ to the left)
    this.round = 0; // -1..1 how hard the jets are pushing you round it, of the most they can (+ to the left)
    this.grade = 0; // rise over run along the way you're going
    this.compress = 0; // 0..1 the knees taking a bump or a landing
    this.surface = 'tarmac'; // what's under the wheels
    this.what = '';
    this.down = -1; // s since you bailed; -1 on the board
    this.roll = 0; // how far you've tumbled (radians)
    this.why = '';
    this.loose = null; // the board on its own while you're down: { x, y, z, vy, yaw, v, flip, flipRate, yawRate }
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  // Which way you're going over the ground (radians, like yaw).
  get heading() {
    return Math.hypot(this.vx, this.vz) > 0.3 ? Math.atan2(this.vx, this.vz) : this.yaw;
  }

  get fakie() {
    return Math.abs(wrap(this.face)) > Math.PI / 2;
  }

  get pushing() {
    return this.pushT >= 0;
  }

  // How far through a push (0..1), or -1.
  get pushPhase() {
    return this.pushT >= 0 ? this.pushT / PUSH.period : -1;
  }

  // Step onto the board at (x, z), pointing yaw, rolling at v m/s, your feet
  // at y (the top of whatever's under them there, no higher).
  start(x, z, yaw, v = 0, y = Infinity) {
    const g = this.ground.at(x, z, y + REACH, _g);
    this.x = x;
    this.z = z;
    this.y = g.y;
    this.yaw = yaw;
    this.v = v;
    this.vx = Math.sin(yaw) * v;
    this.vz = Math.cos(yaw) * v;
    this.vy = 0;
    this.yawRate = this.spinRate = 0;
    this.face = 0;
    this.grounded = true;
    this.flying = false;
    this.air = blankAir();
    this.flip = this.shove = 0;
    this._flipWay = this._shoveWay = 0;
    this.pushT = -1;
    this.slide = 0;
    this.dragging = false;
    this.jets = 0;
    this.lateral = this.round = 0;
    this.down = -1;
    this.roll = 0;
    this.compress = 0;
    this.loose = null;
    this.surface = g.surface;
    this.what = g.what;
  }

  step(dt, c) {
    // what was held as you left the ground doesn't count in the air
    this._last.steer = c.steer || 0;
    this._last.flip = c.flip || 0;
    this._last.shove = c.shove ? 1 : 0;
    const n = Math.max(1, Math.ceil(dt / STEP), Math.ceil((this.speed * dt) / STEP_FAR));
    const h = dt / n;
    let pop = !!c.pop;
    for (let i = 0; i < n; i++) {
      if (this.down >= 0) this._tumble(h);
      else if (this.grounded) {
        this._roll(h, c, pop);
        pop = false;
      } else this._fly(h, c);
      this.compress *= Math.exp(-h * 5);
      if (this.loose) this._loose(h);
    }
    if (!this.grounded || this.down >= 0) this.lateral = this.round = 0;
  }

  // ── On the ground ─────────────────────────────────────────────────────────
  _roll(h, c, pop) {
    const steer = c.steer || 0;
    const brake = c.brake || 0;
    // the jets on your back, once they've caught: the foot goes back on the
    // board, there being nothing left for it to add
    this.jets = c.jets || 0;
    const pushing = !!c.push && brake === 0 && !this.jets;
    this.crouch += ((c.crouch && !this.pushing ? 1 : 0) - this.crouch) * (1 - Math.exp(-h * 10));
    let v = this.v;

    // round the turn: carved at speed, as hard as the wheels' grip allows
    // (and the jets, lit, swung out to push you round), and kicked round on
    // the tail at a standstill
    const grip = TURN.carve * (1 + (TURN.crouch - 1) * this.crouch);
    const rate = Math.min(TURN.still, (grip + JETS_CARVE * this.jets) / Math.max(Math.abs(v), 0.5));
    this.yawRate += (-steer * rate - this.yawRate) * (1 - Math.exp(-h * TURN.ease));
    this.yaw = wrap(this.yaw + this.yawRate * h);
    const dx = Math.sin(this.yaw);
    const dz = Math.cos(this.yaw);

    // down the hill: how the ground slopes along the board, from just ahead
    // and just behind, leaving out a step or an edge there (that's not a slope)
    const steep = SPAN * GRADE_MOST;
    const fore = this.ground.at(this.x + dx * SPAN, this.z + dz * SPAN, this.y + REACH, _a).y - this.y;
    const aft = this.y - this.ground.at(this.x - dx * SPAN, this.z - dz * SPAN, this.y + REACH, _a).y;
    const f = Math.abs(fore) <= steep;
    const b = Math.abs(aft) <= steep;
    const grade = f && b ? (fore + aft) / (2 * SPAN) : f ? fore / SPAN : b ? aft / SPAN : 0;
    this.grade = grade;
    v -= (GRAVITY * grade * h) / Math.sqrt(1 + grade * grade);

    // the wheels, the air, and the brakes: a foot dragged, or the board slid out
    const surf = SURFACES[this.surface] || SURFACES.tarmac;
    const sliding = brake > 0 && (Math.abs(v) > BRAKE.from || (this.slide > 0.5 && Math.abs(v) > 1));
    this.slide += ((sliding ? brake : 0) - this.slide) * (1 - Math.exp(-h * 8));
    this.dragging = brake > 0 && !sliding && Math.abs(v) > 0.2;
    const drag = DRAG.up + (DRAG.crouch - DRAG.up) * this.crouch;
    const slow = surf.roll + drag * v * v + brake * (sliding ? BRAKE.slide : BRAKE.drag);
    v = sign(v) * Math.max(0, Math.abs(v) - slow * h);

    // the jets, which go on pushing whatever the wheels are doing. They're on
    // your back, so as a kick of the foot does, they turn you round to face
    // the way you're going first.
    if (this.jets > 0) {
      if (this.fakie) this.face = 0;
      v += JETS * this.jets * h;
    }

    // a push: a foot down, kicked back, and back up onto the board. Riding
    // fakie, a push turns you round first.
    if (pushing && v < PUSH.top) {
      if (this.fakie) this.face = 0;
      const t0 = this.pushT < 0 ? -1 : this.pushT / PUSH.period;
      this.pushT = this.pushT < 0 ? 0 : this.pushT + h;
      if (this.pushT >= PUSH.period) this.pushT -= PUSH.period;
      const t = this.pushT / PUSH.period;
      // the foot comes down on the ground
      if (t >= PUSH.kick[0] && t0 < PUSH.kick[0] && t0 <= t) this.emit('push');
      if (t >= PUSH.kick[0] && t < PUSH.kick[1]) v += PUSH.acc * (1 - Math.max(0, v) / PUSH.top) * h;
    } else if (this.pushT >= 0) {
      // the foot comes back up onto the board
      this.pushT += h;
      if (this.pushT >= PUSH.period) this.pushT = -1;
    }

    // rolling backwards: that's riding fakie
    if (v < -SWITCH) {
      this.yaw = wrap(this.yaw + Math.PI);
      this.face = wrap(this.face + Math.PI);
      this.yawRate = 0;
      v = -v;
    }
    this.v = v;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    this.vx = v * fx;
    this.vz = v * fz;
    this.lateral = this.yawRate * Math.abs(v);
    // what the wheels can't hold of that, the jets push you round
    const over = this.jets > 0 ? (Math.abs(this.lateral) - grip) / JETS_CARVE : 0;
    this.round = over > 0 ? sign(this.lateral) * Math.min(1, over) : 0;

    if (pop) {
      this.vy += POP;
      this._leave(true);
      return;
    }

    const wasX = this.x;
    const wasZ = this.z;
    this.x += this.vx * h;
    this.z += this.vz * h;
    if (this._collide(false)) return;

    const g = this.ground.at(this.x, this.z, this.y + REACH, _g);
    // rising ground the wheels can't roll up onto: a bank, a step
    if (g.y > this.y + REACH) {
      this.x = wasX;
      this.z = wasZ;
      if (Math.abs(this.v) > CRASH_HIT) return this._fall(`into ${g.what || 'the bank'}`);
      this.v = this.vx = this.vz = 0;
      return;
    }
    const vy = (g.y - this.y) / h;
    // the ground falling away faster than you were going down with it: off the edge
    if (vy < this.vy - LAUNCH) return this._leave(false);
    // the ground coming up at you: a bump, over a seam or up a kerb, or the
    // foot of a slope (going up which, you soon rise as fast as it does)
    if (vy - this.vy > BUMP) {
      const s = Math.min(1, (vy - this.vy) / 6);
      if (Math.abs(this.v) > 1) {
        this.compress = Math.max(this.compress, s);
        this.emit('bump', s);
      }
      this.vy += BUMP;
    } else this.vy = vy;
    this.y = g.y;
    this._onto(g);
    if (this.down >= 0 || !this.grounded) return;

    // a stone in the gravel
    const s = SURFACES[this.surface];
    if (s && s.pebbles && Math.abs(this.v) > PEBBLE_FROM && this.rnd() < s.pebbles * (Math.abs(this.v) - PEBBLE_FROM) * h) this._fall('a stone stopped the wheels');
  }

  // Onto what's under the wheels now: rolling on, or not.
  _onto(g) {
    this.surface = g.surface;
    this.what = g.what;
    if (rolls(g.surface) && !(g.water > WET)) return;
    const where = g.water > WET ? 'the water' : g.what || 'the ground';
    if (this.speed > RUN_OUT) return this._fall(`into ${where}`);
    this.v = this.vx = this.vz = 0;
    this.pushT = -1;
    this.emit('off', where);
  }

  _leave(popped) {
    this.grounded = false;
    this.flying = false;
    this.air = blankAir();
    this.air.popped = popped;
    this.air.fakie = this.fakie;
    for (const k of ['steer', 'flip', 'shove']) this._held[k] = Math.sign(this._last[k]);
    this.spinRate = 0;
    this.flip = this.shove = 0;
    this._flipWay = this._shoveWay = 0;
    this.pushT = -1;
    this.slide = 0;
    this.dragging = false;
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
    const air = this.air;
    const steer = this._fresh('steer', c.steer);
    const flip = this._fresh('flip', c.flip);
    const shove = this._fresh('shove', c.shove ? 1 : 0);

    // you and the board, turning together
    this.spinRate += (-steer * SPIN - this.spinRate) * (1 - Math.exp(-h * SPIN_EASE[steer ? 0 : 1]));
    let spun = this.spinRate * h;
    // let go, and you settle square to land, one way round or the other
    if (!steer && Math.abs(this.spinRate) < 1) {
      const off = wrap(this.yaw - this.heading);
      const square = Math.abs(off) > Math.PI / 2 ? wrap(off - Math.PI) : off;
      if (Math.abs(square) < SETTLE[1]) spun -= square * (1 - Math.exp(-h * SETTLE[0]));
    }
    this.yaw = wrap(this.yaw + spun);
    air.spin += spun;

    // the board flipping over, and turning under you: on while it's held,
    // and let go, round to the end of the one it's in
    if (flip) this._flipWay = Math.sign(flip);
    this.flip = turnOn(this.flip, this._flipWay, !!flip, FLIP * h, Math.PI * 2);
    if (!flip && this.flip === Math.round(this.flip / (Math.PI * 2)) * Math.PI * 2) this._flipWay = 0;
    if (shove) this._shoveWay = this._shoveWay || (steer ? -Math.sign(steer) : -1);
    this.shove = turnOn(this.shove, this._shoveWay, !!shove, SHOVE * h, Math.PI);
    if (!shove && this.shove === Math.round(this.shove / Math.PI) * Math.PI) this._shoveWay = 0;
    air.flip = this.flip;
    air.shove = this.shove;

    this.vy -= GRAVITY * h;
    const k = 1 - DRAG.air * this.speed * h;
    this.vx *= k;
    this.vz *= k;
    // the jets burn on in the air, pushing you the way you're going, which
    // carries you a little further over a gap than the speed alone would
    this.jets = c.jets || 0;
    if (this.jets > 0) {
      const a = JETS * this.jets * h;
      this.vx += Math.sin(this.heading) * a;
      this.vz += Math.cos(this.heading) * a;
    }
    this.x += this.vx * h;
    this.y += this.vy * h;
    this.z += this.vz * h;
    if (this._collide(false)) return;

    const g = this.ground.at(this.x, this.z, this.y + REACH, _g);
    air.time += h;
    air.height = Math.max(air.height, this.y - g.y);
    if (!this.flying && (air.height > FLY.gap || air.time > FLY.time)) {
      this.flying = true;
      this.emit('takeoff', false);
    }
    if (this.y <= g.y) this._land(g);
  }

  _land(g) {
    this.y = g.y;
    const impact = Math.max(0, -this.vy);
    this.vy = 0;
    this.grounded = true;
    const was = this.flying;
    this.flying = false;
    this.spinRate = 0;
    const air = this.air;
    const did = counts(air) || Math.abs(air.spin) > 0.5 || this.flip !== 0 || this.shove !== 0;
    const off = wrap(this.yaw - this.heading);
    const back = Math.abs(off) > Math.PI / 2;
    const why = did ? bail({ skew: back ? wrap(off - Math.PI) : off, roll: this.flip, shove: this.shove, impact }) : null;
    if (why) return this._fall(why);
    // on the board: along the way you're going, and if that's backwards, fakie
    if (back) {
      this.yaw = wrap(this.yaw + Math.PI);
      this.face = wrap(this.face + Math.PI);
    }
    const along = this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw);
    this.v = Math.max(0, along) * (1 - Math.min(0.3, impact * 0.03));
    this.vx = this.v * Math.sin(this.yaw);
    this.vz = this.v * Math.cos(this.yaw);
    this.flip = this.shove = 0;
    this._flipWay = this._shoveWay = 0;
    this.compress = Math.min(1, 0.25 + impact / 8);
    if (did) {
      const fakie = this.fakie;
      this.emit('land', { air: { ...air }, impact, name: nameOf(air), points: score(air, { fakie }), fakie });
    } else if (was) this.emit('touch', Math.min(1, impact / 6));
    else this.emit('touch', Math.min(1, impact / 6) * 0.5);
    this._onto(g);
  }

  // ── Into things ───────────────────────────────────────────────────────────
  // Push out of anything solid. -> true if that was a bail.
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
    // on the ground the wheels only go along the board: it turns to glance along
    if (this.grounded && !tumbling) {
      const s = Math.hypot(this.vx, this.vz);
      if (s > 0.3) {
        const dir = Math.atan2(this.vx, this.vz);
        const ahead = Math.abs(wrap(dir - this.yaw)) <= Math.PI / 2;
        this.yaw = ahead ? dir : wrap(dir + Math.PI);
        this.v = ahead ? s : -s;
      } else this.v = 0;
      this.vx = this.v * Math.sin(this.yaw);
      this.vz = this.v * Math.cos(this.yaw);
    }
    if (!tumbling && -vn > 1.2) this.emit('brush', _hit.what, -vn);
    return false;
  }

  // ── Bailing, and getting up ───────────────────────────────────────────────
  _fall(why) {
    const speed = this.speed;
    this.down = 0;
    this.why = why;
    this.roll = 0;
    this.flying = false;
    this.pushT = -1;
    this.slide = 0;
    this.dragging = false;
    this.spinRate = 0;
    // the board shoots off on its own, tumbling the harder you went
    const spin = Math.min(9, speed * 1.4);
    this.loose = {
      x: this.x,
      y: this.y,
      z: this.z,
      vy: this.grounded ? Math.min(2.5, speed * 0.25) : this.vy,
      yaw: this.heading,
      v: speed * LOOSE.shoot,
      flip: this.flip,
      flipRate: spin * (this.rnd() < 0.5 ? -1 : 1),
      yawRate: spin * 0.4 * (this.rnd() - 0.5),
    };
    this.flip = this.shove = 0;
    this._flipWay = this._shoveWay = 0;
    this.emit('crash', why, speed);
  }

  _tumble(h) {
    this.down += h;
    this.jets = 0;
    const g = this.ground.at(this.x, this.z, this.y + REACH, _g);
    if (this.y > g.y + 0.03 || this.vy > 0) {
      this.vy -= GRAVITY * h;
    } else {
      this.y = g.y;
      this.vy = 0;
      this.grounded = true;
      const sp = this.speed;
      const k = sp > 1e-6 ? Math.max(0, sp - (TUMBLE.friction + TUMBLE.more * sp) * h) / sp : 0;
      this.vx *= k;
      this.vz *= k;
    }
    this.x += this.vx * h;
    this.y += this.vy * h;
    this.z += this.vz * h;
    this._collide(true);
    const under = this.ground.at(this.x, this.z, this.y + REACH, _g).y;
    if (this.y < under) {
      this.y = under;
      if (this.vy < 0) this.vy = 0;
    }
    this.roll += this.speed * TUMBLE.roll * h;
    if ((this.down > TUMBLE.up && this.speed < 0.8) || this.down > TUMBLE.most) this._getUp();
  }

  // Up again, still, with the board fetched back under your feet.
  _getUp() {
    const g = this.ground.at(this.x, this.z, this.y + REACH, _g);
    this.down = -1;
    this.v = this.vx = this.vy = this.vz = 0;
    this.y = g.y;
    this.face = 0;
    this.roll = 0;
    this.yawRate = 0;
    this.grounded = true;
    this.air = blankAir();
    this.loose = null;
    this.surface = g.surface;
    this.what = g.what;
    this.emit('up');
  }

  // The board on its own, while you're down: rolling on wheels down on the
  // hard stuff, sliding to a stop wheels up or off it, tumbling as it goes.
  _loose(h) {
    const b = this.loose;
    const g = this.ground.at(b.x, b.z, b.y + REACH, _a);
    b.flip += b.flipRate * h;
    b.yaw = wrap(b.yaw + b.yawRate * h);
    if (b.y > g.y + 0.01 || b.vy > 0) {
      b.vy -= GRAVITY * h;
      b.y += b.vy * h;
      if (b.y <= g.y) {
        b.y = g.y;
        const hard = -b.vy;
        b.vy = hard > 1.5 ? hard * LOOSE.bounce : 0;
        b.flipRate *= 0.5;
        b.yawRate *= 0.6;
        if (hard > 0.8) this.emit('clatter', Math.min(1, hard / 6));
      }
    } else {
      b.y = g.y;
      // lying still now: wheels down or wheels up, whichever it's nearer
      b.flipRate *= Math.exp(-h * 4);
      b.yawRate *= Math.exp(-h * 3);
      if (Math.abs(b.flipRate) < 1.5) {
        const rest = Math.round(b.flip / Math.PI) * Math.PI;
        b.flip += (rest - b.flip) * (1 - Math.exp(-h * 10));
      }
    }
    const wheelsDown = Math.abs(wrap(b.flip)) < Math.PI / 2;
    const stop = b.vy === 0 && wheelsDown && rolls(g.surface) ? SURFACES[g.surface].roll + 0.3 : LOOSE.stop;
    b.v = sign(b.v) * Math.max(0, Math.abs(b.v) - stop * h);
    b.x += Math.sin(b.yaw) * b.v * h;
    b.z += Math.cos(b.yaw) * b.v * h;
    if (this.ground.hit(b.x, b.y, b.z, 0.15, _hit)) {
      b.x += _hit.nx * _hit.depth;
      b.z += _hit.nz * _hit.depth;
      if (Math.abs(b.v) > 1) this.emit('clatter', Math.min(1, Math.abs(b.v) / 6));
      b.v *= -0.3;
    }
  }
}

// An angle turning on `way` by `step` while `on`, and once not, on round to
// the next whole `unit` of it (and no further).
function turnOn(a, way, on, step, unit) {
  if (!way) return a;
  if (on) return a + way * step;
  const end = (way > 0 ? Math.ceil(a / unit - 1e-9) : Math.floor(a / unit + 1e-9)) * unit;
  return Math.abs(end - a) <= step ? end : a + way * step;
}

function blankAir() {
  return { time: 0, height: 0, spin: 0, flip: 0, shove: 0, popped: false, fakie: false };
}
