// Who lives at the zoo: each kind of animal its exhibits have, by the name
// the map gives the exhibit (or the species it says lives in it), what it
// looks like (bodies.js: a body and what to make it of), how many of them
// there are, how much room they want where the map has only a point for
// them, and what fence keeps them in (fences.js).
//
// A kind:
//   match     what an exhibit's name or species must say (lower case)
//   name      what one of them is called
//   body      bodies.js's: cat, bear, hoof, elephant, ape, monkey, small,
//             seal, bird, perch, hop, reptile
//   look      what the body is made of: its size and colours (bodies.js)
//   count     [least, most] in an exhibit
//   total     at the most, in the whole zoo (two pandas, whatever the pens)
//   room      m round the point the map gives, for a pen grown round it
//   fence     fences.js's kind, or null for none (a moat, a building's wall)
//   swims     lives in the water of its pen (the seals, the otters)
//   pace      m/s it ambles at
//   voice     its call (sound.js), now and then
//
// An exhibit no kind matches (Tiger Tracks, the Butterfly Garden, a sign
// about growing up a tiger) has its sign and nothing in it.

export const KINDS = [
  // ── the big cats, on Lion/Tiger Hill and at the Cheetah Conservation Station
  { match: /(?<!sea )\blion\b/, name: 'lion', body: 'cat', look: { size: 1.12, coat: 0xc29a5c, belly: 0xe6d2a6, mane: 0x5e3a20, tuft: 0x2a1c12 }, count: [2, 3], fence: 'tall', pace: 0.8, voice: 'zoo-roar' },
  { match: /sumatran tiger/, name: 'Sumatran tiger', body: 'cat', look: { size: 0.9, coat: 0xb8621c, belly: 0xf2e8d6, stripes: 0x16100c, dense: 1.3 }, count: [1, 2], fence: 'tall', pace: 0.85 },
  { match: /\btiger\b/, name: 'tiger', body: 'cat', look: { size: 1.02, coat: 0xd2782a, belly: 0xf4ece0, stripes: 0x16100c }, count: [1, 2], fence: 'tall', pace: 0.85 },
  { match: /cheetah/, name: 'cheetah', body: 'cat', look: { size: 0.86, lean: 0.72, coat: 0xd9b46e, belly: 0xf0e2c0, spots: 0x17120d, tears: true }, count: [2, 3], fence: 'mesh', pace: 1 },
  { match: /clouded leopard/, name: 'clouded leopard', body: 'cat', look: { size: 0.58, coat: 0xaa9270, belly: 0xd8ccb0, blotches: 0x3a2a1c, tail: 1.3 }, count: [1, 2], fence: 'tall', pace: 0.6 },
  { match: /fishing cat/, name: 'fishing cat', body: 'cat', look: { size: 0.42, coat: 0x8c8674, belly: 0xc8c0aa, spots: 0x2a241c }, count: [1, 1], fence: 'mesh', pace: 0.5 },
  { match: /lynx/, name: 'Canada lynx', body: 'cat', look: { size: 0.62, coat: 0xa69c8c, belly: 0xd8d2c6, spots: 0x6a6052, tufts: true, tail: 0.25 }, count: [1, 2], fence: 'mesh', pace: 0.6 },
  { match: /bobcat/, name: 'bobcat', body: 'cat', look: { size: 0.52, coat: 0x9a7854, belly: 0xe0d4c0, spots: 0x4a3420, tufts: true, tail: 0.22 }, count: [1, 1], fence: 'mesh', pace: 0.6, room: 7 },
  { match: /pallas/, name: "Pallas's cat", body: 'cat', look: { size: 0.36, coat: 0x9c968c, belly: 0xc8c2b8, stripes: 0x5a544c, fluffy: true, tail: 0.6 }, count: [1, 1], fence: 'mesh', pace: 0.4, room: 5 },
  // ── bears, and those that aren't
  { match: /red panda/, name: 'red panda', body: 'small', look: { size: 0.3, len: 0.6, coat: 0xb24a1c, legs: 0x1c1410, face: 0xf0e8dc, rings: 0x7a2c12, tail: 0.45, ears: 0.05 }, count: [2, 2], fence: 'mesh', pace: 0.4 },
  { match: /giant panda|\bpanda\b(?! house)/, name: 'giant panda', body: 'bear', look: { size: 0.8, coat: 0xece8e0, panda: 0x121212 }, count: [1, 1], total: 2, fence: 'wall', pace: 0.45 },
  { match: /sloth bear/, name: 'sloth bear', body: 'bear', look: { size: 0.85, coat: 0x141210, shag: true, chest: 0xe6dcc4, snout: 0xb0a490 }, count: [1, 2], fence: 'wall', pace: 0.55 },
  { match: /andean bear|spectacled/, name: 'Andean bear', body: 'bear', look: { size: 0.78, coat: 0x1c1814, specs: 0xdcc896, snout: 0xc8b48a }, count: [1, 1], total: 2, fence: 'wall', pace: 0.5 },
  // ── the elephants of Elephant Trails
  { match: /asian elephant|elephant(?! community| learning| overlook)/, name: 'Asian elephant', body: 'elephant', look: { size: 2.6, coat: 0x6c6460 }, count: [3, 4], total: 5, fence: 'wall', pace: 0.7, voice: 'zoo-trumpet' },
  // ── hoofed, and the Kids' Farm
  { match: /grevy/, name: "Grévy's zebra", body: 'hoof', look: { form: 'horse', size: 1.4, coat: 0xf2f0ea, stripes: 0x111111, narrow: true, mane: 0x1a1a1a }, count: [2, 2], fence: 'mesh', room: 16, pace: 0.9 },
  { match: /zebra/, name: 'zebra', body: 'hoof', look: { form: 'horse', size: 1.3, coat: 0xf0eee8, stripes: 0x111111, mane: 0x1a1a1a }, count: [2, 3], fence: 'mesh', room: 16, pace: 0.9 },
  { match: /przewalski/, name: "Przewalski's horse", body: 'hoof', look: { form: 'horse', size: 1.3, coat: 0xb48c5a, belly: 0xe2d0a8, mane: 0x2a2018, legs: 0x2a2018, muzzle: 0xe8dcc0 }, count: [2, 2], fence: 'mesh', pace: 0.9 },
  { match: /addax/, name: 'addax', body: 'hoof', look: { form: 'antelope', size: 1.0, coat: 0xd6cdbc, face: 0x6a5038, horns: 'spiral', hornLen: 0.75 }, count: [2, 3], fence: 'mesh', pace: 0.7 },
  { match: /kudu/, name: 'lesser kudu', body: 'hoof', look: { form: 'antelope', size: 1.0, coat: 0x8a7a66, belly: 0xe8e0d0, bands: 0xf0ece0, horns: 'spiral', hornLen: 0.6 }, count: [2, 2], fence: 'mesh', room: 14, pace: 0.7 },
  { match: /sitatunga/, name: 'sitatunga', body: 'hoof', look: { form: 'antelope', size: 0.95, coat: 0x6a4a2c, bands: 0xd8ccb0, horns: 'twist', hornLen: 0.55 }, count: [2, 2], fence: 'mesh', pace: 0.6 },
  { match: /alpaca/, name: 'alpaca', body: 'hoof', look: { form: 'camelid', size: 0.95, coat: 0xe6d6bc, fluffy: true }, count: [2, 3], fence: 'rail', room: 9, pace: 0.6 },
  { match: /\bgoat/, name: 'goat', body: 'hoof', look: { form: 'goat', size: 0.65, coat: 0xece6da, horns: 'goat', hornLen: 0.18 }, count: [2, 3], fence: 'rail', room: 7, pace: 0.6 },
  { match: /\bcow\b|cattle/, name: 'cow', body: 'hoof', look: { form: 'cow', size: 1.3, coat: 0xf2eee6, patches: 0x1a1816 }, count: [1, 2], fence: 'rail', room: 9, pace: 0.5 },
  { match: /\bpig\b/, name: 'pig', body: 'hoof', look: { form: 'pig', size: 0.6, coat: 0xe8b8a6 }, count: [2, 2], fence: 'rail', room: 6, pace: 0.5 },
  { match: /donkey/, name: 'donkey', body: 'hoof', look: { form: 'horse', size: 1.05, coat: 0x8a8278, belly: 0xd8d2c8, muzzle: 0xd8d2c8, mane: 0x3a3632, ears: 2.4 }, count: [1, 2], fence: 'rail', room: 8, pace: 0.6 },
  { match: /wallaby/, name: 'wallaby', body: 'hop', look: { size: 0.75, coat: 0x8a7a68, belly: 0xd0c6b6 }, count: [3, 4], fence: 'mesh', room: 10, pace: 0.6 },
  // ── the American Trail
  { match: /\bwolf/, name: 'gray wolf', body: 'small', look: { form: 'wolf', size: 0.7 }, count: [2, 2], fence: 'mesh', room: 10, pace: 0.8 },
  { match: /beaver/, name: 'North American beaver', body: 'small', look: { size: 0.3, len: 0.75, coat: 0x5a3a22, tail: 0.3, flatTail: true, ears: 0.02 }, count: [2, 2], fence: 'wall', swims: true, pace: 0.35 },
  { match: /asian small[- ]clawed otter|small clawed/, name: 'Asian small-clawed otter', body: 'small', look: { size: 0.18, len: 0.6, coat: 0x6a4a32, face: 0xd8c8a8, tail: 0.3, ears: 0.015 }, count: [4, 5], fence: 'wall', swims: true, pace: 0.6 },
  { match: /otter/, name: 'North American river otter', body: 'small', look: { size: 0.24, len: 0.85, coat: 0x4a3424, face: 0xa89478, tail: 0.4, ears: 0.015 }, count: [2, 3], fence: 'wall', swims: true, pace: 0.7 },
  { match: /prairie dog/, name: 'prairie dog', body: 'small', look: { size: 0.12, len: 0.32, coat: 0xb08e62, tail: 0.08, ears: 0.012, upright: true }, count: [8, 10], fence: 'wall', pace: 0.5 },
  { match: /porcupine/, name: 'porcupine', body: 'small', look: { size: 0.25, len: 0.65, coat: 0x3a3028, quills: 0xd8d0c0, tail: 0.15, ears: 0.01 }, count: [1, 1], fence: 'mesh', room: 5, pace: 0.25 },
  { match: /binturong/, name: 'binturong', body: 'small', look: { size: 0.3, len: 0.8, coat: 0x1a1816, face: 0x8a8278, tail: 0.65, ears: 0.03 }, count: [1, 1], fence: 'mesh', room: 5, pace: 0.3 },
  { match: /bat[- ]eared fox/, name: 'bat-eared fox', body: 'small', look: { form: 'fox', size: 0.36, coat: 0xa89478, legs: 0x2a2420, ears: 0.12 }, count: [2, 2], fence: 'mesh', pace: 0.7 },
  // ── the apes and the monkeys
  { match: /gorilla/, name: 'western lowland gorilla', body: 'ape', look: { size: 1.0, coat: 0x1c1a1a, back: 0x8a8884, face: 0x101010 }, count: [3, 4], fence: 'wall', room: 12, pace: 0.5 },
  { match: /orangutan/, name: 'Bornean orangutan', body: 'ape', look: { size: 0.85, coat: 0xa2481c, face: 0x5a3a2a, long: true }, count: [1, 2], fence: 'wall', room: 9, pace: 0.4 },
  { match: /lemur/, name: 'ring-tailed lemur', body: 'monkey', look: { size: 0.3, coat: 0x9a9690, belly: 0xece8e0, face: 0xf0ece6, mask: 0x1a1a1a, rings: 0x1a1a1a, tail: 0.6 }, count: [4, 5], fence: 'mesh', room: 8, pace: 0.5 },
  { match: /howler/, name: 'black howler monkey', body: 'monkey', look: { size: 0.38, coat: 0x141210, tail: 0.65 }, count: [2, 2], fence: 'mesh', room: 7, pace: 0.35 },
  { match: /swamp monkey/, name: "Allen's swamp monkey", body: 'monkey', look: { size: 0.32, coat: 0x5a5a4e, belly: 0xb8b0a0, tail: 0.5 }, count: [2, 3], fence: 'mesh', pace: 0.4 },
  // ── the seals and sea lions of the American Trail
  { match: /sea lion/, name: 'California sea lion', body: 'seal', look: { size: 2.0, coat: 0x4a3626 }, count: [3, 4], fence: null, swims: true, pace: 2.2, voice: 'zoo-honk' },
  { match: /gray seal|grey seal/, name: 'gray seal', body: 'seal', look: { size: 2.1, coat: 0x6e6c68, mottle: 0x3a3836, seal: true }, count: [2, 3], fence: null, swims: true, pace: 1.6 },
  // ── birds that walk
  { match: /flamingo/, name: 'American flamingo', body: 'bird', look: { form: 'flamingo', size: 1.3, coat: 0xf08a7a, wing: 0xe8604c, legs: 0xe87a6a, beak: 0x1a1a1a }, count: [8, 10], fence: 'mesh', pace: 0.35 },
  { match: /ostrich/, name: 'ostrich', body: 'bird', look: { form: 'ratite', size: 2.3, coat: 0x1c1a18, wing: 0xf0ece4, neck: 0xd8b8a8, legs: 0xd8b0a0 }, count: [2, 2], fence: 'mesh', pace: 0.8 },
  { match: /rhea/, name: 'greater rhea', body: 'bird', look: { form: 'ratite', size: 1.5, coat: 0x8a8478, wing: 0x8a8478, neck: 0x7a746a, legs: 0x9a9080 }, count: [2, 2], fence: 'mesh', pace: 0.7 },
  { match: /cassowary/, name: 'cassowary', body: 'bird', look: { form: 'ratite', size: 1.6, coat: 0x101010, wing: 0x101010, neck: 0x2a6ab8, wattle: 0xc81e1e, casque: 0x8a7a50, legs: 0x5a5448 }, count: [1, 1], fence: 'mesh', pace: 0.6 },
  { match: /kori bustard/, name: 'kori bustard', body: 'bird', look: { form: 'stork', size: 1.1, coat: 0x8a7a5c, wing: 0x6a5e48, neck: 0xc8c4bc, legs: 0xc8b890, beak: 0x8a7a5c }, count: [1, 2], fence: 'mesh', pace: 0.4 },
  { match: /whooping crane/, name: 'whooping crane', body: 'bird', look: { form: 'stork', size: 1.45, coat: 0xf6f4ee, wing: 0xf6f4ee, neck: 0xf6f4ee, crown: 0xc81e1e, legs: 0x2a2a2a, beak: 0x6a6450 }, count: [2, 2], fence: 'mesh', pace: 0.4 },
  { match: /seriema/, name: 'red-legged seriema', body: 'bird', look: { form: 'stork', size: 0.85, coat: 0xa89a80, wing: 0x8a7c66, neck: 0xc8bca4, legs: 0xc8402a, beak: 0xc8402a }, count: [1, 2], fence: 'mesh', pace: 0.5 },
  { match: /ground hornbill/, name: 'Abyssinian ground hornbill', body: 'bird', look: { form: 'stork', size: 1.05, coat: 0x141414, wing: 0x141414, neck: 0x2a4aa8, legs: 0x1a1a1a, beak: 0x1a1a1a, casque: 0x1a1a1a }, count: [1, 2], fence: 'mesh', room: 8, pace: 0.4 },
  { match: /curassow/, name: 'blue-billed curassow', body: 'bird', look: { form: 'fowl', size: 0.85, coat: 0x121214, wing: 0x121214, belly: 0xf0ece4, legs: 0x5a5a5a, beak: 0x3a6ac8 }, count: [1, 2], fence: 'mesh', pace: 0.4 },
  { match: /chicken/, name: 'chicken', body: 'bird', look: { form: 'fowl', size: 0.45, coat: 0xb8682c, wing: 0x8a4a1c, legs: 0xd8b040, comb: 0xc81e1e, beak: 0xd8b040 }, count: [4, 6], fence: 'rail', room: 6, pace: 0.4 },
  { match: /water ?fowl|duck/, name: 'duck', body: 'bird', look: { form: 'duck', size: 0.4, coat: 0x8a7a64, wing: 0x6a5a48, neck: 0x1a5a3a, legs: 0xd8802a, beak: 0xd8b040 }, count: [4, 6], fence: 'mesh', swims: true, pace: 0.3 },
  // ── birds that sit
  { match: /bald eagle/, name: 'bald eagle', body: 'perch', look: { like: 'hawk', len: 0.85, span: 2.0, plumage: { back: 0x3a2618, wing: 0x34241a, wingUnder: 0x3a2a1e, head: 0xf4f2ec, breast: 0x3a2818, belly: 0x3a2818, tail: 0xf2f0ea, beak: 0xe8c030, legs: 0xe8c030 } }, count: [2, 2], fence: 'mesh', pace: 0 },
  { match: /king vulture/, name: 'king vulture', body: 'perch', look: { like: 'hawk', len: 0.75, span: 1.8, plumage: { back: 0xe8e0d0, wing: 0x1a1a1a, wingUnder: 0x1a1a1a, head: 0xd86a2a, breast: 0xece4d4, belly: 0xece4d4, tail: 0x1a1a1a, beak: 0xd84a2a, legs: 0x8a8a8a, cheek: 0x8a3aa8 } }, count: [1, 1], fence: 'mesh', pace: 0 },
  { match: /barred owl/, name: 'barred owl', body: 'perch', look: { like: 'owl', len: 0.5, span: 1.1, plumage: { back: 0x7a6a58, wing: 0x7a6a58, wingUnder: 0xd8ccb8, head: 0x8a7a66, breast: 0xd8ccb8, belly: 0xd8ccb8, tail: 0x6a5a48, beak: 0xd8c060, legs: 0xc8b890, eye: 0x1a1410, tufts: 0x8a7a66, cheek: 0xc8bca8 } }, count: [1, 1], fence: 'mesh', pace: 0 },
  { match: /screech owl/, name: 'eastern screech owl', body: 'perch', look: { like: 'owl', len: 0.22, span: 0.5, plumage: { back: 0x6a645c, wing: 0x6a645c, wingUnder: 0xb8b0a4, head: 0x7a746a, breast: 0xa8a094, belly: 0xb8b0a4, tail: 0x5a544c, beak: 0x8a8a6a, legs: 0x8a8070, eye: 0xe8c020, tufts: 0x5a544c, cheek: 0x9a9488 } }, count: [1, 1], fence: 'mesh', room: 4, pace: 0 },
  { match: /raven/, name: 'common raven', body: 'perch', look: { like: 'crow', len: 0.6, span: 1.2, plumage: { back: 0x101116, wing: 0x0e0f14, wingUnder: 0x14151a, head: 0x101116, breast: 0x121318, belly: 0x14151a, tail: 0x0e0f14, beak: 0x0a0a0c, legs: 0x0c0c0e } }, count: [2, 2], fence: 'mesh', pace: 0 },
  // ── reptiles out of doors
  { match: /komodo/, name: 'Komodo dragon', body: 'reptile', look: { size: 2.6, coat: 0x6a6450 }, count: [1, 1], fence: 'wall', pace: 0.2 },
  { match: /alligator/, name: 'Chinese alligator', body: 'reptile', look: { size: 1.6, coat: 0x2e3026 }, count: [1, 2], fence: 'wall', swims: true, pace: 0.15 },
];

// Exhibits that are about an animal and not of it: the signs along the
// Great Cats' trail, the Kids' Farm's corral, an overlook.
const ABOUT = /tracks|survival|compare|growing up|cat scan|kid'?s stop|caring corral|overlook|viewing|learning|house|center|trail/;

// What lives in an exhibit (a kind, above), by its name and what the map says
// lives there; or null.
export function kindOf(exhibit) {
  const name = (exhibit.name || '').toLowerCase();
  if (ABOUT.test(name)) return null;
  const said = `${exhibit.species || ''}|${name}`.toLowerCase();
  for (const k of KINDS) if (k.match.test(said)) return k;
  return null;
}
