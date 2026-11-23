# Wildlife

You're not alone out there: deer, elk, moose, black bears, wolves, mountain
lions, bobcats, foxes, rabbits, squirrels, chipmunks, mice, snakes,
salamanders, songbirds, crows, hawks, owls, bees and butterflies come and go.
And in a Louisiana bayou, alligators.

Every so often something arrives — always out of sight, somewhere that suits
it, at an hour it keeps — goes about its business, notices you, and in time
wanders off again. Nothing is saved and nothing is shared: wildlife belongs
to the forest, so someone building with you meets animals of their own
(though yours are wary of them too).

**Where and when.** Habitat is read off the same fields that grow the forest:
deer along woodland edges, elk out in the meadows, moose where it's wet, bears
and bobcats in the woods, red squirrels in the pines and grey ones in the
oaks, salamanders on damp ground, snakes basking in open sun, bees and
butterflies over the meadow flowers. Deer, elk, rabbits and foxes like dawn
and dusk; chipmunks, hawks and songbirds keep to the day; mice and owls come
out at night; wolves and mountain lions favour the half-light. Some are
common and some are not: you'll see a lot of deer before you see a mountain
lion.

**How they take to you.** Each species has its own temperament:

- Deer look up and stare, flick their tails and stamp. Stand still and they
  often decide you're nothing and go back to feeding; come closer and they
  snort and bound away with their white tails up. The whole herd goes with
  them.
- Elk and moose are less flighty: they watch, then walk off. A bull elk
  bugles at dawn and dusk.
- A black bear stands up on its hind legs for a better look, blows, and
  ambles away. Cubs follow their mother.
- Wolves travel in single file and howl together after dark.
- Mountain lions and bobcats prowl low; noticed, they sit and look straight
  at you, then slip away.
- A fox trots its rounds, stops dead to listen to the grass, and pounces.
- Rabbits freeze flat, then zig-zag for cover. Squirrels sit up and scold,
  then bolt for the nearest trunk and spiral up into the canopy. Chipmunks
  dive under the nearest rock or log. Mice vanish into the leaf litter.
- Snakes lift their heads on guard (a rattlesnake rattles), then slide off.
- An alligator keeps to the water's edge: basking on the bank with its mouth
  open, or lying in the water with only its eyes, its nose and the ridges of
  its back showing, drifting. It lifts its head and watches you; come too
  close and it slides off the bank into the water, or sinks out of sight if
  it's in it already. Corner one on land and it hisses. A young one is black
  with bright yellow bands; a big old bull is nearly black, and in the spring
  he bellows, a deep rumble that carries a long way over the water. Only
  where a country has them (`only` in `species.js`): never in the forest.
- Songbirds and crows drop onto clearings and paths to hop and peck, and burst
  up into the trees when you come too close. A red-tailed hawk circles high
  over the meadows; an owl ghosts across a clearing at night.

Running is noisy, so they notice you from further off; standing still makes
you hard to spot. A gunshot ([Hunting](../hunting/README.md)) is heard by
everything for a few hundred metres round, and they all run from it. When you look straight at an animal, the name of what
you're seeing shows for a moment.

**How they're made.** Like everything else, from primitives with colour baked
into the vertices. Each animal is one skinned mesh — a whole moose, antlers
and all, is a single draw call — and is animated procedurally. Four-legged
animals share one skeleton and gait engine (`src/wildlife/quadruped.js`): a
lateral-sequence walk, a diagonal trot, a transverse gallop and the
half-bound of rabbits and squirrels, with two-bone IK putting each foot on
the actual ground under it, so they stand on slopes and their feet don't
skate. Snakes and salamanders bend a chain of spine bones to lie along the
path the head took. Birds beat, glide and fold two-jointed wings.

From the console:

```js
world.wildlife.spawn('bear')                       // one turns up nearby, out of view
world.wildlife.spawn('fox', { here: true })        // right in front of you
world.wildlife.list()                              // who's about
world.wildlife.species.deer.notice = 60            // tune a temperament
```

Species: `deer elk moose bear wolf cougar bobcat fox rabbit squirrel
chipmunk mouse snake salamander alligator flock flit crows hawk owl bees
butterflies`.

## Files

```
index.js              plugs it into the game
wildlife.js           who's about: arrivals, departures, what animals can sense
species.js            habitat, hours, rarity, group size, temperament
quadruped.js          shared skeleton + gaits + leg IK for four-legged animals
mammals.js            what each mammal looks like
beasts.js             how mammals behave (graze, alert, flee, climb, howl...)
birds.js              bird bodies and wings, flapping and folding
flyers.js             flocks, passing birds, a soaring hawk, owls
crawlers.js           snakes and salamanders
gators.js             alligators: the body, and basking, lying in the water, sliding in, sinking
insects.js            bee swarms and butterflies
```
