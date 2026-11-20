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

## Files

```
index.js              plugs it into the game: controls, the hiker, where you arrive
player.js             movement, collision, wading and swimming, third-person camera, looking through a sight
character.js          procedural hiker model, IK gait, work poses (and features' own), things raised to the face
head.js               the hiker's face and beard, sunglasses and snapback
input.js              keyboard, mouse, touch
peers.js              everyone else, drawn and eased between messages
```
