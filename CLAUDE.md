# my-world

An open-world forest in three.js, with building, wildlife, water and shared
saved worlds. Everything is made in code: no textures, models or audio files.
README.md describes the game; its "How it's put together" section is the
architecture, and is worth reading before adding anything.

## Commands

```bash
npm run dev          # the game, http://localhost:5173
npm run api          # the save server (wrangler dev), http://127.0.0.1:8787
npm run build        # static site in dist/
npm test             # the type check, then unit and golden tests in Node, a few seconds
npm run smoke        # builds, then a play-through in headless Chromium, a few minutes
npm run serve        # built site + save server together on :8787
npm run together     # two visitors in one world; needs `npm run serve` running
npm run hike -- photo.heic   # a hike from a photo into the world (fetches elevation + OSM)
npm run earth        # the real Earth under the world, into src/world/earth/ (fetches elevation + climate)
```

Run `npm test` after any change. Run `npm run smoke` after touching anything
a player does (tools, movement, HUD, saving, sound, wildlife);
`node test/smoke.mjs build fires` plays only the parts named. Run
`npm run together` after touching `src/save/`, `src/voice/` or `worker/`.
All three also run on every pull request (`.github/workflows/ci.yml`).

## How to add things

A feature is a folder under `src/` whose `index.js` exports
`install<Name>(game)` and `after`, the folders of the features it uses.
`main.js` finds it: there is no list to add it to (`src/game/features.js`
has the rules, and `npm test` checks `after` against what is taken from
`game`). Where a feature installs is also where its tool sits on the bar and
its keys on the help panel, so name a feature in `after` to follow it there
too.

Put new behaviour in a new feature, or in the feature that already owns it —
not in `main.js`, `game/game.ts`, `build/builder.js`, `audio/soundscape.js`
or `save/worldSave.js`. Those are hosts; they should not learn about what
plugs into them. The table in the README lists what to call for a tool, a
key, a sound, something saved, an animal, and so on, and each of those files
starts with the contract.

- Only `index.js` files hold `game`. Other modules take what they need as
  arguments, so they can be tested alone.
- Bind keys with `game.commands.add`; the help panel is generated from it.
  Do not add key checks elsewhere or edit help text in `index.html`.
- Every letter and every pad button is bound. Something new to do goes
  without a key: a command with a `label` is in the pack (`src/pack/`, Tab),
  and one whose `now()` gives a word ('get in', 'float') is at hand, with a
  button on a touch screen. Don't make touch buttons by hand.
  (Somewhere that isn't the forest and has keys of its own, like the town in
  `src/skirmish/`, is a `mode`: its commands name it, and while it's on only
  they run and are at hand, so there the letters are its own.)
- Anything persistent goes through `game.save.register` and calls
  `game.save.touch()` when it changes. Do not use `localStorage` directly;
  keys live in `src/core/storage.js`.
- Read URL parameters only in `src/config.js`.
- To be heard, extend `Emitter` and `emit`; do not add `onSomething` slots.
- Nothing big goes to the graphics card: it works in 32-bit floats, and the
  world is thousands of kilometres across. `src/render/origin.js` slides the
  scene to an origin near the camera while a frame is drawn, and says what
  that asks of you. In short: build geometry (and instances) round its own
  mesh and put the mesh in the world; register a uniform that holds a place
  with `game.origin.place`; in a shader, get position for patterns from
  `worldXZ()` and use `wnoise`/`wave` (`src/render/glsl.js`), never
  `modelMatrix` alone.
- What a real place looks like is its country, one entry in
  `src/world/country.js` (ground, plants, sky, animals), named on the hike's
  card. Add or tune a country there, not in the shaders or the placement
  rules; those only read the table. In the forest none of it applies, and
  must not: the golden tests grow the forest.
- Import direction: `core` ← `render` ← `world` ← features. `world/` does
  not import from feature folders.
- When a second feature needs a helper that lives in another feature's
  folder, move it down into `core/`, `render/` or `world/` rather than
  import it across. `npm test` fails once a file in a feature's folder is
  imported by three others, unless the README's table lists it as something
  features plug into.
