# The world

- **Varied.** Over a few kilometres the country changes
  (`src/world/worldgen.js`):
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
  - **The high country** is where the mountains are mountains: massifs that
    stand 1,400 m and more over their valleys, one ridge to a massif, far
    enough apart that walking from one to the next is a day of it. The trees
    climb to about 900 m before they thin out, the cap above is bare rock, and
    the snow line comes *below* the treeline, at about 600 m — so coming down
    off the top you leave the open snow, carry on through snowy woods, and
    only then run out of it. That is where a descent is 800 m of vertical
    rather than the fifty metres the forest's own tops hold ([skiing](../skiing/README.md)).
    A massif's valley floors stay down at forest height, which is what gives
    the whole drop.
  - **Benches** step the land into level shelves with a rock face between
    each and the next, here and there in the hills and mountains.

  And over a kilometre or so the woods change, whatever the country: **dark
  conifer forest**, thick, with ferns and fallen logs; **birch groves**; and
  **open parkland**, where the meadows run together, the odd lone tree grows
  big, and scrub grows in the open. You start on level ground among the
  trees.
- **The sea** (`src/world/worldgen.js`, `sea.js`). A walk from
  the start, about half a kilometre to a kilometre off in a direction of the
  seed's own, the land goes down to the sea. Far out the land falls away
  under a sea that stands at one level everywhere; how far it falls is a
  broad field of its own, nothing inland, then the ground tilting down over a
  few kilometres into the deep. The coast is wherever the hills, tilted,
  cross the sea's level, so it follows them: coves up the valleys, headlands
  along the ridges, islands where a hilltop stands out of the deep, and the
  hills going on down under the water, past 60 m. The shore eases into a
  sand beach and the seabed is sand in ripples, with rock where it's steep.
  Rivers run out into it, and inland no hollow goes below its level, so
  there's no sea but the sea. It rises and falls in a slow swell, bluer than
  a lake, breaks in lines of surf, and roars along the shore.
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
    point of its rim, with a beach that rises gently to meet the land. On
    Most lakes are deep tarns: a shelf a metre or two deep
    out from the shore, then a steep drop to a floor 15 to 30-odd metres
    down.
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
    and shoulders out (no jumping), and a river carries you along. Hold
    **shift** to dive (see [Under the water](../underwater/README.md)), and
    the camera follows you under. Each step throws up a splash, running
    sends spray off your shins, and landing in it sends up a sheet. Footpaths
    cross streams and rivers at shallow fords. Animals ford a shallow stream
    too, but go round anything deeper.
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
| 1 | lake country, hills, mountains and benches, the woods changing with the country, the sea a walk from the start, and deep lakes (`world/worldgen.js`, `sea.js`) |

New worlds are grown on the newest. A shared world says which land it is on
in its save, beside its name (`land` → 2); one that says nothing is land 1,
which is every world saved before lands were counted. A world that lives only
in your browser is known by its seed and its land, so the world you built in
before is still there, at `?land=1`; the first time you open the new land
where one is kept, the game says so.

How far that is pinned is `FROZEN` in `world/lands.js`. A frozen land's
golden files are for good, because worlds people keep are grown on it: if one
fails, the code is wrong. The lands past it are drafts — the land is still
being shaped, `UPDATE_GOLDEN=1 npm test` re-records them, and the diff is
what a change did. Nothing is frozen yet, so the land is still ours to
change; once it is, something that changes how the forest grows goes in a
land of its own (a land 2's files end in `-land2`).

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
somewhere else. And a real place stands at the height of the forest round
it, except that on a land with a sea (the third) one that would be under the
sea stands a little over it instead, as an island (`datumLevel()`); the
forest's sea keeps off land a real place holds entirely, and meets it round
its edge.

Each hike is a small *card* that is always here (`hikes.js`: what it is and
where) and its *land*, a file of a couple of hundred kB that is fetched the
first time something near it is grown (`landforms.js`). Nothing within reach
of one grows until its land has come.

What a real place looks like is its **country**: one entry in one table
(`country.js`) that says what its ground is made of, what grows and lives
there, what its sky is doing and what its trees are called. The forest is
one country among them, and looks the way it always has. Where the map says
what covers a real place's land (woods, willow scrub, scree, bare rock,
tundra, ice), that is where each is: a scree is strewn with boulders, a
thicket is thick with shrubs, and a country with a treeline and a snow line
has them at their real heights (`landform.js`). A hike can have a snow line
of its own, where it lay when the photo was taken in winter.

## Settings

On the settings panel (**O**), under *time*:

| | |
|---|---|
| time of day | slide it to any hour |
| let time flow | a full day takes 24 minutes |

## Files

```
index.js              plugs it into the game: the land, the sky, the hour
worldgen.js           the land: height, paths, country, woods, forest, species
sea.js                the sea: where the land falls away to it, its beaches
lands.js              which land a world is grown on, and how far they are pinned; growWorld()
drainage.js           where water runs and gathers: the drainage network
water.js              streams, rivers, ponds, lakes and the sea on the ground, from that network
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
waterSurface.js       the water's mesh and shader, from above and from under it
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
