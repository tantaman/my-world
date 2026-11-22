# Gliding

A hang glider, for coming down from a long way up. Fly your eagle up high
(see [Mounts](../mounts/README.md)) and press **F**: you let go of it, and
your glider opens over you. You drop for a moment while the sail fills, then
it takes your weight and you're flying, lying flat under the wing with your
hands on the bar. The eagle flies on, peels off, and comes down to wait for
you somewhere ahead.

| | |
|---|---|
| **A D** | shift your weight: bank and turn (more tightly the slower you go) |
| **W** | pull the bar in: faster, and down more steeply |
| **S** | push the bar out: slower, and flatter, nearly to a stall |
| **shift** | pull it right in: a dive |
| **Z** | whistle for your eagle: it swoops in under you and catches you, and you're flying it again |

On a game controller the left stick does what **W A S D** do, **B** is shift
and **X** is Z.

**How it flies.** It only ever goes down: there's no rising air here. Hands
off it trims at about 40 km/h and sinks about a metre a second, which is
about its best: from 90 m up you can cover the best part of a kilometre. Go
faster or slower and you sink faster; bank steeply and you sink faster still.
Speed is height: a dive costs you some, and pulling out of it gives a little
back. How high you are, how fast you're going and how fast you're coming down
are bottom left, above the coordinates.

**Coming down.** Near the ground you swing upright and push out to come in
slowly, and if you've let go of **W** and shift you land on your feet and
run it out. Come in flat out and you go sprawling. Fly low into the trees, a
boulder or a wall and that's where you come down too, beside it. Into a lake
and you're swimming. Either way the glider folds up, and you're told how far
you flew.

**With other people.** In a shared world, everyone here sees you go over on
your glider, as high as you are and banking as you bank.

From the console:

```js
world.gliding.open()     // open it where you are (best from high up)
world.gliding.state()    // how it's flying: height, speed, sink, bank
```

## Files

```
index.js              plugs it into the game: moving you, hanging you under it, the prompt and the readout, telling the others
glider.js             how it flies: opening, banking, the bar, the sink and its polar, coming down
pilot.js              how you hang under it: upright or lying flat, rolling as it banks
wing.js               what it looks like: the sail, the frame, the A-frame and its bar
sound.js              the air going past, the wires, the sail luffing; opening, running it out, crashing
others.js             other people here on theirs
gliding.css           the readout
```
