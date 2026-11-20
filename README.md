# my-world

An open-world forest you can wander through as a little explorer, seen from
behind in third person. Streams run through it, the odd river winds along its
valleys, and here and there a pond or a lake lies in a hollow. It's built with three.js. The art is pixelated but
lit and shaded like a real scene, and the pixels are softened just enough
that you can't quite tell whether it's pixel art trying to look real or a
painting made of pixels.

You can also **build**: fell trees, buck them into logs, hew timbers, clear
and grade the ground, set stone footings, and raise a notched log cabin with
rooms, doors, windows and a roof. And when it gets dark, ring a pit with
stones and light a **campfire**. See [Building](#building).

And you're not alone out there: deer, elk, moose, black bears, wolves,
mountain lions, bobcats, foxes, rabbits, squirrels, chipmunks, mice, snakes,
salamanders, songbirds, crows, hawks, owls, bees and butterflies come and go.
See [Wildlife](#wildlife).

Over time we'll also add hand-made **structures**: places to keep thoughts and
ideas, and places to explore. See [Adding a structure](#adding-a-structure).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 — the game
npm run api        # http://127.0.0.1:8787 — the save server (optional)
npm run build      # static site in dist/
npm test           # the rules, in Node (see "Checking it still works")
```

The game is a static site and runs on its own; `npm run api` adds the save
server, which lets a world live at a URL. `npm run dev` proxies `/api` to it.
See [Building together](#building-together) to set the server up, or skip it
— the forest doesn't mind.

## Controls

| | |
|---|---|
| **W A S D** / arrows | walk (relative to the camera) |
| **Shift** | run |
| **Space** | jump |
| **click**, then move the mouse | look around (pointer lock; drag works too) |
| **Q / E** | turn the camera |
| **scroll** | zoom |
| **R** | back to the starting path |
| **M** | map: pan, zoom, and mark places (also the *map* button, bottom right) |
| **L** | save this world, and get a link others can build in with you |
| **1 – 8** | tools: hands, axe, shovel, footing, log wall, timber, roof, campfire |
| **click** (while looking) | use the tool, hold to keep working |
| **right-click** | the tool's second action, or take a piece down |
| **G** | set or pull up a grade stake |
| **P** | pixel art on / off |
| **[ ]** | pixel size |
| **- =** | pixel softness (0 = hard pixels, 1 = smooth) |
| **O** | silhouette outlines on / off |
| **, .** | scrub the time of day |
| **T** | let time flow (a full day takes 24 minutes) |
| **N** | sound on / off (also the *sound* button, bottom right) |
| **F** | fullscreen |
| **V** | stats (fps, draw calls, triangles) |
| **H** or **?** | help |

On a phone or tablet, drag with your left thumb to walk (push it all the way
to run), drag with your right thumb to look, and tap on the right to jump.
Tap a tool in the bar at the bottom. The **use**, **alt** and **stake**
buttons on the right stand in for the mouse buttons and **G**.

Your position, the time of day, your look settings and whether sound is on
are remembered between visits. Add `?reset` to the URL to start fresh (your
map marks are kept). To keep a world somewhere other than this browser — and
to build in it with other people — see [Building together](#building-together).

## The map

Press **M** (or tap *map*) for a top-down map of the forest. It's drawn from
the same world description as the 3D view (`src/map/`), so it always matches
what's there: meadows and woods, footpaths, rock, water, and hillshaded
relief with contour lines. Zoomed out it keeps the rivers, lakes and ponds and
lets the streams go. Zoomed in, every tree, bush and boulder is in its real place.
Tiles are rendered in Web Workers and pre-rendered around you while you walk,
so the map opens already drawn.

| | |
|---|---|
| **click** / tap | add a mark there, or select one |
| **drag** | pan · drag a pin to move it |
| **scroll** / pinch, **+ −** | zoom (from about 0.5 m to 8 m per map pixel) |
| **arrows** / **WASD** | pan |
| **C** / *me* | back to where you are |
| **M** / **Esc** | close |

**Marks** tag places of interest. Each has a name, one of eight pixel icons,
a colour and an optional note. They're listed beside the map by distance
(behind the *marks* button on a phone), and clicking one there flies to it.
Press *track* on a mark and the HUD shows its name, how far it is and an arrow
toward it from where the camera's looking. On the map a dotted line runs from
you to it. Out in the world, every mark stands as a little stake with a cloth
pennant in its colour, so you can spot it as you walk up.

Esc on a brand-new mark you haven't named throws it away. Marks are kept in
`localStorage` per seed, and from the console `world.marks.list()` returns
them (handy for copying out).

## Building together

Press **L** (or tap *save*), pick a name and a password for yourself, and the
world gets an address of its own:

```
https://your-site/?w=kxbbsjfw52
```

Open that link from any browser, on any machine, and you walk back into the
same world. **And anyone else who opens it is in there with you** — you can
see each other walking around, and what either of you changes shows up in the
other's world within a moment: ground that moves, trees that come down, a log
laid on a wall, a place marked on the map.

The *save* button says where things stand — *live · 2*, *saving…*, *offline* —
and **L** opens the panel with the link, a name for the world, who is here,
and *sign out*.

What is the world's is shared: the ground, the felled trees, what is built,
the fires, the marks, the name. What is yours stays yours — your materials, your grade
stake, the hour you set, where you last stood. Where you are standing is
passed on so people can see you, and never stored.

### Who you are

Nobody walks into a shared world as nobody. The first time someone opens the
link they are asked for a **name and a password** — new ones, or the ones
they picked before. Whoever saved the world picked theirs when they did.

- **Coming back in the same browser** goes straight in: a cookie remembers
  you, for a year or until you sign out.
- **Coming back from another browser**, sign in with the same name and
  password and you're back where you stopped, carrying what you carried.
- **What is yours is kept under your name**, so a friend opening the link
  starts at the beginning of the path with empty hands, not with yours.
- **Others see your name**: in the panel (*sam and ana are here*) and on the
  wire, where the server puts it, so it can't be borrowed.

Names are per world, and `Sam` and `sam` are the same person. A password
needs 6 or more characters, and there is no email and no reset: lose it and
pick a new name. After 8 wrong passwords in a row a name rests for 5
minutes.

The server keeps only a salted PBKDF2-SHA256 hash of each password, and of
each sign-in only the SHA-256 of a random token; the token itself lives in an
`HttpOnly`, `SameSite=Strict` cookie scoped to the one world's path, `Secure`
on https (`worker/members.js`). The rules for a name are in
`src/save/who.js`, shared by the game and the server.

A world saved before there were names opens the same way. The first person to
pick a name in it gets the note of "your own state" it kept — almost always
whoever made it, coming back.

### Why there is nothing to resolve

Everything you can change is one **element** with a key every machine works
out the same way — a ground vertex, a removed plant, a stump, a felled tree, a
footing, a log, a roof, a fire, a mark:

```
t:120:-40      the ground vertex at (120, -40)
l:x:0:0:4:0    the log running along x at line 0, from 0 to 4, course 0
c:12:-40       the fire on the grid node at (12, -40)
m:k3f9x1       a mark
```

A fire burning down doesn't send anything. Its value is how much wood was put
on it and when it was lit, and every machine works out from those how far it
has burned — so changes only travel when someone lays, lights, feeds or puts
out a fire.

A change is one of those taking a value, and it travels on its own:

```json
{ "r": "0,-1", "k": "t:120:-40", "v": [-0.42, 1] }
```

The world's Durable Object is the only thing that writes, so the order it
takes changes in **is** the order. Two people digging the same hole both get
their way, vertex by vertex. The only thing that can be lost is the older of
two writes to the very same element — which is the right answer anyway.

So there is no prediction to reconcile and nothing to roll back. Your own
edits are already on the screen the moment you swing; a change that loses a
race loses it on one element, not on your afternoon.

### What a save actually holds

The forest is procedural, grown from a seed, so a save stores the seed and the
**diff** — only what you changed. Elements are grouped into 64 m regions, the
same grid the world streams on.

A world dug over 320 × 320 m is 59,000 elements in 37 regions, and costs 160 kB
to put up the first time. **An ordinary bit of digging after that is 46
changes and about 2 kB**, whatever the world has grown to.

Changes are found by *diffing*, not by instrumenting every swing of the axe:
a few times a second the world is reduced to its elements and compared with
what the server is known to hold. Nothing can be forgotten that way. It costs
about 2.5 ms on an ordinary world and 34 ms on that 320 m one, so how long it
took sets how often it happens — a huge world sends a little less often rather
than stuttering.

If the connection goes, the world keeps running; what you do is held in this
browser and goes out when it comes back.

### Setting up the server

Each world lives in its own [Durable
Object](https://developers.cloudflare.com/durable-objects/), which holds it in
its own SQLite. There is no database to create first:

```bash
npm run deploy
```

For local work, `npm run api` in one terminal and `npm run dev` in another;
`npm run serve` runs the built site and the API together, the way they deploy.

> Worlds saved under the earlier layout — one row per world in D1 — are not
> carried over. Nothing was deleted; if you made one, its rows are still in
> that D1 database.

### The save API

| | |
|---|---|
| `POST /api/worlds?seed=N&name=` | create, with `you: { name, password }` in the body → `{ id, gen, you }`, signed in |
| `POST /api/worlds/:id/members` | someone new: `{ name, password }` → `{ name }`, signed in |
| `POST /api/worlds/:id/session` | sign in: `{ name, password }` → `{ name }` |
| `DELETE /api/worlds/:id/session` | sign out |
| `GET /api/worlds/:id/meta` | id, seed, name, generation, how big |
| `GET /api/worlds/:id` | the whole world, as a frame, with your own state in it |
| `POST /api/worlds/:id/ops` | changes, in bulk or when the socket is down |
| `GET /api/worlds/:id/live` | the WebSocket everyone builds over |
| `GET /api/worlds/:id/history` | the whole copies still kept |
| `GET /api/worlds/:id/revisions/:gen` | one of them, as a frame |

Everything below `meta` needs a sign-in, and without one answers `401` with
the world's name (`{ error, world }`), which is the game's cue to ask who you
are. The socket can't answer a status the page could read, so it opens and
closes again with code `4401`.

A **frame** (`src/save/frame.js`) is the ASCII magic `MWLD`, a big-endian
`u32` header length, a JSON header, then the parts — for a world, one gzipped
blob of its elements by region. The header says who it is for (`you`) and
carries their own state (`visitor`).

Over the socket, both ways:

```
→ { "t": "ops", "id": 7, "ops": [ … ], "visitor": { … } }
← { "t": "ack", "for": 7, "gen": 92, "took": 46 }
← { "t": "ops", "gen": 93, "ops": [ … ] }        someone else's change
→ { "t": "at", "x": 12.5, "z": -40, "yaw": 1.2 } where you are standing
← { "t": "at", "id": "p3", "name": "sam", … }     …and someone else, by name
← { "t": "welcome", "you": "p2", "gen": 93, "here": [ … ], "missed": [ … ] }
```

A client that blinked sends `?since=<gen>` and is given what it missed; one
that has been away too long is told to open the world again instead. A whole
copy of each world is kept at most every ten minutes, last 20, so a flattened
cabin isn't gone for good.

## How the look works

Everything is generated in code. There are no textures or model files.

1. **Low-resolution HDR render.** The scene is drawn into a target about 300
   "art pixels" tall, with real-time sun shadows, sky/ground ambient light and
   a depth buffer.
2. **Composite pass, still at low resolution** (`src/render/pixelPipeline.js`):
   - darkens pixels on depth discontinuities, giving soft pixel-art outlines
     around silhouettes
   - adds height fog that takes its colour from the sky behind it, so far
     hills melt into the horizon and valleys hold more mist
   - applies filmic (ACES) tone mapping and a gentle grade: cool shadows,
     warm highlights
   - applies an ordered Bayer dither onto a slightly reduced palette, which
     reads as pixel texture without banding
3. **Soft-pixel upscale.** Each art pixel is snapped and then blended across a
   narrow band at its edges. The band's width is the *softness* setting, and
   it's what lets the pixels melt together.

The materials do most of the realism work. The ground colour is computed per
pixel from world position: meadow grass with dry patches, leaf litter and
moss under trees, packed-earth paths with worn edges, and rock on steep
slopes. The grass blades use the same function, so they grow out of the
ground they stand on. Trees and bushes have baked vertex-colour shading and
spherical "canopy" normals so their foliage shades like a soft volume. They
also sway in the wind, and grass parts around your feet.

## How it sounds

The sound is made in code too, with the Web Audio API. There are no audio
files (`src/audio/`). Browsers only allow sound after you
interact, so it fades in after your first click, key press or tap.

- **Wind** is low-passed brown noise that gusts along with the swaying
  trees. It gets louder in open meadows and on high ground.
- **Leaves** rustle in swells under the canopy when a gust passes through.
- **Birds** are placed in 3D in the trees around you, using HRTF panning and
  a forest reverb. You'll hear flute-like thrush phrases, two-note
  "fee-bee" whistles, warbler trills, chip calls, wood-pigeon coos and the
  occasional woodpecker. There's a dawn chorus, quieter days, a little
  evensong, and silence after dark.
- **Night** brings crickets, louder in the open, and an owl in the distance.
- **Animals** call from where they actually are: a deer's alarm snort and
  stamp, an elk bugling across a meadow, a wolf pack howling one after
  another, a fox's yapping bark, a squirrel scolding from its trunk, a
  chipmunk's chips, a bear blowing, a rattlesnake's buzz, crows, a red-tail's
  scream, a flock bursting up in a whirr of wings, bumblebees about your
  knees, and hooves when something big bolts past.
- **Water** babbles: a broad rush under a few narrow resonances that hop from
  pitch to pitch, rising as they go, like bubbles. It comes from where the
  running water near you is, and roars more where it tumbles down a cascade.
  Still water laps at the shore in slow swells, something small plops in now
  and then, and from dusk the frogs start up.
- **Footsteps** follow the stride of the walk and run animation. They
  change with the ground under you: packed earth and grit on paths, a swish
  in grass, crackling leaf litter in the woods, a slosh and a splash and
  falling drops in water. They get sharper when you run, there's a thud when
  you land a jump, and out of your depth each stroke sweeps through the water.

- **Work** makes noise too. You'll hear the axe biting (deeper on a thick
  trunk), a tree creaking as it goes, then the crash and the crown thrashing
  through the brush. There's the scrape and toss of the spade, the knock of a
  log set down on another, and the clack of stones.
- **Fires** breathe and crackle where they burn, with the odd pop of resin.
  You'll hear the flint strike and the tinder catch with a rush, and a long
  hiss when you kick earth over the coals.

Sound pauses when the tab is hidden. Add `?mute` to the URL to start silent.

### Tuning from the URL

| param | default | |
|---|---|---|
| `soft` | `0.55` | pixel softness, 0–1 |
| `px` | auto | screen pixels per art pixel |
| `lines` | `300` | target art-pixel height when `px` is auto |
| `outline` | `0.28` | outline strength |
| `levels` | `36` | colour levels per channel before dithering |
| `time` | `16.6` | starting hour of the day |
| `seed` | `20261119` | a completely different world |
| `view` | `4` | chunks loaded in each direction (64 m each) |
| `grass`, `grassDensity` | `40`, `7` | grass radius (m) and blades per m² |
| `q=low` | | lighter preset for modest GPUs |
| `mute` | | start with sound off |
| `animals` | `1` | how much wildlife: `0` none, `2` twice as much |
| `creative` | | build without gathering materials |
| `clearbuild` | | forget everything you've built and changed in this world |
| `debug` | | show stats from the start |

Example: `/?soft=0.3&px=5&time=7.5`

## The world

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
- **Water** (`src/world/water.js`). Streams and rivers follow the
  zero-isolines of warped noise, like the footpaths, so they wind and
  meander and never dead-end; a slow mask decides which stretches carry water
  at all, so they rise from a spring and fade out again. Lakes and ponds sit
  on a sparse grid: each rolls downhill into a hollow and fills it to just
  under the lowest point of its rim.
  - **Levels.** A water surface has to be flat across and can't tilt much
    along, but these hills run at 20% grades. So the level of running water
    is read at the nearest point on its centreline, follows a smoothed version
    of the landform (rivers smoother than streams) without ever standing above
    the ground beside it, and is quantised into steps: still pools joined by
    short ramps. On a stream those are little cascades with white water; on a
    river, riffles. Where the land is higher than the water, the water cuts a
    valley through it, wider the deeper it cuts.
  - **The water itself** is meshed per chunk on the main thread from the
    heights and the water grids the workers produce, so it follows your
    digging. It's see-through, writes depth (so the fog and outlines treat it
    as a surface), reflects the sky with a dark band where the trees across the
    water would be (narrow water sees its banks, a stream in the woods sees
    leaves), glints in the sun, ruffles in the wind, runs with the current, and
    froths on cascades, along the shore and round your legs. Below it the bed
    turns to silt and stones that darken, reds first, with depth.
  - **By the water** trees and logs keep back from the bank, ferns come right
    down to it, boulders stand in streams, and the grass gives way to a damp,
    sandy edge. Reeds and bulrushes grow in the shallows of still water, and
    lily pads, a few in flower, float further out.
  - **In it** you wade, slower the deeper it gets; out of your depth you swim,
    with your head and shoulders out (no running or jumping). The camera stays
    above the surface, and footpaths cross streams and rivers at shallow fords.
    Animals ford a shallow stream too, but go round anything deeper.
- **Ecology.** A forest-density field opens into meadows full of wildflowers.
  A species field shifts the woods between conifers and broadleaf trees, with
  birches along the edges. Ferns grow where it's damp and shaded, and you'll
  also find bushes, boulders and fallen logs.
- **Time of day.** Palettes are keyed to the sun's elevation, from dawn to
  midday, golden hour, dusk and night. At night there's moonlight, stars and
  fireflies, and whatever fires you've lit. In daytime there's drifting pollen.
- **The hiker** is built from primitives: an orange rain shell with the hood
  rolled at the collar, a black daypack with a hydration hose, tan trousers,
  a brown snapback with a maroon brim, white sunglasses and a beard. The
  walk is solved, not keyframed. Each foot follows a path on the ground,
  rolling heel to toe while it's planted and arcing forward when it swings.
  Two-bone IK bends the hip and knee to reach it, so planted feet don't
  skate. Stride and cadence grow with speed (about 110 steps a minute
  strolling, 150 walking, 200 running), and running adds a flight phase.
  The hips vault over the stance leg when walking and bounce when running,
  and the shoulders counter-rotate. The body leans into starts, turns and
  climbs. Feet settle onto slopes and sills, and the hips drop to let the
  lower leg reach. Landings are absorbed in the knees. Standing still, the
  hiker shifts weight and looks around now and then.

From the browser console you can jump around with
`await world.teleport(x, z)`.

## Wildlife

Every so often something arrives — always out of sight, somewhere that suits
it, at an hour it keeps — goes about its business, notices you, and in time
wanders off again. Nothing is saved and nothing is shared: wildlife belongs
to the forest, so someone building with you meets animals of their own
(though yours are wary of them too).

**Where and when.** Habitat is read off the same fields that grow the forest:
deer along woodland edges, elk out in the meadows, moose where it's wet, bears
and bobcats in the woods, red squirrels in the pines and grey ones in the
oaks, salamanders on damp ground, snakes basking in open sun, bees and
butterflies over the meadow flowers. Deer, elk, rabbits and foxes like dawn
and dusk; chipmunks, hawks and songbirds keep to the day; mice and owls come
out at night; wolves and mountain lions favour the half-light. Some are
common and some are not: you'll see a lot of deer before you see a mountain
lion.

**How they take to you.** Each species has its own temperament:

- Deer look up and stare, flick their tails and stamp. Stand still and they
  often decide you're nothing and go back to feeding; come closer and they
  snort and bound away with their white tails up. The whole herd goes with
  them.
- Elk and moose are less flighty: they watch, then walk off. A bull elk
  bugles at dawn and dusk.
- A black bear stands up on its hind legs for a better look, blows, and
  ambles away. Cubs follow their mother.
- Wolves travel in single file and howl together after dark.
- Mountain lions and bobcats prowl low; noticed, they sit and look straight
  at you, then slip away.
- A fox trots its rounds, stops dead to listen to the grass, and pounces.
- Rabbits freeze flat, then zig-zag for cover. Squirrels sit up and scold,
  then bolt for the nearest trunk and spiral up into the canopy. Chipmunks
  dive under the nearest rock or log. Mice vanish into the leaf litter.
- Snakes lift their heads on guard (a rattlesnake rattles), then slide off.
- Songbirds and crows drop onto clearings and paths to hop and peck, and burst
  up into the trees when you come too close. A red-tailed hawk circles high
  over the meadows; an owl ghosts across a clearing at night.

Running is noisy, so they notice you from further off; standing still makes
you hard to spot. When you look straight at an animal, the name of what
you're seeing shows for a moment.

**How they're made.** Like everything else, from primitives with colour baked
into the vertices. Each animal is one skinned mesh — a whole moose, antlers
and all, is a single draw call — and is animated procedurally. Four-legged
animals share one skeleton and gait engine (`src/wildlife/quadruped.js`): a
lateral-sequence walk, a diagonal trot, a transverse gallop and the
half-bound of rabbits and squirrels, with two-bone IK putting each foot on
the actual ground under it, so they stand on slopes and their feet don't
skate. Snakes and salamanders bend a chain of spine bones to lie along the
path the head took. Birds beat, glide and fold two-jointed wings.

From the console:

```js
world.wildlife.spawn('bear')                       // one turns up nearby, out of view
world.wildlife.spawn('fox', { here: true })        // right in front of you
world.wildlife.list()                              // who's about
world.wildlife.species.deer.notice = 60            // tune a temperament
```

Species: `deer elk moose bear wolf cougar bobcat fox rabbit squirrel
chipmunk mouse snake salamander flock flit crows hawk owl bees butterflies`.

## Building

The crosshair in the middle of the screen is what you work on. The prompt
above the tool bar always says what a click would do, or why it can't.

**Gather.**
- **Axe (2).** Click a tree to chop it. Pines take 5–7 swings, birches 4,
  oaks 8–10. The tree creaks and falls away from you. Swing at the fallen
  tree once more to limb it, then keep swinging to buck it into 4 m logs.
  A big pine gives over 10 m of log.
- **Hewing.** With the axe, hold **right-click** to hew round logs into
  squared timbers, half a metre at a time.
- **Hands (1).** Pick up small stones. Boulders stay where they are.

**Prepare the ground.**
- **Shovel (3).** Hold **click** to dig and **right-click** to fill. Digging
  fills your soil pile and filling spends it, so cut and fill balance out.
  Dig into the bank of a pond, lake or stream and the hole fills to the
  water's level; fill the shallows in and the water gives way.
  The shovel strips the turf, clears undergrowth and pockets small stones.
  It won't dig among the roots of a standing tree, so fell it first, then
  hold **click** on the stump to grub it out.
- **G** drives a **grade stake** where you're aiming. A translucent plane
  then shows the stake's level. Ground poking through the plane is high,
  and where the plane floats above the ground, it's low. With a stake set,
  the shovel only cuts down to grade and only fills up to it, so you can
  level a pad by sweeping across it.

**Build.** Everything snaps to a 1 m grid.
- **Footing (4).** Hold **click** on a grid node to dig a footing and set a
  stone pier (2 stones). The first footing starts a building. Every other
  footing must come up to the same level, and a pier only makes up about
  25 cm. On a slope you'll be told how many centimetres too high or too low
  the ground is, so grade it first. Footings can't go under water: fill the
  spot in first.
- **Log wall (5) / timber (6).** Click a node to start a wall, then click
  another node along the same line to lay a log between them (up to 8 m).
  Click again to stack the next course on the same line, and **right-click**
  when you're done. Walls stack Lincoln-log style:
  - The first logs you lay sit on the footings as sills. Walls across them
    start half a course higher, resting on the sills where they cross.
  - A log needs something under **both ends**: a footing (bottom course
    only), a log crossing beneath it, or the log below it in the same wall.
  - Where a log crosses another, it **rides high** and gets chalk marks at
    the joints. Switch to the axe and cut each notch, and it drops into
    place. Nothing can be stacked on a log until it's notched in.
  - Leave a gap in the lower courses and span over it for a **door** or a
    **window**. A door needs about five courses of opening.
  - Walls that close a loop make a **room**. A wall ending against another
    wall makes a T-junction, and its log ends poke through.
- **Roof (7).** Aim into a finished rectangular room. Its walls must be at
  least ~1.7 m high and level all round, and fully notched. Click to raise a
  gable roof with shakes, board gables and a ridge pole. It costs hewn timber.
- **Right-click** with a building tool takes a piece down and gives the
  materials back, unless something rests on it.

Round logs get clay chinking between the courses. Hewn timbers stack flush
with tight corners.

**Campfire (8).**
- **Ring a pit.** Aim at the ground and hold **click** to scrape a shallow
  pit and ring it with 4 stones. It snaps to the grid like everything else.
  The spot needs to be fairly level and dry, at least 2 m from any standing
  trunk (for the branches' sake), under open sky rather than a roof, and
  clear of stumps, boulders, felled trees, walls and other fires. The prompt
  says what's in the way.
- **Lay a fire.** Click the ring to split 1 m of log and stand it up in a
  teepee over some kindling.
- **Light it.** Click again to strike a light. It takes a few seconds to catch
  properly.
- **Feed it.** While it burns, click to put on another 0.5 m of log. A fire
  holds up to 3 m of wood. Each metre burns for about 5 minutes. As the wood
  goes the teepee burns down and falls in.
- **Embers.** When the wood runs out it glows as embers for a couple of
  minutes. Put wood on them while they're hot and they rekindle. After that
  it's cold ash.
- **Right-click** a burning fire, or embers, to kick earth over it and put it
  out. Any unburned wood is left charred in the ring, and you can light it
  again. Right-click a ring with no fire in it to take it apart. You get the
  stones back, and any unburned wood in half metres.

Fires burn by the clock on the wall, not the hour in the sky (that's yours to
scrub with **, .**). So everyone in a world watches the same fire burn down,
and one you left burning is cold ash when you come back tomorrow. You can't
walk into a fire with wood in it, and neither the shovel nor a footing, a wall
or a roof will go where a fire ring is. A fire also lights the world around
it, which matters a great deal more after dark than at noon.

Everything you change is saved in your browser, separately for each world
seed. That covers felled trees, stumps, the shape of the ground, buildings,
fires and what you're carrying. Add `?clearbuild` to start over, or `?creative` to
skip the gathering.

## Adding a structure

Structures are registered in [`src/structures/index.js`](src/structures/index.js),
which explains the format in full. In short, each one gives a position, a
clearing radius and a `build()` function that returns a three.js object. The
world then:

- flattens a pad at that spot, blending smoothly into the surrounding ground
- keeps trees, rocks, logs and undergrowth out of the clearing, and water
  away from it
- places your object there, with shadows on

```js
// src/structures/thinkingHut.js
export const thinkingHut = {
  id: 'thinking-hut',
  name: 'The Thinking Hut',
  x: 120, z: -40, radius: 9,
  build({ THREE }) {
    const g = new THREE.Group();
    // ...meshes...
    return g;
  },
};
```

## How it's put together

The game is a list of **features**. Each is a function that takes the game
and installs itself — makes its things, says what it saves, binds its keys,
adds what it does each frame — and `src/main.js` is little more than the list:

```js
const FEATURES = [installRender, installHud, installWorld, installPlayer, installAudio,
                  installBuild, installFires, installMap, installSave, installWildlife, installDebug];
```

A feature lives in a folder of its own, and its `index.js` is the only file in
it that knows about the game as a whole. Everything else in the folder is
ordinary classes and functions that are handed what they need, which is what
lets most of them be tested in Node with nothing else running.

**The frame.** Each frame runs in phases, and within a phase in the order
features were installed (`src/game/game.js`):

| phase | what happens |
|---|---|
| `input` | keys have been read and commands run; the clock ticks |
| `update` | what you do: walking, the tool in your hands |
| `world` | what follows from where you are: streaming, sky, animals, other people |
| `audio` | what all of that sounds like |
| `render` | draw it |
| `late` | the HUD, saving, bookkeeping |

`world.game.systems` in the console shows what runs, in order. A system that
throws is reported and, if it keeps throwing, stopped: a stuck animal doesn't
freeze the forest.

**What features plug into.** Things a new feature usually needs already have
a place to go, so that adding one doesn't mean editing the others:

| to add… | …call | defined in |
|---|---|---|
| something done every frame | `game.addSystem({ name, phase, update })` | `game/game.js` |
| a key, and its line on the help panel | `game.commands.add({ keys, run, group, label })` | `game/commands.js` |
| something that is saved | `game.save.register({ id, collect, restore, … })` | `save/domains.js` |
| a tool | `game.builder.register(tool)` | `build/builder.js` |
| a thing tools must work round | `game.builder.obstacles.addSource(fn)` | `build/obstacles.js` |
| a material to carry | `game.builder.stock.define({ id, label })` | `build/inventory.js` |
| a one-off sound | `defineSfx(kind, play)` | `audio/sfx.js` |
| an animal's voice | `defineCall(kind, reach, play)` | `audio/calls.js` |
| a kind of ground underfoot | `defineSurface(name, { thump, step })` | `audio/footsteps.js` |
| a sound that plays all the time | `game.sound.addLayer({ build, update })` | `audio/soundscape.js` |
| a species | `defineSpecies(kind, def)` | `wildlife/species.js` |
| a new kind of creature altogether | `defineAnimalClass(name, make)` | `wildlife/wildlife.js` |
| a remembered preference | `game.settings.get / set` | `game/settings.js` |
| a button on the HUD | `game.hud.button(id, fn)` | `ui/hud.js` |

Each of those files opens with what the thing is and what it is handed.

**A few rules the code keeps to.**

- *The forest is grown, not stored.* The same seed always grows the same
  land, so a save holds only what was changed. Anything that alters what a
  seed grows (`world/worldgen.js`, `chunkGen.js`, `water.js`, `drainage.js`,
  the order of `world/flora.js`) moves every saved cabin relative to its
  hillside.
- *A save is spelled once, for good.* Each system says how its share of a
  save is cut into elements (`t:120:-40`, `l:x:0:0:4:0`), next to the class
  that owns it. Worlds on the server are spelled that way now: add new kinds,
  don't alter old ones. An element this build has never heard of is left
  alone, so an older client can't sweep away what a newer one saved.
- *Say each thing once.* What grows is one table (`world/flora.js`), keys
  are one registry, the address bar is read in one file (`config.js`), and
  every `localStorage` key is listed in `core/storage.js`.
- *Tell, don't be reached into.* A class that others need to hear from emits
  events (`chunks.on('vegetation', …)`, `player.on('footstep', …)`,
  `forest.on('crash', …)`) rather than holding one `onSomething` slot that the
  last caller wins.
- *Layers point one way.* `core` knows nothing; `render` knows `core`;
  `world` knows those; the features know the world and, where they must,
  each other — and nothing reaches back down.

### Extending the game

**A feature.** Campfires are one. `src/fires/` holds the fire itself in
plain modules (what a fire is and how it burns down, the tool, the look, the
sound) and an `index.js` that plugs it in:

```js
// src/fires/index.js, in short
export function installFires(game) {
  const { scene, camera, solids, sky, builder, sound, save } = game;
  const fires = new Fires({ scene, solids, sky });
  game.provide('fires', fires);                              // world.fires in the console

  builder.register(campfireTool(fires, solids));             // key 8, on the tool bar
  builder.obstacles.addSource((x, z, R, out) => {            // spades, walls, footings and roofs go round it
    for (const f of fires.list.values()) out.push({ x: f.x, z: f.z, what: 'a fire ring', dig: 1.05, wall: 0.55, footing: 1.15, roof: 0.5 });
  });
  save.register({ ...firesSave, collect: () => fires.serialize(),   // kept, shared, and synced live;
    restore: (data) => fires.load(data), adopt: (data) => fires.adopt(data) });  // spelled in fires.js
  fires.on('change', () => save.touch());
  sound.addLayer(crackle(fires));                            // heard from where each one burns
  game.addSystem({ name: 'fires', phase: 'world', update: ({ dt }) => fires.update(dt, camera.position) });
}
```

`installFires` comes after `installBuild` in the list in `main.js`, because
it needs the builder. Nothing else in the game was told about fires, with
one exception: a fire ring was the first thing a roof couldn't go over, so
obstacles learned a `roof` radius and the roof tool now checks it. When a new
thing needs something the game doesn't offer yet, add it like that: as a
general idea in the place that owns it, not as a special case for the thing.

**A tool** is an object with `target(b)` — what would a click do, here, now?
— and `work(b, t, io)` — act on the buttons. The contract, and everything the
bench hands a tool, is at the top of `src/build/builder.js`; the six that come
with the game are in `src/build/tools/`; `hands.js` is the shortest to read.

**Something saved** registers a *domain*: `collect()` and `restore(data)`
for its plain-JSON state, and, if it is part of the world rather than yours
alone, how that state is cut into elements. This browser's copy, the save
server, the diff that finds what changed and the socket other people build
over all work off the registry — none of them needs telling. See the top of
`src/save/domains.js`.

**A sound.** One-off sounds are entries in a table: `defineSfx('strike',
(k) => { k.noise(…); k.tone(…); })`. Sounds that are always there (a stream, a
fire) are *layers* with `build` and `update`. Everything goes out through a
bus — `ambience`, `effects`, `wildlife`, or one you name, like `music` — whose
level can be set on its own: `world.sound.volume('wildlife', 0.5)`.

**An animal** is an entry in `src/wildlife/species.js` (where it lives, when
it's about, how it takes to people), a body in `mammals.js` or `birds.js`,
and if it has a voice, a `defineCall`. Four-legged mammals need nothing else.

**A key** is `game.commands.add({ id, keys: ['KeyB'], group: 'LOOK', label:
'…', run })`, from the feature that owns what it does. The help panel is
written from the same list, and two features wanting one key are warned about.

### Checking it still works

```bash
npm test             # in Node, a second or so
npm run smoke        # a play-through in a headless browser, about a minute
npm run together     # two visitors in one world (run `npm run serve` first)
```

`npm run together` puts a world on the server as one visitor, then has a
second pick a name at the door, build alongside, and come back from a third
browser by signing in — and checks that each finds their own things, not the
other's.

`npm test` pins the things other people's worlds depend on — that a seed
grows the same land (`test/golden/`), that a save is spelled as it always was,
that what is already in someone's browser still opens — along with the rules
of building and the game loop. If one of the golden files stops matching, the
code changed something it shouldn't have; only re-record
(`UPDATE_GOLDEN=1 npm test`) when the change is meant.

`npm run smoke` plays: it fells a tree, bucks and hews it, picks up a stone,
digs, raises and roofs a cabin, lights a campfire in it (and finds the roof
won't go over that), reloads to see it was all kept, opens the map
and leaves a mark, makes some noise and calls up one of every animal. It
drives the keys and the crosshair and reads results through `window.world`,
so it doesn't care how the insides are arranged. The last two need
[Playwright](https://playwright.dev) (`npm i -D playwright && npx playwright
install chromium`).

## Layout

```
src/
  main.js                 which world to open, the list of features, the opening
  config.js               tunables (+ URL overrides): the only reader of the address bar
  noise.js                seeded simplex noise, hashing, helpers
  core/
    events.js             Emitter: on / emit, in place of single callback slots
    storage.js            this browser's memory, and every key kept in it
    geom.js               plan-view geometry and chance that several systems share
    format.js             how numbers are written for people
  game/
    game.js               the Game: what features share, and the frame's phases
    commands.js           keys and what they do; the help panel is written from it
    settings.js           the visitor's preferences
    debug.js              stats (V) and the console helpers
  render/
    index.js              ← feature: renderer, scene, camera, the look keys
    pixelPipeline.js      low-res render → composite → soft-pixel upscale
    uniforms.js           shader uniforms everything shares: time, wind, sky
    glsl.js               shared GLSL: noise, sky gradient, ground colour
  ui/
    index.js              ← feature
    hud.js                coordinates, prompts, tool bar, help panel, buttons
  world/
    index.js              ← feature: the land, the sky, the hour
    worldgen.js           pure world description: height, paths, forest, species
    water.js              streams, rivers, ponds and lakes, as part of that description
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
  player/
    index.js              ← feature: controls, the hiker, where you arrive
    player.js             movement, collision, wading and swimming, third-person camera
    character.js          procedural hiker model, IK gait, work poses
    input.js              keyboard, mouse, touch
    peers.js              everyone else, drawn and eased between messages
  audio/
    index.js              ← feature: footsteps, the sound key, what the forest is told
    soundscape.js         the engine: audio context, mixer buses, the kit, layers
    kit.js                noise, impulse, envelope
    layers/               weather · crickets · birds · water and pond life
    sfx.js                the sounds of work, as a table
    calls.js              animal calls, placed where the animal is
    footsteps.js          by what is underfoot
  build/
    index.js              ← feature: the tools, the obstacles, what is saved
    builder.js            the bench: aim, swing, hold, prompt — and what a tool is
    tools/                hands · axe · shovel · footing · wall · roof
    buildings.js          footings, notched log walls, rooms, roofs (the rules)
    forestry.js           felling, limbing, bucking, stumps, cleared plants
    terrainEdits.js       digging, filling and grading on the 1 m vertex grid
    inventory.js          what you carry
    stake.js              the grade stake and its plane
    obstacles.js          what work has to go round
    previews.js           ghosts, grid dots, the shovel's ring
    chips.js              wood chips and clods
    aim.js                rays against ground and trunks
    geometry.js           logs, timbers, chinking, piers, roofs, stumps, tools
    constants.js          dimensions: course height, overhang, pier range, reach…
  fires/
    index.js              ← feature: campfires
    fires.js              what a fire is, how it burns down by the clock, how it is saved
    tool.js               the campfire tool: ring, lay, light, feed, put out
    look.js               flames, glowing coals, smoke and sparks
    geometry.js           the stone ring, the teepee of firewood, the ash
    sound.js              the crackle; the strike, the catch and the hiss
  map/
    index.js              ← feature
    mapRender.js          pure top-down tile renderer (runs in a worker)
    mapWorker.js          Web Worker wrapper around mapRender
    tiles.js              tile cache + worker scheduling
    mapView.js            the map overlay: pan/zoom, pins, mark editor, list
    marks.js              the marks, their icons and colours
    markers.js            your marks as pennants in the world
    map.css               map styles
  save/
    index.js              ← feature: other people, the panel, the key
    domains.js            what a save is made of: the registry every system adds to
    worldSave.js          keeping a world: what moved, when it goes out
    local.js              a world that lives only in this browser
    regions.js            elements by 64 m region, and the changes between two sets
    live.js               the socket: changes and people, both ways
    frame.js              the wire format, shared with the Worker
    remote.js             gzip in the browser, and the calls to the server
    who.js                the rules for a name and a password, shared with the Worker
    signIn.js             the door into a shared world: who are you?
    sharePanel.js         the save panel (L): link, name, who's here, sign out
    save.css              save panel and door styles
  wildlife/
    index.js              ← feature
    wildlife.js           who's about: arrivals, departures, what animals can sense
    species.js            habitat, hours, rarity, group size, temperament
    rig.js                primitives → one skinned mesh per animal
    quadruped.js          shared skeleton + gaits + leg IK for four-legged animals
    mammals.js            what each mammal looks like
    beasts.js             how mammals behave (graze, alert, flee, climb, howl...)
    birds.js              bird bodies and wings, flapping and folding
    flyers.js             flocks, passing birds, a soaring hawk, owls
    crawlers.js           snakes and salamanders
    insects.js            bee swarms and butterflies
  structures/
    index.js              ← register structures here
    loader.js             places structures on their pads
worker/
  index.js                the front door: mint an id, route to the world
  world.js                a world's Durable Object — the only writer, and who is who
  members.js              passwords kept as hashes, sign-ins as cookies
test/
  *.test.js               npm test: world generation, saving, building, the game loop
  golden/                 recorded answers the code has to keep giving
  smoke.mjs               npm run smoke: a play-through in a headless browser
  together.mjs            npm run together: two visitors, one world
```

Inside a world's own SQLite:

```
world      seed, name, generation
elements   (region, key) -> value          the world itself
ops        recent changes, for catching up after a blip
copies     whole copies, kept now and then
packed     the elements gzipped, until they next change
members    name, password hash, their own state
sessions   sign-ins: a token's SHA-256 -> who
```
