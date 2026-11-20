// Where to draw someone else, from where they said they were.
//
// Everyone here says where they are a few times a second (save/worldSave.js),
// stamped with their own clock. Chasing the latest of those makes a person
// surge forward each time one lands and cut every corner. Instead they are
// drawn a moment in the past, on the line between the two things they said
// either side of that moment — the way Source draws other players. They move
// at the pace they really moved and turn where they really turned.
//
// How far in the past is worked out for each person from how late their news
// has been over the last few seconds: just far enough that there is nearly
// always a next thing they said to draw toward. Their clock and ours never
// have to agree, since only differences are compared. When news is late
// anyway they carry on the way they were going for a moment, then wait.
//
// A message from a build that doesn't stamp its time is taken as said when it
// reached us, which is nearly as good: the line's jitter gets into the pace.
//
// Times are in ms. `now` is always ours (performance.now()); `t` is theirs.
// Pure, so it can be tested with made-up times.

const LATELY = 40; // things said that count as lately: about 6 s, at one every 150 ms
const MARGIN = 30; // ms drawn further back than the latest news has needed lately
const LEAST = 100; // ms: never drawn closer than this behind the freshest they could be…
const MOST = 1000; // ms: …nor further than this, however bad the line
const FIRST = 250; // ms behind, before anything is known about the line
const SLOWER = 0.2; // how much slower than they really went they may be drawn, while falling further behind
const FASTER = 0.08; // how much faster, while catching up
const PAUSE = 1000; // ms: a gap this long in their own clock is them stopping (a hidden tab), not a slow line
const AHEAD = 250; // ms they carry on the way they were going when news is late, before waiting
const KEEP = 64; // things said, at most, held for one person (the game may not be drawing)

// m/s: faster than anything carries anyone (an eagle flat out is 20), so
// between two places this far apart they jumped rather than went.
export const LEAP = 60;

export class Track {
  constructor() {
    this.said = []; // { t, x, z, yaw }, oldest first
    this.timed = null; // whether `t` is their clock (true) or when it reached us (false)
    this.behind = NaN; // ms: our now, less the moment of theirs being drawn
    this.lately = []; // { late, need } for the last LATELY things said (see hear)
    this.need = -Infinity; // ms: the most `need` lately; how far back to draw them never to run out
    this.floor = Infinity; // ms: the least `late` lately; how far back the freshest they could be is
    this.drawn = NaN; // our now, when last drawn
  }

  // They said they were at (x, z) facing `yaw` at `t` on their clock
  // (undefined from a build that doesn't say), and it reached us at `now`.
  hear(x, z, yaw, t, now) {
    const timed = Number.isFinite(t);
    if (!timed) t = now;
    let last = this.said[this.said.length - 1];
    // A different clock (someone else on the id, or a different build): start over.
    if (timed !== this.timed || (last && t < last.t)) {
      this.#restart(timed);
      last = undefined;
    }
    if (last && t === last.t) {
      Object.assign(last, { x, z, yaw });
      return;
    }
    // late: how far behind this was when it came, clocks and wire together.
    // need: just before it came the newest thing we had was last.t, so to be
    // drawn that far behind is never to run out. A long gap in their own
    // clock is them stopping, though, and says nothing about the line.
    const need = last && t - last.t < PAUSE ? now - last.t : -Infinity;
    this.lately.push({ late: now - t, need });
    if (this.lately.length > LATELY) this.lately.shift();
    this.need = -Infinity;
    this.floor = Infinity;
    for (const l of this.lately) {
      if (l.need > this.need) this.need = l.need;
      if (l.late < this.floor) this.floor = l.late;
    }
    if (Number.isNaN(this.behind)) this.behind = now - t + FIRST;
    this.said.push({ t, x, z, yaw });
    if (this.said.length > KEEP) this.said.shift();
  }

  // Where to draw them at `now`, into out { x, z, yaw }. -> out
  at(now, out) {
    const s = this.said;
    const want = Math.min(this.floor + MOST, Math.max(this.floor + LEAST, this.need + MARGIN));
    const dt = Number.isNaN(this.drawn) ? 0 : now - this.drawn;
    this.drawn = now;
    this.behind += Math.max(-FASTER * dt, Math.min(SLOWER * dt, want - this.behind));
    const r = now - this.behind; // the moment of theirs to draw

    while (s.length > 2 && s[1].t <= r) s.shift();
    const a = s[0];
    const b = s[1];
    if (r <= a.t) return put(out, a.x, a.z, a.yaw); // before anything they said: where they first were
    if (b && r < b.t) {
      if (apart(a, b)) return put(out, a.x, a.z, a.yaw);
      const u = (r - a.t) / (b.t - a.t);
      return put(out, a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u, a.yaw + turn(a.yaw, b.yaw) * u);
    }
    // News is late: carry on the way they were going, for a moment.
    const last = b || a;
    if (!b || apart(a, b)) return put(out, last.x, last.z, last.yaw);
    const k = Math.min(r - b.t, AHEAD) / (b.t - a.t);
    return put(out, b.x + (b.x - a.x) * k, b.z + (b.z - a.z) * k, b.yaw);
  }

  #restart(timed) {
    this.said.length = 0;
    this.timed = timed;
    this.behind = NaN;
    this.lately.length = 0;
  }
}

// Nothing to draw between two things said: they stopped telling for a while
// (whatever happened then wasn't seen), or they jumped somewhere else.
function apart(a, b) {
  const ms = b.t - a.t;
  return ms >= PAUSE || Math.hypot(b.x - a.x, b.z - a.z) > (LEAP * ms) / 1000;
}

function put(out, x, z, yaw) {
  out.x = x;
  out.z = z;
  out.yaw = yaw;
  return out;
}

// The shorter way round from one heading to another, in radians.
export function turn(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
