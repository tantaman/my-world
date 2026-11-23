// A flight, from one airfield to another: where the plane is and what it's
// doing, over time.
//
// You board at the apron, the engines start, it taxis out and back down the
// strip to the far end, turns, and takes off. It climbs straight out over
// the end of the strip (the air there is clear: airports.js) up into a layer
// of cloud, turns onto its course inside it, and comes out over the top: a
// sea of cloud in the sun, going by underneath. Then it sinks back into it,
// and while there's nothing to see but white, it's carried across the world
// to the other airfield (hold), and waits there in the cloud until the land
// below has grown (ready). Then it comes down out of the cloud on a steep
// approach to the strip, lands, rolls out, taxis in to the apron, and the
// engines stop.
//
// Over the clouds the plane stays where it is and the clouds go by under it
// (deck.drift): the same thing, seen from the plane, as flying over them,
// and nothing below has to grow on the way.
//
// No three.js in here: the tests fly it, and index.js draws it and moves you
// with it.
//
// A pose: x, y, z (the ground under its main wheels, or where that would
// be), yaw, pitch (nose up), roll (left wing up), v (m/s), power (0..1),
// door (0 shut .. 1 down), lit (landing lights), aloft.
//
// Emits:
//   'phase'     (phase, was)
//   'liftoff'   ()
//   'jump'      ()    carried across, in the cloud: the deck and the plane
//                     are over the other airfield now
//   'touchdown' ()
//   'done'      ()

import { Emitter } from '../core/events.js';
import { toWorld } from '../world/frame.js';
import { HALF, topAt } from './airports.js';
import { PARK } from './airfield.js';
import { wrapAngle as wrap } from '../core/geom.js';

export const FLY = {
  board: 3, // s climbing the steps and shutting the door
  start: 4, // s for the engines to start
  taxi: 8, // m/s taxiing
  taxiAccel: 1.6, // m/s²
  turn: 6, // m: the radius of a corner taxiing (less where there isn't room)
  lineup: 2.5, // s run up at the end of the strip, brakes on
  rollAccel: 3.5, // m/s² down the strip
  rotate: 26, // m/s: the wheels leave the ground
  climbSpeed: 38, // m/s climbing
  climbRate: 8, // m/s up
  turnRate: (6 * Math.PI) / 180, // rad/s turning onto the course
  deckUp: 180, // m over the field the cloud lies, at the least
  deckClear: 45, // m over any ground near the way in or out
  above: 70, // m over the cloud it cruises
  drift: 62, // m/s the clouds go by underneath
  down: 8, // s sinking into the cloud
  inCloud: 4, // m under the top of the cloud it waits in
  hold: 2, // s in the cloud, at the least
  glide: 0.14, // the approach, down (rise over run): steep, a bush pilot's
  approach: [40, 27], // m/s: coming down out of the cloud, and over the threshold
  flare: 60, // m short of touching down it rounds out
  touch: 25, // m past the threshold it touches down
  brake: 4, // m/s² rolling out
  shut: 4, // s for the engines to stop and the door to come down
  dt: 0.05, // s between the points of a leg worked out ahead
};
const G = 9.81;
const FLARE_PITCH = 0.1; // rad, nose up over the runway's own slope, touching down
const ASIDE = 4; // m to the side of the middle it taxis down the strip
const PHASES = ['boarding', 'start', 'taxi', 'lineup', 'roll', 'climb', 'cruise', 'down', 'hold', 'approach', 'landing', 'taxi-in', 'shutdown'];

const _w = { x: 0, z: 0 };

// How long over the clouds (s), for a flight of so many real km.
export const cruiseFor = (km) => Math.max(12, Math.min(32, 10 + km / 200));

// Which ways a field can be used: off which end the climb out (and so the way
// in) is clear. way: +1 is toward the strip's +z end.
export const canTakeOff = (site, way) => site.clear[way > 0 ? 1 : 0];
export const canLand = (site, way) => site.clear[way > 0 ? 0 : 1];

