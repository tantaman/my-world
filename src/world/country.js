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
//              rubble  0..1: how far its bare ground is broken stone (talus,
//                      scree), in blocks, rather than fine cinder or dirt
//              shelf   m in from the sea that is bare rock whatever else
//              layers  for sandstone country (or banded gneiss): the beds a
//                      cliff is cut through. { upper, at, bed, varnish }: the rock is
//                      `rock` low down and `upper` above `at` (real m over
//                      the sea), as a canyon's red walls turn white towards
//                      the rim; laid in beds about `bed` real m thick, swept
//                      the way the dunes that made them were; and streaked
//                      dark down its faces (varnish, 0..1). null: plain rock
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
//   names    what its trees are called, where that isn't what the forest
//            calls them: { broad: ['kamani', 'a kamani'] }
//   slim     how much slimmer a kind of tree grows here than the forest's
//            own, as a share of its width: { pine: 0.45 } makes a spire of
//            a spruce
//   tints    what colour a kind of plant (or stone) is here, as what the
//            forest's own colour is multiplied by: { rock: [1.4, 1.4, 1.3] }
//   treeline [from, to]: the real heights (m above the sea) over which the
//            trees thin out to none, and the ground above is thin turf among
//            stones; or null for none
//   snowline [from, to]: the real heights over which snow comes to lie on all
//            the gentle ground, in drifts at first; or null for none
//
// Each also gets an id, its place in the table: the ground carries it vertex
// by vertex, so the shaders, which are handed every country's colours, know
// whose to use (render/uniforms.js has room for MAX_COUNTRIES).
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
    rubble: 0,
    shelf: 0,
    layers: null,
  },
  trees: null,
  under: null,
  rocks: 0.26,
  shore: 'beach',
  clouds: { deck: null, cover: 0, shade: 0 },
  haze: 1,
  animals: null,
  names: {},
  slim: {},
  tints: {},
  treeline: null,
  snowline: null,
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
    names: { broad: ['ʻōhiʻa', 'an ʻōhiʻa'] },
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
    names: { broad: ['kamani', 'a kamani'] },
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
    names: { broad: ['kamani', 'a kamani'] },
  }),

  // A desert canyon cut half a kilometre deep into sandstone: sheer red
  // walls turning white towards the rim, red sand and slickrock between
  // scrub, pines on the ledges and the tops, and a muddy river in the
  // bottom. Clear dry air with fair-weather cloud over the rims.
  'red rock canyon': kind({
    ground: {
      tint: [1.35, 0.95, 0.85],
      dirt: [0.3, 0.115, 0.055],
      rock: [0.36, 0.1, 0.04],
      bare: [[0.34, 0.11, 0.045], [0.36, 0.17, 0.09]],
      sand: [0.36, 0.2, 0.11],
      barren: 0.55,
      layers: { upper: [0.52, 0.42, 0.3], at: 1850, bed: 14, varnish: 0.55 },
    },
    trees: [['pine', 0.65], ['broad', 0.35]],
    under: { fern: [], bush: [['bush', 0.85]] },
    rocks: 0.4,
    clouds: { deck: 2600, cover: 0.35, shade: 0.1 },
    haze: 0.6,
    animals: ['deer', 'cougar', 'bobcat', 'fox', 'rabbit', 'squirrel', 'chipmunk', 'mouse', 'snake', 'flock', 'flit', 'crows', 'hawk', 'butterflies'],
    names: { pine: ['ponderosa pine', 'a ponderosa pine'] },
  }),

  // High mountains in the dry interior of a continent (the Tetons, the
  // Rockies): canyons of spruce and subalpine fir, slim and dark, with a few
  // aspens low down and willow thickets in the wet bottoms; talus under
  // granite walls; a treeline at about 3,000 m, and snow lying above it into
  // the summer. The paths are pale grit, the rock pale granite. What covers
  // the land, a hike's map says where it can (landform.js).
  'high mountains': kind({
    ground: {
      tint: [0.74, 0.92, 0.8],
      dirt: [0.25, 0.21, 0.155],
      rock: [0.25, 0.24, 0.22],
      bare: [[0.2, 0.196, 0.18], [0.1, 0.099, 0.09]],
      sand: [0.19, 0.18, 0.155],
      rubble: 1,
      // banded gneiss: ledges by their real height, streaked dark where
      // water runs down, paler up on the peaks
      layers: { upper: [0.3, 0.29, 0.27], at: 3300, bed: 22, varnish: 0.35 },
    },
    trees: [['pine', 0.92], ['birch', 0.08]],
    under: { fern: [['fern', 0.3], ['bush', 0.4]], bush: [['bush', 1]] },
    rocks: 0.42,
    haze: 0.8,
    names: { pine: ['spruce', 'a spruce'], birch: ['aspen', 'an aspen'] },
    slim: { pine: 0.5 },
    tints: { rock: [1.45, 1.43, 1.36], pine: [0.85, 0.9, 0.95], bush: [0.62, 0.72, 0.66] },
    treeline: [2950, 3250],
    snowline: [3050, 3750],
  }),
};

// Every country, by its id (the forest is 0).
export const COUNTRIES = Object.values(COUNTRY);
COUNTRIES.forEach((c, id) => {
  c.id = id;
});

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
