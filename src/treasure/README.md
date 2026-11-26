# Buried treasure

Somebody buried something out here and never came back for it, and their
map has come into your hands. It's on the adventures board (**N**): pick
*Buried treasure*.

**The map.** It unfolds as you set off: the country round about drawn in
ink on old paper, north up, with the lie of the land, the water and the
woods, the old place it starts from by name, a mark on the way, the legs
dotted out with their paces, and a red cross. Under it, what it says to do:

> Begin at Old Yates well.
> Thence 52 paces north-west, to a cairn.
> From the cairn, 30 paces west-south-west, and dig.

It starts at one of the [old places](../landmarks/README.md) near you (a
cabin, a ruined homestead, a hunting cabin, a tent, a well), so you can find
it on your own map (**M**): the banner points you there, and the hunt begins
as you arrive, before its door. Read the map again whenever you like: it's
in your pack (**Tab**), at hand while you're after it.

**Pacing it out.** Stand at the old place and the banner starts counting
your paces (*12 of 52 paces*), and says whether the way you're looking,
which is the way you'll walk, is on the bearing: *north-west, dead on*, or
*bear left*, or, well off it, which way you're facing. Turn to the bearing
and walk it: a pace is a walking step, about three-quarters of a metre, and they're
counted as walked, not as the crow flies, so go straight. Only on foot: not
on a horse, in a boat or swimming. Lost count? Go back to the last mark,
stand at it, and the count starts again. Wander far off and the banner
points you back to it.

The first leg ends at a mark someone left: a cairn of stones, a weathered
post with a cross cut in it, or a rusted pick driven into the ground. Come
to it and the count starts again from there. The second leg ends at nothing
you'd notice, unless you look: a patch of turned earth, a few stones kicked
up.

**Digging.** Hold **F** (on a touch screen, *dig*) and the hiker gets out
the spade and digs, in front of you. A hole takes a couple of seconds. One
in the wrong place turns up roots and stones, but says whether you're
close: *the earth is loose here* is within a few metres; *not far off,
though* is nearer than twenty. The holes stay open while you hunt (the
oldest are filled as you dig more). Dig on the spot and your spade strikes
wood: the chest comes up out of the earth. **F** opens it: a heap of gold
coins, and something else besides (a brass spyglass, a string of pearls, a
silver pocket watch…).

What you find is yours: your gold and your trinkets are listed in your pack
with what else is yours, and kept with your map marks. Nothing else of it
stays: like every [adventure](../adventures/README.md), the mark, the holes
and the chest are gone when it's over, and it happens to you alone. There's
no clock, and nothing out there to hurt you; your record on the board is
how often you've found one, and your quickest.

## Keys

| | |
|---|---|
| **N** | the board: *Buried treasure* |
| hold **F** | dig, in front of you |
| **F** | open the chest |
| (pack) *map* | read the treasure map |

## How it works

`hunt.js` plans a hunt and holds its rules, with nothing of the game in it:
from the old places near you (their doors, `doorOf`), two legs on points of
the compass, each a whole number of paces, the first to a mark and the
second to the spot, kept to dry, fairly level ground clear of trunks and of
anything built (`ok`), and to a way you can walk without swimming. The legs
run exactly on their bearings, so paced out true they end on the spot.
`Pacer` counts paces walked from a mark; `digAt` says what a hole turns up.

`run.js` is the hunt under way, as the board's contract has it
(`adventures/adventures.js`): what the banner says, the stages, the spade,
the chest. `index.ts` puts it on the board, offers the spade and the lid to
the act key, puts the spade in the hiker's hands while you dig (the tools
are put away: `builder.idleWhile`), draws the map, and keeps what you find.

```js
world.adventures.begin('treasure')   // set off: you're sent to where the map starts
world.treasure.plan                  // the map you have: start, legs, where it's buried
world.treasure.hunt                  // the one under way: stage, pacer, holes, chest
world.treasure.map()                 // read the map
world.treasure.finds                 // what you've dug up
```

## Files

```
index.ts      plugs it into the game: the board, the spade and the lid (F), the map, what you find
hunt.js       where it's buried and the way there; counting paces; what a hole turns up; what you keep
run.js        the hunt under way: the banner, the stages, digging, the chest
chart.js      the treasure map: the country surveyed, drawn on old paper; its panel
treasure.css  the map's panel
look.js       (fetched) the mark on the way, the turned earth, holes, the chest
sound.js      the spade striking wood, the lid and the coins
pictures.js   the map, the spade, the chest and the coins, in your pack
```
