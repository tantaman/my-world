# Skiing

Head down a steep, snowy slope and your skis go on by themselves, with a
click of the bindings, and down you go. Or your snowboard, if that's what you
ride: **`** swaps one for the other, and it's remembered.

Where there's snow lying (up on the mountains, above the snow line, and on
a real place where it really lies: a ski resort brought in from a photo you
took in winter is under snow, see [Hikes](../hikes/README.md)) and it's
steeper than about 18°, walk downhill and you're off. Stop on gentler ground
and they come off again; ski off the edge of the snow onto rock or turf and
you scrape to a halt and step out. **I** puts them on anywhere there's snow,
even on the flat, where **W** poles you along (they stay on until **I** takes
them off), and **I** takes them off wherever you are.

The forest's own mountains hold snow on their tops, enough for a pitch of
fifty metres or so. For a run worth the name, go to a snowy real place: the
hikes tab beside the map (**M**), and *the view*, which stands you where the
photo was taken. The longest of them is the Vallée Blanche, where that is the
top of the Aiguille du Midi, with Mont Blanc behind you, three hundred metres
of fall line down to the glacier, and the Chamonix valley five hundred
further below.

| | on the snow | in the air |
|---|---|---|
| **A D** | carve left and right; at a standstill, pivot round | spin |
| **W** | tuck: faster, and pushes you along on the flat | flip forwards |
| **S** | brake: a snowplough on skis, back on your heels on a board | flip backwards |
| **shift** | tuck | grab your skis, or your board |
| **space** | jump | |

The camera swings round behind the way you're going unless you're looking
about. The speed and the points are above the coordinates, bottom left.

**How it goes.** Gravity pulls you down the slope; your edges hold you to
the line your skis point along, so a turn carves you round and keeps your
speed, while skidding round (braking) scrubs it off. The faster you go, the
wider you have to turn. Tucked, you're quicker; upright, the air holds you
back sooner. Go over the top of a crest fast enough and you leave the snow,
and fly until you come down again.

**In the air** a key counts once it has been pressed since you took off, so a
turn you were carving into the lip doesn't wind you round. Spin in half
turns: a 180 lands you riding backwards, and you swing round to face forward
again. A backflip needs a big drop. Let go of everything and you settle square
to land.

**Falling.** Come down sideways, upside down or far too hard, or hit a tree
or a boulder at speed, or ski fast onto the rocks, and you go tumbling, slide
to a stop in a spray of snow, lie there a moment, and get up with your skis
across the slope. Glance off something more gently and you only bounce off.

**With other people.** In a shared world, everyone sees what you're on as
you go by, and you see what they're on.

**Points.** Each trick you land is named and scored (`360`, `backflip`,
`540 · mute grab`, `big air`): more turns, more flips and a held grab are
worth more, and still holding the grab as you land is worth half. Land one
after another and they make a combo, worth their points times how many; it's
banked once you've been on the snow a few seconds, and lost if you fall
first. When the skis come off you're told how far and fast the run was and
what it scored. Your best in each world is kept.

From the console:

```js
world.skiing.on('board')   // on a board (or 'skis'), here, whatever the snow
world.skiing.off()
world.skiing.state()       // how you're going, and this run's tally
```

## Files

```
index.js              plugs it into the game: on by themselves, the keys, the camera, the readout, your best saved
skier.js              the physics: sliding, carving, flying off crests, landing, falling, getting up
tricks.js             what you did in the air: whether you landed it, what it's called, what it's worth
run.js                a run's tally: how far, how fast, how far down, points and combos
pose.js               how you stand on skis or a board, lean into turns, tip with the snow and tumble
gear.js               skis, poles and a snowboard
spray.js              snow thrown up off your edges, landing and falling
sound.js              the snow and the wind as you go; bindings, landings, falls
others.js             what other people here are on
skiing.css            the readout
```
