# Acting on what's at hand

One key does whatever the thing beside you is for: **F** on a keyboard, **Y**
on a game controller. Get into a car, a boat or a train and out again, the
race car on the pit apron, the airboat at the swamp tour's dock; onto your
horse or the turtle or the eagle and off, into your inner tube and out, onto
a surfboard and off; take the jetpack off its rack, climb aboard the rocket
(and in orbit, fly home), calm a wild horse (hold it down), buy a car on a
dealer's lot, rent the movies in your hands at the counter, ask the steward
for a shotgun. Whatever is at hand says so in the prompt, with the same key.

What it would do is at hand in [your pack](../pack/README.md) too, named for
it (*F · get in*), and so on a touch screen it's a button saying so, held
down where the key would be held.

| | |
|---|---|
| **F** (pad **Y**) | act on what's at hand: the nearest thing that has something to be done, what you're in or on first |
| hold **F** | what's done by holding it: calm a wild horse, turtle or eagle beside you |

Nothing else does these things: there's one key for all of them, so it's
always the one to try. A feature still has a key of its own for what isn't
at hand: **Z** whistles for your mount from wherever it is, **Y** lists the
stations, **V** says where the nearest river to float down is.

A feature offers what it would do (`game.act.offer({ id, at })`, where `at()`
says how far you are from it, what it's called and what doing it does, and,
for something done by holding the key down, what each moment of that does),
and the key does the nearest. It writes the key in its prompt with
`game.act.key(word)`.

From the console:

```js
world.act.here()     // what F would do now: { id, d, word }
world.act.press()    // do it
```

## Files

```
index.js              plugs it into the game: F and the pad's Y, what it would do (for the pack), the help panel
offers.js             what could be done, and which of it the key does: the nearest
```