// The way to go along the strip (+1 or -1) into the wind (wind: which way
// it blows, { x, z }), of those it can be: taking off, or landing.
export function intoWind(site, wind, landing = false) {
  const ok = (w) => (landing ? canLand(site, w) : canTakeOff(site, w));
  const head = Math.sin(site.yaw) * wind.x + Math.cos(site.yaw) * wind.z; // > 0: the wind blows toward +z
  const best = head > 0 ? -1 : 1;
  return ok(best) ? best : -best;
}

// ── Paths on the ground ──────────────────────────────────────────────────────

// A path through corners [[x, z], ...] in a field's frame, its corners
// rounded (radius r, less where the legs are short): points every half
// metre, each { x, z, h (heading in the frame), s (m along) }.
export function taxiway(points, r = FLY.turn) {
  const out = [];
  let s = 0;
  let last = null;
  const put = (x, z) => {
    if (last) {
      const d = Math.hypot(x - last.x, z - last.z);
      if (d < 1e-6) return;
      s += d;
    }
    last = { x, z, h: 0, s };
    out.push(last);
  };
  const line = (ax, az, bx, bz) => {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
    for (let i = 0; i <= n; i++) put(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n);
  };
  let [px, pz] = points[0];
  for (let k = 1; k < points.length; k++) {
    const [cx, cz] = points[k];
    if (k === points.length - 1) {
      line(px, pz, cx, cz);
      break;
    }
    const [nx, nz] = points[k + 1];
    const l1 = Math.hypot(cx - px, cz - pz);
    const l2 = Math.hypot(nx - cx, nz - cz);
    const d1 = [(cx - px) / l1, (cz - pz) / l1];
    const d2 = [(nx - cx) / l2, (nz - cz) / l2];
    const turn = Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]);
    const half = Math.abs(turn) / 2;
    const rr = Math.min(r, (Math.min(l1, l2) * 0.5) / Math.max(Math.tan(half), 1e-6));
    const t = rr * Math.tan(half);
    const ax = cx - d1[0] * t;
    const az = cz - d1[1] * t;
    line(px, pz, ax, az);
    // the arc round the corner, about a middle off to the side it turns to
    const side = Math.sign(turn) || 1;
    const mx = ax - d1[1] * rr * side;
    const mz = az + d1[0] * rr * side;
    const a0 = Math.atan2(az - mz, ax - mx);
    const n = Math.max(2, Math.ceil((Math.abs(turn) * rr) / 0.5));
    for (let i = 1; i <= n; i++) {
      const a = a0 + (turn * i) / n;
      put(mx + Math.cos(a) * rr, mz + Math.sin(a) * rr);
    }
    px = cx + d2[0] * t;
    pz = cz + d2[1] * t;
  }
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)];
    const b = out[Math.min(out.length - 1, i + 1)];
    out[i].h = Math.atan2(b.x - a.x, b.z - a.z);
  }
  // headings that don't jump by a whole turn from one point to the next
  for (let i = 1; i < out.length; i++) out[i].h = out[i - 1].h + wrap(out[i].h - out[i - 1].h);
  return out;
}

// Out from where the plane stands (facing +1 or -1 along the strip) to the
// end it takes off from, going `way`: forward off the stand, across onto the
// strip, back down it to the far end, round, and lined up.
export function taxiOut(facing, way) {
  const end = -way * (HALF - 10);
  return taxiway([
    [PARK.x, PARK.z],
    [PARK.x, PARK.z + 12 * facing],
    [-ASIDE, PARK.z + 12 * facing],
    [-ASIDE, end],
    [ASIDE, end],
    [ASIDE, -way * (HALF - 16)],
  ]);
}

// In from where it slowed to a taxi on the strip (at z, going `way`) to the
// stand, where it stops facing back the way it landed.
export function taxiIn(z, way) {
  // (the corner off the strip a little past where it slowed, if that's past the apron)
  const turn = way > 0 ? Math.max(PARK.z + 14, z + 10) : Math.min(PARK.z - 14, z - 10);
  return taxiway([
    [0, z],
    [0, turn],
    [PARK.x, turn],
    [PARK.x, PARK.z],
  ]);
}

// ── The flight ───────────────────────────────────────────────────────────────

