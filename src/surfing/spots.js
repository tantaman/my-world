// Where the surf is: the breaks along the coast, grown from the seed.
//
// Read off the land, never written into it: nothing here changes what the
// seed grows, so no cabin moves when a break turns up off the beach below it.
// The world is cut into squares SURF.cell on a side, and a square holds one
// break or none: the best stretch of its coast for waves, if it has one good
// enough. That is a beach the sea comes in onto from a long way off (the
// fetch: how far the open water goes out in front of it, which is what makes
// the waves big or small), with nothing standing in the way out to sea for
// a few hundred metres, a seabed that shoals evenly toward the shore, and a
// run of shore either side of it long enough to ride along.
//
// What the break is like is worked out from what is there: how big the waves
// come in (the longer the fetch, the bigger and the longer between them), how
// fast they peel (the steeper the seabed, the hollower and quicker), and
// which way: where the shore runs on a good way to one side only, it's a
// point, and the waves peel that way, a left or a right as a surfer riding
// it would call it; otherwise it's a peak, and peels both ways.
//
// A square a real place brought in from a photo reaches any of has no break
// (keepOff: world/landforms.js reaches): told from the hikes' cards alone, so
// a square's break never waits on, or changes with, a hike's land arriving.
//
// No three.js in here: the tests read it.
//
// A break (spot()):
//   id, i, j       'surf:3:-1', and its square
//   name, kind     'Kelp Point', and 'left', 'right' or 'peak'
//   x, z           its point on the shore, where the peak breaks in to
//   nx, nz         the way out to sea there
//   beach          { x, z }: dry sand behind it, to stand on and watch
//   fetch          m of open water out in front of it
//   and what world/breakers.js is handed: span, shore, far, depth, size,
//   period, peel, reach, seed

import { mulberry32, hash2i, smoothstep } from '../noise.js';
import { SHORE_N, DEPTH_N } from '../world/breakers.js';

export const SURF = {
  cell: 1536, // m: one break at most to a square this size
  inset: 250, // m: a break's point is at least this far inside its square
  step: 16, // m between the spots on its shore looked at
  shoreline: 0.6, // m either side of the sea's level that counts as the shore
  clear: { out: [12, 25, 40, 60, 90, 130, 180], deep: 0.4 }, // m out that must be open water, this deep
  fetch: { rays: [-0.4, -0.2, 0, 0.2, 0.4], least: 700, most: 7000, step: 100, shoal: -3 }, // rad either side, m
  span: 200, // m either side along the shore that a break's shore table reaches
  shore: [-70, 110, 2], // m along the way out to look for the shore, and how finely
  deepest: 10, // m: waves come in from where the sea is this deep...
  far: [70, 200], // ...but from no nearer or further out than this (m)
  slope: [0.012, 0.36], // how steeply the seabed may shoal (m down per m out)
  // Where the seabed drops away faster than this (m down per m out), the
  // waves come in as if over a bar of sand no steeper, so they break far
  // enough out to ride rather than on the sand. (Deep enough by then that
  // it's hard to see the bottom: the sea's own seabed is mostly steep.)
  bar: 0.07,
  tidy: 6, // m the shore may wander off a straight line (rms) and still be ridden along
  fade: 40, // m at the ends of where it breaks that the waves die away (breakers.js BREAKER.fade)
  ride: 90, // m along the shore it must break, the least
  point: { ratio: 1.7, back: 22 }, // one side this much longer than the other: a point; m it breaks back the other way
  // what the waves are like: m high, s apart, m/s peeling
  size: [1.4, 2.8],
  period: [8, 13],
  peel: [5.5, 8],
};

// What a break is called: something you'd see there, and what sort of break.
// The first goes round on a lattice (the square's i + 4j, of 16), so no two
// squares within three of each other either way share one.
const WORDS = ['Driftwood', 'Kelp', 'Seal', 'Gull', 'Shell', 'Cormorant', 'Otter', 'Tern', 'Spindrift', 'Sandpiper', 'Heron', 'Osprey', 'Whale', 'Barnacle', 'Mussel', 'Plover'];
const SORTS = { peak: ['Beach', 'Sands', 'Strand', 'Peak'], left: ['Point', 'Head', 'Reef', 'Rocks'], right: ['Point', 'Head', 'Reef', 'Rocks'] };
const wrap = (k, n) => ((k % n) + n) % n;
export function spotName(seed, i, j, kind) {
  const s = SORTS[kind];
  return `${WORDS[wrap(i + j * 4 + seed, WORDS.length)]} ${s[wrap(i * 3 + j + (seed >> 3), s.length)]}`;
}
const SALT = 0x5a4f;

