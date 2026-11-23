# The jetpack

At the [launch site](../spaceport/README.md), at the front of the pad,
between the fuel tank and the rocket, a jetpack hangs on a rack: two white
tanks with red bands, a nozzle under each. Walk up to it and press **F** (the
key that acts on what's at hand: see [Acting](../act/README.md)), and it's
strapped to your back. It's yours from then on, wherever you go (and listed
with what's yours in [your pack](../pack/README.md)), until you
take it back to the rack and **F** hangs it up again.

With it on your back you walk, run, build and jump as before. To fly, jump
and keep holding **space**: a moment after you leave the ground the jets
catch with a whump, and you climb. Or tap space to jump, and press it again
in the air. (Step off a ledge and press space, and they catch then too.)

| | |
|---|---|
| **F** at the rack | strap on the jetpack · hang it back up |
| **space**, held, off the ground | fire the jets · climb |
| **W A S D** | fly where the camera faces, at 12 m/s |
| **shift** | dive, and go faster: 24 m/s along |
| neither space nor shift | the jets throttle back, and let you down slowly |
| on a pad | **A** held to climb, **B** to dive, the left stick to steer; **Y** is F |
| on a touch screen | at the rack, the *strap on* (or *hang up*) button · tap jump in the air to climb |

You hang under it with your feet drawn up and your arms out, tipped forward
the faster you go and banked into turns, with a flame under each nozzle and
a trail of vapour behind you, blown out across the ground when you're low.
It flies as high as 120 m over the ground. Your tools are put away while the
jets burn. Touch down, on the ground, on a roof or in the water, and they cut
out with a sputter, and you're on your own feet again.

In a shared world everyone sees the jetpack on your back, and when you fly,
how high you are and the jets burning; and you see theirs, and hear them
nearby. Each of you takes your own off the rack.

From the console:

```js
world.jetpack.rack          // where the rack is
await world.jetpack.go()    // stand in front of it
world.jetpack.give()        // strapped on, wherever you are
world.jetpack.state()       // whether you have it, whether the jets burn, how high
```

## Files

```
index.js     plugs it in: the rack at the launch site, F there, the jets, how you hang under them, saved as yours
jets.js      when the jets fire and cut out, how they carry you (Player.carrier), how hard they go, the tilt
rack.js      where the rack stands at the launch site, in the pad's own frame
model.js     the jetpack, its flames, its vapour, and the rack
others.js    other people's jetpacks: on their backs, and how high they fly
sound.js     the jets' roar; the buckles, lighting up, cutting out
pictures.js  what the jetpack looks like in your pack
```