export class Flight extends Emitter {
  // from, to: airfields (airports.js); ground(x, z): the height of the
  // ground in the world; way, land: along the strip taking off from `from`
  // and landing at `to` (+1, -1: intoWind); facing: which way the plane on
  // `from`'s apron stands; cruise: s over the clouds.
  constructor({ from, to, ground, way, land, facing = 1, cruise = 15 }) {
    super();
    this.from = from;
    this.to = to;
    this.way = way;
    this.land = land;
    this.cruise = cruise;
    this.course = Math.atan2(to.x - from.x, to.z - from.z);
    // where the cloud lies over each field: over the field by deckUp, and
    // over every hill near the way out (or in) by deckClear
    this.deckFrom = deckOver(from, way, ground, 1);
    this.deckTo = deckOver(to, land, ground, -1);
    this.out = outbound(from, way, facing, this.deckFrom, this.course);
    this.in = inbound(to, land, this.deckTo);
    const top = this.out[this.out.length - 1];
    // over the clouds, where the climb ended; in the cloud, a little lower
    this.over = { ...top, y: this.deckFrom + FLY.above, yaw: top.yaw, pitch: 0.02, roll: 0, power: 0.7, lit: false };
    this.first = this.in[0];
    this.phase = 'boarding';
    this.t = 0; // s into the flight's current part
    this.part = 'out'; // out → cruise → down → hold → in → done
    this.ready = false; // set when the land under the way in has grown
    this.pose = { ...this.out[0] };
    this.drift = 0; // m the clouds have gone by
    this.done = false;
  }

  // Where the cloud is now: its height, and which way it's going by (rad).
  get deck() {
    return this.part === 'out' || this.part === 'cruise' || this.part === 'down' ? this.deckFrom : this.deckTo;
  }

  get jumped() {
    return this.part === 'hold' || this.part === 'in' || this.part === 'done';
  }

  _phase(p) {
    if (p === this.phase) return;
    const was = this.phase;
    this.phase = p;
    this.emit('phase', p, was);
  }

  // Skip ahead: to the end of this part of the flight (from the console,
  // the play-through, and nodding off over the clouds).
  hurry() {
    if (this.part === 'out') this.t = this.out[this.out.length - 1].t;
    else if (this.part === 'cruise') this.t = this.cruise;
    else if (this.part === 'down') this.t = FLY.down;
    else if (this.part === 'hold') this.t = Math.max(this.t, FLY.hold);
    else if (this.part === 'in') this.t = Math.max(this.t, this.in.find((p) => p.phase === 'taxi-in')?.t ?? this.t);
  }

  update(dt) {
    if (this.done) return this.pose;
    this.t += dt;
    const p = this.pose;
    if (this.part === 'out') {
      const was = p.phase;
      sample(this.out, this.t, p);
      if (was !== 'climb' && p.phase === 'climb') this.emit('liftoff');
      this._phase(p.phase);
      if (this.t >= this.out[this.out.length - 1].t) this._go('cruise');
    }
    if (this.part === 'cruise' || this.part === 'down') {
      const o = this.over;
      Object.assign(p, o);
      const sink = this.part === 'down' ? smooth(Math.min(1, this.t / FLY.down)) : 0;
      p.y = o.y - sink * (FLY.above + FLY.inCloud);
      p.pitch = 0.02 - sink * 0.08 * (1 - sink) * 4;
      p.power = 0.7 - sink * 0.25;
      p.v = FLY.drift;
      this.drift += FLY.drift * dt;
      this._phase(this.part);
      if (this.part === 'cruise' && this.t >= this.cruise) this._go('down');
      else if (this.part === 'down' && this.t >= FLY.down) {
        this._go('hold');
        this.emit('jump');
      }
    }
    if (this.part === 'hold') {
      Object.assign(p, this.first);
      p.phase = 'hold';
      this.drift += FLY.drift * dt;
      this._phase('hold');
      if (this.ready && this.t >= FLY.hold) this._go('in');
    }
    if (this.part === 'in') {
      const was = p.phase;
      sample(this.in, this.t, p);
      if (was !== 'landing' && p.phase === 'landing') this.emit('touchdown');
      this._phase(p.phase);
      if (this.t >= this.in[this.in.length - 1].t) {
        this.part = 'done';
        this.done = true;
        this._phase('done');
        this.emit('done');
      }
    }
    return p;
  }

