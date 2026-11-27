# abduction

A study, apart from the game: remaking "The Abduction" by Jav
([@javpixel_art](https://x.com/javpixel_art/status/2125403467942654008)), a
72 second bodycam walk round a wet petrol station at night that ends with a
flying saucer taking a cow, posted as "fully 3D, made with three.js". We
don't have its code. Remaking it is how we find out whether three.js can draw
it, and at what cost per frame. [PLAN.md](PLAN.md) is the breakdown and the
plan; this is what was built from it and what was found.

Credit the original wherever the remake is shown. Its frames, sound and music
are not in this repository (`reference/` is not committed). The signs and the
overlay carry the original's words while this is compared with it in
private, and our own in anything built to be shown (`npm run
abduction:publish`; both sets are in `src/words.js`), as PLAN.md section 10,
decision 3 has it.

Unlike the game, not everything here is made in code. The surfaces are CC0
photo-scanned textures and the clouds a CC0 sky panorama, all from Poly
Haven (PLAN.md section 10, decision 1: the original's look comes from image
textures, said to be generated images). They are not committed either:
`tools/assets.mjs` fetches what `src/` asks for into `public/tex/` (about
48 MB). Models, liveries, signs, sound and music are made in code.

```bash
node abduction/tools/assets.mjs        # fetch the CC0 textures and sky the page asks for (needs curl, ffmpeg); once
npm run abduction                      # the page, http://localhost:5174 (click to play, with sound)
npm run abduction:build                # a static page in abduction/dist/
npm run abduction:publish              # the same with our own words, for showing; also dist/page.html
node abduction/tools/reference.mjs     # fetch the original and cut its stills (needs curl, ffmpeg; --full for 2048x1536)
node abduction/tools/shoot.mjs         # draw our 19 stills headless, into out/stills/ (--out name for another folder)
node abduction/tools/compare.mjs       # ours beside theirs, with numbers, into out/compare/ (--dir name)
node abduction/tools/look.mjs --pair a "t=36"   # any moment or camera, beside the original's frame and blended
node abduction/tools/capture.mjs --gpu # every frame, on this machine's card, into out/capture.mp4
node abduction/tools/survey.mjs        # solve the layout and every marked camera from tools/marks.mjs
node abduction/tools/fit.mjs 04-station        # one still's camera against layout.js, with residuals
node abduction/tools/align.mjs 33      # the yaw and pitch that align our frame with the original's at a time
node abduction/tools/sound.mjs         # render our sound offline and compare it with the original's (tools/sound.py)
node abduction/tools/bench.mjs         # what a frame costs, at 17 s and 55 s, two sizes (--gpu: WebGPU, visible)
```

On a Mac, headless Chromium draws WebGL 2 on the machine's own card (ANGLE's
Metal backend), so the tools take a second or two a frame and `bench.mjs`
measures real time. Elsewhere it is SwiftShader: minutes a still, and only
counts mean anything.

URL parameters (all read in `src/params.js`): `?t=53` stops at a second,
`?still=13-ufo-hover` at a still's time, `?shot` with `?t` stops after a few
frames and says so (for tools), `?cam=x,y,z,yaw,pitch,fov` holds the camera
(fov is what three.js is told), `?ref=13-ufo-hover` lays the original's still
over ours half see-through, `?raw` drops the lens and the overlay,
`?scale=0.5` draws smaller, `?stats` shows frame time (and the card's own
time where WebGPU can say), draw calls and triangles, `?free` flies the
camera (drag, WASD, Q/E), `?mute`, `?webgl` uses the WebGL 2 backend,
`?blockout` shows milestone 0's grey boxes, and `?no=mirror,rain,scatter,
bloom,shadows,trees,grass,farlamps,batch` leaves parts out to see what each costs.

## What is built

Everything in PLAN.md's milestones 0 to 9, then a second pass matching each
part against the original side by side, at the same moment, now that the
camera matches:

- **Lens and video (`src/post/`).** The original's barrel, focal length and
  vignette, measured (below). Interference as clean horizontal tears now and
  then while the saucer is near; the end as small blocks slipping, splitting
  and going dark. Grain at the original's (compressed) level. The overlay at
  its size and tone.
- **Camera and layout (`src/camera/`, `src/set/layout.js`).** Surveyed from
  about 300 points marked by hand in the original's frames; the camera keyed
  every half second to a second where it turns.
- **Night (`src/weather/`, `src/light/`).** A photographed storm sky taken
  down to night; that sky drawn into a cube as the scene's ambient and
  reflected light; fog clear for 6 m, then thick enough that the trees fade
  by 80 m; lamps glowing into it in soft cones; rain as short streaks; both
  lightning strikes placed where the original shows them, each lighting the
  world at its own strength; the saucer's lamps lighting the field.
- **Station (`src/set/`, `src/materials/`, `src/props/small.js`).** One
  weathered material taking a photo, sampled in world space; the canopy, shop,
  interior (about 500 instanced bottles and tins), pumps, drums, bench, ice
  chest and signs modelled.
- **Ground and field (`src/set/ground.js`, `src/plants/`).** Photo surfaces
  for forecourt, road, verge and field; mirror-sharp ragged puddles; cracks,
  joints, stains; acacias with leaf cards; a grass carpet.
- **Van, sedan, cow (`src/props/`).** Lofted car bodies with painted canvases
  for liveries and wear; the cow as a smooth blended mesh.
- **Saucer (`src/ufo/`).** A detailed hull with its own reflected sky, lit
  dashes and lamps, comet-like trails, a soft beam with a lit mist at its
  foot, the lift.
- **Sound (`src/audio/`).** Measured against the original's, layer by layer,
  and remade: a pulse, a drone and chords of our own on the original's beats;
  rain; the car; the saucer's whistles and drones; the fade at the end.

## Measured from the original

- **The lens.** Straight lamp poles at 42 s and 57 s, traced row by row, are
  straightened by the same barrel, k = 0.135 (r = 1 at the top edge's
  middle; the first guess was 0.32). The mean of every frame is not darkened
  at the edges at all: the vignette is a soft circle taking only the corners,
  from 1.39 to 1.62 half-heights. The picture is far narrower than the
  overlay's FOV says: through our lens, the tangent of the half-angle drawn
  is 0.613 times the overlay's (fitted on still 01, rms 11 px). The overlay's
  number still moves with the zoom, so the original's own camera probably
  renders wide and the lens pass crops into it.
- **The camera** walks from the first frame, at about half a metre a second,
  and stands still at (-6.1, 11.6) from 54.5 to 68.3 s (checked against the
  lamp pole's parallax). Its step is small and slow: a dip about every 1.15 s.
- **The set** is smaller than PLAN.md guessed (the canopy 11.4 × 9.5 m, its
  underside 3.8 m up; lamps 14.9 m apart on the road's edge; the van 4.2 m,
  parked nose 21° toward the road). The scale rests on the camera's height,
  which nothing in the frames fixes: at 1.5 m the drums, ice chest and cow
  come out their real sizes, the canopy, lamps and van a little small.
- **Times**, at 10 frames a second: the beam lands at 54.4 s, the cow rises
  55.3 to 57.9 s, the saucer tips at 60.8 s and leaves from about 61.3 s; the
  car is where the original's is at 18.5, 19.5, 20.5 and 21.5 s at 9 m/s.
- **Grain**: 0.7 of 255 of fine noise in flat sky. The compression has
  crushed most of whatever grain the original had.
- **Sound**: overall -34.2 dB; a 43 BPM sub pulse at about 42 Hz, a drone in
  D, gliding chords from 9.87 s on the beat, a near-mono rain bed with short
  drops, tyre noise peaking 18.7 dB over the bed at 21.2 s panned right, the
  saucer's whistles (1.4 kHz falling to 350 Hz arriving, 176 rising to 516 Hz
  leaving), no thunder to speak of, and a fade through a falling low-pass
  from 70.4 s. Ours is within 3 dB of it in five bands over each of 14
  stretches. Our music is our own (E minor, our own progression) on the
  original's beats and register.

## Where it departs from the plan

- **Photo textures.** Decision 1 of PLAN.md section 10 is made: CC0 surfaces
  and sky, fetched, not committed; models in code.
- **Headless WebGPU cannot present** in the cloud container this started in,
  so the tools go through `WebGPURenderer`'s WebGL 2 backend (`?webgl`): the
  same node graphs, compiled to GLSL. In a browser with WebGPU the page uses
  WebGPU; `capture.mjs --gpu` and `bench.mjs --gpu` do too.
- **One weathered program.** Every knob of the weathered material is a
  uniform and every part, the photo included, is always in its graph, so all
  its surfaces share one shader program.
- **The fog's glow is in the lens pass**, at full size, at the warped
  coordinate, rather than a half-size pass of its own.
- **Not used:** GTAO, SSR (the mirror is exact on one flat ground), TRAA.
- **The set is merged** by material (`src/set/batch.js`).

## Found so far

**The look is reachable with what three.js has.** Every effect is built from
stock parts (`WebGPURenderer`, TSL node materials, `reflector()`, `bloom()`,
`RectAreaLight`, shadow maps, instancing, a cube camera for the sky's light)
and node code of our own. Side by side at the same moments, with the camera
matched to within about 5 to 20 px, the stills share their composition,
light and mood, and the middle of the frame is within about 8 levels of the
original's brightness on most of them (table below).

**Speed**, measured on an Apple M5 Pro (16-core GPU), headless Chromium,
WebGL 2 through Metal (not WebGPU), while other renders shared the card, so
these are upper bounds:

| At | 1440×1080 | 2048×1536 | Draw calls | Triangles |
| --- | --- | --- | --- | --- |
| 17 s, the forecourt | 41 ms (25 fps) | 66 ms (15 fps) | 381 | 1.30M |
| 55 s, the beam | 22 ms (45 fps) | 38 ms (26 fps) | 243 | 1.07M |

At 17 s and 1440, leaving a part out saves: the fog's glow 5.6 ms, the
ground's mirror 3.2 ms (170 draws, 0.4M triangles), shadows 1.6 ms, grass
1.5 ms, trees 1.5 ms. Most of what is left is shading the scene itself, drawn
1.3 times larger than the output (so the middle, which the lens magnifies,
stays sharp) and 4× multisampled. The obvious savings, not yet taken: a
smaller overdraw with TRAA instead of multisampling, the glow at half size.
Whether the original runs at 60 on a desktop card through WebGPU is still to
be measured (`bench.mjs --gpu` on such a machine).

**What matched easily:** the wet ground's streaks and mirror, the lens once
measured, the overlay, the beam as a solved chord, the glitch.

**What took work:** the camera and layout (every first guess was wrong;
solved together from hundreds of marks); exposure (the surfaces, the sky's
light and the camera each moved it, and it was set again against all 19
stills at the end); the lightning (the bolts never drew on Metal: a one-sided
ribbon, culled); the car's headlights (5000 cd at a few metres bloomed into a
glare); the sound (ours had been up to 29 dB too loud in places).

**What does not match yet:** the trees' crowns (ours merge into a wall where
the original's read one by one, green in the light); the van's and sedan's
painted wear, less varied than image textures; fur on the cow; the shopfront
close-ups (27 and 30 s) are framed 20 to 60 px off; the saucer's arrival path;
the sound by ear: nobody has listened to it yet.

Brightness of the middle of the frame, ours against the original's (0 to
255), from all 19 stills at 1440×1080 after the final exposure pass:

| Still | Median, ours (theirs) | 99th percentile, ours (theirs) |
| --- | --- | --- |
| 01-establishing | 40 (38) | 149 (167) |
| 02-lightning-sign | 72 (64) | 173 (192) |
| 03-light-in-sky | 36 (33) | 138 (77) |
| 04-station | 45 (41) | 177 (134) |
| 05-car | 44 (39) | 108 (146) |
| 06-canopy-pan | 48 (42) | 133 (119) |
| 07-shopfront | 25 (30) | 168 (149) |
| 08-interior | 25 (29) | 191 (208) |
| 09-under-canopy | 50 (48) | 167 (157) |
| 10-pasture | 37 (35) | 68 (77) |
| 11-lightning-pasture | 71 (77) | 197 (233) |
| 12-ufo-arrives | 40 (37) | 67 (79) |
| 13-ufo-hover | 54 (48) | 110 (100) |
| 14-beam | 65 (55) | 178 (195) |
| 15-cow-rising | 65 (59) | 188 (196) |
| 16-ufo-empty | 50 (55) | 119 (105) |
| 17-ufo-leaves | 51 (52) | 83 (89) |
| 18-return | 54 (45) | 158 (139) |
| 19-glitch | 40 (35) | 135 (107) |

## Files

- `index.html`: the stage, the title card, the overlay's root.
- `vite.config.js`: the page's own build; `public/` holds the fetched textures.
- `src/main.js`: renderer, the loop, the camera's placing, still and capture modes.
- `src/params.js`: the only reader of the URL.
- `src/timeline.js`: the clock and every event's time; lightning envelopes; the interference's strength.
- `src/stills.js`: the 19 stills' names and times, shared with the tools.
- `src/words.js`: every word in the picture, the original's and our own.
- `src/world.js`: builds the scene and updates it from t.
- `src/noise1.js`: smooth noise of time, for things that wobble.
- `src/camera/`: `path.js` (where, looking where, FOV), `track.js` (monotone curves through keys),
  `handheld.js` (steps, sway, jitter), `free.js` (?free).
- `src/set/`: `layout.js` (every position and size, surveyed), `batch.js` (merging what never moves), `ground.js`,
  `shop.js`, `interior.js`, `canopy.js`, `lamps.js`, `fence.js`, `welcome.js`, `signs.js` (every word),
  `shapes.js` (rounded boxes, tubes, sagging wires), `blockout.js`.
- `src/props/`: `van.js`, `sedan.js`, `cow.js`, `small.js` (pumps, drums, bench, ice chest, bin),
  `vehicle.js` (what the two vehicles share: paint, chrome, wheels, bumpers), `loft.js` (a car body as one
  lofted skin), `atlas.js` (painted canvases for liveries and wear), `sdf.js` (smooth meshes from blended shapes).
- `src/plants/`: `tree.js`, `grass.js` (and stones).
- `src/weather/`: `sky.js` (the photographed sky at night), `fog.js` (height fog and the light it scatters),
  `rain.js`, `lightning.js` (bolts placed through the lens where the original has them).
- `src/ufo/`: `saucer.js`, `lathe.js` (lathing with creases), `reflections.js` (the hull's own night sky),
  `flight.js`, `trails.js`, `beam.js`, `lift.js`, `index.js`.
- `src/light/`: `rig.js` (every light, and which are real just now), `environment.js` (the sky as light).
- `src/materials/`: `weathered.js` (the one weathered material, with a photo), `textures.js` (the CC0 photos
  and sky), `metals.js` (steel, pipe, cable, chrome), `glass.js`, `noise.js`.
- `src/post/`: `pipeline.js` (the frame after the scene, the lens, and the drawn FOV), `grade.js`,
  `interference.js`, `glitch.js`.
- `src/hud/`: the overlay.
- `src/audio/`: `mix.js` (buses, room, the end, the offline render), `voices.js` (rain, car, saucer),
  `music.js` (the instruments), `score.js` (our cue, in beats), `hearing.js` (where things are from the
  listener), `dsp.js` (noise, filters, buffers, the room's impulse response).
- `tools/`: `reference.mjs`, `assets.mjs` (the CC0 textures), `browser.mjs`, `shoot.mjs`, `compare.mjs`,
  `look.mjs` (any moment or camera beside the original), `capture.mjs`, `bench.mjs`, `fit.mjs`,
  `survey.mjs` and `marks.mjs` (the layout and cameras from hand marks), `align.mjs` (turns between stills),
  `sound.mjs`, `sound.html` and `sound.py` (our sound rendered and measured against the original's),
  `publish.mjs` (the build for showing).

Nothing here is imported by the game, and nothing in `src/` of the game is
imported here.
