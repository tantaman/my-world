// The forest's rapids as places to run: where each one is, what it's called,
// and how hard it is on the international scale, from Class I (easy, a few
// waves) to Class VI (nobody runs it). The rapids themselves are the land's
// (world/water.js: Water.rapid gathers a steep segment's fall into one
// stretch of it); this finds them, names each from the seed, grades it, and
// says which is next down the river from where you are.
//
// How hard a rapid is goes by how steeply it falls, and by how much water
// there is in it: the same fall on a big river is a bigger, pushier thing
// than on a creek.
//
//   new Rapids(water, seed, gone)
//     water       the world's Water (gen.water): its network, and its rapids
//     seed        the world's seed, for the names
//     gone(x, z)  true where the forest's water has given way to a real place
//   rapids.get(id)                  a rapid, or null
//   rapids.within(x0, z0, x1, z1)   the rapids whose middle is in the box
//   rapids.nearest(x, z, { reach, least, most })
//                                   the nearest one of Class `least` to `most`
//                                   (or, with none, to V), or null
//   rapids.on(x, z)                 for the river at (x, z): the rapid you're
//                                   in, or the next one down within AHEAD m:
//                                   { rapid, along: m down it from its lip
//                                   (negative above it) }; or null
//
// A rapid: { id, name, cls (1..6), roman ('III'), grade (rise per m), drop
// (m), len (m), lip {x, z}, foot {x, z}, x, z (its middle), acc }

import { NET, channelSize } from '../world/drainage.js';
import { hash2i, mulberry32 } from '../noise.js';

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
// How hard: its fall in a hundred, times this for the smallest channel with
// a rapid and the biggest river; past each of these it's a class harder.
// (Set so that, over a few worlds, about a tenth of them are Class I, a fifth
// II, a quarter each III and IV, a sixth V, and the odd one VI.)
const HARD = { small: 0.75, big: 1.3, classes: [2, 3.3, 5.6, 7.2, 9.8] };
// Looking down the river for the next rapid: this far (m) at most.
export const AHEAD = 400;
// A channel counts as here within this far (m) of its bank.
const BANK = 6;
// Looking through more nodes than this for a box, only the ones already
// known are given: the map zoomed right out doesn't grow every river.
const MOST = 3000;
// What they're called: a word and a word, or one name of their own.
const FIRST = ['Big', 'Little', 'Lost', 'Broken', "Devil's", "Hermit's", 'Eagle', 'Raven', 'Bear', 'Wolf', 'Snake', 'Granite', 'Cedar', 'Thunder', "Widow's", 'Grizzly', 'Otter', 'Heron', 'Copper', 'Ghost', 'Black', 'White', 'Sawtooth', "Old Man's", 'Upper', 'Lower', 'Hidden', 'Crooked'];
const SECOND = ['Drop', 'Tooth', 'Chute', 'Staircase', 'Gate', 'Pinball', 'Kettle', 'Cauldron', 'Washboard', 'Maze', 'Squeeze', 'Slide', 'Hole', 'Ledges', 'Rapid', 'Rock', 'Slot', 'Teeth', 'Jaws', 'Elbow', 'Corkscrew', 'Falls', 'Rollers'];
const WHOLE = ['The Washing Machine', 'Rock Garden', 'Surprise', 'Double Trouble', 'Last Chance', 'Boat Eater', 'The Meat Grinder', 'Swimmer', 'Three Sisters', 'The Narrows', 'Tumbledown', 'Roller Coaster', 'Velvet Hammer', 'Graveyard', 'Room of Doom'];

const key = (i, j) => `${i},${j}`;

// The point on a segment's centreline nearest (x, z): out { x, z, s, d }.
function closest(seg, x, z, out) {
  const P = seg.pts;
  const S = seg.s;
  out.d = Infinity;
  for (let q = 0; q < seg.count; q++) {
    const ax = P[q * 2];
    const az = P[q * 2 + 1];
    const dx = P[q * 2 + 2] - ax;
    const dz = P[q * 2 + 3] - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    const px = ax + dx * t;
    const pz = az + dz * t;
    const d = Math.hypot(px - x, pz - z);
    if (d < out.d) {
      out.d = d;
      out.x = px;
      out.z = pz;
      out.s = S[q] + (S[q + 1] - S[q]) * t;
    }
  }
  return out;
}
// The point s m along a segment's centreline.
function pointAt(seg, s) {
  const S = seg.s;
  const P = seg.pts;
  s = Math.max(0, Math.min(S[seg.count], s));
  let q = 0;
  while (q < seg.count - 1 && S[q + 1] < s) q++;
  const t = (s - S[q]) / Math.max(1e-6, S[q + 1] - S[q]);
  return { x: P[q * 2] + (P[q * 2 + 2] - P[q * 2]) * t, z: P[q * 2 + 1] + (P[q * 2 + 3] - P[q * 2 + 1]) * t };
}

