// A race: you and five others on the grid, three laps, and the lights.
//
// The grid is two by two behind the start line, you at the back. Five red
// lights come on one a second; a moment after the last, they all go out, and
// that's the start. A lap is once round past the line; the first starts at
// the lights. Whoever has been round three times first wins, and the order
// the rest cross the line is where they came. Each car's laps are timed,
// and its best.
//
// The others drive themselves. Each follows the racing line (racingLine:
// in to the apex of a bend, out wide on the way in and out) at its own pace,
// a share of the fastest the car could take each part of the lap (profile:
// as fast as the tyres hold round the bends, braking in time for them, and
// as fast as it can pull out of them), and a moment late off the line. Come
// up behind someone slower and it pulls out to pass if there's room, and
// waits if there isn't. You count as someone in its way too. Bumping into
// one shoves you both (bump()).
//
// Everything here is along the lap and across it: `run` is how far round a
// car has gone since the start (m; behind the line it's negative), `lat` how
// far to the left of the line. index.js says where your car is (follow()),
// and puts theirs in the world.
//
// Emits:
//   'light'  (n)                 n of the five lights lit
//   'go'     ()                  the lights are out
//   'lap'    (car, n, time)      car has been round n times, the last in time s
//   'finish' (car, place)        ...and that was its last
//   'done'   ()                  everyone has finished
//
// No three.js in here: the tests run races.

import { Emitter } from '../core/events.js';
import { mulberry32 } from '../noise.js';
import { CAR, GROUND } from './car.js';
import { SURNAMES } from '../landmarks/kinds.js';

export const RACE = {
  laps: 3,
  rivals: 5,
  lights: 5, // red lights over the line
  every: 0.9, // s between one coming on and the next
  hold: [0.6, 2], // s the last is held lit before they go out, at least and at most
  pace: [0.84, 0.95], // the share of the fastest it could go round that each of the others goes
  react: [0.2, 0.6], // s each takes to get going when they go out
  row: 8, // m between rows on the grid
  side: 2.8, // m either side of the line the two cars in a row stand
  first: 7, // m behind the line the front row stands
  look: 18, // m ahead the others look for someone in their way
  room: 2.5, // m apart across the track two cars need to be to go by
  slack: 1.6, // m in from the edge of the racing surface they keep to
  calm: 0.5, // the pace they go round at once they've finished
  cool: 30, // s after you finish before the rest are placed where they are
};
// How the others drive: how hard they take the bends (a share of what the
// tyres hold), and brake for them (m/s²).
const AI = { grip: 0.9, brake: CAR.brake * 0.75 };
// How far ahead (m) the line looks to the bend it sets up for.
const LINE_AHEAD = 18;
// Two cars, seen from above, are two discs each, this far either side of
// the middle along it (m), this big round.
const DISC = { along: 0.95, r: 1.0 };
const KICK = 0.35; // how much of the speed they come together at they bounce apart with
const COLOURS = [0x1f6fd1, 0x2fa34a, 0xe8b417, 0x8a3cc8, 0xe86a17, 0x18a8b0, 0xd8d8d8, 0x2a2a2a];
const INITIALS = 'ABCDEGHJKLMNPRSTW';

// The fastest the car could be going at each of the circuit's samples
// (m/s), on its surface ('dirt', 'asphalt'): as fast as the tyres hold it
// round each bend, braking for the next in time, and as fast as it can pull
// away from the last.
export function profile(c, surface) {
  const G = GROUND[surface] || GROUND.asphalt;
  const n = c.n;
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = Math.min(G.top * 0.98, Math.sqrt((G.grip * AI.grip) / Math.max(1e-4, Math.abs(c.k[i]))));
  // twice round each way, so the lap closes up
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 2 * n - 1; k >= 0; k--) {
      const i = k % n;
      const next = v[(i + 1) % n];
      v[i] = Math.min(v[i], Math.sqrt(next * next + 2 * AI.brake * c.step));
    }
    for (let k = 0; k < 2 * n; k++) {
      const i = (k + 1) % n;
      const was = v[k % n];
      const pull = CAR.power * Math.max(0, 1 - was / G.top) - CAR.coast - CAR.drag * was * was - G.drag;
      v[i] = Math.min(v[i], Math.sqrt(was * was + 2 * Math.max(0.2, pull) * c.step));
    }
  }
  return v;
}

// The racing line: how far left of the middle (m) to be at each of the
// circuit's samples. In to the inside of a bend at its tightest, and out to
// the outside before and after it.
export function racingLine(c) {
  const n = c.n;
  const room = c.half - RACE.slack;
  const out = new Float64Array(n);
  const ahead = Math.round(LINE_AHEAD / c.step);
  for (let i = 0; i < n; i++) {
    const here = c.k[i];
    const next = c.k[(i + ahead) % n];
    // the inside now, the outside of what's coming
    out[i] = Math.max(-1, Math.min(1, here * 40 - Math.max(0, Math.abs(next) - Math.abs(here)) * Math.sign(next) * 40)) * room;
  }
  // evened out
  const m = Math.round(10 / c.step);
  const smooth = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = -m; j <= m; j++) sum += out[(i + j + n) % n];
    smooth[i] = sum / (2 * m + 1);
  }
  return smooth;
}

