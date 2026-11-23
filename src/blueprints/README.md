# Blueprints

A blueprint is a building written down: its footings, its logs course by
course, its roofs. Pick one, stake it out, and the hiker puts it up for you,
piece by piece, with the same tools and the same rules as building by hand.

- **Plan (6).** A ghost of the plan follows the crosshair, green where it
  will go and red where it won't, and the prompt says why (too steep to
  level, a boulder in the way, another building too close) and what it
  takes in wood, stone, clearing and levelling. **Right-click** turns it a
  quarter. Press **6** again for
  the next plan. Four come with the game: a small cabin, a cabin with
  windows, a two-room cabin and a hewn-timber hut.
- **Click** to stake it out. The plan stays on the ground as a pale-blue
  ghost of whatever is still to go up, whatever tool you hold.
- **Click** again (or press **B** with any tool in hand) and the hiker gets
  on with it: clears the site, levels it if it needs it, gathers what it
  hasn't got,
  walks round the site rather than through it, digs and sets each footing,
  lays the logs a course at a time, cuts every notch with the axe and
  raises the roof. It's no faster than you: a small cabin takes two or three
  minutes with the wood to hand, and about seven from nothing, levelling a
  hillside and felling eight trees included.
- It stops and says why when it can't go on: too steep to level, a boulder
  where it can't level round it, nothing left to gather within reach. Put
  it right and **click** to carry on. Touch the controls and you have the hiker back
  (it pauses). Putting the plan tool down pauses it too.
- **Right-click** twice pulls up the stakes. What is built stays built.

The site is saved with your other things, so it's there after a reload and
the hiker picks up where it was. What is built is the world's, saved and
shared like anything you build by hand.

**Clearing.** First, whatever stands on the site comes off it: every tree
within a metre and a half of the footprint is felled, from the site's side
so it falls away from it, and bucked into logs for the build; the stumps,
and any that were there already, are grubbed out; and bushes, ferns, old
fallen logs and small stones are spaded off the pad. A trunk lying across
the site is bucked away too. Boulders stay where they are, as they do for
anyone: the ghost goes red if one stops the ground at a footing being
levelled. The prompt says what's to clear: *clearing 2 trees · a stump*.

**Levelling.** All of a building's footings have to come up to one level,
and a pier only makes up about 25 cm, so on these hills most sites need
levelling first. If the footings can't all reach one level, or ground would
stand above the sills, the hiker takes the shovel to it before setting any
stone: a level pad under the footprint and a metre round it, cut and filled
with the same spade strokes you'd make, clearing the undergrowth and
pocketing small stones as it goes. The pad's grade sits a pier's height
under the footings, where the cut pays for the fill: when you're gathering
your own materials, a little lower, so it cuts before it fills and never
runs short of soil, and keeps what's over. Until it's done, the ghost shows
the grade as a sheet: ground poking through it is to be cut, and where it
floats, filled.

It can't level where a footing would need more than 1.6 m of cut or fill
(the most a spade can move the ground), where roots or a boulder stop the
spade at a footing, or where a levelled footing would be under water. The
ghost goes red and the prompt says which; fell the tree, try another spot,
or turn the plan.

**Gathering.** When a piece needs something you haven't got, the hiker goes
and gets all that the rest of the plan will need of it, then carries on:

- **Stones**: picks up small ones, nearest first.
- **Logs**: fells trees, limbs them and bucks them into logs, the most wood
  for the walk first. It stands between the tree and the site, so trees
  fall away from what's being built, and leaves alone anything within a
  few metres of the levelled ground. A tree already down nearby is bucked
  before another is felled. Enough is cut for the timber still to hew.
- **Timber**: hews logs square, as many as the walls can spare.
- **Soil**: should levelling run short, it digs shallow pits, 40 cm at
  most, round the site.

It goes up to 40 m from the site. Stumps stay where the trees stood, and
what's left over stays in your pack. With `?creative` there's nothing to
gather.

**Your own.** Aim the plan tool at a building you've put up and **click** to
copy it down as a blueprint; doors, windows and all come with it, since
they're only gaps in the courses. Your blueprints are kept in this browser,
for every world. From the console:

```js
world.blueprints.list()                  // the plans to hand
world.blueprints.export('Small cabin')   // one as JSON, to pass on
world.blueprints.import(json)            // ...and to take one in
world.blueprints.rename('My building 1', 'Boathouse')
world.blueprints.remove('Boathouse')
```

The format is in [`plan.js`](plan.js), and the
plans that ship are written as walls with openings in
[`plans.js`](plans.js).

## Keys

| | |
|---|---|
| **6** | the plan tool; again for the next plan |
| **B** | build the staked-out blueprint for you (again to pause) |

## Files

```
index.js              plugs it into the game: the plan tool, B, the site you staked out
plan.js               what a blueprint is; putting one down; what to do next
grade.js              levelling a site: when, to what grade, which spot next
gather.js             what a plan still needs, and where round the site to get it
clear.js              what has to come off the site first, and in what order
plans.js              the blueprints that come with the game
library.js            those, and the ones you copied, kept in this browser
foreman.js            clearing, levelling, gathering for and building a site
ghost.js              what's still to go up, drawn where it will stand
tool.js               the plan tool (6)
pictures.js           what a blueprint looks like in your pack
```
