# Dry Wells

A walk from where you first arrive there's a sandstone gateway standing among
the trees, out of place: two square towers, a red banner on one and a blue on
the other, `DRY WELLS` cut over the arch, and the archway itself full of
white light and hot blue sky. It's on the map as the *Dry Wells gate*. Walk
into the light and you're somewhere else: an old caravan town behind a wall,
under a high sun, in the middle of a match.

## The match

Five **Raiders** against five **Wardens**. Every one of the ten is a bot,
each with a name and a knack, until somebody walks in: then one of the bots'
places is theirs, on whichever side has fewer people, as it stands — its
position, its guns, its money, its score. Walk out and the bot has it back.
In a world you share (see [Building together](../save/README.md)) everyone
who walks in is in the same match, and you can end up on either side of each
other.

It's played in rounds, and nobody comes back until the next one:

- **The Raiders** carry a charge. They win a round by setting it at one of
  the two sites, the **Granary (A)** or the **Cistern (B)**, and keeping the
  Wardens off it for forty seconds until it goes off; or by putting every
  Warden down.
- **The Wardens** win by keeping the charge from being set until the clock
  runs out (1:55), by putting every Raider down before it's set, or, once it
  is, by pulling its fuse: ten seconds at it, five with a fuse kit.
- Whoever carries the charge and falls, drops it; any Raider who walks over
  it has it.
- After twelve rounds the sides change over. First to **thirteen** takes the
  match; twelve all is a draw. Then another begins.

**Money.** Everyone starts with $800 and a sidearm. A round won pays $3250
($3500 if it was the charge that won it, or its fuse being pulled); a round
lost pays between $1400 and $3400, more for each one lost before it without
a win between; a kill pays by what it was done with (most for a knife, least
for the long rifle); setting the charge or pulling it pays the one who did
it.
What you buy is yours until you fall. Buying is done **at home**, where your
side comes in, in the few seconds before a round goes live and the first
twenty after:

| | | |
|---|---|---|
| Bulldog magnum | $700 | a sidearm that goes through a vest |
| Wasp SMG | $1250 | quick, close to; pays double for a kill |
| Breacher shotgun | $1100 | eight pellets; for corners |
| Karga rifle | $2700 | the gun the rest are measured by |
| Longshot rifle | $4750 | one round anywhere above the legs; right-click for its sight |
| vest · vest + helmet | $650 · $1000 | a helmet turns a pistol round off the head |
| fuse kit | $400 | Wardens: pull the fuse in half the time |
| frag · flashbang · smoke | $300 · $200 · $300 | one of each |

**Shooting.** A round to the head does four times what one to the body does,
and one to the legs three quarters; damage falls off with distance, quickly
for the SMG and the shotgun. Your aim is tightest standing still, or
crouched: running throws it wide, jumping wider, and so does holding the
trigger down, as the muzzle climbs and then swings (the crosshair opens to
show how wide). Tap, or fire in bursts. You can't hurt your own side. Smoke
can't be seen through, by you or by the bots; a flash blinds whoever is
looking at it, you included.

**The bots** play their side. The Raiders pick a site between them, gather
short of it and go in together, most up one lane and one or two through the
middle; whoever has the charge sets it and the rest stand guard. If a person
on their side is carrying it, they go where that person goes. The Wardens
hold two to a site and one watching the middle, come round when the other
side is seen or heard at a site, and once the charge is set, meet outside and
go in together to pull it. They hear gunfire, and running feet close by:
**walk** (shift), and they won't hear you coming.

**The town** is about ninety metres square. The Raiders come in at the south
yard, the Wardens at the north. Between them: the **west lane** under its
arcade, in to the Cistern; the **east lane**, long and open, in to the
Granary under its gallery; and the **middle**, two streets into the well
court, with a passage off it to each site, the staggered walls of the north
alley beyond, a tunnel through to the west lane and a crooked alley to the
east. The radar at the top left has it all.

## Keys

In the town the keys are the town's own; the forest's do nothing until you
walk out. (**H** still lists them, **O** is still the settings, and **X** is
still the radio, to everyone in the world.)

