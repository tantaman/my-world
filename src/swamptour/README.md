# The swamp tour

An airboat ride through a Louisiana swamp, looking for alligators.

Outside Jean Lafitte, on Bayou Barataria (a real place, brought in from a
photo: see [Hikes](../hikes/README.md)), there's an airboat landing: a plank
dock out to where the boat ties up, a little board shack with a tin roof and
the tour's name over its ticket window, and beside it a concrete pen with a
young alligator lying in it, black with yellow bands. It's on the map with a
gator on its badge, under *swamp tours*; pick it and press **go here**, and
you're set down at the foot of the dock.

**Get in.** The guide sits up in the high seat at the back of a blue
aluminium airboat, in front of the engine and the big propeller in its round
wire cage, and says hello as you come up. Walk out along the dock to the
boat and press **F** (the key that gets you into anything: see
[Acting](../act/README.md)): you're in the middle of the front row, with a pair of ear
defenders on, because it's loud. The starter grinds, the engine catches, and
off you go.

**The way round** is where the real tour goes, by the water the real place
has: down Bayou Barataria, into the old oil-field canals to the south, north
up a narrow canal through the cypress, where one of the videos it's drawn
from was taken, and back by the Barataria Waterway. The boat goes fast on the open bayou and
slower in the narrow canals, slows round the tight bends, and spins round at
the end of a dead-end canal the way airboats do, leaving a wake behind it:
white under the propeller, spreading out behind into a V that washes along
the banks and fades. Look about as you go: the camera turns with the boat.
The guide talks on the way: Jean Lafitte the pirate, the Spanish moss, the
canals, the bald cypress.

**The gators.** Four times on the way round the guide throttles back and the
boat drifts to a stop where there's an alligator to see: up on the bank,
sunning with its mouth open, or lying in the water with only its eyes and
nose and the ridges of its back showing. The guide points it out (*on your
left*, *about 11 foot*) and gives you a while to look before going on. These
are used to the boats and let you come close; the ones you meet on your own
(see [Wildlife](../wildlife/README.md)) are warier.

**Getting off.** Back at the dock the guide says goodbye (and hopes you'll
tip the guide), and you step out onto the dock. To go back sooner,
**F**, and you're run back in. Going somewhere else all at once
(the map, **R**) ends the tour too. How many tours you've been on, how many
gators you've seen and the biggest are kept.

**With other people.** Your tour is your own: your boat, your guide, your
gators. In a shared world everyone here sees you go by in your airboat, sat
in its front row with the guide up behind you, and you see them in theirs.

| | |
|---|---|
| **F** by the boat | take the tour |
| **F** on the tour | back to the landing |
| on a pad | **Y** is F |

Both are at hand in your pack too (**Tab**: see [your pack](../pack/README.md)):
by the boat *get in*, and on the tour *back to the landing* (on a touch
screen, a button saying so). Anywhere else, *airboat tour* in the pack says
where the tour is.

From the console:

```js
world.swamptour.list()            // the tours, and whether each is ready
await world.swamptour.go()        // to the foot of the dock
world.swamptour.board()           // into the boat, and off
world.swamptour.ride              // how it's going: where, how fast, the gators so far
world.swamptour.skip(200)         // (for trying it out) 200 m on along the way
world.swamptour.leave()           // back to the landing
world.swamptour.record            // tours taken, gators seen, the biggest (m)
world.swamptour.said              // what the guide said last
```

**How it works.** A tour is a landing and the places its boat goes by, by
latitude and longitude, on a real place (`tours.js`). Once that place's land
has come, the way round is found on its water (`route.js`): on a grid a metre
fine, wherever there's water enough either side of the boat, keeping to the
middle of the channels and the wide water, taking another way back where
there is one; then drawn straight where it can be and rounded at the corners.
How fast the boat may go is worked out along it, from how wide the water is,
how tight the bends are, and the stops. The gators are put out ahead of the
boat, a hundred metres before their stops, where the guide will point them
out, on a bank beside the way or in the water. Nothing about the land
changes: the landing stands on the bank, and the plants where it stands are
hidden.

## Files

```
index.js        plugs it in: laying out a tour once its land is here, the landing and the boat, the ride, the map, saving
tours.js        the tours: where each landing is and where its boat goes, really, and its guide
route.js        the way round by water, and how fast the boat may go along it
airboat.js      the airboat: hull, seats, the guide's high seat, engine, propeller, cage, rudders
landing.js      the dock, the ticket shack, the pen with a young gator in it
guide.js        the guide: how they look, how they sit at the stick, what they say
sound.js        the engine and the propeller; the starter; ear defenders going on
others.js       other people here out on the tour, in theirs
wake.js         the white water it leaves behind it, round the bends and out to the banks
```