export class SurfSpots {
  // gen: the WorldGen; keepOff(x0, z0, x1, z1): is any of that somewhere no
  // break may be (a real place's reach)?
  constructor(gen, { keepOff = () => false } = {}) {
    this.gen = gen;
    this.keepOff = keepOff;
    this.cells = new Map(); // "i:j" -> break or null
    this.level = gen.sea ? gen.sea.level : null;
  }

  // The break in square (i, j), or null (worked out the first time it's asked).
  cell(i, j) {
    const k = `${i}:${j}`;
    if (!this.cells.has(k)) this.cells.set(k, this._look(i, j));
    return this.cells.get(k);
  }

  // ...or undefined if it hasn't been worked out yet.
  known(i, j) {
    return this.cells.get(`${i}:${j}`);
  }

  // The square (i, j) a point is in.
  static square(x, z) {
    return [Math.floor(x / SURF.cell), Math.floor(z / SURF.cell)];
  }

  // The break with this id, or null.
  byId(id) {
    const m = /^surf:(-?\d+):(-?\d+)$/.exec(String(id));
    return m ? this.cell(Number(m[1]), Number(m[2])) : null;
  }

  // Breaks already worked out whose points are in a rectangle of the world.
  within(x0, z0, x1, z1) {
    const C = SURF.cell;
    const out = [];
    for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) {
      for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) {
        const s = this.known(i, j);
        if (s && s.x >= x0 && s.x <= x1 && s.z >= z0 && s.z <= z1) out.push(s);
      }
    }
    return out;
  }

  // How far above the sea the land is at (x, z) (m): the forest's own land,
  // as broad as the water sees it.
  _up(x, z) {
    return this.gen.forestHeight(x, z, 0) - this.level;
  }

  _look(i, j) {
    if (this.level === null) return null;
    const C = SURF.cell;
    const pad = SURF.span + SURF.far[1];
    if (this.keepOff(i * C - pad, j * C - pad, (i + 1) * C + pad, (j + 1) * C + pad)) return null;
    let best = null;
    const lo = SURF.inset;
    const hi = C - SURF.inset;
    for (let z = j * C + lo; z <= j * C + hi; z += SURF.step) {
      for (let x = i * C + lo; x <= i * C + hi; x += SURF.step) {
        const c = this._candidate(x, z);
        if (c && (!best || c.score > best.score)) best = c;
      }
    }
    return best ? this._spot(i, j, best) : null;
  }

  // A spot on the shore at (x, z), and how good a break it would be: or null.
  _candidate(x, z) {
    const up = this._up(x, z);
    if (Math.abs(up) > SURF.shoreline) return null;
    const gx = this._up(x + 4, z) - this._up(x - 4, z);
    const gz = this._up(x, z + 4) - this._up(x, z - 4);
    const g = Math.hypot(gx, gz);
    if (g < 1e-3) return null;
    const nx = -gx / g;
    const nz = -gz / g;
    // open water straight out
    for (const u of SURF.clear.out) if (-this._up(x + nx * u, z + nz * u) < SURF.clear.deep) return null;
    // and a long way of it in front
    const fetch = this._fetch(x, z, nx, nz);
    if (fetch < SURF.fetch.least) return null;
    // the shore either side
    const sh = this._shore(x, z, nx, nz);
    if (!sh) return null;
    // (and straight out from the peak's own point on the shore, which a rocky
    // coast can have behind a rock the spot looked from hadn't)
    for (const u of SURF.clear.out) if (-this._up(sh.x + nx * u, sh.z + nz * u) < SURF.clear.deep) return null;
    const ride = sh.reach[0] + sh.reach[1];
    if (ride < SURF.ride + 2 * SURF.fade) return null;
    // how steeply the seabed shoals (a line through the shore, fitted)
    const prof = this._profile(sh.x, sh.z, nx, nz, sh.shore);
    if (!prof) return null;
    const score = Math.min(fetch, SURF.fetch.most) / 2500 - Math.abs(Math.log(prof.slope / 0.05)) * 0.6 - sh.wander / SURF.tidy + Math.min(ride, 300) / 300;
    return { x: sh.x, z: sh.z, nx, nz, fetch, ...sh, ...prof, score };
  }

  // m of open water out in front of (x, z), the least of a fan of looks.
  _fetch(x, z, nx, nz) {
    const F = SURF.fetch;
    let least = Infinity;
    for (const a of F.rays) {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const dx = nx * c - nz * s;
      const dz = nx * s + nz * c;
      let d = 300;
      while (d < F.most && this._up(x + dx * d, z + dz * d) < F.shoal) d += F.step;
      least = Math.min(least, d);
      if (least < F.least) break;
    }
    return least;
  }

  // Where the shore is either side of (x, z), facing out along n: how far out
  // (m along n) at each of SHORE_N steps from -span to +span along it, how
  // far along it runs on either side, how much it wanders, and the point on
  // the shore straight in front, where the peak is. Or null.
  _shore(x, z, nx, nz) {
    const b = SURF.shore[1];
    const tx = -nz;
    const tz = nx;
    const S = SURF.span;
    const raw = [];
    for (let k = 0; k < SHORE_N; k++) {
      const v = -S + (2 * S * k) / (SHORE_N - 1);
      const px = x + tx * v;
      const pz = z + tz * v;
      // the furthest land out along this line, and open water out past it
      const edge = this._edge(px, pz, nx, nz);
      if (edge !== null && -this._up(px + nx * b, pz + nz * b) > SURF.clear.deep && -this._up(px + nx * (edge + 30), pz + nz * (edge + 30)) > SURF.clear.deep) raw.push(edge);
      else raw.push(null);
    }
    const mid = (SHORE_N - 1) / 2;
    const k0 = Math.floor(mid);
    if (raw[k0] === null || raw[k0 + 1] === null) return null;
    // how far it goes on unbroken either side of the middle
    let l = k0;
    while (l > 0 && raw[l - 1] !== null && Math.abs(raw[l - 1] - raw[l]) < 25) l--;
    let r = k0 + 1;
    while (r < SHORE_N - 1 && raw[r + 1] !== null && Math.abs(raw[r + 1] - raw[r]) < 25) r++;
    const step = (2 * S) / (SHORE_N - 1);
    // the peak on the shore straight in front (its offset is the table's zero)
    const e0 = this._edge(x, z, nx, nz) ?? (raw[k0] + raw[k0 + 1]) / 2;
    const shore = new Float32Array(SHORE_N);
    for (let k = 0; k < SHORE_N; k++) {
      const kk = Math.max(l, Math.min(r, k));
      shore[k] = raw[kk] - e0;
    }
    // smoothed once, so the crests don't kink
    const sm = Float32Array.from(shore, (e, k) => (shore[Math.max(0, k - 1)] + 2 * e + shore[Math.min(SHORE_N - 1, k + 1)]) / 4);
    // how much it wanders off the straight line through it
    let n = 0;
    let sv = 0;
    let se = 0;
    let svv = 0;
    let sve = 0;
    for (let k = l; k <= r; k++) {
      const v = -S + k * step;
      n++;
      sv += v;
      se += sm[k];
      svv += v * v;
      sve += v * sm[k];
    }
    const slope = (n * sve - sv * se) / Math.max(1e-6, n * svv - sv * sv);
    const icpt = (se - slope * sv) / n;
    let w2 = 0;
    for (let k = l; k <= r; k++) w2 += (sm[k] - (icpt + slope * (-S + k * step))) ** 2;
    const wander = Math.sqrt(w2 / n);
    if (wander > SURF.tidy) return null;
    const reach = [Math.max(0, mid - l) * step, Math.max(0, r - mid) * step];
    return { x: x + nx * e0, z: z + nz * e0, shore: sm, reach, wander };
  }

  // How far out along n from (x, z) the furthest land is, where the water
  // starts: or null.
  _edge(x, z, nx, nz) {
    const [a, b, by] = SURF.shore;
    let edge = null;
    let prev = this._up(x + nx * a, z + nz * a);
    for (let u = a + by; u <= b; u += by) {
      const h = this._up(x + nx * u, z + nz * u);
      if (prev >= 0 && h < 0) edge = u - by + (by * prev) / (prev - h);
      prev = h;
    }
    return edge;
  }

  // How deep the sea gets going out from the shore: the middle of three
  // lines out (at the peak and either side), each from where its own shore is.
  _profile(x, z, nx, nz, shore) {
    const tx = -nz;
    const tz = nx;
    const S = SURF.span;
    const at = (v) => shore[Math.round(((v + S) / (2 * S)) * (SHORE_N - 1))];
    const lines = [-50, 0, 50].map((v) => ({ v, e: at(v) }));
    const deep = (u) => {
      const ds = lines.map(({ v, e }) => -this._up(x + tx * v + nx * (e + u), z + tz * v + nz * (e + u))).sort((p, q) => p - q);
      return ds[1];
    };
    // how steeply it really shoals, fitted over the first stretch out
    let a = 0;
    let b = 0;
    for (let u = 10; u <= 120; u += 10) {
      a += deep(u) * u;
      b += u * u;
    }
    const slope = a / b;
    if (slope < SURF.slope[0] || slope > SURF.slope[1]) return null;
    // as the waves have it: no steeper than a bar, and never shallower going
    // out than further in (a wave breaks once)
    const bed = (u) => Math.min(deep(u), SURF.bar * u);
    // waves come in from where it's deep enough, or as far as that
    let far = SURF.far[1];
    for (let u = SURF.far[0]; u <= SURF.far[1]; u += 10) {
      if (bed(u) >= SURF.deepest) {
        far = u;
        break;
      }
    }
    const depth = new Float32Array(DEPTH_N);
    for (let k = 1; k < DEPTH_N; k++) depth[k] = Math.max(depth[k - 1], bed((far * k) / (DEPTH_N - 1)), 0.01 * k);
    return { far, depth, slope };
  }

  // The break, from the best spot in square (i, j).
  _spot(i, j, c) {
    const seed = hash2i(i, j, this.gen.seed ^ SALT);
    const r = mulberry32(seed);
    const S = SURF;
    const f = smoothstep(S.fetch.least, S.fetch.most, c.fetch);
    const size = (S.size[0] + (S.size[1] - S.size[0]) * f) * (0.88 + 0.24 * r());
    const period = S.period[0] + (S.period[1] - S.period[0]) * f + r() - 0.5;
    const peel = S.peel[0] + (S.peel[1] - S.peel[0]) * smoothstep(0.04, 0.25, c.slope) + (r() - 0.5) * 0.6;
    // a point, if the shore runs on much further one way: it peels that way
    let [back, go] = c.reach.map((m) => Math.max(0, m - S.fade));
    let kind = 'peak';
    if (go > back * S.point.ratio) {
      back = Math.min(back, S.point.back);
      kind = 'left'; // peels toward +v: to the left of a surfer looking in at the beach
    } else if (back > go * S.point.ratio) {
      go = Math.min(go, S.point.back);
      kind = 'right';
    }
    // dry sand behind it to stand on
    let bx = c.x;
    let bz = c.z;
    for (let d = 2; d <= 40; d += 2) {
      bx = c.x - c.nx * d;
      bz = c.z - c.nz * d;
      if (this._up(bx, bz) > 0.8) break;
    }
    const round = (v) => Math.round(v * 1000) / 1000;
    return {
      id: `surf:${i}:${j}`,
      i,
      j,
      name: spotName(this.gen.seed, i, j, kind),
      kind,
      x: c.x,
      z: c.z,
      nx: c.nx,
      nz: c.nz,
      beach: { x: bx, z: bz },
      fetch: c.fetch,
      span: S.span,
      shore: c.shore,
      far: c.far,
      depth: c.depth,
      slope: round(c.slope),
      size: round(size),
      period: round(period),
      peel: round(peel),
      reach: [round(back), round(go)],
      seed,
    };
  }
}
