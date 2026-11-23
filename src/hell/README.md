# Hell

Somewhere in the dark of the woods, a walk from where the path starts, a
doorway of black stone stands at the foot of a hillside, with nine lines cut
over it that end *All hope abandon, ye who enter in!* It is on the map (see
[The map](../map/README.md)) as **The Gate**: pick it there and track it, and
the HUD leads you to it. It isn't in any of the lists in Routes (it's
meant to be come upon), but a search there for *hell* or *gate* finds it.
Behind it a passage runs down into the hill to a round chamber and a door
with nothing in it but the dark and a dull red light. Walk into the door.

What is under it is the Hell of Dante's *Inferno*, laid out as the poem lays
it out and in its words (Longfellow's translation): a pit, round, going down
in circles to a point, nine and a half kilometres across at the top and
nearly nine hundred metres deep. Each place says what it is as you come into
it, with the poem's lines for it.

| | |
|---|---|
| the vestibule | a dark plain; the crowd that would not choose, running for ever |
| Acheron | wide and black. Wade out to **Charon's boat** and stand in it |
| 1 · Limbo | a long bank down to a dim meadow; a castle of seven walls and seven gates, a light in its keep |
| 2 · the lustful | bare rock and crags, and the wind, with them in it |
| 3 · the gluttons | mud, standing water, rain |
| 4 · the avaricious and the prodigal | rolling great weights round the ring, one crowd each way |
| 5 · Styx | a marsh, the wrathful in it to the waist. From the spit by the tower, **Phlegyas's boat** runs to the gate of Dis |
| Dis | a wall of red-hot iron right round, towers with fire in their crowns, mosques glowing over it |
| 6 · the heretics | a plain of open tombs, each with a fire in it |
| the ruin | a landslide down the cliff: the one way on |
| 7 · the violent | Phlegethon, a river of boiling blood, with a ford; the wood of thorn trees; the burning sand, fire falling on it like snow, and a brook of blood across it between stone margins that nothing burns over |
| the great cliff | the brook goes over it. Beside the fall **Geryon** waits with his shoulders on the brink: step onto his back, and he wheels down |
| 8 · Malebolge | ten ditches, ring inside ring, each with its own punishment; bridges of rock over them along ten spokes, but for the sixth ditch, where every bridge has fallen and you climb over its heap; a stair down the wall of each ditch on round from every bridge |
| the well | the giants stand in it. **Antaeus** holds his hand at the lip: step onto it, and he sets you down |
| 9 · Cocytus | a lake of ice in four zones, heads fixed in it, the wind blowing out from the middle; and in the middle, Lucifer |

The ways down are the poem's. A cliff can be walked off (you land, and the
poem has a line for that) but not up, so coming back means finding the way
you came by: a ramp cut into each cliff of the upper circles, the ruin, the
boats, Geryon, Antaeus, the door. Anything that carries you takes you when
you **stand still** where it waits; come to the end it isn't at, and it comes
over for you. The other way out is the poem's too: go on to the middle of the
ice, past Lucifer, and you come out on the hillside by the gate, *to
rebehold the stars*.

**It doesn't end.** "Thou knowest the place is round," Virgil says on the
burning sand, "and notwithstanding thou hast journeyed far … thou hast not
yet through all the circle turned." Here nobody ever does. From the vestibule
down to the sand, a circle does not close: walk round one and you never come
back to where you were. The land under you is the same land a turn on, but
its ways down, its landings, its castles and whoever is there are others.
Malebolge, the well and the lake are the one place they are in the poem.

Your headlamp works down there (**K**: see [Caves](../caves/README.md)); it
doesn't come on by itself. **R** takes you back to the start of the path from
anywhere. Leave while you're down there and you come back where you were, on
the turn you were on.

## How it's grown

Hell changes nothing the seed grows. The gate is found from the seed and read
off the land the way a cave's mouth is (`site.js`): a steep bank in thick
woods, away from water, paths and caves, where a passage going in and down is
soon under a good roof of earth; a world with no such hillside has no gate.
Where it is, is pinned in `test/golden/hell-*.json`. Its passage and chamber
are made by the caves' own code from a layout of its own, so the hillside is
cut for it as for a cave (`world/cuts.js`, which now takes cuts from more
than one owner), daylight falls away down it, and your lamp comes on.

Hell itself lies three kilometres under the forest, its axis straight ahead
of the passage, so walking in is walking toward the middle of it. It is one
*space* (`world/spaces.js`): the land's floor, or a bridge's roadway; walls
wherever the ground is too steep to climb, a liquid too deep to wade, or
something was built; the dark for a roof. It is drawn as a scene of its own.
While you're in it the forest isn't drawn at all (`game.coverWhen`), and the
hiker and their lamp are moved into Hell's scene; the sky, the fog and the
far plane are lent to it for each frame and handed back (`air.js`).

