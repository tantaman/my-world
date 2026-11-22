# Campfires

When it gets dark, ring a pit with stones and light a campfire. It's a tool
like the others (see [Building](../build/README.md)): **5** on the tool bar,
the *camp* kit.

- **Ring a pit.** Aim at the ground and hold **click** to scrape a shallow
  pit and ring it with 4 stones. It snaps to the grid like everything else.
  The spot needs to be fairly level and dry, at least 2 m from any standing
  trunk (for the branches' sake), under open sky rather than a roof, and
  clear of stumps, boulders, felled trees, walls and other fires. The prompt
  says what's in the way.
- **Lay a fire.** Click the ring to split 1 m of log and stand it up in a
  teepee over some kindling.
- **Light it.** Click again to strike a light. It takes a few seconds to catch
  properly.
- **Feed it.** While it burns, click to put on another 0.5 m of log. A fire
  holds up to 3 m of wood. Each metre burns for about 5 minutes. As the wood
  goes the teepee burns down and falls in.
- **Embers.** When the wood runs out it glows as embers for a couple of
  minutes. Put wood on them while they're hot and they rekindle. After that
  it's cold ash.
- **Right-click** a burning fire, or embers, to kick earth over it and put it
  out. Any unburned wood is left charred in the ring, and you can light it
  again. Right-click a ring with no fire in it to take it apart. You get the
  stones back, and any unburned wood in half metres.

Fires burn by the clock on the wall, not the hour in the sky (that's yours to
scrub with **, .**). So everyone in a world watches the same fire burn down,
and one you left burning is cold ash when you come back tomorrow. You can't
walk into a fire with wood in it, and neither the shovel nor a footing, a wall
or a roof will go where a fire ring is. A fire also lights the world around
it, which matters a great deal more after dark than at noon: the trees and
whoever is by it cast shadows away from it, and the smoke over it glows. Its
flames are a volume of burning gas, round from any side and fading into the
coals, and the air over them shimmers (see [the look](../render/README.md)).

## Files

```
index.js              plugs it into the game: campfires
fires.js              what a fire is, how it burns down by the clock, how it is saved
tool.js               the campfire tool: ring, lay, light, feed, put out
look.js               flames, glowing coals, smoke and sparks
geometry.js           the stone ring, the teepee of firewood, the ash
sound.js              the crackle; the strike, the catch and the hiss
```
