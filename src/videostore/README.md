# The video store

A walk out from where you first arrive, past the launch site, there's a
video rental shop: **Rewind Video**, a big box of a building in its own car
park, its name in yellow letters on an indigo sign beside a cassette, posters
of the new releases in the windows, the lights on until midnight. It's on the
map with a little cassette on its badge; pick it and press **go here**, and
you're set down on the pavement outside its doors, facing them. Track it,
and the HUD leads you to the doors on foot.

Farther out, a second Rewind branch usually stands near a town. Its cassette
badge appears on the map as you approach, and you can find it later in
**M → Routes**. Look for different staff picks and an extra aisle face for
horror, sci-fi, or cult films. Your membership works at both shops, and
either shop takes returns.

The doors slide open as you walk up, the chime goes, and the clerk behind
the counter looks up and says hello. Then it's the aisles:

- **New releases**, all along the back wall: the same box six or eight times
  over on a shelf, row on row, and a couple of the hot ones with every copy
  out (a card in each slot; try again tomorrow: which ones are out changes
  every day).
- **A genre to each side of each aisle**, with a sign over it: action,
  thrillers, comedy, horror, sci-fi, drama, foreign films, romance, classics
  (some in black and white), westerns and cult films, and low shelves of
  family films in the kids' corner, with its own television and two bean
  bags. Every tape is out face on, in **alphabetical order**, bay by bay,
  the way a video shop did it ("The" and "A" don't count).
- **Staff picks** on the ends of the aisles that face the door (each of the
  four staff has their own end, and a card under each box saying why), and
  **previously viewed** tapes for sale on the far ends.
- Sweets and popcorn in front of the counter, cardboard stand-ups of the new
  films by the door, a television over the till, and the rule on the wall
  behind it: *be kind, please rewind.*

None of the films is real. Each shop has a couple of thousand of them, grown
from the world's seed so everyone finds the same tapes at that shop. Each
has a title in its genre's way of naming things, a
pixel-painted cover, and a back of the box: a tagline, what it's about,
who's in it and who directed it, the year, the rating, how long it runs, a
critic's stars and a quote. It's 1997 in there.

| | |
|---|---|
| **click** a box on a shelf | take it down: you hold it up and read the back (three at a time) |
| **right-click** | put the one in your hand back where it came from |
| **click** at the counter | rent what you're holding: the clerk rings it up and hands you a receipt |
| **click** at the counter, or at the drop box by the doors | return what you have out |
| on a pad | **RT** takes one down and rents, **LT** puts one back |

The box you're holding is on the screen beside you, front and back, with
the others you've got under your arm; the crosshair's box has a yellow
frame round it (the hiker's head is usually in front of it). The tools are
put away while you're inside, and the camera comes in close to browse.

**Renting.** A new release goes out for two nights at $3.99; anything else
for five at $2.49, staff picks $1.99, the kids' films $0.99; a previously
viewed tape is $9.99 and yours to keep. Due back means by midnight, on the
real calendar: the receipt says which day. Bring it back late and there's a
late fee for every day ($1.50 a day for a new release, $1 otherwise), which
the clerk lets slide this once (there's no money in the forest). Your
membership card, what you have out and what you've bought are yours, saved;
a tape you have out leaves a gap on the shelf until you bring it back.

Walk out through the security gate with a tape you haven't rented, and it
goes off; the tapes go back on the shelf.

**Where it is** is grown from the seed and the land, like the old places
(`site.js`): the flattest dry ground in a ring round where you first arrive,
between about 260 and 640 m out, a little nearer winning over a little
flatter, clear of real places brought in from a photo, the old places,
towns, the mouths of caves, the railway and the launch site. Everyone in a
world finds it in the same place. **Nothing about the land changes for it**:
the shop and its car park stand on one slab of tarmac set on the ground as
it is, its top a little over the highest corner and its sides sloping down
to the lowest; the trees, bushes and stones in its way are hidden as it
comes into view, and grass doesn't grow on it. Building goes round it.

From the console:

```js
world.videostore.site              // where it is
await world.videostore.go()        // stand outside the doors
await world.videostore.enter()     // ...or just inside them
world.videostore.look('new', 30, 2) // stand at a slot and aim at its box (face, column, row)
world.videostore.toCounter()       // stand at the counter
world.videostore.catalog           // every film, and where it is
world.videostore.counter           // what's in your hands, what you have out
world.videostore.allOut()          // the new releases with every copy out today
```

## Files

```
index.js        plugs it in: the store stood up as you come near, browsing, the counter, the doors, on the map
site.js         where the store is, grown from the seed and the land
floorplan.js    what's where inside: the shelving and its slots, the counter, the signs, what's solid
catalog.js      the films: titles, backs of boxes, covers' choices, grown from the seed; which slot each is in
covers.js       a cover painted in pixels, small for the shelves (all of them in one atlas) and big in hand
font.js         letters made of little squares, for the signs and the titles on the covers
store.js        what it looks like: the building, the car park, the sign, the shelving and its boxes, the counter
browse.js       the rules: what's in your hands, renting, due dates, returning, late fees
card.js         the box in your hands on the screen, front and back, and the till receipt
sound.js        the music from the ceiling and the strip lights' hum, the chime, the till, the gate, carpet underfoot
videostore.css  the card and the receipt
```
