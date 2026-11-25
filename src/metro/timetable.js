// When the Metro's trains run: where each train of each service is at any
// moment, worked out from the clock on the wall alone, so that everyone in a
// world sees the same train at the same platform without a word passing
// between them (as the railway's do: src/railway/timetable.js).
//
// A service runs one way along its track (way 0), stopping at each station,
// and back the other (way 1). Most of the lines go on past life-size
// Washington, to Shady Grove, Vienna, Franconia: there a train runs off the
// end of the track that's here at speed, is away for as long as it would take
// to go out to the end of the line and come back, and runs in again on the
// other track. Where a line ends here (Branch Avenue), a train stands at the
// end of it a while and goes back.
//
// Every train of a service keeps the same timetable, HEADWAY apart.
//
//   const tt = new Timetable(pattern, phase);
//   tt.where(j, t, out)   train j at time t (s): out.way (0, 1; -1 while it's
//                         away), out.s (its front, m along that way's route),
//                         out.v (m/s), out.at (the stop it stands at, or -1),
//                         out.next (the stop it stands at or is heading for),
//                         out.leaves (s until it pulls out), out.due (s until
//                         it stands at `next`), out.last (whether the stop
//                         it's at or heading for is its last here)
//   tt.due(level, t)      the next train each way to stand at a level:
//                         [{ train, wait, leaves } | null, ...]
//
// No three.js in here.

export const SPEED = 24; // m/s at most (54 mph)
export const ACCEL = 1.1; // m/s², pulling away and drawing up
export const DWELL = 25; // s standing at each station
export const TURN = 150; // s standing at the end of a line, before going back
export const AWAY_SPEED = 14; // m/s out past life-size Washington, stops and all
export const HEADWAY = 480; // s between trains of a service
// A train: six cars, each 75 feet long over the couplers.
export const CARS = 6;
export const CAR_LEN = 22.86;
export const TRAIN_LEN = CARS * CAR_LEN;

// A run of `len` m, coming in at v0 m/s and going out at v1 (0: standing):
// how long it takes, and where along it a train is t s in.
export function run(len, v0 = 0, v1 = 0) {
  const a = ACCEL;
  // (no faster coming in or going out than it can stop or start in the length)
  v0 = Math.min(v0, Math.sqrt(2 * a * len + v1 * v1));
  v1 = Math.min(v1, Math.sqrt(2 * a * len + v0 * v0));
  const top = Math.min(SPEED, Math.sqrt((2 * a * len + v0 * v0 + v1 * v1) / 2));
  const t1 = (top - v0) / a;
  const d1 = (top * top - v0 * v0) / (2 * a);
  const t3 = (top - v1) / a;
  const d3 = (top * top - v1 * v1) / (2 * a);
  const d2 = Math.max(0, len - d1 - d3);
  const t2 = top > 0 ? d2 / top : 0;
  const time = t1 + t2 + t3;
  return {
    len,
    time,
    at(t, out) {
      if (t <= 0) {
        out.d = 0;
        out.v = v0;
      } else if (t >= time) {
        out.d = len;
        out.v = v1;
      } else if (t < t1) {
        out.d = v0 * t + 0.5 * a * t * t;
        out.v = v0 + a * t;
      } else if (t < t1 + t2) {
        out.d = d1 + top * (t - t1);
        out.v = top;
      } else {
        const r = t - t1 - t2;
        out.d = d1 + d2 + top * r - 0.5 * a * r * r;
        out.v = top - a * r;
      }
      return out;
    },
  };
}

const mod = (a, b) => ((a % b) + b) % b;
// m a line goes on past the end of the track here, for it to count as going on
const GOES_ON = 60;

