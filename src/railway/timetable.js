// When the trains run: where each train on a line is at any moment, worked
// out from the clock on the wall alone. So everyone in a world sees the same
// train in the same place without a word passing between them, and a train
// you watched leave is somewhere further round the line when you come back.
//
// Every train on a line keeps the same timetable, a fraction of it apart:
// it stands at each station for DWELL seconds, pulls away at ACCEL, runs at
// up to SPEED and draws up at the next, the middle of the train at the
// middle of the platform. The trains go round in the direction the line was
// surveyed (increasing s).
//
// No three.js in here.
//
//   const tt = new Timetable(line);
//   tt.where(j, t, out)   train j at time t (s): out.s (its front, m round the
//                         line), out.v (m/s), out.at (the station it stands
//                         at, or -1), out.next (the station it stands at or
//                         is heading for), out.leaves (s until it pulls out),
//                         out.due (s until it stands at `next`)
//   tt.due(k, t)          the next train to stand at station k: { train,
//                         wait (s, 0 if one is there now), leaves }

import { ahead } from './lines.js';

export const SPEED = 11; // m/s at most (about 40 km/h)
export const ACCEL = 0.42; // m/s², pulling away and drawing up
export const DWELL = 24; // s standing at each station

// What a train is made of, front to back: an engine, its tender and two
// open cars to ride in. len: over the couplers (m); between cars, GAP.
export const CONSIST = [
  { kind: 'engine', len: 8.4 },
  { kind: 'tender', len: 4.6 },
  { kind: 'coach', len: 8.6 },
  { kind: 'coach', len: 8.6 },
];
export const GAP = 0.45;
export const TRAIN_LEN = CONSIST.reduce((sum, c) => sum + c.len, 0) + GAP * (CONSIST.length - 1);

// How long a run of `len` metres takes, from standing to standing (s).
export function runTime(len) {
  const d = (SPEED * SPEED) / ACCEL;
  return len >= d ? len / SPEED + SPEED / ACCEL : 2 * Math.sqrt(len / ACCEL);
}

// How far along a run of `len` m a train is `t` s after pulling away, and
// how fast it's going. -> fills out.d, out.v
export function runAt(len, t, out) {
  const T = runTime(len);
  if (t <= 0) {
    out.d = 0;
    out.v = 0;
    return out;
  }
  if (t >= T) {
    out.d = len;
    out.v = 0;
    return out;
  }
  const top = Math.min(SPEED, Math.sqrt(ACCEL * len));
  const t1 = top / ACCEL;
  const d1 = 0.5 * ACCEL * t1 * t1;
  if (t < t1) {
    out.d = 0.5 * ACCEL * t * t;
    out.v = ACCEL * t;
  } else if (t < T - t1) {
    out.d = d1 + top * (t - t1);
    out.v = top;
  } else {
    const r = T - t;
    out.d = len - 0.5 * ACCEL * r * r;
    out.v = ACCEL * r;
  }
  return out;
}

const mod = (a, b) => ((a % b) + b) % b;

export class Timetable {
  constructor(line) {
    this.line = line;
    const L = line.length;
    this.length = L;
    // where the front of a train stands at each station
    this.stops = line.stations.map((st) => mod(st.s + TRAIN_LEN / 2, L));
    const n = this.stops.length;
    this.legs = [];
    let t = 0;
    for (let k = 0; k < n; k++) {
      const len = ahead(this.stops[k], this.stops[(k + 1) % n], L) || L;
      const run = runTime(len);
      // standing at k from `start`, then running to k + 1
      this.legs.push({ start: t, len, run });
      t += DWELL + run;
    }
    this.period = t;
    this.trains = line.trains;
    this._r = { d: 0, v: 0 };
  }

  // Where train j's timetable is at time t (s): how far into it.
  _clock(j, t) {
    return mod(t + this.line.phase * this.period + (j * this.period) / this.trains, this.period);
  }

  _leg(c) {
    const legs = this.legs;
    let k = legs.length - 1;
    while (k > 0 && legs[k].start > c) k--;
    return k;
  }

  where(j, t, out = {}) {
    const c = this._clock(j, t);
    const k = this._leg(c);
    const leg = this.legs[k];
    const into = c - leg.start;
    const n = this.legs.length;
    if (into < DWELL) {
      out.s = this.stops[k];
      out.v = 0;
      out.at = k;
      out.next = k;
      out.leaves = DWELL - into;
      out.due = 0;
    } else {
      runAt(leg.len, into - DWELL, this._r);
      out.s = mod(this.stops[k] + this._r.d, this.length);
      out.v = this._r.v;
      out.at = -1;
      out.next = (k + 1) % n;
      out.leaves = 0;
      out.due = leg.run - (into - DWELL);
    }
    return out;
  }

  // The next train to stand at station k after time t.
  due(k, t) {
    const at = this.legs[k].start;
    let best = null;
    for (let j = 0; j < this.trains; j++) {
      const c = this._clock(j, t);
      const into = c - at;
      const here = into >= 0 && into < DWELL;
      const wait = here ? 0 : mod(at - c, this.period);
      if (!best || wait < best.wait) best = { train: j, wait, leaves: here ? DWELL - into : wait + DWELL };
    }
    return best;
  }
}