// Where a slot on the grid is: how far round (negative: behind the line)
// and to the left. Slot 0 is pole; each car in a row stands half a row
// behind the one beside it.
export function gridSlot(slot) {
  const row = Math.floor(slot / 2);
  return { run: -(RACE.first + row * RACE.row + (slot % 2) * RACE.row * 0.5), lat: slot % 2 ? -RACE.side : RACE.side };
}

// How far (m) b is ahead of a round a lap of length L, taking the shorter
// way (-L/2..L/2).
const ahead = (a, b, L) => {
  const d = (((b - a) % L) + L * 1.5) % L;
  return d - L / 2;
};
const sampleAt = (arr, c, s) => {
  const f = c.wrap(s) / c.step;
  const a = Math.floor(f) % c.n;
  const t = f - Math.floor(f);
  return arr[a] + (arr[(a + 1) % c.n] - arr[a]) * t;
};

export class Race extends Emitter {
  // c: the Circuit (layouts.js); surface: 'dirt' or 'asphalt'; seed: who
  // the others are and how they drive (the same seed, the same race)
  constructor(c, { surface = 'asphalt', seed = 1, laps = RACE.laps, rivals = RACE.rivals } = {}) {
    super();
    this.c = c;
    this.laps = laps;
    this.fast = profile(c, surface);
    this.line = racingLine(c);
    this.state = 'lights'; // then 'racing', and 'done' once everyone's finished
    this.clock = 0; // s since the lights began
    this.goAt = Infinity; // ...when they went out
    this.lit = 0;
    const rnd = mulberry32(seed >>> 0);
    this.holdFor = RACE.hold[0] + rnd() * (RACE.hold[1] - RACE.hold[0]);
    // the others, the quicker nearer the front, and you at the back
    const paces = [];
    for (let i = 0; i < rivals; i++) paces.push(RACE.pace[0] + rnd() * (RACE.pace[1] - RACE.pace[0]));
    paces.sort((a, b) => b - a);
    const numbers = new Set([1]);
    this.cars = paces.map((pace, i) => {
      let number;
      do number = 2 + Math.floor(rnd() * 97);
      while (numbers.has(number));
      numbers.add(number);
      const name = `${INITIALS[Math.floor(rnd() * INITIALS.length)]}. ${SURNAMES[Math.floor(rnd() * SURNAMES.length)]}`;
      return this._entry({ id: i + 1, name, number, colour: COLOURS[i % COLOURS.length], pace, react: RACE.react[0] + rnd() * (RACE.react[1] - RACE.react[0]), wander: (rnd() - 0.5) * 1.2 }, i);
    });
    this.you = this._entry({ id: 0, name: 'you', number: 1, you: true }, rivals);
    this.cars.push(this.you);
    this.finishers = 0;
    this.youDoneAt = Infinity;
  }

  _entry(car, slot) {
    const g = this.grid(slot);
    return { pace: 1, react: 0, wander: 0, you: false, ...car, run: g.run, lat: g.lat, v: 0, lane: 0, laps: 0, lapAt: 0, last: null, best: null, times: [], finished: null, place: 0, push: 0 };
  }

  grid(slot) {
    return gridSlot(slot);
  }

  get racing() {
    return this.state === 'racing';
  }

  // Where your car is now: s round the lap, lat to the left, v its speed.
  // The run follows on from the last, so going round counts and backing up
  // takes it away again.
  follow(s, lat, v) {
    const y = this.you;
    y.run += ahead(this.c.wrap(y.run), s, this.c.length);
    y.lat = lat;
    y.v = v;
  }

  update(dt) {
    this.clock += dt;
    if (this.state === 'lights') {
      const lit = Math.min(RACE.lights, Math.floor(this.clock / RACE.every));
      if (lit !== this.lit) {
        this.lit = lit;
        this.emit('light', lit);
      }
      if (this.clock >= RACE.lights * RACE.every + this.holdFor) {
        this.state = 'racing';
        this.lit = 0;
        this.goAt = this.clock;
        for (const car of this.cars) car.lapAt = this.clock;
        this.emit('go');
      }
      return;
    }
    for (const car of this.cars) if (!car.you) this._drive(car, dt);
    for (const car of this.cars) this._count(car);
    // everyone home, or long enough after you
    const all = this.cars.every((car) => car.finished !== null);
    if (this.state === 'racing' && (all || this.clock - this.youDoneAt > RACE.cool)) {
      this.state = 'done';
      for (const car of this.standings()) if (car.finished === null) car.place = ++this.finishers;
      this.emit('done');
    }
  }

