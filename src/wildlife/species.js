// Who lives here, where, when, how many, and how they take to people.
//
// Habitat is read off the same fields that grow the forest (worldgen.js):
//   forest  0 open meadow … 1 deep woods     meadow = 1 - forest
//   edge    1 where wood meets meadow         conifer 0 broadleaf … 1 pines
//   moist   0 dry … 1 damp                    path    1 on a trail
// so deer turn up along woodland edges, elk out in the meadows, moose where
// it's wet, red squirrels in the pines and grey ones in the oaks.
//
// Activity is by the hour: deer and rabbits at dawn and dusk, chipmunks by
// day, mice and owls at night, wolves and mountain lions in the half-light.
//
// `abundance` is relative within a category (big, small, herp, bird, insect)
// and is what makes a mountain lion a once-in-a-long-while thing.
//
// `only`: lives only where a real place's country names it among its animals
// (world/country.js): an alligator in a bayou, and never in the forest.

import { MAMMALS } from './mammals.js';
import { smoothstep as ss } from '../noise.js';

const bump = (h, c, w) => {
  let d = Math.abs(h - c);
  if (d > 12) d = 24 - d;
  return Math.exp(-((d / w) ** 2));
};
const day = (h) => ss(5.5, 7.5, h) * (1 - ss(18.5, 20.5, h));
export const ACTIVE = {
  diurnal: (h) => day(h),
  crepuscular: (h) => 0.3 * day(h) + bump(h, 6.8, 1.8) + bump(h, 19, 1.8) + 0.12 * (1 - day(h)),
  nocturnal: (h) => 0.05 + (1 - day(h)) * 0.95,
  dusky: (h) => 0.15 * day(h) + bump(h, 6.5, 2) + bump(h, 19.5, 2) + 0.6 * (1 - day(h)),
  always: () => 1,
};

const pickN = (rng, table) => {
  let r = rng();
  for (const [n, p] of table) {
    if (r < p) return n;
    r -= p;
  }
  return table[table.length - 1][0];
};

