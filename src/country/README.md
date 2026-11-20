# The country you're in

Not everywhere is a northern forest. A real place brought in from a photo
(see [Hikes](../hikes/README.md)) says what kind of country it is in, and
that decides what its ground is made of, what grows and lives there, and what
the sky over it is doing. The kinds, and what each is like, are one table
(`src/world/country.js`); the hikes' README lists them.

This feature is the part that follows you about. As you come onto a real
place its weather comes over you: its layer of cloud, at its real height, so
you can be under it or above it; how thick its air is; how much sun gets
through. In the forest it has nothing to do.

From the console: `world.country.name`.

## Files

```
index.js              plugs it into the game: the colours and the weather of the country you're in
here.js               which real place you're on, and its weather where you stand
```
