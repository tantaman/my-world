# The world

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

## Keys

| | |
|---|---|
| **, .** | scrub the time of day |
| **T** | let time flow (a full day takes 24 minutes) |

## Files

```
index.js              plugs it into the game: the land, the sky, the hour
worldgen.js           pure world description: height, paths, forest, species
drainage.js           where water runs and gathers: the drainage network
water.js              streams, rivers, ponds and lakes on the ground, from that network
flora.js              what grows, in one table
chunkGen.js           pure chunk generation (terrain buffers, vegetation lists)
chunkWorker.js        Web Worker wrapper around chunkGen
chunks.js             streaming, LOD, meshes, collision + height + water queries
waterSurface.js       the water's mesh and shader
solids.js             built things you bump into and stand on
models.js             procedural trees, bushes, ferns, rocks, logs
grass.js              grass blades, wildflowers, reeds and lilies near the player
materials.js          terrain / vegetation / grass shader hooks
sky.js                sky dome, clouds, stars, sun/moon, time-of-day palettes
particles.js          pollen motes and fireflies
```
