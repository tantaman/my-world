// The Metro's track and stations as the game has them: what the importer
// wrote (tools/metro.mjs: system.js, fetched; metro.js, small) read back into
// the world's own coordinates, and the questions asked of them: where along a
// service's track is a point, and what's there.
//
//   const net = new Network(system, { at: card.at, offset: land.offset, metro: METRO });
//   net.tracks     each run of track once: x, y (the rail's top), z per point,
//                  s (m along), kind of each stretch (TUNNEL, BRIDGE, GROUND)
//   net.levels     each station's levels: where its platforms are, how high
//   net.stations   each station: its name, lines, levels and entrances
//   net.patterns   each service, as its two ways: { line, ways: [route, route] }
//   pointAt(route, s, out)   where along a route (a way of a service) s m is
//   onLevel(level, x, z, out) how far along and across a level (x, z) is
//
// No three.js in here.

// m: half a platform's length (600 feet, for an eight-car train)
export const PLATFORM_HALF = 91.5;
// m: a platform's floor over the top of the rail (the cars' floor)
export const PLATFORM_UP = 1.1;
// m from the middle of a track to the edge of a platform beside it
export const EDGE = 1.6;
// A tunnel's tube, over the rail (m): its crown and half its width; and a
// station's vault, over the rail at its crown
export const TUBE = { top: 5.6, half: 2.4, vault: 10 };
// What a stretch of track runs in or on.
export const TUNNEL = 0;
export const BRIDGE = 1;
export const GROUND = 2;
const KINDS = ['tunnel', 'bridge', 'ground'];

// The system as written: base64 of deflated JSON.
export async function readSystem(base64, inflate) {
  const bytes = await inflate(base64);
  return JSON.parse(new TextDecoder().decode(bytes));
}

export class Network {
  constructor(sys, { at = [0, 0], offset = 0, metro }) {
    const [cx, cz] = at;
    this.at = at;
    this.offset = offset;
    this.lines = metro.lines.map((l, k) => ({ ...l, index: k }));
    this.tracks = sys.tracks.map((t, k) => {
      const n = t.pts.length / 3;
      const x = new Float64Array(n);
      const y = new Float64Array(n);
      const z = new Float64Array(n);
      const s = new Float64Array(n);
      let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (let i = 0; i < n; i++) {
        x[i] = cx + t.pts[i * 3];
        z[i] = cz + t.pts[i * 3 + 1];
        y[i] = t.pts[i * 3 + 2] + offset;
        if (i) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
        [x0, z0, x1, z1] = [Math.min(x0, x[i]), Math.min(z0, z[i]), Math.max(x1, x[i]), Math.max(z1, z[i])];
      }
      return { k, x, y, z, s, kind: Uint8Array.from(t.kinds), n, length: s[n - 1], box: [x0, z0, x1, z1] };
    });
    this.stations = metro.stations.map((st, k) => ({
      k,
      id: st.id,
      name: st.name,
      lines: st.lines,
      kind: st.kind,
      entrances: st.entrances.map(([ex, ez, yaw, street], i) => ({ i, x: cx + ex, z: cz + ez, yaw, street })),
      levels: [],
    }));
    this.levels = sys.levels.map((L, k) => {
      const level = {
        k,
        station: this.stations[L.station],
        kind: L.kind,
        what: KINDS[L.kind],
        x: cx + L.x,
        z: cz + L.z,
        dx: L.dx,
        dz: L.dz,
        rail: L.rail + offset,
        floor: L.rail + offset + PLATFORM_UP,
        a0: L.a[0],
        a1: L.a[1],
        tracks: L.tracks,
        platforms: L.platforms.map(([c0, c1, a0, a1]) => ({ c0, c1, a0, a1 })),
        lines: L.lines.map((i) => this.lines[i].id),
      };
      level.station.levels.push(level);
      return level;
    });
    this.patterns = sys.patterns.map((p, k) => {
      const line = this.lines[p.line];
      const ways = p.ways.map((w) => this._route(w, line));
      return { k, line, ways };
    });
    this.routes = this.patterns.flatMap((p) => p.ways);
  }

