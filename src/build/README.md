# Building

You can **build**: fell trees, buck them into logs, hew timbers, clear and
grade the ground, set stone footings, and raise a notched log cabin with
rooms, doors, windows and a roof.

The crosshair in the middle of the screen is what you work on. The prompt
above the tool bar always says what a click would do, or why it can't.

| | |
|---|---|
| **1 – 6** · pad **LB RB** | pick a tool; press it again for the next in its kit (below). The shoulder buttons go along the bar a tool at a time |
| **click** (while looking) · pad **RT** | use the tool, hold to keep working |
| **right-click** · pad **LT** | the tool's second action, or take a piece down |
| **G** · pad d-pad **→** | set or pull up a grade stake |

**The tool bar.** Tools that go together share a slot, and its number key: a
**kit**. Pressing the key takes up the tool you last used from the kit, and
pressing it again moves on to the next; the kit opens over its slot for a
moment so you can see what's in it, or click (tap) one straight away. The
pips on a slot are its tools, the lit one the tool it gives you.

| | | |
|---|---|---|
| **1** | hands | hands |
| **2** | axe | axe |
| **3** | earth | shovel, footing |
| **4** | cabin | log wall, timber, roof |
| **5** … | | whatever other features put on the bar, in a kit of their own or one of these |

**Gather.**
- **Axe (2).** Click a tree to chop it. Pines take 5–7 swings, birches 4,
  oaks 8–10. The tree creaks and falls away from you. Swing at the fallen
  tree once more to limb it, then keep swinging to buck it into 4 m logs.
  A big pine gives over 10 m of log.
- **Hewing.** With the axe, hold **right-click** to hew round logs into
  squared timbers, half a metre at a time.
- **Hands (1).** Pick up small stones. Boulders stay where they are.

**Prepare the ground.**
- **Shovel (3).** Hold **click** to dig and **right-click** to fill. Digging
  fills your soil pile and filling spends it, so cut and fill balance out.
  Dig into the bank of a pond, lake or stream and the hole fills to the
  water's level; fill the shallows in and the water gives way.
  The shovel strips the turf, clears undergrowth and pockets small stones.
  It won't dig among the roots of a standing tree, so fell it first, then
  hold **click** on the stump to grub it out.
- **G** drives a **grade stake** where you're aiming. A translucent plane
  then shows the stake's level. Ground poking through the plane is high,
  and where the plane floats above the ground, it's low. With a stake set,
  the shovel only cuts down to grade and only fills up to it, so you can
  level a pad by sweeping across it.

**Build.** Everything snaps to a 1 m grid.
- **Footing (3, again).** Hold **click** on a grid node to dig a footing and set a
  stone pier (2 stones). The first footing starts a building. Every other
  footing must come up to the same level, and a pier only makes up about
  25 cm. On a slope you'll be told how many centimetres too high or too low
  the ground is, so grade it first. Footings can't go under water: fill the
  spot in first.
- **Log wall / timber (4).** Click a node to start a wall, then click
  another node along the same line to lay a log between them (up to 8 m).
  Click again to stack the next course on the same line, and **right-click**
  when you're done. Walls stack Lincoln-log style:
  - The first logs you lay sit on the footings as sills. Walls across them
    start half a course higher, resting on the sills where they cross.
  - A log needs something under **both ends**: a footing (bottom course
    only), a log crossing beneath it, or the log below it in the same wall.
  - Where a log crosses another, it **rides high** and gets chalk marks at
    the joints. Switch to the axe and cut each notch, and it drops into
    place. Nothing can be stacked on a log until it's notched in.
  - Leave a gap in the lower courses and span over it for a **door** or a
    **window**. A door needs about five courses of opening.
  - Walls that close a loop make a **room**. A wall ending against another
    wall makes a T-junction, and its log ends poke through.
- **Roof (4, again).** Aim into a finished rectangular room. Its walls must be at
  least ~1.7 m high and level all round, and fully notched. Click to raise a
  gable roof with shakes, board gables and a ridge pole. It costs hewn timber.
- **Right-click** with a building tool takes a piece down and gives the
  materials back, unless something rests on it.

Round logs get clay chinking between the courses. Hewn timbers stack flush
with tight corners. What you build looks like what it's made of: bark in
plates along the logs and rings at their cut ends, grain along the hewn
faces and the gable boards, shakes in courses on the roof, granular stone in
the footings (see [the look](../render/README.md)). The old places and the
towns are drawn the same way, with paint, slate, tin and glass, and worn
with their age: moss on old roofs, rain streaks down the walls.

Everything you change is saved in your browser, separately for each world
seed. That covers felled trees, stumps, the shape of the ground, buildings,
fires and what you're carrying. Add `?clearbuild` to start over, or `?creative` to
skip the gathering.

## Files

```
index.js              plugs it into the game: the tools, the obstacles, what is saved
builder.js            the bench: aim, swing, hold, prompt — what a tool is, and kits
tools/                hands · axe · shovel · footing · wall · roof
buildings.js          footings, notched log walls, rooms, roofs (the rules)
forestry.js           felling, limbing, bucking, stumps, cleared plants
terrainEdits.js       digging, filling and grading on the 1 m vertex grid
inventory.js          what you carry
stake.js              the grade stake and its plane
obstacles.js          what work has to go round
previews.js           ghosts, grid dots, the shovel's ring
chips.js              wood chips and clods
aim.js                rays against ground and trunks
geometry.js           logs, timbers, chinking, piers, roofs, stumps, tools; the Mesher that puts them together
surfaces.js           what built things are made of, and the material that draws it: bark, grain, paint, stone, shingles, tin, glass
constants.js          dimensions: course height, overhang, pier range, reach…
```
