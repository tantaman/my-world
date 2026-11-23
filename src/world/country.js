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
//            a spruce, and less than 0, broader: { pine: -1.2 } with a small
//            size (sizes) makes a squat juniper
//   tints    what colour a kind of plant (or stone) is here, as what the
//            forest's own colour is multiplied by: { rock: [1.4, 1.4, 1.3] }
//   treeline [from, to]: the real heights (m above the sea) over which the
//            trees thin out to none, and the ground above is thin turf among
//            stones; or null for none
//   riparian what grows by the water, where that differs from what grows
//            away from it (a desert canyon's creek is lined with cottonwoods,
//            its benches and the plateau over it dotted with junipers):
//            { reach, trees, dry }. Within `reach` (m) of a stream's bank or a
//            lake's shore the trees are `trees`; further off they're the
//            country's own `trees`, and only `dry` (0..1) of as many of them.
//            null: the same everywhere
//   sizes    how big a kind of tree grows here, as a share of the forest's
//            own: { pine: 0.3 } with a broad slim makes a juniper of a pine
//   shallows how much of the forest's reeds and lily pads grows in its still
//            shallow water: { reeds, lilies }, 1 being the forest's
//   water    what colour its streams and lakes are, where it isn't the
//            forest's clear brown-green: { shallow, deep, milk }, the colour
//            the water itself sends back over a shallow bed and a deep one,
//            and how milky it is (0..1: how soon it hides the bed). null:
//            the forest's own. (The sea keeps its own blue.)
//   frozen   whether its lakes and streams are frozen over and snowed on, to
//            walk and ski across (not the sea: a place by the sea keeps it all open)
//   snowline [from, to]: the real heights over which snow comes to lie on all
//            the gentle ground, in drifts at first; or null for none. A hike
//            can say otherwise for itself, on its card (a photo taken in
//            winter: landform.js)
//   forms    what a kind of tree is drawn as here, where it isn't the
//            forest's own model: { pine: 'cypress' } (a model of that name:
//            world/index.js). Only how it looks: where it grows, how big,
//            and what it's called are the kind's
//   moss     how much Spanish moss hangs from a kind of tree here, 0..1:
//            { broad: 0.9 }. Each tree of that kind has its own share of it,
//            from a few beards to curtains from every limb (models.js)
//   tidal    whether its water lies at the level of the sea, however the
//            land runs (a delta's bayous and canals, where the tide and not
//            the slope sets the level): an area the map draws a river over
//            is still water from bank to bank, as a lake is, and so is a
//            canal's. The importer reads it (tools/hike/build.js)
//   woods    0..1: how thickly wooded it is where the Earth itself is this
//            country (world/earth.js), as a share of the forest's own woods:
//            a desert none, a savanna a few trees out in the grass. (A hike
//            says how wooded it is for itself, on its card.)
//   lines    { tree, snow }: where the Earth is this country and it says
//            nothing of a treeline or a snow line of its own, how many real
//            metres higher (or lower) than the Earth's own by latitude they
//            lie: a wet coast's snow comes far lower than the latitude's (the
//            Olympics' glaciers), a dry interior's lines stand higher
//
// The land is the real Earth's (world/earth.js), and each part of it is a
// country by its climate: EARTH_COUNTRY, at the end, says which. Where one of
// those says nothing of a treeline or a snow line, the Earth has its own, by
// how far from the equator it is.
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
  riparian: null,
  sizes: {},
  shallows: { reeds: 1, lilies: 1 },
  water: null,
  frozen: false,
  forms: {},
  moss: {},
  tidal: false,
  woods: 1,
  lines: { tree: 0, snow: 0 },
};

// The lines on a wet coast, as the forest's own is (the Pacific north-west):
// the snow lies far lower than the latitude says: from about 1,670 m on the
// Olympics, where their glaciers hold it through the summer (the drier
// Cascades' hold it from 2,000 m or so, but come lower still), and the trees
// give out a little lower.
const WET_COAST = { tree: -250, snow: -900 };

const kind = (over) => ({ ...FOREST, ...over, ground: { ...FOREST.ground, ...over.ground }, clouds: { ...FOREST.clouds, ...over.clouds } });

