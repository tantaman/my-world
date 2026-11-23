// The plan of Purgatory, as the Purgatorio gives it: an island alone in the
// southern ocean, and on it a mountain, "the hill that highest tow'rds the
// heaven uplifts itself". Everything here is a number or a name; land.js
// turns it into ground.
//
// It is measured from the mountain's axis (r, m) and from the sea (heights,
// m: the sea's surface is 0). A place is a radius and an angle (th, radians)
// from where the hidden road out of Hell comes up, on the shore. The way up
// goes round to the right, as the poem's does ("our dexter shoulders it
// behoves us turn, circling the mount as we are wont to do"): facing the
// mountain, the right is the way the angle falls.
//
//   the shore         a beach, rushes in the ooze where the billow beats it (Canto I)
//   the plain         "the solitary plain", rising gently to the foot   (I–II)
//   the foot          a cliff all round; the excommunicate wait under it (III)
//   the cleft         up through the rock, "and feet and hands the ground
//                     beneath required"                                (IV)
//   the terrace       "a terrace somewhat higher, which on that side
//                     encircles all the hill"; Belacqua behind his rock  (IV)
//   the slope         the long hillside, the late-repentant crossing it  (V–VI)
//   the valley        a lap in the hillside, full of flowers            (VII–VIII)
//   the ledge         at the foot of "the cliff that closes it around",
//                     and the gate in it, three steps up               (IX)
//   the needle's eye  a cleft through the rock, winding               (X)
//   1–7 the terraces  each "a human body three times told" wide, round the
//                     mountain, a stair cut in the bank up to the next (X–XXVII)
//   the forest        the Earthly Paradise, on the top; Lethe and Eunoë (XXVIII–XXXIII)
//
// Unlike Hell's circles, these close: there is one mountain, and one of
// everything on it, as in the poem. And it is climbed, not fallen down.

export const TAU = Math.PI * 2;

// Radii (m from the axis), outermost first.
export const R = {
  reach: 2700, // past this, the sea is too deep to go out into: you can't
  shore: 2400, // where the land meets the sea
  sand: 2350, // the beach gives way to the plain
  foot: 2000, // the foot of the cliff that rings the mountain
  brow: 1984, // its top
  terrace: 1900, // the inner edge of the terrace above it, where the slope begins
  ledge: 1000, // the slope ends at the ledge round the foot of the great cliff
  cliff: 955, // the foot of the great cliff (and the gate)
};

// Heights (m over the sea).
export const H = {
  plain: 2, // the plain at the top of the beach
  foot: 16, // at the foot of the cliff
  terrace: 64, // the terrace above it
  ledge: 330, // the ledge round the great cliff, and the gate
};

// The seven terraces, from the bottom: each a ledge round the mountain, its
// outer edge at r (where "its margin borders on the void") and its floor at
// h, WIDE m across to the foot of the bank that rises to the next. Between
// each and the next a bank BANK m high, RUN m across in plan: too steep to
// climb, but for its stair. The first stands on the great cliff over the
// ledge; the forest of the top stands on the seventh's bank.
export const WIDE = 5.3; // "a human body three times told" (Canto X)
export const BANK = 46; // m: from one terrace to the next
export const RUN = 18; // m across in plan
const FIRST = { r: 935, h: 380 };
export const TERRACES = [];
for (let i = 0; i < 7; i++) TERRACES.push({ i, r: FIRST.r - i * (WIDE + RUN), h: FIRST.h + i * BANK });
// The top: the Earthly Paradise, from its rim inward, a gentle rise to the middle.
export const TOP = { r: TERRACES[6].r - WIDE - RUN, h: TERRACES[6].h + BANK, rise: 6 };

// The ways up, and where things are, as angles (0: where the road out of
// Hell comes up). The way goes always to the right: each further on is at a
// lower angle.
export const AT = {
  burrow: 0, // the hidden road's mouth, on the plain above the beach
  cato: 0.012, // Cato, beside it
  cleft: -0.035, // the cleft up through the cliff at the foot
  rock: -0.022, // Belacqua's rock, on the terrace above, to the left of where the cleft comes out
  valley: -0.22, // the valley of the princes
  gate: -0.38, // the gate in the great cliff
};

// Where the hidden road comes up: a mouth in a knoll of rock on the plain,
// open toward the sea, `half` m either side of its line; its back, where
// the dark is, `back` m from the knoll's middle (+ toward the sea), and
// the knoll `rad` m across.
export const BURROW = { r: 2335, half: 1.6, back: -1.2, rad: 17 };

// The cleft at the foot (Canto IV): a slot cut up through the cliff, from
// its foot on the plain to the terrace at `r1`, `half` m either side of its
// line, its sides `side` m from top to bottom.
export const CLEFT = { r1: 1926, half: 1.6, side: 1.4 };

// The valley of the princes: a lap in the hillside, `rad` m across its
// floor, which lies `sunk` m under where the slope is at its middle.
export const VALLEY = { r: 1330, rad: 85, edge: 45, sunk: 7 };

// The gate (Canto IX): three steps up to a threshold, at the foot of a
// crevice in the great cliff: each step `rise` m high and `tread` m deep,
// `half` m either side, rising over `riser` m of its tread (or nobody could
// walk up it). The door is in the crevice, as wide as the needle's eye
// behind it, and `height` m high.
export const GATE = { steps: 3, rise: 0.42, tread: 1.3, riser: 0.7, half: 3.2, height: 6 };

