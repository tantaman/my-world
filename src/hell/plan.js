// The plan of Hell, as the Inferno gives it: a pit, round, going down in
// rings to a point. Everything here is a number or a name; land.js turns it
// into ground.
//
// It is measured from its own axis (r, m) and from its own top (heights, m,
// all negative: the vestibule's floor is 0). From the rock that shuts it in,
// inward and down:
//
//   the vestibule     a dark plain inside the door            (Canto III)
//   Acheron           the river Charon ferries the dead over
//   1  Limbo          a slope, then a meadow, and a castle with seven walls (IV)
//   2  the lustful    bare rock, and the wind                  (V)
//   3  the gluttons   mud under rain, hail and snow            (VI)
//   4  the avaricious and the prodigal, rolling weights        (VII)
//   5  Styx           a marsh; the wrathful in it, the sullen under it (VII–VIII)
//      Dis            the city's wall, along the marsh's far shore (VIII–IX)
//   6  the heretics   a plain of burning tombs                 (X–XI)
//      the ruin       a landslide down a cliff                 (XII)
//   7  the violent    a river of boiling blood; a wood; a plain of burning sand (XII–XVII)
//      the great cliff, which only Geryon gets you down        (XVI–XVII)
//   8  Malebolge      ten ditches, ring within ring, with bridges of rock over them (XVIII–XXX)
//      the well       inside a last bank, with the giants standing round in it (XXXI)
//   9  Cocytus        a lake of ice, in four zones, and at its middle Lucifer (XXXII–XXXIV)
//
// "Thou knowest the place is round," Virgil says in the seventh circle, "and
// notwithstanding thou hast journeyed far ... thou hast not yet through all
// the circle turned." Here nobody ever does: from the vestibule down to the
// burning sand a circle does not close. Go round one and you never come back
// to where you were — the angle keeps counting (see land.js). Malebolge, the
// well and the lake are the one place they are in the poem.

export const TAU = Math.PI * 2;

// Radii (m from the axis), outermost first.
export const R = {
  wall: 4760, // the rock all round; the door is in it
  acheronOut: 4560,
  acheronIn: 4440,
  limboFoot: 4330, // where the slope down from the river levels out
  c1: 4040, // the inner edge of each circle, where it drops to the next
  c2: 3760,
  c3: 3480,
  c4: 3200,
  dis: 2720, // the city's wall, on the far shore of Styx
  c6: 2400, // the ruin
  bloodOut: 2330,
  bloodIn: 2250, // Phlegethon lies between these; the wood begins
  wood: 1900, // the wood ends; the sand begins
  brink: 1450, // the great cliff
  bolge: 1350, // the outer bank of the first ditch
  bank: 550, // the inner edge of the last ditch: from here in, the bank that girds the well
  well: 520, // the lip of the well
  shelf: 470, // where the giants' shelf meets the ice
};

// Heights (m below the vestibule's floor).
export const H = {
  vestibule: 0,
  acheron: -2.2, // the river's surface
  limbo: -36,
  c2: -96,
  c3: -156,
  c4: -216,
  styx: -260.6, // the marsh's surface
  dis: -257,
  c7: -377,
  blood: -378, // Phlegethon's surface
  bolge: -757, // the foot of the great cliff
  lip: -827, // the well's lip
  shelf: -841,
  ice: -841, // at the shelf, and
  centre: -880, // at Lucifer
};

// The drops between circles, outermost first. A face `w` m across in plan
// goes from `hi` to `lo` at radius `at`. Where there is a way down, it is a
// ramp `half` m either side of its line, falling `slope` per metre, cut
// `back` m into the upper circle and fanned out over the lower one.
export const STEPS = [
  { id: 'c1', at: R.c1, hi: H.limbo, lo: H.c2, w: 20, pass: { slope: 0.5, back: 40, half: 5 } },
  { id: 'c2', at: R.c2, hi: H.c2, lo: H.c3, w: 20, pass: { slope: 0.5, back: 40, half: 5 } },
  { id: 'c3', at: R.c3, hi: H.c3, lo: H.c4, w: 20, pass: { slope: 0.5, back: 40, half: 5 } },
  { id: 'c4', at: R.c4, hi: H.c4, lo: H.styx + 0.9, w: 30, pass: { slope: 0.5, back: 40, half: 4 } },
  { id: 'ruin', at: R.c6, hi: H.dis, lo: H.c7, w: 26, pass: { slope: 0.52, back: 166, half: 9 } },
  { id: 'brink', at: R.brink, hi: H.c7, lo: H.bolge, w: 34, pass: null },
];

