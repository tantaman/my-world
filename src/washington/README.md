# Washington, DC

The city round the zoo: the whole of the District, life size, where it
really is, every building in it with the roof it really has, every street
and sidewalk the shape it is, its bridges, and the trees the city planted
along its streets.

**Getting there.** It's 770 km east of where you start, round
[the National Zoo](../zoo/README.md), on the real Earth as the rest of the
world is. Open the map (**M**): its landmarks are under *Washington* in its
routes (the Capitol, the White House, the Washington Monument, the
memorials, the Smithsonian's museums, the National Cathedral, Union
Station, Dupont Circle, Georgetown and fifty-odd more), and *go here* sets
you down in front of the one you picked, back far enough to see the whole of
it and facing it. It's also in the *hikes* list beside the map, as
**Washington, DC**, where the photo was taken from the steps of the Lincoln
Memorial, looking down the Mall. Or walk out of the zoo's gate onto
Connecticut Avenue: the city goes on from there, out to the District's line.
In your pack, *Washington, DC: where it is* says how far the Capitol is.

**Life size**, as the whole world is, so a block is as long as it is and
the Capitol is 5 km from the zoo, as it really is. Its ground is a
real place of its own (`washington-dc` in
[world/hikes.js](../world/hikes.js)), the USGS's lidar a height every 20 m,
placed from the zoo's so the two line up exactly, and standing at the zoo's
heights; inside the zoo's fence the zoo's own, finer ground is laid over it.
The Potomac, the Anacostia, the Washington Channel and the Tidal Basin are
one water at the tide's level, as they are; McMillan Reservoir, the
Reflecting Pool and the ponds lie at their own; Rock Creek and the other
creeks run down their valleys. The ground is graded, as a city's is: none
of the forest's small bumps on its streets. Where the city's tree survey has
a block mostly under trees (Rock Creek Park, Glover-Archbold, the leafiest
streets) it's woods; everywhere else it's lawns and yards, and the trees are
the street trees. Its country is an *eastern city*'s: oaks and maples over
mown grass, squirrels, songbirds and crows, deer and foxes in its parks, and
no bear on its avenues. Past the District's line the land is still life
size, out to a circle 11.6 km round its middle (Arlington, the edges of
Silver Spring and Alexandria), with no city on it; past that it gives way
to the coarse Earth's.

**The buildings**, all 112,000 of them, are as big as they are and stand
where they stand: Washington flew the whole city with lidar and traced
every roof in it, each slope with its real height at every corner, and each
building is that roof with its walls dropped to the ground (and the step
where a higher roof meets a lower one). The 11,000 the roof survey hasn't
(built since it flew, such as the National Museum of African American
History and Culture) are the city's later blocks of them, flat-topped.
Taller buildings have brick, stone or glass fronts. Window bays fit between
the corners and have sills, frames and recessed glazing. At night a light
is on in some of them. Landmarks use the colors of their materials, such as
the Smithsonian Castle's red sandstone and the Library of Congress dome's
green copper. The Capitol has a modeled white dome, colonnade and East Front
portico. The buildings' walls stop you. [Capitol Dome](https://www.aoc.gov/explore-capitol-campus/buildings-grounds/capitol-building/capitol-dome)

