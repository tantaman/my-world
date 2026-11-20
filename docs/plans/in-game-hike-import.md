# Plan: importing a hike from inside the game

Status: **planned, not built.** Written against `095b782` (hikes from the
command line, and the hikes list on K). Nothing here has been started.

## What we want

Today a hike gets into the world one way: `npm run hike -- photo.heic`, which
writes it into the code (`src/world/hikes/`) so it ships with the game and
is in every world. To add one you need the repo, Node and a deploy.

We want to add one from inside the game: open the hikes list, choose a
photo (or drop one on the game), watch it build, and walk it. And since a
world can be shared, everyone in that world should see it appear.

### Decided

- **A hike imported in the game belongs to the world it was imported into**,
  and is saved with it, shared with everyone in it, live. Other worlds are
  untouched. (Rejected: one library shared by every world. One world can't
  see what was built in another, so an import could land on someone's cabin.)
- **The photo itself is not kept.** Only what is read from it: where, which
  way, what hour.
- **Hikes in the code stay** (`npm run hike`, Mount Storm King): they are the
  ones every world has.

## What already works in a browser

Checked on 2026-11-20:

- **The photo.** `tools/hike/exif.js` reads JPEG and HEIC from bytes alone;
  it never decodes the picture, so HEIC needs no codec.
- **The land and the trails.** AWS Terrain Tiles answer with
  `Access-Control-Allow-Origin: *`; the OpenStreetMap API allows any origin.
  Both can be fetched straight from the page, with no proxy.
- **Building it.** `tools/hike/build.js`, `geo.js`, `osm.js` and the packing
  in `src/world/landform.js` are plain modules with no Node in them. Only
  `png.js` uses `node:zlib`, and `DecompressionStream('deflate')` does the
  same job in both browsers and Node.

So the importer can run in the page, in a worker, as it is.

## The three things that have to change

### 1. A hike becomes something a world saves

A world domain (`src/save/domains.js`) cut into elements, so it rides the
machinery that's already there: the world's frame when it opens, ops over
the socket, this browser's copy, the server's whole copies. No new server
endpoint, and nothing to fetch after the world opens.

The save server caps one element at 4 KB (`MAX_VALUE` in `worker/world.js`);
a hike is ~200 KB. So it is cut up, by the same 64 m regions the world is
stored in. Proposed spelling (new kinds only; nothing existing changes):

| key | region | value |
|---|---|---|
| `hk:<hid>` | LOOSE | the header: version, name, `at`, scale, radius, fade, cell, n, view, trailhead, trail, trees, lakes (name, level), and how many parts follow |
| `hg:<hid>:<rx>:<rz>` | that region | `[i0, j0, w, h, heights]`: the grid points that fall in it, packed as `packHeights` does |
| `hs:<hid>:<lake>:<rx>:<rz>` | that region | `[i0, j0, w, h, shore]`: a lake's shore distances there |
| `hp:<hid>:<k>` | LOOSE | a run of footpaths, each part under 3.5 KB |

- `<hid>` is a random six-character id, the way marks get theirs, so two
  imports never share a key.
- A hike is about 1,000 `hg` elements (500,000 is the cap per world), and
  goes up in one HTTP batch (`BIG_BATCH` is 400 ops, `MAX_BODY` 4 MB).
- `decode` only hands back a hike once its header and every part it counts
  have arrived. One that arrives over the socket a piece at a time appears
  whole, or not at all.
- **Pin the spelling** in a new golden (`test/golden/hike-elements.json`)
  in the same change that introduces it. From then on it is for good, like
  `save-elements.json`.
- The diff runs a few times a second over every element. A hike never
  changes once imported, so the domain keeps its encoded elements and hands
  the same ones back each time. Measure before and after with a big world.

### 2. The world takes a hike after it has been built

Today `WorldGen` is handed its hikes when it is made (`installWorld`), and
the chunk, map and far-view workers are handed them once, when each starts.
A saved world's hikes are only known at `save.restore()`, which runs after
the features are installed, and a hike can also arrive mid-game (yours, or
someone else's over the socket).

- `WorldGen.addHike(def)` / `removeHike(id)`: make and settle the
  `Landform`, and clear the water's lake and pond caches (`water.lakes`,
  `water.ponds`), since a basin cached before may now be too close. Both are
  only caches, and recompute the same.
- The chunk workers, map workers and far-view worker each get
  `{ type: 'hike', def }` / `{ type: 'unhike', id }`. Workers take messages
  in order, so a chunk asked for after the message is grown with it.
- **Regrowing.** `ChunkManager.regrow(x0, z0, x1, z1)`: dispose the chunks
  in the box (`disposeChunk`) so `update()` asks for them afresh. `MapTiles`
  needs a `forget(box)` that drops cached tiles and bumps `epoch` for any in
  flight. The far view just rebuilds.
- `restore()` runs before the first chunk streams in (see `src/main.js`), so
  a world's own hikes are in place before any ground is grown. Regrowing is
  only for one that arrives while you're playing, and the placement below
  means it is nearly always somewhere nobody has loaded.
- `test/hikes.test.js` gets: a hike added afterwards grows exactly the land
  of one passed at the start.

### 3. Placement that can't disturb anything

The game knows where people have built in this world: elements are filed by
region. A hike imported in the game goes to the first spot (same rings as
`freeSpot` in `tools/hike.mjs`, 3 km and out) where
- it keeps clear of every other hike, in the code or in the world, and
- **no region under it holds any element at all.**

So an import never moves anyone's ground, stumps or cabin. This wants one
generic question asked of the save: `save.regionsWithChanges()` (the regions
that hold anything). It learns nothing about hikes by answering it.

## Importing, in the game

**Shared code.** Move the pure modules from `tools/hike/` to
`src/hikes/import/` (`exif.js`, `geo.js`, `osm.js`, `build.js`, and `png.js`
made async with `DecompressionStream`). `tools/hike.mjs` keeps the files,
the cache and the arguments and imports them from there. One importer, two
front doors.

**A worker.** `src/hikes/importWorker.js` does the fetching and building,
posting progress as it goes, so the game doesn't stutter for the second or
two it takes.

**The flow.**
1. In the hikes list: *add a hike from a photo* (a file input taking
   `image/heic, image/heif, image/jpeg`), or drop a photo on the game.
2. Progress in the panel: reading the photo · the land (12 of 20) · trails
   and lakes · building · finding a place for it.
3. A preview before anything is saved: the hillshade with the trail in red
   (the CLI's `preview` drawn to a canvas), the name (editable: nearest
   peak, else the trail), length, climb and lakes. *add it* or *cancel*.
4. *add it*: placed, saved (it goes out to everyone in the world), added to
   the world, and you're at the trailhead.

**When it can't.**
- No position in the photo: say so, and offer the map: click where it was
  taken (and which way it looked).
- No trail near where it was taken: say that you'll arrive where the photo
  was taken, and that **the spot will be visible to anyone in this world**.
  A photo from home would give your home away; ask before going ahead.
- The land or the trails can't be fetched: say which, and let them try again.

**The data sources.** Terrain tiles are open data, fine to fetch.
OpenStreetMap's own API is for editing and asks heavy readers to go
elsewhere; a few imports a day is light, but prefer
[Overpass](https://overpass-api.de) (CORS-enabled, made for reads) and fall
back to the API. Name and credit both in the panel (© OpenStreetMap
contributors), as the README does.

**Unsaved worlds.** A world with no address keeps its domains in
`localStorage` (`KEYS.build(seed)`). A hike is ~200 KB there; a typical 5 MB
quota holds a dozen or so beside everything else. If the write fails, say
so and suggest saving the world to the server (L).

## Taking one out

From the list: *take it out*. Only allowed while nothing has been changed on
its land (no elements but its own in its regions), since dug ground, stumps
and cabins are stored relative to the ground the hike grew. Otherwise say
what's in the way. Removing deletes its elements, which reaches everyone,
and `removeHike` regrows whatever was loaded there.

Hikes in the code are listed as *built in* and can't be taken out from the
game.

## Order of work

Each step leaves the game working and the tests green.

1. **Share the importer.** Move the pure modules, make `decodePng` async.
   The CLI behaves exactly as before: re-importing Mount Storm King is
   byte-identical.
2. **Hikes added later.** `addHike` / `removeHike`, the worker messages,
   `regrow`, `forget`, the basin caches. Test: added later equals added at
   the start.
3. **The domain.** Encode and decode, completeness, the cached encoding,
   the new golden. Test: a hike → elements → a hike, byte for byte; a
   partial one is not handed back.
4. **Placement.** `regionsWithChanges()`, the free-spot search over the
   world's hikes and the code's. Test: never a region with anything in it.
5. **The import in the page.** The worker, the panel's flow, drag and drop,
   the errors, Overpass first.
6. **Taking one out.**
7. **Docs and checks.** README (Hikes, and *where it's kept* now has two
   answers), CLAUDE.md (the new kinds are for good), `npm run smoke`
   imports one from a JPEG made in the test with the network answered from
   fixtures (Playwright `page.route`: small made-up elevation tiles, a small
   OSM answer), and `npm run together`: one visitor imports, the other sees
   the hike appear without reloading.

## Open questions

- **iPhone uploads.** When a photo is picked in Safari, iOS may convert it
  to JPEG and may drop its location, depending on how it's picked. Try it on
  a real phone early (step 5); if the location is gone, the click-on-the-map
  fallback is the main path there, not the exception.
- **Could the CLI import into a saved world too** (`--into <world id>`,
  sending the elements as ops)? Cheap once step 3 exists; useful for
  adding several from a laptop.
- **Should the list show the hikes nearest you first** once there are more
  than a handful?

## Files

New: `src/hikes/import/*` (moved from `tools/hike/`), `src/hikes/importWorker.js`,
`src/hikes/hikeSave.js` (the domain), `test/golden/hike-elements.json`.

Changed: `src/world/worldgen.js` (`addHike`, `removeHike`),
`src/world/water.js` (clearing its caches), `src/world/chunks.js`
(`regrow`), `src/world/chunkWorker.js`, `src/map/tiles.js` (`forget`),
`src/map/mapWorker.js`, `src/hikes/farWorker.js`, `src/hikes/index.js`,
`src/hikes/hikesPanel.js`, `src/save/worldSave.js`
(`regionsWithChanges`), `tools/hike.mjs`, `README.md`, `CLAUDE.md`,
`test/hikes.test.js`, `test/smoke.mjs`, `test/together.mjs`.
