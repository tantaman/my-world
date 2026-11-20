# How it sounds

The sound is made in code too, with the Web Audio API. There are no audio
files (`src/audio/`). Browsers only allow sound after you
interact, so it fades in after your first click, key press or tap.

- **Wind** is low-passed brown noise that gusts along with the swaying
  trees. It gets louder in open meadows and on high ground.
- **Leaves** rustle in swells under the canopy when a gust passes through.
- **Birds** are placed in 3D in the trees around you, using HRTF panning and
  a forest reverb. You'll hear flute-like thrush phrases, two-note
  "fee-bee" whistles, warbler trills, chip calls, wood-pigeon coos and the
  occasional woodpecker. There's a dawn chorus, quieter days, a little
  evensong, and silence after dark.
- **Night** brings crickets, louder in the open, and an owl in the distance.
- **Animals** call from where they actually are: a deer's alarm snort and
  stamp, an elk bugling across a meadow, a wolf pack howling one after
  another, a fox's yapping bark, a squirrel scolding from its trunk, a
  chipmunk's chips, a bear blowing, a rattlesnake's buzz, crows, a red-tail's
  scream, a flock bursting up in a whirr of wings, bumblebees about your
  knees, and hooves when something big bolts past.
- **Water** babbles. It's heard from where it actually runs, from up to three
  places at once, so a stream on your left and a river on your right are
  heard on your left and your right. Each is made of bubbles: short tones
  that ring at a pitch set by the bubble's size and rise as it closes, the
  way a brook really sounds. Small, high ones on a stream, deeper ones on a
  river, and many more of them on white water, over a rush that hisses on a
  cascade and a low roar under a river. Far-off water loses its high end
  first, and so does water with a bank between you and it. Stand in it and
  you hear it gurgle round your legs, more the faster it's going past them.
  Still water laps at the shore in slow swells, something small plops in now
  and then, and from dusk the frogs start up. The sea roars along its shore,
  and every so often a wave builds, breaks, and runs hissing back down the
  sand.
- **Under the water** everything from above goes dull and far away
  (`sound.muffle()`), under the slow hush of the water itself. See
  [Under the water](../underwater/README.md).
- **Voices** of the people you share a world with: from where they stand
  when they talk aloud, and through your radio when they're on it. See
  [Talking](../voice/README.md).
- **Footsteps** follow the stride of the walk and run animation. They
  change with the ground under you: packed earth and grit on paths and on
  the stony ground above the trees, a swish in grass, crackling leaf litter
  in the woods, a squeaky crunch in snow, a slosh and a splash and
  falling drops in water, a hollow knock on the boards of a dock or a cabin
  floor. They get sharper when you run, there's a thud when
  you land a jump, and out of your depth each stroke sweeps through the water.

- **Work** makes noise too. You'll hear the axe biting (deeper on a thick
  trunk), a tree creaking as it goes, then the crash and the crown thrashing
  through the brush. There's the scrape and toss of the spade, the knock of a
  log set down on another, and the clack of stones.
- **Fires** breathe and crackle where they burn, with the odd pop of resin.
  You'll hear the flint strike and the tinder catch with a rush, and a long
  hiss when you kick earth over the coals.

Sound pauses when the tab is hidden. Add `?mute` to the URL to start silent.

## Settings

| | |
|---|---|
| sound | on / off, on the settings panel (**O**) |

## Files

```
index.js              plugs it into the game: footsteps, the sound key, what the forest is told
soundscape.js         the engine: audio context, mixer buses, the kit, layers
kit.js                noise, impulse, envelope
layers/               weather · crickets · birds · water and pond life
sfx.js                the sounds of work, as a table
calls.js              animal calls, placed where the animal is
footsteps.js          by what is underfoot
```
