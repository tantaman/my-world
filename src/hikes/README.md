# Hikes

A hike you've done can be brought into the world from a photo you took on it:

```bash
npm run hike -- ~/Pictures/IMG_1048.heic
```

The photo (HEIC or JPEG, straight off a phone) says where it was taken, which
way the camera looked and at what time. From that, `tools/hike.mjs` fetches
the real shape of the land for 4 km around
([AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)) and the
trails, lakes and streams on it, and the coast if it's by the sea
([OpenStreetMap](https://www.openstreetmap.org/)), and writes the hike to
`src/world/hikes/`. It prints what it found and where it put a picture of
it:

```
photo: 48.05540, -123.77340, looking 280°, at 16:21
Mount Storm King → src/world/hikes/mount-storm-king.js (223 kB, fetched when it's needed)
  at 2625.1, -4570.8 in the world, 26 km from the middle as the crow flies: the real land for 800 m round the photo, at 1 : 5
  the walk: Mt. Storm King Trail, 567 m, climbing 125 m
  water: Lake Crescent, Falls Creek, Smith Creek, Barnes Creek, 78 unnamed streams
```

A photo that has lost its location on the way (sent through a chat, say)
can still be used: say where it was taken with `--lat` and `--lon`, and
`--bearing` and `--hour` if you remember which way you looked and when.

In the game, open the map (**M**) and the *hikes* tab beside it for the list
of them: each with its
trail, how long it is, how far it climbs (or drops: a cove is walked down
to) and the water on it, its falls among it, and two ways in (three, for a
walk that goes on past the photo: **the end** puts you where it ends,
facing back up it). **trailhead** puts you at the
start, by a signpost, with the HUD pointing the way to the top. The trail is
the real one, switchbacks and all, cut into the hillside as a level tread.
Where the map says it has chains to hold on to, as on the last of Angels
Landing, they're there: a steel post every couple of metres on the side that
drops away, and the chain slung between them. At the end of it a cairn stands
where you took the photo. **the view** takes you
straight there: you're standing where you stood, facing the way you faced, at
the hour you were there. From the top you can see across the whole of it, the
lake below, the ridges beyond, the valley running off into the haze. The map
opens on the tab you last had, so the hikes are there again next time. On a
walk that goes on past the photo, once you've stood where it was taken the
HUD points on to the end of the trail.

A hike's trailhead and its view (and where its walk ends, if it goes on) are on [the map](../map/README.md) too, as
places with a name that you can look up and track like any other. What the
forest has of its own that way, its [old places](../landmarks/README.md),
keeps off a hike: a real place has what is really there.

| | |
|---|---|
| **M**, then *hikes* | the list of hikes, beside the map |
| **Tab**, **Enter** | in the list: move between the buttons, and go |
| **M** / **Esc** | close it |

**What gets imported.** The land is scaled 1 : 5, the same across and up, so
slopes are as steep as they really are: 2.5 km of trail and 600 m of climb
become a four-minute walk up 120 m, and the game's trees stand against the
mountain about as big as real ones do. Inside 4 km of the photo (800 m in the
game; `--radius`, `--middle`) the ground is the real ground; over the next
kilometre it gives way to the forest around it. Every footpath, track and lake that OpenStreetMap has
in there comes too, and the sea, up to its real shoreline: it breaks white
along the shore, and stops at a low bank a little short of the edge of the
land that was imported, where the forest begins. (From on the land you
don't see that: looking out, the sea runs on to the horizon.) The shoreline
is kept on a grid of its own, 3 m to the ground's 6 or more, so a cove a few
metres across is still a cove. The streams and rivers on the map run where
they really run, in channels like the forest's own: each lies just under
the ground its line was drawn over, never rises as it goes, takes on what
runs into it, and comes down to the lake or the sea it ends in. (Only the
ones that run all year: a gulch that is dry till it rains is left dry.) The
walk starts where you'd leave the car, at the nearest road or car park along
the paths, and goes by them to where the photo was taken, uphill or down.
(Failing a road, it's the trail the photo was taken on, from its lower end.)
Or it starts where you say (`--from lat,lon`), and goes on past the photo
to where you say it ends (`--to`): Havasu Falls is walked from the car park
on Hualapai Hilltop, down Hualapai Canyon to the village of Supai, past
Navajo Falls to Havasu Falls, where the photo was taken, and on past Mooney
and Beaver Falls down Havasu Creek to where it meets the Colorado, 25 km
and a kilometre down. A walk like that goes where it has to: along a
village's lanes, which the map calls roads, and across a gap of a few
metres the map leaves between two paths (the scramble down the cliff beside
Mooney Falls), each of which is a path on the ground too, the gap with
chains if it's steep. A path the map says is private, or closed to walkers,
is on the ground but the walk keeps off it.
Where the map marks a waterfall on a stream, the water falls there, as high
as the cliff really is: see [Waterfalls](../falls/README.md). A point the map
names as a fall but tags as something else (Little Navajo Falls is a spring
to it) is one too, and a fall the map doesn't have at all can be given:
`--fall "Rock Falls@36.25174,-112.69876"`.

**More photos.** A walk you took more than one photo on can have each of
them: `--photo "Beaver Falls@36.28118,-112.72965,147,14.5"` (where, which way
it looked, at what hour), as many as you like. Each is a spot of its own,
kept clear as the view is, with a cairn, a place on the map, and a button
in the list beside **the view** that puts you there, facing the way it
looked, at that hour. Havasu Falls has the falls from the pool below, Beaver
Falls from the creek under it, and the open canyon floor on the way down to
the Colorado.

**How wide its water is.** A stream or a river is as wide as it really is:
as the map says (`width`), or between the banks of the area the map draws a
river over (the Colorado, 36 to 48 m there), or as a stream or a river
usually is (3 m, 10 m) where the map says nothing; and its channel is cut as
deep as a channel that wide. Where its water drops more than a little from
one point of it to the next, its level is worked out every half metre, so it
comes down a cliff where the cliff is.
Where OpenStreetMap says what covers the land, it comes too: woods, willow
scrub and wetland, meadow, alpine tundra, scree and bare rock, glaciers. A
scree is grey with broken stone and strewn with boulders, bare rock that
isn't a cliff is a jumble of them, scrub is a thicket of shrubs over your
head, tundra is thin turf among stones, and a glacier lies white all year.
A pool too small for the ground's grid (the one at the foot of a fall, a
few tens of metres across) keeps its shore on a grid of its own, half a
metre fine, so it's there and the shape it really is.
Wherever the map says nothing, steep ground is bare rock, with not a blade
of grass on it, and the rest is wooded (`--cover`, `--species`; `--cover 0`
for land above the tree line, with nothing standing on it at all). The spot
the photo was taken from is kept clear of trees, with nothing growing in
front of it to block the view.

A long trail can be taken in whole: `--middle lat,lon` centres the land
somewhere along it instead of on the photo, and `--radius` says how far
round that to bring in. Cascade Canyon is brought in that way, from Jenny
Lake up the canyon to the Forks and on to Lake Solitude, with the photo
part way up it.

**Finer land along the walk.** Kilometres of land at one height every 30 m
(6 m in the game) is plenty for the far side of a valley, but seen close a
narrow ridge on it comes out a broad hump. `--fine 5` keeps a second, finer
grid, a height every 5 m (a metre in the game, as fine as the ground is
drawn), along the walk and `--fine-margin` (400 m) round it, and round where
the photo was taken and each fall, which gives way to the coarse one at its
edge. It's kept in tiles, only those the walk comes near, so a walk of many
kilometres costs its own strip of land and not the box round it: Havasu's
25 km is 14 km² of it. In the United States `--dem 3dep` takes the
heights from the USGS's own elevation, which is lidar for most of the country
and good to a metre or two, in place of Terrain Tiles, which are coarser and
in steep country can be tens of metres out. With both, Angels Landing is the
narrow fin it really is, with sheer drops either side, and Refrigerator
Canyon a slot. And a waterfall is a cliff: Mooney Falls drops 55 m.

**What kind of country it is.** Not everywhere is a northern forest. A hike
says what kind of country it's in (`--country "cinder desert"`), and that
decides what its ground is made of, what grows and lives there, and what the
sky over it is doing, each as one entry in one table
(`src/world/country.js`):

| country | ground | what grows | sky |
|---|---|---|---|
| *(unsaid)*, `temperate rainforest` | the forest's own | pines, oaks, birches, ferns | clear |
| `cloud forest` | lush green, red clay paths | broadleaves over ferns and tree ferns | the ridge tops in cloud, flat light under it |
| `tropical coast` | cinder cliffs, black lava at the water, beaches where the map has them | ironwoods, broadleaves, coconut palms | fair-weather cloud |
| `cinder desert` | bare cinder, red and grey | nothing but the odd silversword | clear thin air, over a sea of cloud |
| `lava coast` | wind-cropped grass and red dirt down to a black rock shelf | a few ironwoods, low bushes | overcast |
| `red rock canyon` | red sand and slickrock; sandstone cliffs in beds, streaked dark, turning white towards the rim | ponderosa pines and oaks over scrub | clear and dry, fair-weather cloud over the rims |
| `high mountains` | granite cliffs, talus of broken stone, pale grit paths; turf and stones over a treeline at 3,000 m, snow lying above it | slim spruces and firs, a few aspens, willow thickets | clear, thin air |
| `snowy mountains` | snow on all of it but the crags, its lakes frozen over and snowed on: a ski resort in winter | firs in the valleys, thinning out to none at 2,050 m; the odd bush | clear and crisp |
| `travertine canyon` | red sandstone walls in ledges, pale towards the rim; travertine where the water runs, which is a milky blue-green | cottonwoods along the water; away from it, the odd squat juniper over mesquite and catclaw; no reeds or lilies in its pools | thunderheads over the rims |
| `bayou` | black mud a metre over still brown water that mirrors everything; reeds and floating weed in it | live oaks and bald cypress hung with Spanish moss, palmettos under them | low and grey, mist on the water |
| `eastern city` | mown grass, hardly anything under the trees | oaks and maples, the odd pine; squirrels and songbirds, and no bears | fair-weather cloud |

**Where the tide sets the level.** In a delta (`--country bayou`) the water
doesn't run downhill: the bayous and the canals between them all lie at the
level of the sea, still, whichever way the map draws them running. There all
the water is one, at sea level: every area the map draws water over (a lake,
a river, a canal, a bayou), with its islands left out; every river, stream
and canal the map draws as a line, as wide as it is; and the channels whose
beds the elevation data has under the sea (it has the bayous' beds, and the
ones the map left out), where they join the rest. Its shore is kept on a grid
of its own, 2 m fine in the game, so a canal a few metres across is one, and
the land stands just clear of it. That's how Jean Lafitte came in, from the
landing of an airboat tour there: see [the swamp tour](../swamptour/README.md).

**Snow** lies where a real place's country has a snow line, at its real
height: up on high mountains, everywhere on snowy mountains. A photo taken in
winter brings it down to where it lay then, lower the further from the
equator (about 800 m in the Alps or the Cascades in January, 1,800 m at
Tahoe), and `--snow` says where for yourself (`--snow 1500`, or `--snow
none`). Steep snow is for skiing: see [Skiing](../skiing/README.md).

The cloud is a layer at its real height, so you can be under it or over it:
walk up through it and it closes round you. A rocky shore keeps its cliffs
where a gentle one would be given a beach. Animals that don't live there
(bears, on an island) don't turn up, and a tree is called what it would be
there: fell a broadleaf on Maui and it's a kamani or an ʻōhiʻa that comes
down, not an oak. A sandstone canyon's cliffs show the beds they're cut
through, by their real height, so a bed runs at the same level all round the
canyon, and turn pale towards the rim where the real rock does. The map and
the far view take the country's colours too.
Every piece of ground knows which country it's in, so where two places of
different kinds overlap, each keeps its own colours right up to the other.
A walk that starts on top of its mountain (a summit you drive to) stands the
mountain over the forest round it, where otherwise the start of the walk is
level with it. The weather that comes over you as you walk onto one, and the
sound of its sea, are [the country feature](../country/README.md)'s.

**Where it goes.** Where it really is. The game world is the real world at
the hikes' own scale, 1 : 5, so hikes lie as far apart, and in the same
directions, as they do in fact. The middle of the world, where everyone
starts, is the Hoh rain forest, on the wet west side of the Olympic
Mountains. Mount Storm King, 26 km north-north-east of the Hoh, is 5 km
north-north-east of where you start; Angels Landing, 1,480 km away in fact,
is 296 km to the south-east; and the hikes on Maui, 4,200 km away, are
835 km off to the south-west. A hike is kept a couple of kilometres clear of
where everyone starts (`tools/hike/place.js`). The land between the hikes is
the real Earth, all of it, the Hoh too (see
[the real Earth](../world/README.md#the-real-earth)): the Pacific lies
between here and Maui, and Maui is an island in it; the bayou is in the
swamps of the Mississippi delta, with the bays and lakes where they really
are; Zion stands in red rock country on the plateau. A hike stands at its
real height, on the same land as the Earth's round it, finer: round each
hike the Earth is a height every 460 m for 35 km about it, from the same
elevation, so the valleys you see off the top are the real valleys.
Its country reaches a couple of kilometres past its edge before the
Earth's own takes over, and a sea it has runs on into the Earth's. The list
beside the map is the quick way across.

A real place can go down a long way below the forest round it (a canyon
cut into a plateau, its trailhead on the rim): the haze is as clear down in
it as on the forest floor, and the forest's own streams, which run on over
it unseen at the forest's level, leave no trace in it.

Hikes close enough to overlap are the same land, and join: the second is
placed from the first by the real distance between their photos, and stands
on the first one's heights, so the same mountain is the same height in both
and adding it moves nothing that was there. Two that each already stand on
heights of their own get a step where a third joins them (the importer says
so).

The whole Earth fits: its far side is 4,000 km of game from the middle, and
the game is as sharp there as where you start (the picture is always drawn
from a spot near you: `src/render/origin.js`). What a flat world can't keep
is a round one's shape. Distances from the middle are true everywhere, but
the further out, the wider than life the map is across that line: a tenth at
5,000 km, half as much again at 10,000. A hike's own land is true wherever
it is; it's the gaps between hikes far out that are wide, and the importer
says by how much. `--at x,z` puts one somewhere else.

A real place can be brought in at a scale of its own: `--scale 1` is life
size, as [the National Zoo](../zoo/README.md) is, so that what stands on it
is as big as it is and as far apart. It still goes where it really is, at
the world's 1 : 5; only its own land is the bigger for it, and a real height
stands that far over the sea at its own scale. One that meets another is
placed from it, exactly, at that one's scale, as any two that meet are:
[Washington](../washington/README.md), 23 km across, is placed from the zoo
in the middle of it, so the zoo's buildings and the city's line up, and
where one place is inside another (the zoo, in Washington) the inner one is
laid over the outer. Like everything
else a seed grows, a hike is part of the world description: a world built in
near one keeps it there, so once placed it stays put. Importing it again
(`--force`) leaves it where it is, and `npm test` checks that hikes leave the
rest of the world alone.

It makes no odds which [land](../world/README.md#lands) a world is grown on.
A hike is set into whichever it is, standing at the level of that land's
forest round it, and what the land has of its own high up (a treeline, snow
on the tops) stops at the hike's edge: a real mountain is wooded as it really
is.

**Where it's kept.** In the code, not on the save server. The save server
only ever holds what people *change* in a world, and a hike is part of what
every world grows, like its hills, so it ships with the game itself: every
world, saved or not, on every seed, has every hike, in the same place.
`npm run dev` shows a new one straight away; for anyone else to walk it,
commit it and deploy (`npm run deploy`).

The import writes two things. A *card* in `src/world/hikes.js`, a few
hundred bytes saying what the hike is and where, which the game loads at the
start, so the list and the map know every hike. And the hike's *land* (the
heights, lakes and trails, about 200 kB) in `src/world/hikes/<id>.js`, which
the build keeps in a file of its own and the game only fetches the first
time something near it is grown: when you walk within a kilometre or so, go
there from the list, or open the map over it (`src/world/landforms.js`). So
more hikes cost the start of the game almost nothing. Nothing within reach
of a hike, its own land and the 340 m past it where the forest's water gives
way, is grown until its land has come; the chunks, the map and the far view
each wait for it.

| option | default | |
|---|---|---|
| `--name "…"` | the nearest named peak, or the trail | what to call it |
| `--scale` | `0.2` | game metres per real metre |
| `--radius`, `--fade` | `4000`, `1000` | real metres of real land, and of blending into the forest |
| `--cell` | `30` | real metres between heights |
| `--fine`, `--fine-margin` | none, `400` | real metres between heights along the walk, and how far round it |
| `--dem` | `terrain` | where the heights come from: `terrain` (AWS Terrain Tiles) or `3dep` (USGS, US only) |
| `--cover`, `--species` | `0.85`, `0.6` | how wooded (0–1), and broadleaf (−1) to conifers (1), where the map doesn't say |
| `--middle lat,lon` | the photo | where to centre the land: somewhere along a long trail, to take in the whole of it |
| `--from lat,lon` | the nearest road | where the walk starts: the point of a path nearest there |
| `--to lat,lon` | the photo | where the walk ends, if it goes on past the photo |
| `--fall "Name@lat,lon"` | the map's | a waterfall the map doesn't have (as many as you like) |
| `--photo "Name@lat,lon,bearing,hour"` | none | another photo taken on the walk, a spot of its own (as many as you like) |
| `--country "…"` | forest | what kind of country it is (above) |
| `--snow` | in winter, where it lay then; else the country's | the real height snow lies from, or `none` |
| `--map dc` | `osm` | the water and the woods from the District of Columbia's own survey, for a place in Washington too big to ask OpenStreetMap for; no trails (`tools/hike/dcgis.js`) |
| `--graded` | not | a city's ground, graded: none of the forest's small bumps laid over it |
| `--lat --lon --bearing --hour` | from the photo | for a photo that doesn't say |

Downloads are kept in `node_modules/.cache/hike`. To take a hike out, delete
its entry in `src/world/hikes.js` and its file. From the console:
`world.hikes.list()` and `await world.hikes.go('mount-storm-king', 'view')`.

Elevation: AWS Terrain Tiles (USGS 3DEP and others), and with `--dem 3dep`
the USGS 3D Elevation Program from The National Map. Trails and lakes: ©
OpenStreetMap contributors, under the
[ODbL](https://www.openstreetmap.org/copyright).

## Files

```
index.js              plugs it into the game: the hikes tab, the way to the view, signpost, cairn and chains
waymarks.js           the cairn, the signpost and the chains
hikesPanel.js         the list of hikes (a tab beside the map), and the way to each
hikes.css             its styles
```

The hikes themselves, and how the world grows them, are in
[`src/world/`](../world/README.md#real-places); the importer is
`tools/hike.mjs` and `tools/hike/`.
