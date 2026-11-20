// The kinds of town the forest has, in one table, and the buildings they're
// made of. No three.js in here: the tests read it, and the map asks it what to
// call a town.
//
// A town has a *style* — how it's built: a western town of false fronts and
// boardwalks, a village of painted cottages round a green, a tall dark town in
// the woods — and a *kind*, which is a style in some condition, with or
// without people:
//
//   label     what it is, in a word or two ('western town')
//   a         ...with an article, for prompts ('a western town')
//   style     a key of STYLES: how its streets and buildings are laid out
//   abandoned nobody has lived there for years: roofs fallen in, boards gone
//   weight    how often it's chosen, against the others, where several fit
//   forest    [min, max] how wooded its middle may be (0 meadow .. 1 deep woods)
//   people    [chance there are any, fewest, most]
//   notes     a line about it for the map, with people about and without
//   glyph     7×7 pixels for the map
//
// A style:
//   street    [shortest, longest] its main street (m)
//   half      half the street's width (m)
//   setback   from the edge of the street to the front of a lot (m)
//   gap       [least, most] between one lot and the next (m)
//   must      lots every town of the style tries to have, in a random order
//   fill      ...and what fills the rest of the street
//   green     a lot kept near the middle of the street (a village green)
//   ends      what stands past the far end of the street: [type, chance]
//   edges     what stands where the road comes in: [type, chance]
//   lean      how far its buildings lean (radians, most)
//   clearing  'all': the woods are cleared from the whole town;
//             'plan': only from under its buildings and its street

export const KINDS = {
  western: {
    label: 'western town',
    a: 'a western town',
    style: 'western',
    abandoned: false,
    weight: 3,
    forest: [0, 0.62],
    people: [0.75, 6, 10],
    notes: ['a frontier town: a saloon, a store and a livery, and folk about', 'a frontier town, every building standing, its doors open and not a soul in it'],
    glyph: ['.#####.', '.#...#.', '.#####.', '#######', '#.#.#.#', '#.#.#.#', '#######'],
  },
  ghost: {
    label: 'ghost town',
    a: 'a ghost town',
    style: 'western',
    abandoned: true,
    weight: 2.4,
    forest: [0, 0.7],
    people: [0, 0, 0],
    notes: ['a frontier town nobody has lived in for fifty years, and the wind goes through it', 'a frontier town nobody has lived in for fifty years, and the wind goes through it'],
    glyph: ['.##.#..', '.#...#.', '.##.##.', '###.###', '#.....#', '#.#.#.#', '##.####'],
  },
  village: {
    label: 'village',
    a: 'a village',
    style: 'village',
    abandoned: false,
    weight: 3,
    forest: [0.05, 0.75],
    people: [0.85, 6, 11],
    notes: ['a village of painted cottages round a green, and people about', 'a tidy village, its doors open and nobody home'],
    glyph: ['.....#.', '.#..###', '###..#.', '###.###', '#.#####', '###.#.#', '#######'],
  },
  deserted: {
    label: 'abandoned village',
    a: 'an abandoned village',
    style: 'village',
    abandoned: true,
    weight: 1.4,
    forest: [0.1, 0.95],
    people: [0, 0, 0],
    notes: ['a village left to the weeds: roofs fallen in, gardens gone wild', 'a village left to the weeds: roofs fallen in, gardens gone wild'],
    glyph: ['.....#.', '.#..#.#', '#.#..#.', '#.#.#.#', '#.#.#.#', '#.#.#.#', '##.#.##'],
  },
  eerie: {
    label: 'eerie town',
    a: 'an eerie town',
    style: 'creepy',
    abandoned: false,
    weight: 2,
    forest: [0.35, 1],
    people: [0.6, 3, 6],
    notes: ['an old town in the dark woods, and somebody is always watching', 'an old town in the dark woods; its windows are dark, mostly'],
    glyph: ['...#...', '..###..', '..#.#..', '.##.##.', '#.###.#', '#.#.#.#', '#######'],
  },
};

export const KIND_IDS = Object.keys(KINDS);

export const STYLES = {
  western: {
    street: [72, 112],
    half: 7,
    setback: 0.3,
    gap: [0.4, 2.6],
    must: ['saloon', 'store', 'jail', 'bank', 'livery', 'hotel', 'smithy'],
    fill: ['store', 'house', 'shack', 'store', 'house'],
    ends: [['church', 0.55], ['graveyard', 0.6]],
    edges: [['tower', 0.85], ['windpump', 0.6]],
    lean: 0,
    clearing: 'all',
  },
  village: {
    street: [70, 100],
    half: 4.5,
    setback: 0.8,
    gap: [2.5, 6],
    must: ['shop', 'inn', 'smithy'],
    fill: ['house', 'house', 'house', 'house', 'shop'],
    green: 'green',
    ends: [['church', 0.8], ['graveyard', 0.7]],
    edges: [['well', 0.5]],
    lean: 0,
    clearing: 'all',
  },
  creepy: {
    street: [56, 84],
    half: 3.6,
    setback: 1.2,
    gap: [3, 9],
    must: [],
    fill: ['tall', 'tall', 'house', 'tall', 'shack'],
    ends: [['church', 0.9], ['graveyard', 1]],
    edges: [['well', 0.4]],
    lean: 0.035,
    clearing: 'plan',
  },
};

