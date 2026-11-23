# The HUD

What is written over the picture: your coordinates, your heading and the
hour; the prompt that says what a click would do; the tool bar; the buttons
along the edge; the help panel (**H** or **?**, or a pad's **start**), which
is written from the keys the features bind, so it lists every one of them;
and the settings panel. With a pad in hand the help panel names the pad's
buttons, and so do the prompts.

**The tool bar** has a slot for each kit of tools (see
[Building](../build/README.md)), numbered for its key. A kit of more than
one tool has a pip for each, and opens over its slot for a moment when it's
picked, so you can see what's in it and click one.

**Settings** (**O**, or *settings* in the corner) are the things you set once
and leave: how the picture looks, the hour, the sound, who is hiking. They
don't each take a key. Each is a switch, a slider or a choice of a few, put
there by whichever feature owns it (`hud.setting`), under a heading it names
(*picture*, say). **O** or **Esc** closes it.

| | |
|---|---|
| **H** / **?** · pad **start** | help: every key |
| **O** | settings |

## Files

```
index.js              plugs it into the game: the help and settings keys and buttons
hud.js                coordinates, prompts, tool bar and its kits, help panel, buttons
settingsPanel.js      the settings panel, written from what features put on it
settings.css          its look
pictures.js           what settings look like in your pack
```