// From the vestibule to the sand, the rings are cut into sectors this wide,
// each with its own ways down, landings and sights; there is no last one.
export const SECTORS = 40; // to a turn
export const SECTOR = TAU / SECTORS;
// Inside this radius there is one of everything, as in the poem.
export const ONE = R.brink;

// Malebolge: ten ditches. Ditch i has its outer bank's top from
// bolgeOuter(i) inward for `bank` m, then the ditch, `ditch` m across at the
// top, with walls `wall` m across in plan and a floor `deep` m below its
// inner bank. The
// whole field tilts toward the well, `tilt` m lower with each ditch.
export const BOLGE = { n: 10, pitch: 80, bank: 28, ditch: 52, wall: 8, deep: 20, tilt: 7, spokes: 10, deck: 3, rise: 5, broken: 5 };
export const bolgeOuter = (i) => R.bolge - i * BOLGE.pitch;
export const bankTop = (i) => H.bolge - i * BOLGE.tilt;

// Cocytus: the four zones, by their outer radius, outermost first.
export const ZONES = [
  { id: 'caina', r: R.shelf },
  { id: 'antenora', r: 370 },
  { id: 'ptolomea', r: 240 },
  { id: 'judecca', r: 120 },
];

// Liquids, by the number the land gives a place (0: none).
export const LIQUID = { none: 0, acheron: 1, styx: 2, blood: 3, pitch: 4, filth: 5, brook: 6, slush: 7 };
// Deeper than this (m) and you can't wade it.
export const WADE = 0.95;

