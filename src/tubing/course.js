// Where the water goes from here, as the drainage network has it
// (world/drainage.js): which way a lake drains, how far a river runs on
// before its water stops, and where the nearest one big enough to float
// down is.
//
// The current itself is the water's to say (chunks.waterAt); this is for
// what it doesn't say. In a lake the water stands still, but it does go
// somewhere: out down the channel that leaves it, which is where a tube
// drifts. And every river ends somewhere, in a lake that keeps its water or
// out in the sea, so it's worth knowing how far that is, and where to go to
// float on once you get there.
//
// Only the forest's own water is in the network: a real place's lakes and
// streams (world/landform.js) aren't, and nothing here knows about them. A
// pond or lake of the forest's that gives way to a real place isn't there.
//
//   new Course(water, depthAt)
//     water    the world's Water (gen.water): its network, and the land
//     depthAt  (x, z) -> how deep the water there really is (m), 0 if none
//   course.drain(x, z)    a spot down the outflow of the lake (x, z) is in, or null
//   course.at(x, z)       { far, end, sea, lake }: how far (m) the water runs on
//                         from here, where it stops, whether that's the sea, and
//                         the lake (x, z) is in, if any; null if no water of the
//                         forest's is near
//   course.nearest(x, z, { reach, not })
//                         { x, z, far, river, d }: the nearest spot to get in on
//                         a channel big enough to float down, whose water doesn't
//                         end at `not` (an end, from at()), or null

import { NET, basinRadius } from '../world/drainage.js';
import { LANDFORM_DRY } from '../world/water.js';
import { TUBE } from './tube.js';

// A channel that this many nodes of land drain through is big enough to
// float down: about two metres across, and half a metre deep or more.
export const FLOAT_ACC = 16;
// Heading out of a lake, make for a spot this far (m) down its outflow from
// where it leaves the shore.
const OUT_AHEAD = 10;
// ...by way of a spot this far (m) ahead along the channel out.
const LEAD = 15;
// Still water this near (m) a lake's shore counts as in it.
const SHORE = 3;
// A channel counts as here within this far (m) of its bank.
const BANK = 8;
// A river worth pointing someone to runs at least this far (m) from where
// they would get in.
const WORTH = 150;
// Looking along a channel for water deep enough to float in: this far (m)
// at a time, no further than ALONG_MOST m down it.
const ALONG = 4;
const ALONG_MOST = 60;
// Somewhere to get in is on running water: at least this far (m) out of the
// lake a channel leaves, and this far short of the one it runs into.
const IN_FROM = 4;
const IN_BEFORE = 25;

const _c = { x: 0, z: 0, s: 0, d: 0 };

export class Course {
  constructor(water, depthAt) {
    this.water = water;
    this.gen = water.gen;
    this.depthAt = depthAt;
    this.runs = new Map(); // node key -> { far, end, sea }
  }

  get net() {
    return this.water.net;
  }

  // The forest's pond or lake (x, z) is in (or within `margin` m of), or null.
  lake(x, z, margin = 0) {
    const C = NET.cell;
    for (const b of this.net.near(Math.floor(x / C), Math.floor(z / C)).basins) {
      if (this.#givesWay(b)) continue;
      const dx = x - b.x;
      const dz = z - b.z;
      if (Math.hypot(dx, dz) < basinRadius(b, Math.atan2(dz, dx)) + margin) return b;
    }
    return null;
  }

  // (As Water._givesWay: a pond or lake of the forest's that would reach
  // real land isn't there.)
  #givesWay(b) {
    const g = this.gen;
    return g.landforms && g.landforms.length > 0 && g.landformClearance(b.x, b.z) < b.maxR + b.blend + LANDFORM_DRY;
  }

  // Where still water at (x, z) runs out: a spot ahead on the channel that
  // leaves its lake, which runs out from the lake's middle, or null if it
  // isn't in one, or the lake keeps its water. The spot is LEAD m on along
  // it from the nearest point (no further than a little way past the shore):
  // a lake's shore goes round its middle, so heading for the line out from
  // there doesn't run you into a bay on the way.
  drain(x, z) {
    const b = this.lake(x, z, SHORE);
    if (!b) return null;
    const seg = this.net.segment(b.node);
    if (!seg) return null;
    const out = seg.sa + OUT_AHEAD;
    closest(seg, x, z, 0, out, _c);
    return along(seg, Math.min(out, _c.s + LEAD), { x: 0, z: 0 });
  }

  // How far (m) the water runs on from node n, down its channels and across
  // the lakes on the way, to where it stops: { far, end (that node's key),
  // sea (whether it's the sea) }.
  run(n) {
    const net = this.net;
    const path = [];
    let m = n;
    let tail = null;
    for (;;) {
      tail = this.runs.get(m.k);
      if (tail) break;
      const next = net.next(m);
      if (!next) {
        net.acc(m); // (settled, so it knows whether its hollow is open to the sea)
        tail = { far: 0, end: m.k, sea: net.isSea(m) || m.toSea };
        this.runs.set(m.k, tail);
        break;
      }
      path.push(m);
      m = next;
    }
    for (let i = path.length - 1; i >= 0; i--) {
      const p = path[i];
      const seg = net.segment(p);
      const q = net.next(p);
      const len = seg ? seg.s[seg.count] : Math.hypot(q.x - p.x, q.z - p.z);
      tail = { far: tail.far + len, end: tail.end, sea: tail.sea };
      this.runs.set(p.k, tail);
    }
    return tail;
  }

