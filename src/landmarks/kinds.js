// The kinds of old building the forest has, in one table: what each is
// called, how common it is, where it suits, how much ground it covers, and
// the little glyph the map draws for it. No three.js in here.
//
// Each kind is laid out in its own frame: x across, z from back to front, and
// the front (the door, the far end of a dock, a canoe's bow) towards +z. A
// site turns that frame to face something: a footpath, a meadow, the water.
//
//   label     what it is, in a word or two ('old cabin')
//   a         ...with an article, for prompts ('an old cabin')
//   note      a line about it, for the map
//   names     how a site of this kind is named; {s} is a family name
//   weight    how often it's chosen, against the others, where several fit
//   search    how a spot is looked for: 'land', 'shore' (still water, out
//             over it) or 'bank' (pulled up beside water)
//   plan      rectangles [x0, z0, x1, z1] (m, its own frame) it stands on:
//             plants are kept off them, building goes round them, and the
//             map draws them close up
//   bare      rectangles where no grass grows: under a floor, in a tent
//   shape     rectangles the map draws close up: a roof, a tent, a deck
//   level     the rectangle whose corners are checked for slope...
//   slope     ...and the most the ground may fall across it (m)
//   forest    [min, max] how wooded it may be (0 meadow .. 1 deep woods)
//   path      [min, max] metres from the edge of a footpath
//   dry       how many metres from water it keeps
//   face      what its front turns to: 'path', 'meadow', 'water', 'downhill'
//   glyph     7×7 pixels for the map