// The class of a rapid that falls `grade` (rise per m) carrying `acc` nodes of water.
export function classOf(grade, acc) {
  const size = channelSize(acc);
  const score = grade * 100 * (HARD.small + (HARD.big - HARD.small) * size);
  let c = 1;
  for (const edge of HARD.classes) if (score >= edge) c++;
  return c;
}

export class Rapids {
  constructor(water, seed, gone = () => false) {
    this.water = water;
    this.seed = seed;
    this.gone = gone;
    this.known = new Map(); // node key -> rapid, or null
    this._c = { x: 0, z: 0, s: 0, d: 0 };
  }

  get net() {
    return this.water.net;
  }

  // The rapid on the segment from node (i, j), or null.
  at(i, j) {
    const k = key(i, j);
    if (this.known.has(k)) return this.known.get(k);
    const seg = this.net.segment(this.net.node(i, j));
    const rapid = seg ? this.#make(seg, i, j) : null;
    this.known.set(k, rapid);
    return rapid;
  }

  #make(seg, i, j) {
    const r = this.water.rapid(seg);
    if (!r) return null;
    const lip = pointAt(seg, r.s0);
    const foot = pointAt(seg, r.s1);
    const mid = pointAt(seg, (r.s0 + r.s1) / 2);
    if (this.gone(mid.x, mid.z) || this.gone(lip.x, lip.z) || this.gone(foot.x, foot.z)) return null;
    const cls = classOf(r.grade, r.acc);
    return { id: `rapid:${i},${j}`, i, j, name: this.#name(i, j), cls, roman: ROMAN[cls], grade: r.grade, drop: r.drop, len: r.s1 - r.s0, lip, foot, x: mid.x, z: mid.z, acc: r.acc, seg, s0: r.s0, s1: r.s1 };
  }

  #name(i, j) {
    const rng = mulberry32(hash2i(i, j, (this.seed ^ 0x5a17e) >>> 0));
    if (rng() < 0.2) return WHOLE[Math.floor(rng() * WHOLE.length)];
    return `${FIRST[Math.floor(rng() * FIRST.length)]} ${SECOND[Math.floor(rng() * SECOND.length)]}`;
  }

  get(id) {
    const m = /^rapid:(-?\d+),(-?\d+)$/.exec(id || '');
    return m ? this.at(Number(m[1]), Number(m[2])) : null;
  }

  // The rapids whose middle is in the box. (A rapid's middle is within two
  // cells of its node.)
  within(x0, z0, x1, z1) {
    const C = NET.cell;
    const i0 = Math.floor(x0 / C) - 2;
    const i1 = Math.floor(x1 / C) + 2;
    const j0 = Math.floor(z0 / C) - 2;
    const j1 = Math.floor(z1 / C) + 2;
    const out = [];
    const all = (i1 - i0 + 1) * (j1 - j0 + 1) <= MOST;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const r = all ? this.at(i, j) : this.known.get(key(i, j));
        if (r && r.x >= x0 && r.x <= x1 && r.z >= z0 && r.z <= z1) out.push(r);
      }
    }
    return out;
  }

  // The nearest rapid of Class `least` to `most` within reach (m) of (x, z);
  // with none of those, the nearest up to Class V (not VI: nobody runs
  // those). Or null.
  nearest(x, z, { reach = 1500, least = 2, most = 4 } = {}) {
    let best = null;
    let bd = reach;
    let worse = null;
    let wd = reach;
    for (const r of this.within(x - reach, z - reach, x + reach, z + reach)) {
      if (r.cls < least || r.cls > 5) continue;
      const d = Math.hypot(r.lip.x - x, r.lip.z - z);
      if (r.cls <= most && d < bd) {
        bd = d;
        best = r;
      } else if (r.cls > most && d < wd) {
        wd = d;
        worse = r;
      }
    }
    return best || worse;
  }

  // The rapid you're in on the river at (x, z), or the next one down within
  // AHEAD m: { rapid, along }; or null.
  on(x, z) {
    const net = this.net;
    const C = NET.cell;
    const c = this._c;
    let seg = null;
    let s = 0;
    let bd = BANK;
    for (const g of net.near(Math.floor(x / C), Math.floor(z / C)).segs) {
      if (x < g.minX || x > g.maxX || z < g.minZ || z > g.maxZ) continue;
      closest(g, x, z, c);
      const d = c.d - Math.max(g.w0, g.w1);
      if (d < bd) {
        bd = d;
        seg = g;
        s = c.s;
      }
    }
    if (!seg) return null;
    // down from here, segment by segment, to the first rapid whose foot is
    // still ahead
    let gone = -s;
    let n = seg.a;
    for (let hops = 0; hops < 12 && gone < AHEAD && n; hops++) {
      const g = net.segment(n);
      if (!g) return null;
      const r = this.at(n.i, n.j);
      if (r && gone + r.s1 > 0) {
        const along = -(gone + r.s0);
        return along < -AHEAD ? null : { rapid: r, along };
      }
      gone += g.s[g.count];
      n = net.next(n);
    }
    return null;
  }
}
