# Rafting

A whitewater raft in your pack, for running the rapids.

Where a river big enough for a raft falls steeply, it doesn't fall evenly:
most of the fall is gathered into a rapid (see *Rapids* in
[the world](../world/README.md)). Above it is a still pool; the water slides
over the lip and away, fast and white, through a run of standing waves
that stay where they are while the river pours through them, and out into a
pool below. Each rapid has a name and a class, from **Class I** (a few easy
waves) to **Class VI** (nobody runs it), by how steeply it falls and how
much water there is in it. They're on the map (**M**) with a badge of
waves: pick one to see its class, how long it is and how far it falls.

**Putting in.** At the edge of a river wide and deep enough for a raft,
*raft* is at hand in your pack (**Tab**): your raft goes in beside you,
lying along the current, and you climb aboard. Away from such a river, you're
told where the nearest rapid to run is (one of Class II to IV if there's one
near, or a V), and the way to put in above it is shown under the
coordinates.

**Guiding.** You sit on the back of the right-hand tube with a paddle, and
the raft goes where you point it, not where the camera looks. The river does
most of the work: in the pools it hardly moves, and in a rapid it runs at
up to 20 km/h whatever you do.

| | |
|---|---|
| **W** / **S** | paddle forward / back-paddle |
| **A** / **D** | turn left / right |
| **shift** | paddle hard |
| **Tab** | your pack: *get out* is at hand |

On a game controller, the left stick paddles and turns. On a touch screen,
the stick does, and *get out* is a button of its own.

**Running a rapid.** You're told a rapid is coming 140 m before its lip:
its name, its class, how long it is and how far it falls, and, for the
hardest, that it's one to look at from the bank first. Keep the raft pointed
down the river and paddle, and it punches through the waves, its bow
climbing each one and plunging into the trough behind. Let it turn side-on
and a wave under one side lifts it as the other drops, and the crest
under the bow holds it back while the stern swings round. In a Class III
it bucks and you carry on; in a IV or a V, side-on, it goes over. A rock hit
hard side-on can do the same. Through to
the foot of a rapid right way up, you've *run it*: it's said, and kept.

**Going over.** You're in the river, swimming or wading, with the raft upside down
beside you, both carried on down. Swim to it and *right it* from your pack:
you haul it back over and climb in. If you leave it far behind (150 m), or
it runs out of water, it's rolled up and back in your pack.

**Getting out.** *Get out* (**Tab**) steps you out onto the nearest bank,
or shallows you can stand in, and the raft is hauled out and rolled up. With
no bank in reach, *get out* again goes over the side into the river; the
raft stays where it is, to climb back into.

**With other people.** In a shared world everyone sees your raft on the
river, the colour it is, and which way up. Beside someone's raft with a seat
free (there are six: you, guiding, and five crew), *get in* climbs in as
crew. You sit on its tubes wherever they take it; **W** and **S** paddle,
and your strokes drive their raft along with theirs. When it goes over
you're all in the river; when they get out, so do you.

**What's kept.** In each world, the rapids you've run right way up, the
hardest class among them, and how many times you've swum. Close the game in
your raft and you're back in it, on the water where you were.

From the console:

```js
world.rafting.in()             // throw it in at the river beside you, and climb aboard
world.rafting.out()            // out onto the bank (or, asked twice, over the side)
world.rafting.state()          // how it's going: speed, which way up, the rapid you're in or the next
world.rafting.afloat           // whether it's on the water · world.rafting.aboard: whether you're in it
world.rafting.rapids(x, z, far)   // the rapids round a place: name, class, lip, foot, where to put in
world.rafting.nearest()        // the nearest rapid to run
world.rafting.putInAt(x, z, yaw)  // in, there, already aboard
world.rafting.hold({ fwd, turn, hard, steer })  // hold the paddles (steer: keep her straight); null to let go
world.rafting.log()            // the rapids you've run, the hardest, how often you've swum
```

## Files

```
index.js      plugs it into the game: the pack, putting in, guiding, going over, righting, getting out, the map, the readout, saving
raft.js       how it goes: the current at six places round its hull, paddles, banks, rocks, drops, waves, going over
rapids.js     the rapids as places: found from the land's, named from the seed, graded I to VI; the next one down
model.js      the raft (tubes swept up at the ends, cross-tubes, floor, grab line on D-rings) and its paddle
sound.js      water drumming on the tubes; in, strokes, rocks, drops, waves, going over, righting, getting out
crew.js       everyone else's rafts, and sitting in one as crew: seats, paddling together, thrown out together
rafting.css   the readout
```