// The stairs up the banks: the needle's eye from the gate to the first
// terrace, and a stair from each terrace to the next (the seventh's to the
// top). Each is a slot cut slantwise up its bank, `half` m either side of
// its line, `run` m long round the mountain. It goes in level from the
// floor at its foot, `lag` m into the bank, and then climbs keeping that far
// in from the bank's face, so there is rock on both sides of it all the way
// up; it comes out `lag` m in from the edge of the floor at its head. The
// needle's eye winds as it goes ("which undulated to this side and that,
// even as a wave"): `wave` m either way, `waves` times.
export const STAIR = { half: 1.35, run: 76, lag: 3.2, wave: 0, waves: 0 };
export const NEEDLE = { half: 1.25, run: 84, lag: 5.0, wave: 0.8, waves: 3 };
// How far on round (rad) from where you come up onto a terrace its stair is.
export const GAPS = [0.42, 0.4, 0.38, 0.38, 0.4, 0.4, 0.42];

// The ways up, from the bottom: each { from, to, a0, a1, ra, rb, h0, h1,
// run, half, lag, wave, waves }: from the floor at ra, h0 (the lower terrace's
// inner edge) up to the floor at rb, h1 (the upper's outer edge), from angle
// a0 to a1. ways[0] is the needle's eye (the ledge to the first terrace);
// ways[i] goes from terrace i to terrace i + 1 (ways[7]: to the top).
export function waysUp() {
  const ways = [];
  const add = (from, a0, ra, h0, rb, h1, kind) => {
    const mid = (ra + rb) / 2;
    const a1 = a0 - kind.run / mid;
    ways.push({ from, to: from + 1, a0, a1, ra, rb, h0, h1, run: kind.run, half: kind.half, lag: kind.lag, wave: kind.wave, waves: kind.waves });
    return a1;
  };
  // the needle's eye starts at the gate's threshold, at the foot of the great cliff
  let a = add(0, AT.gate, R.cliff, H.ledge + GATE.steps * GATE.rise, TERRACES[0].r, TERRACES[0].h, NEEDLE);
  for (let i = 0; i < 7; i++) {
    const t = TERRACES[i];
    const up = i < 6 ? TERRACES[i + 1] : { r: TOP.r, h: TOP.h };
    a = add(i + 1, a - GAPS[i], t.r - WIDE, t.h, up.r, up.h, STAIR);
  }
  return ways;
}
export const WAYS = waysUp();

// The top (Cantos XXVIII–XXXIII): the forest, and across it the stream
// that springs from one fountain and runs two ways, Lethe one way and Eunoë
// the other, each to the rim, where it goes down into the mountain (Lethe,
// they say, all the way down to the bottom of Hell). Its line crosses the
// forest a little beyond the middle, seen from where the last stair comes
// up, and square to that; the fountain is off to the right of the way in,
// so whoever walks straight in meets Lethe, running to the left.
export const STREAM = { beyond: 120, spring: 210, half: 2.1, deep: 0.75, bank: 3.5, pool: 7 };

// Liquids, by the number the land gives a place (0: none).
export const LIQUID = { none: 0, sea: 1, lethe: 2, eunoe: 3, spring: 4 };
// Deeper than this (m) and you can't wade it.
export const WADE = 0.95;

// Which way the sun comes up (the world angle, from +x toward +z, of where
// the sky puts it at DAY.rise: world/sky.js). The road out of Hell comes up
// on that side of the island.
export const EAST = 0.715;

// The day on the mountain: its own, whatever the hour in the forest. The
// sun that "in our rear was flaming red" keeps its own hours here, at the
// far side of the world, and the poem keeps count of them.
export const DAY = {
  minutes: 30, // how long a day takes, start to end
  arrive: 5.2, // the hour you first come out of the burrow: night still, the four stars
  wake: 6.4, // the hour you wake, after a night's sleep: the sun just up
  lucia: 8.3, // after Lucia carries you to the gate: "the sun was more than two hours high"
  set: 17.8, // after this hour (before `rise`) it's night, and nobody climbs
  rise: 6.2,
  sleep: 5, // s standing still at night before sleep takes you
  slack: 1.5, // m over where you were at sunset that you can still go, at night
};

// The regions, by id: what each is, for the card and the air.
//   smoke    how thick the air is with something of its own (0..1)
export const REGIONS = {
  shore: {},
  plain: {},
  foot: {},
  terrace: {},
  slope: {},
  valley: {},
  ledge: {},
  pride: { terrace: 0 },
  envy: { terrace: 1 },
  wrath: { terrace: 2, smoke: 1 },
  sloth: { terrace: 3 },
  avarice: { terrace: 4 },
  gluttony: { terrace: 5 },
  lust: { terrace: 6 },
  eden: {},
};
export const TERRACE_IDS = ['pride', 'envy', 'wrath', 'sloth', 'avarice', 'gluttony', 'lust'];

// Which terrace (0..6) a height above the great cliff is at, -1 under the
// first, 7 at the top: you're on the one whose floor you're over, and on a
// stair you're still on the one you climbed from until you're nearly up.
export function terraceAt(h) {
  if (h < TERRACES[0].h - 3) return -1;
  if (h >= TOP.h - 3) return 7;
  return Math.min(6, Math.floor((h - TERRACES[0].h + 3) / BANK));
}

// The region at (r, th), height h: its id.
export function regionAt(r, th, h) {
  if (r > R.sand) return 'shore';
  if (r > R.foot + 40) return 'plain';
  if (r > R.foot) return 'foot';
  if (r > R.terrace) return h < H.foot + 20 ? 'foot' : 'terrace';
  if (r > R.ledge) {
    const dx = r - VALLEY.r;
    const dy = (th - AT.valley) * r;
    return Math.hypot(dx, dy) < VALLEY.rad + VALLEY.edge * 0.4 ? 'valley' : 'slope';
  }
  const t = terraceAt(h);
  if (t < 0) return 'ledge';
  return t > 6 ? 'eden' : TERRACE_IDS[t];
}
