// What Purgatory's ground is strewn with, and who is on it: rushes on the
// shore, rocks and bushes on the slopes, flowers in the valley, the forest
// on the top; and the souls, doing what the poem has them do where it has
// them: wandering the plain new come, a flock under the cliff at the foot,
// sitting in the shade on the terrace above it, crossing the slope singing,
// sitting on the flowers in the valley; and on the terraces, the proud bent
// under their stones, the envious against the bank, the slothful running,
// the avaricious face down, the starved going by, the lustful walking in
// the fire.
//
// The ground is cut into squares CELL m across, each furnished when you come
// near it (world/strewn.js). A square is looked over on a grid of spots; at
// each, strew() decides from where on the mountain the spot is whether
// anything is there.

import { mulberry32 } from '../noise.js';
import { createShadeMaterial, createFlameMaterial, createFlameHaze, flameGeometry } from '../render/shades.js';
import { kind } from '../world/strewn.js';
import { R, TERRACES, TOP, WIDE, RUN, WAYS, LIQUID, STREAM, regionAt, terraceAt, inCleft } from './plan.js';
import { soul, burden, rushes, flowers, boulder, createFigureMaterial } from './models.js';
import { wrap } from './land.js';

export const CELL = 64; // m
const SPOTS = 9; // spots along a square's side (the forest on the top has more)
const TAU = Math.PI * 2;
// The flowers of the valley (Canto VII: "gold and fine silver, and scarlet
// and pearl-white, the Indian wood resplendent and serene, fresh emerald
// the moment it is broken") and the top's ("the vermilion and the yellow
// flowerets").
const VALLEY_FLOWERS = ['gold', 'silver', 'scarlet', 'pearl', 'indigo', 'emerald'];
const TOP_FLOWERS = ['vermilion', 'yellow', 'pearl'];
// m from the water: trunks stand back from Lethe's edge, their crowns
// overhang it, and Eunoë has a wider opening to the sky.
const LETHE_GROVE = { from: 2, to: 10 };
const EUNOE_GLADES = 16;
// m beside the cleft at the foot, and past either end of it, that nothing is
// put down: so its floor, and the way out at its foot and at its head, are
// open wherever the squares fall (a square's boulders lie where its seed
// says, and the biggest, on the terrace above, is nearly two metres round)
const CLEFT_CLEAR = { aside: 2.5, out: 10 };
const BLOOM = {
  gold: [0.85, 0.55, 0.04],
  silver: [0.75, 0.77, 0.8],
  scarlet: [0.75, 0.03, 0.03],
  pearl: [0.88, 0.85, 0.8],
  indigo: [0.07, 0.09, 0.45],
  emerald: [0.03, 0.4, 0.12],
  vermilion: [0.85, 0.13, 0.02],
  yellow: [0.85, 0.72, 0.06],
};

const _o = {};
const _a = {};
const _st = { along: 0, across: 0, level: 0, kind: 0, spring: false, sink: false };

// What can be put down. models, materials: the forest's (world/), whose
// trees, bushes and ferns grow on the top as well.
export function makeKit({ models, materials }) {
  const body = createShadeMaterial({ glow: [1.1, 0.9, 0.7] });
  const still = createFigureMaterial();
  const fire = createFlameMaterial();
  const K = (geo, mat, solid = null) => kind(geo, mat, solid, still);
  // the forest's own: drawn as it draws them, and casting their shadows
  const plant = (m, solid = null) => ({ geo: m.lod0, mat: materials.vegetation, solid, goes: false, shadow: materials.vegetationShadow || true, receiveShadow: true });
  const kit = {
    stand: K(soul('stand'), body),
    bowed: K(soul('bowed'), body),
    sit: K(soul('sit'), body),
    prone: K(soul('prone'), body),
    supine: K(soul('supine'), body),
    stoop: K(soul('stoop'), body),
    lean: K(soul('lean'), body),
    kneel: K(soul('kneel'), body),
    starved: K(soul('bowed', 0.6), body),
    burden: K(burden(), body),
    rushes: K(rushes(7), still),
    rushes2: K(rushes(19), still),
    boulder: K(boulder(1), still, { r: 0.6, top: 0.6, step: 0.7 }),
    boulder2: K(boulder(9), still, { r: 0.6, top: 0.6, step: 0.7 }),
    flame: { ...K(flameGeometry(), fire), haze: createFlameHaze() },
    broad: plant(models.broad, { r: 0.4, top: 10 }),
    birch: plant(models.birch, { r: 0.25, top: 9 }),
    bush: plant(models.bush),
    fern: plant(models.fern),
  };
  for (const name of Object.keys(BLOOM)) kit[`flowers-${name}`] = K(flowers(BLOOM[name], name.length * 7 + 3), still);
  return kit;
}