export const COUNTRY = {
  forest: { ...FOREST, lines: WET_COAST },

  // The Pacific north-west: big conifers over ferns and moss, which is what
  // the forest is anyway.
  'temperate rainforest': kind({ lines: WET_COAST }),

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

  // High mountains in winter, where people go to ski (the Alps in February):
  // snow lying on all of it but the crags, its lakes frozen and snowed over,
  // dark firs in the valleys thinning out to none a little over 2,000 m, the
  // odd bush poking through, and a hard, clear sky.
  'snowy mountains': kind({
    ground: {
      tint: [0.8, 0.88, 0.85],
      dirt: [0.15, 0.115, 0.085],
      rock: [0.11, 0.11, 0.115],
      bare: [[0.13, 0.12, 0.11], [0.09, 0.085, 0.08]],
    },
    trees: [['pine', 1]],
    under: { fern: [], bush: [['bush', 0.06]] },
    rocks: 0.16,
    haze: 0.7,
    animals: ['elk', 'deer', 'fox', 'rabbit', 'wolf', 'crows', 'hawk', 'owl'],
    names: { pine: ['fir', 'a fir'] },
    slim: { pine: 0.35 },
    treeline: [1800, 2050],
    // (all the way down to the sea: it's winter)
    snowline: [-100, 0],
    frozen: true,
  }),

  // A side canyon of the Grand Canyon, where a creek fed by springs runs
  // all year (Havasu Canyon): walls of red sandstone in ledges, pale
  // limestone and sandstone up at the rim, slopes of dry grass, mesquite and
  // catclaw, cottonwoods along the water, and up on the plateau and the dry
  // benches only the odd squat juniper. No reeds or lily pads in its pools:
  // the lime coats everything that would root there. The springs carry so much lime
  // that the creek lays it down as travertine, in terraces and in the
  // drapes the falls pour over, and the water is a milky blue-green that
  // hides its bed a metre down. Summer: thunderheads build over the rims.
  'travertine canyon': kind({
    ground: {
      tint: [1.25, 1.02, 0.7],
      dirt: [0.33, 0.15, 0.07],
      rock: [0.42, 0.13, 0.055],
      bare: [[0.36, 0.13, 0.06], [0.42, 0.3, 0.17]],
      sand: [0.44, 0.34, 0.21],
      barren: 0.45,
      layers: { upper: [0.5, 0.42, 0.31], at: 1450, bed: 7, varnish: 0.45 },
    },
    trees: [['pine', 1]],
    riparian: { reach: 14, trees: [['broad', 1]], dry: 0.3 },
    // (a pine is a tall forest conifer: a juniper is a third as tall, and
    // nearly as broad as it is tall)
    sizes: { pine: 0.3 },
    slim: { pine: -1.2 },
    shallows: { reeds: 0.12, lilies: 0 },
    under: { fern: [['fern', 0.35]], bush: [['bush', 0.9]] },
    rocks: 0.38,
    clouds: { deck: 2900, cover: 0.45, shade: 0.12 },
    haze: 0.65,
    animals: ['deer', 'cougar', 'bobcat', 'fox', 'rabbit', 'squirrel', 'mouse', 'snake', 'flock', 'flit', 'crows', 'hawk', 'butterflies', 'bees'],
    names: { broad: ['cottonwood', 'a cottonwood'], pine: ['juniper', 'a juniper'] },
    tints: { bush: [0.85, 0.95, 0.62], pine: [0.72, 0.85, 0.78] },
    water: { shallow: [0.1, 0.42, 0.4], deep: [0.025, 0.25, 0.3], milk: 0.75 },
  }),

  // The swamps and marshes of a river delta on the Gulf of Mexico (Barataria,
  // in Louisiana): bald cypress and live oak hung with Spanish moss along the
  // bayous, palmettos under them, reeds and floating weed in the still
  // brown water, which mirrors everything. The land is a metre or two over
  // the water at most, black mud where it's bare. A grey morning sky, low
  // and close, and mist on the water. Alligators.
  bayou: kind({
    ground: {
      tint: [0.88, 1.1, 0.68],
      dirt: [0.085, 0.07, 0.05],
      rock: [0.11, 0.1, 0.085],
      bare: [[0.075, 0.062, 0.045], [0.05, 0.043, 0.032]],
      sand: [0.1, 0.085, 0.062],
    },
    trees: [['broad', 0.55], ['pine', 0.45]],
    // (a palmetto is a fern here: low fans of fronds under the trees)
    under: { fern: [['fern', 0.75], ['bush', 0.15]], bush: [['bush', 0.9]] },
    rocks: 0.02,
    clouds: { deck: 320, cover: 0.97, shade: 0.7 },
    haze: 2.6,
    animals: ['alligator', 'deer', 'bobcat', 'fox', 'rabbit', 'squirrel', 'mouse', 'snake', 'flock', 'flit', 'crows', 'hawk', 'owl', 'butterflies'],
    names: { pine: ['bald cypress', 'a bald cypress'], broad: ['live oak', 'a live oak'] },
    sizes: { pine: 1.15 },
    tints: { pine: [1.05, 1.1, 0.85], broad: [0.9, 1.02, 0.8], fern: [0.62, 0.9, 0.82], bush: [0.85, 1.02, 0.72] },
    shallows: { reeds: 1, lilies: 1 },
    water: { shallow: [0.06, 0.052, 0.03], deep: [0.025, 0.026, 0.016], milk: 0.92 },
    forms: { pine: 'cypress' },
    moss: { broad: 0.9, pine: 0.75 },
    tidal: true,
  }),

  // ── The Earth's own ─────────────────────────────────────────────────────
  // What the real Earth is, climate by climate (EARTH_COUNTRY, below, says
  // which climate is which). Broad strokes:
  // each stands for a great deal of the world.

  // Tropical rainforest (the Amazon, the Congo, Borneo): tall broadleaves,
  // closed overhead, palms and tree ferns under them, red clay, and thick wet
  // air under a broken sky.
  jungle: kind({
    lines: { tree: -300, snow: 0 },
    ground: { tint: [0.9, 1.15, 0.66], dirt: [0.26, 0.11, 0.055], rock: [0.1, 0.085, 0.07], bare: [[0.26, 0.11, 0.055], [0.14, 0.065, 0.04]] },
    trees: [['broad', 0.8], ['palm', 0.12], ['ironwood', 0.08]],
    under: { fern: [['fern', 0.55], ['treefern', 0.45]], bush: [['bush', 0.7], ['treefern', 0.3]] },
    sizes: { broad: 1.25 },
    rocks: 0.12,
    clouds: { deck: 1400, cover: 0.55, shade: 0.3 },
    haze: 1.9,
    animals: ['snake', 'mouse', 'flock', 'flit', 'butterflies', 'bees'],
    names: { broad: ['kapok', 'a kapok'], ironwood: ['mahogany', 'a mahogany'] },
  }),

  // Tropical grassland with a dry season (the Serengeti, the llanos, the
  // Top End): tall tawny grass, red earth, and flat-topped trees standing
  // well apart.
  savanna: kind({
    lines: { tree: 0, snow: 300 },
    ground: { tint: [1.45, 1.1, 0.48], dirt: [0.34, 0.14, 0.06], rock: [0.3, 0.16, 0.09], bare: [[0.36, 0.15, 0.065], [0.3, 0.17, 0.09]], sand: [0.4, 0.26, 0.15], barren: 0.15 },
    trees: [['broad', 1]],
    under: { fern: [['bush', 0.3]], bush: [['bush', 0.8]] },
    sizes: { broad: 0.85 },
    slim: { broad: -0.9 },
    rocks: 0.2,
    clouds: { deck: 1800, cover: 0.3, shade: 0.08 },
    haze: 1.2,
    animals: ['snake', 'mouse', 'rabbit', 'flock', 'flit', 'crows', 'hawk', 'butterflies'],
    names: { broad: ['acacia', 'an acacia'] },
    tints: { broad: [1.05, 1.0, 0.72], bush: [1.1, 1.0, 0.7] },
    woods: 0.18,
  }),

  // Hot desert (the Sahara, Arabia, the Mojave): sand and stone, the odd
  // bush, clear dry air and no cloud.
  desert: kind({
    lines: { tree: 500, snow: 700 },
    ground: { tint: [1.5, 1.15, 0.6], dirt: [0.42, 0.3, 0.18], rock: [0.36, 0.22, 0.13], bare: [[0.5, 0.36, 0.21], [0.4, 0.27, 0.15]], sand: [0.52, 0.4, 0.25], barren: 0.94 },
    trees: [],
    under: { fern: [], bush: [['bush', 0.25]] },
    rocks: 0.32,
    haze: 0.55,
    animals: ['snake', 'mouse', 'hawk', 'crows'],
    tints: { bush: [1.1, 0.95, 0.65], rock: [1.5, 1.15, 0.85] },
    woods: 0,
  }),

  // Cold desert and sagebrush steppe (the Great Basin, Patagonia, the Gobi):
  // grey-green sage over pale ground, a juniper here and there, wide skies.
  sagebrush: kind({
    lines: { tree: 700, snow: 700 },
    ground: { tint: [1.2, 1.05, 0.7], dirt: [0.3, 0.25, 0.18], rock: [0.26, 0.22, 0.18], bare: [[0.32, 0.27, 0.2], [0.24, 0.2, 0.15]], sand: [0.38, 0.32, 0.23], barren: 0.5 },
    trees: [['pine', 1]],
    sizes: { pine: 0.3 },
    slim: { pine: -1.2 },
    under: { fern: [['bush', 0.4]], bush: [['bush', 1]] },
    rocks: 0.3,
    clouds: { deck: 3000, cover: 0.2, shade: 0.05 },
    haze: 0.6,
    animals: ['deer', 'elk', 'cougar', 'bobcat', 'fox', 'rabbit', 'mouse', 'snake', 'flock', 'crows', 'hawk'],
    names: { pine: ['juniper', 'a juniper'] },
    tints: { bush: [0.85, 0.95, 0.78], pine: [0.72, 0.85, 0.78] },
    woods: 0.06,
  }),

  // Grassland too dry for woods (the Great Plains, the steppe of Kazakhstan,
  // the Sahel's edge): rolling grass, a line of trees along a creek, a big
  // sky with fair-weather cloud.
  prairie: kind({
    lines: { tree: 500, snow: 500 },
    ground: { tint: [1.3, 1.12, 0.62], dirt: [0.26, 0.19, 0.11], rock: [0.24, 0.2, 0.16], bare: [[0.28, 0.21, 0.13], [0.2, 0.15, 0.1]], barren: 0.08 },
    trees: [['broad', 0.85], ['pine', 0.15]],
    riparian: { reach: 30, trees: [['broad', 1]], dry: 0.35 },
    under: { fern: [['bush', 0.25]], bush: [['bush', 0.7]] },
    rocks: 0.1,
    clouds: { deck: 1600, cover: 0.35, shade: 0.1 },
    haze: 0.8,
    animals: ['deer', 'elk', 'wolf', 'fox', 'rabbit', 'mouse', 'snake', 'flock', 'crows', 'hawk', 'butterflies', 'bees'],
    names: { broad: ['cottonwood', 'a cottonwood'] },
    woods: 0.12,
  }),

  // Summer-dry hills (California, the Mediterranean, the Cape): golden grass
  // and dark scrub, oaks spread out over it and pines on the ridges.
  chaparral: kind({
    lines: { tree: 200, snow: 300 },
    ground: { tint: [1.4, 1.12, 0.55], dirt: [0.32, 0.22, 0.13], rock: [0.3, 0.26, 0.21], bare: [[0.34, 0.24, 0.14], [0.26, 0.18, 0.1]], sand: [0.42, 0.34, 0.24], barren: 0.12 },
    trees: [['broad', 0.75], ['pine', 0.25]],
    under: { fern: [['bush', 0.5]], bush: [['bush', 1]] },
    slim: { broad: -0.5 },
    rocks: 0.28,
    clouds: { deck: 1200, cover: 0.15, shade: 0.05 },
    haze: 0.85,
    animals: ['deer', 'cougar', 'bobcat', 'fox', 'rabbit', 'squirrel', 'mouse', 'snake', 'flock', 'flit', 'crows', 'hawk', 'owl', 'butterflies', 'bees'],
    names: { broad: ['live oak', 'a live oak'], pine: ['stone pine', 'a stone pine'] },
    tints: { bush: [0.75, 0.85, 0.6], broad: [0.85, 0.95, 0.75] },
    woods: 0.45,
  }),

  // Broadleaf woods of a temperate continent (the eastern United States,
  // Europe east of the Rhine, Japan): oaks and maples, birch and a few pines,
  // in a fresher green.
  'deciduous forest': kind({
    lines: { tree: 0, snow: -150 },
    ground: { tint: [1.05, 1.08, 0.82] },
    trees: [['broad', 0.68], ['birch', 0.12], ['pine', 0.2]],
    under: { fern: [['fern', 0.6], ['bush', 0.3]], bush: [['bush', 1]] },
    rocks: 0.22,
    clouds: { deck: 1500, cover: 0.4, shade: 0.15 },
    animals: ['deer', 'bear', 'bobcat', 'fox', 'rabbit', 'squirrel', 'chipmunk', 'mouse', 'snake', 'salamander', 'flock', 'flit', 'crows', 'hawk', 'owl', 'butterflies', 'bees'],
    names: { broad: ['maple', 'a maple'] },
    tints: { broad: [1.05, 1.06, 0.85] },
  }),

  // The northern forest, all the way round the world (Canada, Scandinavia,
  // Siberia): slim dark spruces close together, birches where it's burned,
  // moss underfoot, and a grey sky low over it.
  'boreal forest': kind({
    lines: { tree: 100, snow: -150 },
    ground: { tint: [0.82, 0.95, 0.85], dirt: [0.16, 0.12, 0.08] },
    trees: [['pine', 0.85], ['birch', 0.15]],
    under: { fern: [['fern', 0.5], ['bush', 0.3]], bush: [['bush', 1]] },
    slim: { pine: 0.5 },
    rocks: 0.3,
    clouds: { deck: 900, cover: 0.6, shade: 0.35 },
    haze: 1.1,
    animals: ['moose', 'bear', 'wolf', 'fox', 'rabbit', 'squirrel', 'mouse', 'flock', 'flit', 'crows', 'hawk', 'owl'],
    names: { pine: ['spruce', 'a spruce'] },
    tints: { pine: [0.8, 0.88, 0.9] },
  }),

  // Tundra (the Arctic coasts, the tops of high plateaus): too cold for
  // trees anywhere, thin turf and lichen among stones, snow lying here and
  // there.
  tundra: kind({
    ground: { tint: [0.95, 0.95, 0.8], dirt: [0.2, 0.17, 0.13], rock: [0.2, 0.2, 0.19], bare: [[0.22, 0.2, 0.17], [0.15, 0.14, 0.12]], barren: 0.25, rubble: 0.6 },
    trees: [],
    under: { fern: [], bush: [['bush', 0.35]] },
    rocks: 0.45,
    clouds: { deck: 700, cover: 0.65, shade: 0.4 },
    haze: 0.9,
    animals: ['elk', 'wolf', 'fox', 'rabbit', 'flock', 'hawk', 'owl'],
    treeline: [-100, 0],
    woods: 0,
  }),

  // Ice (Greenland, Antarctica): snow over everything but the crags, the
  // water frozen, nothing living on it.
  ice: kind({
    ground: { tint: [0.85, 0.9, 0.95], rock: [0.12, 0.12, 0.13] },
    trees: [],
    under: { fern: [], bush: [] },
    rocks: 0.2,
    haze: 0.6,
    animals: [],
    treeline: [-100, 0],
    snowline: [-100, 0],
    frozen: true,
    woods: 0,
  }),
};

