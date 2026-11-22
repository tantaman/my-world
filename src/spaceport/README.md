# The launch site

A few hundred metres from where you first arrive, in a clearing of its own,
a rocket stands ready on a concrete pad: two white stages and a capsule on
top, a red lattice tower beside it with a walkway out to the hatch, a fuel
tank, a blockhouse, floodlights that come on after dark and a beacon blinking
on the tower. It's on the map as the *Skyhook launch site*, and **T** from
anywhere says how far it is and which way.

Walk up onto the pad and press **T** beside the rocket. Pick **Deep Space 9**
or **The Orrery** to board, or press **Esc** to stay on the pad.
After a five-second countdown the engine lights and the rocket
lifts off: you watch it go from the corner of the pad, then from below as it
climbs away, until the sky goes white.

## Deep Space 9

The rocket docks and you step onto the Promenade near Quark’s. The camera
follows your hiker. Walk with **W A S D**, hold **Shift** to run, turn the
view with the mouse and use the scroll wheel to adjust the camera distance.

Press **Enter** or click **View exterior** to see the docking ring, six curved
pylons and central Ops tower against the Bajoran wormhole. Move the mouse or
press **A/D** to circle the station. **W/S** and the scroll wheel change your
distance. **Enter** returns you to the spot where you were walking.
**T** flies you home from either view.

## The Orrery

It takes you to orbit, to an arena hung high over the world: a broad hub with
a dais in the middle, four platforms round it at different heights, each with
its own cover (a wall, a pair of walls, a deck up a flight of steps), and a
little perch off one corner for whoever likes to watch from above. Below is
the whole world, oceans and continents and cloud, with a thin blue rim of
air; above, the stars and the sun. Between the platforms there is nothing at
all. You get from one to another on jump pads, which throw you in an arc to
the next, or down the stepped bridge to the east; and if you miss, you fall
into the void.

It's a deathmatch, everyone for themselves, against four bots (Vex, Rook,
Sparrow and Ingot, each better at some things than the others):

- **Railguns only.** Everyone has one and nothing else. A rail goes straight
  through everyone in its way until it hits something solid.
- **One hit frags.** Whoever a rail touches is fragged and comes back in a
  moment later, at whichever way in is furthest from everyone else.
- **It never runs dry.** No ammunition to pick up; the gun takes a second and
  a half to charge between shots (the ring round the crosshair fills).
- A frag for each fighter you rail; falling into the void costs you one.
  First to 20 wins, or whoever has most when the ten minutes are up.

Up there the controls are an arena shooter's, not the hiker's: you see down
your own railgun, and you move the quick, slippery way those games move. You
get up to speed at once and stop at once; in the air you can't speed up the
way you're going, but strafing while you turn the view bends your path and,
done in rhythm over a run of jumps, carries you faster than running. Land
with jump held and you're straight off again.

| | |
|---|---|
| **T** by the rocket | choose a flight |
| **W A S D**, mouse | run, strafe, look (in the arena) |
| **click** | fire the railgun |
| **space** | jump; hold it to keep hopping |
| **A** / **D** and turn, in the air | strafe-jump: go faster |
| **click**, fragged | come back in |
| **T**, then **T** again | fly home (once a match is over, **T** once) |
| on a pad | sticks to move and look, **RT** fires, **A** jumps |

The forest's HUD makes way for the arena's: the crosshair and its charge
ring, the clock and the frag limit at the top, your place and the leader's
frags at the top right, who railed whom at the top left, and at the bottom
your health (always 100, until it isn't), your ammunition (∞) and your frags.
When it's over, the scores; and your record here (matches, wins, your best)
is kept with the rest of what's yours.

**Coming home.** **T** and the capsule comes back down under a red and white
parachute onto the pad, where the next rocket is already standing. You step
out beside it; it's taken away once you've walked off.

**Where it is** is grown from the seed and the land, like the old places
(`site.js`): the flattest dry ground in a ring round where you first arrive,
between about 200 and 430 m out, a little nearer winning over a little
flatter, clear of real places brought in from a photo, the old places, towns,
the mouths of caves and the railway. Everyone in a world finds it in the same
place. **Nothing about the land changes for it**: the pad is set on the
ground as it is, its top a little over the highest corner and its sides
sloping down to the lowest; the trees, bushes and stones in its way are
hidden as it comes into view, and grass doesn't grow on it. Building goes
round it.

From the console:

```js
world.spaceport.site          // where it is
await world.spaceport.go()    // stand beside the rocket
world.spaceport.board('ds9')  // fly to Deep Space 9 (default: The Orrery)
world.spaceport.hurry()       // skip on to the end of this part of the trip
world.spaceport.arena         // the match, while you're up there
world.spaceport.leave()       // fly home now
```

## Files

```
index.js        plugs it in: the site in the forest, T, the trip, the arena drawn in the forest's place
site.js         where the launch site is, grown from the seed and the land
launchSite.js   the pad, the tower, the rocket, the capsule and its parachute, the flame and the smoke
flight.js       the trip: boarding, the countdown, the climb, the way home, over time
flightPanel.js  the destination picker on the launch pad
station.js      the exterior approach, wormhole and walk on the station
stationHull.js  the central core, rings, spokes and docking pylons
promenade.js    the station’s shopfronts, gallery and windows
stars.js        the star field shared by the two destinations
orrery.js       the arena's layout: platforms, jump pads, ways in, the bots' paths
mover.js        moving in the arena: running, strafe-jumping, jump pads, boxes, rays
arena.js        a match: the fighters, their railguns, frags, coming back in
match.js        the score: frags, the frag limit, the clock, who's in the lead
bots.js         the bots: finding their way, seeing, aiming, dodging
arenaLook.js    what the arena looks like: platforms, pads, the world below, fighters, rails
arenaHud.js     the arena's HUD, and the big words of the trip
sound.js        the rocket's roar, the railgun, the pads, the countdown
spaceport.css   the glare, the big words, the arena's HUD
```
