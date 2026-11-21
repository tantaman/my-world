# Airports

The hikes lie where they really are (see [Hikes](../hikes/README.md)), so the
world is as wide as the Earth: Maui is 835 km from where you start, Zion 296,
the Alps nearly 2,000. So there's an airfield a walk from where you first
arrive, and one a few kilometres from each part of the world where there are
hikes, and a little plane that flies from any of them to any other.

| | |
|---|---|
| **P**, or **M** then *flights* | where to fly from here, beside the map: pick one (click, or its number) |
| **P**, flying over the clouds | sleep through the rest of it |

**An airfield** is a bush strip: 240 m of asphalt with white edges, a dashed
centre line, threshold bars and its number at each end (the way it points: 09
for due east), lights down both sides that come on after dark, and green ones
across the ends. Beside its middle is a concrete apron where the plane stands,
with a board terminal along the back (a porch, a bench, a departures board,
windows lit at night), a timber tower with a glass cab and a beacon that
flashes green and white after dark, a round-roofed hangar, a fuel tank on its
cradle, and a windsock that swings downwind and droops in a calm. The plane
is a little high-winged airliner: two engines with three-bladed propellers
under the wing, fixed wheels, a tall red fin, and a door on the left that
folds down into a flight of steps.

**Getting there.** Press **P** (or open the map and its *flights* tab)
anywhere, and it offers the airfield for this part of the world: pick it and
you're on its apron, looking at the plane. The airfields are on the map too,
as places you can track and walk to, and from the one you're near, dashed
lines run off toward the others.

**Flying.** At an airfield, **P** lists the others: where each is (which hikes
it's for, or where you started), how far it really is and which way, and about
how long the trip takes. Pick one and you're aboard. The door folds up, the
engines start, and it taxis out, back down the strip to the far end, turns,
runs up and takes off, into the wind where it can. It climbs straight out
over the end of the strip, up into a layer of cloud, turns onto its course
inside it, and comes out over the top: a sea of cloud in the sun, going by
underneath. **P** there and you nod off. Then it sinks back into the cloud,
and while there's nothing to see but white, you're carried across the world
to the other airfield and wait there in the cloud until the land below has
grown. It comes down out of the cloud on a steep approach over the trees,
lands, rolls out, taxis in to the apron and the engines stop; the door comes
down and you step out beside it. A flight is two and a half minutes or so,
door to door. Close the game on one and you open at the other end, beside the
plane.

The camera hangs back behind the plane while you fly, and swings round
behind it if you leave it alone; your tools are put away. In a shared world
the others are told you're flying, and don't see you standing about in the
sky.

**Where the airfields are** is grown from the seed and the land, like the old
places, the railway and the launch site (`airports.js`). One is for home,
round the start; then each hike, in the order they were brought in, has one of
its own unless it's within 60 km of a part of the world that has one already,
in which case that's its airfield too. So the four hikes on Maui share one,
and Tignes and the Vallée Blanche another, and bringing in a hike never moves
an airfield that was there. Each is looked for in a ring round its part of the
world (out past a hike's reach, so the land there is the forest's own), and
goes where the ground will take the strip with the least bank under it: dry,
with clear air off at least one end to climb out and come in over, a little
nearer winning over a little flatter, and clear of everything that was there
first, the real land of the hikes, the old places, towns, the mouths of caves,
the railway and the launch site. Where there's nowhere in the ring (the
oldest land is all rolling hills) it looks further out.

**Nothing about the land changes for it.** The strip's top is a smooth line
along it, never under the ground, never steeper than 6 % and with no sharp
crest or dip; where that's over the ground, the strip and the apron are on a
bank of earth whose grassed sides run down to wherever they meet the
hillside. The trees, bushes and stones in its way are hidden as their chunk
grows, grass doesn't grow on it, and building goes round it. An airfield that
would lie where an old save already has something built isn't there. Where
they are is pinned in `test/golden/airports-*.json`, since each can be
tracked by its id.

**The cloud** is the country's layer of cloud (`country.cloud`), laid over
everything while you fly: it comes over as you climb out, lies under you
while you're over it, its billows going by as fast as the plane would, and
thins away as you come down out of it. Over the clouds the plane itself
stays where it is: the same thing, from the plane, as flying over them, and
nothing below has to grow on the way.

**How it sounds.** Two propellers' buzz, a little out of step with each other
so they beat, deep idling and rising to a snarl at full power, a thin turbine
whine over it, the exhaust's roar, and the air rushing past; a chime in the
cabin as you board and as the engines stop, the door, and the tyres chirping
as they touch down. The strip and the apron are tarmac underfoot. Planes have
a bus of their own: `world.sound.volume('planes', 0.5)`.

From the console:

```js
world.airports.list(true)           // the airfields, found now, nearest first
await world.airports.go()           // onto the apron of the airfield for where you are
world.airports.fly('waihee-ridge')  // fly from the one you're at to another (by its id, or its region's)
world.airports.hurry()              // skip on to the end of this part of the flight
world.airports.trip                 // where you're flying, and how far through it
world.airports.steps()              // the foot of the plane's steps, at the airfield you're at
```

## Files

```
index.js              plugs it into the game: P and the flights tab, flying, the cloud, the map, what's kept clear
airports.js           which parts of the world have one, and where each is, grown from the seed: the strip's line and bank
airfield.js           the strip, its paint and lights, the apron, the banks, terminal, tower, hangar, tank and windsock
plane.js              the plane: hull, wing, engines and propellers, wheels, the door and its steps, its lights
flight.js             a flight over time: taxiing, the take-off, the climb, over the clouds, carried across, the landing
sound.js              the engines, the air, the chime, the door, the tyres; tarmac underfoot
panel.js              where to fly from here (a tab beside the map)
onMap.js              the routes between the airfields, and your plane on yours
airports.css          the flights tab's look, and the white of the cloud
```
