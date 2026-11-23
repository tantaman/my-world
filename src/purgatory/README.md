# Purgatory

Go down through Hell (see [Hell](../hell/README.md)) to the ice at the
bottom, on past Lucifer, and the road doesn't come out on the hillside by the
gate any more. It comes up where the poem says it does, "to rebehold the
stars": on the shore of an island alone in the southern ocean, before dawn,
with the sea trembling in the first light and a mountain behind you, "the
hill that highest tow'rds the heaven uplifts itself". This is the mountain of
Dante's *Purgatorio*, laid out as the poem lays it out and in its words
(Longfellow's translation), and you climb it.

| | |
|---|---|
| the shore | a beach, and rushes in the ooze where the billow beats it. **Cato** stands by the mouth of the burrow you came up. At dawn **the angel's boat** comes in over the sea, its souls singing *In exitu Israel* |
| the plain | "the solitary plain", rising gently to the foot of the mountain |
| the foot | a cliff all round. The excommunicate wait under it, like sheep |
| the cleft | the one way up the cliff: "feet and hands the ground beneath required" |
| the terrace | where the negligent sit in the shade. **Belacqua** is behind his great rock, hugging his knees |
| the slope | the long hillside of Ante-Purgatory, the late-repentant crossing it singing the Miserere |
| the valley | a lap in the hillside, full of flowers: gold, silver, scarlet, pearl-white, indigo, emerald. The princes sit there singing. At evening two angels in green come down, and the serpent comes through the grass |
| the gate | three steps (white marble, dark cracked stone, porphyry red as blood), an **angel** seated on the threshold with a sword. Climb the steps and he cuts seven P's on your brow, and the door opens, roaring |
| the needle's eye | a cleft through the rock, winding, up to the first terrace |
| 1 · the proud | a ledge of white marble round the mountain, "a human body three times told" wide; carvings in the bank (the Annunciation, David dancing before the Ark, Trajan and the widow), and the proud coming bent double under stones |
| 2 · the envious | livid stone; the envious sitting against the bank, eyes sewn shut. Voices fly past overhead |
| 3 · the wrathful | a black smoke, "darkness of hell", so thick you can hardly see your hand. The **Agnus Dei** sung in it |
| 4 · the slothful | a crowd running round the terrace, crying out, the way you go |
| 5 · the avaricious and the prodigal | face down on the stone, near the edge; keep to the rock |
| 6 · the gluttonous | starved souls going by, and two trees whose boughs widen as they go up, so nobody can climb them, apples on them, and water falling on their leaves from the rock |
| 7 · the lustful | fire shooting out of the bank, the souls walking in it; at the foot of the last stair a wall of fire, and an angel outside it on the verge. Walk through it |
| the forest | the Earthly Paradise on the top: "the heavenly forest, dense and living-green", birdsong, and across it the stream that springs from one fountain and runs two ways: **Lethe** to the left, **Eunoë** to the right. A lady walks the far bank gathering flowers |

**The way up goes round to the right**, as the poem's does. Each terrace has
one stair, a slot cut slantwise up its bank, and an **angel** at its foot,
who wipes one of the P's from your brow with a wing as you pass. Your P's are
at the top of the screen. The HUD points to the next way up.

**The mountain keeps its own day**, whatever the hour in the forest: you come
up before dawn, and a day goes by in half an hour. **After sunset nobody
climbs** (Canto VII): you can go down, and round, but no higher than you were
when the sun went. **Stand still in the night and you sleep**, and wake in
the morning; the poem's dreams come one a night, in its order (the eagle, the
siren, Leah). Fall asleep in the valley before you've been to the gate, and
Lucia carries you up to it.

**Above the gate nothing falls**, no rain, no dew, no cloud; but **the
mountain trembles** now and then, and everyone on it cries *Gloria*: somebody
has been freed.

On the top, stand in Lethe and **drink** (it's at hand, and in your pack;
on a touch screen, a button): it takes away the memory of sin. Then Eunoë,
which restores the memory of every good deed, but "worketh not if first on
either side it be not tasted". Drink of it, and you rise, "pure and disposed
to mount unto the stars", and come down on the hillside before Hell's gate,
where it all began.

