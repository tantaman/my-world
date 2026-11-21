# my-world

An open-world forest you can wander through as a little explorer, seen from
behind in third person. Over a few kilometres it changes country: low lake
country strung with ponds and lakes, rolling hills, and mountains with rock on
their faces, a treeline, alpine meadows and snow on the tops; and its woods
turn from dark conifer forest to birch groves to open parkland. Streams run
down its valleys, join and grow into rivers, and gather in ponds and lakes in
the hollows. It's built with
three.js, and is drawn to look real: lit, coloured and exposed the way a
photograph of a real wood would be. (Or as soft pixel art, if you'd rather:
it's a setting.) See [the look](src/render/README.md).

You can also **build**: fell trees, buck them into logs, hew timbers, clear
and grade the ground, set stone footings, and raise a notched log cabin with
rooms, doors, windows and a roof. And when it gets dark, ring a pit with
stones and light a **campfire**. See [Building](src/build/README.md) and
[Campfires](src/fires/README.md). Or pick a
**blueprint**, stake it out, and let the hiker build it for you. See
[Blueprints](src/blueprints/README.md).

And you're not alone out there: deer, elk, moose, black bears, wolves,
mountain lions, bobcats, foxes, rabbits, squirrels, chipmunks, mice, snakes,
salamanders, songbirds, crows, hawks, owls, bees and butterflies come and go.
See [Wildlife](src/wildlife/README.md).

Somebody was here before you, too. Here and there, a few hundred metres
apart, there's an old log cabin, the ruins of a homestead, a hunting cabin, a
tent left pitched by a cold fire ring, a stone well, a dock with a rowboat
tied up, or a canoe turned over on a river bank. Each has a name and is on
the map, so you can go and find it. See [Old places](src/landmarks/README.md).

And somewhere out there are three animals you can **ride**: a wild horse in
a meadow, an old snapping turtle in a lake, and a golden eagle big enough to
carry you on a high summit. You don't start with one. Word comes of where to
look; find one, win it over, and it's yours. See [Mounts](src/mounts/README.md).

Over time we'll also add hand-made **structures**: places to keep thoughts and
ideas, and places to explore. See [Structures](src/structures/README.md).

Each of these, and everything else in the game, is a **feature** in a folder
of its own under [`src/`](src/), with a README that says what it is, what
its keys are and how it works: that is where to read about one. This page
doesn't try to list them all. A list here would be a line every new feature
had to add in the same place as every other, and the folders are the list.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 — the game
npm run api        # http://127.0.0.1:8787 — the save server (optional)
npm run build      # static site in dist/
npm test           # the rules, in Node (see "Checking it still works")
npm run hike -- photo.heic   # put a hike you've done into the world (see src/hikes/README.md)
```

The game is a static site and runs on its own; `npm run api` adds the save
server, which lets a world live at a URL. `npm run dev` proxies `/api` to it.
See [Building together](src/save/README.md) to set the server up, or skip it
— the forest doesn't mind.

## Controls

| | |
|---|---|
| **W A S D** / arrows | walk (relative to the camera) |
| **Shift** | run |
| **Space** | jump |
| **Shift** / **Space**, out of your depth | dive / come back up (under water, **W** swims the way you look) |
| **click**, then move the mouse | look around (pointer lock; drag works too) |
| **Q / E** | turn the camera |
| **scroll** | zoom |
| **R** | back to the starting path |
| **H** or **?** | help |
| **O** | settings: the picture, the hour, sound, frame stats |

Those get you about. Everything else — the map, the tools, talking, riding —
has its keys in its own README, in its folder under [`src/`](src/), and **H**
in the game lists them: the help panel is written from the keys the
features bind, so it can't fall behind.

On a phone or tablet, drag with your left thumb to walk (push it all the way
to run), drag with your right thumb to look, and tap on the right to jump.
Tap a tool in the bar at the bottom (a slot with pips holds a kit of tools: tap
again for the next, or pick one from it). The **use**, **alt** and **stake**
buttons on the right stand in for the mouse buttons and **G**, and in a shared
world, hold **talk** or **radio** beside them to talk. Out of your depth, hold
**dive** to go under; let go and you drift back up.

Your position, the time of day, your look settings and whether sound is on
are remembered between visits. Add `?reset` to the URL to start fresh (your
map marks are kept). A world you made on an earlier land is still there at
`?land=1` or `?land=2` (see [Lands](src/world/README.md#lands)). To keep a world somewhere other than this browser — and
to build in it with other people — see [Building together](src/save/README.md).

## Tuning from the URL

| param | default | |
|---|---|---|
| `pixel` | | draw it as pixel art (the next five are for that) |
| `soft` | `0.55` | pixel softness, 0–1 |
| `px` | auto | screen pixels per art pixel |
| `lines` | `300` | target art-pixel height when `px` is auto |
| `outline` | `0.28` | outline strength |
| `levels` | `36` | colour levels per channel before dithering |
| `sharp` | `1080` | the most lines the picture is drawn in without pixel art |
| `ao` | `0.85` | ambient occlusion, 0–1 (`0`: not worked out at all) |
| `time` | `16.6` | starting hour of the day |
| `seed` | `20261119` | a completely different world |
| `land` | newest | which [land](src/world/README.md#lands) a local world is grown on: `1` for the first |
| `view` | `4` | chunks loaded in each direction (64 m each) |
| `grass`, `grassDensity` | `40`, `7` | grass radius (m) and blades per m² |
| `q=low` | | lighter preset for modest GPUs |
| `mute` | | start with sound off |
| `animals` | `1` | how much wildlife: `0` none, `2` twice as much |
| `creative` | | build without gathering materials |
| `clearbuild` | | forget everything you've built and changed in this world |
| `debug` | | show stats from the start |

Example: `/?pixel&soft=0.3&px=5&time=7.5`

## How it's put together

The game is made of **features**. Each is a function that takes the game
and installs itself — makes its things, says what it saves, binds its keys,
adds what it does each frame. A feature lives in a folder of its own under
`src/`, and nothing lists them: `src/main.js` finds every folder whose
`index.js` exports an install function, and each says there which features
it has to come after:

```js
// src/fires/index.js
export const after = ['render', 'world', 'audio', 'build'];
export function installFires(game) { … }
```

They install in an order that puts each after the ones it names, and by name
where that leaves a choice (`src/game/features.js`), so a new feature never
changes the order of the others. `world.features` in the console shows the
order. It is also the order tools sit on the tool bar, keys are listed on the
help panel and systems run within a phase, so a feature can name another for
its place as well as for its things: blueprints comes after fires to keep the
plan tool after the campfire.

A feature's `index.js` is the only file in it that knows about the game as a
whole. Everything else in the folder is ordinary classes and functions that
are handed what they need, which is what lets most of them be tested in Node
with nothing else running.

**The frame.** Each frame runs in phases, and within a phase in the order
features were installed (`src/game/game.js`):

| phase | what happens |
|---|---|
| `input` | keys have been read and commands run; the clock ticks |
| `update` | what you do: walking, the tool in your hands |
| `world` | what follows from where you are: streaming, sky, animals, other people |
| `audio` | what all of that sounds like |
| `render` | draw it |
| `late` | the HUD, saving, bookkeeping |

`world.game.systems` in the console shows what runs, in order. A system that
throws is reported and, if it keeps throwing, stopped: a stuck animal doesn't
freeze the forest.

**What features plug into.** Things a new feature usually needs already have
a place to go, so that adding one doesn't mean editing the others. They are
listed by the file that defines them (under `src/`); a new one goes in its
place in that order, not at the end:

| in | to add… | …call |
|---|---|---|
| `adventures/adventures.js` | an adventure to start from the board | `game.adventures.define({ id, title, blurb, where?, start })` |
| `audio/calls.js` | an animal's voice | `defineCall(kind, reach, play)` |
| `audio/footsteps.js` | a kind of ground underfoot | `defineSurface(name, { thump, step })` |
| `audio/sfx.js` | a one-off sound | `defineSfx(kind, play)` |
| `audio/soundscape.js` | a sound that plays all the time | `game.sound.addLayer({ build, update })` |
| `audio/soundscape.js` | being shut in: the open air muffled, the rest echoing | `game.sound.setEnclosed(0..1)` |
| `audio/soundscape.js` | everything heard as if through something | `game.sound.muffle(amount)` |
| `build/builder.js` | a tool, in a slot of its own or a kit it shares | `game.builder.register(tool)`, with `tool.kit` |
| `build/builder.js` | hands too full for tools | `builder.idleWhile(fn)` |
| `build/inventory.js` | a material to carry (`optional`: on the HUD only while you have some) | `game.builder.stock.define({ id, label, optional })` |
| `build/obstacles.js` | a thing tools must work round | `game.builder.obstacles.addSource(fn)` |
| `country/index.js` | a layer of cloud of your own over everything, for a while (a flight's) | `game.country.cloud(() => ({ at, cover, x, z }))` |
| `far/index.js` | land drawn past where the forest is streamed in, to be seen from high ground | `game.far.want(id, x0, z0, x1, z1, step)`, `far.drop(id)` |
| `game/commands.js` | a key or a pad's button, and its line on the help panel | `game.commands.add({ keys, run, group, label })` |
| `game/game.js` | something done every frame | `game.addSystem({ name, phase, update })` |
| `game/settings.js` | a remembered preference | `game.settings.get / set` |
| `hunting/shot.js` | something else the rifle can hit (a man, a wall that stops a shot) | `game.hunting.targets.add({ aimed, struck?, heard? })` |
| `map/mapView.js` | something drawn on the map | `map.addLayer((pen) => …)` |
| `map/mapView.js` | a list of somewhere to go, beside the map | `game.map.addTab({ id, label, el, shown })`, `map.open(id)` |
| `map/mapView.js` | an option under those lists (a button) | `game.map.addAction({ id, label, title, run, enabled })` |
| `map/places.js` | a place on the map, to look up and track | `game.map.places.addSource({ within, get })` |
| `player/character.js` | something the hiker holds up to the face | `character.addRaised(name, object, { stowed })`, `raise(name)` |
| `player/character.js` | sitting astride what carries you, or in it with your arms over the sides | `character.seat({ spread, hang, lean, rest, stroke })` |
| `player/character.js` | standing on something that slides (skis, a board) | `character.stance({ feet, crouch, lean, arms, shod, board, … })` |
| `player/character.js` | hanging in a harness under something (a hang glider) | `character.hang({ tilt, reach, spread })` |
| `player/character.js` | something the hiker wears on the cap | `character.addWorn(object, { band })` |
| `player/character.js` | something the hiker wears on the back, over the pack | `character.addOnBack(object)` |
| `player/character.js` | a way of standing to the work (a rifle shouldered) | `definePose(kind, keyframes)`, `character.play(kind, dur)` |
| `player/player.js` | walking the hiker somewhere | `player.steer = { x, z, run }` |
| `player/player.js` | something that carries you (how fast, how deep, whether it flies or floats) | `player.carrier = { walk, run, swim, depth, fly, keel, … }` |
| `player/player.js` | something that moves you itself (a train you sit in, skis you steer, a tube the river carries) | `player.aboard = { place(out, dt) }` |
| `player/player.js` | something held to the eye: look through it, magnified | `player.sight = { zoom }` |
| `render/origin.js` | a uniform that says where something is | `game.origin.place(uniform)` |
| `save/domains.js` | something that is saved | `game.save.register({ id, collect, restore, … })` |
| `save/worldSave.js` | a word to the others here, never stored | `game.save.say(ch, body, to)`, `game.save.on('message', fn)` |
| `ui/hud.js` | a button on the HUD | `game.hud.button(id, fn)` |
| `ui/hud.js` | what a key would do here, whatever tool is in hand | `hud.cue({ html, progress })` |
| `ui/hud.js` | somewhere the HUD points you to | `game.hud.guide(() => target)` |
| `ui/hud.js` | a setting: a switch or a slider on the settings panel | `game.hud.setting({ id, group, label, get, set })` |
| `wildlife/species.js` | a species | `defineSpecies(kind, def)` |
| `wildlife/wildlife.js` | a new kind of creature altogether | `defineAnimalClass(name, make)` |
| `wildlife/wildlife.js` | shooting at the animals, or startling them with a loud noise | `wildlife.aimed(o, d, far)`, `kill(hit)`, `startle(x, z, reach)` |
| `world/country.js` | a kind of country (its ground, plants, sky, animals, what its trees are called) | an entry in `COUNTRY` |
| `world/cuts.js` | a hole in the ground, for something to stand in for it | `setCuts([{ ax, az, bx, bz, fa, fb, w, h }])` |
| `world/flora.js` | a plant | an entry in `FLORA`, a model, and where it grows (`chunkGen.js`) |
| `world/grass.js` | somewhere grass doesn't grow | `game.grass.addClearing(fn)` |
| `world/hikes.js` | a real place, from a photo | `npm run hike -- photo.heic` writes it there |
| `world/sky.js` | how much daylight reaches the eye (dims it, the eye adjusts) | `game.sky.open = 0..1` |
| `world/solids.js` | something solid to bump into and stand on | `game.solids.set(owner, [capsule])` (`surface: 'boards'` for its footsteps) |
| `world/spaces.js` | somewhere under the ground to be in: its floor, walls and roof | `game.spaces.add(space)`, `spaces.onDemand(fn)` |

Each of those files opens with what the thing is and what it is handed.

**A few rules the code keeps to.**

- *The forest is grown, not stored.* The same seed always grows the same
  land, so a save holds only what was changed. Anything that alters what a
  seed grows (`world/worldgen.js`, `sea.js`, `chunkGen.js`, `water.js`,
  `drainage.js`, the order of `world/flora.js`) moves every saved cabin
  relative to its hillside — so once a [land](src/world/README.md#lands) is
  frozen, a change to how the forest grows is a new one, and the frozen ones
  keep growing as they did. Real places are part of what is grown too, but
  only where each one is, and on whichever land
  ([real places](src/world/README.md#real-places)).
- *A save is spelled once, for good.* Each system says how its share of a
  save is cut into elements (`t:120:-40`, `l:x:0:0:4:0`), next to the class
  that owns it. Worlds on the server are spelled that way now: add new kinds,
  don't alter old ones. An element this build has never heard of is left
  alone, so an older client can't sweep away what a newer one saved.
- *Say each thing once.* What grows is one table (`world/flora.js`), keys
  are one registry, the address bar is read in one file (`config.js`), and
  every `localStorage` key is listed in `core/storage.js`.
- *Tell, don't be reached into.* A class that others need to hear from emits
  events (`chunks.on('vegetation', …)`, `player.on('footstep', …)`,
  `forest.on('crash', …)`) rather than holding one `onSomething` slot that the
  last caller wins.
- *Nothing big goes to the graphics card.* The game thinks in world
  coordinates everywhere, and the world is thousands of kilometres across;
  the card works in 32-bit floats. Each frame is drawn from an origin near
  the camera, and what that asks of anything that fills a buffer, sets a
  uniform or draws a pattern is in [the look](src/render/README.md) and at
  the top of `render/origin.js`.
- *Layers point one way.* `core` knows nothing; `render` knows `core`;
  `world` knows those; the features know the world and, where they must,
  each other — and nothing reaches back down.

### Extending the game

**A feature.** Campfires are one. `src/fires/` holds the fire itself in
plain modules (what a fire is and how it burns down, the tool, the look, the
sound) and an `index.js` that plugs it in:

```js
// src/fires/index.js, in short
export const after = ['render', 'world', 'audio', 'build'];  // whose things it uses

export function installFires(game) {
  const { scene, camera, solids, sky, builder, sound, save } = game;
  const fires = new Fires({ scene, solids, sky });
  game.provide('fires', fires);                              // world.fires in the console

  builder.register(campfireTool(fires, solids));             // on the tool bar: 5, the camp kit
  builder.obstacles.addSource((x, z, R, out) => {            // spades, walls, footings and roofs go round it
    for (const f of fires.list.values()) out.push({ x: f.x, z: f.z, what: 'a fire ring', dig: 1.05, wall: 0.55, footing: 1.15, roof: 0.5 });
  });
  save.register({ ...firesSave, collect: () => fires.serialize(),   // kept, shared, and synced live;
    restore: (data) => fires.load(data), adopt: (data) => fires.adopt(data) });  // spelled in fires.js
  fires.on('change', () => save.touch());
  sound.addLayer(crackle(fires));                            // heard from where each one burns
  game.addSystem({ name: 'fires', phase: 'world', update: ({ dt }) => fires.update(dt, camera.position) });
}
```

Fires names `build` in its `after` because it needs the builder, and the
others for the scene, the sky and the sound. Nothing else in the game was
told about fires, not even `main.js`, with one exception: a fire ring was the first thing a roof couldn't go over, so
obstacles learned a `roof` radius and the roof tool now checks it. When a new
thing needs something the game doesn't offer yet, add it like that: as a
general idea in the place that owns it, not as a special case for the thing.

What goes with a feature is its own too, so that two new features never
have to edit the same file: a `README.md` in its folder (what it is for
someone playing, and what each file in it is), its rules in
`test/<name>.test.js`, and its part of the play-through in
`test/smoke/NN-<name>.mjs`. It adds nothing to this page.

**A tool** is an object with `target(b)` — what would a click do, here, now?
— and `work(b, t, io)` — act on the buttons. The contract, and everything the
bench hands a tool, is at the top of `src/build/builder.js`; the six that come
with the game are in `src/build/tools/`; `hands.js` is the shortest to read.
A tool that goes with others names their `kit`, and shares their slot and key.

**Something saved** registers a *domain*: `collect()` and `restore(data)`
for its plain-JSON state, and, if it is part of the world rather than yours
alone, how that state is cut into elements. This browser's copy, the save
server, the diff that finds what changed and the socket other people build
over all work off the registry — none of them needs telling. See the top of
`src/save/domains.js`.

**A sound.** One-off sounds are entries in a table: `defineSfx('strike',
(k) => { k.noise(…); k.tone(…); })`. Sounds that are always there (a stream, a
fire) are *layers* with `build` and `update`. Everything goes out through a
bus — `ambience`, `effects`, `wildlife`, or one you name, like `music` — whose
level can be set on its own: `world.sound.volume('wildlife', 0.5)`.

**An animal** is an entry in `src/wildlife/species.js` (where it lives, when
it's about, how it takes to people), a body in `mammals.js` or `birds.js`,
and if it has a voice, a `defineCall`. Four-legged mammals need nothing else.

**A key** is `game.commands.add({ id, keys: ['KeyB'], group: 'LOOK', label:
'…', run })`, from the feature that owns what it does. The help panel is
written from the same list, and two features wanting one key are warned about.
Something you set once and leave doesn't need a key: it's a switch or a
slider on the settings panel, `game.hud.setting({ id, group, label, get, set })`.

### Checking it still works

```bash
npm test             # in Node, a second or so
npm run smoke        # a play-through in a headless browser, four or five minutes
npm run together     # two visitors in one world (run `npm run serve` first)
```

`npm run together` puts a world on the server as one visitor, then has a
second pick a name at the door, build alongside, talk to the first (on the
radio from anywhere, aloud only from close by, with a fake microphone), see
the first ride by on a horse and fly over on an eagle, and come back from a
third browser by signing in — and checks that each finds their own things,
not the other's.

`npm test` pins the things other people's worlds depend on — that a seed
grows the same land, on each land (`test/golden/`), that a save is spelled as it always was,
that what is already in someone's browser still opens — along with the rules
of building and the game loop. If one of the golden files stops matching, the
code changed something it shouldn't have; only re-record
(`UPDATE_GOLDEN=1 npm test`) when the change is meant.

`npm run smoke` plays the game in a headless browser, a part at a time. The
parts are the files in `test/smoke/`, played in the order of their names,
each named for what it plays (`10-build.mjs`, `20-fires.mjs`,
`80-mounts.mjs`), in one world from start to finish: it gathers and builds a
cabin by hand, and everything after goes on from there. A feature's part is
a file of its own, so adding to the play-through doesn't mean editing anyone
else's; the top of `test/smoke.mjs` says what a part is handed and how to
pick its number. `node test/smoke.mjs build fires` plays only those. It
drives the keys and the crosshair and reads results through `window.world`,
so it doesn't care how the insides are arranged. The last two need
[Playwright](https://playwright.dev) (`npm i -D playwright && npx playwright
install chromium`).

## Layout

```
src/
  main.js                 which world to open, finding the features, the opening
  config.js               tunables (+ URL overrides): the only reader of the address bar
  noise.js                seeded simplex noise, hashing, helpers
  core/
    events.js             Emitter: on / emit, in place of single callback slots
    storage.js            this browser's memory, and every key kept in it
    geom.js               plan-view geometry, a ray against a box, and chance that several systems share
    format.js             how numbers are written for people
  game/
    game.js               the Game: what features share, and the frame's phases
    features.js           which folders are features, and the order they install in
    commands.js           keys and what they do; the help panel is written from it
    settings.js           the visitor's preferences
    debug.js              stats (V) and the console helpers
  <a feature>/            one folder each
    README.md             what it is and how it works, and what each file in it is
    index.js              what plugs it into the game, and which features it comes after
tools/
  hike.mjs                npm run hike: a photo → a hike in the world
  hike/                   reading photos (EXIF), elevation tiles, OpenStreetMap; building one
worker/
  index.js                the front door: mint an id, route to the world
  world.js                a world's Durable Object — the only writer, and who is who
  members.js              passwords kept as hashes, sign-ins as cookies
  ice.js                  how browsers reach each other to talk: STUN, and TURN if set up
test/
  *.test.js               npm test: world generation, water, saving, building, the game loop
  golden/                 recorded answers the code has to keep giving
  smoke.mjs               npm run smoke: a play-through in a headless browser
  smoke/                  the parts it plays, a file for each feature
  together.mjs            npm run together: two visitors, one world
```

Inside a world's own SQLite:

```
world      seed, name, generation
elements   (region, key) -> value          the world itself
ops        recent changes, for catching up after a blip
copies     whole copies, kept now and then
packed     the elements gzipped, until they next change
members    name, password hash, their own state
sessions   sign-ins: a token's SHA-256 -> who
```
