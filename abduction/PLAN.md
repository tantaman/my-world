# Plan: remaking "The Abduction" to see whether it is what it says

Status: **built, being tuned.** Written 2026-11-26 against `c21410a`; the
first build of every milestone followed the same day. README.md says what was
built, where it departs from this plan, and what has been found. The numbers
in sections 4 and 5 are the first guesses; `src/set/layout.js` and
`src/camera/path.js` hold the fitted ones.

The piece: <https://x.com/javpixel_art/status/2125403467942654008>, posted
2026-11-25 by Jav (@javpixel_art) as "my new fully 3D piece made with
@threejs". A 72.5 second video, 2048×1536, 60 frames a second: a bodycam walk
round a wet petrol station at night, in a storm, that ends with a flying
saucer lifting a cow out of the field across the road.

We don't have the code. The question is whether the claim holds: can three.js
draw this, live? The way to find out is to build it and see where it gets
hard. This document is everything needed to hand that work to someone who has
not seen the video: what is in it, how each thing is most likely done, how we
do it, in what order, and how to tell when it matches.

It is a study. Credit the original wherever the remake is shown, and don't
ship its frames, its sound or its music (that is why `reference/` is not
committed).

## Contents

1. [The answer so far](#1-the-answer-so-far)
2. [Getting the reference](#2-getting-the-reference)
3. [What happens, second by second](#3-what-happens-second-by-second)
4. [The place](#4-the-place)
5. [How each thing is done](#5-how-each-thing-is-done)
6. [The project](#6-the-project)
7. [Milestones](#7-milestones)
8. [Telling when it matches](#8-telling-when-it-matches)
9. [What could go wrong](#9-what-could-go-wrong)
10. [Decisions with a default](#10-decisions-with-a-default)
11. [Measurements](#11-measurements)

## 1. The answer so far

**It looks serious.** Read from the video alone, this is a real-time 3D scene
and not an offline render or a generated video, and nothing in it needs
anything three.js does not have today.

What points that way (each was measured, see section 11 for how):

- **One unbroken take.** No cuts in 72 seconds; the camera walks through the
  set and comes back to where it started, and the set is the same from both
  sides, signs and lettering included.
- **The overlay reads the live program.** Its clock ticks one second per
  second for the whole take. Its `FOV` number moves with the lens (95° to 114°,
  dipping to 105° as the saucer arrives). Its `1536P` is the height of the
  video itself.
- **Every one of the 4,350 frames is different** while the camera moves: no
  doubled frames, no 30-in-60 cadence. No motion blur even on the fastest pan.
- **It has the habits of a game renderer.** The canopy ceiling and the walls
  are tiling textures whose blotches repeat. Lamps, fence posts and a handful
  of tree shapes are copies. Leaves look like flat cards. Rain is sparse
  streaks that are not under the canopy and are brighter near lamps. Light
  cones in the fog are smooth shapes with no shadows cut into them, as far as
  can be seen.
- **Every effect is a stock technique**, and three.js 0.187 (the version this
  repository already has) ships a node for nearly all of them: section 5
  names the file for each.

What the video cannot show:

- **How fast it runs.** No dropped frames at 2048×1536 is what a strong
  graphics card gives, and also what you get from stepping the scene a frame
  at a time and saving each one. Only running a remake on real hardware
  answers this, and it is the number the remake exists to produce (section 8).
- **Who made the models.** The van, the sedan, the cow and the saucer look
  like library or generated models with painted textures. That says nothing
  about three.js either way.

So the remake has two things to prove: that the look can be reached with what
three.js has, and what it costs per frame.

## 2. Getting the reference

```bash
node abduction/tools/reference.mjs          # 1440x1080, 27 MB, enough for almost everything
node abduction/tools/reference.mjs --full   # 2048x1536, 66 MB, for reading small detail
```

Needs `curl` and `ffmpeg`. It writes, into `abduction/reference/` (ignored
by git):

- `video.mp4`
- `stills/NN-name.jpg`: the 19 frames this plan names, like **`04-station`**
- `sheets/overview-*.jpg`: the whole piece at a frame a second
- `sheets/<event>.jpg`: lightning, the car, the arrival, the departure and
  the last glitch, frame by frame
- `audio.wav` and `spectrogram.png`

Look at the stills and the sheets before reading on. A name in **bold** below
is a still.

| Still | At | Shows |
| --- | --- | --- |
| **01-establishing** | 0.5 s | the station from the forecourt; the look to hit first |
| **02-lightning-sign** | 5.8 s | first bolt, the welcome sign, lamps going off into fog |
| **03-light-in-sky** | 11.0 s | a point of light above the station |
| **04-station** | 17.0 s | shop, canopy, van and its mirror image in a puddle |
| **05-car** | 20.0 s | a sedan passing, headlights on, the cow behind |
| **06-canopy-pan** | 24.5 s | fastest pan; no motion blur |
| **07-shopfront** | 27.0 s | wall signs, bench, drum, the shop through glass |
| **08-interior** | 30.0 s | shelves, counter, till, pendant lamp |
| **09-under-canopy** | 36.0 s | tiling ceiling, peeling columns, pumps, van |
| **10-pasture** | 42.0 s | road, fence, cow, trees in fog |
| **11-lightning-pasture** | 42.3 s | second bolt lighting clouds, trees and road |
| **12-ufo-arrives** | 48.0 s | saucer with light trails |
| **13-ufo-hover** | 53.0 s | saucer overhead, interference in the picture |
| **14-beam** | 55.0 s | the beam down, ground lit under it |
| **15-cow-rising** | 57.0 s | cow in the beam, static bands |
| **16-ufo-empty** | 61.0 s | beam off, saucer still there |
| **17-ufo-leaves** | 63.0 s | saucer tilted and gone small, zigzag trails |
| **18-return** | 71.0 s | back at the station, from the road |
| **19-glitch** | 71.5 s | signal loss: blocks slid sideways, colours split |

## 3. What happens, second by second

One camera, carried at chest height, no cuts. Times are seconds into the
video. `FOV` is what the overlay reads at that moment.

| Time | Camera | What happens | FOV |
| --- | --- | --- | --- |
| 0.0 – 3.5 | standing on the forecourt west of the shop, looking east along its front | rain; nothing moves | 95 |
| 3.5 – 5.5 | turns right, to the road and the sign | | 95 |
| 5.7 | holds on the sign | **lightning 1**, beyond the road; bright for 0.15 s, gone by 6.6 | 98 |
| 6.4 – 9.0 | turns back left to the station, starts walking in | | 103 → 110 |
| 9.5 – 12.5 | tilts up over the roof and pushes in | **a small cyan light** in the clouds, there until about 15 s | 97 → 95 |
| 12.5 – 16 | tilts down, walks east toward the shop | | 99 → 110 |
| 16.5 – 20.6 | follows the car, turning right | **a sedan** comes down the road from the far end, headlights on, passes left to right; loudest at 21.0 | 110 |
| 21 – 25 | turns left, in under the west edge of the canopy | | 110 |
| 25 – 31 | walks up to the shop window; nearest at 30 | wall signs, phone box, bench, drum, then the inside of the shop | 110 |
| 31 – 36 | turns right along the glass: door, van, pumps | | 111 → 114 |
| 36 – 41 | keeps turning, looks out from under the canopy to the road | | 114 |
| 41 – 46 | walks out north-west to the verge | **lightning 2** at 42.2 over the trees, strikes again at 42.5, dark by 43.2 | 114 |
| 46.5 – 51 | tilts up, steps to the road's edge | **the saucer** comes in from the left along the road, trailing light, slows, stops above the cow at 50.5 | 113 → 105 |
| 51 – 53.3 | holds, looking up | it hovers; the picture starts to break up | 105 → 113 |
| 53.3 – 54.2 | | ring under the saucer brightens (53.3); **the beam** grows down (53.5) and reaches the ground (54.2) | 114 |
| 54.6 – 58.8 | | **the cow rises**, slowly at first, turning a little; it reaches the hull at 58.8 | 114 |
| 59.0 – 59.8 | | the beam draws back up from the ground | 114 |
| 60 – 61.8 | | the saucer hovers, empty field below | 114 |
| 61.8 – 64.8 | follows it up and right | it tips over (61.8), then leaves fast, up and away to the right, with two zigzag trails; out of sight by 64.8 | 114 |
| 65 – 68.3 | holds on the sky | rain | 114 |
| 68.3 – 70.3 | turns left, back to the station | | 114 |
| 71.2 – 71.8 | | **signal loss**: blocks slide, colours split, picture goes dark | 114 |
| 71.8 – 72.5 | | black | |

All of these times live in one table in the code (`timeline.js`, section 6).

## 4. The place

Everything below is **estimated by eye** from the stills and is a starting
point, good to a couple of metres. Fitting it is the first job (milestone 0).

Axes: X along the road, the way the row of lamps goes off into the fog; Y up;
Z from the shop out across the forecourt, the road and the field. The origin
is on the ground at the middle of the shop's front wall.

```
   z                     field: trees from z ≈ 34, thinning into fog
   ▲                                 cow (1, 28)        the saucer stops above it, hull 12 m up
 26.5  ─┼────┼────┼────┼────┼────┼────┼────┼────┼─  fence: wooden posts 4 m apart, three wires
       far shoulder, puddles
 23.5  ═════════════════════════════════════════════
       road, 7 m, dashed yellow centre line           the car drives toward −X
 16.5  ═════════════════════════════════════════════  white edge line
       verge: dirt, tufts, pebbles      ●  camera for the abduction, about (−2, 15.5)
 15.8  ··L·····◄sign····L··············L············  L = street lamp, about 22 m apart
 13.5  ---------------------------------------------
       forecourt: wet concrete in 4 m slabs
                              ┌───────────── canopy ─────────────┐ z = 12
                              │   island A        island B       │
   8                          │   drum·col·pump   drum·col·pump  │
          ● camera at 0 s     │                                  │
            about (−21, 5)    │                     [  van  ]    │
   0   ┌──signs─ice─phone─────┴─glass─glass─door─glass───────┐───┘
       │ door                 shop, 18 × 7 m                 │
  −7   └─────────────────────────────────────────────────────┘
      x = −9                  −3            0                +9      +14  ──► X
```

### What stands where

| Thing | Where (x, z) | Size | Notes |
| --- | --- | --- | --- |
| Shop | x −9…9, z −7…0 | 18 × 7 m, walls 3.4 m, parapet to 3.9 m | rendered concrete, dark green band along the foot of the wall, flat roof with a vent stack and a thin mast with guy wires |
| Its west end wall | x = −9 | | green door with a wall lamp over it: the warm patch on the left of **01-establishing** |
| Front wall, west part | x −9…−3.5 | | caged wall lamp, red `SOUTH` sign, `PREMIUM MOTOR OIL` poster, `TIRES / BATTERIES` sign, grey phone box with conduit running up; on the ground an ice chest (`ICE`) and a bin |
| Shopfront | x −3.5…6 | sill 0.75 m, head 2.6 m | four panes between dark mullions, a glass door with a hanging `CLOSE` sign, a shutter box above |
| Bench, oil drum | (−0.5, 0.6), (−2.2, 0.6) | bench 1.8 m | green-grey slats on a black frame; drum white-banded and rusty |
| Canopy | x −3…14, z 0…12 | underside 4.5 m up, 0.6 m thick | concrete panels beneath, faded `SOUTH` on the fascia, four twin-tube lights, one hanging crooked |
| Islands A, B | (1.5, 8), (9.5, 8) | 4.2 × 1.3 × 0.18 m | each: a 0.45 m square column, white paint peeling off, green at the foot, a Y bracket at the top; one pump; one drum |
| Pumps | one per island | 0.75 × 0.5 × 1.9 m | white boxes, rusted, a three-row dial, hose and nozzle |
| Van | (7.8, 3.2), nose to +X | 5.2 × 2.0 × 2.1 m | white 1980s panel van, orange and red stripes, `NIGHT FREQUENCY` on the side |
| Forecourt | x −30…24, z 0…13.5 | | cracked concrete, puddles |
| Welcome sign | (−14, 12.5), facing south-west | board 3.2 × 1.2 m, on two posts | an arrow of rusty sheet: `Welcome to Signal Ridge`, `KEEP AN EYE ON THE SKY`, a little saucer |
| Street lamps | z = 15.8, x = −12 + 22k, k = 0…11 | pole 5.5 m, arm 1.2 m out over the road | tapered pole with a collar part way up, flat head, warm light |
| Road | z 16.5…23.5 | to x ±400 | |
| Fence | z = 26.5 | posts 1.2 m | some posts lean |
| Cow | (1, 28) | 1.45 m at the shoulder | black and white, facing the camera |
| Trees | z 34…160, x −120…200 | 5 to 8 m | flat-topped, forked trunks (acacia-like); loose rows; three or four shapes |
| Power poles | z ≈ 60, far east | | seen only in **18-return**, in fog |
| Saucer | hovers at (1, 12, 28) | about 12 m across, 2.4 m deep | arrives from +X, leaves toward −X and up |

### Where the camera goes

Chest height, about 1.5 m. Positions are (x, z).

| At | Stands | Looks |
| --- | --- | --- |
| 0 s | (−21, 5) | east along the shop front |
| 5.7 s | (−20, 6) | north-east, at the sign |
| 11 s | (−18, 6) | up over the roof, pitch about +20° |
| 17 s | (−12, 5) | east: ice chest left, van ahead, column right |
| 20 s | (−6, 6) | north-east across the road, island A on the left |
| 24.5 s | (−5, 6) | east under the canopy |
| 27 s | (−2.5, 2.5) | at the wall, `TIRES` sign left, window right |
| 30 s | (−0.5, 1.8) | in through the glass |
| 36 s | (−1, 4.5) | east: van left, both columns ahead |
| 42 s | (−3, 10) | north across the road, canopy edge overhead |
| 48 s | (−2, 14.5) | north, tilting up |
| 53 – 64 s | (−2, 15.5) | up at the saucer, pitch about +30° |
| 71 s | (−2, 15.5) | east: canopy and pumps left, lamps right |

## 5. How each thing is done

For each: what the video shows, how we build it, and what to check it
against. "Original" notes say what the video can and cannot tell us about how
the artist did it.

The module paths are from `three@0.187.0`, the version in this repository's
`package.json`; every one named here was checked to exist in that release.
The top of each file says how to use it. **Read those, not memory or blog
posts: this part of three.js changes between releases.**

### 5.1 Renderer and frame

`WebGPURenderer` from `three/webgpu`, materials and effects written in TSL
(`three/tsl`), effects chained in a `RenderPipeline` (the class that used to
be called `PostProcessing`). It falls back to WebGL 2 by itself where WebGPU
is missing. Reasons: every effect in section 5.13 exists as a TSL node, and
the wet ground, fog and rain are each a few lines of node code instead of
patched shader strings.

The frame, in order:

1. Shadow maps: at most three lights (5.2).
2. The mirror image of the scene in the ground plane, half size (5.3).
3. The scene, HDR, 4× multisampled (`pass(scene, camera, { samples: 4 })`),
   writing colour and normal with `mrt()`.
4. Ambient occlusion, half size: `ao()` from `tsl/display/GTAONode.js`.
5. Light scattered by fog, half size (5.4), added.
6. Bloom: `bloom()` from `tsl/display/BloomNode.js`.
7. Tone mapping and grade: `renderOutput()`, then our own curve (5.13).
8. The lens: fisheye warp, colour fringing, interference, grain, vignette,
   and the last glitch (5.13, 5.14).
9. The overlay, in HTML on top (5.15).

The picture is 4:3. The page letterboxes a 4:3 canvas; the capture size is
1440×1080 for comparing and 2048×1536 for the final run.

**Everything is a function of time.** One number `t`, seconds since the start,
drives the camera, the car, the saucer, the lightning, the wind and the lens.
Particles and trails are stepped at a fixed 1/60 s. That is what makes
`?t=53` show exactly **13-ufo-hover**, and makes a capture repeatable.

*Original:* cannot tell WebGL from WebGPU from a video.

### 5.2 Lights

The scene is lit only by what you can see: there is no moon and almost no
ambient light. Shadows from three lights at most; the rest are cheap.

| Light | Count | Type | Shadow | Colour | Notes |
| --- | --- | --- | --- | --- | --- |
| Street lamps near the camera | 3 nearest | `SpotLight`, 75° half-angle, aimed down and a little over the road | the nearest one only | warm, `#ffc58f` | which three are real follows the camera; the rest of the row are only a glowing head, a cone in the fog (5.4) and a painted pool of light on the ground |
| Canopy tubes | 4 fixtures | `RectAreaLight` 1.2 × 0.15 m (`RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init())`) | none | cool white with a little green, `#e4efe6` | plus one wide `SpotLight` at the canopy's middle, casting the shadows under the van and the islands |
| Door lamp, caged wall lamp | 2 | `PointLight`, 6 m reach | none | warm yellow, `#ffb45a` | |
| Shop interior | 2 pendants, 2 ceiling tubes | `PointLight`, 5 m reach | none | pendants orange `#ff9a4a`, tubes white | they only need to reach the inside and a strip of forecourt |
| Car headlights | 1 (stands for the pair) | `SpotLight`, 18°, moves with the car | none | `#fff4e0` | plus two bright rectangles for bloom |
| Lightning | 1 | `DirectionalLight` from the bolt's side | none | blue-white, `#cfd8ff` | on only during a strike (5.6) |
| Saucer underside | 1 | `PointLight`, 25 m reach | none | `#dfeaff` | weak, lights the treetops |
| Beam | 1 | `SpotLight` straight down, 9° | yes | `#e8f2ff` | the cow and fence posts throw shadows |
| Sky | 1 | `HemisphereLight`, very low | none | `#2d2b33` | just enough that black is not flat |

Static lights whose casters never move keep their shadow map
(`light.shadow.autoUpdate = false` after the first frame). Swap which street
lamp casts the shadow only while it is off screen.

`scene.environment` is a small cube map taken once from the sky dome, so wet
surfaces and the van's paint have something to reflect. Dim it; scale it up
during a lightning strike.

*Check:* **01-establishing** with the bodycam effects off should already read
as the reference: three pools of warm light on the right, a cool pool under
the canopy, a warm wall on the left, black elsewhere.

### 5.3 The wet ground

This is the picture. Most of every frame is wet ground, and what sells it is
two separate things that are easy to mix up:

- **The long bright streaks under every lamp** are not mirror reflections.
  They are the lamp's own highlight on a surface that is smooth but not flat.
  A real light plus low roughness plus a gentle normal map gives them for
  free, stretched toward the camera exactly as in **01-establishing**. They
  break into patches because the roughness changes from puddle to damp
  concrete.
- **The upside-down van in 04-station** is a true mirror image. That needs the
  scene drawn a second time.

Build:

- One ground mesh per surface (forecourt slabs, road, verge, shoulder), all
  at y = 0, all using one node material that takes the surface's own albedo,
  roughness and normal.
- **Wetness** `w(x, z)` from 0 (damp) to 1 (standing water): low-frequency
  noise in metres, thresholded, plus hand-placed blobs listed in
  `set/layout.js` so the puddles that matter are where the video has them: in
  front of the van, beside island A, under the first two street lamps, and on
  the far shoulder where the cow and beam are mirrored in **14-beam**.
- Colour: `albedo × mix(0.6, 0.4, w)` (wet things are darker).
- Roughness: `mix(0.35, 0.04, w)` outdoors. Under the canopy the floor is
  still wet (**09-under-canopy**), just calmer.
- Normal: the surface's own detail fading to flat as `w` goes to 1, plus very
  faint moving ripples where rain falls. The video's puddles are nearly still;
  do not overdo ripples.
- **Mirror:** `reflector({ resolutionScale: 0.5, generateMipmaps: true })`
  (TSL, `three/tsl`), its target laid on the ground plane. Sample it with the
  normal nudging the lookup, blur it by roughness (mip level), and add
  `mirror × fresnel × w`. Draw the mirror pass cheaply: no rain, no fog
  scatter, no shadow updates.
- Slab joints every 4 m and cracks: dark lines in albedo and a groove in the
  normal; water sits in them (`w` up along a crack).

*Original:* cannot tell a planar mirror from screen-space reflections
(`tsl/display/SSRNode.js`): everything reflected in the video is also on
screen. We use the mirror because the ground is one flat plane, where it is
exact, steady and cannot lose what is off screen. Try `ssr()` afterwards as an
experiment and note the cost of each: that comparison is part of the answer.

*Check:* **01-establishing**, **04-station** (the van's image, sharp in the
puddle and gone outside it), **09-under-canopy** (tubes mirrored in the
floor), **18-return** (a line of broken highlights along the road's edge).

### 5.4 Fog and light in the fog

What the video shows: thick fog that swallows the trees by about 100 m and
the lamp row by about 200 m; a soft cone of lit fog under every lamp, wispy
close up (**05-car**, top right); the whole sky warmer toward the lamps.

Build, in two layers:

- **Distance fog** on every material: `scene.fogNode = fog(colour,
  exponentialHeightFogFactor(density, height))`, thicker near the ground.
  Colour near `#2c292d`. Lightning brightens it for the length of a strike.
- **Light scattered toward the camera**, one half-size full-screen pass that
  needs only the depth buffer and a list of lamps (position, colour, aim,
  cone angle). For each pixel and each lamp, the light gathered along the
  view ray from a point source in even fog has a closed form:

  ```
  b = dot(lamp − eye, ray)                  // where the ray passes the lamp
  h = length(lamp − eye − ray · b)          // how close it passes
  glow = strength · (atan((depth − b) / h) + atan(b / h)) / h
  ```

  Multiply by the lamp's cone (is the nearest point of the ray inside it?)
  and by slow 3D noise for the wisps. Stopping at `depth` hides the glow
  behind walls with no extra work. Twelve lamps is plenty. This one pass
  gives the cones, the halos and the warm sky, and costs no geometry.

If there is time, add shadows in the fog for the nearest lamp and the canopy
edge with a marched volume (`VolumeNodeMaterial` with a `scatteringNode`, or
`tsl/display/GodraysNode.js`). The video does not obviously have them.

*Check:* **01-establishing** (cones on the right, each fainter), **05-car**,
**10-pasture** (trees fading in rows).

### 5.5 Rain

What the video shows: thin, short, sparse streaks; easy to see against a lamp
or in the beam, nearly invisible against dark sky; none under the canopy; no
splashes worth the name; nothing on the lens.

Build: about 20,000 instanced quads in a box 40 × 20 × 40 m that follows the
camera, positions wrapping so the box is always full. In the vertex stage:

- fall at 9 m/s plus the wind, stretched along the fall by 1/60 s of travel
  (10 to 15 cm), turned to face the camera about the fall direction;
- brightness from the same lamp list as 5.4 (so a drop lights up as it
  crosses a cone or the beam), plus lightning;
- shrunk to nothing inside the canopy's footprint below its underside.

Additive, no depth write, faded where it meets geometry
(`tsl/utils/SoftParticles.js`).

*Check:* **05-car** (streaks only round the lamp), **14-beam** (the beam is
full of bright drops), **09-under-canopy** (none).

### 5.6 Sky, clouds and lightning

**Sky.** A dome, never fogged, drawn first. Storm cloud from layered noise
warped by itself, mapped so it stretches toward the horizon
(`uv = dir.xz / (dir.y + 0.15)`), two layers drifting at different speeds,
slowly: over three seconds of a held shot the clouds in the video barely
move. Dark blue-grey overhead (`#2d2b33`), going brown and warmer toward the
lamps (`#54443c`), meeting the fog colour at the horizon.

**The light in the sky** (9.5 to 15 s): a small cyan-white sprite at a fixed
direction above the roof, twinkling. It is the saucer, a long way off.

**A strike** is five things switched by one envelope `flash(t)`:

1. the bolt: a jagged line from cloud to ground made by midpoint displacement
   (six or seven halvings) with one to three short forks, drawn as a ribbon
   facing the camera, 150 to 250 m away, very bright so bloom gives the glow;
2. the clouds lit from inside, brightest round the bolt and falling off with
   angle (`flash · exp(−angle² / σ²)`, times the cloud's own density);
3. the `DirectionalLight` of 5.2, which is what turns the trees green in
   **11-lightning-pasture**;
4. the fog and the environment map brightened;
5. the bolt's own streak in the wet road, which the mirror of 5.3 gives for
   nothing because the bolt is in the scene.

Envelopes, as brightness against seconds after the strike:
strike 1 (5.70 s): 1.0 at 0, 0.5 at 0.08, 0.9 at 0.15, 0.35 at 0.3, 0.1 at
0.6, 0 at 0.9. Strike 2 (42.20 s): the same, with a second peak of 0.9 at
0.30 to 0.45, 0 at 1.0. Thunder follows by distance ÷ 343 m/s.

*Check:* `sheets/lightning-1.jpg` and `lightning-2.jpg`, frame against frame.

### 5.7 Trees, grass, stones

- **Trees.** Grown in code: a trunk that forks two or three times low down
  and spreads into a flat crown, tubes for wood, a few hundred leaf cards per
  tree clustered at the branch ends, card normals bent outward so the crown
  shades as one mass. Three or four shapes, about a hundred copies with
  `InstancedMesh`, turned and scaled. They are near-black shapes against fog
  with a little warm rim from the lamps, so spend the effort on silhouette,
  not on bark. Sway in the vertex stage; a stronger gust while the saucer is
  overhead.
- **Grass.** Instanced tufts of five to nine curved blades: sparse along
  cracks and the verge, thick along the fence and in the field, where it
  stands in water. Only the verge tufts cast shadows (you can see their
  shadows in **12-ufo-arrives**, bottom).
- **Stones.** A thousand or two squashed icosahedra along the road's edge,
  wet and shiny (**12-ufo-arrives**).
- **The field** is mostly standing water at y = 0, so it shares the mirror.

*Check:* **10-pasture**, **12-ufo-arrives**.

### 5.8 Buildings and how they are weathered

Geometry is boxes with softened edges, built in code from the sizes in
`set/layout.js`: walls, parapet, roof, the canopy slab and its fascia,
columns and brackets, islands, window frames, the shutter box, conduit, the
vent stack, the mast.

The look is in one shared "weathered" material that every painted or
concrete surface uses, with knobs per surface:

- a base that tiles (concrete, render, painted sheet, planks);
- **streaks** running down from edges and fixings: noise stretched tall;
- **dirt low down** and the green band along the foot of the shop wall;
- **peeling paint** on the columns and pumps: where noise passes a threshold
  the paint is gone, the layer under it shows darker and rougher, and the
  edge of the paint gets a small step in the normal (**09-under-canopy**);
- **rust** round seams, feet and arches on anything metal;
- everything outdoors a little wet: roughness down, colour down.

Lettering and signs are drawn to a canvas (2D text and shapes), used as a
texture on a thin board, and put through the same weathering. The words are
in one table (`set/signs.js`).

*Original:* almost certainly image textures from a library; the ceiling's
repeat is visible in **09-under-canopy**.

### 5.9 The shop, through glass

Real geometry, kept simple: a room; a counter with a till; three wall shelves
and two wire racks carrying about three hundred instanced bottles, tins and
boxes in reds, ambers and greens; two pendant lamps; ceiling tubes; the
`CLOSE` sign on the door.

Glass is a thin sheet with ordinary transparency, low roughness, opacity
about 0.15, a little smeared dirt. Its reflection comes from a cube map taken
once from just outside the shopfront, which is what puts the pale ghost of a
pump across the shelves in **08-interior**. Do not use `transmission`: it
costs a copy of the whole frame.

### 5.10 Van, car, cow, and the small things

Each is a module exporting one function that returns an `Object3D`, so a
rough stand-in can be swapped for a better model without touching anything
else (see decision 1 in section 10).

- **Van:** an extruded side profile with rounded corners, dark glass,
  bumpers, wheels with white hubs; the stripes and name from a canvas;
  weathered with rust at the sills.
- **Sedan:** boxy 1980s saloon, dark teal with clearcoat; wheels turn;
  headlights are bright rectangles with the spot light of 5.2; it follows a
  straight line at about 14 m/s (50 km/h) as a first guess: it is first seen
  far down the road at 16.5 s and is past the camera by 20.6 s.
- **Cow:** 60 to 80 pixels tall and in fog whenever it is on screen: a body,
  legs, head, ears and tail are enough, with black patches from thresholded
  noise. It flicks its tail and turns its head; in the beam it turns slowly
  and its legs hang.
- **Pumps, drums, bench, ice chest, bin, phone box, lamps, fence, sign,
  power poles:** from the sizes in section 4. A drum is a lathed profile with
  two ribs. Hoses and wires are tubes along a sagging curve.

### 5.11 The saucer

- **Hull:** a lathed profile, about 12 m across; dark metal (metalness 1,
  roughness 0.35) with panel lines from a polar grid in the normal; a dome on
  top; stepped rings underneath.
- **Lights:** about 24 short strips round the rim, white with a few amber,
  chasing; eight round lamps underneath; a broken ring of light round the
  opening in the middle. All emissive and bright enough to bloom; one real
  point light under the hull.
- **Flight:** a path in the timeline plus a hover (15 cm of bob, a couple of
  degrees of wobble). It banks into turns. Arriving, it eases out and settles.
  Leaving, it tips about 25° and its distance grows exponentially for 2.5 s.
- **Trails** (**12-ufo-arrives**, **17-ufo-leaves**): from two to four points
  on the rim, each a ribbon through the last 50 places that point has been,
  facing the camera, tapering, blue-white, additive. A fast sideways zigzag
  on the ribbon gives the electric look as it leaves. Sparks shed along them.
  Faded by speed, so there are none while it hovers.
- **Beam** (**14-beam**, **15-cow-rising**): a cone from the opening to the
  ground, 2.5 m wide at the top and 3.5 m at the bottom. Its brightness per
  pixel is how far the view ray travels inside it (solved exactly, so the
  edges are soft and nothing bands), times streaks that drift, times a fade
  toward the ground. It grows downward when it starts and draws up from the
  ground when it stops. The spot light of 5.2 lights the ground, the cow and
  the trees; rain inside it lights up by 5.5. Motes rise in it.
- **The lift:** the cow starts 0.4 s after the beam lands, eases in, climbs
  12 m in 4.2 s, turns about 40°, and shrinks and whitens into the opening.

*Check:* `sheets/arrival.jpg`, `sheets/departure.jpg`.

### 5.12 Camera

- Position on a smooth curve through the points in section 4; where it looks
  is a second track; `fov` a third (section 3, last column). All eased.
- On top, the person: a step every 0.6 s while walking (2 cm up and down,
  1.5 cm side to side, half a degree of roll), slow breathing sway when
  standing, a touch of fast jitter. All from noise of `t`, so it repeats.
- **The lens is a fisheye.** Straight poles bow at the edges of the frame
  (**13-ufo-hover**, **16-ufo-empty**) and the corners are black. So the
  number on the overlay is not the whole story. Starting guess: draw
  rectilinear with `camera.fov` set to the overlay's number (vertical), then
  warp on the way out by sampling at `r · (1 + k r²)`, `k` about 0.35 with
  `r` = 1 at the middle of the top edge, scaled so the left and right edges
  just fit. The corners then fall outside the drawn picture, which is where
  the black corners come from. Draw the scene about 1.3× larger than the
  output so the middle, which the warp magnifies, stays sharp.

  Fit `fov` and `k` together in milestone 0 against three things: the bow of
  the pole in **13-ufo-hover**, the cow's height in **10-pasture** (about 55
  pixels at 1080), and where the corners go black.

### 5.13 Lens and grade

After tone mapping, in this order:

1. **Grade.** The picture is dark and a little washed of colour: the median
   pixel is about 35 to 45 out of 255, the brightest percent about 120 to
   190, blacks at zero (section 11). Warm highlights, cool shadows.
   `AgXToneMapping` or `ACESFilmicToneMapping` to start, then a curve and
   about 15% less saturation.
2. **Fisheye** (5.12): `barrelUV` in `tsl/display/CRT.js` is a starting
   point.
3. **Colour fringing** toward the edges, slight: `chromaticAberration()` from
   `tsl/display/ChromaticAberrationNode.js`.
4. **Interference** (5.14).
5. **Sensor noise:** fine, changing every frame, stronger in the dark:
   `film()` from `tsl/display/FilmNode.js`, or four lines of our own.
6. **Vignette**, heavy, shaped like a rounded rectangle rather than a circle,
   reaching black in the corners.
7. **The last glitch** (5.14).

Bloom (before tone mapping): strength about 0.5, wide, threshold 1.0. Bright
things are given real brightness so they bloom and nothing else does: tubes
about 8, lamp heads 12, saucer lights 15, headlights 30, the bolt 60.

No depth of field and no motion blur: the video has neither.

### 5.14 Interference and the last glitch

**While the saucer is near** (46.5 to 65 s) the picture is disturbed in one
or two horizontal bands that wander up and down (**13-ufo-hover**,
**15-cow-rising**, **16-ufo-empty**). In a band:

- each row of pixels is slid sideways by a different small amount, which is
  what kinks the lamp pole and slants the tree trunks;
- red and blue are pulled apart sideways;
- dotted static is added.

How strong is one number, `emi(t)`: zero until the saucer arrives, rising as
it nears, 1 while the beam is on, zero once it is gone.

**The end** (71.2 to 71.8 s, **19-glitch**): the frame is cut into blocks of
random size that slide sideways by 5 to 15% of the width, different every
frame; colours split by about 1%; the whole picture ramps to black. The
overlay stays sharp and fades in the last fifth of a second.
`sheets/glitch.jpg` has it frame by frame.

### 5.15 The overlay

HTML over the canvas, so it is never warped or glitched (it is not, in the
video). A pixel terminal font: VT323 (Google Fonts, open licence) is close.
White at about 90%, lines about 1.6% of the picture's height apart (24 pixels
at 1536), 6% in from the sides and 5% from the top and bottom.

| Corner | Lines |
| --- | --- |
| top left | `BODYCAM  V3.2.1` / `UNIT 4417` |
| top right | red dot `REC` (steady, it does not blink) / `2026-11-24 21:45:01` / `CAM 02 / SIGNAL RIDGE` |
| bottom left | battery outline `92%` / `1536P` / `FOV 95°` / `ISO 800` |
| bottom right | `L` and `R`, ten blocks each |

Live values: the clock is 21:45:00.6 plus `t`, shown to the second; `1536P`
is the canvas's real height in pixels; `FOV` is `camera.fov` rounded; the
meters follow the left and right loudness of our own sound, with the block
after the last lit one at half brightness.

### 5.16 Sound

Read from a spectrogram, not heard (the analysis was done without speakers):
**listen to the reference before building this.**

- a steady tone near 340 Hz that swells about every 1.4 s, all the way
  through;
- sustained chords coming and going in phrases (stacks of partials from 640
  to 1,400 Hz) from about 9.7 s;
- low rumbles below 120 Hz, the heaviest after each strike;
- a broad rush from 19.5 to 22 s, peaking at 21.0: the car;
- a tone sliding upward from 56 to 58 s: the cow going up;
- everything cut off between 70.5 and 71.5 s;
- rain is quiet: the 2 to 8 kHz band is the weakest all the way through.

Build it with Web Audio, no files: rain from filtered noise, with a harder
patter under the canopy; thunder from a noise burst through a falling low-pass
with a long tail; the car from noise and a low sawtooth, panned by its
bearing, pitch falling as it passes; the saucer from two detuned tones with a
slow tremor, pitch following its speed; the beam a rising sweep; the glitch
bursts of crushed noise. A drone of our own under it. Do not copy the music.

A browser will not start sound without a click, so the piece starts from a
title card, and the clock that drives `t` when playing live is the audio
clock.

## 6. The project

A folder of its own, `abduction/`, with its own page. It shares the
repository's `three` and `vite` (no second `node_modules`) and nothing else:
it does not import from `src/`, the game does not import from it, and it is
outside what `npm test`, the type check and the game's build look at. The
game's rules about features, saves and golden files do not apply here; its
style does (comments say what a thing is and why, tunable numbers have a name
and a unit, no allocation in the frame).

To wire it up (milestone 0), add to the root `package.json`:

```json
"abduction": "vite abduction --config abduction/vite.config.js --port 5174",
"abduction:build": "vite build abduction --config abduction/vite.config.js"
```

```
abduction/
  PLAN.md  README.md
  index.html            a 4:3 stage, the overlay's markup, the title card
  vite.config.js        base './', build into abduction/dist, target es2022
  src/
    main.js             renderer, pipeline, the loop
    params.js           the only place that reads the URL
    timeline.js         the clock, and every event's time in one table
    camera/             path.js (where, looking where, fov), handheld.js
    set/                layout.js (every position and size, named), ground.js,
                        shop.js, canopy.js, interior.js, road.js, lamps.js,
                        signs.js, fence.js, field.js
    props/              van.js, sedan.js, cow.js, pump.js, drum.js, bench.js, ...
    plants/             tree.js, grass.js, stones.js
    weather/            sky.js, fog.js, rain.js, lightning.js, wind.js
    ufo/                saucer.js, flight.js, trails.js, beam.js, lift.js
    light/              rig.js (every light, and which are real just now)
    materials/          wet.js, weathered.js, glass.js, noise.js
    post/               pipeline.js (the order in 5.1), lens.js,
                        interference.js, glitch.js, grade.js
    hud/                hud.js, hud.css
    audio/              mix.js, rain.js, thunder.js, car.js, ufo.js, drone.js
  tools/
    reference.mjs       fetch the piece, cut the stills (exists)
    shoot.mjs           draw our stills at the same times, in headless Chromium
    compare.mjs         ours beside theirs, and the numbers
    capture.mjs         every frame at a fixed step, into a video
```

Each thing in the scene is `create(ctx)` returning `{ object, update(t) }`.
`update` reads `t` and nothing else it did not make itself.

URL parameters, all in `params.js`:

| Parameter | Does |
| --- | --- |
| `?t=53` | stop at that second |
| `?still=13-ufo-hover` | stop at that still's time and set `window.__ready` once drawn |
| `?ref=13-ufo-hover` | lay the reference still over the canvas, half see-through, for fitting by hand |
| `?raw` | no lens, grain, interference or overlay: for judging light and materials |
| `?scale=0.5` | draw smaller (software rendering is slow) |
| `?stats` | frame time, draw calls, triangles |
| `?free` | fly the camera yourself |

## 7. Milestones

In order. Each ends with the stills named, drawn by `tools/shoot.mjs` and set
beside the reference by `tools/compare.mjs`. After 0, the pairs 3/4/6 and
5/7/9 do not depend on each other and can be done at once by different hands.

**0. Stage and fit.** The page, the renderer, the clock, the URL parameters,
`shoot.mjs` and `compare.mjs`. Every object in section 4 as a plain grey box
of the right size. The camera track and the lens warp. The overlay with its
live numbers.
*Done when:* with the lens on, outlines of the shop, canopy, columns, lamps
and horizon sit within about 5% of the frame of the reference in **01**, **04**,
**09**, **10**, **13**, **18**; the pole in **13** bows the same; the
overlay's clock and `FOV` match all 19 stills. Correct section 4's numbers in
`layout.js` as you go.

**1. Night.** The lights of 5.2, distance fog and scattered light (5.4), the
sky without lightning, bloom, tone mapping and grade. Still grey boxes.
*Done when:* **01**, **04**, **10**: median brightness within 8 of the
reference and the sample colours of section 11 within reach; the cones under
the lamps read the same.

**2. Wet ground.** Section 5.3 entire, with road markings, verge and
shoulder.
*Done when:* **01**, **04**, **09**, **18**.
**Stop here and report.** With 1 and 2 done the establishing shot either
looks like the video or it does not, and the frame time is known. That is
most of the answer, for roughly a third of the work.

**3. The station.** Real geometry for the shop, canopy, columns, islands,
pumps; the weathered material; signs; the interior and the glass.
*Done when:* **07**, **08**, **09**, **18**.

**4. The field.** Trees, grass, stones, fence, standing water, power poles,
the cow standing.
*Done when:* **10**, **12** (ignoring the saucer).

**5. Weather.** Rain; both lightning strikes; wind.
*Done when:* **02**, **11**, and `sheets/lightning-1`, `lightning-2` frame
against frame.

**6. Things.** Van, sedan and its pass, drums, bench, ice chest, bin, phone
box.
*Done when:* **04**, **05**, **06**, and `sheets/car`.

**7. The abduction.** The light in the sky; the saucer, its lights, flight
and trails; the beam; the lift.
*Done when:* **03**, **12** to **17**, and `sheets/arrival`, `departure`.

**8. Bodycam.** Colour fringing, grain, vignette, interference tied to the
saucer, the last glitch. (The warp and the overlay are already in from 0.)
*Done when:* all 19, especially **13**, **15**, **19**, and `sheets/glitch`.

**9. Sound.** Section 5.16, in step with the picture; the meters.
*Done when:* our spectrogram has the same events at the same times as
`reference/spectrogram.png`, and it sounds right to a person.

**10. Cost, and the film.** Measure (section 8), trim what is cheap to trim,
capture the whole 72.5 s, set it beside the original, and write up what was
found in `abduction/README.md`: what matched easily, what took work, what
never matched, and the frame time on which hardware.

## 8. Telling when it matches

**By eye, the same every time.** `shoot.mjs` opens `?still=<name>` for each
row of `STILLS` in `tools/reference.mjs` at 1440×1080 and saves
`out/stills/<name>.png`. `compare.mjs` writes, for each, ours beside theirs
and a half-and-half blend, into `out/compare/`. Look at these after every
change that could move the picture.

**By number.** `compare.mjs` also prints, per still: median and 99th
percentile brightness of the middle of the frame, and the colour at each
named point in section 11's table, ours against theirs. These catch exposure
and colour drifting while attention is on something else.

**Headless.** Chromium here has WebGPU only when launched with

```
--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=swiftshader
--use-webgpu-adapter=swiftshader --ignore-gpu-blocklist
```

(checked in this repository's cloud container on 2026-11-26: without them
`requestAdapter()` gives nothing; with them a SwiftShader adapter). It is a
software renderer: expect seconds per frame, use `?scale=0.5` while working,
and never judge speed there.

**Speed, on real hardware.** This is the number the whole thing is for, and
it has to be taken by a person with a graphics card. `?stats` shows frame
time (create the renderer with `trackTimestamp: true` and read
`renderer.resolveTimestampsAsync()` for time on the card), draw calls and
triangles. Report frames a second at 1440×1080 and at 2048×1536,
at the worst moment (the beam, 55 s) and the commonest (the forecourt, 17 s),
and name the machine. The claim stands if the look is reached at 60 on a
desktop card, or 30 on a recent laptop.

Budget to hold to: under 150 draw calls (instance everything repeated), under
1.5 million triangles, three shadow maps, twelve lights at once, one mirror
pass at half size.

## 9. What could go wrong

- **The node API moves.** Pin `three` at 0.187.0 for this work and read the
  usage at the top of each file under `node_modules/three/examples/jsm/tsl/`.
  If the WebGPU path blocks for more than a day in milestone 0 or 1, fall
  back to `WebGLRenderer` with `EffectComposer` (`UnrealBloomPass`,
  `GTAOPass`, `Reflector`, `OutputPass`): the game already uses that
  renderer, every effect here has an equivalent there, and the answer to the
  question is the same.
- **The mirror inside the pipeline.** `reflector()` draws the scene again
  from below; make sure that draw skips rain, fog scatter and the overlay
  passes, and that the ground itself is not in it.
- **Light cones that look pasted on.** They need the depth stop, the wisps
  and the right fall-off. Compare against **05-car** at full size, not a
  thumbnail.
- **The fisheye wastes pixels** at the edges and softens the middle. Draw
  larger than the output (5.12) and check the middle of **13-ufo-hover** for
  sharpness.
- **Thin things shimmer:** wires, far poles, rain. 4× multisampling first; if
  that is not enough, `traa()` (`tsl/display/TRAANode.js`), watching for
  smeared rain.
- **Stand-in models that look like toys.** They are small, dark and in fog
  nearly all the time, and lettering carries most of the recognition. If the
  van in **09-under-canopy** still lets the picture down, see decision 1.
- **Sound cannot be judged without ears.** A spectrogram match is necessary
  and not enough.

## 10. Decisions with a default

None of these block starting. Each has the default the plan assumes.

1. **Models and textures: made in code, or brought in?** Default: **in
   code**, as everything else in this repository is, behind the one-function
   interface of 5.10 so a model file can replace any of them later. The
   original very likely used image textures and model files, so bringing in
   freely licensed ones (CC0) for the van, sedan and surfaces would be the
   closer test of its pipeline and the faster road to the same look. It adds
   the first binary assets to the repository. Decide after milestone 2, when
   it is clear how far code alone gets. **Decided (2026-11-26):** CC0
   photo textures and a CC0 sky panorama from Poly Haven, fetched by
   `tools/assets.mjs` and not committed; models stay in code.
2. **Renderer:** WebGPU with nodes (default), or WebGL as the game uses. See
   the first risk.
3. **The words on the signs:** the original's, for a like-for-like picture
   while this stays private (default), or our own. Change them before
   publishing the remake anywhere.
4. **Music:** our own drone (default), or effects only.
5. **Which machine counts** for the speed test in section 8.

## 11. Measurements

Taken with `ffmpeg` from the 1440×1080 and 2048×1536 files on 2026-11-26.

**Cuts.** Scene-change detection at 0.25 finds none.

**Frame pacing.** Mean absolute difference between neighbouring frames, at
320×240: never near zero while the camera moves (in every two-second window
from 12 s to 52 s, none of the 120 frames comes within a quarter of the
median difference); odd and even frames differ by the same amount (ratio
1.008), so it is not 30 frames doubled. The only near-identical neighbours
are where the camera is held still.

**Overlay `FOV`, at whole seconds:**

| s | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 16 | 31 | 32 | 33 | 45 | 47 | 48 | 49 | 50 | 51 | 52 | 53 | 54+ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ° | 95 | 98 | 103 | 108 | 110 | 97 | 95 | 99 | 110 | 110 | 110 | 111 | 113 | 114 | 113 | 110 | 107 | 105 | 105 | 109 | 113 | 114 |

**Overlay clock:** 21:45:01 at 0.5 s, 21:45:20 at 20 s, 21:46:11 at 71 s,
21:46:12 at 71.5 s.

**Brightness** (0 to 255, middle of the frame; corners of every frame are 0
to 2):

| At | Median | 99th percentile | Note |
| --- | --- | --- | --- |
| 0.5 s | 33 | 139 | forecourt |
| 12.5 s | 31 | 124 | looking up |
| 18.5 s | 41 | 188 | headlights |
| 30.5 s | 27 | 175 | shop interior |
| 36.5 s | 43 | 140 | under the canopy |
| 42.5 s | 70 | 221 | lightning 2 |
| 48.5 s | 41 | 81 | sky and field |
| 54.5 s | 50 | 181 | beam |
| 66.5 s | 46 | 86 | empty sky |

**Colours** (as they are in the video, after its grade), each the mean of a
9×9 patch at the pixel given, in a 1440×1080 frame:

| Still | What | Pixel | Colour |
| --- | --- | --- | --- |
| 01-establishing | sky overhead | 720, 150 | `#2d2b33` |
| | sky low toward the lamps | 1330, 430 | `#54443c` |
| | fog at the horizon | 900, 585 | `#444146` |
| | street-lamp head | 1278, 323 | `#8e7c6f` |
| | wall under the door lamp | 135, 585 | `#564d2b` |
| | canopy tube | 690, 440 | `#a3a29d` |
| | wet forecourt, unlit | 400, 950 | `#161412` |
| | lamp streak in a puddle | 1060, 715 | `#a7927e` |
| | canopy underside | 800, 430 | `#34322d` |
| 02-lightning-sign | cloud lit by the bolt | 600, 160 | `#818594` |
| | wet ground under the bolt | 640, 900 | `#a3a3af` |
| | sky far from the bolt | 1300, 200 | `#1e1c24` |
| 10-pasture | fog at the tree line | 700, 545 | `#2c292d` |
| | tree crown | 880, 430 | `#141009` |
| | verge dirt | 600, 760 | `#1e1916` |
| | lit fog under a lamp | 330, 360 | `#8c735f` |
| | road | 700, 640 | `#181518` |
| 15-cow-rising | beam | 720, 600 | `#6e7279` |
| | ring under the saucer | 720, 455 | `#c5c9cf` |
| | sky beside the saucer | 300, 300 | `#443939` |
| | ground under the beam | 720, 830 | `#727a71` |
| 08-interior | back wall of the shop | 520, 520 | `#27150f` |
| | pendant lamp | 805, 455 | `#a47048` |
| | counter top | 450, 700 | `#9a744a` |
| 09-under-canopy | ceiling | 520, 240 | `#25241e` |
| | van, white | 200, 600 | `#79654d` |
| | pump, white | 1040, 560 | `#545441` |
| | column foot, green | 1150, 790 | `#222f24` |
| 05-car | headlight | 965, 580 | `#dbd6d0` |

**Sound**, loudness per half second in four bands: quiet throughout (about
−35 dB), loudest at 21.0 s (the car, −27 dB) and 57.0 s (the lift, −27 dB),
silent after 71.5 s. `reference/spectrogram.png` shows the rest.
