# How the look works

Everything is generated in code. There are no textures or model files.

The picture aims to look like a photograph of a real place: light in real
units of brightness, things the colour they really are, and a camera's (or an
eye's) way of turning that into a picture. Pixel art is a setting.

1. **HDR render.** The scene is drawn into a high-dynamic-range target with a
   depth buffer, real-time sun shadows (a little soft at the edge, as the
   sun's own width makes them) and sky/ground ambient light. It's drawn as
   finely as the screen, up to 1080 lines (`?sharp=`); past that it's drawn
   at 1080 and blown up smoothly. It's multisampled (`?msaa=`, 4 unless
   `q=low`), so edges are smooth, and a leaf cut from its card covers as much
   of a pixel as it really does. With pixel art on, it's about 300 "art
   pixels" tall, and hard-edged.

   It's drawn in two goes. First everything but the water; then a copy is
   kept of that, its colour and how far off each pixel is, and the water is
   drawn over it (the `OVER` layer, `pipeline.js`). So the water can be what
   real water is, a window and a mirror at once: you see the bed through it,
   bent by the ripples and dimmed by the length of water the light comes up
   through, reds first; and it mirrors what stands over it, the banks, the
   trees across the lake, a cabin on the shore, you, by following the
   mirrored ray across the copy until it passes behind something
   (screen-space reflection, `?mirror=` steps). Where that ray leaves the
   picture it sees the sky. Splashes, motes and sparks are on `OVER` too, so
   they're drawn in front of the water rather than seen through it; and the
   lights that fall on the water are on every layer.
2. **Ambient occlusion**, at half that resolution, from the depth buffer
   alone: how much of the sky each spot is shut off from by what's right
   next to it. It sets trunks, rocks and the hiker into the ground.
3. **Composite pass, still in HDR** (`src/render/pipeline.js`):
   - darkens nooks by the occlusion
   - with pixel art on, darkens pixels on depth discontinuities, giving soft
     pixel-art outlines around silhouettes
   - adds height fog that takes its colour from the sky behind it, so far
     hills melt into the horizon and valleys hold more mist (measured up
     from the forest floor, or from the bottom of a real place that goes
     down below it, a canyon cut into a plateau, so the air down there is
     as clear as on the forest floor); or, with the
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

**Light from things.** A fire, a pool of lava, a lantern gives light of its
own (`lights.js`): a feature says where light comes from and how bright,
and each frame the few that matter most from where you're looking are made
real lights, the nearest casting shadows of whatever stands in its light, as
everything does by a fire. Where the air is thick the light hangs in it,
a glow round each fire in the haze (the composite pass). It is a pool of the
same few lights, given to whichever deserve them, because a shader is
compiled for a number of lights, and changing the number would compile
everything again.

**Fire and heat.** A flame is a volume of burning gas, not a picture on a
card (`flame.js`): each ray through it adds up the light of the gas it
passes, a tongue torn up by turbulence that rises and quickens, hottest low
in the middle and cooling to dull red at its tips, its colour and brightness
from how hot each part is. It is drawn over a copy of the rest (`OVER`), so
it fades into the ground it stands on rather than being cut off by it. Over
it the air shimmers (`haze.js`): hot things draw, on the `HEAT` layer, how
far they bend the light behind them, and the composite draws the whole
picture through that.

**Skin.** What is alive is drawn as skin is (`skin.js`): its small shape is
drawn pixel by pixel (relief, `glsl.js`: a height that tips the normal, no
texture and no tangents) — a net of creases, wrinkles, veins standing out,
pores; horn has rings, iron is pitted and rusts, a wing is veined — and it
is lit as skin is lit, from inside as much as off its face: light that goes
in comes out a little way round, so the edge of the shadow on it is soft and
red, and light comes through the thin parts, an ear, a wing, red with the
blood it went through. It is wet, a clear layer that shines, most of all in
its creases, which the light round it doesn't get into.

