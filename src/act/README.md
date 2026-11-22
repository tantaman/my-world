# Acting on what's at hand

One key does whatever the thing beside you is for: **F** on a keyboard, **Y**
on a game controller, and on a touch screen a button that says what it would
do. Get into a car, a boat or a train and out again, onto your horse or the
turtle or the eagle and off, out of your inner tube; take the jetpack off its
rack, climb aboard the rocket, buy a car on a dealer's lot, rent the movies
in your hands at the counter, ask the steward for a shotgun. Whatever is at
hand says so in the prompt, with the same key, so it's always the one to try.

| | |
|---|---|
| **F** (pad **Y**) | act on what's at hand: the nearest thing that has something to be done, what you're in or on first |

Each feature keeps its own key too, for the other things it does: **Z**
whistles for your mount and calms a wild one, **Y** lists the stations (on a
controller they're a tab beside the map), **V** pulls out your inner tube
anywhere, **J** tells you where the jetpack is, **T** flies you home from
orbit, and the video store's counter and the hunt club's hatch answer a click
as well.

A feature offers what it would do (`game.act.offer({ id, at })`, where `at()`
says how far you are from it, what it's called and what doing it does), and
the key does the nearest. It writes the key in its prompt with
`game.act.key(word)`.

From the console:

```js
world.act.here()     // what F would do now: { id, d, word }
world.act.press()    // do it
```

## Files

```
index.js              plugs it into the game: F and the pad's Y, the touch button, the help panel
offers.js             what could be done, and which of it the key does: the nearest
```
