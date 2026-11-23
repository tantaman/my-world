# The hiker

You can be one of a few people, picked on the settings panel (**O**, under
*you*: who is hiking). Your browser remembers who, and the others in a shared
world see you as them.

- **The hiker** wears an orange rain shell with the hood gathered at the
  collar, a loaded daypack with a hydration hose, tan trousers, a brown
  snapback with a maroon brim, white sunglasses and a beard.
- **Lauren** is about 1.6 m tall, slim and long-legged, with narrower
  shoulders than the hiker's and a slim waist. She wears a royal-blue ribbed tank top with a
  fine gold chain at her neck, black leggings, grey wool socks and trim
  charcoal hiking boots with mint at the heel. She carries a black
  packable daypack, its blue hydration hose looped across her chest, and has
  her blue-violet down jacket tied round her waist by its sleeves. Her white cap is
  stitched in grey, and her long dark-brown hair goes through the back of it
  in a ponytail that swings as she goes. She has gold aviators with mirrored
  violet lenses, small pearl studs, and a wide smile.
- **Oliver** is five, nearly six, and about 1.16 m tall. He wears a dark
  green henley with three buttons at the neck, navy joggers gathered over
  grey socks, and royal blue trainers with white soles and a red-orange heel.
  His dark hair is faded short at the sides and spiky on top, his eyes are
  brown, and his ears stand out a little.
- **Elliott** is nearly three, and about 0.95 m tall. He wears a dark
  forest-green puffer jacket quilted in channels, unzipped at the top so the
  collar falls open on its navy lining, over an oatmeal henley; sage-green
  joggers rolled up at the ankle; and charcoal trainers with a strap across
  and a red band round the collar. His dark brown hair is long on top and
  falls forward into a straight fringe, clipped short at the sides, with a
  few strands standing up at the crown.

The clothes have woven surfaces generated in code. Sleeves and trouser legs
bend with the elbows and knees, and folds catch the light as you move.
Whatever you're holding or wearing (the axe, the radio, a headlamp, a
jetpack) stays with you when you change who you are.

Someone smaller is the same body made smaller, with a child's bigger head. They
walk the way a small child does at the same speed: quicker, shorter steps,
so the feet still don't skate. The camera sits at their eye level, deep
water floats them sooner, and wading drags at them sooner too.

The grown-ups' faces are drawn from photos of them. The hiker has a
real-sized head with a lean face and a long, straight nose, smiling, a full
dark beard and short dark hair at the sides, and square white frames with
dark lenses that catch the sky. Lauren has an oval face with high
cheekbones, a small straight nose, a clean jawline tapering from under her
ears to a broad, rounded chin, and full lips parted in a smile. Beard, short hair and eyebrows are layers of strands you can make out
up close, which become a solid mass of hair further off. Lauren's long hair
is drawn back smooth and glossy behind her ears. Her ponytail hangs
from where it's gathered: it falls, trails and bobs as she goes, swings
from side to side when she runs, and springs back to lie down her back over
her pack.

The walk is solved, not keyframed. Each foot follows a path on the ground,
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
it's like down there is [Under the water](../underwater/README.md). Water
held up in something built (a pool, a hot tub: `world/basins.js`) is waded
and swum in the same way, wherever it is.

Zoom in (the mouse wheel, or the d-pad on a pad) and the camera comes in
behind you; zoom in past the nearest it comes and it goes into your head,
and you look out of your own eyes, able to look further up and down. Zoom
out and it comes back out behind you. Something that moves you itself (a
train, a plane, skis, a tube) shows you riding it, and puts you back behind
your eyes when you get off.

## The camera behind you

If steering the camera and walking at once is a handful, switch on *camera
locked behind you* on the settings panel (**O**, under *you*). Then the
camera stays behind you, looking past your right shoulder the way you face,
and one stick (or **W A S D**, or the arrows, or your left thumb on a touch
screen) does everything:

| | |
|---|---|
| forward | walk the way you face (all the way: run) |
| left · right | turn, on the spot or as you go |
| back | back up, slower, still facing ahead |

