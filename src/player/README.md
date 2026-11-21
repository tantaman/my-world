# The hiker

The hiker is built from primitives: an orange rain shell with the hood
rolled at the collar, a black daypack with a hydration hose, tan trousers,
a brown snapback with a maroon brim, white sunglasses and a beard. The
walk is solved, not keyframed. Each foot follows a path on the ground,
rolling heel to toe while it's planted and arcing forward when it swings.
Two-bone IK bends the hip and knee to reach it, so planted feet don't
skate. Stride and cadence grow with speed (about 110 steps a minute
strolling, 150 walking, 200 running), and running adds a flight phase.
The hips vault over the stance leg when walking and bounce when running,
and the shoulders counter-rotate. The body leans into starts, turns and
climbs. Feet settle onto slopes and sills, and the hips drop to let the
lower leg reach. Landings are absorbed in the knees. Standing still, the
hiker shifts weight and looks around now and then.

Out of your depth the hiker swims, head and shoulders out. Hold **shift**
(or **dive** on a touch screen) to go under and **space** to come back up;
let go and you drift slowly up to float. Under the surface you swim the way
the camera looks, up and down as well as along, lying flat with a flutter
kick and breaststroke, the body turning about the chest to lie along the way
you go; still, you tread water upright. The camera follows you under. What
it's like down there is [Under the water](../underwater/README.md).

## With a game controller

Plug a pad in and press any button on it: the browser shows a page no pad
until then. From then on the help panel (start) and the prompts call the
controls by its buttons, and a key or the mouse puts it down again. Most pads
with the standard layout work: Xbox, PlayStation, Nintendo Pro and the like,
each with its buttons called what they're called on it.

Which pads a browser gives that layout to differs, and a pad it doesn't is
read by guessing: its buttons are taken in the standard order, and an axis
sitting away from the middle when it is picked up is a trigger rather than a
stick, so it isn't one (it would otherwise turn the camera for ever). On such
a pad a stick may be short of a way to push it. Another browser may well know
the same pad properly.

| on the pad | does |
|---|---|
| left stick | walk (the further over, the faster) · under water, swim |
| right stick | look around |
| **A** | jump · climb, flying · come up, out of your depth |
| **B**, held | run · stoop, flying · dive, out of your depth |
| d-pad **↑ ↓** | zoom in · out |

What the other buttons do is on the help panel, and in each feature's own
notes beside its keys.

With the map or a panel open, **B** or the button that opened it closes it,
the d-pad goes from one button to the next (the lists beside the map too) and
**A** presses it, the stick pans the map and **LB RB** zoom it. The browser
starts sound only after a key or a click, so with a pad alone the forest may
stay quiet until one.

A feature gives a command a pad button by listing it with its keys
(`keys: ['KeyM', 'PadSelect']`); `gamepad.js` has the names.

## Files

```
index.js              plugs it into the game: controls, the hiker, where you arrive
player.js             movement, collision, wading, swimming and diving, third-person camera
character.js          procedural hiker model, IK gait, work poses, swimming, things raised to the face, a stance on skis or a board
head.js               the hiker's face and beard, sunglasses and snapback
input.js              keyboard, mouse, touch, and a pad's buttons as keys
gamepad.js            game controllers: reading them, what their buttons are called, typing into panels
peers.js              everyone else, drawn and eased between messages
```
