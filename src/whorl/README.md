# The Whorl

The stainless-steel slide down the middle of the Nautilus Lookout Tower at
Owl Creek Landing, in the woods behind the Virginia Aquarium's South
Building in Virginia Beach. It opened in 2025, and is said to be the longest
stainless-steel slide in the United States. Here it's life size, where it
really is, on its real ground.

**Getting there.** It's in Virginia Beach, on the real Earth as the rest of
the world is (see [the real Earth](../world/README.md#the-real-earth)), a
long way east of where you start. Open the map (**M**): the Whorl is under
*slides*, and *go here* sets you down at the foot of the tower's ramp,
facing it. It's in the *hikes* list beside the map too, as **Owl Creek
Landing**. That walk starts in the South Building's car park and goes up the
path and over the footbridge across Owls Creek. It ends where the path comes
off the bridge, looking up through the trees at the tower. A gravel path goes
on up from there to the tower's foot. In your pack, *the Whorl: where it is*
says how far off it is.

**The tower** is an octagon of galvanized steel, 25 m across, its flat faces
north, south, east and west, as KristallTurm built it and as it shows from
above. A ramp a little over three metres wide winds up round the outside of
it, six times round, climbing 3.2 m a lap: 430 m of gentle slope (4.5%) from
the ground to the top. The last few metres of it are level, where it comes
out onto the top deck. The top deck is the inner ring, round the open middle
the slide goes down. There's nothing over either ring, so from the top
you're 19 m up with the trees all round you. Its decks are steel grating
(they clank underfoot), its rails have mesh panels and are too high to hop,
and the frame is braced on every face. A sign at the foot of the ramp says
what it is.

**The slide.** Its mouth is on the west side of the top deck, through a gap
in the rail under a bar with the slide's name on it, with a pile of blue
mats beside it. F there (the act key: see [Acting](../act/README.md)) sits
you on a mat, lying well back, and pushes you off. It's a stainless tube a
metre across, open as a trough where you get in. It goes a turn and a half
down the middle of the tower and comes out low through the south-east face,
under the foot of the ramp. Then a short run-out on legs slows you to a
stop, and you step off onto the ground. It's 54 m long along its floor
(177 ft: it's been given as 117 feet and as more than 170), and falls
about 25° down the middle. You go as a body on felt goes over steel: quick
down the middle, but the faster you go round, the harder the wall presses
you and holds you back. So you settle at about 25 km/h, riding up the
outside wall in the turns and leaning into them. It takes about eleven
seconds; the real one is said to take about ten. In the tube the camera
stays with you, behind you, looking down it. You hear the felt hissing on the steel, the tube booming round you
and a knock at each joint, and the forest outside goes muffled. How many
times you've been down, your quickest and your fastest are yours (saved).

**Not there yet:** the tower's two staircases, the treetop walkway and the
treehouses, the aquarium's buildings, and anybody else on the slide.

| | |
|---|---|
| **M**, then *slides* | the Whorl, at the foot of its tower: *go here* |
| **F** at the top, by the mouth | down the Whorl |
| **Tab** | your pack: *the Whorl: where it is* |

From the console: `await world.whorl.go('top')` (or `'foot'`),
`world.whorl.slide()`, `world.whorl.riding`, `world.whorl.hurry()` (to the
last of a ride), `world.whorl.ramp(u)`, `world.whorl.rides`.

## Where it comes from

Owl Creek Landing's ground is a real place brought in at 1 : 1 (see
[Hikes](../hikes/README.md)), centred on the tower:

```bash
npm run hike -- /dev/null --name "Owl Creek Landing" --id owl-creek-landing \
  --lat 36.8163074 --lon -75.9899979 --bearing 0 --hour 14 \
  --middle 36.81704,-75.98999 --from 36.8143504,-75.9892596 \
  --scale 1 --radius 500 --fade 400 --cell 8 --fine 2 --fine-margin 200 \
  --dem 3dep --country "deciduous forest" --cover 0.8 --species -0.3 --snow none
```

The heights are the USGS's lidar (3DEP), a metre or two apart along the walk.
Owls Creek and its marsh, the paths and the footbridge are OpenStreetMap's.
Owls Creek is too narrow for the land's grid and too long for a pool's, so
the importer keeps it on a grid of its own, as fine as fits. The tower is
where the satellite pictures have it, and as big; what it's made of and how
high it is come from KristallTurm, who built it ("20 meters high, 25 meters
wide, six levels"), and WTKR. The slide's length and time are as reported.
How it winds and where it comes out are worked out from the open middle
and the south-east face the pictures show. The path from the bridge to the
tower isn't on the map yet, so it goes straight up through the woods.

## Files

```
index.ts      plugs it into the game: where it is, standing it up, the forest kept off it, the ride, the camera, the map, what's yours
tower.js      the tower and the slide in numbers: the octagon, the ramp, the decks, rails and columns, the slide's path and its tube, the footbridge
ride.js       a ride down: gravity, the mat's friction, the wall in the turns; where you are in the tube
sound.js      the grating underfoot; the slide hissing, booming and knocking; sitting down and coming out
pictures.js   the Whorl in your pack
onMap.js      the tower on the map, close up: its rings, the run-out, the path and the bridge
look.js       (fetched) everything stood up: the steel, the stainless tube, the footbridge, the path, the signs, the mats
```