  _go(part) {
    this.part = part;
    this.t = 0;
  }

  // How far through the whole trip, 0..1, for the HUD (the cruise counts
  // for what it is, the hold for nothing).
  get progress() {
    const out = this.out[this.out.length - 1].t;
    const inn = this.in[this.in.length - 1].t;
    const all = out + this.cruise + FLY.down + inn;
    const at = { out: this.t, cruise: out + this.t, down: out + this.cruise + this.t, hold: out + this.cruise + FLY.down, in: out + this.cruise + FLY.down + this.t, done: all }[this.part];
    return Math.min(1, at / all);
  }

  // How many seconds until it's on the ground at the other end, roughly.
  get left() {
    const touch = this.in.find((q) => q.phase === 'landing')?.t ?? 0;
    const out = this.out[this.out.length - 1].t;
    switch (this.part) {
      case 'out':
        return out - this.t + this.cruise + FLY.down + FLY.hold + touch;
      case 'cruise':
        return this.cruise - this.t + FLY.down + FLY.hold + touch;
      case 'down':
        return FLY.down - this.t + FLY.hold + touch;
      case 'hold':
        return Math.max(0, FLY.hold - this.t) + touch;
      case 'in':
        return Math.max(0, touch - this.t);
      default:
        return 0;
    }
  }
}

// The height of the cloud over a field, for a flight going `way` along its
// strip, out (dir 1: climbing out over the end ahead) or in (dir -1: coming
// in over the end behind).
function deckOver(site, way, ground, dir) {
  const top = topAt(site, 0);
  let high = top + FLY.deckUp - FLY.deckClear;
  const fx = Math.sin(site.yaw) * way * dir;
  const fz = Math.cos(site.yaw) * way * dir;
  for (let d = 0; d <= 2600; d += 50) {
    for (const off of [-400, -200, 0, 200, 400]) {
      const x = site.x + fx * d + fz * off;
      const z = site.z + fz * d - fx * off;
      high = Math.max(high, ground(x, z));
    }
  }
  return Math.max(top + FLY.deckUp, high + FLY.deckClear);
}

// A pose at a point of a path in a field's frame.
function onGround(site, x, z, h, out) {
  toWorld(site, x, z, _w);
  out.x = _w.x;
  out.z = _w.z;
  out.y = topAt(site, z);
  out.yaw = site.yaw + h;
  const grade = (topAt(site, z + 0.5) - topAt(site, z - 0.5)) * Math.cos(h);
  out.pitch = Math.atan(grade);
  out.roll = 0;
  return out;
}

// Rolling along a path, from v0 up to vmax and down to v1 at its end:
// points every FLY.dt, from t0. fill(point, along 0..1) adds the rest.
function roll(path, { t0, v0 = 0, v1 = 0, vmax = FLY.taxi, accel = FLY.taxiAccel, decel = FLY.taxiAccel, phase }, site, list) {
  const L = path[path.length - 1].s;
  let s = 0;
  let v = v0;
  let t = t0;
  let k = 0;
  for (;;) {
    while (k < path.length - 2 && path[k + 1].s < s) k++;
    const a = path[k];
    const b = path[k + 1] || a;
    const f = b.s > a.s ? Math.min(1, Math.max(0, (s - a.s) / (b.s - a.s))) : 0;
    const p = onGround(site, a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f, a.h + (b.h - a.h) * f, { t, phase, v });
    list.push(p);
    if (s >= L - 1e-3) break;
    const stop = (v * v - v1 * v1) / (2 * decel);
    if (L - s <= stop) v = Math.max(v1, v - decel * FLY.dt);
    else v = Math.min(vmax, v + accel * FLY.dt);
    v = Math.max(v, 0.6);
    s = Math.min(L, s + v * FLY.dt);
    t += FLY.dt;
  }
  return t;
}

