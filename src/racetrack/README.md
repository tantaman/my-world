# Race tracks

Some of the towns people live in have a race track out past their last
houses: a **dirt oval** (or a tri-oval, with a dog-leg in its front
straight) by a western town, a **road circuit** by a village, with a long
main straight, sweeping bends, an S-bend, a kink or a hairpin. Each is named
for its town (*Broken Gulch Speedway*, *Meadowfield Circuit*, *Cherryby
Raceway*), and is on the map with a chequered flag on its badge and its lap
drawn in at every zoom. Pick it and press **go here**, and you're set down at
the paddock gate, between the pits and the grandstand, looking out at the
grid; they're listed under *race tracks* in the map's routes, nearest first,
for as far out as you scroll.

**Your car** waits on the pit apron in front of the garages: an open-wheeler
on a road circuit, a winged sprint car on dirt, red, with a 1 on its sides.
Walk up to it and **click**, and you're in it at the back of the grid, with
five others in front of you. Five red lights come on over the line, one a
second. A moment after the last, they all go out, and you're racing: three
laps, and whoever's over the line first after the third wins.

| | |
|---|---|
| **click** by your car | get in and race |
| **W** · **S** | throttle · brake, and back up once you've stopped |
| **A D** | steer |
| **space** | the handbrake: the back steps out, to slide it round a tight bend |
| **right-click**, stopped | get out |
| **click**, stopped, after a race | race again |
| on a pad | the left stick steers, **RT** throttle, **LT** brake |

**Driving it.** It takes a while to get up to speed, and longer to come
down from it. The faster you go, the less the wheel turns it, and the
tyres hold only so hard: go into a bend too fast and it runs wide, onto the
kerbs (they rumble) and the grass (it bogs down there), and into the
barrier, which stops you hard and bounces you off. Dirt holds less than
asphalt, so on an oval you slide. Over a crest fast enough, the car leaves
the ground. The camera swings round behind the way you're going unless
you're looking about.

**The others** each drive the racing line, out wide into a bend and in to
the apex, at a pace of their own, braking in time for each bend and pulling
out of it as hard as the car will. One that comes up behind someone slower,
you or another, pulls out to pass if there's room, and waits if there
isn't; getting by one of them is up to you. Bump wheels and you both get a
shove.

While you race, the card at the top of the screen has the lights, then the
lap you're on, where you're running, the race's time and your last lap; your
speed and gear are bottom left, and a little map of the circuit, turned the
way you're going, is top right, with a dot for each car. At the end it says
where everyone came, and their times. The crowd in the grandstand roars at
the start and at the finish.

Your best lap at each track, how many races you've run to the end and how
many you've won, and which tracks you've been to, are yours, saved (and in
[your pack](../pack/README.md): *races won*). In a world you share, the
others see you sat in your car as you drive; the five you race against are
yours alone.

**Where they are** is grown from the seed and the land, like the video
store's branches (`site.js`): four in five of the western towns and the
villages people live in may have one, and where it can go is looked for in
rings round the town, inside the town's own square, its paddock towards the
town. It needs ground it can lie on, not too steep along the lap and not too
far to bank up over the dips, clear of rivers, lakes and the sea (a stream
can run under it, through a culvert), and it keeps clear of real places
brought in from a photo, towns, the video stores, the launch sites, the
airfields, the abandoned buildings and the ring round the start where the
hunt club is; the old places, the mouths of caves and the railway keep off
its grounds (an old cabin may be left standing in its infield). A town
whose land won't take one has none. Everyone in a world finds them in the
same places.

**Nothing about the land changes for them.** The racing surface is laid
over the ground as it is, a little over the highest of it across the
surface, leaning as the land leans (a camber, banked a little at most) and
rising and falling with it along the lap, evened out; where the land dips
it stands on a bank of earth. The run-off, the infield and everything past
the barrier is the ground itself. The trees, bushes and stones on its
grounds are hidden as it comes into view, grass doesn't grow on the racing
surface or the paddock, and building goes round it.

From the console:

```js
world.racetrack.tracks              // the tracks: forTown(town), byId(id), within(x0, z0, x1, z1)
world.racetrack.site                // the one stood up, or last near
await world.racetrack.go(id?)       // stand at its paddock gate (that one's, or the nearest found)
world.racetrack.toCar()             // stand by your car
world.racetrack.drive()             // into it, and the lights begin
world.racetrack.state()             // how the race is going
world.racetrack.out()               // out of it
```

## Files

```
index.js        plugs it in: where they are, on the map, the nearest stood up, driving, the race, saving
layouts.js      the circuits, and what a circuit is: the line round it, where along the lap a point is
site.js         where the tracks are, grown from the seed and the land, and how the surface lies on it
tracks.js       which towns have one and which circuit, and finding where, a little at a time
car.js          the car: throttle, brakes, steering, how hard the tyres hold, the barrier, crests
race.js         the race: the grid, the lights, laps and times, the others driving the racing line
look.js         the track: its surface, kerbs and banks, barrier, gantry and lights, grandstand, pits
model.js        the cars: an open-wheeler and a sprint car, wheels that steer and spin
board.js        the race on the screen: the card, the speed and gear, the little map
others.js       other people here, in their cars
sound.js        your engine and theirs, the tyres and the kerbs, the crowd, the lights, the barrier
racetrack.css   ...how the card, the gauge and the map look
```

Its rules are in `test/racetrack.test.js`, where the tracks it grows round
the start are pinned (`test/golden/racetrack-*.json`); its part of the
play-through is `test/smoke/89-racetrack.mjs`.