// ── What is where ───────────────────────────────────────────────────────────
// Look over the square at (x0, z0) and put down what belongs in it.
//   put(kind, x, y, z, yaw, scale, more) (world/strewn.js)
export function strew(land, ref, x0, z0, seed, put) {
  const rnd = mulberry32(seed);
  const mid = land.sample(x0 + CELL / 2, z0 + CELL / 2, 0, _o, false);
  const top = mid.r < TOP.r + 10;
  const n = top ? 14 : SPOTS;
  const g = CELL / n;
  const at = (x, z) => land.sample(x, z, 0, _a, false);
  for (let b = 0; b < n; b++) {
    for (let a = 0; a < n; a++) {
      const x = x0 + (a + rnd()) * g;
      const z = z0 + (b + rnd()) * g;
      const u = rnd(); // whether anything is here
      const v = rnd(); // and which, how big, which way
      const w = rnd();
      const s = land.sample(x, z, 0, _o, false);
      if (s.r > R.shore + 25) continue;
      const r = s.r;
      const th = s.th;
      // (after its three rolls, so the rest of the square is as it was)
      if (inCleft(r, th, CLEFT_CLEAR.aside, CLEFT_CLEAR.out)) continue;
      const y = s.h;
      const h = y - land.top;
      const depth = s.liq > s.h ? s.liq - s.h : 0;
      const where = regionAt(r, th, h);
      // which way is on round (the way up goes to the right: -1), and inward
      const tx = -Math.sin(th + land.turn);
      const tz = Math.cos(th + land.turn);
      const yawIn = Math.atan2(land.cx - x, land.cz - z);
      const level = () => Math.abs(at(x + 1.2, z).h - y) < 0.7 && Math.abs(at(x, z + 1.2).h - y) < 0.7;
      // something that walks on round the mountain: which way (±1), how
      // fast, over how long a stretch
      const walker = (kind, dir, speed, span, more = {}) => {
        const dx = tx * dir;
        const dz = tz * dir;
        const y0 = at(x - (dx * span) / 2, z - (dz * span) / 2).h;
        const y1 = at(x + (dx * span) / 2, z + (dz * span) / 2).h;
        put(kind, x, (y0 + y1) / 2, z, Math.atan2(dx, dz), 0.94 + w * 0.12, { go: [dx, dz, speed, span], phase: v, rise: y1 - y0, stride: 1, shade: 0.8 + w * 0.4, ...more });
        return { dx, dz, y: (y0 + y1) / 2, rise: y1 - y0 };
      };
      const body = (kind, more = {}) => put(kind, x, y, z, v * TAU, 0.94 + w * 0.12, { shade: 0.8 + w * 0.4, ...more });
      const plant = (kind, scale) => put(kind, x, y, z, w * TAU, scale, { shade: 0.85 + v * 0.3 });

      if (r > R.terrace) {
        if (where === 'shore') {
          // ── The shore: rushes in the ooze, where the billow beats it
          if (r > R.shore - 10 && r < R.shore + 16 && depth < 0.45 && u < 0.7) put(v < 0.5 ? 'rushes' : 'rushes2', x, Math.max(y, s.liq - 0.3), z, w * TAU, 0.8 + v * 0.6);
          else if (r < R.shore - 14 && u < 0.012) walker('stand', v < 0.5 ? 1 : -1, 0.5 + w * 0.3, 30);
        } else if (where === 'plain') {
          // ── The plain: the new come wandering, a rock here and there
          if (u < 0.006) walker(v < 0.5 ? 'stand' : 'bowed', v < 0.5 ? 1 : -1, 0.4 + w * 0.4, 36);
          else if (u < 0.02 && level()) put(v < 0.5 ? 'boulder' : 'boulder2', x, y, z, w * TAU, 0.5 + v * 1.2);
          else if (u < 0.06 && level()) plant('fern', 0.7 + v * 0.5);
        } else if (where === 'foot') {
          // ── Under the cliff at the foot: the excommunicate, like sheep
          if (r > R.foot + 4 && r < R.foot + 26 && u < 0.09) walker(v < 0.6 ? 'bowed' : 'stand', 1, 0.22 + w * 0.08, 24, { shade: 0.65 + w * 0.3 });
          else if (u < 0.05 && level()) put('boulder2', x, y, z, w * TAU, 0.6 + v * 1.5);
        } else {
          // ── The terrace above it: the negligent, in the shade, idle
          if (u < 0.03 && level()) put(v < 0.5 ? 'boulder' : 'boulder2', x, y, z, w * TAU, 1 + v * 2.2);
          else if (u < 0.06 && level()) body(v < 0.7 ? 'sit' : 'supine', { shade: 0.7 + w * 0.3 });
          else if (u < 0.1 && level()) plant(v < 0.5 ? 'bush' : 'fern', 0.8 + w * 0.5);
        }
        continue;
      }
      if (r > R.ledge) {
        if (where === 'valley') {
          // ── The valley: flowers of every colour, and the princes sitting
          // on the green, singing
          if (u < 0.55) put(`flowers-${VALLEY_FLOWERS[Math.floor(v * VALLEY_FLOWERS.length)]}`, x, y, z, w * TAU, 0.8 + rnd() * 0.6);
          else if (u < 0.6 && level()) body(v < 0.7 ? 'sit' : 'kneel', { shade: 0.9 + w * 0.3 });
          else if (u < 0.63) plant('bush', 0.7 + w * 0.6);
        } else {
          // ── The slope: the late-repentant crossing it, verse by verse;
          // rocks, bushes, a little scrub
          if (u < 0.012) walker(v < 0.5 ? 'stand' : 'bowed', -1, 0.8 + w * 0.3, 44);
          else if (u < 0.04 && level()) put(v < 0.5 ? 'boulder' : 'boulder2', x, y, z, w * TAU, 0.6 + v * v * 2.4);
          else if (u < 0.1) plant(v < 0.65 ? 'bush' : 'fern', 0.7 + w * 0.7);
          else if (u < 0.105) plant('birch', 0.6 + w * 0.4);
        }
        continue;
      }
      if (r > TERRACES[0].r) {
        // ── The ledge before the gate
        if (r > R.cliff + 8 && u < 0.03 && level()) put('boulder', x, y, z, w * TAU, 0.6 + v * 1.4);
        else if (r > R.cliff + 6 && u < 0.07) plant('fern', 0.6 + w * 0.5);
        continue;
      }
      if (r > TOP.r) {
        // ── The terraces (never in a stair)
        const t = terraceAt(h);
        if (t < 0 || t > 6) continue;
        const T = TERRACES[t];
        const into = T.r - r; // m in from its edge
        if (into < 0.4 || into > WIDE - 0.2 || Math.abs(h - T.h) > 0.6) {
          // (the wall of fire, in the mouth of the last stair)
          if (t === 6 && fireWall(land, r, th) && u < 0.85) put('flame', x, y - 0.1, z, w * TAU, 1.3 + v * 0.7, { tall: 2.6 + w * 1.6 });
          continue;
        }
        terrace(t, into, u, v, w, x, y, z, walker, body, put, land, r, th);
        continue;
      }
      // ── The top: the forest of the Earthly Paradise
      const st = land.stream(r, th, _st);
      const bank = st.kind ? Math.abs(st.across) - (st.spring ? STREAM.pool : st.sink ? 6 : STREAM.half) : Infinity;
      if (depth > 0 || bank < 1.2) continue;
      // Draw the same size roll the surrounding forest used, so moving
      // plants by the rivers won't move the other plants in the square.
      const nearBank = bank < 6;
      const canGrow = r <= TOP.r - 6;
      const flower = nearBank ? u < 0.25 : canGrow && u >= 0.22 && u < 0.3;
      const size = flower ? rnd() : v;
      const clearing = st.kind === LIQUID.eunoe || st.kind === LIQUID.spring;
      if (st.kind === LIQUID.lethe && !st.sink && bank >= LETHE_GROVE.from && bank < LETHE_GROVE.to && canGrow && u < 0.53) {
        plant(v < 0.88 ? 'broad' : 'birch', 1.06 + w * 0.62);
      } else if (nearBank || (clearing && bank < EUNOE_GLADES)) {
        if (u < (clearing ? 0.34 : 0.25)) put(`flowers-${TOP_FLOWERS[Math.floor(v * TOP_FLOWERS.length)]}`, x, y, z, w * TAU, 0.8 + size * 0.5);
        else if (u < 0.52 && bank > 3) plant('fern', 0.8 + w * 0.55);
      } else if (canGrow) {
        if (u < 0.085) plant(v < 0.75 ? 'broad' : 'birch', 0.85 + w * 0.5);
        else if (u < 0.15) plant('bush', 0.8 + w * 0.6);
        else if (u < 0.22) plant('fern', 0.7 + w * 0.6);
        else if (flower) put(`flowers-${TOP_FLOWERS[Math.floor(v * TOP_FLOWERS.length)]}`, x, y, z, w * TAU, 0.7 + size * 0.6);
      }
    }
  }
}