// Standing still for a while, from the last point.
function wait(list, seconds, phase, fill) {
  const last = list[list.length - 1];
  const t0 = last.t;
  for (let t = FLY.dt; t <= seconds + 1e-6; t += FLY.dt) {
    const p = { ...last, t: t0 + t, phase, v: 0 };
    fill(p, t / seconds);
    list.push(p);
  }
}

// From the apron to the top of the climb.
function outbound(site, way, facing, deck, course) {
  const list = [];
  const parked = { t: 0, phase: 'boarding', v: 0, power: 0, door: 1, lit: false, aloft: false };
  onGround(site, PARK.x, PARK.z, facing > 0 ? 0 : Math.PI, parked);
  list.push(parked);
  wait(list, FLY.board, 'boarding', (p, f) => (p.door = 1 - smooth(Math.max(0, (f - 0.55) / 0.45))));
  wait(list, FLY.start, 'start', (p, f) => {
    p.door = 0;
    p.power = 0.3 * smooth(f);
  });
  // taxi out
  const path = taxiOut(facing, way);
  const from = list.length;
  roll(path, { t0: list[list.length - 1].t + FLY.dt, phase: 'taxi' }, site, list);
  for (let i = from; i < list.length; i++) Object.assign(list[i], { power: 0.35, door: 0, lit: false, aloft: false });
  wait(list, FLY.lineup, 'lineup', (p, f) => {
    p.power = 0.35 + 0.65 * smooth(f);
    p.lit = true;
  });
  // the take-off roll, easing over to the middle of the strip
  const lz0 = -way * (HALF - 16);
  const runway = [];
  for (let d = 0; d <= HALF * 2; d += 0.5) {
    const k = smooth(Math.min(1, d / 40));
    runway.push({ x: ASIDE * (1 - k), z: lz0 + way * d, h: way > 0 ? 0 : Math.PI, s: d });
  }
  for (let i = 1; i < runway.length; i++) {
    const a = runway[i - 1];
    const b = runway[i];
    b.h = (way > 0 ? 0 : Math.PI) + Math.atan2(b.x - a.x, Math.abs(b.z - a.z)) * way;
  }
  runway[0].h = runway[1].h;
  let t = list[list.length - 1].t;
  let v = 0;
  let s = 0;
  let k = 0;
  let pitch = 0;
  while (v < FLY.rotate) {
    t += FLY.dt;
    v += FLY.rollAccel * FLY.dt;
    s += v * FLY.dt;
    while (k < runway.length - 2 && runway[k + 1].s < s) k++;
    const a = runway[k];
    const p = onGround(site, a.x, a.z, a.h, { t, phase: 'roll', v, power: 1, door: 0, lit: true, aloft: false });
    // the nose comes up over the last few metres a second
    if (v > FLY.rotate - 4) pitch = Math.min(0.13, pitch + 0.11 * FLY.dt);
    p.pitch += pitch;
    list.push(p);
  }
  // the climb: straight out, then onto the course once in the cloud
  let { x, y, z, yaw } = list[list.length - 1];
  const field = topAt(site, 0);
  const top = deck + FLY.above;
  let vy = 0;
  let turning = 0;
  for (let n = 0; n < 4000; n++) {
    t += FLY.dt;
    v = Math.min(FLY.climbSpeed, v + 1.4 * FLY.dt);
    vy = y < top ? Math.min(FLY.climbRate, vy + 3 * FLY.dt) : Math.max(0, vy - 4 * FLY.dt);
    if (y >= top) y = top;
    const want = y > deck - 30 ? wrap(course - yaw) : 0;
    const rate = Math.max(-FLY.turnRate, Math.min(FLY.turnRate, want * 0.8));
    turning += (rate - turning) * Math.min(1, FLY.dt * 1.5);
    yaw += turning * FLY.dt;
    x += Math.sin(yaw) * v * FLY.dt;
    z += Math.cos(yaw) * v * FLY.dt;
    y += vy * FLY.dt;
    const p = { t, phase: 'climb', x, y, z, yaw, v, power: 0.9, door: 0, lit: y < field + 60, aloft: true };
    p.pitch = Math.atan2(vy, v) + 0.06;
    p.roll = -Math.atan((v * turning) / G);
    list.push(p);
    if (y >= top - 0.5 && Math.abs(wrap(course - yaw)) < 0.01 && Math.abs(turning) < 0.01) break;
  }
  const last = list[list.length - 1];
  last.yaw = course + (last.yaw - course - wrap(last.yaw - course));
  return list;
}

