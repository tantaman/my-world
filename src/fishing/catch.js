// What bites, where and when: worked out from the water where the float lies
// and the hour, so it can be tested without a game.
//
// The fish are the ones that swim in the lakes and the sea (underwater/fish.js):
// perch, brown trout and pike in fresh water; herring, mackerel and sea bass
// in the sea. Minnows are too small to take a hook. A school swimming near
// the float makes a bite come sooner, and it's most likely one of them that
// takes it. Fish feed best at dawn and dusk, less in the heat of the day, and
// least at night; and better in deeper water than in the shallows.

import { FISH } from '../underwater/fish.js';
import { lerp, smoothstep } from '../noise.js';

// What takes a hook, and how it fights: its strength, as the length (m) of a
// fish that pulls as hard as an average one.
const PULL = 0.35;
export const CATCHABLE = Object.keys(FISH).filter((k) => FISH[k].len[1] >= 0.15);

export const BITE = {
  every: 26, // seconds between bites, on average, in good water at a good hour
  least: 4, // ...never sooner than this after the float lands
  school: 8, // m: a school this near the float is round it
  schoolFaster: 3, // ...and makes a bite come this many times sooner
  schoolTakes: 0.75, // ...and it's this likely one of them that takes it
  big: 0.06, // the odds of an old one, bigger than most
  kg: 9, // kg per cubic metre of length: how heavy a fish of a length is
};

// How the hour suits a fish: feeding at dawn and dusk, slow at midday, and
// slower still in the dark. hour: 0..24
export function hourly(hour) {
  const dawn = Math.max(0, 1 - Math.abs(hour - 6.5) / 2);
  const dusk = Math.max(0, 1 - Math.abs(hour - 19.5) / 2);
  const day = hour > 7 && hour < 19 ? 0.75 : 0.45;
  return day + 0.95 * Math.max(dawn, dusk);
}

// How the water suits them: better the deeper it is, up to a few metres.
export function deepness(depth) {
  return 0.2 + 0.8 * smoothstep(0.4, 3, depth);
}

// Bites a second, where the float lies.
//   depth  m of water under it     hour  0..24     school  a school round it?
export function biteRate({ depth, hour, school = false }) {
  return (hourly(hour) * deepness(depth) * (school ? BITE.schoolFaster : 1)) / BITE.every;
}

// Which fish takes the bait, and how big it is.
//   sea    whether it's the sea     depth  m of water
//   school the kind of a school round the float, if any
//   rand   () -> 0..1
// -> { kind, name, len (m), kg, strength } or null if nothing here takes a hook
export function whatBites({ sea, depth, school = null, rand = Math.random }) {
  let kind = null;
  if (school && CATCHABLE.includes(school) && FISH[school].sea === !!sea && rand() < BITE.schoolTakes) kind = school;
  if (!kind) {
    const here = CATCHABLE.filter((k) => FISH[k].sea === !!sea);
    // each by how common it is, and how much it likes water this deep
    const w = here.map((k) => {
      const [lo, hi] = FISH[k].depth;
      const suits = depth < lo ? Math.max(0.15, depth / lo) : depth > hi ? 0.5 : 1;
      return FISH[k].abundance * suits;
    });
    const total = w.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    let r = rand() * total;
    kind = here[here.length - 1];
    for (let i = 0; i < here.length; i++) {
      r -= w[i];
      if (r <= 0) {
        kind = here[i];
        break;
      }
    }
  }
  return sized(kind, rand);
}

// A fish of `kind`: most are middling, a few small, and now and then an old
// one bigger than any of them.
export function sized(kind, rand = Math.random) {
  const f = FISH[kind];
  const [lo, hi] = f.len;
  let len = lerp(lo, hi, Math.pow(rand(), 1.4));
  if (rand() < BITE.big) len = hi * lerp(1.05, 1.3, rand());
  len = Math.round(len * 100) / 100;
  return { kind, name: nameOf(kind), len, kg: Math.round(BITE.kg * len * len * len * 100) / 100, strength: Math.max(0.5, Math.min(2.6, len / PULL)) };
}

// 'a brown trout', 'a yellow perch', 'a herring'
export function nameOf(kind) {
  const n = FISH[kind].name;
  return /^an? /.test(n) ? n : `a ${n.replace(/s$/, '')}`;
}

// "a brown trout, 38 cm (0.5 kg)"
export function describe(fish) {
  const kg = fish.kg < 1 ? `${Math.round(fish.kg * 1000 / 10) * 10} g` : `${fish.kg.toFixed(1)} kg`;
  return `${fish.name}, ${Math.round(fish.len * 100)} cm (${kg})`;
}
