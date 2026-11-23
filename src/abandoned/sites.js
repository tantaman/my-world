// The original two addresses keep their seeds and search rings. The larger
// institutions are farther out. Beyond them, districts are surveyed on approach.
import { hash2i, mulberry32 } from '../noise.js';
import { boxOf, toWorld } from '../world/frame.js';

const BUILDINGS = [
  {
    kind: 'asylum',
    name: 'Alder Vale Asylum',
    sign: 'ALDER VALE',
    subtitle: 'COUNTY ASYLUM',
    w: 18,
    d: 29,
    bays: 6,
    height: 4.2,
    note: 'Two wards, connected by the visitors’ gallery.',
  },
  {
    kind: 'post',
    name: 'Dead Letter Depot',
    sign: 'DEAD LETTER DEPOT',
    subtitle: 'UNDELIVERABLE MAIL',
    w: 22,
    d: 25,
    bays: 4,
    height: 6,
    note: 'The sorting floor and the undelivered mail archive.',
  },
  {
    kind: 'baths',
    name: 'Mercy Mineral Baths',
    sign: 'MERCY BATHS',
    subtitle: 'HYDROTHERAPY',
    w: 21,
    d: 37,
    bays: 7,
    height: 5,
    ring: [1350, 2200],
    note: 'Follow the old tiled gallery through the hydrotherapy rooms.',
  },
  {
    kind: 'furnace',
    name: 'Blackwater Furnace Works',
    sign: 'BLACKWATER WORKS',
    subtitle: 'BOILER HOUSE',
    w: 25,
    d: 43,
    bays: 8,
    height: 7,
    ring: [3500, 5400],
    note: 'A furnace hall with eight service bays and an ash gallery.',
  },
];

