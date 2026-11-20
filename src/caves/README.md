# Caves

There's a cave in most stretches of these hills, three hundred metres or so
apart. Each is on the map (see [The map](../map/README.md)) as a badge with a
dark arch on it and its name, and the name says what's inside: a *Glowworm
Grotto* has glowworms, a *Crystal Cavern* a grotto of crystals at the far
end; an *Owl Hollow* or a *Fox Hole* is plain rock. Pick one off the map and
track it, and the HUD leads you to its mouth. Once you've been in, its badge
turns paler.

**The way in.** A cave opens where a hillside is steep: a dark hole under a
brow of bare rock, boulders either side of a short cutting, the ground going
down into it. Walk in. The passage slopes down under the hill, and a few
steps in its roof closes over you.

**Inside.** It gets dark quickly, and your headlamp comes on. Its beam goes
where you look, so you can sweep it across the walls; look back and the
mouth is a blaze of daylight. Passages twist and branch, open into rooms,
and end; some are wide enough to run down and some you'd want to duck in.
The walls are limestone in beds, pale calcite where water has run down from
the roof, rust where it seeped, moss near the mouth, mud underfoot.
Stalactites hang from the roofs, more in the rooms, with stalagmites growing
up under some. Where there are glowworms they're on the roofs deep inside,
too dim to notice by your lamp: put it out. The forest goes muffled and far
away once you're in, your footsteps ring off the stone, and water drips from
the tips of the stalactites round you, now and then into a pool.

| | |
|---|---|
| **K** | headlamp on / off (it comes on by itself in the dark of a cave) |

A cave is part of the land, so it's the same for everyone with the same seed
and land, and someone you share a world with is seen walking in it. The
animals keep out, and so does anything carrying you that's too big for the
passage. Nothing about a cave is saved but which you've been in, and where
you are in one: leave inside a cave and you come back inside it. You can't
dig at a cave's mouth or build over its way in (it would bring the roof
down); the rest of the hill above is yours, and there's always more earth
over a passage than a spade can move.

## How they're grown

The world is cut into 320 m squares, each holding at most one cave
(`sites.js`). In each, the steeper hillsides are looked over for a spot where
a passage going in, and down a little, gets under a good roof of earth within
a few metres, away from paths and water. From there passages are grown: a few
metres at a time, turning, branching now and then, dropping into a room here
and there. Each must keep 2.6 m of earth over its roof (more than a spade can
dig), stay clear of streams and ponds overhead, keep rock between itself and
any passage it doesn't join (so there's only ever one floor under any spot),
and stay in its square, so caves never run into each other. A square any of
which is within reach of a real place brought in from a photo (`src/hikes/`)
has no cave: the land there is what is really there. Where they are, and
what each is called, is pinned in `test/golden/caves-*.json`: a cave's id is
in your save if you've been in it or are tracking it.

Then the rock (`shape.js`): each passage an arch swept along it, each room a
dome with a flat floor, all melted together where they meet and roughened
with noise, a little at the floor and more on the walls and roof. That field
is sampled on a half-metre grid, only round the cave, and meshed with surface
nets (`mesh.js`), which gives one closed skin with no seams where passages
join. Every vertex gets its colour, how open it is to the air in front of it,
and how much daylight reaches it: all of it in the mouth, falling away past
where the roof begins. The same field gives every column its floor and roof
(`space.js`), so what you stand on is what you see, and how far each spot is
from the walls.

A cave changes nothing the seed grows: the land is the same with it as
without. Its mouth is the one place they meet. There the land is *cut*
(`world/cuts.js`): the terrain isn't drawn inside the way in, the grass gives
way to rock round it, and it casts no shadow there, so the hillside opens on
the cave. Underground, the floor, the walls and the roof are the cave's
(`world/spaces.js`), and the land overhead is just the hill on top.

Daylight reaches a cave only as far as its mouth. Once you're in, the sky's
light and the sun's are dimmed on everything (`sky.open`), the rock takes
back only the daylight its vertices were built to see, and your eye adjusts.
What you see by is what you brought.

A cave is built in a tenth of a second or so, a few milliseconds a frame, as
you come within 170 m of it, and let go of when you're well away. From the
console:

```js
world.caves.list()                         // caves looked over so far, nearest first
world.caves.nearest(world.player.pos.x, world.player.pos.z)
world.headlamp.on                          // is it on?
```

## Files

```
index.js              plugs it into the game: the caves, their mouths, the lamp, the map
sites.js              where the caves are, and their passages and rooms (from the seed)
shape.js              their rock, as a field: arches and domes melted together, roughened
mesh.js               its skin, by surface nets, coloured; daylight per vertex
space.js              the floor, roof and walls you walk by, from the same field
build.js              all of that for one cave, a few milliseconds at a time
caves.js              the caves near you: found, built and let go of as you go
look.js               the rock's material, dripstones, crystals, glowworms, boulders
lamp.js               the headlamp: on the cap, its beam where you look
sound.js              footsteps on rock, drips, the hush
```
