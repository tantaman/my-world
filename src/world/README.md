# The world

- **Varied.** Over a few kilometres the country changes
  (`src/world/land2.js`):
  - **Lake country** lies low, in broad smooth hollows that each gather a lot
    of water, so there's a pond or a lake in every other one, and the lakes are
    the biggest anywhere (well over 100 m across). It's wetter, more open, and
    the woods there are birch and broadleaf.
  - **Hill country** rolls, as the whole forest once did.
  - **Mountains** rise a hundred metres and more over their valleys, in ridges
    sharp along the crests. The trees turn to conifers on the way up, grow
    smaller and thin out to a treeline about 90 m up, and above it are alpine
    meadows of thin, tawny turf, stones and big boulders, with a few low
    shrubs, and snow lying on the tops from about 120 m. Rock shows on the
    steep faces, no tree grows on a cliff, and the trails give out about where
    the trees do.
  - **Benches** step the land into level shelves with a rock face between
    each and the next, here and there in the hills and mountains.

  And over a kilometre or so the woods change, whatever the country: **dark
  conifer forest**, thick, with ferns and fallen logs; **birch groves**; and
  **open parkland**, where the meadows run together, the odd lone tree grows
  big, and scrub grows in the open. You start on level ground among the
  trees.
- **Deterministic.** The same seed always produces the same hills, paths
  and trees. This matters because structures will be placed at fixed
  coordinates. The HUD shows your `x, z`, your heading and the time.
- **Endless.** The world streams in 64 m chunks around you. Terrain uses three
  levels of detail with skirts to hide the seams. Trees switch between three
  mesh LODs, and ferns and bushes drop out with distance. Chunk generation
  (noise, geometry buffers, vegetation placement) runs in Web Workers, so
  walking doesn't stutter.
- **Footpaths** follow the zero-isolines of two domain-warped noise fields.
  These form a natural network of long trails and loops. Side trails fade in
  and out like deer paths. The ground along them is slightly sunken and
  smoothed, and trees keep their distance.
- **Water** runs downhill and gathers where the land holds it
  (`src/world/drainage.js`, `water.js`).
  - **Where it runs.** The land is sampled at nodes about 96 m apart,
    jittered so the grid doesn't show. Each node drains to the neighbour that
    falls away most steeply. One with no lower neighbour is the bottom of a
    hollow: water gathers there in a pond or a lake, rises to the lowest point
    of the rim, and spills over it on down to a lower hollow, so chains of
    lakes are strung along the rivers. (A hollow too deep or too wide to spill
    keeps its water.) A channel carries everything that drains through it, so
    streams start small high up, join, and grow into rivers on their way down.
    One shows once enough land drains through it, fading in at its spring,
    and every one ends in a pond, a lake or more water. The channels are
    smooth curves through the nodes, with a bend or two of their own.
  - **Levels.** A channel's water level only ever falls along it. Each node
    stands its water just under the land, and no higher than anything
    upstream of it, so where the land rises in the way, or a lake spills over
    a rise, the water keeps its level and cuts a valley through, wider the
    deeper it cuts. The level is read at the nearest point on the centreline,
    so it's flat from bank to bank, and quantised into steps: still pools
    joined by short ramps, counted up from where the channel ends so it
    arrives at exactly the level of what it runs into. On a stream those are
    little cascades, with white water at the lip and churning in the pool
    below; on a river, riffles. A channel widens into pools and narrows
    between them. A pond or lake fills its hollow to just under the lowest
    point of its rim, with a beach that rises gently to meet the land.
  - **The water itself** is meshed per chunk on the main thread from the
    heights and the water grids the workers produce, so it follows your
    digging. It's see-through, writes depth (so the fog and outlines treat it
    as a surface), reflects the sky with a dark band where the trees across the
    water would be (narrow water sees its banks, a stream in the woods sees
    leaves), glints in the sun and ruffles in the wind. Running water is drawn
    out into streaks along the current and carries flecks of foam and bubbles
    down with it, so you can see which way it goes and how fast. It froths on
    cascades, along the shore and round your legs, and opens into a wake
    behind you. Below it the bed turns to silt, pebbles and cobbles under a
    moving net of light, darkening, reds first, with depth.
  - **By the water** trees and logs keep back from the bank, ferns come right
    down to it, boulders stand in streams, and the grass gives way to a damp,
    sandy edge. Reeds and bulrushes grow in the shallows of still water, and
    lily pads, a few in flower, float further out.
  - **In it** you wade, slower the deeper it gets, and the current leans on
    you the deeper you're in it; out of your depth you swim, with your head
    and shoulders out (no running or jumping), and a river carries you along.
    Each step throws up a splash, running sends spray off your shins, and
    landing in it sends up a sheet. The camera stays above the surface, and
    footpaths cross streams and rivers at shallow fords. Animals ford a
    shallow stream too, but go round anything deeper.
