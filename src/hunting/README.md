# Hunting

There's a rifle in your pack: **0** on the tool bar. Hunt game with it,
dress what you shoot for its meat, roast the meat on a spit over a
[campfire](../fires/README.md), and eat it.

- **Shoot.** Aim with the crosshair and **click**. Hold **right-click** to
  look through the scope: it brings things four times closer, steadies your
  aim and slows you to a creep. When the crosshair is on game, with nothing
  in the way, the prompt names it and says how far off it is. The rifle holds
  five rounds and loads five more when they're gone. A shot is heard a long
  way off. Every animal within a few hundred metres runs from it, and birds
  burst up off the ground.
- **Game** is deer, elk, moose, black bears, wolves, mountain lions,
  bobcats, foxes, rabbits and squirrels. Anything smaller, and snakes and
  birds, isn't game: a shot goes past it. Animals notice you less if you
  stand still and more if you run (see [Wildlife](../wildlife/README.md)), so
  creep up, or wait for them to come to you.
- **Dress a kill.** A hit animal goes down where it stood. Walk up to it with
  the rifle in hand and hold **click** to dress it. You get cuts of raw meat
  by its size: a rabbit or a squirrel is one cut, a deer six, a moose
  fourteen. A kill isn't saved, any more than the animals are. Dress it
  before you go, or the forest takes it back.
- **Roast it.** Beside a campfire that's burning, or still hot embers,
  **click** to put a cut on a spit over it. A spit takes three cuts. Each
  roasts in about 45 seconds over a good fire, more slowly over embers, and
  not at all once it's out. They brown as they cook, and the prompt says how
  each one is doing. **Right-click** takes them all off. Done ones go in your
  pack as roast meat, and underdone ones go back raw. Leave them too long and
  they burn black, and you throw those away. What's on a spit is kept when
  you leave, just as it was.
- **Eat.** **U**, or the *eat* button on a touch screen, eats a cut of roast
  meat, wherever you are and whatever is in your hands.

What you're carrying shows on the line above the tool bar once you have
some: *raw meat* and *roast meat*, in cuts.

## Keys

| | |
|---|---|
| **0** | the rifle |
| **click** | shoot · beside a kill, hold to dress it · beside a fire, put meat on to roast |
| **hold right-click** | look through the scope · beside a fire, right-click takes the meat off |
| **U** | eat something you've roasted |

## Files

```
index.js              plugs it into the game: the rifle, the meat you carry, eating, saving the spits
rifle.js              the rifle on the tool bar: shoot, the scope, dress a kill, roast over a fire
shot.js               what a shot along the crosshair hits first: game, ground, a trunk, a wall
quarry.js             what is game, and how much meat each gives and how long it takes to dress
carcasses.js          kills lying where they fell, tipped over on their side, until dressed
roasting.js           spits over the fires, how the meat on them cooks, and how they are saved
models.js             the rifle, the spit and the cuts on it, a roast to eat
scope.js              the dark round view through the scope, with its cross hairs
sound.js              the shot and its echo, the bolt, loading, the knife, the sizzle, chewing
```
