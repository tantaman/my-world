# How the look works

Everything is generated in code. There are no textures or model files.

The picture aims to look like a photograph of a real place: light in real
units of brightness, things the colour they really are, and a camera's (or an
eye's) way of turning that into a picture. Pixel art is a setting.

1. **HDR render.** The scene is drawn into a high-dynamic-range target with a
   depth buffer, real-time sun shadows (a little soft at the edge, as the
   sun's own width makes them) and sky/ground ambient light. It's drawn as
   finely as the screen, up to 1080 lines (`?sharp=`); past that it's drawn
   at 1080 and blown up smoothly. With pixel art on, it's about 300 "art
   pixels" tall.
2. **Ambient occlusion**, at half that resolution, from the depth buffer
   alone: how much of the sky each spot is shut off from by what's right
   next to it. It sets trunks, rocks and the hiker into the ground.
3. **Composite pass, still in HDR** (`src/render/pipeline.js`):
   - darkens nooks by the occlusion
   - with pixel art on, darkens pixels on depth discontinuities, giving soft
     pixel-art outlines around silhouettes
   - adds height fog that takes its colour from the sky behind it, so far
     hills melt into the horizon and valleys hold more mist; or, with the
     camera under water, the water's own: reds going first with depth,
     green in a lake and blue in the sea, and light coming down in slanting
     shafts (see [Under the water](../underwater/README.md))
   - adds a layer of cloud, where the country has one
4. **Bloom.** The brightest light spills a little into what's round it, as in
   an eye or a lens: the sun through the branches, a fire at night.
5. **The eye adjusts.** The picture's average brightness draws the exposure
   after it over a second or so, part of the way: walk into a wood and it
   opens up by up to two thirds of a stop, though the wood stays darker than
   the meadow. By day in the open only; nights and caves are as dark as the
   sky makes them.
6. **Final pass**: filmic (ACES) tone mapping and a light grade (cool shadows,
   warm highlights), then onto 8 bits with a whisper of noise so skies don't
   band; or, with pixel art, an ordered Bayer dither onto a reduced palette,
   which reads as pixel texture.
7. **Up to the screen.** With pixel art, each art pixel is snapped and then
   blended across a narrow band at its edges. The band's width is the
   *softness* setting, and it's what lets the pixels melt together.

The materials do the rest. Their colours are what real things reflect:
needles and dark bark a few per cent, leaves up to a fifth in the green,
birch bark over half. Darker than that and shade goes black, which is what
makes a scene look drawn rather than seen. The ground colour is computed per
pixel from world position: meadow grass with dry patches, leaf litter and
moss under trees, packed-earth paths with worn edges, and rock on steep
slopes; and close up it has lumps and tussocks, and crags on rock, that a
low sun picks out. The grass blades use the same function, so they grow out
of the ground they stand on. Trees and bushes have baked vertex-colour
shading and spherical "canopy" normals so their foliage shades like a soft
volume, and leaves let the sun through: from their shaded side, and most of
all looking towards the sun, they glow. They also sway in the wind, and
grass parts around your feet. Motes, sparks, drops and bubbles are sized in
metres (`pointPx` in `glsl.js`), so they're specks however finely the
picture is drawn.

**Nothing big goes to the graphics card.** The game thinks in world
coordinates, in JavaScript's 64-bit numbers, everywhere, and the world is
thousands of kilometres across (the hikes lie where they really are). The
card works in 32-bit floats, which a thousand kilometres out can't tell 6 cm
apart: far from the middle that smeared the ground's texture, crumpled trunks
and striped the shadows. So each frame is drawn from an origin near the
camera (`origin.js`): the scene is slid there while it is drawn and slid back
after, and the game never knows. What the slide can't do for you is three
habits. Geometry is built round its own mesh and the *mesh* is put in the
world, never a mesh at zero holding world positions. A uniform that is a
place is registered with `game.origin.place`. And a shader that draws a
pattern from position asks `worldXZ()` and uses the noise that repeats on the
world's 4 km period (`glsl.js`), so nothing shifts when the origin does. The
play-through walks to the far side of the Earth to check
(`test/smoke/97-far-out.mjs`).

## Settings

On the settings panel (**O**, or *settings* in the corner), under *picture*:

| | |
|---|---|
| pixel art | on / off (off unless `?pixel`; remembered) |
| pixel size | screen pixels per art pixel: fitted to the screen, or 1 to 12 |
| pixel softness | 0 = hard pixels, 1 = smooth |
| outlines | silhouette outlines on / off |
| fullscreen | where the browser has it |

## Files

```
index.js              plugs it into the game: renderer, scene, camera, the picture's settings
origin.js             where each frame is drawn from, so far-off places stay sharp
pipeline.js           render → occlusion → composite → bloom → the eye → tone map → screen
uniforms.js           shader uniforms everything shares: time, wind, sky
glsl.js               shared GLSL: noise, patterns over the world, sky, ground colour
```