// From in the cloud over the other field to standing on its apron.
function inbound(site, way, deck) {
  const list = [];
  const td = -way * (HALF - FLY.touch); // where it touches down, along the strip
  const hTD = topAt(site, td);
  const start = deck - FLY.inCloud;
  const d0 = (start - hTD) / FLY.glide;
  const heading = site.yaw + (way > 0 ? 0 : Math.PI);
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  toWorld(site, 0, td, _w);
  const tdx = _w.x;
  const tdz = _w.z;
  // down the glide path out of the cloud, slowing to cross the threshold,
  // and rounding out over the last FLY.flare metres
  let d = d0;
  let t = 0;
  const [vHi, vLo] = FLY.approach;
  while (d > 0) {
    const v = vLo + (vHi - vLo) * smooth(Math.min(1, Math.max(0, (d - 250) / Math.max(1, d0 - 250))));
    let y;
    let slope;
    if (d > FLY.flare) {
      y = hTD + d * FLY.glide;
      slope = FLY.glide;
    } else {
      // (a Hermite curve from the glide path down to touching gently)
      const u = d / FLY.flare;
      const F = FLY.flare;
      const h10 = u * u * u - 2 * u * u + u;
      const h01 = -2 * u * u * u + 3 * u * u;
      const h11 = u * u * u - u * u;
      y = hTD + h10 * 0.01 * F + h01 * F * FLY.glide + h11 * F * FLY.glide;
      slope = ((3 * u * u - 4 * u + 1) * 0.01 * F + (-6 * u * u + 6 * u) * F * FLY.glide + (3 * u * u - 2 * u) * F * FLY.glide) / F;
    }
    const flare = d < FLY.flare ? 1 - d / FLY.flare : 0;
    list.push({ t, phase: 'approach', x: tdx - fx * d, y, z: tdz - fz * d, yaw: heading, pitch: -Math.atan(slope) + 0.05 + flare * (FLARE_PITCH - 0.05), roll: 0, v, power: 0.45 - flare * 0.25, door: 0, lit: y < hTD + 120, aloft: true });
    d -= v * FLY.dt;
    t += FLY.dt;
  }
  // touch down, and roll out to a taxi, the nose coming down
  let v = vLo;
  let s = 0;
  let pitch = FLARE_PITCH;
  while (v > FLY.taxi) {
    const lz = td + way * s;
    const p = onGround(site, 0, lz, way > 0 ? 0 : Math.PI, { t, phase: 'landing', v, power: 0.15, door: 0, lit: true, aloft: false });
    pitch = Math.max(0, pitch - 0.09 * FLY.dt);
    p.pitch += pitch;
    list.push(p);
    v -= FLY.brake * FLY.dt;
    s += v * FLY.dt;
    t += FLY.dt;
  }
  // taxi in to the stand
  const from = list.length;
  roll(taxiIn(td + way * s, way), { t0: t, v0: FLY.taxi, phase: 'taxi-in' }, site, list);
  for (let i = from; i < list.length; i++) Object.assign(list[i], { power: 0.3, door: 0, lit: false, aloft: false });
  wait(list, FLY.shut, 'shutdown', (p, f) => {
    p.power = 0.3 * (1 - smooth(Math.min(1, f * 1.5)));
    p.door = smooth(Math.max(0, (f - 0.6) / 0.4));
  });
  return list;
}

// The pose at time t along a leg's points.
function sample(list, t, out) {
  let lo = 0;
  let hi = list.length - 1;
  if (t >= list[hi].t) return Object.assign(out, list[hi]);
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (list[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = list[lo];
  const b = list[hi];
  const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
  Object.assign(out, a);
  for (const k of ['x', 'y', 'z', 'yaw', 'pitch', 'roll', 'v', 'power', 'door']) out[k] = a[k] + (b[k] - a[k]) * f;
  out.t = t;
  return out;
}

const smooth = (f) => f * f * (3 - 2 * f);

export { PHASES };
