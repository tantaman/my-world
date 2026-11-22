// The circuits a race track can be laid out as, and what a circuit is: the
// line round it, sampled every STEP metres, and the questions everything
// else asks of it (where along the lap a point is, how far off the line,
// whether it's inside the loop, how tight the bend is).
//
// A layout is drawn in the track's own frame (landmarks/sites.js toWorld):
// the main straight runs along +x at the +z side, the side nearest the town,
// where the grandstand and the pits are. Cars go round anticlockwise seen
// from above, so most bends are left-handers and the infield is on the
// left. The line is a closed curve through `pts` (centripetal Catmull-Rom),
// and s = 0 is the start and finish line, on the main straight at `start`.
//
//   label     what it's called on the map ('dirt oval')
//   surface   'dirt' or 'asphalt': its colour and how well the tyres hold
//   half      half the width of the racing surface (m)
//   pts       [[x, z], ...] round it, anticlockwise, from the main straight
//   start     x of the start line on the main straight
//
// No three.js in here: the tests read it.

export const STEP = 2; // m between the samples along the line
export const KERB = 1.2; // m of kerb outside the racing surface, each side
export const RUNOFF = 6; // m of grass past the kerb, out to the barrier
// The barrier, from the line: the racing surface, its kerb and the run-off.
export const barrierOf = (layout) => layout.half + KERB + RUNOFF;

// A stadium: straights from -a to a along x at z = ±r, joined by half
// circles of radius r. -> pts, anticlockwise from the main straight (+z),
// with front(x) moving the front straight out (a tri-oval's dog-leg).
function stadium(a, r, front = () => 0) {
  const pts = [];
  for (let x = -a; x < a; x += 20) pts.push([x, r + front(x)]);
  for (let k = 0; k < 12; k++) {
    const t = Math.PI / 2 - (k / 12) * Math.PI;
    pts.push([a + Math.cos(t) * r, Math.sin(t) * r]);
  }
  for (let x = a; x > -a; x -= 20) pts.push([x, -r]);
  for (let k = 0; k < 12; k++) {
    const t = -Math.PI / 2 - (k / 12) * Math.PI;
    pts.push([-a + Math.cos(t) * r, Math.sin(t) * r]);
  }
  return pts;
}

export const LAYOUTS = {
  oval: {
    label: 'dirt oval',
    surface: 'dirt',
    half: 8,
    pts: stadium(80, 46),
    start: 20,
  },
  trioval: {
    label: 'dirt tri-oval',
    surface: 'dirt',
    half: 8,
    pts: stadium(84, 44, (x) => 12 * Math.max(0, 1 - Math.abs(x) / 84)),
    start: 30,
  },
  kidney: {
    label: 'road circuit',
    surface: 'asphalt',
    half: 6,
    // a long main straight, a sweeping right-hand end, a back straight with
    // a kink in it that tightens into a left, and a long left to come home
    pts: [
      [-100, 62],
      [-40, 64],
      [20, 64],
      [80, 60],
      [118, 44],
      [134, 14],
      [126, -22],
      [100, -44],
      [62, -50],
      [32, -38],
      [8, -18],
      [-22, -20],
      [-52, -40],
      [-86, -50],
      [-120, -40],
      [-138, -10],
      [-134, 28],
    ],
    start: 10,
  },
  hairpin: {
    label: 'road circuit',
    surface: 'asphalt',
    half: 6,
    // the main straight into a fast left, down the far side through an
    // S-bend, a hairpin at the bottom, and back up the infield straight
    // into a long left onto the main straight again
    pts: [
      [-90, 66],
      [-20, 68],
      [50, 66],
      [104, 56],
      [132, 28],
      [130, -4],
      [104, -18],
      [80, -10],
      [56, -24],
      [50, -50],
      [26, -64],
      [0, -52],
      [-8, -28],
      [-30, -14],
      [-70, -22],
      [-108, -14],
      [-130, 14],
      [-124, 46],
    ],
    start: 0,
  },
};
// Which layouts suit each style of town (towns/kinds.js STYLES).
export const FOR_STYLE = { western: ['oval', 'trioval'], village: ['kidney', 'hairpin'] };