  // A way of a service: its tracks end to end, as one run of points.
  _route(w, line) {
    const xs = [];
    const ys = [];
    const zs = [];
    const kinds = [];
    // each piece of its path: a track, from one of its points to another
    for (const [k, i0, i1] of w.path) {
      const t = this.tracks[k];
      const step = i1 >= i0 ? 1 : -1;
      for (let i = i0; i !== i1 + step; i += step) {
        const last = xs.length - 1;
        if (last >= 0 && Math.abs(xs[last] - t.x[i]) < 1e-6 && Math.abs(zs[last] - t.z[i]) < 1e-6) continue;
        if (xs.length) kinds.push(t.kind[step > 0 ? Math.max(0, i - 1) : Math.min(t.n - 2, i)]);
        xs.push(t.x[i]);
        ys.push(t.y[i]);
        zs.push(t.z[i]);
      }
    }
    const n = xs.length;
    const s = new Float64Array(n);
    for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
    const route = { line, from: w.from, to: w.to, x: Float64Array.from(xs), y: Float64Array.from(ys), z: Float64Array.from(zs), s, kind: Uint8Array.from(kinds), n, length: s[n - 1], before: w.before, after: w.after, stops: [] };
    // where it stands at each of its stops: the level's middle, on this track
    for (const [lk] of w.stops) {
      const L = this.levels[lk];
      const at = nearestOn(route, L.x, L.z);
      route.stops.push({ level: L, s: at.s });
    }
    route.stops.sort((a, b) => a.s - b.s);
    return route;
  }

  // The routes and tracks whose box comes within r of (x, z).
  tracksNear(x, z, r) {
    return this.tracks.filter((t) => x > t.box[0] - r && x < t.box[2] + r && z > t.box[1] - r && z < t.box[3] + r);
  }

  station(id) {
    return this.stations.find((st) => st.id === id) || null;
  }
}

// Where s m along a route (or a track) is: out.x, y (the rail's top), z,
// out.dx, dz (the way it runs, level), out.grade, and out.kind of the stretch.
/**
 * @param {{ n: number, length: number, s: Float64Array, x: Float64Array, y: Float64Array, z: Float64Array, kind: Uint8Array }} r
 * @param {number} s
 * @param {any} [out]
 * @returns {{ x: number, y: number, z: number, dx: number, dz: number, grade: number, kind: number, i: number }}
 */
export function pointAt(r, s, out = {}) {
  const n = r.n;
  if (s <= 0 || n < 2) return fill(r, 0, 0, out);
  if (s >= r.length) return fill(r, n - 2, 1, out);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (r.s[m] <= s) lo = m;
    else hi = m;
  }
  const len = r.s[lo + 1] - r.s[lo];
  return fill(r, lo, len > 0 ? (s - r.s[lo]) / len : 0, out);
}
function fill(r, i, t, out) {
  const dx = r.x[i + 1] - r.x[i];
  const dz = r.z[i + 1] - r.z[i];
  const l = Math.hypot(dx, dz) || 1;
  out.x = r.x[i] + dx * t;
  out.y = r.y[i] + (r.y[i + 1] - r.y[i]) * t;
  out.z = r.z[i] + dz * t;
  out.dx = dx / l;
  out.dz = dz / l;
  out.grade = (r.y[i + 1] - r.y[i]) / l;
  out.kind = r.kind[i];
  out.i = i;
  return out;
}

// The nearest point on a route (or track) to (x, z): out.s, out.d (m off it).
export function nearestOn(r, x, z, out = {}) {
  let best = Infinity;
  for (let i = 0; i + 1 < r.n; i++) {
    const ex = r.x[i + 1] - r.x[i];
    const ez = r.z[i + 1] - r.z[i];
    const l2 = ex * ex + ez * ez || 1;
    let t = ((x - r.x[i]) * ex + (z - r.z[i]) * ez) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(r.x[i] + ex * t - x, r.z[i] + ez * t - z);
    if (d < best) {
      best = d;
      out.s = r.s[i] + Math.sqrt(l2) * t;
      out.i = i;
    }
  }
  out.d = best;
  return out;
}

// How far along a level's platforms (x, z) is from its middle (out.a), and
// across (out.c, + to the right going along).
/** @returns {{ a: number, c: number }} */
export function onLevel(L, x, z, out = {}) {
  const ox = x - L.x;
  const oz = z - L.z;
  out.a = ox * L.dx + oz * L.dz;
  out.c = -ox * L.dz + oz * L.dx;
  return out;
}

// And back: the point a along and c across a level.
export function fromLevel(L, a, c, out = {}) {
  out.x = L.x + L.dx * a - L.dz * c;
  out.z = L.z + L.dz * a + L.dx * c;
  return out;
}
