// The guide: who drives the boat, how they sit up at the stick, and what
// they tell you on the way round.
//
//   makeGuide(who, seed) -> Body (towns/people.js), dressed for the bayou
//   sitDriving(body, dt, { lookAt, point, stick }) poses it in the high seat:
//                           legs down to the footrest, left hand on the stick,
//                           head turned to lookAt (radians, relative to the
//                           boat), the right arm out at `point` if it's
//                           pointing something out
//   SAYS                    the lines, by when they're said; {side} and {ft}
//                           are filled in where a gator is pointed out
//   gatorLine(gator, side, n) the words for one, by how big it is and where

import * as THREE from 'three';
import { Body } from '../people/body.js';
import { mulberry32 } from '../noise.js';
import { clamp, lerp } from '../noise.js';

export function makeGuide(who, seed) {
  const rnd = mulberry32(seed + 77);
  const c = (hex) => new THREE.Color(hex);
  const look = {
    her: who.her,
    child: false,
    dark: false,
    height: 0.98 + rnd() * 0.05,
    build: 1.08 + rnd() * 0.1,
    skin: c([0xc68c6c, 0xdcae90, 0x8a5a3c, 0xb07a58][Math.floor(rnd() * 4)]),
    hair: c([0x4a3a2a, 0x2a2420, 0x6a6a66][Math.floor(rnd() * 3)]),
    shirt: c(0x5a6a3a),
    vest: null,
    legs: c(0x34404e),
    dress: null,
    apron: false,
    coat: false,
    hat: 'cap',
    hatColor: c(0x6b5a3a),
    beard: !who.her,
  };
  return new Body(look, seed);
}

// Sitting up in the guide's seat: the body is placed so its hips are on the
// seat (see index.js); this bends it to sit, and puts the hands where they go.
export function sitDriving(body, dt, { lookAt = null, point = null } = {}) {
  body.pose(dt, 0, lookAt);
  for (const { thigh, shin, foot } of body.legs) {
    thigh.rotation.x = -1.35;
    shin.rotation.x = 1.25;
    foot.rotation.x = 0.1;
  }
  body.hips.position.y = body.hips.userData.rest.y;
  const [left, right] = body.arms;
  // the left hand forward and down on the stick
  left.arm.rotation.x = -0.75;
  left.arm.rotation.z = 0.18;
  left.fore.rotation.x = -0.6;
  // the right resting on the knee, or held out to point
  const k = point === null ? 0 : 1;
  body.pointing = lerp(body.pointing ?? 0, k, clamp(dt * 4, 0, 1));
  const p = body.pointing;
  const across = point === null ? 0 : clamp(point, -1.2, 1.2);
  right.arm.rotation.x = lerp(-0.45, -1.45, p);
  right.arm.rotation.z = lerp(-0.12, -0.25 + across * 0.9, p);
  right.fore.rotation.x = lerp(-0.9, -0.15, p);
  right.fore.rotation.z = 0;
}

// What the guide says, and when: at the dock, getting in, and at points
// along the way (`at`, a share of the way round). In the guide's own words.
export const SAYS = {
  hello: ['Mornin’! Y’all here to see some gators? Hop on in: front row’s the best seat in the house.', 'Hey there! Come on, we’re just about to head out. Climb on in.'],
  back: ['Back for more? Hop in.', 'Good to see you again. Climb on in.'],
  board: 'Put them ear muffs on, she’s loud. Hang on to your hat!',
  along: [
    { at: 0.04, line: 'This here’s Bayou Barataria. Jean Lafitte the pirate ran his smuggling right through these waters, two hundred years back.' },
    { at: 0.16, line: 'See all that moss hanging off the trees? Spanish moss. It ain’t Spanish and it ain’t moss: it’s kin to the pineapple. Lives on air and rain.' },
    { at: 0.3, line: 'These old canals were dug for the oil and gas, back in the day. The swamp’s been taking ’em back ever since.' },
    { at: 0.48, line: 'Those big trees are bald cypress. They drop their needles every winter, so they go bald. The wood don’t rot: half the old houses round here are built of it.' },
    { at: 0.62, line: 'This time of year the big males bellow. You feel it in your chest before you hear it.' },
    { at: 0.82, line: 'Alright, let’s head on back.' },
  ],
  done: 'That’s the tour, folks! Hope y’all enjoyed it. If you liked the ride, tip the guide!',
  early: 'Had enough? No problem, I’ll run you on back in.',
  none: 'Huh. Must be too cool for ’em today. They’re out there, though: they’re always out there.',
};

// Feet, as the guide gives a length.
const feet = (m) => Math.round(m / 0.3048);

// The words for a gator being pointed out, by how big it is and where:
// side is 'left' or 'right' (of the boat's way), n how many so far.
export function gatorLine(g, side, n) {
  const ft = feet(g.L);
  const where = side === 'left' ? 'on your left' : 'on your right';
  if (g.L < 1.8) return `There’s a young one, ${where}! See the yellow stripes on him? They lose those when they grow up. ’Bout ${ft} foot.`;
  if (g.pose === 'float') return n === 0 ? `Look ${where}: just the eyes and the nose, there in the water. That’s a gator. There’s ${ft} foot of him under there.` : `Another one, ${where}, lying in the water. See them eyes? He’s watching us.`;
  if (g.L > 3.2) return `Whoa, look at him, ${where}, up on the bank! That’s a big ol’ boy, ’bout ${ft} foot. He’s the boss round here.`;
  return n === 0 ? `There! Up on the bank, ${where}: see him? Sunning himself. Mouth open like that, he ain’t mad: that’s how they cool off. ’Bout ${ft} foot.` : `Got another one ${where}, on the bank there. ’Bout ${ft} foot.`;
}
