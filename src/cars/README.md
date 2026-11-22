# Cars

Most of the western towns and villages that a road comes to (see
[Roads](../roads/README.md)) have a car dealership just out of town along
it: a tarmac lot fronting the road, strung with bunting, with a glass-fronted
showroom at the back and its name in red letters over the glass
(*Pruitt Motors*, *Hollis & Sons Motors*), and a tall sign by the road. One
of each car it sells stands out on the lot, angled to the road, and a
salesperson waits among them who says hello as you walk up.

| | |
|---|---|
| **Wren** | a little hatchback: nimble, thrifty, and happiest on tarmac |
| **Meridian** | a roomy saloon, the fastest on the open road |
| **Ridgeback** | a pickup with a bed for logs, and the legs for a forest track |
| **Bramble** | a square-rigged four-by-four: slow on the road, and goes almost anywhere off it |

**Buying one.** Walk up beside a car on the lot and **click**: it's yours,
on a handshake (there's no money in the forest), and you're in the driving
seat. You have one car at a time: buy another and the dealer takes the old
one off your hands.

**Driving.** **W** to go, **S** to brake, and held at a standstill to back
up; **A** and **D** steer, and **space** sounds the horn. On a game
controller, the left stick drives and steers. The camera swings round behind
you as you go and hangs back further the faster you drive, and your tools
are put away. It's quickest on tarmac, a little slower on gravel and the
towns' streets, and off the road it goes only as fast as it can take the
rough (the Bramble much faster than the Meridian), climbs only so steep a
slope before it rolls back, and won't drive into water deeper than it can
wade. It stops dead against a tree, a boulder or a wall. After dark its
headlights light the road ahead.

**Leaving it.** Stopped, **click** to get out beside the driver's door. It
waits wherever you left it, and you can walk up and **click** beside it to
get back in. It's on the map as *your car* (and under *car dealerships* in its
routes), and `go here` on it puts you beside its door.
Taken somewhere else all at once (back to the start, say), you're out of it
and it stays where it was. Close the game while you're driving and you open
in it again.

**Where the dealerships are** is grown from the seed and the land, like the
video store's branches (`dealers.js`): which towns have one is from the seed
and the town (a western town or a village, not a ghost town, an abandoned
village or an eerie town), and where is the flattest dry ground along one of its roads,
from a little way out of town to a few hundred metres on, its lot's front a
metre from the edge of the road, clear of everything the roads keep clear of,
the roads themselves and the towns. They're on the map with a little car on
their badge, and under *car dealerships* in its routes, nearest first, for as
far out as you scroll. **Nothing about the land changes for them**: the lot is
a slab set on the ground as it is, its sides sloping down to it; the trees,
bushes and stones on it are hidden, grass doesn't grow on it, and building
goes round it.

Which car is yours, its colour, where you left it, whether you're in it and
which dealerships you've been to are yours, saved. In a shared world the
others see you drive by in yours.

From the console:

```js
world.cars.list()             // the dealerships found round you, nearest first
await world.cars.go()         // onto the lot of the nearest dealership (or one by its id)
world.cars.buy('bramble')     // the car of that kind on the lot you're at: yours, and you're in it
world.cars.mine               // your car: what it is, where, and whether you're in it
world.cars.getOut() · getIn() · toDoor()
world.cars.car                // the physics: speed (v), what's under it, revs
```

## Files

```
index.js              plugs it into the game: the dealership you're near, buying, getting in and out, driving, saving, the map, others in their cars
kinds.js              the cars, in a table: names, sizes, how each drives, colours, engines
drive.js              a car on the land: engine, brakes, steering, the ground under each wheel, what it runs into
models.js             what a car looks like: its body pressed out from its side view, wheels that turn and steer, lamps
dealers.js            where the dealerships are, grown from the seed beside a town's road
lot.js                what a dealership looks like: the lot, the showroom, the bunting, the sign
sound.js              the engine, the tyres, the door, the starter, the horn, a bump, a splash
```