- **Ecology.** A forest-density field opens into meadows full of wildflowers.
  A species field shifts the woods between conifers and broadleaf trees, with
  birches along the edges. Ferns grow where it's damp and shaded, and you'll
  also find bushes, boulders and fallen logs.
- **Time of day.** Palettes are keyed to the sun's elevation, from dawn to
  midday, golden hour, dusk and night. At night there's moonlight, stars and
  fireflies, and whatever fires you've lit. In daytime there's drifting pollen.

From the browser console you can jump around with
`await world.teleport(x, z)`.

## Lands

A save is only what was changed from what a seed grows, so changing how the
forest grows would leave every cabin ever built floating over, or buried in,
somebody's hillside. So when the way the forest grows changes, the change is
a new **land**, and every world keeps the land it was first grown on
(`src/world/lands.js`):

| land | |
|---|---|
| 1 | rolling hills and mixed woods everywhere (`world/worldgen.js`) — every world saved before there was a second |
| 2 | lake country, hills and mountains, benches, and different woods (`world/land2.js`) |

New worlds are grown on the newest. A shared world says which land it is on
in its save, beside its name (`land` → 2); one that says nothing is land 1,
which is every world saved before lands were counted. A world that lives only
in your browser is known by its seed and its land, so the world you built in
before is still there, at `?land=1`; the first time you open the new land
where one is kept, the game says so. What each land grows is pinned by
`test/golden/` (land 2's files end in `-land2`), and never changes: something
new goes in a land of its own.

## Real places

Real land can be set into the world: a mountain you've climbed, brought in
from a photo you took on it (see [Hikes](../hikes/README.md)). Inside one the
ground, its trails, its lakes, its streams and its woods are the real ones,
at 1 : 5, and over a fade the forest takes over again round its edge
(`landform.js`).

A real place is set into whichever land the world is grown on, and no land
knows about it. `realPlaces.js` is grown *from* the land (it is a class that
extends whichever land it is given) and wraps what the land says: the height
is the land's until you are on real ground, the woods are the land's until
you are in the real ones. So a new land gets the hikes for nothing, and
grown bare, as the golden tests grow it, a land is exactly itself. The one
thing asked of a land is that its own workings ask `forestHeight()` rather
than `broadHeight()`, which real places change: the water, for one, is
routed over the forest's own land, so a real place can't send a river
somewhere else.

Each hike is a small *card* that is always here (`hikes.js`: what it is and
where) and its *land*, a file of a couple of hundred kB that is fetched the
first time something near it is grown (`landforms.js`). Nothing within reach
of one grows until its land has come.

What a real place looks like is its **country**: one entry in one table
(`country.js`) that says what its ground is made of, what grows and lives
there, what its sky is doing and what its trees are called. The forest is
one country among them, and looks the way it always has.

## Keys

| | |
|---|---|
| **, .** | scrub the time of day |
| **T** | let time flow (a full day takes 24 minutes) |

## Files

```
index.js              plugs it into the game: the land, the sky, the hour
worldgen.js           pure world description: height, paths, forest, species (land 1)
land2.js              the second land: lake country, mountains, benches, kinds of woods
lands.js              which land a world is grown on; growWorld()
drainage.js           where water runs and gathers: the drainage network
water.js              streams, rivers, ponds and lakes on the ground, from that network
landform.js           a piece of real land (a hike): its heights, trails, lakes, streams
realPlaces.js         a land with real places set into it: grown from any land, wraps what it says
hikes.js              the hikes in the game, as cards (written by npm run hike)
hikes/                each one's land (fetched when needed)
landforms.js          which hikes' land is here yet; nothing near one grows before it is
flora.js              what grows, in one table
country.js            the kinds of country, in one table: ground, plants, sky, animals, names
chunkGen.js           pure chunk generation (terrain buffers, vegetation lists)
chunkWorker.js        Web Worker wrapper around chunkGen
chunks.js             streaming, LOD, meshes, collision + height + water queries
waterSurface.js       the water's mesh and shader
solids.js             built things you bump into and stand on
spaces.js             places under the ground you can be in (caves): floor, walls, roof
cuts.js               holes in the ground, where something else stands in for it
models.js             procedural trees, bushes, ferns, rocks, logs
modelsIsland.js       and other countries': palm, ironwood, tree fern, silversword
grass.js              grass blades, wildflowers, reeds and lilies near the player
materials.js          terrain / vegetation / grass shader hooks
sky.js                sky dome, clouds, stars, sun/moon, time-of-day palettes; how much
                      daylight reaches the eye (open)
particles.js          pollen motes and fireflies
```
