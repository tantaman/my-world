# The DC Improv

The comedy club in [Washington](../washington/README.md), where it really is:
**1140 Connecticut Avenue NW**, between L and M Streets, a block up from
Farragut North. Out front there's a black canopy over the door with
*DC IMPROV* in red neon along it, a blade sign up the front of the building,
and a poster case either side of the door with what's on tonight. The club
is downstairs, under the building, as it really is.

**Getting there.** It's on the map (**M**) under *Washington* in its routes,
as *DC Improv*; *go here* sets you down on the pavement facing its door.
In your pack, *DC Improv: what's on* says the next few shows and how far
the club is.

**Going in.** **F** at the door takes you down the stairs to the lobby: the
box office, the week's shows on a board, headshots of who's coming up, and
two ways in. Straight ahead is the **Main Showroom**: tables for two in
rows, a candle on each, the bar along the back, and the stage in front of
the brick wall with *DC Improv* in neon on it. Off to the side is **the
Lounge**, the little room, with rows of chairs and a low stage. **F** at the
foot of the stairs takes you back up to the street.

**The shows** are on Washington's clock, Eastern time, whoever is visiting
and from wherever (not the forest's hour, which is your own), the way the
Metro's trains are. A show that starts at 8:00 pm starts when it's 8:00 pm
on Connecticut Avenue, for everyone at once, and if you walk in halfway
through you come in on the line they're on. The doors open half an hour
before; the room fills up, the music's on, people are talking. Then the
lights go down.

| | Main Showroom | the Lounge |
|---|---|---|
| Monday | | 8:00 pm open mic |
| Tuesday | | 8:00 pm improv |
| Wednesday | 8:00 pm stand-up | 8:30 pm improv |
| Thursday | 8:00 pm stand-up | 8:30 pm improv |
| Friday | 7:30 and 10:00 pm stand-up | 8:00 and 10:30 pm improv |
| Saturday | 7:00 and 9:30 pm stand-up | 3:00, 8:00 and 10:30 pm improv |
| Sunday | 7:00 pm stand-up | 4:00 pm improv, 8:30 pm open mic |

The club is open from noon until one in the morning; outside those hours
F at the door reads you the schedule. A show runs eight to ten minutes.

- **Stand-up.** The voice from the booth, then the host, Dana Okafor, who
  opens and brings up three comics, the last the headliner (Earl Simmons
  on a weekend). Who's on is different every night, and the same for
  everyone on the same night.
- **Improv.** Point of Order, the house troupe, makes scenes up from what
  the room shouts out: a place, an expert, someone's job on a first date.
  When the host asks for a suggestion, **F** shouts one, and the scene is
  the one you shouted for.
- **Open mic.** The host and five comics, a couple of bits each.

You hear it: each comic says their lines aloud in a voice of their own (the
browser's own speech: as many voices as it has, picked to suit them), and
the room laughs when they've said them, a chuckle or a roar, with applause
when somebody walks on or kills. The words are on the screen as they're
said, whether or not the browser can say them aloud, and whether or not
the sound is on. **F** beside an empty seat sits you down in it (and gets
you up again). Watch two minutes of a show and you've seen it: the shows
you've seen are yours, saved.

**What's real and what isn't.** The club, its address and the building it's
under are real. Its comics are not these: everyone on the bill here, and
every joke they tell, is made up for the game. The laughter, the applause,
the crowd and the house music are made in code, like every other sound in
the game; there are no recordings.

| | |
|---|---|
| **M**, then *Washington* | the club: *go here* to its door |
| **F** at the door | in, down to the lobby |
| **F** at the foot of the stairs | up to the street |
| **F** by an empty seat | sit down; again, get up |
| **F** while the host asks | shout a suggestion |
| **Tab** | your pack: *DC Improv: what's on* |

From the console:

```js
world.improv.schedule()           // the week's shows, and who's on
world.improv.now()                // what's on in each room, the line being said
await world.improv.go()           // to the door on Connecticut Avenue
await world.improv.enter('main')  // downstairs: 'lobby', 'main' or 'lounge'
world.improv.soon('improv', 10)   // (to try it out) the next improv starting in 10 s
world.improv.toSeat()             // (to try it out) beside the nearest free seat
world.improv.sit()                // into the nearest free seat
world.improv.shout()              // at the improv, while the host asks
world.improv.club                 // the club, while it's stood up
```

## Files

```
index.ts         plugs it in: the door and the act key, the club stood up as you come near, the shows on the clock and you hearing them, the words, a seat, shouting, the map, your pack, what you've seen
club.js          where it is (its door on Connecticut Avenue), the rooms, the stages, the seats, the marks; downstairs as a space
schedule.js      the week of shows, on Washington's clock; who's on each bill
sets.js          the comics and their material, the host, the troupe and its scenes
performance.js   a show from the top: every line, when, who says it, how the room takes it, who's on the stage
voices.js        the browser's speech, a voice for each person
captions.js      the words on the screen
laughs.js        laughter, applause, a crowd's murmur, shouting: made from numbers
sound.js         the room: the murmur, the house music, the laughs and the applause
pictures.js      the club in your pack
look.js          (fetched) the club stood up: materials, the pictures, the audiences, the performers
room.js          its faces: the street front, the lobby, the Main Showroom, the Lounge, the furniture
boards.js        the neon, the board of the week's shows, the posters, painted on a canvas
crowd.js         the audience, sat down and baked; the performers, who walk on and talk with their hands
```
