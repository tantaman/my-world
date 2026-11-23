# Your pack

There is more to do out here than there are keys to do it with. So everything
you can do is in one place too, with everything you have: your pack.

| | |
|---|---|
| **Tab** | open your pack · again, or **Esc**, to close it |
| **↑ ↓**, then **Enter** · or click | go from one thing to the next, and do it |
| on a pad | **L3** opens it, the d-pad goes down the list, **A** does one, **B** closes it |
| with a mouse or a finger | the line at the top that says what you carry is marked *pack*: press it |

It is a list of everything there is to do, each in its picture, with its key
beside it as a key cap if it has one, and each a button that does what the
key would. What is **at hand** comes first, big: the things that have
something to do right here, named for what they would do and pictured as
what they'd be done to. Stand beside a canoe and *get in* heads the list,
with the canoe; beside a river, *float*, with your tube; with roast meat on
you, *eat*; at the jetpack's rack, *strap on*. The rest follow under the same
headings as the help panel (**H**), each with what it is in a line and the
rest of what it does under it. Picking one that has nothing to do here does
what its key would, which is usually to tell you where it could be done.

Between what is at hand and the rest is what's **yours**, laid out side by
side, each in its picture: how much you carry of each material (logs, timber,
stone, soil, and fish or meat while you have some; greyed while you have
none), and whatever else you have come by, with how it stands: the jetpack
on your back, the horse you tamed and how far off it is and which way, the
tapes you have out from the video store and the day they're due. It is to
look at, not slots to fill: nothing has a weight, and you can't run out of
room. What everyone always has (the axe, the skis, the inner tube) isn't in
it; those are things to do, and are in the list below.

The world carries on behind the pack while it's open, and the lists keep up
with it.

**On a touch screen** there are no keys, so whatever is at hand also has a
round button of its own over the *use* and *alt* buttons, its picture over
the word for what it would do, there for as long as it would do it. Hold it
where the key would be held (to calm a wild horse).

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
  icon: pictures.ROAST,
  run: eat,
  now: () => (roasted > 0 ? 'eat' : ''),
});
```

A row shows its label as what it is, up to the first `: ` or ` · `, and the
rest under it (*map* · *mark places · where to go*), so a label that starts
with what the thing is reads best.

Getting into something, onto it, and out or off again is the act key's
(**F**: [Acting](../act/README.md)), which is at hand named for whatever it
would do, in the picture its offer gives (`icon` in what `at()` returns); a
feature offers it that rather than a command of its own.

A command needs no key at all. With a label and no `keys` it is done from
the pack (and, at hand, from its button on a touch screen), and has no line
on the help panel. That is how a new feature gets something done without
finding a free letter: there are none left.

**Something to have** is said by the feature that gives it to you (which
names `pack` in its `after`, as for anything it takes from the game), as a
function that returns what you have of it now:

```js
game.pack.have(() => (worn ? [{ label: 'a jetpack', note: 'on your back', icon: pictures.JETPACK }] : null));
```

The pack keeps nothing of it and saves nothing: the feature goes on keeping
and saving what is yours, as it did, and the pack asks when it is looked
into. A new material needs nothing here but its picture: what you carry is
read off the builder's stock (`game.builder.stock.define({ id, label, icon })`).

From the console: `world.pack.open()`, `world.pack.list()` (what is at hand,
what's yours, and the rest), `world.pack.do('tube')`.

## Drawing for it

Everything in the pack is drawn in pixel art, in code, by the feature it is
from: a `pictures.js` in its folder, beside what it does, imported as
`import * as pictures from './pictures.js'`. A picture is a string, one
letter a pixel, 16 by 16:

```js
// A dugout canoe.
export const CANOE = `
  ................
  ................
  ................
  ................
  .t............t.
  .wt..........tw.
  .wwtttTTTTtttww.
  ..wwwwwwwwwwww..
  ...WWWWWWWWWW...
  .....WWWWWW.....
  .CCCCCCCCCCCCCC.
  ................
  ................
  ................
  ................
  ................
`;
```

`.` is nothing; every other letter is one of the pack's colours (`PALETTE` in
`picture.js`), lower case the colour and upper case its shade:

| | | | |
|---|---|---|---|
| `w` `W` wood | `t` `T` tan: timber, sand, skin, paper | `e` `E` earth, leather | `s` `S` stone |
| `m` `M` metal | `k` `K` iron, rubber | `g` `G` green | `b` `B` blue |
| `c` `C` teal | `r` `R` red | `o` `O` orange | `y` `Y` gold |
| `p` `P` meat | `v` `V` violet | `l` `L` light | `#` the outline's dark |

There are no others, so that what each feature draws looks as if it came out
of the same pack. The dark outline round the outside is drawn for you: leave
a pixel clear round the edge for it. Draw what the thing is, filling most of
the square, from the side it is best known by, and look at it at the size
the pack draws it (twice, and three times at hand) before keeping it.
`npm test` checks every `pictures.js` reads; the play-through checks that
nothing in the list is without one.

## Files

```
index.js      plugs it into the game: Tab, the handle on what you carry, the frame
book.js       the list, laid out: what is at hand, then the rest under their headings; what a row says
things.js     what's yours: who says so, and the materials you carry
picture.js    pixel art in the pack's colours: read, outlined, drawn
pictures.js   the pack's own pictures, and what stands in for one something hasn't
panel.js      the pack on the screen
buttons.js    the buttons for what is at hand, on a touch screen
pack.css      how those look
```

Its rules are in `test/pack.test.js` (and the commands' own, `now`, `press`
and `offers`, in `test/game.test.js`); its part of the play-through is
`test/smoke/45-pack.mjs`.
