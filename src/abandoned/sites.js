// Two institutions within walking distance of the start. Each search has its
// own seed so the details of one building don't depend on finding the other.
import { hash2i, mulberry32 } from '../noise.js';
import { boxOf, toWorld } from '../landmarks/sites.js';

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
];

export function overlaps(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

export function findBuildings(gen, start, keepOff) {
  const sites = [];
  for (const [i, type] of BUILDINGS.entries()) {
    const seed = hash2i(i, 5741, gen.seed);
    const random = mulberry32(seed);
    const { w, d } = type;
    const plan = [
      [-w - 1, -d - 1, w + 1, d + 1],
      [-3, d, 3, d + 11],
    ];
    for (let k = 0; k < 420; k++) {
      const angle = random() * 2 * Math.PI;
      const r = 290 + random() * 220;
      const x = start.x + r * Math.cos(angle),
        z = start.z + r * Math.sin(angle);
      if (sites.some((s) => Math.hypot(x - s.x, z - s.z) < 180)) continue;
      const yaw = Math.atan2(start.x - x, start.z - z);
      const s = { ...type, id: 'abandoned:' + type.kind, x, z, yaw, seed, plan };
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
      sites.push({ ...s, top: high + 0.45, low, box, door: { ...door, yaw: yaw + Math.PI } });
      break;
    }
  }
  return sites;
}