- Something that carries or moves the hiker asks for them:
  `player.rides.take({ by, what, carrier | aboard, lost })` (and
  `hold.release()` to let go). Never set `player.carrier` or `player.aboard`.
  Offer a ride only while `player.rides.free`, and say `player.rides.why()`
  when it isn't. What moves you gives a `slack`, and is told (`lost`) when a
  teleport takes the hiker out of it: don't watch for that each frame.
- A cue on the HUD is yours: `hud.cue({ html }, 'yourfeature')` while it
  applies and `hud.cue(null, 'yourfeature')` when it doesn't. No flag to
  remember whether it's up.
- Something grown from the seed and found a little at a time keeps its
  answers in a `Searches` (`core/searches.ts`), or is a `PerTown`
  (`towns/perTown.ts`), and registers one job:
  `game.budget.add({ name, work: (ms) => it.pump(ms) })`. Don't slice time
  by hand or keep an allowance of the frame of your own.
- A search can't be stopped part way through a step, so it yields every
  millisecond or two of work: every few dozen heights asked of the land
  (`HEIGHTS_A_STEP` in `airports/airports.js`), not every row of a grid or
  every spot looked at. What it needs of another registry it waits for
  (`yield 'wait'` until `keepOff.ready(box)`), or asks a square at a time
  with a yield between, rather than have it all found in one step.
- What is grown from the seed asks `builder.obstacles.built(x, z, R)` to
  know whether someone has built on it, never `near()`, and adds its own
  source with `{ grown: true }`. A grown thing's source goes looking for
  what's near and sends for what hasn't been found: asked by other grown
  things, each road found sent for the next, across the world, for ever.
- What is only needed once you're at a place (what builds it, who is in
  it) goes in a module of its own that the feature fetches when the first
  one is about to be stood up: `const look = lazy(() => import('./look.js'))`
  (`core/lazy.ts`), `look.want()` before standing it up. Don't import such
  a module from `index.js`, or from anything `index.js` imports. If a save
  can leave the hiker standing on what it builds, say
  `game.beforeArrival(look.ready())` in `restore`.
- What a search keeps clear of is put together from claims
  (`world/claims.ts`). How a thing is kept clear of is said once, beside the
  thing (`railsNear`, `caveMouths`, `airfieldsOver`): add a claim for a new
  thing there, don't write its loop into each search. Which claims an
  existing search uses, and how near, is part of what the seed grows: leave
  those lists as they are.

TypeScript is for where things join (`tsconfig.json` says how it is run):

- Write a new engine or host module (`core`, `game`, `render`, and what
  features plug into) in `.ts`. It is checked strictly.
- Node and Vite run `.ts` by dropping the types, so use only syntax that can
  be dropped: no enums, namespaces or parameter properties. Import a `.ts`
  file by that name, and a type with `import type`.
- When you work on a feature's `index.js`, make it `index.ts`: that is when
  its use of every typed contract starts being checked. Say what it provides
  beside its install function (`declare module '../game/game.ts' { interface
  Services { … } }`, as `src/fires/index.ts` does) and delete its
  `services.d.ts`.
- When a `.ts` feature needs a contract its JavaScript host hasn't typed,
  type it at the host (a `@typedef` and `@param` beside the method, as in
  `build/obstacles.js`), not with a cast at the caller.
- World generation (`world/`, pinned by the golden files) stays as it is
  until everything round it has been done.

What goes with a feature lives with it, so that two branches adding features
don't edit the same lines:

- Its docs are `src/<name>/README.md`: what it is for someone playing, its
  keys, and a line for each file. The main README doesn't list features and
  its opening is not kept up to date with them: don't add one to it.
- Its part of the play-through is `test/smoke/NN-<name>.mjs` (the top of
  `test/smoke.mjs` says what a part is handed). Don't add steps to another
  feature's part.
- A new row in the README's "what features plug into" table goes in its
  place by file, not at the end.
- Don't keep lists of features, steps or timings in comments or prose that
  each new feature would have to extend.

## What must not drift