// ── Big and middling mammals ───────────────────────────────────────────────
// notice: how far off they look up and watch you (m, walking pace; running
//   doubles it, standing still trims it). flee: how close before they bolt.
// idle: weights for what they get up to when left alone.
export const SPECIES = {
  deer: {
    name: 'white-tailed deer', many: 'white-tailed deer', cat: 'big', model: MAMMALS.deer, active: 'crepuscular', abundance: 1, max: 2,
    habitat: (e) => e.edge * 1.3 + e.meadow * 0.5 + e.forest * 0.35,
    group: (rng) => pickN(rng, [[1, 0.35], [2, 0.35], [3, 0.3]]),
    member: (i, n, rng) => (i === 0 && rng() < 0.45 ? { variant: { buck: true }, scale: 1.02 + rng() * 0.08, label: 'a white-tailed buck' } : { scale: i > 0 && rng() < 0.45 ? 0.66 : 0.92 + rng() * 0.08 }),
    speed: { walk: 1.0, trot: 2.4, run: 9.5 }, turn: 2.8, radius: 0.32,
    notice: 34, flee: 17, alertTime: [3, 7], afterAlert: 'flee', fleeTime: [3, 5], spread: 4,
    idle: { graze: 5, wander: 2.5, idle: 1.2 }, tailFlag: true,
    calls: { flee: 'snort', alert: 'stamp' }, hooves: true, sight: 55,
  },
  elk: {
    name: 'elk', many: 'a herd of elk', cat: 'big', model: MAMMALS.elk, active: 'crepuscular', abundance: 0.4, max: 1,
    habitat: (e) => e.meadow * 1.4 + e.edge * 0.7 + e.conifer * 0.3,
    group: (rng) => pickN(rng, [[2, 0.2], [3, 0.3], [4, 0.3], [5, 0.2]]),
    member: (i, n, rng) => (i === 0 && rng() < 0.6 ? { variant: { bull: true }, scale: 1.0 + rng() * 0.06, label: 'a bull elk' } : { scale: i > 1 && rng() < 0.3 ? 0.7 : 0.86 + rng() * 0.08 }),
    speed: { walk: 1.15, trot: 3.0, run: 10 }, turn: 2.0, radius: 0.55,
    notice: 45, flee: 20, alertTime: [3, 6], afterAlert: 'leave', fleeTime: [3, 5], spread: 7,
    idle: { graze: 6, wander: 2.5, idle: 1 },
    calls: { idle: 'bugle', flee: 'bark' }, callChance: 0.06, hooves: true, sight: 70,
  },
  moose: {
    name: 'moose', many: 'a moose and her calf', cat: 'big', model: MAMMALS.moose, active: 'crepuscular', abundance: 0.14, max: 1,
    habitat: (e) => e.moist * e.moist * (e.forest * 0.6 + e.edge * 1.0) * 2.2,
    group: (rng) => pickN(rng, [[1, 0.8], [2, 0.2]]),
    member: (i, n, rng) => (i === 0 ? (n === 1 && rng() < 0.6 ? { variant: { bull: true }, scale: 1.0, label: 'a bull moose' } : { scale: 0.95 }) : { scale: 0.6 }),
    speed: { walk: 1.0, trot: 3.2, run: 7 }, turn: 1.5, radius: 0.6,
    notice: 18, flee: 9, alertTime: [4, 8], afterAlert: 'leave', fleeTime: [2, 3], spread: 4,
    idle: { browse: 5, wander: 2.5, idle: 1.5 },
    calls: { idle: 'grunt' }, callChance: 0.05, hooves: true, sight: 70,
  },
  bear: {
    name: 'black bear', many: 'a black bear and her cubs', cat: 'big', model: MAMMALS.bear, active: 'crepuscular', abundance: 0.13, max: 1,
    habitat: (e) => e.forest * 0.9 + e.edge * 0.6 + e.moist * 0.2,
    group: (rng) => pickN(rng, [[1, 0.65], [2, 0.2], [3, 0.15]]),
    member: (i, n, rng) => (i === 0 ? { variant: { cinnamon: rng() < 0.12 }, scale: 0.95 + rng() * 0.12 } : { scale: 0.42 }),
    speed: { walk: 0.95, trot: 2.2, run: 8 }, turn: 1.8, radius: 0.45,
    notice: 30, flee: 9, alertTime: [3, 4], afterAlert: 'stand', fleeTime: [2, 3], spread: 3,
    idle: { forage: 4, wander: 3, idle: 1, sit: 0.7 },
    calls: { alert: 'huff' }, sight: 55,
  },
  wolf: {
    name: 'grey wolf', many: 'a wolf pack', cat: 'big', model: MAMMALS.wolf, active: 'dusky', abundance: 0.16, max: 1,
    habitat: (e) => 0.5 + e.conifer * 0.5 + e.path * 0.3,
    group: (rng) => pickN(rng, [[2, 0.25], [3, 0.3], [4, 0.3], [5, 0.15]]),
    member: (i, n, rng) => {
      const r = rng();
      const variant = r < 0.18 ? { coat: 0x2c2a28, saddle: 0x151413, pale: 0x5a5650 } : r < 0.3 ? { coat: 0xc8c0b0, saddle: 0x8a8278, pale: 0xebe6dc } : {};
      return { variant, scale: 0.92 + rng() * 0.14 };
    },
    speed: { walk: 1.2, trot: 2.6, run: 11 }, turn: 2.4, radius: 0.3,
    notice: 45, flee: 18, alertTime: [2, 4], afterAlert: 'leave', fleeTime: [3, 4], spread: 3, file: true,
    idle: { travel: 5, wander: 1, idle: 1, sniff: 1.5, howl: 1.5 }, travelGait: 'trot',
    calls: { howl: 'howl' }, sight: 60,
  },
  cougar: {
    name: 'mountain lion', cat: 'big', model: MAMMALS.cougar, active: 'dusky', abundance: 0.05, max: 1,
    habitat: (e) => e.forest * 0.8 + e.edge * 0.4 + e.high * 0.6,
    group: () => 1,
    member: (i, n, rng) => ({ scale: 0.95 + rng() * 0.1 }),
    speed: { walk: 0.9, trot: 1.6, run: 11 }, turn: 2.2, radius: 0.3,
    notice: 40, flee: 13, alertTime: [4, 8], afterAlert: 'watch', fleeTime: [2, 3], spread: 2,
    idle: { prowl: 4, idle: 1, sit: 1.5 }, sight: 50,
  },
  bobcat: {
    name: 'bobcat', cat: 'big', model: MAMMALS.bobcat, active: 'crepuscular', abundance: 0.1, max: 1,
    habitat: (e) => e.edge * 1.0 + e.forest * 0.5,
    group: () => 1,
    member: (i, n, rng) => ({ scale: 0.95 + rng() * 0.15 }),
    speed: { walk: 0.8, trot: 1.5, run: 9 }, turn: 2.6, radius: 0.18,
    notice: 26, flee: 9, alertTime: [3, 6], afterAlert: 'watch', fleeTime: [2, 3], spread: 2,
    idle: { prowl: 4, idle: 1, sit: 1.5, hunt: 1 }, sight: 35,
  },
  fox: {
    name: 'red fox', many: 'a pair of red foxes', cat: 'big', model: MAMMALS.fox, active: 'crepuscular', abundance: 0.45, max: 1,
    habitat: (e) => e.meadow * 0.9 + e.edge * 1.0,
    group: (rng) => pickN(rng, [[1, 0.85], [2, 0.15]]),
    member: (i, n, rng) => ({ scale: 0.95 + rng() * 0.1 }),
    speed: { walk: 0.9, trot: 2.2, run: 10 }, turn: 3.2, radius: 0.15,
    notice: 26, flee: 11, alertTime: [2, 4], afterAlert: 'leave', fleeTime: [2, 3], spread: 6,
    idle: { travel: 2, hunt: 3, sniff: 1.5, idle: 1, sit: 0.6 }, travelGait: 'trot',
    calls: { night: 'yip' }, callChance: 0.04, sight: 35,
  },

  // ── Small mammals ──────────────────────────────────────────────────────
  rabbit: {
    name: 'cottontail', many: 'cottontails', cat: 'small', model: MAMMALS.rabbit, active: 'crepuscular', abundance: 0.8, max: 2,
    habitat: (e) => e.meadow * 0.7 + e.edge * 1.0 + e.path * 0.4,
    group: (rng) => pickN(rng, [[1, 0.8], [2, 0.2]]),
    member: (i, n, rng) => ({ scale: 1.1 + rng() * 0.15 }),
    speed: { walk: 0.6, trot: 1.2, run: 6 }, turn: 5, radius: 0.08,
    notice: 13, flee: 6, alertTime: [4, 10], afterAlert: 'freeze', fleeTime: [1.2, 2], spread: 3, zigzag: true, burst: true,
    idle: { graze: 5, hop: 3, sit: 1.5 }, calls: { flee: 'thump' }, escape: 'hide', sight: 16,
  },
  squirrel: {
    name: 'grey squirrel', cat: 'small', model: MAMMALS.squirrel, active: 'diurnal', abundance: 1, max: 2,
    habitat: (e) => e.forest * e.forest * 1.4 + e.edge * 0.3,
    group: () => 1,
    member: (i, n, rng, env) => (env.conifer > 0.55 ? { variant: { red: true }, scale: 1.15, label: 'a red squirrel' } : { scale: 1.15 }),
    speed: { walk: 0.5, trot: 1.2, run: 4.5 }, turn: 6, radius: 0.06,
    notice: 10, flee: 5.5, alertTime: [2, 4], afterAlert: 'flee', fleeTime: [3, 6], spread: 2, burst: true,
    idle: { forage: 4, hop: 4, sit: 2 }, calls: { alert: 'chatter' }, escape: 'tree', sight: 14,
  },
  chipmunk: {
    name: 'chipmunk', cat: 'small', model: MAMMALS.chipmunk, active: 'diurnal', abundance: 0.8, max: 2,
    habitat: (e) => e.forest * 0.6 + e.edge * 0.9,
    group: () => 1,
    member: () => ({ scale: 1.3 }),
    speed: { walk: 0.4, trot: 1.0, run: 3.8 }, turn: 7, radius: 0.04,
    notice: 8, flee: 4, alertTime: [1.5, 3], afterAlert: 'flee', fleeTime: [2, 4], spread: 2, burst: true,
    idle: { forage: 4, hop: 4, sit: 2.5 }, calls: { alert: 'chip', flee: 'chip' }, escape: 'cover', sight: 10,
  },
  mouse: {
    name: 'deer mouse', many: 'deer mice', cat: 'small', model: MAMMALS.mouse, active: 'nocturnal', abundance: 0.6, max: 2,
    habitat: (e) => 0.6 + e.forest * 0.4,
    group: (rng) => pickN(rng, [[1, 0.7], [2, 0.3]]),
    member: () => ({ scale: 1.5 }),
    speed: { walk: 0.3, trot: 0.9, run: 2.6 }, turn: 8, radius: 0.03,
    notice: 5, flee: 3, alertTime: [0.5, 1.5], afterAlert: 'flee', fleeTime: [0.8, 1.5], spread: 1.5, burst: true,
    idle: { forage: 4, hop: 4, sit: 1 }, calls: { flee: 'squeak' }, escape: 'hide', sight: 6,
  },

  // ── Reptiles and amphibians ────────────────────────────────────────────
  snake: {
    name: 'garter snake', cat: 'herp', cls: 'crawler', active: 'diurnal', abundance: 1, max: 1,
    habitat: (e) => e.meadow * 0.8 + e.path * 0.6 + e.edge * 0.4,
    sight: 9,
  },
  salamander: {
    name: 'spotted salamander', cat: 'herp', cls: 'crawler', active: 'nocturnal', abundance: 1, max: 2,
    habitat: (e) => e.moist * e.moist * (0.3 + e.forest) * 2,
    sight: 5,
  },
  // At the water's edge, basking on the bank or lying in the water with only
  // its eyes and the ridges of its back showing (gators.js). Big enough to
  // count among the big animals, and seen from as far off. `only`: it lives
  // only where a country names it among its animals (world/country.js), never
  // in the forest.
  alligator: {
    name: 'American alligator', cat: 'big', cls: 'gator', active: 'always', abundance: 1.4, max: 2, only: true,
    habitat: (e) => 0.5 + e.moist * 0.8 + e.meadow * 0.3,
    // notice: it lifts its head and watches; flee: off the bank and into the
    // water, or under it if it's already in (m)
    notice: 14, flee: 6, sight: 45, rest: 25,
  },

  // ── Birds ──────────────────────────────────────────────────────────────
  // flock: songbirds that land and forage on the ground until disturbed
  flock: { name: 'birds', cat: 'bird', cls: 'flock', active: 'diurnal', abundance: 1, max: 2, habitat: (e) => e.meadow * 0.6 + e.edge * 0.8 + e.path * 0.5 + 0.2, sight: 14 },
  // one bird crossing between the trees
  flit: { name: 'a bird', cat: 'bird', cls: 'flit', active: 'diurnal', abundance: 1.3, max: 3, rest: 5, habitat: (e) => 0.3 + e.forest * 0.7 + e.edge * 0.4 },
  crows: { name: 'crows', cat: 'bird', cls: 'flock', active: 'diurnal', abundance: 0.35, max: 1, rest: 120, habitat: (e) => e.meadow * 1.0 + e.path * 0.3, sight: 25 },
  hawk: { name: 'red-tailed hawk', cat: 'bird', cls: 'soar', active: 'diurnal', abundance: 0.25, max: 1, rest: 240, habitat: (e) => e.meadow * 1.2 + e.edge * 0.4, sight: 80 },
  owl: { name: 'great horned owl', cat: 'bird', cls: 'owl', active: 'nocturnal', abundance: 0.35, max: 1, rest: 150, habitat: (e) => e.forest * 0.8 + e.edge * 0.6, sight: 30 },

  // ── Insects ────────────────────────────────────────────────────────────
  bees: { name: 'bumblebees', cat: 'insect', cls: 'bees', active: 'diurnal', abundance: 1, max: 2, habitat: (e) => Math.max(0, e.meadow - 0.35) * 2.2, sight: 4 },
  butterflies: { name: 'butterflies', cat: 'insect', cls: 'butterflies', active: 'diurnal', abundance: 0.9, max: 2, habitat: (e) => Math.max(0, e.meadow - 0.25) * 1.8 + e.path * 0.2, sight: 8 },
};
for (const [k, s] of Object.entries(SPECIES)) s.kind = k;

// Add a species from outside this file (a feature bringing its own animals).
// `def` is an entry like the ones above; see the notes at the top for what
// each field means, and wildlife.js for the classes of animal (`cls`).
export function defineSpecies(kind, def) {
  if (SPECIES[kind]) throw new Error(`species "${kind}" is already defined`);
  if (!CATEGORIES[def.cat]) throw new Error(`species "${kind}": no such category "${def.cat}"`);
  SPECIES[kind] = { ...def, kind };
  return SPECIES[kind];
}

// Population per category at density 1: at most this many groups at once,
// and on average one new arrival every `every` seconds while there's room.
// `near`/`far`: how far away (m) they turn up — always out of view.
// `rest`: after one arrives, the least time (s) before another of the same
// kind (an owl passing over every few seconds would be no owl at all).
export const CATEGORIES = {
  big: { cap: 2, every: 40, near: 55, far: 95, rest: 90 },
  small: { cap: 3, every: 10, near: 14, far: 30, rest: 15 },
  herp: { cap: 2, every: 35, near: 12, far: 26, rest: 60 },
  bird: { cap: 3, every: 9, near: 40, far: 70, rest: 20 },
  insect: { cap: 3, every: 15, near: 12, far: 30, rest: 40 },
};