// The regions of the plan, outermost first: each from its inner radius `r`
// out to the one before it. `air` is what the place looks like to be in:
//   zen, hor   the dark overhead and the murk at eye level (linear light)
//   glow       the light that comes up out of the pit, toward the middle
//   amb, gnd   the light on things from above and from below
//   sight      how far you can see (m)
//   lit        how bright the eye makes it
export const REGIONS = [
  {
    id: 'vestibule',
    r: R.acheronOut,
    air: { zen: [0.004, 0.004, 0.006], hor: [0.03, 0.028, 0.03], glow: [0.05, 0.035, 0.03], amb: [0.1, 0.1, 0.12], gnd: [0.05, 0.04, 0.04], sight: 620, lit: 2.2 },
  },
  {
    id: 'acheron',
    r: R.acheronIn,
    air: { zen: [0.004, 0.005, 0.007], hor: [0.028, 0.03, 0.034], glow: [0.04, 0.035, 0.035], amb: [0.09, 0.1, 0.12], gnd: [0.04, 0.04, 0.045], sight: 520, lit: 2.2 },
  },
  {
    id: 'limbo',
    circle: 1,
    r: R.c1,
    air: { zen: [0.006, 0.008, 0.014], hor: [0.04, 0.046, 0.058], glow: [0.07, 0.05, 0.04], amb: [0.14, 0.16, 0.2], gnd: [0.05, 0.055, 0.05], sight: 1500, lit: 2.1 },
  },
  {
    id: 'lustful',
    circle: 2,
    r: R.c2,
    air: { zen: [0.003, 0.003, 0.006], hor: [0.022, 0.022, 0.032], glow: [0.06, 0.035, 0.03], amb: [0.085, 0.085, 0.115], gnd: [0.035, 0.03, 0.035], sight: 520, lit: 2.3 },
  },
  {
    id: 'gluttons',
    circle: 3,
    r: R.c3,
    air: { zen: [0.004, 0.005, 0.005], hor: [0.026, 0.03, 0.028], glow: [0.05, 0.035, 0.03], amb: [0.085, 0.1, 0.095], gnd: [0.035, 0.035, 0.03], sight: 360, lit: 2.3 },
  },
  {
    id: 'avaricious',
    circle: 4,
    r: R.c4,
    air: { zen: [0.004, 0.004, 0.004], hor: [0.032, 0.028, 0.024], glow: [0.08, 0.045, 0.03], amb: [0.11, 0.1, 0.09], gnd: [0.05, 0.04, 0.03], sight: 760, lit: 2.2 },
  },
  {
    id: 'styx',
    circle: 5,
    r: R.dis,
    air: { zen: [0.004, 0.004, 0.003], hor: [0.03, 0.03, 0.02], glow: [0.16, 0.05, 0.02], amb: [0.085, 0.09, 0.07], gnd: [0.04, 0.04, 0.025], sight: 560, lit: 2.2 },
  },
  {
    id: 'heretics',
    circle: 6,
    r: R.c6,
    air: { zen: [0.006, 0.003, 0.002], hor: [0.06, 0.028, 0.016], glow: [0.2, 0.07, 0.025], amb: [0.11, 0.08, 0.07], gnd: [0.12, 0.05, 0.025], sight: 900, lit: 2.0 },
  },
  {
    id: 'blood',
    circle: 7,
    ring: 1,
    r: R.bloodIn,
    air: { zen: [0.006, 0.003, 0.002], hor: [0.06, 0.024, 0.016], glow: [0.2, 0.06, 0.03], amb: [0.11, 0.075, 0.07], gnd: [0.13, 0.035, 0.02], sight: 1000, lit: 2.0 },
  },
  {
    id: 'wood',
    circle: 7,
    ring: 2,
    r: R.wood,
    air: { zen: [0.003, 0.003, 0.003], hor: [0.022, 0.022, 0.018], glow: [0.1, 0.05, 0.025], amb: [0.07, 0.075, 0.065], gnd: [0.03, 0.028, 0.02], sight: 420, lit: 2.3 },
  },
  {
    id: 'sand',
    circle: 7,
    ring: 3,
    r: R.brink + 80,
    air: { zen: [0.007, 0.004, 0.002], hor: [0.055, 0.028, 0.014], glow: [0.16, 0.07, 0.03], amb: [0.13, 0.09, 0.07], gnd: [0.2, 0.1, 0.04], sight: 1300, lit: 1.9 },
  },
  {
    // the last of the sand, at the edge: you see down into the pit from here
    id: 'brink',
    circle: 7,
    ring: 3,
    r: R.brink - 17,
    air: { zen: [0.006, 0.004, 0.004], hor: [0.04, 0.03, 0.028], glow: [0.12, 0.07, 0.05], amb: [0.13, 0.1, 0.09], gnd: [0.16, 0.09, 0.05], sight: 2300, lit: 2.0 },
  },
  {
    id: 'malebolge',
    circle: 8,
    r: R.well,
    air: { zen: [0.004, 0.004, 0.005], hor: [0.036, 0.032, 0.034], glow: [0.1, 0.06, 0.05], amb: [0.11, 0.105, 0.115], gnd: [0.06, 0.045, 0.04], sight: 1700, lit: 2.1 },
  },
  {
    id: 'well',
    r: R.shelf,
    air: { zen: [0.003, 0.004, 0.006], hor: [0.03, 0.036, 0.046], glow: [0.04, 0.06, 0.09], amb: [0.1, 0.115, 0.14], gnd: [0.06, 0.075, 0.095], sight: 1000, lit: 2.1 },
  },
  {
    id: 'cocytus',
    circle: 9,
    r: 0,
    air: { zen: [0.003, 0.005, 0.01], hor: [0.036, 0.05, 0.07], glow: [0.05, 0.08, 0.12], amb: [0.12, 0.15, 0.2], gnd: [0.1, 0.14, 0.2], sight: 900, lit: 2.0 },
  },
];

// The region a radius is in.
export function regionAt(r) {
  for (const g of REGIONS) if (r >= g.r) return g;
  return REGIONS[REGIONS.length - 1];
}

// Which ditch of Malebolge a radius is over (0..9), or -1; and in out, how
// far across it you are (u: 0 at the outer bank's edge .. 1 at the inner).
export function bolgiaAt(r, out = null) {
  if (r >= R.bolge || r < R.well) return -1;
  if (r < R.bank) return -1; // on the bank round the well
  const i = Math.min(BOLGE.n - 1, Math.floor((R.bolge - r) / BOLGE.pitch));
  const into = bolgeOuter(i) - r - BOLGE.bank;
  if (out) out.u = into / BOLGE.ditch;
  return into > 0 ? i : -1;
}

// The zone of Cocytus a radius is in (0..3), or -1 outside the ice.
export function zoneAt(r) {
  if (r >= R.shelf) return -1;
  let z = 0;
  for (let i = 1; i < ZONES.length; i++) if (r < ZONES[i].r) z = i;
  return z;
}