export const KINDS = {
  cabin: {
    label: 'old cabin',
    a: 'an old cabin',
    note: 'a log cabin nobody has lived in for years',
    names: ['{s} cabin', 'old {s} cabin'],
    weight: 4,
    search: 'land',
    plan: [[-3.6, -2.6, 3.6, 4.4]],
    bare: [[-2.5, -2.1, 2.5, 2.1]],
    shape: [[-2.95, -2.55, 2.95, 2.55], [2.7, -0.55, 3.55, 0.55]],
    level: [-2.6, -2.2, 2.6, 2.2],
    slope: 1.2,
    forest: [0.3, 0.92],
    path: [5, 35],
    dry: 10,
    face: 'path',
    glyph: ['.....#.', '..#..#.', '.#####.', '#######', '.#...#.', '.#.#.#.', '.#.#.#.'],
  },
  ruin: {
    label: 'ruined homestead',
    a: 'a ruined homestead',
    note: "what's left of a homestead: a few courses of wall and the chimney",
    names: ['{s} homestead', 'old {s} place'],
    weight: 2,
    search: 'land',
    plan: [[-3.0, -2.5, 3.6, 2.6]],
    bare: [],
    shape: [[-2.8, -2.4, 2.8, 2.4], [2.7, -0.55, 3.55, 0.55]],
    level: [-2.6, -2.2, 2.6, 2.2],
    slope: 0.9,
    forest: [0.08, 0.85],
    path: [4, 60],
    dry: 8,
    face: 'path',
    glyph: ['#......', '#......', '#...#..', '#.#.#.#', '#.#.###', '###.###', '#######'],
  },
  hunting: {
    label: 'hunting cabin',
    a: 'a hunting cabin',
    note: 'a hunting cabin at the edge of the woods, looking out over open ground',
    names: ['{s} hunting cabin', "{s}'s hunting cabin"],
    weight: 1.2,
    search: 'land',
    plan: [[-2.2, -2.5, 3.6, 4.4]],
    bare: [[-1.6, -1.9, 1.6, 1.9]],
    shape: [[-1.95, -2.3, 1.95, 2.3]],
    level: [-1.7, -2.0, 1.7, 2.0],
    slope: 1.4,
    forest: [0.35, 0.85],
    path: [6, 90],
    dry: 8,
    face: 'meadow',
    glyph: ['#.#.#.#', '.##.##.', '...#...', '.#####.', '#######', '.#.#.#.', '.#.#.#.'],
  },
  camp: {
    label: 'tent',
    a: 'a tent',
    note: 'a tent pitched by a fire ring, and nobody about',
    names: ["{s}'s camp", '{s} camp'],
    weight: 3,
    search: 'land',
    plan: [[-1.8, -3.0, 2.3, 3.2]],
    bare: [
      [-1.1, -2.3, 1.1, 0.3],
      [-0.9, 1.3, 0.9, 3.1],
    ],
    shape: [[-1.0, -2.2, 1.0, 0.2], [-0.55, 1.65, 0.55, 2.75]],
    level: [-1.2, -2.4, 1.2, 2.8],
    slope: 0.9,
    forest: [0, 0.8],
    path: [3, 90],
    dry: 9,
    near: 160, // ...but within this many metres of water
    face: 'water',
    glyph: ['...#...', '..#.#..', '..#.#..', '.#.#.#.', '.#.#.#.', '#..#..#', '#######'],
  },
  well: {
    label: 'well',
    a: 'a well',
    note: 'an old stone well with a windlass and a bucket',
    names: ['{s} well', 'old {s} well'],
    weight: 2,
    search: 'land',
    plan: [[-1.3, -1.1, 1.3, 1.1]],
    bare: [[-1.1, -1.1, 1.1, 1.1]],
    shape: [[-0.8, -0.8, 0.8, 0.8]],
    level: [-1.0, -1.0, 1.0, 1.0],
    slope: 0.5,
    forest: [0, 0.45],
    path: [3, 22],
    dry: 12,
    face: 'path',
    glyph: ['.#####.', '#######', '.#...#.', '.#...#.', '#######', '#.....#', '#######'],
  },
  dock: {
    label: 'dock',
    a: 'a dock',
    note: 'a dock out into the water, and a rowboat tied up at the end of it',
    names: ['{s} dock', "{s}'s landing"],
    weight: 3, // only where there is still water
    search: 'shore',
    // the plan and bare ground depend on how long the dock is (see sites.js)
    plan: [],
    bare: [],
    shape: [],
    glyph: ['#######', '#######', '.#...#.', '.......', '.##.##.', '#..#..#', '.......'],
  },
  canoe: {
    label: 'canoe',
    a: 'a canoe',
    note: 'a canoe pulled up on the bank and turned over, a paddle beside it',
    names: ["{s}'s canoe", '{s} canoe'],
    weight: 4,
    search: 'bank',
    plan: [[-1.0, -2.5, 1.0, 2.5]],
    bare: [],
    shape: [[-0.43, -2.3, 0.43, 2.3]],
    level: [-0.5, -2.3, 0.5, 2.3],
    slope: 1.8,
    glyph: ['....#..', '....#..', '#...#.#', '##.#.##', '.#####.', '..###..', '.......'],
  },
};

export const KIND_IDS = Object.keys(KINDS);

// Family names for sites, made up in the way that old places are named for
// whoever lived or hunted there.
export const SURNAMES = [
  'Hollis', 'Ashby', 'Mercer', 'Pruitt', 'Calloway', 'Hadley', 'Burke', 'Dunmore', 'Tolliver', 'Whitcomb',
  'Kessler', 'Lindqvist', 'Marsh', 'Garrity', 'Abernathy', 'Fenwick', 'Haskins', 'Ostrander', 'Pike', 'Rourke',
  'Sorensen', 'Talbot', 'Vance', 'Wexford', 'Yates', 'Bramwell', 'Corliss', 'Dacey', 'Ellery', 'Frame',
  'Gilchrist', 'Hartigan', 'Iverson', 'Jessup', 'Kincaid', 'Larkin', 'Mabry', 'Nyland', 'Orcutt', 'Pellerin',
  'Quimby', 'Rasmussen', 'Starkweather', 'Thibodeau', 'Underhill', 'Vickery', 'Winslow', 'Aldous', 'Birdsall', 'Coombs',
];
