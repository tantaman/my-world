// What you did in the air: whether you came down on your skis, what it's
// called, and what it's worth. No three.js here, and nothing of the game:
// the skier (skier.js) hands in the numbers.
//
// An air, as the skier keeps it:
//   time     s off the ground
//   height   the most you were over the snow (m)
//   spin     how far you turned about the up axis (radians, signed: + is to the left)
//   flip     how far you turned head over heels (radians, signed: + is forward)
//   grab     s with a hand on your skis or board
//   popped   whether you jumped, rather than went off the top of something
//
// And the landing:
//   skew     how far the skis are off the way you're going, after taking out
//            any half turn (radians)
//   upright  how far from upright you are (radians, the flip wrapped round)
//   impact   how fast you meet the snow, square to it (m/s)
//   grabbing whether you still have hold of them

import { wrapAngle as wrap } from '../core/geom.js';

// Coming down this far (radians) off the way you're going, or this far off
// upright, or this hard (m/s into the snow) is a fall.
export const LAND = { skew: 0.62, upright: 0.8, impact: 15 };
// Shorter and lower than this (s, m) and you only skipped over a bump: it
// isn't an air, and nothing is judged.
export const AIR = { time: 0.3, height: 0.35 };
// Points: per second in the air; per half turn (each more is worth a quarter
// more than the last); per flip (squared: a double is worth four); a grab,
// and per second held; landing switch.
export const POINTS = { air: 40, half: 100, flip: 400, grab: 80, held: 120, switch: 50 };
// Grabs by what's underfoot: spinning, flipping, or neither.
const GRABS = {
  skis: { spin: 'mute grab', flip: 'tail grab', plain: 'safety grab' },
  board: { spin: 'indy', flip: 'melon', plain: 'method' },
};
const FLIPS = ['', '', 'double ', 'triple ', 'quad '];


// Was it an air at all, or just a skip over a bump?
export const counts = (air) => air.popped || air.time >= AIR.time || air.height >= AIR.height;

// How many half turns, and whole flips, it comes to.
export const halves = (air) => Math.round(Math.abs(air.spin) / Math.PI);
export const flips = (air) => Math.round(Math.abs(air.flip) / (Math.PI * 2));

// -> null if you came down on your skis, or why you didn't.
export function fall(landing) {
  if (Math.abs(wrap(landing.upright)) > LAND.upright) return Math.abs(wrap(landing.upright)) > 2 ? 'on your head' : 'on your back';
  if (Math.abs(landing.skew) > LAND.skew) return 'sideways';
  if (landing.impact > LAND.impact) return 'too hard';
  return null;
}

// What it's called: '360', 'backflip', 'double backflip 540 · mute grab', or
// 'big air', or '' for a little hop not worth a name.
export function nameOf(air, gear = 'skis') {
  const parts = [];
  const f = flips(air);
  if (f) parts.push(`${f < FLIPS.length ? FLIPS[f] : `${f}× `}${air.flip > 0 ? 'frontflip' : 'backflip'}`);
  const h = halves(air);
  if (h) parts.push(String(h * 180));
  let name = parts.join(' ');
  if (air.grab >= 0.25) {
    const g = GRABS[gear] || GRABS.skis;
    const grab = h ? g.spin : f ? g.flip : g.plain;
    name = name ? `${name} · ${grab}` : grab;
  }
  if (!name && air.time >= 1.2) name = 'big air';
  return name;
}

// -> points for it, landed clean. Still holding the grab as you came down
// (sketchy) is worth half.
export function score(air, { switched = false, sketchy = false } = {}) {
  if (!counts(air)) return 0;
  const h = halves(air);
  const f = flips(air);
  let p = air.time * POINTS.air;
  for (let i = 0; i < h; i++) p += POINTS.half * (1 + 0.25 * i);
  p += POINTS.flip * f * f;
  if (air.grab >= 0.25) p += POINTS.grab + air.grab * POINTS.held;
  if (switched) p += POINTS.switch;
  if (sketchy) p *= 0.5;
  return Math.round(p / 5) * 5;
}
