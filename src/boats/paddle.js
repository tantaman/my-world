// Paddling: the stroke the hiker makes sitting in a boat, and when in it the
// blade goes into the water and comes out again (for the splash and the
// sound).
//
// The stroke is a work pose (Character.play('paddle', dur, true)) over one
// stroke, p = 0..1, on the right-hand side: reach forward with the blade, pull
// it back past the hip, lift it out and swing it forward again over the
// water. The paddle is held by its grip in the right hand (the top hand), and
// the left arm follows, as it does for every tool. See character.js for what
// each angle is; `tool` is worked out so the paddle's own pitch (0 straight
// down, negative with the blade ahead) is what's wanted.

import { definePose } from '../player/character.js';

// Seconds a stroke takes: steady, and paddling hard.
export const STROKE = { easy: 1.05, hard: 0.72 };
// Where in a stroke the blade goes in, and comes out (p).
export const CATCH = 0.06;
export const EXIT = 0.58;

// A frame of the stroke: the body's lean (sp) and turn (tw), the arm (sh, el,
// inw), and the paddle's own pitch and sideways tilt (blade out to the right).
const frame = ({ sp, tw, sh, el, inw, pitch, tilt }) => ({ sp, tw, sh, el, inw, tool: pitch - sp - sh - el, cock: tilt, drop: 0 });

definePose('paddle', [
  [0, frame({ sp: 0.28, tw: -0.5, sh: -2.0, el: -0.55, inw: 0.2, pitch: -0.55, tilt: -0.3 })], // the catch, reaching forward
  [0.45, frame({ sp: -0.04, tw: -0.72, sh: -1.55, el: -0.95, inw: 0.24, pitch: 0.3, tilt: -0.28 })], // pulled back past the hip
  [0.6, frame({ sp: 0.0, tw: -0.6, sh: -1.25, el: -1.35, inw: 0.24, pitch: 0.85, tilt: -0.5 })], // out of the water behind
  [0.85, frame({ sp: 0.18, tw: -0.45, sh: -1.85, el: -0.85, inw: 0.2, pitch: -0.95, tilt: -0.6 })], // swung forward over it
  [1, frame({ sp: 0.28, tw: -0.5, sh: -2.0, el: -0.55, inw: 0.2, pitch: -0.55, tilt: -0.3 })],
]);

// Did the stroke pass p since last time? (from, to: where it was and is, 0..1)
export function passed(from, to, p) {
  return from <= to ? from < p && to >= p : from < p || to >= p;
}
