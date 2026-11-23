# The video store

A walk out from where you first arrive, past the launch site, there's a
video rental shop: **Rewind Video**, a big box of a building in its own car
park, its name in yellow letters on an indigo sign beside a cassette, posters
of the new releases in the windows, the lights on until midnight. It's on the
map with a little cassette on its badge; pick it and press **go here**, and
you're set down on the pavement outside its doors, facing them. Track it,
and the HUD leads you to the doors on foot.

**Branches.** Rewind Video is a chain. Most of the villages people live in
have a branch just past their last houses, facing the street (*Rewind Video,
Meadowfield*), every one the same shop: the same shelves, the same staff,
the same card. A tape rented at one goes back in the returns at any of them.
They're all on the map, and under *video stores* in its routes, nearest
first, for as far out as you scroll. Whichever you're nearest is the one
with its lights on.

The doors slide open as you walk up, the chime goes, and the clerk behind
the counter looks up and says hello. Then it's the aisles:

- **New releases**, all along the back wall, with late-2004 stock like
  *Spider-Man 2* and *Shrek 2* on VHS and DVD. Copies of an edition stand
  side by side. The shop runs out of a couple of editions each day and puts
  a card in their slots.
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

It's late 2004 in there. The New Releases and Staff Picks shelves carry real
movies in pixel-painted cases. Pick one up to read its TMDB synopsis, cast,
director, runtime and U.S. rating where available. The genre aisles and sale
endcaps carry a couple of thousand fictional VHS titles grown from the world's
seed. Everyone in the same world sees the same shelves.

| | |
|---|---|
| **click** a box on a shelf | take it down: you hold it up and read the back (three at a time) |
| **right-click** | put the one in your hand back where it came from |
| **F** at the counter | rent what you're holding: the clerk rings it up and hands you a receipt |
| **F** at the counter, or at the drop box by the doors | return what you have out |
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
membership card, what you have out and what you've bought are yours, saved
(and listed in [your pack](../pack/README.md): the card, each movie you have
out and the day it's due, and how many you own);
a movie you have out leaves a gap on the shelf until you bring it back.
Renting a DVD leaves the VHS copies available.

Walk out through the security gate with a movie you haven't rented and the
alarm goes off. The movies go back on the shelf.

**Where they are** is grown from the seed and the land, like the old places
(`site.js`): for the first, the flattest dry ground in a ring round where you
first arrive, between about 260 and 640 m out, a little nearer winning over a
little flatter; for a branch, the same in a ring round its village, just
past its houses and inside the village's own square (`branches.js` says which
villages have one). All of them keep clear of real places brought in from a
photo, the old places, towns, the mouths of caves, the railway and the
launch sites, and the branches of the airfields too. Everyone in a world
finds them in the same places, and the only thing saved is which you've
been to. **Nothing about the land changes for them**:
the shop and its car park stand on one slab of tarmac set on the ground as
it is, its top a little over the highest corner and its sides sloping down
to the lowest; the trees, bushes and stones in its way are hidden as it
comes into view, and grass doesn't grow on it. Building goes round it.

From the console:

```js
world.videostore.site              // the store you're at, or were last near
world.videostore.branches          // the branches: forTown(town), byId(id)
await world.videostore.go(id?)     // stand outside the doors (there, or at the store with that id)
await world.videostore.enter()     // ...or just inside them
world.videostore.look('new', 30, 2) // stand at a slot and aim at its box (face, column, row)
world.videostore.toCounter()       // stand at the counter
world.videostore.catalog           // every film, and where it is
world.videostore.counter           // what's in your hands, what you have out
world.videostore.allOut()          // the new releases with every copy out today
```

## TMDB setup

Get the API Read Access Token from your TMDB account settings. Set
`TMDB_READ_ACCESS_TOKEN` in the project's ignored `.dev.vars` file and run
`npm run api` with `npm run dev`, or run `npm run serve`. On a hosted Worker
the same variable is a Worker secret. [TMDB API authentication](https://developer.themoviedb.org/docs/authentication-application)

The Worker looks up only the films in `lineup.js` and caches successful results
for a day. The store can still open and rent movies when only the titles,
formats and years are available. VHS and DVD rentals use separate saved IDs
derived from the TMDB movie ID. Older rentals stay on the member's account
until returned.

The TMDB logo in the game's Credits is the original artwork by Travis Bell,
distributed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
[Original logo file and attribution](https://commons.wikimedia.org/wiki/File:Tmdb.new.logo.svg)

## Files

```
index.js        plugs it in: the store stood up as you come near, browsing, the counter, the doors, on the map
site.js         where the stores are, grown from the seed and the land
branches.js     which villages have a branch, and finding where, a little at a time
floorplan.js    what's where inside: the shelving and its slots, the counter, the signs, what's solid
catalog.js      generated films, VHS and DVD editions, and which slots they fill
lineup.js       the curated 2004 lineup and each film's TMDB ID
covers.js       a cover painted in pixels, small for the shelves (all of them in one atlas) and big in hand
store.js        what it looks like: the building, the car park, the sign, the shelving and its boxes, the counter
browse.js       the rules: what's in your hands, renting, due dates, returning, late fees
card.js         the box in your hands, its TMDB details, and the till receipt
sound.js        the music from the ceiling and the strip lights' hum, the chime, the till, the gate, carpet underfoot
videostore.css  the card and the receipt
pictures.js     what your card and tapes look like in your pack
```
