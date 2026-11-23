# Adventures

The forest is quiet until you ask it not to be. Press **N** (or the
*adventure* button in the corner) for the board, pick one, and for a few
minutes the world turns on you: a storm, a fire, something with teeth,
outlaws with rifles, a cave with something asleep at the bottom of it.

While one is on, a banner at the top of the screen says what it is, what to
do, how long is left, which way to go (or what to keep away from) and how
you're holding up. Get hurt and the edges of the screen flash red. Go a while
without being hurt and you mend; being worn down slowly (smoke, the cold of
a storm) stops you mending. If it's too much for you, the screen goes black
and you're back where it began, none the worse.

Nothing an adventure does stays in your world. No tree really burns or
blows down, the ground isn't moved, the camp and the cave's strongbox are
gone when it's over. It happens to you alone: someone you share a world
with doesn't see your twister. Only your record is kept (how often you've
tried each, made it, and your best time), with your map marks.

## The adventures

- **Tornado.** A twister touches down upwind and comes through the trees
  after you, wandering but always coming back round. Near it the wind drags
  you round and in, and things come flying out of it; too near and it picks
  you up and throws you, and the landing hurts too. Keep clear of it for two
  and a half minutes until it lifts, or get underground in a cave.
- **Hurricane.** The sky closes down and for three minutes it's rain driving
  in sideways, gusts that shove you off your line, branches flying out of
  the murk and lightning cracking down round you. The cold of it wears you
  down. Get under cover, in a cave or under a roof you built: the banner
  points to the nearest.
- **Wildfire.** Lightning has lit the forest upwind, and the wind brings the
  fire on: a long front, burning on the ground and up into the trees, faster
  through thick woods and uphill, and never over water. The heat wears you
  down near it and the smoke ahead of it; in it, it's quick. Get into water
  deep enough to wade and let it go round you (the banner points to the
  nearest), or find a thin place and get through it onto the burnt ground
  behind. Or keep ahead of it until the rain comes.
- **Avalanche.** On a mountainside (you're sent to the nearest steep one
  first), the snow above you lets go three times, each with a crack and a
  rumble. You can't outrun it downhill: get across the slope, out of its
  path. The banner points the way.
- **Hunted: black bear / mountain lion.** Something is stalking you. You
  hear it more than see it: a twig snapping, a huff, a snarl off to the
  side. Then it comes. Your rifle is on **0**: a bear takes three good hits,
  a lion two. Stand your ground and face a charging bear and it may stop
  short. A lion only comes from behind, so keep turning to face it. Neither
  will come near a burning campfire. Bring it down (it's then yours to dress
  for its meat, as in [Hunting](../hunting/README.md)) or stay alive until it
  gives up on you.
- **The stronghold.** Outlaws have built a stockade in a clearing a couple
  of hundred metres off: two men in the watchtowers, two at the gate, more
  walking rounds inside and out. Bring every one of them down with your
  rifle. They see you sooner the nearer you are and the more you move, a
  shot is heard all round, and once they know you're there they shoot back,
  surer the nearer you are. The stockade stops bullets, theirs and yours.
  Once it's yours, the camp stays a while for you to look round.
- **The cave.** At the bottom of the nearest cave (you're sent to its mouth
  first) is an old strongbox. Bats roost in the rooms on the way and your
  headlamp sets them off: put it out (**K**) and creep past. In places the
  roof comes down as you go by; when you hear it go, move. Beside the
  strongbox something big is asleep, and taking the box wakes it. Bring the
  box out into the daylight.

## Keys

| | |
|---|---|
| **N** | the board: start an adventure, or give up the one you're on |
| **0** | the rifle, for the bear, the lion, the outlaws and what's in the cave |
| **K** | headlamp, in the cave |

## How it works

`adventures.js` knows nothing of any one adventure: which there are, the one
you're on, your health, and how it ends. An adventure is a kind with a
`start(kit)` that returns a *run*: what to do, the clock, which way, and an
`update(dt)` that says when you've made it or haven't. Some say first where
you have to go (`where`). The top of `adventures.js` has the whole contract.
Another feature can add one with `game.adventures.define(...)`.

What an adventure can do to the world is handed to it in `kit` (index.js):
the sky and the air it would have this frame (`kit.look`: overcast, haze, how
far you can see, sway in the trees, the sky turned to storm or smoke, a
lightning flash; `kit.air`: how loud the gale, the rain, the fire, the
twister), shoving you, throwing you, hurting you or wearing you down, and the
things to shoot at (`kit.targets`, the rifle's: see `hunting/shot.js`).
Everything is set afresh each frame, and eased in and out, so when an
adventure is over the sky simply clears.

```js
world.adventures.begin('tornado')    // set off on one (the ids are on the board)
world.adventures.view()              // how it's going
world.adventures.run                 // the one under way
world.adventures.abandon()
```

## Files

```
index.js        plugs it into the game: the board, the banner, the sky and the air, your record
adventures.js   which there are, the one you're on, your health, how it ends, your record
board.js        the board you pick one from (I)
banner.js       the banner while one is on; the red when you're hurt; how it ended; the blackout
adventures.css  their styles
fx.js           rain, flames, puffs (smoke, dust, powder snow), things flying, lightning
sound.js        the air (gale, rain, fire, twister); thunder, rumbles, shots, roars, bats
places.js       finding somewhere: water, a mountainside, a clearing, the nearest of some places
storm.js        a storm: its sky, gusts, rain, lightning and what it throws at you
tornado.js      the twister, its funnel, its winds
hurricane.js    three minutes of storm, and finding cover
wildfire.js     the fire front: how it spreads, its flames, smoke and heat
avalanche.js    slides down the fall line, their powder and their snow
hunted.js       the bear and the lion after you; a prowler as something to shoot
prowler.js      a bear or a lion that stalks, charges, mauls and backs off
stronghold.js   the outlaws' camp, taken: their shots, and the streaks of them
camp.js         the camp: stockade, watchtowers, tents, crates, fire, flag; walls that stop a shot
guards.js       the men: posts, rounds and towers; seeing you, shouting, shooting
dungeon.js      the cave: the strongbox, the bats, the falling rock, what sleeps there
pictures.js     what adventures look like in your pack
```
