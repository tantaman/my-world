# abduction

A study, apart from the game: remaking "The Abduction" by Jav
([@javpixel_art](https://x.com/javpixel_art/status/2125403467942654008)), a
72 second bodycam walk round a wet petrol station at night that ends with a
flying saucer taking a cow, posted as "fully 3D, made with three.js". We
don't have its code. Remaking it is how we find out whether three.js can draw
it, and at what cost per frame.

**Not built yet.** [PLAN.md](PLAN.md) is the whole hand-off: what is in the
video second by second, the place with sizes, how each effect is done and
which three.js module does it, the files to write, the milestones in order
with what "done" looks like for each, and how to compare ours with theirs.

```bash
node abduction/tools/reference.mjs   # fetch the video, cut the stills the plan names
```

- `PLAN.md`: the breakdown and the plan.
- `tools/reference.mjs`: fetches the piece into `reference/` (not committed:
  it is someone else's work) and cuts the 19 stills, the frame-by-frame
  sheets, the sound and its spectrogram.

Nothing here is imported by the game, and nothing in `src/` is imported here.
