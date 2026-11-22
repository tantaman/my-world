# The hunt clubs

A longer walk out from where you first arrive than the video store, there's
a hunt club: a timber clubhouse, stained brown under a green tin roof, with
its name on a board along the porch and a skeet field in front of it. It's
on the map with a flying clay on its badge. Pick it and press **go here**,
and you're set down at the foot of the porch steps, facing them; track it,
and the HUD leads you there on foot.

It isn't the only one. Out in the forest, ten or twenty kilometres apart,
there are more: the same clubhouse and field, each with a name and a steward of its
own. They're all on the map, and under **hunt clubs** in Routes, nearest
first, as far out as you scroll. The shotgun, the rules and your best round
are the same at any of them, and the map remembers which you've been to.

**Get a shotgun.** Up on the porch, the steward serves from a hatch in the
wall, with the gun room behind: a rack of shotguns, shelves of shells, a
pair of antlers. Step up to the hatch and **click**, and you're handed a
12-gauge over-and-under. It's yours from then on, wherever you go: it shares
the rifle's slot on the tool bar (**7**, then **7** again to change between
them). It holds two shells, and you break it open to load.

**Shoot a round of skeet.** The field is laid out as a real one is: the
high house on the left as you look out from the porch, the low house on the
right, and eight stations, seven round an arc between them and the eighth
in the middle, each a concrete pad with its number painted on. Stand on
station 1 with the shotgun and **click** to call "pull!": the gun is broken
open and loaded, and a moment later a clay target is thrown from the high
house, out over the orange-topped stake in the middle of the field. Shoot it
before it comes down.

- A round is **25 targets**: one from each house at every station, a pair
  thrown together (a **double**) at stations 1, 2, 6 and 7, and the
  **option**, the first target you lose thrown again straight away (or, if
  you lose none, one more from the low house at station 8).
- A single gets **one shell**, a double two: the gun is loaded for each throw
  as you call for it. A target you don't break with its shell is **lost**,
  and one you don't shoot at is lost when it comes down. One you break is
  **dead**.
- **Lead them.** The shot takes a moment to get out there, and the target
  doesn't wait: aim where it's going to be. The nearer the middle of the
  pattern, the surer the break; dead centre, and it goes to dust. When you
  miss, the HUD says where your shot went: *behind it*, *in front of it*,
  *over it*, *under it*.
- **Hold right-click** to mount the gun: you look along the rib, a little
  closer, and the crosshair is where the pattern goes.
- A card at the top of the screen keeps score while you shoot: a box for
  each target, orange for one broken, a ring for one lost, and where to shoot
  from next. An orange arrow hangs over the next station, and the HUD points
  you to it. Walk away from the field and the round is given up.

At the end, the steward says how you did if you're near enough to hear, and
your best round is kept. Whether you have the shotgun, your best and how
many rounds you've shot are yours, saved.

The shotgun works anywhere, too. It takes game as the rifle does (see
[Hunting](../hunting/README.md)), but only within about 45 m, and you can
dress a kill with it in hand. A shot is heard a long way off, and the
animals near enough run.

**Where they are** is grown from the seed and the land, like the video store
(`site.js`). The first is on the flattest dry ground in a ring 450 to
1000 m out from where you first arrive, a little nearer winning over a
little flatter, its clubhouse on the side you come from, so the shooting is
away from you. It's on the map a moment after the world opens, once the
airfields it keeps clear of have been found (they're looked for a little at
a time, so as not to hold up the start).

For the rest, the world is cut into 10 km squares, and about half have a
spot chosen from the seed; the club is on the flattest dry ground within
1.4 km of it, its clubhouse facing the way the square says or a quarter turn
round. A square of rough or wet ground has none. A club stays inside its
square, so no two are near each other, and none comes near the first.
They're looked for as you come within a few kilometres, a little at a
time.

Every club keeps clear of real places brought in from a photo, the old
places, towns, the mouths of caves, the railway, the launch sites, the
video stores, the abandoned buildings and the airfields, and the far ones of
the race tracks (which keep away from where the first can be). Everyone in a
world finds them in the same places, by the same names. **Nothing about the
land changes for one**: the clubhouse stands on a deck on posts, the houses
and the pads on the ground, and the walks follow it; the trees, bushes and
stones on the field are hidden as it comes into view, and grass doesn't
grow under any of it. Building goes round the field. The nearest club is
the one that stands.

## Keys

| | |
|---|---|
| **click** at the hatch | ask the steward for a shotgun (at any club) |
| **7** | the shotgun (in the rifle's slot: press again to change) |
| **click** on a station | call "pull!" for the next targets |
| **click** | shoot · beside a kill, hold to dress it |
| **hold right-click** | mount the gun |

From the console:

```js
world.huntclub.site                  // the club you're at, or were last near
world.huntclub.home                  // the first club
world.huntclub.clubs.byId(id)        // one of the rest ('huntclub:far:<i>:<j>')
await world.huntclub.go(id)          // stand at the foot of its porch steps (no id: the one you're at)
world.huntclub.toCounter()           // stand at the hatch
world.huntclub.toStation(4)          // stand on a station, facing the crossing point
world.huntclub.give()                // be given the shotgun, wherever you are
world.huntclub.range.card()          // the round so far
world.huntclub.range.air             // the targets in the air
world.huntclub.lead(target)          // where to aim to break one
```

## Files

```
index.js        plugs it in: where they are, on the map and in Routes, the nearest stood up as you come near, the steward, the card
site.js         where the clubs are, grown from the seed and the land, their names, and how high everything in one stands
skeet.js        the field's layout, a target's flight, the shot's pattern, the rules of a round, what's kept of you
range.js        the field at work: the throw called for, targets flying, breaking and coming down, the score
club.js         what it looks like: the clubhouse and its porch, the gun room, the houses, the pads, the walks
shotgun.js      the shotgun on the tool bar: load, call pull, shoot, mount, dress a kill
models.js       the shotgun, its barrels hinged to break it open, and a clay target
scorecard.js    the card at the top of the screen while you shoot a round
huntclub.css    ...and how it looks
sound.js        the shot, breaking the gun open and loading it, "pull!", the trap, a target breaking
```
