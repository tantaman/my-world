# Mounts

Three animals in every world will carry you, each its own way:

| | where it lives | how it carries you |
|---|---|---|
| **a wild horse** | the widest meadow within a long walk of the start | trots, gallops (**shift**) at 11 m/s and jumps (**space**) more than a metre; swims, slowly |
| **a great snapping turtle** | a lake, or a good big pond | crawls on land, hardly faster than a snail, and swims at 5 m/s, or 8 with **shift**, against any current |
| **a great golden eagle** | a high, bare summit, a good way off | flies: **space** takes off and climbs, **shift** stoops (fast and down), let go of both to glide; **Z** in the air comes in to land |

**Finding one.** You start knowing nothing. A little while in, word comes of
the nearest (*a wild horse has been seen grazing in a big meadow, about 250 m
to the north-west*), and the map (**M**) shows a circle to look in. Now and
then you hear it from afar, from the way it really is. Walk into the circle
and you find signs of it (hoofprints, a track through the mud, a feather
longer than your arm), and the map narrows it down. See it, and it's on the
map where it is. Word of the next comes once you've won the first over, or
after a few minutes anyway. If you're impatient, **Z** with no mount of your
own says where to look.

**Winning one over.** A wild one watches you come. Run at it and it's off (a
horse gallops away across its meadow, a turtle makes for the deep water, an
eagle takes to the air and circles until it settles again). Walk up to it
quietly instead, and when you're beside it **hold Z**: the hiker holds out a
hand, and while you stand still with it the animal comes to trust you (the
bar above the tool bar). Let go and it slowly forgets; rush it and you start
again. When it trusts you, it's yours.

**Riding.** Beside your own, **Z** climbs on and **Z** gets off. You steer
with the movement keys as you walk, and your tools are put away while you
ride. Leave it anywhere: it waits there, grazing, basking or perched. From
anywhere else, **Z** whistles for it, and it comes (from out of sight, if it
has to: a horse at a gallop, an eagle down out of the sky, a turtle up out of
the nearest water, which it needs to reach you). Tame more than one, and **Z**
again just after a whistle calls the next instead.

Where they live is grown from the seed like everything else
(`src/mounts/haunts.js`), so the hints point at the same places on every
visit, and everyone in a shared world goes looking in the same meadow. Which
ones are yours, where you left them and what you've heard of the others is
yours, not the world's: in a shared world each person finds and tames their
own, as they meet their own wildlife. From the console:

```js
world.mounts.list()          // where they are, what they're doing, how far they trust you
world.mounts.tame('eagle')   // skip the finding and the taming: it's yours, beside you
world.mounts.ride('eagle')
```

## Files

```
index.js              plugs it into the game: Z, riding, what you've heard, on the map, saved as yours
haunts.js             where each lives, grown from the seed; the circles on the map
hints.js              what you know of where they are, and when you hear more
taming.js             winning a wild one over
kinds.js              horse, turtle, eagle: temperaments, how each carries you, words
mount.js              one mount: wild at its haunt, tame and waiting or called, ridden
bodies.js             what they look like and how they move
onMap.js              how they show on the map
sound.js              whinny, plunge, scream, wingbeat; your whistle
others.js             what other people here are riding
```
