# abduction

A study, apart from the game: remaking "The Abduction" by Jav
([@javpixel_art](https://x.com/javpixel_art/status/2125403467942654008)), a
72 second bodycam walk round a wet petrol station at night that ends with a
flying saucer taking a cow, posted as "fully 3D, made with three.js". We
don't have its code. Remaking it is how we find out whether three.js can draw
it, and at what cost per frame. [PLAN.md](PLAN.md) is the breakdown and the
plan; this is what was built from it and what was found.

Credit the original wherever the remake is shown. Its frames, sound and music
are not in this repository (`reference/` is not committed), and the signs
still carry its words (PLAN.md section 10, decision 3): change them in
`src/set/signs.js` before showing this anywhere.

```bash
npm run abduction                      # the page, http://localhost:5174 (click to play, with sound)
npm run abduction:build                # a static page in abduction/dist/
node abduction/tools/reference.mjs     # fetch the original and cut its stills (needs curl, ffmpeg)
node abduction/tools/shoot.mjs         # draw our 19 stills headless, into out/stills/
node abduction/tools/compare.mjs       # ours beside theirs, with numbers, into out/compare/
node abduction/tools/capture.mjs --gpu # every frame, on this machine's card, into out/capture.mp4
node abduction/tools/fit.mjs 01-establishing   # fit the camera to points marked in a still
node abduction/tools/bench.mjs --gpu   # what a frame costs, at 17 s and 55 s, two sizes, on this machine's card
```

URL parameters (all read in `src/params.js`): `?t=53` stops at a second,
`?still=13-ufo-hover` at a still's time, `?ref=13-ufo-hover` lays the
original's still over ours half see-through, `?raw` drops the lens and the
overlay, `?scale=0.5` draws smaller, `?stats` shows frame time (and the
card's own time where WebGPU can say), draw calls and triangles, `?free` flies
the camera (drag, WASD, Q/E), `?mute`, `?webgl` uses the WebGL 2 backend,
`?blockout` shows milestone 0's grey boxes, and `?no=mirror,rain,scatter,
bloom,shadows,trees,grass,farlamps,batch` leaves parts out to see what each costs.

## What is built

Everything in PLAN.md's milestones 0 to 9 has a first version, and every one
of the 19 stills can be drawn and set beside the original's:

- **Stage (0).** The page, a 4:3 stage, one clock (`src/timeline.js`) that
  drives everything, the camera path, the hand holding it, the fisheye, the
  overlay with its live clock, resolution, FOV and sound meters.
- **Night (1).** Lights only where something glows (`src/light/rig.js`): of
  the row of street lamps only the three nearest the camera are real lights,
  the rest are glowing heads, cones in the fog and pools painted on the
  ground. Height fog on every material; the light the fog scatters toward the
  camera from every lamp in closed form, per pixel, in the lens pass. Sky
  dome, bloom, AgX and a grade.
- **Wet ground (2).** One ground mesh and one material that knows forecourt
  from verge, road, shoulder and field; wetness from noise and hand-placed
  puddles; roughness and normal from it; `reflector()` for the mirror image;
  slab joints, cracks, road markings, faint rings where rain lands.
- **Station (3).** Shop, interior through glass, canopy with tubes (one
  hanging crooked), islands and peeling columns, signs drawn to canvases, all
  through one weathered material.
- **Field (4).** Trees grown in code (four acacia-like shapes, instanced, with
  leaf cards and bent normals), grass tufts, stones, fence.
- **Weather (5).** Rain (20,000 drops placed from their index and t, lit by
  the fog's light list, none under the canopy), both lightning strikes with
  their envelopes, the light in the sky, wind in the trees.
- **Things (6).** Van, sedan (its pass, headlights, its light in the fog),
  pumps, drums, bench, ice chest, bin, phone box, the cow.
- **Abduction (7).** Saucer, its rim lights and ring, its flight in and out,
  trails, the beam (its brightness the length of the view ray inside the
  cone, solved exactly), the lift.
- **Bodycam (8).** Fringing, grain, vignette, the interference bands while
  the saucer is near, the signal loss at the end.
- **Sound (9).** Web Audio only: rain, a harder patter under the canopy,
  thunder by distance, the car with Doppler and pan, the saucer's tones, the
  beam's sweep, our own drone and chords, the crushed noise of the end. The
  audio clock drives t while playing.
- **Tools (10).** `shoot.mjs`, `compare.mjs`, `capture.mjs`, `bench.mjs`, `fit.mjs`.

## Where it departs from the plan

- **Headless WebGPU cannot present here.** Chromium in this container gives a
  SwiftShader WebGPU adapter, as PLAN.md found, but the device is destroyed as
  soon as it draws to a canvas (any flags tried). So `shoot.mjs` and
  `capture.mjs` go through `WebGPURenderer`'s WebGL 2 backend (`?webgl`): the
  same TSL node graphs, compiled to GLSL. In a browser with WebGPU the page
  uses WebGPU; `capture.mjs --gpu` does too.
- **The layout moved after fitting.** `tools/fit.mjs` marks known places in a
  still and solves for the camera. Through the lens of `src/post/pipeline.js`
  with the overlay's FOV as three.js's vertical field of view, a warp of
  k = 0.32 to 0.4 fits still 01 to about 15 pixels, and then the street
  lamps are about 10 m apart (PLAN.md guessed 22), on the verge rather than
  across it, with the road and field about a metre nearer. `src/set/layout.js`
  has the fitted numbers. The camera keys in `src/camera/path.js` were fitted
  by eye from there, against `compare.mjs`'s blends.
- **One weathered program.** Every knob of the weathered material is a
  uniform and every part is always in its graph, so all its surfaces share
  one shader program; with forty programs of eighteen lights each, software
  rendering took minutes to compile.
- **The fog's glow is in the lens pass**, at full size, at the warped
  coordinate, rather than a half-size pass of its own: one pass fewer, and the
  sums are cheap (atan and a little noise per lamp).
- **Not used:** GTAO (the scene is dark and lit only by small lights; it is a
  candidate if the corners look flat on a real card), SSR (the mirror is
  exact on one flat ground), TRAA.
- **The set is merged.** Everything that never moves is gathered and merged
  by material (`src/set/batch.js`), so it costs a few dozen draws in each
  pass (scene, mirror, shadow maps) rather than hundreds.
- **Files merged:** the small props are `src/props/small.js`, the sounds
  `src/audio/voices.js`, the road and field are in `src/set/ground.js`.

## Found so far

Speed is the question this exists to answer, and it can only be measured on a
real card: open `?stats` at `?t=17` (the forecourt) and `?t=55` (the beam), at
1440x1080 and 2048x1536, and write the numbers here with the machine's name.
SwiftShader here draws a frame in seconds, which says nothing.

What the numbers this side can say: see the table below, from `?stats`
headless at 1440x1080 (drawn 1.3 times larger for the warp).

| At | Draw calls | Triangles |
| --- | --- | --- |
| 17 s, forecourt | (to measure) | |
| 55 s, beam | | |

What matched easily, what took work, and what did not match yet are in the
stills: `node abduction/tools/shoot.mjs && node abduction/tools/compare.mjs`.

## Files

- `index.html`: the stage, the title card, the overlay's root.
- `vite.config.js`: the page's own build (`npm run abduction`).
- `src/main.js`: renderer, the loop, the camera's placing, still and capture modes.
- `src/params.js`: the only reader of the URL.
- `src/timeline.js`: the clock and every event's time; lightning envelopes; the interference's strength.
- `src/stills.js`: the 19 stills' names and times, shared with the tools.
- `src/world.js`: builds the scene and updates it from t; what the sound needs to know.
- `src/noise1.js`: smooth noise of time, for things that wobble.
- `src/camera/`: `path.js` (where, looking where, FOV), `track.js` (monotone curves through keys),
  `handheld.js` (steps, sway, jitter), `free.js` (?free).
- `src/set/`: `layout.js` (every position and size), `batch.js` (merging what never moves), `ground.js`, `shop.js`, `interior.js`,
  `canopy.js`, `lamps.js`, `fence.js`, `welcome.js`, `signs.js` (every word), `blockout.js`.
- `src/props/`: `van.js`, `sedan.js`, `cow.js`, `small.js`, `vehicle.js` (what the two vehicles share).
- `src/plants/`: `tree.js`, `grass.js` (and stones).
- `src/weather/`: `sky.js`, `fog.js` (height fog and the scattered light), `rain.js`, `lightning.js`.
- `src/ufo/`: `saucer.js`, `flight.js`, `trails.js`, `beam.js`, `lift.js`, `index.js`.
- `src/light/rig.js`: every light, and which street lamps are real just now.
- `src/materials/`: `weathered.js`, `glass.js`, `noise.js`.
- `src/post/`: `pipeline.js` (the frame after the scene, and the lens), `grade.js`,
  `interference.js`, `glitch.js`.
- `src/hud/`: the overlay.
- `src/audio/`: `mix.js` (the bus, meters, schedule), `voices.js` (each sound).
- `tools/`: `reference.mjs`, `browser.mjs`, `shoot.mjs`, `compare.mjs`, `capture.mjs`, `bench.mjs`, `fit.mjs`.

Nothing here is imported by the game, and nothing in `src/` of the game is
imported here.