export class Timetable {
  // pattern: { ways: [route, route] } (network.js); phase: 0..1, where in its
  // timetable the service's first train is at the clock's zero
  constructor(pattern, phase = 0) {
    this.pattern = pattern;
    const steps = []; // { kind: 'stand' | 'run' | 'away', way, t0, time, ... }
    let t = 0;
    const add = (step) => {
      step.t0 = t;
      t += step.time;
      steps.push(step);
    };
    const ways = pattern.ways;
    for (let w = 0; w < 2; w++) {
      const r = ways[w];
      const next = ways[1 - w];
      // where the front stands at each stop: half a train past the middle of the platform
      // (and the whole train on its track)
      const stops = r.stops.map((st) => Math.max(Math.min(TRAIN_LEN, r.length), Math.min(r.length, st.s + TRAIN_LEN / 2)));
      const comesIn = r.before > GOES_ON;
      const goesOn = r.after > GOES_ON;
      if (comesIn && stops.length) {
        const leg = run(stops[0], SPEED, 0);
        add({ kind: 'run', way: w, s0: 0, leg, next: 0, time: leg.time });
      }
      for (let k = 0; k < stops.length; k++) {
        const ends = k === stops.length - 1 && !goesOn;
        const starts = k === 0 && !comesIn;
        // (at an end here, it stands longer, half of it before turning and half after)
        add({ kind: 'stand', way: w, s0: stops[k], at: k, time: DWELL + (ends ? TURN / 2 : 0) + (starts ? TURN / 2 : 0) });
        if (k + 1 < stops.length) {
          const leg = run(stops[k + 1] - stops[k], 0, 0);
          add({ kind: 'run', way: w, s0: stops[k], leg, next: k + 1, time: leg.time });
        }
      }
      if (goesOn) {
        const from = stops.length ? stops[stops.length - 1] : 0;
        const leg = run(r.length + TRAIN_LEN - from, 0, SPEED);
        add({ kind: 'run', way: w, s0: from, leg, next: -1, time: leg.time });
      }
      // out past the end and back in on the other track
      const away = (goesOn ? r.after : 0) + (next.before > GOES_ON ? next.before : 0);
      if (away > 0) add({ kind: 'away', way: -1, time: away / AWAY_SPEED + TURN });
    }
    this.steps = steps;
    this.period = t;
    this.trains = Math.max(1, Math.round(t / HEADWAY));
    this.phase = phase;
    this._r = { d: 0, v: 0 };
  }

  _clock(j, t) {
    return mod(t + this.phase * this.period + (j * this.period) / this.trains, this.period);
  }

  _step(c) {
    const steps = this.steps;
    let lo = 0;
    let hi = steps.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (steps[m].t0 <= c) lo = m;
      else hi = m - 1;
    }
    return lo;
  }

  /**
   * @param {number} j
   * @param {number} t
   * @param {any} [out]
   * @returns {{ way: number, s: number, v: number, at: number, next: number, leaves: number, due: number, last: boolean }}
   */
  where(j, t, out = {}) {
    const c = this._clock(j, t);
    const k = this._step(c);
    const st = this.steps[k];
    const into = c - st.t0;
    out.way = st.way;
    out.leaves = 0;
    out.due = 0;
    out.last = false;
    if (st.kind === 'away') {
      out.s = 0;
      out.v = 0;
      out.at = -1;
      out.next = -1;
      return out;
    }
    const stops = this.pattern.ways[st.way].stops;
    if (st.kind === 'stand') {
      out.s = st.s0;
      out.v = 0;
      out.at = st.at;
      out.next = st.at;
      out.leaves = st.time - into;
    } else {
      st.leg.at(into, this._r);
      out.s = st.s0 + this._r.d;
      out.v = this._r.v;
      out.at = -1;
      out.next = st.next;
      out.due = st.next >= 0 ? st.time - into : 0;
    }
    out.last = out.next === stops.length - 1;
    return out;
  }

  // The next train each way to stand at level L after time t.
  /** @returns {Array<{ train: number, wait: number, leaves: number } | null>} */
  due(L, t) {
    return [0, 1].map((w) => {
      const stops = this.pattern.ways[w].stops;
      const k = stops.findIndex((st) => st.level === L);
      if (k < 0) return null;
      const step = this.steps.find((st) => st.kind === 'stand' && st.way === w && st.at === k);
      let best = null;
      for (let j = 0; j < this.trains; j++) {
        const c = this._clock(j, t);
        const into = c - step.t0;
        const here = into >= 0 && into < step.time;
        const wait = here ? 0 : mod(step.t0 - c, this.period);
        if (!best || wait < best.wait) best = { train: j, wait, leaves: here ? step.time - into : wait + step.time };
      }
      return best;
    });
  }
}
