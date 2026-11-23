# Surfing

Along the coast, here and there, the sea comes in onto a beach in sets of
waves that rear up, break and peel away along the shore: a **surf spot**.
Wade out, take a board, paddle out past where they break, and ride one in.

**Finding the surf.** Open **M → routes → surf** for the breaks, nearest
first, for as far as you scroll (*Kelp Point*, *Gull Sands*, *Osprey Reef*),
each with what it is and how big it runs; they're on the map too, and *go
here* stands you on the beach looking out at it. Boards stood up in the
sand at the top of the beach show you where, from along the shore. There's one in about one
square in four of the forest, a square being a kilometre and a half across,
wherever the coast will take a break; the nearest is usually within a walk
of the start.

What a break is like comes from where it is. The waves are bigger, and
longer between, where the beach looks out over a long way of open sea, and
small in a sheltered bay. Where the seabed shoals steeply they break hollow
and peel fast; gently, softer and slower. Where the shore runs on a long way
to one side only it's a **point**, and the waves peel that way: a *left* or a
*right*, as you'd call it riding it, looking in at the beach. Otherwise it's
a **peak**, breaking first in the middle and peeling away both ways.

The waves come in **sets**: six big ones, then a lull of small ones, which
break further in. Each slows as it comes into shallower water, stands up
taller and steeper, and breaks once it's about as high as the water is deep:
its lip throws out over the face and comes down in spray, and then it's
white water, rolling in up the beach. You can hear it from the beach, from
where it's breaking.

**Surfing.** In the sea at a surf spot, **F** (the key that gets you onto
anything: see [Acting](../act/README.md); *surf* is at hand in the pack, and a
button on a touch screen): you lie on a board, pointing out to sea.

| | lying on the board | standing |
|---|---|---|
| **W** | paddle (hold it, harder) | pump: a little speed along the face |
| **S** | back-paddle | stall: back on the tail, to let the curl catch you up |
| **A D** | turn | carve; in the air, spin |
| **shift** | duck the nose under a wave | crouch: turn tighter, ride in the barrel |
| **space** | stand up, once a wave has you | off the lip, into the air |

**F** again (*swim*, at hand while you surf) gets you off the board. On a pad,
**Y** is F.

Paddle out through the white water (duck under it, or it shoves you back
in) to just past where the big ones break. When one stands up out to sea of
you (*a wave!*), point at the beach and paddle: if you're going in nearly as
fast as it is when its face reaches you, it takes you (*it has you*), and
**space** stands you up: hold **A** or **D** as you do, and you come up
angled that way along it. Not if its lip is already coming down where you
are: catch it before it breaks.

Up on it, run along the face ahead of where it's breaking, the way it's
peeling. The face carries you in as fast as the wave goes, so stay on it:
point down it and you go faster, but run out in front into the flat; up it
and over the back, and you've kicked out. Turns count: a **bottom turn**, a
**carve**, a **snap** off the top, a **cutback** turning back toward where
it's breaking. Let it catch you up (**S**), stay low in the face crouched
(**shift**) as the lip throws over you, and you're **in the barrel**, until
you come out ahead of it again, or it closes on you. Go up the face fast and
**space** at the top and you fly: come down along the board (either way
round) for an **air**, **air 180**, **air reverse**...

**Wiping out.** The lip landing on you anywhere but inside the barrel, the
barrel closing on you, the nose digging in going straight down a face too
steep for it, or coming down from the air sideways or too hard: you go
under, rolled in with the wave, and come up lying on the board. Whatever
you'd done on that wave is lost.

**Points.** Riding the face counts by the second, and for how fast; each
turn, barrel and air on top (half as much doing the same thing twice
running). A wave's tally is yours once it's over and you're still on your
feet: kicked out, ridden in to the shallows, or the white water ran out
under you. When it is, you're told how long, how far, how fast, and what it
came to. Your best wave in each world is kept, and your longest ride and
barrel.

From the console:

```js
await world.surfing.go()     // to the nearest break, out past where it breaks, on a board
world.surfing.off()
world.surfing.state()        // how you're going, and this wave's tally
world.surfing.spots.cell(0, 0)   // the break in a square, or null
```

## Files

```
index.js     plugs it into the game: the breaks on the map, the one nearest you rolling, the board, the keys, the readout, your best saved
spots.js     where the breaks are, found from the seed along the coast, and what their waves are like
surfer.js    the physics: paddling, catching a wave, riding its face, the barrel, airs, wiping out
ride.js      a wave's tally: how long, how far, how fast, what you did, the points
pose.js      how you lie and stand on the board, and how the board sits on the water
board.js     the board, and the boards stood in the sand at a break
lip.js       the curl of a breaking wave thrown over its face, and the spray where it lands
sound.js     the break, the white water, the board; popping up, landing, wiping out
surfing.css  the readout
pictures.js  what surfing looks like in your pack
```

The waves themselves are the world's, in `world/breakers.js`: a break is
handed to it, and the water rises with its waves (`world/waterSurface.js`),
and anyone can ask how far they raise it (`chunks.waterAt`'s `rise`).
