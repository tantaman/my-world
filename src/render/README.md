# How the look works

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

## Keys

| | |
|---|---|
| **P** | pixel art on / off |
| **[ ]** | pixel size |
| **- =** | pixel softness (0 = hard pixels, 1 = smooth) |
| **O** | silhouette outlines on / off |
| **F** | fullscreen |

## Files

```
index.js              plugs it into the game: renderer, scene, camera, the look keys
pixelPipeline.js      low-res render → composite → soft-pixel upscale
uniforms.js           shader uniforms everything shares: time, wind, sky
glsl.js               shared GLSL: noise, sky gradient, ground colour
```
