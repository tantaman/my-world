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
| on a pad | **select** opens it, and **B** or **select** closes it; the stick pans, **LB RB** zoom, and the d-pad goes from button to button (the tabs and lists beside it too) for **A** to press |

**Where to go** is beside the map, a tab for each list of it: *places* (your
marks and the places nearest you, below), and the lists other features add,
such as the [hikes](../hikes/README.md) and the [railway's stations](../railway/README.md).
Going to one from its list closes the map. The map opens on the tab you last
had (on a phone, the lists are behind the *lists* button).

**Routes** lists everywhere you could go, nearest first, with how far each
is and which way. The chips over it pick one kind of place: *launch sites*,
*video stores*, *ski*, *towns*, *old places*, *caves*, *stations*,
*abandoned buildings*, *hikes*, or *everywhere* at once. There's no end to
it: scroll to the bottom (or move down it with the pad) and it looks further
out and lists more, as far as you care to go. What you're tracking stays at
the top. Pick a destination to see its pin and directions from your position.
You can also choose *directions* on any place or mark.
Walking legs give straight-line distances and compass bearings. When a flight
saves a long walk, the route shows the departure and arrival airfields. Walk
to the first, choose the second in *flights*, then follow the last bearing.
*Follow route* puts the next leg on the HUD. The destination stays tracked
when you reopen the world. Use *stop guidance* in its route to clear it.

**Go here** takes you to the mark or the old place you've picked, rather than
leaving you the walk: press it on its card and you're standing there, looking
the way you were (or, at a place with a way in, such as the doors of the
[video store](../videostore/README.md), facing it). Not while something is
carrying you or moving you (a mount, a boat, a train) — get off first, or it
would be left behind under you.

**Options** are under the lists: whatever other features ask of the world as a
whole rather than of one spot on it, such as *acquire all mounts* (see
[Mounts](../mounts/README.md)). One greys out when there's nothing left in it
to do.

**Old places** — the cabins, wells, docks and so on that the forest has (see
[Old places](../landmarks/README.md)) — are on the map as little square badges with
their names under them, paler once you've been. Close up, the map draws what
stands there: a roof, a tent, a deck. Click one to see what it is and how far
it is, and press *track* to have the HUD lead you there, just as for a mark.
The nearest are listed beside the map under *nearby*, and clicking one there
flies to it.

**Marks** tag places of interest. Each has a name, one of eight pixel icons,
a colour and an optional note. They're listed beside the map by distance
(behind the *lists* button on a phone), and clicking one there flies to it.
Press *track* on a mark and the HUD shows its name, how far it is and an arrow
toward it from where the camera's looking. On the map a dotted line runs from
you to it. Out in the world, every mark stands as a little stake with a cloth
pennant in its colour, so you can spot it as you walk up.

Esc on a brand-new mark you haven't named throws it away. Marks are kept in
`localStorage` per seed, and from the console `world.marks.list()` returns
them (handy for copying out).

## Files

```
index.js              plugs it into the game, and goes where you pick (travel)
mapRender.js          pure top-down tile renderer (runs in a worker)
mapWorker.js          Web Worker wrapper around mapRender
tiles.js              tile cache + worker scheduling
mapView.js            the map overlay: pan/zoom, pins, mark editor, the lists beside it (map.addTab) and the options under them (map.addAction)
routePanel.js         the destinations, by kind and nearest first without end; directions and HUD guidance
routes.js             walking and flight legs and their lines on the map
marks.js              the marks, their icons and colours
places.js             places other features put on the map (an old cabin), to look up, track and list in Routes
markers.js            your marks as pennants in the world
map.css               map styles
```
