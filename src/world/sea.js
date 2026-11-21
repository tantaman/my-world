// The sea, which the land goes down to (worldgen.js).
//
// Pure and deterministic like the rest of WorldGen (no three.js).
//
// Far out, the land falls away under a sea that stands at one level
// everywhere (SEA.level). How far it falls is a broad field of its own
// (drop()): nothing at all inland, then the ground tilting gently down over a
// few kilometres into the deep. The coast is wherever the hills, tilted,
// cross the sea's level, so it follows them: coves up the valleys, headlands
// along the ridges, and islands where a hilltop stands up out of the deep.
// Under the water the hills carry on down, so the seabed has ridges and
// gullies of its own.
//
// Near the start the field is steered so that you begin on land, with the
// sea a walk away in a direction of the seed's own choosing (SEA.coastAt),
// however high the land there stands.
//
// Inland, where nothing falls away, no hollow goes below the sea's level
// (a soft floor, so a deep valley gets a flat bottom), so there is no sea but
// the sea. And where land meets sea it eases into a beach: the slope is
// flattened for a few metres either side of the waterline.

import { mulberry32, smoothstep } from '../noise.js';

export const SEA = {
  level: -32, // m: where the sea stands, everywhere
  wave: 9000, // m: the breadth of the field the sea is laid out by
  drop: 110, // m: how far the land falls away under the open sea
  rise: 0.7, // how far up the field the fall is complete (field units)
  warp: [1900, 380], // the field is warped: m between bends, how far they go
  // Near the start: the coast this far (m) off in the seed's direction,
  // the land falling to the deep over `ramp` m of field per unit, all of it
  // fading back to the field's own way between start[0] and start[1] m out.
  // How high the land stands there is taken from this many heights along
  // `span` m of the line the coast is to follow (the middle one of them).
  // No nearer than `near` of the way there, it doesn't fall at all.
  coastAt: 700,
  near: [0.3, 0.8],
  ramp: 1800,
  span: 600,
  heights: 13,
  start: [1500, 4000],
  // Inland: no ground below floor m above the sea (clear of the beach's
  // sand), eased in over soft m; inland is where the land falls less than
  // inland[0] m, and by inland[1] m of fall the floor is gone.
  floor: 3,
  soft: 2,
  inland: [4, 14],
  // The beach: within about `beach` m of height of the waterline the slope
  // is taken down by up to `flatten` (where the land falls to the sea).
  beach: 2.6,
  flatten: 0.72,
  // and up to this high (m) above the sea, it is sand
  sand: 2.2,
  // A real place set into the land out at sea stands at least this high (m)
  // over it, an island (worldgen.js).
  island: 3,
};

// Heights within this many metres of the sea's level are near enough the
// shore to work out how far it is (see Water.shape()).
export const SHORE_BAND = 12;

// The x in 0..1 where smoothstep(0, 1, x) is s.
const unsmooth = (s) => 0.5 - Math.sin(Math.asin(1 - 2 * s) / 3);

export class Sea {
  // n(k): the k-th noise field of the seed (as WorldGen._fields has it).
  // landAt(x, z): the land's height there before the sea (its broadest).
  constructor(seed, n, landAt) {
    this.level = SEA.level;
    this.nSea = n(40);
    this.nWarpA = n(41);
    this.nWarpB = n(42);
    const rng = mulberry32((seed ^ 0x5ea5ea) >>> 0);
    const a = rng() * Math.PI * 2;
    // which way the coast lies from the start
    this.dirX = Math.cos(a);
    this.dirZ = Math.sin(a);
    // The field's value near the start where the coast is to be: where the
    // land falls just as far as it stands above the sea there.
    const hs = [];
    for (let i = 0; i < SEA.heights; i++) {
      const s = (i / (SEA.heights - 1) - 0.5) * 2 * SEA.span;
      hs.push(landAt(this.dirX * SEA.coastAt - this.dirZ * s, this.dirZ * SEA.coastAt + this.dirX * s));
    }
    hs.sort((p, q) => p - q);
    const fall = (hs[hs.length >> 1] - SEA.level) / SEA.drop;
    this.aim = SEA.rise * unsmooth(Math.min(0.92, Math.max(0.04, fall)));
    // how far the land fell at the last point shaped (see shape())
    this.fall = 0;
  }

  // How far (m) the land falls away at (x, z): 0 inland, SEA.drop far out.
  drop(x, z) {
    const [bend, reach] = SEA.warp;
    const wx = x + this.nWarpA(x / bend + 0.23, z / bend + 0.71) * reach;
    const wz = z + this.nWarpB(x / bend - 0.41, z / bend + 0.17) * reach;
    let v = this.nSea(wx / SEA.wave + 0.37, wz / SEA.wave - 0.61);
    const k = 1 - smoothstep(SEA.start[0], SEA.start[1], Math.hypot(x, z));
    let keep = 1;
    if (k > 0) {
      const t = x * this.dirX + z * this.dirZ; // how far toward the coast
      v += (this.aim + (t - SEA.coastAt) / SEA.ramp - v) * k;
      keep = 1 - k * (1 - smoothstep(SEA.coastAt * SEA.near[0], SEA.coastAt * SEA.near[1], t));
    }
    return SEA.drop * smoothstep(0, SEA.rise, v) * keep;
  }

  // The land h (as the land without a sea grows it) at (x, z), as it lies
  // by the sea. Leaves this.fall at how far it fell there.
  shape(h, x, z) {
    const D = this.drop(x, z);
    this.fall = D;
    let u = h - D - SEA.level; // height above the sea
    // inland, no hollow below the floor
    const inland = 1 - smoothstep(SEA.inland[0], SEA.inland[1], D);
    if (inland > 0) {
      // A soft floor: log(1 + e^t), which is t for a high t and 0 for a low
      // one, rounded off between. Written the long way round because e^t
      // overflows past t = 709 — about 1400 m up, which the high country
      // reaches (worldgen.js) — and then the whole height came out infinite.
      const t = (u - SEA.floor) / SEA.soft;
      const soft = Math.max(t, 0) + Math.log1p(Math.exp(-Math.abs(t)));
      const f = SEA.floor + SEA.soft * soft;
      u += (f - u) * inland;
    }
    // a beach at the waterline
    const b = u / SEA.beach;
    if (b > -4 && b < 4 && inland < 1) u -= SEA.flatten * (1 - inland) * u * Math.exp(-b * b);
    return SEA.level + u;
  }
}
