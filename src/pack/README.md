# Your pack

There is more to do out here than there are keys to do it with. So everything
you can do is in one place too, with everything you have: your pack.

| | |
|---|---|
| **Tab** | open your pack · again, or **Esc**, to close it |
| **↑ ↓**, then **Enter** · or click | go from one thing to the next, and do it |
| on a pad | **L3** opens it, the d-pad goes down the list, **A** does one, **B** closes it |
| with a mouse or a finger | the line at the top that says what you carry is marked *pack*: press it |

It is a list of everything there is to do, each with its key beside it if it
has one, and each a button that does what the key would. What is **at hand**
comes first: the things that have something to do right here, named for what
they would do. Stand beside a canoe and *get in* heads the list; beside a
river, *float*; with roast meat on you, *eat*; at the jetpack's rack, *strap
on*. The rest follow under the same headings as the help panel (**H**).
Picking one that has nothing to do here does what its key would, which is
usually to tell you where it could be done.

Between what is at hand and the rest is what's **yours**: how much you carry
of each material (logs, timber, stone, soil, and fish or meat while you have
some), and whatever else you have come by, with how it stands: the jetpack
on your back, the horse you tamed and how far off it is and which way, the
tapes you have out from the video store and the day they're due. It is a list
to look at, not slots to fill: nothing has a weight, and you can't run out of
room. What everyone always has (the axe, the skis, the inner tube) isn't in
it; those are things to do, and are in the list below.

The world carries on behind the pack while it's open, and the lists keep up
with it.

**On a touch screen** there are no keys, so whatever is at hand also has a
round button of its own over the *use* and *alt* buttons, named for what it
would do, there for as long as it would do it. Hold it where the key would
be held (to calm a wild horse).

**On a pad** there are buttons for only some things. When something at hand
has none, a line in the corner says so beside the pack's own button
(*L3 · eat*): open the pack, and it is the first thing in it.

## Putting something in it

Nothing here lists what is in the pack: it reads the keys the features bind
(`src/game/commands.js`). A command with a `label` is in it. One that says
what it would do `now` is at hand while that gives a word:

```js
commands.add({
  id: 'eat', keys: ['KeyU'], group: 'HUNT',
  label: "eat something you've roasted",
  run: eat,
  now: () => (roasted > 0 ? 'eat' : ''),
});
```

Getting into something, onto it, and out or off again is the act key's
(**F**: [Acting](../act/README.md)), which is at hand named for whatever it
would do; a feature offers it that rather than a command of its own.

A command needs no key at all. With a label and no `keys` it is done from
the pack (and, at hand, from its button on a touch screen), and has no line
on the help panel. That is how a new feature gets something done without
finding a free letter: there are none left.

**Something to have** is said by the feature that gives it to you (which
names `pack` in its `after`, as for anything it takes from the game), as a
function that returns what you have of it now:

```js
game.pack.have(() => (worn ? [{ label: 'a jetpack', note: 'on your back' }] : null));
```

The pack keeps nothing of it and saves nothing: the feature goes on keeping
and saving what is yours, as it did, and the pack asks when it is looked
into. A new material (`game.builder.stock.define`) needs nothing here: what
you carry is read off the builder's stock.

From the console: `world.pack.open()`, `world.pack.list()` (what is at hand,
what's yours, and the rest), `world.pack.do('tube')`.

## Files

```
index.js      plugs it into the game: Tab, the handle on what you carry, the frame
book.js       the list, laid out: what is at hand, then the rest under their headings
things.js     what's yours: who says so, and the materials you carry
panel.js      the pack on the screen
buttons.js    the buttons for what is at hand, on a touch screen
pack.css      how those look
```

Its rules are in `test/pack.test.js` (and the commands' own, `now`, `press`
and `offers`, in `test/game.test.js`); its part of the play-through is
`test/smoke/45-pack.mjs`.
