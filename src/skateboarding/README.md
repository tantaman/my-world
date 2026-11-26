# Skateboarding

There's a skateboard in your pack. Wherever there's tarmac or boards
underfoot — the paved roads between the towns (see [Roads](../roads/README.md)),
the round where they meet at a town's gate, a car dealer's lot, an airstrip,
the cruise ship's pier, a boardwalk, a dock, the streets and sidewalks of
[Washington](../washington/README.md) and the walks of
[its zoo](../zoo/README.md) — press **F** (the key that gets
you onto anything: see [Acting](../act/README.md); *skate* is at hand in the
pack, and a button on a touch screen) and you're on it. **F** again (*step
off*) and it's under your arm.

| | rolling | in the air |
|---|---|---|
| **W** | push | kickflip |
| **S** | brake: drag a foot, or at speed slide the board out sideways | heelflip |
| **A D** | carve; at a standstill, kick round on the tail | spin, you and the board |
| **shift** | crouch: faster downhill, out of the wind; with **A D**, carve hard, a hand down on the tarmac | shove-it: the board turns under you |
| **space** | ollie | |

The camera swings round behind the way you're going. The speed and the
points are above the coordinates, bottom left.

**How it goes.** The wheels roll along the board and nowhere else, so you
go where the trucks turn you, as tightly as the wheels' grip allows at the
speed you're going. Crouch into a carve (**shift** with **A** or **D**) and
you lean right over and put a hand down on the tarmac: a hard carve, near
twice as tight — at 40 km/h, round a bend of 11 m instead of 20 — though
the glove scrubs a little speed. Pushing gets you to about a running pace and no
faster; past that, it's the hills. The country roads climb no more than one
in ten, and down one of those you'll be doing 40 km/h standing up and more
than 50 crouched. Roll backwards and you're riding fakie, the other way
round on the board, until a push turns you round.

**With the jetpack.** Past the hills there are the jets. With the
[jetpack](../jetpack/README.md) on your back, **W** is them and not your
foot: hold it, and a moment after the kick that starts you off they catch
with a whump and shove you along the tarmac. The jetpack swings round flat
on your back as they do, and you square your shoulders across the board, so
the flames and the vapour stream straight out behind you, level with the
road. Nothing holds them
back but the air, so you wind up doing about 95 km/h standing up and 125
tucked down under **shift** — half as fast again as the jetpack will ever
fly you. At that speed the wheels' grip alone would only carve you round
the widest of sweeps, so carve with the jets lit and they help: you twist
your shoulders round into the turn and lean right over, the flames swing
out away from it, and they push you round as well as along — round a bend
of 40 m at 95 km/h, where the wheels alone would need 115, and of 30 m
crouched into it with a hand down as well. Let go of **W**
in the middle of a bend and it's the wheels' grip alone again, so keep them
lit through it, and ease off before the tightest bends and a city's street
corners. They burn on in the air too, so an ollie off a kerb at that speed
carries you twenty-odd metres. Let go of **W** and they cut out with a
sputter, and then **S** will slow you; and
everything else here still holds at that speed, so the gravel, a tree, a
kerb, or the grass at the edge of the tarmac will all still have you off.

What's underfoot matters. Tarmac rolls best; boards and stone a little
worse; a gravel road badly, and at speed a stone in it stops a wheel and
throws you. Roll off the edge onto the grass or the dirt, or into the water,
and the wheels dig in: slowly, you step off and run it out; any faster,
you're thrown. A step up higher than the wheels can roll over (a curb, a
porch, a deck) stops them too: ollie up onto it. Roll off the end of
something and you drop off it, and land.

**In the air** a key counts once it has been pressed since you left the
ground, so pushing or carving into an ollie doesn't flip the board. A tap of
**W** is a kickflip; hold it for a double. **shift** turns the board half
way round under you (a pop shove-it); hold it for a 360. Together they're a
varial kickflip, a 360 flip, a laser flip. **A D** turn you round with the
board, frontside or backside: a 180 lands you rolling away fakie. Let go
and the board finishes the flip or the turn it's in, if there's time.

**Bailing.** Come down with the board on its edge or wheels up, across you,
sideways or too hard, or run into a tree or a wall at more than a jog, and
you're off it: you tumble and slide along the tarmac, the board shoots off
on its own and clatters to a stop, and a moment later you're up with it back
under your feet.

**Points.** Each trick you land is named and scored (`ollie`, `kickflip`,
`backside 180 heelflip`, `fakie 360 flip`): more flips and turns are worth
more. Land one after another and they make a line, worth their points times
how many, banked once you've rolled on a few seconds without another, and
lost if you bail first. When you step off you're told how far and fast you
went and what it came to. Your best in each world is kept.

**With other people.** In a shared world, everyone sees you on your board,
and you see them on theirs.

From the console:

```js
world.skateboarding.on()      // onto your board, here, whatever's underfoot
world.skateboarding.off()
world.skateboarding.state()   // how you're going (`jets`: the push behind you), and this session's tally
```

## Files

```
index.ts         plugs it into the game: onto it and off it, what's under the wheels, the camera, the readout, your best saved
skater.js        the physics: rolling, pushing, carving (harder with a hand down, or the jets), braking, the air, landing, bailing
tricks.js        what you did in the air: whether you landed it, what it's called, what it's worth
session.js       a session's tally: how far, how fast, points and lines
controls.js      the keys, read into what the skater is told; what to say they do
pose.js          how you stand on it, push it and brake, square up for the jets and twist into a carve with them, lean and put a hand down, tumble; the board flipping under your feet
board.js         the skateboard: deck, grip, trucks and wheels that turn
sound.js         the wheels on the tarmac, boards and gravel, the slide, a glove on the tarmac, the wind; push, pop, land, bail
others.js        what other people here are on
skateboarding.css  the readout
pictures.js      what a skateboard looks like in your pack
```

On a road the board rides the top of the road itself, as a car does
(`roads.under`, see [Roads](../roads/README.md)). Anything else solid that
says it's made of `tarmac`, `asphalt`, `marble`, `stone` or `boards`
(world/solids.js: the same `surface` your footsteps hear) can be skated on
too, so a new place laid with one of those is skateable without telling
this. So is ground that something has paved over without anything standing
there to be stood on — [Washington's](../washington/README.md) streets and
sidewalks, and [the zoo's](../zoo/README.md) walks, drawn on the ground you
walk on — where whoever laid it says so (`world/paved.ts`).