// What kind of country each part of the real Earth is (world/earth.js), by
// its climate: the Köppen-Geiger class there (tools/earth/build.js).
//   climate   class → country
//   lowland   on low, flat ground (under `below` real m, rugged by less than
//             `relief` m) these climates are something else: the swamps of a
//             delta or a coastal plain
//   poleward  further than `from` degrees from the equator these climates
//             are something else: a dry summer that far north is the Pacific
//             north-west's forest, not California's golden hills
// A class it doesn't name (out at sea) is the forest.
export const EARTH_COUNTRY = {
  climate: {
    Af: 'jungle',
    Am: 'jungle',
    As: 'savanna',
    Aw: 'savanna',
    BWh: 'desert',
    BWk: 'sagebrush',
    BSh: 'prairie',
    BSk: 'prairie',
    Csa: 'chaparral',
    Csb: 'chaparral',
    Csc: 'forest',
    Cfa: 'deciduous forest',
    Cfb: 'forest',
    Cfc: 'boreal forest',
    Cwa: 'deciduous forest',
    Cwb: 'deciduous forest',
    Cwc: 'boreal forest',
    Dfa: 'deciduous forest',
    Dfb: 'deciduous forest',
    Dfc: 'boreal forest',
    Dfd: 'boreal forest',
    Dsa: 'prairie',
    Dsb: 'forest',
    Dsc: 'boreal forest',
    Dsd: 'boreal forest',
    Dwa: 'deciduous forest',
    Dwb: 'deciduous forest',
    Dwc: 'boreal forest',
    Dwd: 'boreal forest',
    ET: 'tundra',
    EF: 'ice',
  },
  lowland: { below: 6, relief: 10, climates: { Cfa: 'bayou', Cwa: 'bayou', Am: 'bayou', Aw: 'bayou' } },
  poleward: { from: 42, climates: { Csb: 'forest', Csa: 'forest' } },
};

// Every country, by its id (the forest is 0).
export const COUNTRIES = Object.values(COUNTRY);
COUNTRIES.forEach((c, id) => {
  c.id = id;
});

// The country of that name, or the forest.
export const countryOf = (name) => COUNTRY[name] || COUNTRY.forest;

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
