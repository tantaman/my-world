# The far view

How you see further than the forest.

The world is streamed in around you a couple of hundred metres at a time, and
the air thickens just short of where it stops, so you never see an edge. Among
trees that is all you would see anyway. On a mountain it is the wrong answer:
the point of the climb is what is laid out below.

So past the streamed-in forest the land is drawn once more, coarsely — one
mesh to a square, no trees standing on it but the dark crowns of the woods
raised over the ground, meadows, bare rock on the steeps, snow on the tops,
and water that mirrors the sky. Where the real chunks are it sinks out of
sight beneath them (the further where the land falls away steeply between
its points, as down the walls of a canyon), so close to you it is the real
ground and the real trees you see, and the far land only shows past their
edge. As far as there is land
drawn in every direction, the air clears: climb a massif and the haze opens
out with you.

You never ask for it. Whoever has something worth seeing does: the forest,
where it stands high enough to be worth it ([the world](../world/README.md)),
and a hike, for the real place you are standing on
([hikes](../hikes/README.md)). Nothing is drawn further off than a kilometre,
whatever asks: past that the picture can no longer tell land from sky, so the
haze has closed in by then regardless.

Land that is really there is what gets drawn. A real place's land is fetched
from the network when it is first needed, so a square waiting on one is held
back until it arrives, rather than drawn as the forest that is about to be
replaced.

From the console:

```js
world.far.list()    // what is drawn, what is being sampled, what is waited for
world.far.reach()   // how far the land is drawn from where you stand (m)
```

## Files

```
index.js   plugs it into the game: who asked for what, the worker, and how far the air is clear
view.js    the meshes: one to a square, coloured as the forest looks from a long way off
grid.js    sampling a square of land, coarsely and purely, so a worker can do it
worker.js  doing that off the main thread, in a world of its own grown from the same seed
```
