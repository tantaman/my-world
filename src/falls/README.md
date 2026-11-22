# Waterfalls

Where a [hike](../hikes/README.md)'s map marks a waterfall on its stream,
the water falls there: white water pouring off the lip, holding together at
the top and coming apart in strands lower down, with the creek's own colour
in it; mist rising off the pool at the foot and drifting off downstream; and
the roar of it, deeper and louder the further it drops, heard from where the
water lands. Not every fall is a cliff: where the water spills down a run of
travertine steps (Navajo Falls, Rock Falls), it's a cascade, white water
poured down the slope with more hiss than roar.

The drop itself is the land's. The real ground is the cliff, in the real
heights the hike was imported with, and the stream's water comes down it
because water never runs uphill. So a fall is as high as it really is, and
it's where the cliff really is, within a few metres of where the map puts
it. On Havasu Creek, from Supai down: Fiftyfoot Falls 17 m, Little Navajo
Falls 9, Navajo Falls 10 (a cascade, as the lidar has it where the map puts
it), Rock Falls 5 (a cascade), Havasu Falls 28 (the map says 28), Mooney
Falls 55, and Beaver Falls, a staircase of travertine whose tallest step is
5.

Each fall is a place on [the map](../map/README.md), by name, with its
height, to look up and track like any other.

There are no keys.

From the console: `world.falls.list()`.

## Files

```
index.js              plugs it into the game: each fall drawn once its hike's land is here, on the map, heard
falls.js              where a fall drops, from the land: the lip, the foot, which way, how far, and the water's shape
look.js               the falling water, and the mist at its foot
sound.js              the roar of the nearest falls
```
