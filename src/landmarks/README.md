# Old places

Out in the forest, few and far between, are places somebody left: about one
every 400 m, so a long walk turns up two or three. Each is one of:

| | |
|---|---|
| **old cabin** | a notched log cabin on stone piers, its door hanging open, a stone chimney, a bunk and a table inside, firewood stacked under the eaves |
| **ruined homestead** | a few courses of wall, a roof beam fallen in, a rusted stove, and the chimney still standing |
| **hunting cabin** | a board shack on posts at the edge of the woods, looking out over open ground; a tin roof, antlers over the door, a game pole |
| **tent** | an A-frame pitched by a ring of stones round a cold fire, a pot on a tripod, a log to sit on, a crate with a lantern |
| **well** | a round stone well with a windlass, a bucket on the rim and a little roof |
| **dock** | planks out over a pond or a lake, and a rowboat tied up at the end, riding the water |
| **canoe** | turned over on two logs on the bank of a river, a pond or a lake, a paddle in the grass |

Each has a name (*Pellerin cabin*, *Old Yates well*, *Ellery dock*), and every
one is on the map (see [The map](../map/README.md)), so you can pick one out, track
it, and go and find it. When you get there its name comes up, and it's
remembered that you've been: its badge on the map turns paler.

You can go in. Walk up the steps and over the threshold of a cabin onto its
floorboards (they sound like it), and the camera stays inside the walls with
you. Walk out to the end of a dock and step down into the boat. Walls, steps,
woodpiles, wells and tents are solid, and animals go round them.

**Where they are** is grown from the seed, like the trees (`src/landmarks/sites.js`):
everyone in a world finds the same cabin in the same place, and nothing about
them is saved but which you've visited. The world is cut into 300 m squares,
and a bit over half of them have something in them. Each kind looks for
somewhere that suits it: a cabin wants dry, fairly level ground in the woods
near a footpath, with its door turned to the path; a hunting cabin, the edge
of the woods with open ground to look out over; a tent, open ground within
reach of water; a well, a meadow near a path; a dock, the shore of a pond or
a lake, deep enough at the end for a boat; a canoe, a river bank or a shore.
None is put within 150 m of where you first arrive, and none stands on a real
place brought in from a photo (see [Hikes](../hikes/README.md)), which has
what is really there.

**Nothing about the land changes for them.** A save is the difference from
what a seed grows (see [What a save actually holds](../save/README.md#what-a-save-actually-holds)),
so the ground isn't levelled and no tree is moved: a site is found where the
land already suits it, and what stands there stands on piers or posts over
whatever slope is left, taller on the downhill side. The trees, bushes and
stones that would stand inside one are hidden as it comes into view, the way
a felled tree is, and grass doesn't grow through its floor. Building goes
round them, and a blueprint can't be staked over one. If an old save already
has something built, a fire laid or a stump left where a site would be, that
site isn't there.

From the console:

```js
world.landmarks.list()            // what's within 600 m, nearest first
world.landmarks.nearest('dock')   // the nearest of a kind
```

Kinds are a table in `src/landmarks/kinds.js` (what each is called, how
common, where it suits it, the ground it covers, its map glyph), and each
one's look is a function in `src/landmarks/models.js`.

## Files

```
index.js              plugs it into the game: old places, stood up as you come near and on the map
sites.js              where they are, grown from the seed: which kind, where it suits it
kinds.js              the kinds, in one table: names, rarity, habitat, footprint, glyph
models.js             what each looks like: cabins, a ruin, a tent, a well, a dock and boats;
                      and the kit (piers, floors, steps, weathering) it lends to others
                      (fetched when the first one is about to be stood up)
```