**The land** (`land.js`) is a function: a radius and an angle from the door
give a height, what liquid lies there and how deep, and a colour. The plan
(`plan.js`) is the poem's, in metres. The angle is not wrapped, which is how
a circle doesn't close: the upper circles are dealt into sectors, forty to a
turn and numbered without end, and each sector has its own way down every
cliff, its own ferry landing, ford and brook, and perhaps a castle. Sector 0
has them where the poem's road goes, bearing left. Where you are therefore
has a turn to it, which is kept with your save.

**What is drawn**: the ground as a quadtree of tiles, a metre to the vertex
underfoot and sixty-four at two kilometres, so the whole of Malebolge can be
seen from the brink (`terrain.js`); rivers, marsh, blood and pitch in the
same mesh, the shore falling where the bed comes up through the surface
(`look.js`). The ground is strewn square by square from the seed with rocks,
thorn trees, tombs and fires, and with the shades of each circle (`furnish.js`):
drawn as instances, and where they go in procession each walks a stretch of
its own and fades at the ends, so a file of them never runs out (`shades.js`).
What was built stands where the land says: bridges, the wall of Dis in
lengths, a castle, a tower, the falls (`structures.js`).

**How it is lit and drawn** is the engine's (see [the look](../render/README.md)),
nothing of it Hell's own but what it's made of:

- Every fire is a light: the fire in each tomb, the flames on the sand, the
  fires in the towers of Dis, the flames that walk the eighth ditch. The few
  that matter most where you are light the ground, the stone and whoever is
  near (`render/lights.js`), the nearest casting shadows; the murk hangs
  round each, glowing. The light of the murk itself is low, so that it's the
  fires you see by.
- A flame is a volume of burning gas, not a card (`render/flame.js`), and the
  air over it shimmers (`render/haze.js`); so does the air over Phlegethon,
  and over the brook across the sand.
- What lies in the hollows is a surface of its own (`render/liquid.js`), with
  what each liquid does to light (`look.js`: LIQUIDS): Acheron black and
  still, a mirror of what stands on its banks; Styx muddy and bubbling;
  Phlegethon boiling blood with a skin on it that the boiling breaks, its own
  dull light glowing through, brighter where it heaves; the pitch a black
  mirror, thick and slow. The ground under them is their bed. Where the sand
  burns hottest it has run and cooled into a crust of black plates, with fire
  in the cracks.
- The keepers and monsters are melted (`sculpt.js`, `render/implicit.js`):
  their bodies run together into one skin, a muscle swelling smoothly out of
  the next, rather than pieces stuck together; and drawn as skin
  (`render/skin.js`), with creases, veins, pores and a wet sheen, horn and
  iron and wood as what they are, the light coming soft and red round the
  edge of a shadow on them and through a bat's wing. Melting one takes a
  moment, so each is drawn from its pieces at first, as it always was, and
  melted a few milliseconds a frame while you're down there.
- Stone has its grain and its pits; the ground its grit, lumps, and the
  ledges of the beds in a cliff, which a fire's light picks out.

Where the people you share a world with are is sent only in plan, not how
high (`player/peers.js`), so for now someone who has gone down is seen by the
others walking the forest overhead, and isn't seen in Hell.

From the console:

```js
world.hell.gate                  // where the gate is
world.hell.enter()               // stand inside the door
world.hell.go(2550, 0.03)        // stand at a radius and an angle (here: among the tombs)
world.hell.here                  // { r, th, turn }
world.hell.region                // 'limbo', 'styx', 'malebolge'…
world.hell.stage('geryon', 20)   // stand one of its creatures in front of you
world.hell.melt()                // melt every creature now, not a little each frame
```

## Files

```
index.js              plugs it into the game: the gate, the door, Hell's scene, the frame's work down there
plan.js               the plan, as the poem gives it: radii, depths, the drops between circles, each region's air
words.js              the poem's lines for each place, and the inscription
site.js               where the gate is, from the seed
gate.js               the gate: its stonework and tablet, its passage and chamber, the door
land.js               Hell's ground: heights, liquids, the ways down, what was built across the way
space.js              the floor, walls and roof you walk by
terrain.js            the ground, drawn: tiles round you, fine near and coarse far
look.js               what the ground, the stone and the liquids are drawn with, and what each liquid does to light
air.js                the dark overhead, the light from the pit, how far you can see
weather.js            what falls and blows: rain, flakes of fire, the wind
furnish.js            what the ground is strewn with, and who is on it, square by square
models.js             their shapes: rocks, the trees of the wood, tombs, shades
shades.js             what shades and fires are drawn with, and how they go (and the shimmer over a fire)
structures.js         what was built: the bridges, the wall of Dis, a castle, a tower, the falls
creatures.js          the keepers and monsters, as shapes, melted into one a little at a time
denizens.js           where they stand, and what little they do
rides.js              what carries you: Charon's boat, Phlegyas's, Geryon, Antaeus
sculpt.js             shapes made of simple ones, or melted out of them
sound.js              what it sounds like
card.js               the dark at the door, and the name of each place
```
