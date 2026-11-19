# my-world

An open-world forest you can wander through as a little explorer, seen from
behind in third person. It's built with three.js. The art is pixelated but
lit and shaded like a real scene, and the pixels are softened just enough
that you can't quite tell whether it's pixel art trying to look real or a
painting made of pixels.

You can also **build**: fell trees, buck them into logs, hew timbers, clear
and grade the ground, set stone footings, and raise a notched log cabin with
rooms, doors, windows and a roof. See [Building](#building).

Over time we'll also add hand-made **structures**: places to keep thoughts and
ideas, and places to explore. See [Adding a structure](#adding-a-structure).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/, can be hosted anywhere
```

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
| **1 – 7** | tools: hands, axe, shovel, footing, log wall, timber, roof |
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
map marks are kept).

## The map

Press **M** (or tap *map*) for a top-down map of the forest. It's drawn from
the same world description as the 3D view (`src/map/`), so it always matches
what's there: meadows and woods, footpaths, rock, and hillshaded relief with
contour lines. Zoomed in, every tree, bush and boulder is in its real place.
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
files (`src/audio/soundscape.js`). Browsers only allow sound after you
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
- **Footsteps** follow the stride of the walk and run animation. They
  change with the ground under you: packed earth and grit on paths, a swish
  in grass, crackling leaf litter in the woods. They get sharper when you
  run, and there's a thud when you land a jump.

- **Work** makes noise too. You'll hear the axe biting (deeper on a thick
  trunk), a tree creaking as it goes, then the crash and the crown thrashing
  through the brush. There's the scrape and toss of the spade, the knock of a
  log set down on another, and the clack of stones.

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
- **Ecology.** A forest-density field opens into meadows full of wildflowers.
  A species field shifts the woods between conifers and broadleaf trees, with
  birches along the edges. Ferns grow where it's damp and shaded, and you'll
  also find bushes, boulders and fallen logs.
- **Time of day.** Palettes are keyed to the sun's elevation, from dawn to
  midday, golden hour, dusk and night. At night there's moonlight, stars and
  fireflies. In daytime there's drifting pollen.

From the browser console you can jump around with
`await world.teleport(x, z)`.

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
  the ground is, so grade it first.
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

Everything you change is saved in your browser, separately for each world
seed. That covers felled trees, stumps, the shape of the ground, buildings
and what you're carrying. Add `?clearbuild` to start over, or `?creative` to
skip the gathering.

## Adding a structure

Structures are registered in [`src/structures/index.js`](src/structures/index.js),
which explains the format in full. In short, each one gives a position, a
clearing radius and a `build()` function that returns a three.js object. The
world then:

- flattens a pad at that spot, blending smoothly into the surrounding ground
- keeps trees, rocks, logs and undergrowth out of the clearing
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

## Layout

```
src/
  main.js                 boot, loop, keys, save/restore
  config.js               tunables (+ URL overrides)
  noise.js                seeded simplex noise, hashing, helpers
  audio/
    soundscape.js         procedural wind, leaves, birds, crickets, owl, footsteps
  render/
    pixelPipeline.js      low-res render → composite → soft-pixel upscale
    glsl.js               shared GLSL: noise, sky gradient, ground colour
  world/
    worldgen.js           pure world description: height, paths, forest, species
    chunkGen.js           pure chunk generation (terrain buffers, vegetation lists)
    chunkWorker.js        Web Worker wrapper around chunkGen
    chunks.js             streaming, LOD, meshes, collision + height queries
    models.js             procedural trees, bushes, ferns, rocks, logs
    grass.js              grass blades + wildflowers near the player
    materials.js          terrain / vegetation / grass shader hooks
    sky.js                sky dome, clouds, stars, sun/moon, time-of-day palettes
    particles.js          pollen motes and fireflies
    markers.js            your map marks as pennants in the world
  player/
    character.js          procedural explorer model + gait animation
    player.js             movement, collision, third-person camera
    input.js              keyboard, mouse, touch
  map/
    mapRender.js          pure top-down tile renderer (runs in a worker)
    mapWorker.js          Web Worker wrapper around mapRender
    tiles.js              tile cache + worker scheduling
    mapView.js            the map overlay: pan/zoom, pins, mark editor, list
    marks.js              mark storage, icons and colours
    map.css               map styles
  build/
    builder.js            tools, aiming, actions, previews, prompts, save/load
    buildings.js          footings, notched log walls, rooms, roofs (the rules)
    forestry.js           felling, limbing, bucking, stumps, cleared plants
    terrainEdits.js       digging, filling and grading on the 1 m vertex grid
    geometry.js           logs, timbers, chinking, piers, roofs, stumps, tools
    solids.js             built things you bump into and stand on
    constants.js          dimensions: course height, overhang, pier range…
  structures/
    index.js              ← register structures here
    loader.js             places structures on their pads
  ui/hud.js               coordinates, tracked mark, hints, help
```