// Whether (r, th) is in the mouth of the last stair, where the fire is.
function fireWall(land, r, th) {
  const w = WAYS[7];
  const way = land.wayAt(r, th);
  return !!way && way.k === 7 && (way.inward || way.up < 0.05) && Math.abs(wrap(th - w.a0)) * r < 22;
}

// A spot on terrace t, `into` m in from its edge: who is there.
function terrace(t, into, u, v, w, x, y, z, walker, body, put, land, r, th) {
  switch (t) {
    case 0: // the proud, bent under their stones, coming slowly the other way
      if (u < 0.05 && into > 1 && into < WIDE - 1) {
        const go = walker('stoop', 1, 0.22 + w * 0.06, 30, { stride: 0.6 });
        put('burden', x, go.y, z, Math.atan2(go.dx, go.dz), 0.8 + w * 0.5, { go: [go.dx, go.dz, 0.22 + w * 0.06, 30], phase: v, rise: go.rise, shade: 1 });
      }
      break;
    case 1: // the envious, sitting against the bank, shoulder to shoulder
      if (into > WIDE - 1.1 && u < 0.6) put('lean', x, y, z, Math.atan2(land.cx - x, land.cz - z) + Math.PI, 0.95 + w * 0.1, { shade: 0.65 + w * 0.25 });
      break;
    case 2: // the wrathful: lost in the smoke, a few dim shapes
      if (u < 0.02) walker('bowed', v < 0.5 ? 1 : -1, 0.5, 24, { shade: 0.5 });
      break;
    case 3: // the slothful, running, the way you go
      if (u < 0.08) walker('stand', -1, 4.2 + w * 1.2, 70, { shade: 0.8 + w * 0.4 });
      break;
    case 4: // the avaricious and the prodigal, face down, near the edge
      if (into < 3.4 && u < 0.5) body('prone', { shade: 0.7 + w * 0.3 });
      break;
    case 5: // the gluttonous, starved, going by
      if (u < 0.05) walker('starved', -1, 1.2 + w * 0.3, 50, { shade: 0.75 + w * 0.3 });
      break;
    default: // the lustful: the fire out of the bank, and them walking in it, two ways
      if (into > 2.4) {
        if (u < 0.32) put('flame', x, y - 0.1, z, w * TAU, 0.8 + v * 0.6, { tall: 1.6 + w * 1.4 });
        else if (u < 0.37) walker('stand', v < 0.5 ? 1 : -1, 0.9 + w * 0.3, 40, { red: 1.6, shade: 0.7 });
      }
  }
}
