# my-world

An open-world forest you can wander through as a little explorer, seen from
behind in third person. It's built with three.js. The art is pixelated but
lit and shaded like a real scene, and the pixels are softened just enough
that you can't quite tell whether it's pixel art trying to look real or a
painting made of pixels.

There are no buildings yet. Over time we'll add **structures**: places to
keep thoughts and ideas, and places to explore. See
[Adding a structure](#adding-a-structure).

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
| **P** | pixel art on / off |
| **[ ]** | pixel size |
| **- =** | pixel softness (0 = hard pixels, 1 = smooth) |
| **O** | silhouette outlines on / off |
| **, .** | scrub the time of day |
| **T** | let time flow (a full day takes 24 minutes) |
| **M** | sound on / off (also the *sound* button, bottom right) |
| **F** | fullscreen |
| **V** | stats (fps, draw calls, triangles) |
| **H** or **?** | help |

On a phone or tablet, drag with your left thumb to walk (push it all the way
to run), drag with your right thumb to look, and tap on the right to jump.

Your position, the time of day, your look settings and whether sound is on
are remembered between visits. Add `?reset` to the URL to start fresh.

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
  player/
    character.js          procedural explorer model + gait animation
    player.js             movement, collision, third-person camera
    input.js              keyboard, mouse, touch
  structures/
    index.js              ← register structures here
    loader.js             places structures on their pads
  ui/hud.js               coordinates, hints, help
```
