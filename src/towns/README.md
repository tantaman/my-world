# Towns

Further out than the old places, about one in every square kilometre or two,
there are towns. Each is one of:

| | |
|---|---|
| **western town** | a wide dirt street of false-fronted stores, a two-storey saloon with a balcony over the boardwalk, a hotel, a stone bank, the sheriff's office with a cell at the back, a livery stable and a smithy; a water tower and a windpump where the road comes in, and a church and a boot hill past the far end |
| **ghost town** | a western town nobody has lived in for fifty years: boards gone, holes in the roofs, the glass broken, some buildings fallen in altogether, and tumbleweeds bowling down the street in the wind |
| **village** | painted clapboard cottages with shutters and porches, behind picket fences and flower beds; a shop under a striped awning, an inn, a smithy, a bandstand on the green, and a white church with its steeple and its graveyard |
| **abandoned village** | a village left to the weeds |
| **eerie town** | tall dark houses with steep roofs and towers, crooked and leaning, behind iron railings and dead trees, along a lane through the deep woods that ends at a church and a graveyard with a tomb in it |

Each has a name (*Copper Gulch*, *Ashby's Camp*, *Little Wrenford*,
*Ravenmoor*) that comes up as you walk in, and is on the map (see [The
map](../map/README.md)) as a badge with its street drawn in at every zoom
and its roofs close up. It's listed under *nearby* like the old places, so
you can pick one out, track it and go; once you've been, its badge turns
paler.

**People.** Some towns have people and some don't. In a western town or a
village they stroll from door to door, stand about, turn to look at you as
you pass (their eyes first, then their heads), and when you walk up to one
they wave and say something (*"Howdy, stranger."* *"Lovely day for a
walk."*) in a few syllables of voice. Each has a face of their own, and is
dressed for their town: a waistcoat and a watch chain or braces and a belt,
a felt hat, a bowler, a straw hat; a long dress with an apron over it and
a bonnet, the hair drawn back into a bun; a frock coat and a top hat in the
eerie town. They walk the way the hikers do, and come into view a few at a
time as a town is stood up. After
dark most go indoors and the windows light up; in a western town a couple
stay out, and the piano in the saloon plays on into the small hours. A
village's church strikes the hours, and somebody's dog barks now and then. A
town with nobody in it keeps its doors open, its windows dark, and its
signs creaking in the wind.

The people of an eerie town don't talk. They stand where they are and watch
you. Look away and look back, and one is a little closer; walk right up to
one, and it isn't there, and there's a whisper where it stood. The church
bell tolls once, low, every so often, and here and there a candle burns in
an upstairs window.

**Going in.** In through the door of a store, the saloon, a house or the
church, onto its floorboards, past the counter and the shelves, the bar and
the piano, the pews; the camera stays inside the walls with you. Walls,
porches, steps, fences, barrels and gravestones are solid, and animals go
round them.

**Where they are** is grown from the seed, like the old places
(`towns.js`). The world is cut into 1 km squares and most have a town. Each
looks for the flattest dry ground in its square of the sort its kind likes
(a western town in the open, an eerie town in the woods), lays its main
street along the lie of the land, and puts a building wherever the ground
beside the street is level enough to stand one on a foundation. None is
within a few hundred metres of where you first arrive, on top of an old
place, or in the mouth of a cave, and the nearest is usually a run of a
kilometre or less. Nor is one grown on, or near enough to change, a real
place brought in from a photo (see [Hikes](../hikes/README.md)): what is
there is what is really there.

**Nothing about the land changes for them**, any more than for the old
places (see [What a save actually holds](../save/README.md#what-a-save-actually-holds)):
no ground is levelled and no tree is moved. The buildings stand on
foundations, taller on the downhill side; the street is laid over the ground
as it is, rutted where the wheels run, cut along the land's own triangles so
the grass never shows up through it; the trees, bushes and stones in the way are hidden as the town
comes into view, and grass doesn't grow on the street or through the
floors. Building goes round a town, and if an old save has something built,
a fire laid or a stump left where one of its buildings would stand, that
building isn't there.

Everyone in a world finds the same towns, with the same saloon in the same
place and the same people in it. Which ones you've been to is yours, as
with the old places; the people are like the wildlife, nobody's to keep, so
where they have wandered isn't saved or shared.

From the console:

```js
world.towns.list()                  // towns within 3 km, nearest first
world.towns.nearest('ghost')        // the nearest of a kind: western ghost village deserted eerie
await world.towns.visit('village')  // walk into the nearest village
```

The kinds are a table in `kinds.js` (what each is called, how common, the
country it suits, how many people, what stands along its street), and each
building's look is a function in `buildings.js`.

## Files

```
index.js              plugs it into the game: towns stood up as you come near, their people and sounds, on the map
towns.js              where they are, grown from the seed, and how each is laid out along its street
kinds.js              the kinds of town and the buildings in them, in tables: names, habitat, people
buildings.js          what each building looks like: false fronts, a saloon, cottages, a church...
people.js             the townsfolk (../people/folk.js), stood up a few at a time: strolling, waving, watching
look.js               those two, fetched when the first town is about to be stood up
sound.js              a church bell, a saloon piano, a creaking sign, a dog, a hello, a whisper
```
