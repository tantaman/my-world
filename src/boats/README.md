# Boats

Build a **dugout canoe** or a **raft** at the water's edge, push it off, and
paddle it about the ponds, lakes and rivers, or out to sea.

- **Build one.** Take the boat tool (on the tool bar after the rifle: **8**)
  and aim at the bank of a pond, a lake or a river, where it slopes gently
  into water deep enough to float a boat.
  Hold **click** to hollow a canoe out of a log with the axe (5 m of log,
  about 16 seconds), or hold **right-click** to lash a raft together
  (12 m of log, about 9 seconds). A ghost shows where it would lie, its bow
  to the water. It has to be clear of trees, stumps, boulders, other boats
  and anything built.
- **The canoe** is quick and turns easily. **The raft** is slow and broad,
  and goes where the current takes it. You can step up onto a raft lying in
  the shallows.
- **Get in.** Beside a boat, **F** climbs in. A boat on the bank is pushed off
  down it and out until it floats.
- **Paddle.** **W A S D** paddles the way the camera faces, and **shift**
  paddles hard. A river's current carries you along, and carries a raft
  more. A boat won't go where it's too shallow for it: it runs aground and
  slides along the shore, and you can always paddle back out the way you
  came. Your tools are put away while you paddle, except the fishing rod
  ([Fishing](../fishing/README.md)). Take that up and you can only scull
  yourself along slowly, one-handed. Put it down to paddle again.
- **Get out.** **F** steps out onto the nearest bank or shallows within
  reach. Out in deep water, with no bank in reach, **F** twice slips you over
  the side to swim. The boat stays where you left it, afloat or pulled up on
  the bank, and it's on the map (**M**). If you're taken somewhere else all at
  once (back to the start, say), you're out of the boat and it stays where it
  was.
- **Break one up.** With the boat tool, hold **right-click** on a boat to
  knock it apart. You get back some of its wood: 3 m of log from a canoe,
  8 m from a raft.

Boats are part of the world, like the fires and the cabins. In a shared
world everyone sees them, and anyone can take one out. While someone's in
one it's drawn under them, wherever they paddle it, and not where it was
left. Which one you're in is yours, so you're back in it when you come back.

## Keys

| | |
|---|---|
| **8** | the boat tool |
| **hold click** / **hold right-click** | at the water's edge: build a canoe / a raft |
| **hold right-click** | with the boat tool, on a boat: break it up |
| **F** | get into the boat beside you · get out (the act key, as for everything you get into: see [Acting](../act/README.md)) |
| **W A S D**, **shift** | in a boat: paddle, paddle hard |

From the console:

```js
world.boats.list()             // where they are
world.boats.build('raft')      // one at the nearest water's edge, built for you
world.boats.board()            // into the nearest · world.boats.getOut()
```

## Files

```
index.js              plugs it into the game: the tool, I, paddling, other people's boats, the map, saving
kinds.js              the canoe and the raft: what each costs, its size, how it carries you
boats.js              the boats where they were left, afloat or on the bank; how they're saved (b:<id>)
shore.js              where one can be built, where it goes when pushed off, how it rests, where to step out
tool.js               the boat tool: build one, get in, break one up
paddle.js             the stroke, and when the blade goes in and comes out
models.js             the dugout, the raft and the paddle
others.js             other people out in boats
onMap.js              boats on the map
sound.js              a stroke, pushing off, lashing a raft, climbing in and out
```
