# Roads

Here and there, country roads run between the towns: two lanes of tarmac
with a dashed yellow line down the middle between the towns people live in,
or a gravel track with two worn ruts to a ghost town, an abandoned village
or an eerie town. Follow one and it takes you to the next town, and often on
from there to the one after: a network that runs on across the forest as far
as the land allows, with gaps where it doesn't. Get a car at a dealership
in one of the towns and drive it (see [Cars](../cars/README.md)).

There are no keys of their own: walk on them, or drive.

**What they're like.** A road comes into a town at the near end of its main
street, past the water tower or the well, onto a round of tarmac (the
town's gate) where its roads meet, and each leaves the way it's going. In
between it keeps to the lie of the land as a road would: round the hills
rather than over them, never climbing more than one in ten, with no bend too
tight to take. Where the ground falls away it's on a grassy bank; where it
falls away a long way, or over a river, on a bridge with railings (concrete
for a paved road, timber for a gravel one). It crosses a railway on the
level, with a crossbuck either side, where the rail is low enough; it goes
round where the rail is high on its bank or a trestle. You hear the gravel
crunch underfoot.

**Where they are** is grown from the seed, like the railway and the towns
(`roads.js`). Every town may have a road east and a road south, to the town
in the next square that way (or, if that square has none, the one beyond):
there's a chance of each, and the road is only there if the land will take
one. So they're thicker in the lowlands and the hills and thin in the
mountains, and there are none near the real places brought in from photos
(`src/hikes/`). Between its towns a road is surveyed the way a surveyor
would: the least costly way over the land, where climbing, turning, crossing
a hillside, a stream or the railway all cost, and lakes, the old places, the
towns' lots, and everything else there before it (`clear.js`: the caves'
mouths, the launch sites, the video stores, the airfields, the abandoned
buildings, the hunt clubs, the race tracks, the cruise ship's pier, the
hand-placed structures and where you first arrive) can't be crossed at all. A road that would need too high a bridge,
or too much bridge or water, or that wanders too far from the straight way,
isn't there.

**Nothing about the land changes for them.** The ground isn't cut or
filled: the road lies on it as it is, and the trees, bushes and stones in
its way are hidden as their chunk grows, and grass doesn't grow on it.
Building goes round it. A road that would run where an old save already has
something built isn't there. Everyone in a world finds the same roads, and
nothing about them is saved.

Surveying a road takes a moment, so they're found a little at a time round
you as you go, nearest first, and fill in on the map (where a paved road is
a pale yellow band edged dark, and a gravel one a tan band).

From the console:

```js
world.roads.list()            // the roads known round you, nearest first
await world.roads.go()        // onto the nearest road, looking along it
world.roads.under(x, z)       // the road at a spot: its top, its surface
world.roads.roads.byId('road:-2:0:e')
```

## Files

```
index.js              plugs it into the game: surveyed round you, stood up as you come near, what's kept clear, on the map
roads.js              where they run, grown from the seed: the survey between two towns' gates, the road's height
clear.js              what they keep clear of: everything there before them (the dealerships keep clear of it too)
pavement.js           what they look like: tarmac or gravel, the paint, banks, bridges, crossbucks, a town's gate
onMap.js              the roads on the map
sound.js              gravel underfoot
```
