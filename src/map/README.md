# The map

Press **M** (or tap *map*) for a top-down map of the forest. It's drawn from
the same world description as the 3D view (`src/map/`), so it always matches
what's there: meadows and woods, footpaths, rock, water, alpine ground and
snow, and hillshaded relief with contour lines. Zoomed out it keeps the rivers, lakes and ponds and
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

**Old places** — the cabins, wells, docks and so on that the forest has (see
[Old places](../landmarks/README.md)) — are on the map as little square badges with
their names under them, paler once you've been. Close up, the map draws what
stands there: a roof, a tent, a deck. Click one to see what it is and how far
it is, and press *track* to have the HUD lead you there, just as for a mark.
The nearest are listed beside the map under *nearby*, and clicking one there
flies to it.

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

## Files

```
index.js              plugs it into the game
mapRender.js          pure top-down tile renderer (runs in a worker)
mapWorker.js          Web Worker wrapper around mapRender
tiles.js              tile cache + worker scheduling
mapView.js            the map overlay: pan/zoom, pins, mark editor, list
marks.js              the marks, their icons and colours
places.js             places other features put on the map (an old cabin), to look up and track
markers.js            your marks as pennants in the world
map.css               map styles
```
