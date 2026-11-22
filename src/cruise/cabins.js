// What's in a stateroom, grown from the world's seed and its number, so
// everyone in a world finds the same room behind the same door: its colours,
// whether anyone's staying in it, whether the bed's made, whose luggage is
// where, the towel animal the steward left on the bed, the sign on the door.
//
// No three.js in here: the tests read it.
//
//   stateroom(seed, cabin) -> {
//     no, kind, palette ({ carpet, wall, wood, fabric, accent } as 0xRRGGBB),
//     taken      someone's staying in it
//     dnd        a "do not disturb" on the door: it won't open
//     made       the bed's made (the steward has been)
//     towel      'swan', 'elephant', 'monkey' or null, on the bed
//     cases      how many suitcases, and where (0–3)
//     robe       a bathrobe over the chair
//     lit        a lamp left on, after dark
//     fizz       a bottle on ice (the suites)
//   }
//   describe(cabin) -> 'Stateroom 9142 · balcony · deck 9, port side, midships'
//   pickYours(rnd) -> a stateroom number for someone coming aboard

import { mulberry32 } from '../noise.js';
import { cabinsOn, whereAlong } from './plan.js';

export const PALETTES = [
  { name: 'sand', carpet: 0x8a7a64, wall: 0xe8e0d0, wood: 0x8a5a3a, fabric: 0xd8cfc0, accent: 0x2a6a8a },
  { name: 'sea', carpet: 0x3a5a72, wall: 0xe6e8ea, wood: 0x6a4a32, fabric: 0xf2f0ea, accent: 0x3aa0b8 },
  { name: 'coral', carpet: 0x7a5048, wall: 0xf0e6dc, wood: 0x9a6a48, fabric: 0xf4ede4, accent: 0xd8705a },
  { name: 'moss', carpet: 0x5a6248, wall: 0xe8e6da, wood: 0x5a4030, fabric: 0xefece0, accent: 0x6a8a4a },
  { name: 'dusk', carpet: 0x4a4258, wall: 0xe4e0e6, wood: 0x4a3428, fabric: 0xece8ee, accent: 0x8a5aa8 },
];
const TOWELS = ['swan', 'elephant', 'monkey'];
const TAKEN = 0.86; // how many are booked, on a sailing
const DND = 0.07; // how many of those want to be left alone
const MADE = 0.7; // how many beds the steward has done already today
const SALT = 0x5ea7;

export function stateroom(seed, c) {
  const rnd = mulberry32(((seed ^ SALT) + c.no * 2654435761) >>> 0);
  const palette = PALETTES[Math.floor(rnd() * PALETTES.length)];
  const taken = rnd() < TAKEN;
  const dnd = taken && rnd() < DND;
  const made = !taken || rnd() < MADE;
  const towel = made && taken && rnd() < 0.8 ? TOWELS[Math.floor(rnd() * TOWELS.length)] : null;
  const cases = taken ? 1 + Math.floor(rnd() * 3) : 0;
  return {
    no: c.no,
    kind: c.kind,
    palette,
    taken,
    dnd,
    made,
    towel,
    cases,
    robe: taken && rnd() < 0.5,
    lit: taken && rnd() < 0.55,
    fizz: c.kind === 'suite' && rnd() < 0.8,
  };
}

const KIND_SAYS = { inside: 'inside', oceanview: 'ocean view', balcony: 'balcony', suite: 'suite' };
export function describe(c) {
  return `Stateroom ${c.no} · ${KIND_SAYS[c.kind]} · deck ${c.deck}, ${c.side > 0 ? 'port' : 'starboard'} side, ${whereAlong((c.z0 + c.z1) / 2)}`;
}

// A balcony stateroom somewhere on decks 8 to 12, for someone coming aboard.
// rnd: () -> [0, 1).
export function pickYours(rnd = Math.random) {
  const deck = 8 + Math.floor(rnd() * 5);
  const list = cabinsOn(deck).filter((c) => c.kind === 'balcony');
  return list[Math.floor(rnd() * list.length)].no;
}