Looking about (the mouse, the right stick, your right thumb, **Q E**) turns
you too, and still tips the camera up and down. The right stick tips it only
when pushed more up or down than across, so turning with it doesn't tip the
camera as well, little by little, until it's on the ground looking up at you.
Whatever tipped it, leave it a moment and walk on, and the camera comes back
to where it sits to begin with. On something you steer
yourself (a horse, a boat) it's the same: left and right turn it. On
something that carries you along (a train, skis, a car) the camera keeps
round behind the way you're going. Your browser remembers the choice.

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
| d-pad **↑ ↓** | zoom in · out · held in, into your own eyes |

What the other buttons do is on the help panel, and in each feature's own
notes beside its keys.

With the map or a panel open, **B** or the button that opened it closes it,
the d-pad goes from one button to the next (the lists beside the map too) and
**A** presses it, the stick pans the map and **LB RB** zoom it. The browser
starts sound only after a key or a click, so with a pad alone the forest may
stay quiet until one.

A feature gives a command a pad button by listing it with its keys
(`keys: ['KeyM', 'PadSelect']`); `gamepad.js` has the names.

## Someone new

A hiker is a file in `hikers/` and a line in `HIKERS` (`hikers.js`), which
is also the order they're offered in. The file exports
`{ id, name, size, dress(body) }`, and `shoulders` and `legs` if theirs
aren't the grown-up's: what each of those is, and what `dress`
hangs clothes on and has to say back, is at the top of `Character` in
`character.js`. For a grown-up, `lauren.js` is the one to start from; for a
child, `oliver.js`. A grown-up's head is built by `head.js` to a look: the
eggs the skull is made of (each round the middle of the head, or the skin
has a seam where one ends) and any it's cut back to (for a jawline with an
edge), the nose, the mouth and how far the face's
features stand out, where hair grows and how long and which way it lies (or
drawn back smooth, for long hair), and the colours. Sunglasses and a cap are built there too, to each one's own
frames and shape. A child's head is built round the eyes by `child.js`, to
a look of its own: how big the skull is, where the face sits on it, where
the hair stops and how it lies, and the colours. Oliver's clothes reuse the grown-up's patterns taken in; Elliott's
jacket and sleeves are rows of their own, quilted. The helpers for putting
things on the bones are at the end of `clothing.js`.

Measurements are in metres of the grown-up's body, whatever `size` is: the
whole figure is scaled by it afterwards. The `id` is what others in a shared
world are told, so don't change it once someone has played as them; the
`name` can change.

## Files

```
index.js              plugs it into the game: controls, the hiker, who you are, the camera behind you, where you arrive
player.js             movement, collision, wading, swimming and diving, the camera: behind you (free or locked) or from your eyes
character.js          the body anyone has: bones, IK gait (forwards or backwards), work poses (played, or held part-way), swimming, things raised to the face, a stance on skis or a board; dressed as one of the hikers, at their size, or as someone else altogether (the fighters in Dry Wells)
hikers.js             who you can be: the hikers, in the order they're offered
hikers/hiker.js       the hiker: his look, sunglasses and snapback; rain shell, daypack, trousers and boots
hikers/lauren.js      Lauren: her look, aviators, cap and swinging ponytail; tank top, daypack, tied jacket, leggings and boots
hikers/oliver.js      Oliver: his look, henley, joggers and trainers
hikers/elliott.js     Elliott: his look, puffer jacket, henley at the neck, joggers and trainers
hikers/child.js       what the children share: a head built to a look, patterns taken in, trainers
clothing.js           garment sections, cloth folds, boots and generated weave, and putting them on the bones
head.js               a grown-up's head to a look: face, ears, hair and beard (strands in layers, or long hair drawn back smooth); sunglasses and caps
input.js              keyboard, mouse, touch, and a pad's buttons as keys
gamepad.js            game controllers: reading them, what their buttons are called, typing into panels
peers.js              everyone else, drawn as whoever they are and eased between messages
pictures.js           what going back to the start looks like in your pack
```