| | |
|---|---|
| **W A S D**, mouse | run, strafe, look |
| **shift** | walk: slower, and unheard |
| **C** (hold) | crouch |
| **space** | jump |
| **click** | fire · throw a grenade · set the charge (hold, at a site) |
| **right click** | the long rifle's sight |
| **R** | reload |
| **1 2 3 4 5**, **scroll**, **Q** | main gun · sidearm · knife · grenades · the charge; the next; the last |
| **B**, then its number | buy, at home |
| **E** (hold) | set the charge, at a site · pull its fuse |
| **G** | put the charge down for someone else |
| **tab** (hold) | the scores |
| **click**, once you're down | watch the next of your side |
| **L**, then **L** again | walk out (once, when a match is over) |
| on a pad | sticks to move and look, **RT** fires, **LT** sights, **A** jumps, **B** walks, **X** reloads, **Y** uses, **R3** crouches, **LB/RB** change what's in hand, **←** buys, **↓** puts the charge down, **→** walks out |
| on a touch screen | the sticks, *use* to fire and *alt* for the sight; and a button for whatever else is at hand, there while it's any use: *buy*, *reload*, *set the charge* or *pull the fuse* (hold it), *next gun*, *crouch* (hold it), *walk out* |

How fast the mouse turns you in there is on the settings panel (**O**), and
is remembered. Your record there (matches, wins, rounds, kills) is kept with
the rest of what's yours.

**Where the gate is** is grown from the seed and the land, like the old
places and the launch site (`site.js`): the flattest dry ground in a ring
round where you first arrive, clear of everything that was there first (the
old places, caves, launch sites, stores, airfields, abandoned buildings, the
hunt club, race tracks, the pier, towns and their dealerships, the railway,
the roads, the gate under the hill). Some of those are only found a little
at a time once the world is open, so the gate waits for them: it's on the
map, and standing, a moment after you arrive. Everyone in a world finds it
in the same place. Nothing about the land changes for it: its slab is set on
the ground as it is, the plants in its way are hidden as it comes into view,
and building goes round it.

While you're in the town the hiker waits by the gate, and is the match's
(`player.rides`): you can't walk in on a horse or in a car ("get off your
horse first"), and a place picked some other way while you're in there takes
you out of the match.

## How a match is shared

One browser runs the match: the first one in (the *host*). It moves the
bots, lands the shots, keeps the clock and the money, and a dozen times a
second tells everyone else in the town how things stand. The others move
their own fighter themselves, the moment a key goes down, and tell the host
where they are and what they shot at, as they saw it; everything else they
see is what the host last said. It all goes over the world's socket
(`save.say`, on a channel of its own) and none of it is kept. If the host
walks out, whoever has been in longest takes the match on from what they
were last told, mid-round, and a bot takes the host's place. Alone, or in a
world that isn't on the server, you're a host with nobody to tell.

From the console:

```js
world.skirmish.site          // where the gate is (null until it's been found)
await world.skirmish.go()    // stand in front of it (finding it now, if it hasn't been)
world.skirmish.enter()       // walk in
world.skirmish.match         // the match, while you're in there
world.skirmish.session       // who's in, and who runs it
world.skirmish.hurry()       // skip the rest of the freeze
world.skirmish.leave()       // walk out
```

## Files

```
index.ts      plugs it in: where the gate is, standing it up as you come near, walking in, the town's keys, what's yours
site.js       where the gate is, grown from the seed and the land, and what it keeps clear of
grounds.js    what the forest does for the gate: plants hidden, building kept round it, its place on the map
pictures.js   what the things at hand in the town look like, on their buttons on a touch screen
gate.js       the gate: its slab, its towers, the light in its archway (fetched as you first come near)
visit.js      being in the town, from walking in to walking out: the controls, what you see and hear, the match drawn in the forest's place (fetched with the gate, and with it everything below)
town.js       the town's layout: boxes, the two sites, where each side comes in, the bots' paths
mover.js      moving in the town: running, walking, crouching, a jump, boxes
arms.js       the guns, the grenades, the gear: what each costs and what it does
rounds.js     the rules: rounds, the clock, the score, what each round pays
match.js      a match: ten fighters, shots, the charge, grenades; the host's side and a guest's
bots.js       the bots: finding their way, seeing, aiming, playing a side
net.js        who is in the town, and whose browser runs the match
townLook.js   what the town looks like: walls, doors, crates, palms, the desert, the sky
figures.js    what the fighters and the things they carry look like
look.js       the scene: fighters, your hands, shots, smoke, the charge, the view
hud.js        the match's HUD: crosshair, radar, clock and score, the shop, the scores
sound.js      the guns, footfalls, grenades, the charge, the round
skirmish.css  the HUD
```
