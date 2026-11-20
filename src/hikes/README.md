# Hikes

A hike you've done can be brought into the world from a photo you took on it:

```bash
npm run hike -- ~/Pictures/IMG_1048.heic
```

The photo (HEIC or JPEG, straight off a phone) says where it was taken, which
way the camera looked and at what time. From that, `tools/hike.mjs` fetches
the real shape of the land for 4 km around
([AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)) and the
trails and lakes on it ([OpenStreetMap](https://www.openstreetmap.org/)),
and writes the hike to `src/world/hikes/`. It prints what it found and where
it put a picture of it:

```
photo: 48.05540, -123.77340, looking 280°, at 16:21
Mount Storm King → src/world/hikes/mount-storm-king.js (206 kB)
  at 0, -3200 in the world: the real land for 800 m round the photo, at 1 : 5
  the walk: Mt. Storm King Trail, 496 m, climbing 122 m
  lakes: Lake Crescent
```

In the game, press **K** (or tap *hikes*) for the list of them: each with its
trail, how long it is, how far it climbs and the lakes on it, and two ways
in. **trailhead** puts you at the start, by a signpost, with the HUD pointing
the way to the top. The trail is the real one, switchbacks and all, cut into
the hillside as a level tread. At the end of it a cairn stands where you took
the photo. **the view** takes you straight there: you're standing where you
stood, facing the way you faced, at the hour you were there. From the top
you can see across the whole of it, the lake below, the ridges beyond, the
valley running off into the haze. The map names the hike and its trail. In
the list, the arrow keys move between the buttons and **Esc** or **K**
closes it.

**What gets imported.** The land is scaled 1 : 5, the same across and up, so
slopes are as steep as they really are: 2.5 km of trail and 600 m of climb
become a four-minute walk up 120 m, and the game's trees stand against the
mountain about as big as real ones do. Inside 4 km of the photo (800 m in the
game) the ground is the real ground; over the next kilometre it gives way to
the forest around it. Every footpath, track and lake that OpenStreetMap has
in there comes too. The trail the photo was taken on, from its lower end, is
the walk. Steep ground is bare rock, the rest is wooded (`--cover`,
`--species`), and the spot the photo was taken from is kept clear of trees,
with nothing growing in front of it to block the view.

**Where it goes.** Each hike gets a spot of its own, out past 3 km from the
middle of the world, clear of the others (`--at x,z` to choose). Like
everything else a seed grows, it is part of the world description: a world
built in near a hike keeps it there. Importing a hike again (`--force`)
leaves it where it is, and `npm test` checks that hikes leave the rest of the
world alone.

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
of a hike, its own land and the 260 m past it where the forest's water gives
way, is grown until its land has come; the chunks, the map and the far view
each wait for it.

| option | default | |
|---|---|---|
| `--name "…"` | the nearest named peak, or the trail | what to call it |
| `--scale` | `0.2` | game metres per real metre |
| `--radius`, `--fade` | `4000`, `1000` | real metres of real land, and of blending into the forest |
| `--cell` | `30` | real metres between heights |
| `--cover`, `--species` | `0.85`, `0.6` | how wooded (0–1), and broadleaf (−1) to conifers (1) |
| `--lat --lon --bearing --hour` | from the photo | for a photo that doesn't say |

Downloads are kept in `node_modules/.cache/hike`. To take a hike out, delete
its entry in `src/world/hikes.js` and its file. From the console:
`world.hikes.list()` and `await world.hikes.go('mount-storm-king', 'view')`.

Elevation: AWS Terrain Tiles (USGS 3DEP and others). Trails and lakes: ©
OpenStreetMap contributors, under the
[ODbL](https://www.openstreetmap.org/copyright).

## Files

```
index.js              plugs it into the game: the list (K), the way to the view, signpost and cairn
farView.js            the land past the loaded chunks, seen from up high
farGrid.js            that land, sampled coarsely (pure)
farWorker.js          Web Worker wrapper around farGrid
landmarks.js          the cairn and the signpost
hikesPanel.js         the list of hikes (K), and the way to each
hikes.css             its styles
```