**Bodies, melted.** A body made of balls, bones and skins over a spine can be
run together into one surface (`implicit.js`), each piece filleted into
what it touches the way clay is when it's worked, and meshed as finely as it
needs: a muscle swells smoothly out of the next, with no seams. As it's
meshed, each vertex is told how open it is to the light round it (a crease)
and how thick the body is there (for the light that comes through). Melting
takes a moment, so it can be done a few milliseconds a frame.

**Liquids.** The forest's water is its own (`world/waterSurface.js`); any
other liquid is drawn by `liquid.js` from what it does to light: which
colours it takes and how fast, how cloudy, how thick (its ripples longer and
slower), how much it boils, its own glow, a crust of black plates with fire
in the cracks. It mirrors what stands over it the way the water does
(`glsl.js`: the mirror is shared).

The materials do the rest. Their colours are what real things reflect:
needles and dark bark a few per cent, leaves up to a fifth in the green,
birch bark over half. Darker than that and shade goes black, which is what
makes a scene look drawn rather than seen. The ground colour is computed per
pixel from world position: meadow grass with dry patches, leaf litter and
moss under trees, packed-earth paths with worn edges, and rock on steep
slopes; and close up it has lumps and tussocks, and crags on rock, that a
low sun picks out. The grass blades use the same function, so they grow out
of the ground they stand on. Trees are built as they grow: a trunk with
furrowed bark, whorls of branches on a conifer and limbs on a broadleaf, and
on the branches flat cards from which the shader cuts sprays of needles,
clusters of leaves or a fern's leaflets, with no texture anywhere
(`world/foliage.js`). As the parts get smaller than a pixel or two they give
way to the ragged, mottled mass they make together, so a distant crown
doesn't shimmer; and the shadows have the same gaps in them, so sunlight
comes through a crown in flecks. Foliage has spherical "canopy" normals so a
crown shades like a soft volume, and leaves let the sun through: from their
shaded side, and most of all looking towards the sun, they glow. They also
sway in the wind, and grass parts around your feet. Motes, sparks, drops and bubbles are sized in
metres (`pointPx` in `glsl.js`), so they're specks however finely the
picture is drawn.

What people build is drawn the same way, from what it's made of rather than
from a texture (`build/surfaces.js`): every piece of a cabin, an old place or
a town says whether it is bark, a cut end, sawn wood, paint, stone,
shingles, slate, tin, glass, iron, clay or cloth, and which way its grain
runs. So a log has plates and furrows of bark along it and rings at its cut
end, boards have their grain and the odd knot, paint is a little glossy and
chalks and flakes as it wears, shingles and slates lie in staggered courses,
tin is corrugated and rusts down from its laps, stone is granular and
lichened, and glass mirrors the sky over the dark of the room. Old roofs
grow moss, and rain streaks the walls. Each pattern fades out as it gets
finer than a pixel or two.

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
pipeline.js           render (all but the water; a copy; the water over it; the heat) → occlusion → composite → bloom → the eye → tone map → screen
uniforms.js           shader uniforms everything shares: time, wind, sky
glsl.js               shared GLSL: noise (and in three dimensions), patterns over the world, sky, ground colour, relief, a mirror
lights.js             light given off by things: a pool of real lights for those that matter most, and their shadows
flame.js              a flame, as a volume of burning gas
haze.js               the shimmer of the air over something hot
skin.js               skin: hides, horn, iron, a wing, a crust over fire; lit as skin is
implicit.js           bodies melted together out of balls, bones and skins, and meshed
liquid.js             the surface of a liquid by what it does to light: blood, pitch, a marsh, lava
sculpt.js             shapes made of simple ones (boxes, drums, balls, limbs), or melted out of them
shades.js             the shades of the dead, walking in files without end, and the fires; how a shade holds itself
landTiles.js          a land made in code (Hell's, Purgatory's), drawn as tiles round you, fine near and coarse far
```
