// The kinds of country there are, in one table. No three.js in here: the
// chunk workers and the map read it too.
//
// The forest the game grows by itself is one kind of country, and looks the
// way it always has. A real place set into it (landform.js) says what kind of
// country it is, by name, on its card: `country: 'cinder desert'`. That one
// word decides what the ground is made of, what grows there, what the sky
// over it is doing and what lives there, wherever in the game that matters:
//
//   ground   what the ground is made of, as the terrain shader paints it
//              tint    what the grass's green is multiplied by
//              dirt    a trodden path
//              rock    steep ground
//              bare    [a, b]: bare ground (cinder, lava, clay). Where it is
//                      all bare it's a, with drifts of b; a bare patch among
//                      the grass is b
//              sand    a beach
//              barren  0..1: how much of the ground is bare. In between, it
//                      is bare in patches
//              shelf   m in from the sea that is bare rock whatever else
//   trees    [[kind, share], ...]: what the trees are, in place of the
//            forest's own pines, oaks and birches. null: the forest's own
//   under    what stands where the forest would put a fern, or a bush:
//            { fern: [[kind, share], ...], bush: [...] }. A share left over
//            is nothing at all
//   rocks    0..1: how often there is a rock where one could be (the forest: 0.26)
//   shore    'beach': the land comes down gently to the water all round.
//            'rock': it meets the sea as steeply as it really does, with a
//            beach only where the map has one
//   clouds   deck: the real height (m above the sea) of a layer of cloud, or
//                  null for none. Below it you're under a grey sky; above
//                  it, over a sea of cloud
//            cover: 0..1, how much of that layer is cloud
//            shade: 0..1, how much of the sun it takes when you're under it
//   haze     how thick the air is, 1 being the forest's
//   animals  the kinds (wildlife/species.js) that live there, or null for
//            any that like the ground
//
// Colours are linear, as the shaders want them (materials.js); display()
// gives one as the map draws it.

const FOREST = {
  ground: {
    tint: [1, 1, 1],
    dirt: [0.2, 0.135, 0.075],
    rock: [0.16, 0.155, 0.145],
    bare: [[0.2, 0.135, 0.075], [0.115, 0.078, 0.045]],
    sand: [0.19, 0.16, 0.11],
    barren: 0,
    shelf: 0,
  },
  trees: null,
  under: null,
  rocks: 0.26,
  shore: 'beach',
  clouds: { deck: null, cover: 0, shade: 0 },
  haze: 1,
  animals: null,
};

const kind = (over) => ({ ...FOREST, ...over, ground: { ...FOREST.ground, ...over.ground }, clouds: { ...FOREST.clouds, ...over.clouds } });

export const COUNTRY = {
  forest: FOREST,

  // The Pacific north-west: big conifers over ferns and moss, which is what
  // the forest is anyway.
  'temperate rainforest': kind({}),

  // The windward side of a tropical island, up in the rain: every ridge
  // green to the top, the tops in cloud, the paths red clay.
  'cloud forest': kind({
    ground: { tint: [0.95, 1.12, 0.7], dirt: [0.24, 0.1, 0.055], rock: [0.075, 0.07, 0.065], bare: [[0.24, 0.1, 0.055], [0.13, 0.06, 0.04]] },
    trees: [['broad', 1]],
    under: { fern: [['fern', 0.6], ['treefern', 0.4]], bush: [['bush', 0.7], ['treefern', 0.3]] },
    clouds: { deck: 1000, cover: 0.8, shade: 0.35 },
    haze: 1.5,
    animals: ['flock', 'flit', 'bees', 'butterflies', 'mouse'],
  }),

  // The same island down at the shore: palms and ironwoods over a cove,
  // cinder cliffs, black lava at the water.
  'tropical coast': kind({
    ground: {
      tint: [1, 1.05, 0.8],
      dirt: [0.24, 0.1, 0.055],
      rock: [0.2, 0.07, 0.045],
      bare: [[0.035, 0.033, 0.032], [0.075, 0.062, 0.055]],
      sand: [0.15, 0.055, 0.04],
      shelf: 7,
    },
    trees: [['ironwood', 0.45], ['broad', 0.3], ['palm', 0.25]],
    under: { fern: [['fern', 1]], bush: [['bush', 1]] },
    shore: 'rock',
    clouds: { deck: 1300, cover: 0.3, shade: 0.1 },
    animals: ['flock', 'flit', 'bees', 'butterflies', 'mouse'],
  }),

  // A high volcano above the tree line: cinder, red and grey, and nothing on
  // it but the odd silversword. The clouds are below.
  'cinder desert': kind({
    ground: {
      tint: [1.2, 1, 0.6],
      dirt: [0.15, 0.095, 0.07],
      rock: [0.1, 0.075, 0.065],
      bare: [[0.2, 0.085, 0.055], [0.12, 0.095, 0.08]],
      barren: 0.97,
    },
    trees: [],
    under: { fern: [], bush: [['silversword', 0.5]] },
    rocks: 0.45,
    clouds: { deck: 2250, cover: 0.97, shade: 0 },
    haze: 0.35,
    animals: [],
  }),

  // A windward point of old lava: wind-cropped grass and red dirt down to a
  // black shelf the sea breaks on, under a grey sky.
  'lava coast': kind({
    ground: {
      tint: [1.1, 1, 0.68],
      dirt: [0.22, 0.095, 0.055],
      rock: [0.11, 0.07, 0.055],
      bare: [[0.045, 0.04, 0.038], [0.19, 0.085, 0.05]],
      sand: [0.07, 0.06, 0.055],
      barren: 0.3,
      shelf: 16,
    },
    trees: [['ironwood', 0.7], ['broad', 0.3]],
    under: { fern: [], bush: [['bush', 0.6]] },
    rocks: 0.5,
    shore: 'rock',
    clouds: { deck: 650, cover: 0.92, shade: 0.6 },
    haze: 1.3,
    animals: ['flock', 'flit'],
  }),
};

// The country of that name, or the forest.
export const countryOf = (name) => COUNTRY[name] || FOREST;

// One of [[kind, share], ...] for r in 0..1, or null where the shares run out.
export function pick(shares, r) {
  let sum = 0;
  for (const [k, share] of shares) {
    sum += share;
    if (r < sum) return k;
  }
  return null;
}

// A linear colour as the map draws it.
export const display = (c) => c.map((v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
