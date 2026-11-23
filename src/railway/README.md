# The railway

Out in the forest, a few kilometres apart, a narrow-gauge railway runs round
a loop of it: a few kilometres of track with three to five stations, and two
or three little trains going round and round, each a wood-burning engine
(three pairs of red driving wheels, a diamond stack, a brass dome), its
tender stacked with firewood, and two open cars with benches.

| | |
|---|---|
| **Y**, or **M** then *stations* | the stations within reach, beside the map: pick one (click, or its number) to go there |
| **F** beside a standing train | get on |
| **F** at a station | get off |
| on a pad | **Y** gets on and off, as it does everything at hand (see [Acting](../act/README.md)); the stations are a tab beside the map (**select**), where the d-pad goes from station to station and **A** picks |

**Getting there.** Press **Y**, or open the map (**M**) and
its *stations* tab, for the stations within about 7 km, nearest first: which line each is on, how far it is and
which way, and when the next train is due. Pick one and you're on its
platform, looking along it; **Y** again closes the map. The lines are on the map, with each train
where it is right now, and the stations are places there like the old ones:
you can track one and walk.

**Riding.** When a train stands at the platform, **F** beside one of its cars
gets you on: you sit on a bench, and the HUD says where it stops next and
when. It stands about 25 seconds at each station, whistles, and pulls away.
Your tools are put away while you ride, and the camera swings round the bends
with you. At the next station, **F** gets you off onto the platform beside
your car. Close the game on a train and you open on it again, wherever it has
got to.

**Where the lines are** is grown from the seed, like the old places and the
caves (`lines.js`). The world is cut into 3 km squares, and a bit over half
of them get a chance of a line: a loop round the middle of the square,
surveyed the way a railway is, along the contours. It's first a ring of 96
points, each at one of 31 distances out, chosen all together for the least
the land rises and falls along the way round, keeping off lakes, the start of
the path, the old places and the mouths of caves. Then a smooth curve through
them, no bend tighter than 50 m, and the rail's height along it: never
climbing more than 6 % (a logging line's grade), never under the ground, and
well over any water. Where the rail runs low it's on a ballast bank, grassed
over at the sides; where it's more than 4 m up, on a timber trestle. The
stations go where the track can be levelled along a platform beside dry
ground for a house. A square whose loop would need a trestle taller than
22 m, or a third of its length on trestles, has no line: there are lines in
the hills and the lake country, and hardly any in the mountains. Nor is there
one in a square any of which is within a hike's reach (`src/hikes/`): that
land is the real place, not the forest's.

**Nothing about the land changes for it.** The ground isn't cut or filled:
the track stands on it as it is, and the trees, bushes and stones in its way
are hidden as their chunk grows. Building goes round the track and the
stations. A line that would run where an old save already has something
built or a fire laid isn't there. Where the stations are is pinned in
`test/golden/railway-*.json`, since a station can be tracked by its id.

**When the trains run** is worked out from the clock on the wall
(`timetable.js`): every train on a line keeps one timetable, a fraction of it
apart, so everyone in a world sees the same train at the same station, a
train you watched leave is further round the line when you come back, and
nothing about it is sent or saved. In a shared world, which train you're on
is yours, and is passed on so the others see you sitting on its bench.

**How it sounds.** The engine chuffs four beats to a turn of its driving
wheels, slow and heavy pulling away and quick at speed; the wheels
clickety-clack over the rail joints axle by axle down the train; it hisses
standing, squeals drawing up, and whistles: two short leaving a station, one
long coming up to one, and long, long, short, long at a footpath crossing.
Underfoot on the ballast, loose stone crunches. Trains have a bus of their
own: `world.sound.volume('trains', 0.5)`.

From the console:

```js
world.railway.list()                  // the stations within reach, and when trains are due
world.railway.go('station:0:-1:2')    // onto a station's platform
world.railway.soon('station:0:-1:2')  // (to try it out) the next train there in 5 s
```

## Files

```
index.js              plugs it into the game: Y and the stations tab, riding, the map, what's kept clear
lines.js              where the lines run, grown from the seed: the survey, the rail's height, stations
timetable.js          where every train is, by the clock on the wall
track.js              ballast banks, ties and rails, trestles, platforms and station houses
trains.js             the engine, tender and cars; wheels and rods; the smoke
sound.js              chuff, clatter, hiss, brakes, the whistle; ballast underfoot
onMap.js              the lines and the trains on the map
panel.js              the stations to go to, and when the next train is due (a tab beside the map)
railway.css           the stations tab's look
pictures.js           what the railway looks like in your pack
```