// The buildings, each laid out in its own frame like an old place
// (landmarks/kinds.js): x across its front, z from back to front, the front
// towards +z, facing the street.
//   w, d      [least, most] across its front and from back to front (m),
//             with whatever is in front of it (a boardwalk, a garden)
//   front     how much of d is in front of the walls: a porch, a boardwalk,
//             a garden, which grass and people may be on
//   slope     the most the ground may fall across it (m)
//   label     what it is, for prompts ('a saloon')
export const BUILDINGS = {
  store: { w: [5.6, 7], d: [9.5, 11], front: 2.3, slope: 1.5, label: 'a store' },
  saloon: { w: [8, 9.4], d: [11, 12.5], front: 2.5, slope: 1.4, label: 'a saloon' },
  hotel: { w: [8.6, 10], d: [10, 11.5], front: 2.5, slope: 1.4, label: 'a hotel' },
  bank: { w: [6, 7], d: [8.5, 9.5], front: 1.1, slope: 1.1, label: 'a bank' },
  jail: { w: [5.6, 6.4], d: [8, 9], front: 2.2, slope: 1.3, label: "the sheriff's office" },
  livery: { w: [9.4, 10.6], d: [11.5, 13], front: 0.6, slope: 1.5, label: 'a livery stable' },
  smithy: { w: [6, 7], d: [7, 8], front: 0.6, slope: 1.1, label: 'a smithy' },
  shack: { w: [4.2, 5], d: [5.6, 6.6], front: 1.3, slope: 1.6, label: 'a shack' },
  house: { w: [7, 8.4], d: [10.5, 12.5], front: 4.2, slope: 1.6, label: 'a house' },
  shop: { w: [6, 7], d: [9, 10], front: 1.4, slope: 1.3, label: 'a shop' },
  inn: { w: [9, 10.4], d: [10.5, 11.5], front: 1.8, slope: 1.3, label: 'an inn' },
  tall: { w: [6.2, 7.2], d: [9, 10.5], front: 2.2, slope: 1.6, label: 'a tall house' },
  church: { w: [7, 8], d: [14, 15.5], front: 1.4, slope: 1.6, label: 'a church' },
  green: { w: [17, 20], d: [11, 13], front: 0, slope: 2.4, label: 'the green' },
  graveyard: { w: [11, 14], d: [9, 12], front: 0, slope: 2.6, label: 'a graveyard' },
  tower: { w: [4.4, 4.4], d: [4.4, 4.4], front: 0, slope: 1.6, label: 'a water tower' },
  windpump: { w: [4.6, 4.6], d: [5, 5], front: 0, slope: 1.2, label: 'a windpump' },
  well: { w: [3, 3], d: [3, 3], front: 0, slope: 0.8, label: 'a well' },
};

// What a town is called, made up from parts the way towns are named.
export const NAMES = {
  western: {
    first: ['Dry', 'Red', 'Copper', 'Silver', 'Dust', 'Bitter', 'Lone', 'Broken', 'Iron', 'Coyote', 'Sweetwater', 'Mesa', 'Sundown', 'Rattler', 'Buzzard', 'Cottonwood', 'Juniper', 'Calico', 'Sagebrush', 'Saddle', 'Hangman', 'Antelope'],
    last: [' Gulch', ' Creek', ' Springs', ' Flats', ' Bluff', ' Bend', ' Wells', ' Junction', ' Butte', ' Ridge', ' Fork', ' Crossing', ' Canyon', ' Draw'],
  },
  village: {
    first: ['Maple', 'Fair', 'Brook', 'Meadow', 'Lark', 'Honey', 'Willow', 'Cherry', 'Bramble', 'Clover', 'Primrose', 'Hazel', 'Apple', 'Linden', 'Bluebell', 'Thistle', 'Rose', 'Elder', 'Moss', 'Wren', 'Sorrel', 'Hollin'],
    last: ['field', 'side', 'haven', 'brook', 'ford', 'ton', 'wick', 'dale', 'mead', 'by', 'combe', 'well', 'stow', 'hurst'],
  },
  creepy: {
    first: ['Raven', 'Crow', 'Gallows', 'Black', 'Hollow', 'Grim', 'Weeping', 'Ashen', 'Mourn', 'Wither', 'Hush', 'Bleak', 'Shade', 'Murk', 'Bone', 'Dusk', 'Gloam', 'Cinder', 'Thorn', 'Nettle', 'Widow', 'Rook'],
    last: ['moor', 'haven', 'hollow', ' Hill', 'dell', 'wood', 'mere', 'fen', 'gate', 'ford', 'stead', 'marsh', ' Rest', ' End'],
  },
};