  // The water at (x, z) as the network has it: see the top of the file. In a
  // lake, the way on is out down its outflow from the middle, so how far
  // there is to go is from the nearest point on that.
  at(x, z) {
    const b = this.lake(x, z, SHORE);
    if (b) {
      const r = this.run(b.node);
      const seg = this.net.segment(b.node);
      if (!seg) return { ...r, lake: b };
      closest(seg, x, z, 0, seg.sa + OUT_AHEAD, _c);
      return { far: Math.max(0, r.far - _c.s), end: r.end, sea: r.sea, lake: b };
    }
    const C = NET.cell;
    let best = null;
    let bd = Infinity;
    let bs = 0;
    for (const seg of this.net.near(Math.floor(x / C), Math.floor(z / C)).segs) {
      if (x < seg.minX || x > seg.maxX || z < seg.minZ || z > seg.maxZ) continue;
      closest(seg, x, z, 0, seg.s[seg.count], _c);
      const half = Math.max(seg.w0, seg.w1);
      if (_c.d - half < bd) {
        bd = _c.d - half;
        best = seg;
        bs = _c.s;
      }
    }
    if (!best || bd > BANK) return null;
    const r = this.run(best.b);
    return { far: best.s[best.count] - bs + r.far, end: r.end, sea: r.sea, lake: null };
  }

  // The nearest spot to get in on a channel big enough to float down, out
  // of any lake, that runs on far enough to be worth it: see the top of the
  // file. Looks ring by ring of the network's cells, and stops once nothing
  // further out could be nearer.
  nearest(x, z, { reach = 1500, not = null } = {}) {
    const net = this.net;
    const C = NET.cell;
    const ci = Math.floor(x / C);
    const cj = Math.floor(z / C);
    const rings = Math.ceil(reach / C) + 1;
    const seen = [];
    let found = null;
    for (let ring = 0; ring <= rings; ring++) {
      for (let j = cj - ring; j <= cj + ring; j++) {
        for (let i = ci - ring; i <= ci + ring; i++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== ring) continue;
          const n = net.node(i, j);
          if (net.acc(n) < FLOAT_ACC) continue;
          const seg = net.segment(n);
          if (!seg) continue;
          const lo = seg.sa + IN_FROM;
          const hi = seg.sb - IN_BEFORE;
          if (hi - lo < ALONG) continue;
          closest(seg, x, z, lo, hi, _c);
          if (_c.d <= reach) seen.push({ seg, s: _c.s, d: _c.d, hi });
        }
      }
      // a channel from a node this many rings out runs at most a cell or
      // two (and its bends) nearer than its node: past that, nothing new
      // can come in nearer than what's been found
      const sure = (ring - 2) * C;
      seen.sort((a, b) => a.d - b.d);
      while (seen.length && seen[0].d <= sure) {
        found = this.#check(seen.shift(), x, z, not);
        if (found) return found;
      }
    }
    while (seen.length) {
      found = this.#check(seen.shift(), x, z, not);
      if (found) return found;
    }
    return null;
  }

  // Is the channel worth floating down from s along it, and is the water
  // really deep enough there (or a little way down)? -> a spot, or null
  #check({ seg, s, hi }, x, z, not) {
    const r = this.run(seg.b);
    if (not !== null && r.end === not) return null;
    const p = { x: 0, z: 0 };
    for (let u = s; u <= Math.min(hi, s + ALONG_MOST); u += ALONG) {
      along(seg, u, p);
      const far = seg.s[seg.count] - u + r.far;
      if (far < WORTH) return null;
      if (this.depthAt(p.x, p.z) >= TUBE.draft + 0.05) return { x: p.x, z: p.z, far, river: seg.acc0 >= NET.riverAcc, d: Math.hypot(p.x - x, p.z - z) };
    }
    return null;
  }
}

// The point s m along a channel's centreline, into out.
export function along(seg, s, out) {
  const S = seg.s;
  const P = seg.pts;
  s = Math.max(0, Math.min(S[seg.count], s));
  let q = 0;
  while (q < seg.count - 1 && S[q + 1] < s) q++;
  const t = (s - S[q]) / Math.max(1e-6, S[q + 1] - S[q]);
  out.x = P[q * 2] + (P[q * 2 + 2] - P[q * 2]) * t;
  out.z = P[q * 2 + 1] + (P[q * 2 + 3] - P[q * 2 + 1]) * t;
  return out;
}

// The point on a channel's centreline between s0 and s1 m along it nearest
// (x, z): out { x, z, s (m along), d (m from x, z) }.
function closest(seg, x, z, s0, s1, out) {
  const S = seg.s;
  const P = seg.pts;
  out.d = Infinity;
  for (let q = 0; q < seg.count; q++) {
    if (S[q + 1] < s0 || S[q] > s1) continue;
    const ax = P[q * 2];
    const az = P[q * 2 + 1];
    const dx = P[q * 2 + 2] - ax;
    const dz = P[q * 2 + 3] - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
    const len = S[q + 1] - S[q];
    const lo = len > 0 ? Math.max(0, (s0 - S[q]) / len) : 0;
    const hi = len > 0 ? Math.min(1, (s1 - S[q]) / len) : 1;
    t = t < lo ? lo : t > hi ? hi : t;
    const px = ax + dx * t;
    const pz = az + dz * t;
    const d = Math.hypot(px - x, pz - z);
    if (d < out.d) {
      out.d = d;
      out.x = px;
      out.z = pz;
      out.s = S[q] + len * t;
    }
  }
  return out;
}