// A point on the closed centripetal Catmull-Rom through p0 p1 p2 p3, t from
// 0 (p1) to 1 (p2).
function catmull(p0, p1, p2, p3, t, out) {
  const d = (a, b) => Math.max(1e-6, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  const t0 = 0;
  const t1 = t0 + d(p0, p1);
  const t2 = t1 + d(p1, p2);
  const t3 = t2 + d(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const lerp = (a, b, ta, tb) => {
    const k = (u - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = [a1[0] + (a2[0] - a1[0]) * ((u - t0) / (t2 - t0)), a1[1] + (a2[1] - a1[1]) * ((u - t0) / (t2 - t0))];
  const b2 = [a2[0] + (a3[0] - a2[0]) * ((u - t1) / (t3 - t1)), a2[1] + (a3[1] - a2[1]) * ((u - t1) / (t3 - t1))];
  const k = (u - t1) / (t2 - t1);
  out[0] = b1[0] + (b2[0] - b1[0]) * k;
  out[1] = b1[1] + (b2[1] - b1[1]) * k;
  return out;
}

const BUCKET = 16; // m, the side of the squares the samples are filed in, to find the nearest quickly
const SMOOTH_K = 3; // samples either side the curvature is averaged over

// A layout's line, sampled every STEP m from the start line round.
//   n, length       how many samples, and how long a lap is (m)
//   x, z            each sample, in the track's frame
//   tx, tz          the way the line runs there (a unit vector)
//   k               how sharply it bends (1/m, + to the left)
//   half, barrier   half the racing surface's width; the barrier's distance
//   box             [x0, z0, x1, z1] round the barrier
export class Circuit {
  constructor(layout) {
    this.layout = layout;
    this.half = layout.half;
    this.barrier = barrierOf(layout);
    // the curve, finely, then evened out to STEP apart
    const P = layout.pts;
    const fine = [];
    const q = [0, 0];
    for (let i = 0; i < P.length; i++) {
      const p0 = P[(i - 1 + P.length) % P.length];
      const p1 = P[i];
      const p2 = P[(i + 1) % P.length];
      const p3 = P[(i + 2) % P.length];
      for (let j = 0; j < 24; j++) {
        catmull(p0, p1, p2, p3, j / 24, q);
        fine.push([q[0], q[1]]);
      }
    }
    // start from the start line: the fine point on the main straight nearest it
    let first = 0;
    let bd = Infinity;
    const top = Math.max(...P.map((p) => p[1]));
    fine.forEach(([x, z], i) => {
      const d = Math.abs(x - layout.start) + Math.abs(z - top) * 0.2;
      if (d < bd && z > top - 30) [first, bd] = [i, d];
    });
    const ring = fine.slice(first).concat(fine.slice(0, first));
    let total = 0;
    const seg = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      seg.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
      total += seg[i];
    }
    const n = Math.round(total / STEP);
    this.n = n;
    this.length = total;
    this.step = total / n;
    this.x = new Float64Array(n);
    this.z = new Float64Array(n);
    let i = 0;
    let along = 0; // where ring[i] is
    for (let k = 0; k < n; k++) {
      const want = k * this.step;
      while (along + seg[i] < want && i < ring.length - 1) along += seg[i++];
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const t = seg[i] > 0 ? (want - along) / seg[i] : 0;
      this.x[k] = a[0] + (b[0] - a[0]) * t;
      this.z[k] = a[1] + (b[1] - a[1]) * t;
    }
    // the way it runs, and how it bends
    this.tx = new Float64Array(n);
    this.tz = new Float64Array(n);
    this.k = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const a = (k - 1 + n) % n;
      const b = (k + 1) % n;
      const dx = this.x[b] - this.x[a];
      const dz = this.z[b] - this.z[a];
      const l = Math.hypot(dx, dz);
      this.tx[k] = dx / l;
      this.tz[k] = dz / l;
    }
    const raw = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const b = (k + 1) % n;
      // the turn from this heading to the next, over a step (+: left, as yaw grows)
      const h0 = Math.atan2(this.tx[k], this.tz[k]);
      const h1 = Math.atan2(this.tx[b], this.tz[b]);
      raw[k] = Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0)) / this.step;
    }
    for (let k = 0; k < n; k++) {
      let sum = 0;
      for (let j = -SMOOTH_K; j <= SMOOTH_K; j++) sum += raw[(k + j + n) % n];
      this.k[k] = sum / (2 * SMOOTH_K + 1);
    }
    // the box round the barrier, and the samples filed by square
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (let k = 0; k < n; k++) {
      x0 = Math.min(x0, this.x[k]);
      x1 = Math.max(x1, this.x[k]);
      z0 = Math.min(z0, this.z[k]);
      z1 = Math.max(z1, this.z[k]);
    }
    const B = this.barrier;
    this.box = [x0 - B, z0 - B, x1 + B, z1 + B];
    this.buckets = new Map();
    for (let k = 0; k < n; k++) {
      const key = `${Math.floor(this.x[k] / BUCKET)}:${Math.floor(this.z[k] / BUCKET)}`;
      let list = this.buckets.get(key);
      if (!list) this.buckets.set(key, (list = []));
      list.push(k);
    }
  }

  // s wrapped into [0, length)
  wrap(s) {
    const L = this.length;
    return ((s % L) + L) % L;
  }

  // Where the line is at s round the lap: out.x, out.z, out.tx, out.tz, out.k
  // (in the track's frame), lat metres to the left of it.
  at(s, out = {}, lat = 0) {
    const f = this.wrap(s) / this.step;
    const a = Math.floor(f) % this.n;
    const b = (a + 1) % this.n;
    const t = f - Math.floor(f);
    let tx = this.tx[a] + (this.tx[b] - this.tx[a]) * t;
    let tz = this.tz[a] + (this.tz[b] - this.tz[a]) * t;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    out.tx = tx;
    out.tz = tz;
    out.k = this.k[a] + (this.k[b] - this.k[a]) * t;
    // left of the way it runs: (tz, -tx)
    out.x = this.x[a] + (this.x[b] - this.x[a]) * t + tz * lat;
    out.z = this.z[a] + (this.z[b] - this.z[a]) * t - tx * lat;
    return out;
  }

  // The bend at s (1/m, + to the left).
  bend(s) {
    const f = this.wrap(s) / this.step;
    const a = Math.floor(f) % this.n;
    const b = (a + 1) % this.n;
    const t = f - Math.floor(f);
    return this.k[a] + (this.k[b] - this.k[a]) * t;
  }

  // The nearest point of the line to (x, z), in the track's frame: out.s
  // round the lap, out.lat metres to the left of it, out.d how far (|lat|).
  // With a hint (an s near the answer, last frame's), only the samples
  // within `span` metres of it either way are looked at; without one, the
  // samples filed near the point (and all of them if none are).
  locate(x, z, out = {}, hint = null, span = 40) {
    let best = -1;
    let bd = Infinity;
    const look = (k) => {
      const d = (this.x[k] - x) ** 2 + (this.z[k] - z) ** 2;
      if (d < bd) [best, bd] = [k, d];
    };
    if (hint !== null) {
      const c = Math.round(this.wrap(hint) / this.step);
      const m = Math.ceil(span / this.step);
      for (let j = -m; j <= m; j++) look((c + j + this.n * 4) % this.n);
    } else {
      const bi = Math.floor(x / BUCKET);
      const bj = Math.floor(z / BUCKET);
      for (let r = 0; r <= 3 && best < 0; r++) {
        for (let j = bj - r; j <= bj + r; j++) {
          for (let i = bi - r; i <= bi + r; i++) {
            if (Math.max(Math.abs(i - bi), Math.abs(j - bj)) !== r) continue;
            const list = this.buckets.get(`${i}:${j}`);
            if (list) for (const k of list) look(k);
          }
        }
        // (one ring further: a nearer sample may be filed just past the first found)
        if (best >= 0 && r < 3) {
          for (let j = bj - r - 1; j <= bj + r + 1; j++) {
            for (let i = bi - r - 1; i <= bi + r + 1; i++) {
              if (Math.max(Math.abs(i - bi), Math.abs(j - bj)) !== r + 1) continue;
              const list = this.buckets.get(`${i}:${j}`);
              if (list) for (const k of list) look(k);
            }
          }
        }
      }
      if (best < 0) for (let k = 0; k < this.n; k++) look(k);
    }
    // between that sample and whichever neighbour is nearer
    const n = this.n;
    const a = best;
    let s = a * this.step;
    const px = x - this.x[a];
    const pz = z - this.z[a];
    const along = px * this.tx[a] + pz * this.tz[a];
    s += along;
    const lat = px * this.tz[a] - pz * this.tx[a] - 0; // left of the way it runs
    out.s = this.wrap(s);
    out.lat = lat;
    out.d = Math.abs(lat);
    out.i = a % n;
    return out;
  }

  // Whether (x, z) is inside the loop (the infield), in the track's frame.
  inside(x, z) {
    let inside = false;
    const n = this.n;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = this.x[i];
      const zi = this.z[i];
      const xj = this.x[j];
      const zj = this.z[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }

  // Whether (x, z) is on the track's grounds: inside the barrier, or in the
  // infield, `margin` metres more all round. (The track's frame.)
  within(x, z, margin = 0) {
    const b = this.box;
    if (x < b[0] - margin || x > b[2] + margin || z < b[1] - margin || z > b[3] + margin) return false;
    if (this.inside(x, z)) return true;
    return this.locate(x, z, _near).d <= this.barrier + margin;
  }

  // The tightest bend (m, its radius) and the nearest two parts of the line
  // that aren't next to each other come (m), for the tests.
  get tightest() {
    let k = 0;
    for (let i = 0; i < this.n; i++) k = Math.max(k, Math.abs(this.k[i]));
    return 1 / k;
  }
  closest(apart = 60) {
    let best = Infinity;
    const m = Math.ceil(apart / this.step);
    for (let i = 0; i < this.n; i += 2) {
      for (let j = i + m; j < this.n; j += 2) {
        if (this.n - (j - i) < m) continue;
        best = Math.min(best, Math.hypot(this.x[i] - this.x[j], this.z[i] - this.z[j]));
      }
    }
    return best;
  }
}
const _near = {};

// Circuits made once for each layout, and shared: they're the same everywhere.
const made = new Map();
export function circuitOf(name) {
  let c = made.get(name);
  if (!c) made.set(name, (c = new Circuit(LAYOUTS[name])));
  return c;
}
