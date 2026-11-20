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

## Files

```
index.js              plugs it into the game: controls, the hiker, where you arrive
player.js             movement, collision, wading, swimming and diving, third-person camera
character.js          procedural hiker model, IK gait, work poses, swimming, things raised to the face, a stance on skis or a board
head.js               the hiker's face and beard, sunglasses and snapback
input.js              keyboard, mouse, touch
peers.js              everyone else, drawn and eased between messages
```
