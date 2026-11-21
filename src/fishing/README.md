# Fishing

Take the fishing rod (on the tool bar after the boat tool: **9**) to the bank
of a lake, a pond, a river or the sea, out onto a dock, or out in a
[boat](../boats/README.md), and fish.

- **Cast.** Aim the crosshair at open water between about 4 and 20 m out, at
  least knee deep, and **click**. The rod whips the float out and it lands
  with a plop.
- **Wait.** Fish feed best at dawn and dusk, less in the heat of the day, and
  least at night. They bite sooner in deeper water than in the shallows, and
  sooner still where a school is swimming under the float (dive in to see
  them, see [Under the water](../underwater/README.md)). A bite comes every
  half a minute or so in good water at a good hour.
- **Strike.** A fish at the bait makes the float twitch once or twice. Wait.
  When it takes it, the float goes under with a plunk: **click** at once to
  set the hook. Strike at a twitch and you frighten it off. Wait too long and
  it lets go.
- **Play it in.** Hold **click** to reel. Now and then the fish runs, and the
  reel's drag screams: let go of click until it stops, or the line snaps.
  Reeling all the time strains the line too, so let it rest when the prompt
  says it's straining. The bar shows how far in it is. A perch comes in
  easily. A big pike or a sea bass takes a while, and the rod bends under it.
- **Caught.** Once it's in close it's yours, held up for you to see: what it
  is, how long, how heavy. It goes in your pack with the rest of what you
  carry. The biggest of each kind you've caught is remembered.
- **Right-click** reels in, to cast again somewhere else. With a fish on, it
  lets the fish go. Walk or paddle too far from the float and you reel in.
  Put the rod down and the line comes in with it.

What bites is what lives in the water (underwater/fish.js): yellow perch,
brown trout and the odd northern pike in fresh water; herring, mackerel and
sea bass in the sea. Minnows are too small to take a hook.

## Keys

| | |
|---|---|
| **9** | the fishing rod |
| **click** | cast · strike when the float goes under |
| **hold click** | reel in a fish (let go while it runs) |
| **right-click** | reel in · let a fish go |

From the console:

```js
world.fishing.catches()        // the biggest of each kind you've caught
world.fishing.line.state       // idle, flying, waiting, biting, hooked, in
world.fishing.hurry()          // a fish at the bait now, if the float is out
```

## Files

```
index.js              plugs it into the game: the rod, what's in your pack, what's said and heard, what you've caught
rod.js                the rod on the tool bar: where a cast would land, the cast, the strike, reeling
line.js               the line: the float lying there, nibbles and the bite, a fish on it, and playing it in
catch.js              what bites where, and when; how big it is and how hard it pulls
look.js               the float, and the line from the rod's tip
models.js             the rod, and a fish held up to look at
sound.js              the cast, the plop, a nibble, the bite, the strike, the reel, the drag, a snap, a fish landed
```