export function overlaps(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

// Where its own ring has no ground flat and clear enough (a narrow valley,
// its floor the town's), a building is looked for again out to this many
// times as far, but no further than FURTHEST m from the start (the furnace's
// own ring's edge), inside the districts round them (OutlyingBuildings). The
// first look is as it was, so a site it finds stays put.
const WIDEN = 3;
const FURTHEST = 5400;
const RING = [290, 510]; // m from the start, where a building doesn't say

export function findBuildings(gen, start, keepOff) {
  const sites = [];
  for (const [i, type] of BUILDINGS.entries()) {
    const seed = hash2i(i, 5741, gen.seed);
    const [min, max] = type.ring || RING;
    const s = survey(gen, start, keepOff, type, seed, sites) || survey(gen, start, keepOff, { ...type, ring: [min, Math.min(max * WIDEN, FURTHEST)] }, seed ^ 0x9e37, sites);
    if (s) sites.push(s);
  }
  return sites;
}

function survey(gen, start, keepOff, type, seed, others, tries = 420) {
  const random = mulberry32(seed);
  const { w, d } = type;
  const plan = [
    [-w - 1, -d - 1, w + 1, d + 1],
    [-3, d, 3, d + 11],
  ];
  const [min, max] = type.ring || RING;
  for (let k = 0; k < tries; k++) {
    const angle = random() * 2 * Math.PI;
    const r = min + random() * (max - min);
    const x = start.x + r * Math.cos(angle),
      z = start.z + r * Math.sin(angle);
    if (others.some((s) => Math.hypot(x - s.x, z - s.z) < 180)) continue;
    const yaw = Math.atan2(start.x - x, start.z - z);
    const s = { ...type, id: type.id || 'abandoned:' + type.kind, x, z, yaw, seed, plan };
    if (gen.padClearance(x, z) < Math.hypot(w, d + 11)) continue;
    let high = -Infinity,
      low = Infinity;
    function sample(u, v) {
      const p = toWorld(s, u, v);
      const h = gen.height(p.x, p.z);
      high = Math.max(high, h);
      low = Math.min(low, h);
      return gen.water.edge > 3 && high - low < 4.2;
    }
    if (!sample(0, 0) || !sample(0, d + 11) || !sample(-w, -d) || !sample(w, d)) continue;
    let fits = true;
    for (let j = 0; fits && j <= 10; j++) {
      for (let n = 0; fits && n <= 8; n++) fits = sample(w * (n / 4 - 1), d * (j / 5 - 1));
    }
    if (!fits) continue;
    const box = boxOf(s);
    if (keepOff(box[0] - 6, box[1] - 6, box[2] + 6, box[3] + 6)) continue;
    const door = toWorld(s, 0, d + 9);
    return { ...s, top: high + 0.45, low, box, door: { ...door, yaw: yaw + Math.PI } };
  }
  return null;
}

// A district's survey stays inside its own square. Its centre and search
// radius are cheap to query from streaming hooks, even on a long flight.
export const DISTRICT = 2400; // m, the side of a district, from the start
const REACH = 610;
const PREFIX = ['Fen', 'Carrion', 'Silt', 'Bracken', 'Sable', 'Grey', 'Wick', 'Alder'];
const SUFFIX = ['mere', 'cross', 'combe', 'water', 'wick', 'ford', 'beck', 'fell'];
export class OutlyingBuildings {
  constructor(gen, start, keepOff) {
    this.gen = gen;
    this.start = start;
    this.keepOff = keepOff;
    this.cache = new Map();
  }
  cell(i, j) {
    const key = i + ',' + j;
    if (this.cache.has(key)) return this.cache.get(key);
    const x = this.start.x + (i + 0.5) * DISTRICT,
      z = this.start.z + (j + 0.5) * DISTRICT;
    if (Math.hypot(x - this.start.x, z - this.start.z) < 6500) return null;
    const seed = hash2i(i, j, this.gen.seed ^ 0x5cd28b);
    const rand = mulberry32(seed);
    const base = BUILDINGS[Math.floor(rand() * BUILDINGS.length)];
    const town = PREFIX[Math.floor(rand() * PREFIX.length)] + SUFFIX[Math.floor(rand() * SUFFIX.length)];
    const title = { asylum: 'Sanatorium', post: 'Mail Exchange', baths: 'Thermal Baths', furnace: 'Boiler Works' }[base.kind];
    const bays = base.bays + Math.floor(rand() * 4) - 1;
    const type = {
      ...base,
      id: `abandoned:district:${i}:${j}`,
      name: town + ' ' + title,
      sign: town.toUpperCase(),
      ring: [40, 220],
      bays,
      d: 4 + bays * (4 + rand() * 1.6),
      w: base.w - 2 + Math.floor(rand() * 7),
    };
    const site = survey(this.gen, { x, z }, this.keepOff, type, seed, [], 42);
    this.cache.set(key, site);
    return site;
  }
  near(x, z) {
    const u = (x - this.start.x) / DISTRICT,
      v = (z - this.start.z) / DISTRICT,
      i = Math.floor(u),
      j = Math.floor(v);
    if (Math.abs(u - i - 0.5) * DISTRICT > REACH || Math.abs(v - j - 0.5) * DISTRICT > REACH) return null;
    return this.cell(i, j);
  }
  byId(id) {
    const parts = /^abandoned:district:(-?\d{1,6}):(-?\d{1,6})$/.exec(id);
    return parts ? this.cell(Number(parts[1]), Number(parts[2])) : null;
  }
  // Districts' buildings whose box overlaps a rectangle of the world, those
  // not surveyed yet surveyed now: for what else is grown from the seed to
  // keep clear of. A district's building stays inside its own square, so
  // only the squares the rectangle touches are asked.
  within(x0, z0, x1, z1) {
    const out = [];
    const box = [x0, z0, x1, z1];
    const st = this.start;
    for (let j = Math.floor((z0 - st.z) / DISTRICT); j <= Math.floor((z1 - st.z) / DISTRICT); j++) {
      for (let i = Math.floor((x0 - st.x) / DISTRICT); i <= Math.floor((x1 - st.x) / DISTRICT); i++) {
        const s = this.cell(i, j);
        if (s && overlaps(s.box, box)) out.push(s);
      }
    }
    return out;
  }
}
