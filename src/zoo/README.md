# The National Zoo

The Smithsonian's National Zoological Park, in Rock Creek Park in
Washington, DC: life size, where it really is, with its buildings, its
exhibits and its animals.

**Getting there.** It's in Washington, 770 km east of where you start, on
the real Earth as the rest of the world is (see
[the real Earth](../world/README.md#the-real-earth)). Open the map (**M**):
the zoo is under *zoo* in its routes, with every exhibit in it, and *go
here* sets you down at the Connecticut Avenue entrance (or on the path in
front of the exhibit you picked, facing it). It's also in the *hikes* list
beside the map, as **National Zoo**, whose walk is Olmsted Walk: from the
entrance down the hill past the Great Cats to the lower end of the zoo,
1.3 km and 51 m down. All round it is [Washington](../washington/README.md),
life size too: out of the gate is Connecticut Avenue. **Talbot Airfield**,
for flying in, is out past the edge of the city, 18 km east (see
[Airports](../airports/README.md)). In your pack, *National Zoo: where it
is* says how far it is from wherever you are.

**Life size.** The rest of the world is the real world at 1 : 5; the zoo is
at 1 : 1. Its ground is the real ground, a height every two metres from the
USGS's lidar, so Olmsted Walk runs downhill as it does, the paths are cut
into the hillside, and Rock Creek runs along the bottom, 20 m wide. Out past
the zoo's own fence it gives way, over half a kilometre round its edge, to
Washington's ground, life size as well and at the same heights (the zoo is
laid over the city's, which is coarser).

**The buildings** are as big as they are, and stand where they stand, with
the roofs they have: Washington flew the whole city with lidar and traced
every roof in it, every slope with its real height at every corner, and
each building here is that roof with its walls dropped to the ground. The
Reptile Discovery Center's tiled roofs, the Elephant Community Center's,
the Great Ape House, the Small Mammal House and the Bird House in brick,
Amazonia with its glass, the Panda House, Think Tank, the mesh dome of the
Great Flight Exhibit, the Visitor Center, the cafés: 197 of them in all, with
windows in rows along their walls. You can't go in.

**The exhibits** are OpenStreetMap's: each where the map draws it, fenced as
its animals want (a tall wire fence for the big cats, a timber rail at the
Kids' Farm, a wall for the bears and the elephants), with nothing between
you and Lion/Tiger Hill but its moat. Each has a sign by the path with its
name on it. Where the map has only a point (the Kids' Farm's goats and
cows, the zebras at the Cheetah Conservation Station), the yard is the open
ground round it, out to the paths and the map's own fences; where the map
fences a yard in round it (the goats'), that yard is theirs, behind that
fence and no other. Those it draws over a building (the
Reptile Discovery Center, the Great Ape House, Amazonia) are indoors, and
have a sign at the door.

**The animals**, over fifty kinds of them: lions (the males with their
manes), tigers and Sumatran tigers, cheetahs, clouded leopards and a fishing cat on
Asia Trail; two giant pandas, sloth bears, Andean bears and red pandas;
four Asian elephants; zebras, Przewalski's horses, addax, kudu and
sitatunga; gorillas and an orangutan, lemurs and monkeys; sea lions and
gray seals swimming laps of their pools on the American Trail, with beavers,
river otters, bald eagles on their perches, ravens and wolves; flamingos,
ostriches, rheas, cassowaries, cranes and bustards; and at the Kids' Farm,
alpacas, goats, cows, pigs, a donkey and chickens. They amble about their
yards, graze, sit and lie down, and turn to look at you when you come near
the fence; now and then the lions roar, an elephant trumpets and the sea
lions honk. Each keeps the whole of itself in its yard, nose and tail, clear
of the fences and of any wall across it. Each kind you see is counted (it's
yours, saved), and the zoo's place on the map says how many.

**The paths** lie on the ground as it's drawn, a few centimetres over it,
so you walk on them rather than in them.

| | |
|---|---|
| **M**, then *zoo* | the zoo and every exhibit in it: pick one and *go here* |
| **Tab** | your pack: *National Zoo: where it is* |

From the console: `world.zoo.exhibits()`, `await world.zoo.go()` (the
entrance) or `await world.zoo.go('giant-panda')`, `world.zoo.seen`.

## Bringing it in

Two importers, run once and committed: the ground, as a real place
([Hikes](../hikes/README.md)) brought in at 1 : 1, and the zoo on it.

```bash
npm run hike -- /dev/null --name "National Zoo" --id national-zoo \
  --lat 38.92856 --lon -77.04691 --bearing 95 --hour 14 \
  --middle 38.92854,-77.04957 --from 38.92998,-77.05491 --to 38.92730,-77.04556 \
  --scale 1 --radius 850 --fade 450 --cell 10 --fine 2 --fine-margin 500 \
  --dem 3dep --country "deciduous forest" --cover 0.55 --species -0.7 --snow none
npm run zoo
```

`npm run zoo` (`tools/zoo.mjs`) fetches OpenStreetMap round the zoo, and the
city's roofs, and writes `plan.js` (what it's built from: 350 kB, fetched in
the game the first time you come near) and `exhibits.js` (what the map knows
of it from anywhere). Run it again to bring them up to date; nothing moves.
Who lives in an exhibit is said by its name in `species.js`, which is where
to add a kind of animal the map comes to have.

Buildings: Open Data DC, "Buildings (Detailed Roof)" (DC GIS), CC BY 4.0.
Elevation: the USGS's 3D Elevation Program. Everything else: © OpenStreetMap
contributors, under the [ODbL](https://www.openstreetmap.org/copyright).

## Files

```
index.ts        plugs it into the game: where it is, standing it up, the forest kept off it, the map, what you've seen
exhibits.js     (written by tools/zoo.mjs) each exhibit, and where on the path it's seen from
pictures.js     the zoo in your pack
onMap.js        the zoo on the map, close up: its pens, paths and buildings
sound.js        its animals' voices: a lion's roar, an elephant's trumpet, a sea lion's honk
look.js         (fetched) a Zoo: built a step at a time, and what the forest keeps off it
plan.js         (written by tools/zoo.mjs; fetched) what it's built from
site.js         the plan laid out in the world: what's on each square metre of it, the pens
buildings.js    the buildings: their surveyed roofs, their walls, their windows
grounds.js      the paths, plazas and footbridges; benches, kiosks, fountains, statues
fences.js       walls and fences, the map's and round the pens; the signs
species.js      who lives there: what each looks like, how many, what fence, how much room
bodies.js       their bodies: cats, bears, hoofed, elephants, apes, monkeys, small ones, birds, seals
residents.js    the animals in their pens: where they go, what they do
```

The importer is `tools/zoo.mjs` and `tools/zoo/plan.js`.
