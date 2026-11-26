# The Metro

Washington's Metro, life size, under and over [the city](../washington/README.md)
where it really runs: all six lines (Red, Orange, Blue, Silver, Green and
Yellow), each of the two tracks of each where it really is, and every station
on them in life-size Washington, 65 of them, from Friendship Heights to
Branch Avenue, Ballston to Landover, King Street to Silver Spring. Its trains
run on the clock, and you can ride them.

**Getting there.** Its stations are on the map (**M**), under *metro* in its
routes: *go here* sets you down on the street in front of the station's
entrance, facing its brown pylon (the M, and a band of colour for each line
that stops there). In your pack, *Metro: the nearest station* says which it
is and how far. The lines are on the map too, in their colours, side by side
where they share a track, with every train where it is right now.

**Going down.** At a station under the street, the escalators go down from
beside the pylon into a well walled in granite: walk down them, and you're
on the platform. (Or **F** at the top.) At one over the street, on a viaduct
or the ground, **F** takes you up to its platform.

**The stations.** Under the street they're the vaults everyone knows: a
barrel of coffered concrete over the tracks and the platforms. No daylight
gets down there, and your eyes get used to the dark; what lights it is the
row of lamps hidden in a trough along the vault's foot, washing light up
the coffers, so the vault glows warm low down and darkens towards its crown,
the sides of each coffer that look down catching the light. The platforms
are red-brown hexagonal tile edged with pale granite, the edge overhanging
the trackbed, with a row of round lights set in the granite that flash as a
train comes in. Slim brown pylons stand along them with the station's name
facing the tracks, benches between; and on posts over the platform, the
boards that say when the next trains come, as Metro's do (LN, CAR, DEST,
MIN: `ARR` as one draws in, `BRD` while it stands). At one end a mezzanine
spans the vault, its fare gates across it, its escalators (yellow-edged
steps, black handrails) coming down to each platform. Where lines cross,
at Metro Center, Gallery Place, L'Enfant Plaza and Fort Totten, the station
has a level for each, one under the other. Over the street, a platform is
under the canopy Metro's open-air stations have, a concrete roof that rises
to either side like a pair of wings. Each platform is where the map has it,
an island between its tracks or one beside each.

**Riding.** A train comes in (six stainless-steel cars of the 7000 series,
the black mask of its front round the windscreen with its line's colour and
where it's going lit behind the glass, and again along each car's side;
barriers across the gaps between the cars), its brakes squealing as it
draws up, and stands half a minute. **F** beside one of its cars gets you on, into a seat by the window;
the HUD says where it stops next and when. The doors' chime sounds, and it
pulls away down the tunnel. At a station, **F** gets you off onto the
platform by its doors. Where the line goes on past life-size Washington (to
Shady Grove, Vienna, Franconia, Ashburn…) the train leaves you at the last
station here, and runs on out; it comes back in on the other track as long
after as the run out and back would take. At Branch Avenue, the end of the
Green Line, it stands a while and goes back. At the end of a platform, **F**
takes you up the escalators to the street, at the station's entrance
nearest you. **F** in the middle of a platform where lines cross takes you to
the other line's.

| | |
|---|---|
| **M**, then *metro* | the stations: pick one and *go here* |
| **F** at an entrance | down to the trains (or up, to a platform over the street) |
| **F** beside a standing train | get on; on a train at a station, get off |
| **F** at the end of a platform | up to the street |
| **F** where lines cross | to the other line's platform |
| **Tab** | your pack: *Metro: the nearest station* |

**When the trains run** is worked out from the clock on the wall
(`timetable.js`), as the railway's are: every train of a service keeps one
timetable, eight minutes apart, so everyone in a world sees the same train at
the same platform, and nothing about it is sent or saved but which train
you're on. Each service is a way each way: the Red Line Shady Grove to
Glenmont and back; the Orange, Vienna to New Carrollton; the Blue, Franconia
to Largo; the Silver, Ashburn to New Carrollton and to Largo; the Green,
Greenbelt to Branch Avenue; and the Yellow, Huntington to Greenbelt and to
Mount Vernon Square, as OpenStreetMap has them.