- **World generation is part of the save format.** A save is only the diff
  from what a seed grows. `world/worldgen.js`, `sea.js`, `chunkGen.js`,
  `water.js`, `drainage.js`, `noise.js` and the order of `world/flora.js`
  are pinned by `test/golden/`, and every world keeps the *land* it was
  first grown on (`world/lands.js`).

  How far that is pinned is `FROZEN` in `world/lands.js`. A **frozen**
  land's golden files are for good, because worlds people keep are grown on
  it: if one of its tests fails, fix the code — `UPDATE_GOLDEN=1` refuses to
  write them. The lands past it are **drafts**, and nothing is frozen yet,
  so while the land is a draft change it in place, re-record with
  `UPDATE_GOLDEN=1 npm test`, and say in the commit what moved: the diff is
  there to show what the change did to the land, so read it. (A new plant
  appended to `flora.js` adds entries to the vegetation files: ask first,
  then add only those, leaving every existing entry as it is.)

  Once a land is frozen, something that changes how the forest grows is a
  land of its own: a class grown from the newest, listed in `lands.js`, with
  golden files of its own, leaving the frozen ones growing exactly as they
  did — and hooks it needs go into the older land as methods that change
  nothing there.

  The old places in `landmarks/` are grown from the seed too, and never
  change the land or the plants: they stand on it as it is. Where they are
  is pinned in `test/golden/landmarks-*.json`, because the places people
  have visited or are tracking are saved by id. The caves in `caves/` are
  the same: grown from the seed without changing the land, and pinned in
  `test/golden/caves-*.json`. So are the railways in `railway/`, whose
  stations are pinned in `test/golden/railway-*.json`, and the gates in
  `hell/` and `skirmish/`, pinned in `test/golden/hell-*.json` and
  `test/golden/skirmish-*.json`.
- **Element spelling is for good**, whatever the lands are doing. Keys and
  values in `test/golden/save-elements.json` are what is on the save server
  and in people's browsers. Add new element kinds; never change existing ones
  — `UPDATE_GOLDEN=1` allows only additions to that file. The `localStorage`
  layouts in `test/local.test.js` likewise.
- **Hikes are part of the world description too**, where each one is. Don't
  move one (`at`), change its `datum`, or edit its files by hand: re-import
  with `--force`, which keeps it in place. Hikes go where they really are
  (`tools/hike/place.js`), and ones that overlap share a datum.
  `test/hikes.test.js` checks, on every land, that they leave the rest of the
  world exactly as it was. They are set into whichever land a world is grown
  on by `world/realPlaces.js`, which is grown from the land and wraps what it
  says: put what real places need there, not in a land. A land's own workings
  ask `forestHeight()`, never `broadHeight()`, and the drainage network reads
  the forest's own land (`forestHeight`, `forestNaturalHeight`), never a
  hike's, so a hike can't reroute water outside it. A hike's land is fetched
  when it's needed (`world/landforms.js`): anything that grows the world
  somewhere new (chunks, map tiles, the far view) asks
  `landforms.ready(box)` first and waits, and anything else grown from the
  seed keeps off a hike's reach (`landforms.reaches(box)`), as the old places
  and the caves do.
- **The real Earth is part of the world description too.** Everywhere,
  the start included, the land is the Earth's (`world/earth.js`), set in by
  `world/realPlaces.js` as the hikes are, from the tiles `npm run earth`
  writes to `world/earth/`. Don't edit those, and once a land is frozen
  don't re-run the importer to reshape them: worlds are built on them. A
  land grown without it, as the golden tests grow one, is exactly itself:
  the Earth goes into the wrapper, never into a land, as a hike does. Its
  tiles are fetched as they're needed, like a hike's
  land, and `landforms.ready(box)` waits for them too; anything else that
  asks about the Earth before its tile has come is thrown a `NotYet`
  (`core/notYet.ts`): a `Searches` search starts over when it has, a system
  is run again next frame, and a search of a feature's own that steps its
  generator by hand has to catch it and start over. What's grown from the
  seed round the start and round each hike can count on the Earth there
  being in hand as it installs (`world/index.js` fetches it first). What a
  part of the Earth looks like is its country, by its climate:
  `EARTH_COUNTRY` in `world/country.js`.
- Values put into or taken out of the element record must be copies
  (`own()` in `save/regions.js` does this for domains that go through the
  registry).

## Style

Comments say what a thing is and why, in plain words, at the top of the file
and above anything non-obvious. Tunable numbers get a name and a unit.
Scratch vectors are module-level `_v` to keep allocation out of the frame.
