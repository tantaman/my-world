# How the look works

Everything is generated in code. There are no textures or model files.

1. **Low-resolution HDR render.** The scene is drawn into a target about 300
   "art pixels" tall, with real-time sun shadows, sky/ground ambient light and
   a depth buffer.
2. **Composite pass, still at low resolution** (`src/render/pixelPipeline.js`):
   - darkens pixels on depth discontinuities, giving soft pixel-art outlines
     around silhouettes
   - adds height fog that takes its colour from the sky behind it, so far
     hills melt into the horizon and valleys hold more mist; or, with the
     camera under water, the water's own: reds going first with depth,
     green in a lake and blue in the sea, and light coming down in slanting
     shafts (see [Under the water](../underwater/README.md))
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
| pixel art | on / off |
| pixel size | screen pixels per art pixel: fitted to the screen, or 1 to 12 |
| pixel softness | 0 = hard pixels, 1 = smooth |
| outlines | silhouette outlines on / off |
| fullscreen | where the browser has it |

## Files

```
index.js              plugs it into the game: renderer, scene, camera, the picture's settings
origin.js             where each frame is drawn from, so far-off places stay sharp
pixelPipeline.js      low-res render → composite → soft-pixel upscale
uniforms.js           shader uniforms everything shares: time, wind, sky
glsl.js               shared GLSL: noise, patterns over the world, sky, ground colour
```