**Where it is** is OpenStreetMap's: each service is a relation of the track
it runs on, each way, and the map says of every stretch whether it's in a
tunnel (and how deep, by its layer), on a bridge, or neither, and where each
station's platforms are. The entrances are the District's own survey of
them (Open Data DC), which says where each is but not which way its
escalators go down: the importer turns each, and moves it a few metres if it
must, so that its well lies on the sidewalk or a plaza, clear of the
buildings, the streets and the street trees round it
(`tools/metro/wells.js`, from the city's own tiles). How high the rail runs isn't on any map: the importer
works it out from the ground the city stands on (`tools/metro/profile.js`).
In a tunnel it's as deep as the map's layer says (12 to 25 m), with earth
over the tube all the way; on a viaduct it's well up over the street, on the
ground it's on its ballast; it never climbs more than 4 %; and every
platform is level. Where lines cross under a station, the one the map puts
lower is ten metres under the other. A tunnel under a valley goes deep to
keep under it: Woodley Park, between Rock Creek's valley and the hill, is
forty metres down. The map often draws two tracks side by side nearer than
two trains can pass; the importer sets each off the other until they're
4.1 m apart, middle to middle, easing them out to it.

**Life size, and where it stops.** Washington is life size out to a circle
11.6 km round its middle; past that the land is the 1 : 5 world, which holds
the real Metro's outer reaches (Shady Grove, Dulles) only as the countryside
it's drawn on. So the track here runs to the edge of the life-size land and
stops, and the stations past it aren't here. The trains still say where
they're going.

**What's drawn.** Under the street each track is in a tube of its own, its
faces looking only inwards, so where two run side by side or cross they open
into each other rather than showing each other's backs; it's drawn only
while you're under the street (in a station, or on a train in a tunnel).
Along a tube's outer wall runs the safety walk with a lamp over it every so
often and a blue light every 240 m (a phone, and the switch for the third
rail); along the other, the cables on their brackets. A tunnel is dark but
for those, and the light spilling from your train's windows onto its walls.
Over the street: a concrete box girder on piers, with a parapet on its outer
side, or a bank of ballast with ties; rails and the third rail everywhere.
Track and stations over the street stand up within about a kilometre of you,
a piece at a time; the trains within 800 m. The forest's own trees and grass
keep off the track over the street, and out of the entrances' wells. An
entrance's well is cut into the ground and the street's paving
(`world/cuts.js`), for the four nearest you, and the top of its escalators
is under a canopy of glass on steel ribs; where the ground falls away from
the well, its granite parapets go on down to meet it.

**Heard.** A train's rumble, the whine of its motors, the squeal of its
brakes in the last few metres, and the chime of its doors; under the street,
the hum of the fans that move the air through the tunnels.

**Nothing about the land changes for it.** The ground isn't cut or filled:
the tunnels go under it, and the track over it stands on it as it is.
Building goes round the track over the street and the entrances.

From the console:

```js
world.metro.stations()               // the stations, their lines, under or over the street
await world.metro.go('dupont-circle') // to its entrance, on the street
await world.metro.down('dupont-circle') // onto its platform
world.metro.soon()                   // (to try it out) the next train at your platform, in 5 s
world.metro.trains()                 // the trains drawn now
world.metro.aboard()                 // the train you're on: its line, where it's going, where it stands, its next stop
world.metro.toTrain()                // (to try it out) to the nearest open door of a train standing at your platform
world.metro.exits()                  // the feet of the escalators up, on the platforms stood up
world.metro.board()                  // what the boards say on the platform you're on
world.metro.stats()                  // what's stood up, and what's waiting to be
```

## Bringing it in

```bash
npm run metro            # (tools/metro.mjs; add --levels for each station level's depth and platforms)
npm run metro -- --wells # only turn the entrances' wells clear of the city again, in the metro.js there is: nothing fetched
```

It fetches each line's route relations from OpenStreetMap (every service,
each way) and the District's survey of the stations and their entrances
(kept in `node_modules/.cache/metro`), grows Washington's ground the way the
game does, and writes `metro.js` (the lines; the stations and their
entrances: what the map and your pack know of it from anywhere) and
`system.js` (fetched when you come near: the tracks, how high each runs, the
levels and their platforms, the services and where they stop). Run it again
to bring them up to date.

The track and the stations: © OpenStreetMap contributors, ODbL. The
entrances: Open Data DC (DC GIS), "Metro Station Entrances (Regional)",
CC BY 4.0.

## Files

```
index.ts        plugs it into the game: sending for it, standing it up round you, trains on the clock, the boards, the lamps under the street, riding, the entrances, the map, sound, which train you’re on
metro.js        (written by tools/metro.mjs) the lines; the stations, their entrances
system.js       (written by tools/metro.mjs; fetched) the tracks and their heights, the levels, the services
network.js      that, read into the world: routes, where along them, a level's own frame
timetable.js    where every train is, by the clock on the wall
space.js        the platforms, the tunnels and the entrances' wells, as a space you can be in (world/spaces.js)
look.js         (fetched) the materials (lit by their own lamps under the street; the platforms' tile), and what builds it all:
track.js        tunnels, viaducts and their piers, ballast and ties, rails
stations.js     the vaults, platforms, mezzanines and escalators, canopies; the entrances
trains.js       the cars, inside and out
signs.js        the pylons', the platforms' and the trains' signs, and the arrival boards, painted on a canvas
sound.js        the trains' rumble, whine and brakes, the door chime, the fans' hum; a platform underfoot
onMap.js        the lines and the trains on the map
pictures.js     the Metro in your pack
```

The importer is `tools/metro.mjs`, `tools/metro/profile.js` (how high
the rails run) and `tools/metro/wells.js` (which way each entrance's well runs).