Street-facing homes have painted doors, stoops and projecting bays. The
storefronts on selected commercial streets have display windows, transoms
and awnings. Civic buildings use heavier entrances, cornices and pilasters.
The details are inferred from the surveyed footprint and street frontage.
[Historic commercial building guidelines](https://planning.dc.gov/publication/design-guidelines-historic-commercial-buildings)

The National Cathedral has a modeled limestone exterior with three towers,
pointed stained-glass windows, flying buttresses and a west rose window.
Its map destination faces the west front.
[National Cathedral architecture](https://cathedral.org/discover/art-architecture/gothic-architecture-101/)

**The streets** follow the city's aerial survey. Roads, intersections, alleys,
drives and car parks have asphalt with subtle wear. Regular straight blocks
have inferred center markings. Sidewalks and traffic islands sit on curbs,
with some sidewalks laid in brick. Where the survey left a sliver of ground
between one piece of paving and the next, or between a sidewalk and a wall,
the paving is carried over it, so no line of lawn runs down an avenue; a
tree box, or a strip of lawn wider than a metre and a half, is left as it is. Its 330 bridges carry the
road over on a deck from one bank to the other, with a parapet along each
side and piers under it where there's room, and you walk over on the deck,
not down in the creek (Calvert Street and Connecticut Avenue over Rock
Creek, 30 m and more over it). The paving says what it's made of: the
streets, alleys, drives and car parks are tarmac and the sidewalks, islands,
steps and bridges stone, so your footsteps sound like a city's and you can
skate the length of an avenue (see
[Skateboarding](../skateboarding/README.md)). The **street trees** are the
199,000 the city planted, each in its tree box, as tall as the city's lidar
measured its crown (one the survey has standing just out in the street is set
back to the curb's side of it).

Roads around the National Zoo follow the fine terrain grid. Grass clearance
extends past the surveyed pavement edges so blades stay on the verge.

The city streams in 500 m tiles. At default quality, the detailed tiles
extend 500 m from you and simpler streets, buildings and trees carry the
view out to about 1.7 km. Use `?q=low` for a shorter view. The forest's own
trees and grass keep off the buildings and paving. Close up, the map draws
the streets and roofs.

The landmarks you've been to are counted (they're yours, saved), and each
says so on the map.

| | |
|---|---|
| **M**, then *Washington* | its landmarks: pick one and *go here* |
| **Tab** | your pack: *Washington, DC: where it is* |

From the console: `world.washington.landmarks()`,
`await world.washington.go('lincoln-memorial')` (the Capitol, if none is
said), `world.washington.tiles()`, `world.washington.at(x, z)` (what's
there: a building, paving, or nothing).

## Bringing it in

Two importers, run once and committed: the ground, as a real place
([Hikes](../hikes/README.md)) life size, from the city's own survey of its
water and its trees; and the city on it.

```bash
npm run hike -- /dev/null --name "Washington, DC" --id washington-dc \
  --lat 38.88930 --lon -77.04990 --bearing 90 --hour 17.5 --middle 38.8936,-77.0145 \
  --scale 1 --radius 11600 --fade 600 --cell 20 --dem 3dep --map dc --graded \
  --country "eastern city" --cover 0.45 --species -0.75 --snow none
npm run dc
```

The first is placed from the zoo (they overlap), and shares its heights.
`npm run dc` (`tools/dc.mjs`) fetches the city's roofs, its blocks, its
roads, sidewalks and bridges, and its street trees (about 300 MB, kept in
`node_modules/.cache/dc`), and writes a file for each tile, `tiles/<i>_<j>.js`
(18 MB in all, each fetched as you come near it), and `city.js`, which tiles
there are and the landmarks (what the map knows of the city from anywhere).
What's inside the zoo's fence it leaves to the zoo. Run it again to bring
them up to date; nothing moves. The landmarks are said in
`tools/dc/landmarks.js`, where to add one.

All of it is the District's own: Open Data DC (DC GIS), CC BY 4.0:
"Buildings (Detailed Roof)", "Buildings - 3D", Planimetrics 2023 (roads,
sidewalks, bridges, water), "UFA Street Trees" and "Urban Tree Canopy by
Census Block". Elevation: the USGS's 3D Elevation Program.

## Files

```
index.ts        plugs it into the game: which tiles stand up round you, the forest kept off them, what stops you, the map, the landmarks, which you've been to
city.js         (written by tools/dc.mjs) which tiles there are; the landmarks, and where each is arrived at
codec.js        a tile as it's kept, and read back: its buildings, paving, bridges, street trees
pictures.js     the city in your pack
onMap.js        the city on the map, close up: its streets and its roofs
look.js         (fetched) a CityTile: a tile stood up a little at a time, and what's on each square metre of it
buildings.js    the buildings: their surveyed roofs, their walls, their fronts
capitol.js      the Capitol's dome and East Front portico
cathedral.js    the National Cathedral's exterior
facades.js      street-facing doors, stoops, shopfronts and civic detail
architecture.js boxes and faces for building details, in local coordinates
paving.js       the roads, sidewalks and curbs, laid on the ground, and over the slivers between them; the bridges' decks, parapets and piers
trees.js        the street trees, on the forest's own models, and set back off the street
batch.js        geometry written straight into arrays, for the building material
tiles/          (written by tools/dc.mjs; each fetched) the tiles
```

The importer is `tools/dc.mjs` and `tools/dc/` (`encode.js`, the tiles'
bytes; `landmarks.js`); the ground's water and woods are
`tools/hike/dcgis.js`.
