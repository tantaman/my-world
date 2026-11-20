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
npm test             # unit and golden tests, in Node, ~1 s
npm run smoke        # builds, then a play-through in headless Chromium, ~4½ min
npm run serve        # built site + save server together on :8787
npm run together     # two visitors in one world; needs `npm run serve` running
```

Run `npm test` after any change. Run `npm run smoke` after touching anything
a player does (tools, movement, HUD, saving, sound, wildlife). Run
`npm run together` after touching `src/save/`, `src/voice/` or `worker/`.

## How to add things

A feature is a folder under `src/` whose `index.js` exports
`install<Name>(game)`, added to `FEATURES` in `src/main.js`. Put new
behaviour in a new feature, or in the feature that already owns it — not in
`main.js`, `game/game.js`, `build/builder.js`, `audio/soundscape.js` or
`save/worldSave.js`. Those are hosts; they should not learn about what plugs
into them. The table in the README lists what to call for a tool, a key, a
sound, something saved, an animal, and so on, and each of those files starts
with the contract.

- Only `index.js` files hold `game`. Other modules take what they need as
  arguments, so they can be tested alone.
- Bind keys with `game.commands.add`; the help panel is generated from it.
  Do not add key checks elsewhere or edit help text in `index.html`.
- Anything persistent goes through `game.save.register` and calls
  `game.save.touch()` when it changes. Do not use `localStorage` directly;
  keys live in `src/core/storage.js`.
- Read URL parameters only in `src/config.js`.
- To be heard, extend `Emitter` and `emit`; do not add `onSomething` slots.
- Import direction: `core` ← `render` ← `world` ← features. `world/` does
  not import from feature folders.

## What must not drift

- **World generation is part of the save format.** A save is only the diff
  from what a seed grows. `world/worldgen.js`, `chunkGen.js`, `water.js`,
  `drainage.js`, `noise.js` and the order of `world/flora.js` are pinned by
  `test/golden/`. If those tests fail, fix the code; do not re-record.
  The old places in `landmarks/` are grown from the seed too, and never
  change the land or the plants: they stand on it as it is. Where they are
  is pinned in `test/golden/landmarks-*.json`, because the places people
  have visited or are tracking are saved by id.
- **Element spelling is for good.** Keys and values in
  `test/golden/save-elements.json` are what is on the save server and in
  people's browsers. Add new element kinds; never change existing ones. The
  `localStorage` layouts in `test/local.test.js` likewise.
- Values put into or taken out of the element record must be copies
  (`own()` in `save/regions.js` does this for domains that go through the
  registry).

## Style

Comments say what a thing is and why, in plain words, at the top of the file
and above anything non-obvious. Tunable numbers get a name and a unit.
Scratch vectors are module-level `_v` to keep allocation out of the frame.
