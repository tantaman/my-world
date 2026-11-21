# Under the water

Out of your depth, hold **shift** (or **dive** on a touch screen) to go under,
and **space** to come back up; let go of both and you drift slowly up to
float. Under the surface you swim the way the camera looks, up and down as
well as along, lying flat in the water with a flutter kick and breaststroke;
still, you tread water upright. There's no holding your breath: stay down as
long as you like. (Diving is the hiker's, in `src/player/`. This is what
happens once the camera follows you under.)

- **The light.** The post-process swaps the air's fog for the water's
  (`render/pixelPipeline.js`): everything loses its reds with depth, fades
  into green in a lake and blue in the sea within a few tens of metres, and
  gets darker the deeper you go, into a twilight in the deep sea. Sunlight
  comes down through it in slanting shafts, and nets of light play over the
  bed. Looking up, the surface is a moving ceiling: the sky through a bright
  window straight overhead, and beyond it, the water mirrored back down
  (Snell's window, in `world/waterSurface.js`). Specks of silt drift past,
  and your breath goes up in bubbles every few seconds.
- **The sound.** Everything from above is dulled (`sound.muffle()`), under
  the water's own deep hush and the bloop of your breath.
- **What grows.** Pondweed in lakes and ponds; in the sea, seagrass in the
  shallows and beds of kelp standing up toward the light from deeper down,
  all swaying. It grows in tiles around you while you're in the water, like
  the grass.
- **Fish.** Schools turn up around you in deep enough water, wander it
  between the bed and the surface, and dart off together when you come too
  close: yellow perch, minnows in the shallows, brown trout and the odd
  northern pike in fresh water; herring, mackerel and sea bass in the sea.
  Look straight at a school and its name shows. Like the animals on land,
  nothing about them is saved or shared.

Any water deep enough to swim in can be dived in: the forest's own lakes,
the deep lakes and the sea (`src/world/worldgen.js`,
`sea.js`), or the sea of a hike by the sea. A sea is told from a lake by its
level (the forest's) or by its chop (a real place's), and it's the sea's
fish and weed that live there.

From the console:

```js
const sea = world.underwater.find('sea')          // the nearest sea deep enough to dive in: { x, z, depth }
await world.teleport(sea.x, sea.z)                // ...and there you are, floating
world.underwater.find('lake', { depth: 15 })      // or a deep lake
world.underwater.spawn('herring')                 // a school turns up near you
world.underwater.fish()                           // what's swimming about
```

Fish: `perch minnow trout pike herring mackerel bass`.

## Files

```
index.js              plugs it into the game: the camera under water, its look and sound, what lives there
fish.js               schools of fish: who lives where, and how they swim
weed.js               pondweed, seagrass and kelp, grown around you
shapes.js             fish and plants, made in code
specks.js             drifting specks and rising bubbles
sound.js              the hush of the water; breath let go
```