You can go back down the burrow on the shore (Cato would rather you didn't),
to the ice at the bottom of Hell. **R** takes you back to the start of the
path from anywhere. Leave while you're on the mountain and you come back
where you were, at the hour you left it.

## How it's grown

Purgatory changes nothing the seed grows. It is found from Hell (`site.js`):
off from Hell's axis on the far side from its door, far enough that the two
never meet, its sea 2.5 km under Hell's top; the road comes up on the side of
the island the sun rises on. Where it is, is pinned in
`test/golden/purgatory-*.json`: someone who left off on the mountain is saved
standing there.

It is one *space* (`world/spaces.js`, as `world/landSpace.js` makes any land
made in code): the land's floor; walls wherever the ground is too steep to
climb, the sea is too deep to wade, or the gate's door is shut; the sky for a
roof. And `space.ceiling`, which is the law of the mountain: at night the
ground over where you were at sunset is a wall like any other.

**The land** (`land.js`) is a function: a radius and an angle from where the
road comes up give a height, what lies there, and a colour. The plan
(`plan.js`) is the poem's, in metres where it gives them (the terraces'
width) and in proportion where it doesn't: an island 4.8 km across, the
mountain 700 m high, the terraces 46 m one above the next. Each way up is a
slot cut in its bank: in level from the floor at its foot, a few metres, then
up slantwise round the mountain to the floor above, with rock on both hands
all the way. Unlike Hell's, these circles close: there is one of everything,
as in the poem.

**What is drawn** is fetched the first time you come up the road (`view.js`,
by `core/lazy.ts`): the ground as tiles round you, out to the horizon over the
sea (`render/landTiles.js`, drawn with `look.js`); what it is strewn with,
square by square (`furnish.js`, by `world/strewn.js`): rushes, rocks, flowers,
the forest's own trees on the top, and the souls in the poses the poem gives
them (`models.js`, and `render/shades.js`); what was built (`built.js`); and
who is met one at a time (`people.js`).

**The sky is the forest's** (`world/sky.js`), lent: while you're on the
mountain its dome, its sun and the sky's light are moved into Purgatory's
scene with the hiker, and worked out each frame for the mountain's hour
instead of the forest's (`air.js`). The air is clear sea air, thinning upward
from the sea; on the third terrace the smoke closes it to a few metres and
takes the sky's light with it.

**What it sounds like** (`sound.js`): the sea on the shore, the wind high up,
birds in the forest on the top, the fire of the seventh terrace; and singing,
a few voices on a plainsong line, what the poem has sung where it has it.

From the console:

```js
world.purgatory.arrive()         // up the road out of Hell, onto the shore
world.purgatory.go(1500, -0.1)   // stand at a radius and an angle (here: on the slope)
world.purgatory.stair(3)         // at the foot of a way up (0: the needle's eye)
world.purgatory.stand(x, z)      // at a world position on the island
world.purgatory.at('lethe')      // where something is: lethe, eunoe, spring, valley, gate, burrow
world.purgatory.here             // { r, th, h }
world.purgatory.hours = 19       // the mountain's hour
world.purgatory.mark()           // as the angel at the gate does
world.purgatory.quake()          // the mountain trembles
world.purgatory.region           // 'shore', 'valley', 'wrath', 'eden'…
```

## Files

```
index.ts              plugs it into the game: the road up, the mountain's day, the night, the P's, the frame's work there
plan.js               the plan, as the poem gives it: radii, heights, the terraces, the ways up, the day
site.js               where it is: off to one side of Hell, and lower
words.js              the poem's lines for each place and moment
land.js               its ground: the shore, the slopes, the terraces and their stairs, the stream on the top
space.js              the floor, walls and sky you walk by, and the law of the mountain (world/landSpace.js)
air.js                the forest's sky lent at the mountain's hour, the sea air, the smoke
brow.js               the seven P's on your brow, and the fire you see through
sound.js              the sea, the wind, the birds, the fire, the singing; stone underfoot
view.js               what it looks like, fetched the first time it's wanted
look.js               what the ground, the stone and the waters are drawn with
models.js             shapes: the souls' poses, rushes, flowers, rocks, angels, Cato, the lady, the serpent, the boat
furnish.js            what the ground is strewn with, and who is on it, square by square (world/strewn.js)
built.js              the burrow's mouth, the gate's door, the carvings, the trees of the sixth terrace
people.js             who is met one at a time, and what they do
```
