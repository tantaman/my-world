# Split screen

Up to four people can play in one forest on one screen, with a game
controller each. Plug in a second pad and press a button on it (the browser
doesn't show a page any pad until then), and the screen splits in two. A
third pad splits it in three, and a fourth into quarters. Unplug one and
whoever it was goes. With one pad left, the screen is whole again.

| pads | the screen |
|---|---|
| 2 | side by side (one over the other on a screen taller than it is wide) |
| 3 | the first pad down the left half, the other two in the right half, one over the other |
| 4 | quarters |

**The first pad is you**, the hiker you already are, together with the
keyboard and the mouse. You keep everything you can do: the tools, the map,
your pack, getting into things and onto them. Your tool bar, prompts and
panels keep to your part of the screen.

**Each other pad is somebody else**, set down beside you as a different
hiker: the first of the hikers nobody else is, in the order
`player/hikers.js` lists them (*the hiker*, Lauren, Oliver, Elliott, and
anyone added there later). Each pad is remembered as whoever it was last
time. They walk, run, jump, swim and dive, and look
about, with a camera of their own on their own part of the screen:

| on the other pads | does |
|---|---|
| left stick | walk (all the way over: faster) · under water, swim |
| right stick | look around |
| **A** | jump · out of your depth, come up |
| **B**, held | run · out of your depth, dive |
| d-pad **↑ ↓** | zoom in · out · held in, look out of your own eyes |
| **select** | be someone else: the next hiker nobody is |
| **start** | back beside the first hiker |

Their cameras are locked behind them to begin with, so one stick does it
all: left and right turn them, as *camera locked behind you* does for you
([the hiker](../player/README.md#the-camera-behind-you)). It's a switch on
the settings panel (**O**), under *split screen*.

They can't use tools, ride anything or open the map. Everything the game
does is still done by and for the first hiker. Go somewhere new (back to the
start, or anywhere the map takes you) and the others come with you. If one of
them is left more than a kilometre and a half behind, by a train you took
say, they're brought back beside you. While the map or another place is
drawn over everything (Hell, the arena, orbit), the others wait where they
are.

What goes by where *you* are still goes by you alone: the animals that come
and go, the towns and old places that are stood up, and everything you hear.
The ground and the grass are grown round each of the others as well as round
you, so wherever they wander there's a forest under their feet.

## How it fits in

Nothing else knows about it. It uses things other features offer:

- `game.pads.only`: only the first pad is read as yours (`player/gamepad.js`)
- a `Player` for each of the others (`player/player.js`), moved by a pad of
  their own (`pad.js`) instead of the game's controls
- `game.views` (`render/views.ts`): the screen shared between cameras. As
  each part is drawn, what goes by whose part it is is put right for it.
  The grass parts round its hiker, the sun's shadows are drawn round them
  (`sky.aim`), the water ripples round their legs, and with their camera
  under the water the fog is the water's. Looking out of your own eyes
  hides your body only from your own part.
- `game.followed`: the ground and the grass grown round each of them
- Drawing the forest four times costs more than once, so each part leaves
  out what it can't show. Its grass is only the grass round its own hiker
  (`grass.only`): the blades fade out at the grass radius from whoever
  they're drawn for, so the rest would be drawn as nothing. While everyone
  is within 12 m of the middle of them all, the sun's shadows are drawn once,
  round that middle, with the first part, and the others use the same map
  (`sky.freshShadows`). And every part draws every hiker, which is cheap
  because a hiker, once dressed, is about ten meshes rather than fifty
  (`player/bake.js`). With everyone together, four parts cost about two and
  a half times the draw calls one picture did before any of this, and three
  times the triangles.
- `#hud`'s box (`index.html`): your HUD lays itself out in your part

## Files

```
index.ts         plugs it into the game: who has a pad, the others' hikers and cameras, each part as it's drawn
layout.js        where each part of the screen goes, and who each hiker on it is
pad.js           one pad as the whole of someone's controls
splitscreen.css  the lines between the parts, and who's on each
```
