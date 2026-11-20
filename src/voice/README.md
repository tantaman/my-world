# Talking

People in the same world can talk to each other, two ways. Both are push to
talk: nothing you say leaves the room unless you are holding a key.

- **Aloud — hold C.** Your own voice, heard from where you are standing by
  whoever is near enough. It's placed in 3D like every other sound, as loud as
  a voice gets within a couple of metres, quieter and duller across a
  clearing, and gone by about 40 m.
- **On the radio — hold X.** Everyone carries a little yellow walkie-talkie
  clipped to their pack strap. Hold X and you unclip it and talk into it, and
  everyone in the world hears you wherever they are, thin and crackly, with a
  click and a hiss when you key up and a burst of static when you let go.
  Everyone's radio is always on, so you hear all the chatter. Whoever is
  standing beside you hears your own voice as well.

Whoever is talking has three little bars jumping over their head, in their
colour, and is listed in the bottom-left corner, with how far off they are or
*radio*. You're listed there too while you talk, with a level so you can see
the microphone hears you.

The browser asks for the microphone the first time you talk, not before, and
it's let go of again after a minute without talking. Voice goes straight from
browser to browser (WebRTC, one connection to each person). The save server
only passes on the few small messages that set those connections up, and who
is talking. Nothing is recorded or kept. Voices come through the game's sound,
so turning the sound off (settings, **O**) silences them too. They have buses of their own, so
`world.sound.volume('radio', 0.5)` turns the chatter down. Headphones help:
browsers don't always cancel the echo of sound a page plays itself.

From the console, `world.voice.list()` shows everyone here, how they're
talking, how loud, and how the line to each of them is.

Most home connections can reach each other directly. Where two people
can't (some offices, some phone networks), their voices need relaying through
a TURN server. See [Setting up the server](../save/README.md#setting-up-the-server).

## Files

```
index.js              plugs it into the game: talking aloud (C) and on the radio (X)
talk.js               push to talk: whether you are talking, and how
mic.js                the microphone: asked for when you first talk, let go of after
mesh.js               a WebRTC line to each person here, set up over the socket
voices.js             what you hear of them: placed where they stand, or on the radio
radio.js              what a voice sounds like through a walkie-talkie; squelch and static
walkie.js             the radio itself, on the strap and in the hand
bars.js               bars over the head of whoever is talking
onScreen.js           who is talking, in the corner; the touch buttons
```