  // One of the others, driving: at its pace round the line, out round
  // anyone slower in its way.
  _drive(car, dt) {
    const c = this.c;
    const L = c.length;
    if (this.clock - this.goAt < car.react) return;
    const s = c.wrap(car.run);
    let want = sampleAt(this.fast, c, s + Math.max(0, car.v) * 0.25) * (car.finished !== null ? RACE.calm : car.pace);
    let lane = car.wander;
    const room = c.half - RACE.slack;
    const line = sampleAt(this.line, c, s);
    for (const o of this.cars) {
      if (o === car) continue;
      const d = ahead(car.run, o.run, L);
      if (d <= 0 || d > RACE.look) continue;
      const apart = o.lat - car.lat;
      if (Math.abs(apart) > RACE.room) continue;
      if (o.v >= want - 0.5) continue;
      // in the way, and slower: out to whichever side has more room
      const left = o.lat + RACE.room * 1.1;
      const right = o.lat - RACE.room * 1.1;
      const fitsL = left <= room;
      const fitsR = right >= -room;
      if (fitsL || fitsR) {
        const go = fitsL && (!fitsR || Math.abs(left - car.lat) < Math.abs(right - car.lat)) ? left : right;
        lane = go - line;
      }
      // ...and until it's out, no faster than them
      if (Math.abs(apart) < RACE.room * 0.8) want = Math.min(want, o.v + Math.max(0, d - 6) * 0.6);
    }
    const target = Math.max(-room, Math.min(room, line + lane));
    car.lat += Math.sign(target - car.lat) * Math.min(Math.abs(target - car.lat), (1 + car.v * 0.08) * dt);
    car.lane = lane;
    const G = CAR;
    const pull = G.power * Math.max(0, 1 - car.v / G.top) - G.coast - G.drag * car.v * car.v;
    const dv = want - car.v;
    car.v += dv > 0 ? Math.min(dv, Math.max(0, pull) * dt) : Math.max(dv, -AI.brake * 1.2 * dt);
    // a shove from you, worn off
    car.v = Math.max(0, car.v + car.push);
    car.push = 0;
    car.run += car.v * dt;
  }

  // Laps: each time round past the line.
  _count(car) {
    const L = this.c.length;
    if (this.state !== 'racing' || car.finished !== null) return;
    const done = Math.max(0, Math.floor(car.run / L));
    while (car.laps < done) {
      car.laps++;
      const time = this.clock - car.lapAt;
      car.lapAt = this.clock;
      car.last = time;
      car.times.push(time);
      if (car.best === null || time < car.best) car.best = time;
      this.emit('lap', car, car.laps, time);
      if (car.laps >= this.laps) {
        car.finished = this.clock - this.goAt;
        car.place = ++this.finishers;
        if (car.you) this.youDoneAt = this.clock;
        this.emit('finish', car, car.place);
        break;
      }
    }
  }

  // Everyone, in the order they're running: those who've finished, in the
  // order they did, then the furthest round.
  standings() {
    return [...this.cars].sort((a, b) => {
      if (a.finished !== null || b.finished !== null) {
        if (a.finished === null) return 1;
        if (b.finished === null) return -1;
        return a.place - b.place;
      }
      return b.run - a.run;
    });
  }

  // Where you are in it (1 is in the lead).
  get position() {
    return this.you.place || this.standings().indexOf(this.you) + 1;
  }

  // The time since the lights went out (s), or 0 before.
  get time() {
    return Number.isFinite(this.goAt) ? this.clock - this.goAt : 0;
  }
}

// Your car and one of the others come together. Each is { x, z, yaw, vx,
// vz } (yours moves; theirs is told how much to speed up or slow down along
// the way it's going, as `push`). -> how far (m) yours was moved out of
// theirs, 0 if they weren't touching
export function bump(you, them) {
  let depth = 0;
  let nx = 1;
  let nz = 0;
  for (let a = -1; a <= 1; a += 2) {
    for (let b = -1; b <= 1; b += 2) {
      const ax = you.x + Math.sin(you.yaw) * DISC.along * a;
      const az = you.z + Math.cos(you.yaw) * DISC.along * a;
      const bx = them.x + Math.sin(them.yaw) * DISC.along * b;
      const bz = them.z + Math.cos(them.yaw) * DISC.along * b;
      const d = Math.hypot(ax - bx, az - bz);
      const over = 2 * DISC.r - d;
      if (over > depth) {
        depth = over;
        nx = d > 1e-6 ? (ax - bx) / d : 1;
        nz = d > 1e-6 ? (az - bz) / d : 0;
      }
    }
  }
  if (depth <= 0) return 0;
  you.x += nx * depth;
  you.z += nz * depth;
  const rel = (you.vx - them.vx) * nx + (you.vz - them.vz) * nz;
  if (rel < 0) {
    const k = (1 + KICK) * rel * 0.5;
    you.vx -= k * nx;
    you.vz -= k * nz;
    // theirs, along the way it's going
    them.push = (them.push || 0) + k * (nx * Math.sin(them.yaw) + nz * Math.cos(them.yaw));
  }
  return depth;
}
