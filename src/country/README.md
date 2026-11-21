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

Where a real place has a sea, you hear it break on the shore: one wave after
another gathers with a low rumble, breaks in a wash and runs up the shore
hissing before it drains away, a few seconds apart and no two the same size.
It's heard from where the white water is, and fades as you walk inland.

Something else can lay a cloud of its own over everything for a while, as a
flight does climbing up through it and over the top
(`country.cloud(fn)`: fn() says where it lies and how much of it there is,
or null). While one does, it has the sky; when it goes, the real place's
weather comes back over you.

From the console: `world.country.name`.

## Files

```
index.js              plugs it into the game: every country's colours, and the weather and the surf where you are
here.js               which real place you're on, and its weather where you stand
surf.js               the sound of the sea breaking on a real shore
```
