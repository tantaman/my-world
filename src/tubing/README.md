# Tubing

An inner tube in your pack, for floating down a river for as long as you
like.

Stand at the edge of a stream or a river (or in it) and press **F**: you
toss the tube onto the water and drop into it, legs over the front and arms
out over the sides. From there the river does the work. It carries you at
its own pace, which is slow and easy on the long pools and quicker down the
riffles and the little cascades, where you drop off the lip with a splash and
bob up in the pool below. It keeps you off the banks, and round the boulders
standing in the stream, though you'll knock into one now and then and spin
away off it. When the river runs into a lake, you drift across the still
water to where it runs out again, and on down.

| | |
|---|---|
| **F** | beside water deep enough: pull out your tube and get in · in it: get out (the act key, as for everything you get into: see [Acting](../act/README.md)) |
| **V** | where the nearest river to float down is |
| **W A S D** | paddle with your hands, the way the camera faces |
| **shift** | paddle hard |

On a game controller, **Y** is F, and clicking the right stick is **V**.

**Paddling.** Your hands only go so fast, but the river is slow too, so a
little paddling hurries you along nicely; it's also how you make for a bank
to get out, or push off when you've run aground in the shallows. The camera
swings round behind the way you're going, and round the bends with you,
unless you're looking about.

**Getting out.** **F** climbs out onto the nearest bank, or into shallows
you can stand in. Out in deep water with no bank in reach, paddle over to one, or
press it twice to slip out into the water and swim. You're told how far you
floated and how long it took; your longest float in each world is kept.

**How much river is left.** While you float, how fast you're going, how far
you've come and how much river there is still to go before it ends are bottom
left, above the coordinates. Every river ends somewhere: in a lake that keeps
its water, or out in the sea. When you get there you're told so, and where the
nearest river is that runs on somewhere else, and the way to it is shown under
the coordinates.

**Finding a river.** Press **V** away from the water and you're told where the
nearest stream or river big enough to float down is, and how far it runs from
there, and the way to it is shown under the coordinates. Most run a few
hundred metres before they end; the longest run on for a kilometre or two.
Walk beside a stream you could float down, and the prompt says so.

**Fishing.** The fishing rod works from the tube as it does from a boat (see
[Fishing](../fishing/README.md)): take it up, and you drift and fish with your
hands off the water. Put it down to paddle again.

**With other people.** In a shared world, everyone here sees you go by in
your tube, and you see them in theirs. Nobody's tube is left lying about:
yours goes back in your pack when you get out.

From the console:

```js
world.tubing.in()       // into it, at the water beside you
world.tubing.out()      // out onto the bank (or, asked twice, into the water)
world.tubing.state()    // how it's going: how fast, how far, how much river is left
world.tubing.river()    // the nearest river to float down: { x, z, far, river, d }
```

## Files

```
index.js              plugs it into the game: in and out, moving you, sitting you in it, the prompt and readout, saving
tube.js               how it floats: the current, lakes, shallows and banks, boulders, the surface, turning
course.js             where the water goes, from the drainage network: out of a lake, how far a river runs, the nearest
model.js              the tube: black rubber, sun-faded on top, a valve and a patch
sound.js              water slapping the rubber; getting in, hand strokes, bumps, drops, getting out
others.js             other people here in theirs
tubing.css            the readout
```
