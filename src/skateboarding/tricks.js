// What you did in the air: whether you came down on the board, what it's
// called, and what it's worth. No three.js here, and nothing of the game: the
// skater (skater.js) hands in the numbers.
//
// An air, as the skater keeps it:
//   time     s off the ground
//   height   the most you were over what's under you (m)
//   spin     how far you and the board turned together about the up axis
//            (radians, signed: + is to the left, which for a rider who
//            stands left foot forward is frontside)
//   flip     how far the board rolled over about its length (radians,
//            signed: + is a kickflip, - a heelflip)
//   shove    how far the board turned under you about the up axis
//            (radians, signed)
//   popped   whether you ollied, rather than rolled off the edge of something
//   fakie    whether you were riding backwards as you left the ground
//
// And the landing:
//   skew     how far the board is off the way you're going, after taking out
//            a half turn (radians)
//   roll     how far the board is from wheels down (radians, wrapped)
//   shove    how far the board is from lying along you, after taking out
//            its half turns (radians)
//   impact   how fast you meet the ground, square to it (m/s)

import { wrapAngle as wrap } from '../core/geom.js';

// Coming down with the board this far (radians) off the way you're going,
// this far from wheels down, this far across you, or this hard (m/s into the
// ground) is a bail.
export const LAND = { skew: 0.6, roll: 0.6, shove: 0.5, impact: 7.5 };
// Shorter and lower than this (s, m), and off the edge of something rather
// than ollied, and it was only a hop: it isn't an air, and nothing is judged.
export const AIR = { time: 0.3, height: 0.25 };
// Points: an ollie; per second in the air; per flip of the board (squared:
// a double is worth four); per half turn of it under you; per half turn of
// you and it together (each more worth a quarter more than the last); from
// fakie, and rolling away fakie.
export const POINTS = { ollie: 40, air: 30, flip: 150, shove: 70, half: 100, fakie: 40 };
const TIMES = ['', '', 'double ', 'triple ', 'quadruple '];

// Was it an air at all, or just a hop off a kerb?
export const counts = (air) => air.popped || air.time >= AIR.time || air.height >= AIR.height;

// How many whole flips of the board, half turns of it under you, and half
// turns of you and it together, it comes to.
export const flips = (air) => Math.round(Math.abs(air.flip) / (Math.PI * 2));
export const shoves = (air) => Math.round(Math.abs(air.shove) / Math.PI);
export const halves = (air) => Math.round(Math.abs(air.spin) / Math.PI);

// What's left over of a turn of the board under you once its half turns are
// taken out: 0 lying along you, ±π/2 square across.
export const across = (shove) => shove - Math.PI * Math.round(shove / Math.PI);

// -> null if you came down on the board, or why you didn't.
export function bail(landing) {
  const roll = Math.abs(wrap(landing.roll));
  if (roll > LAND.roll) return roll > 2.2 ? 'the board came down wheels up' : 'the board came down on its edge';
  if (Math.abs(across(landing.shove)) > LAND.shove) return 'the board came down across you';
  if (Math.abs(landing.skew) > LAND.skew) return 'landed sideways';
  if (landing.impact > LAND.impact) return 'came down too hard';
  return null;
}

// What the board did: 'ollie', 'kickflip', 'varial heelflip', '360 flip',
// '360 shove-it'... or '' off the edge of something with nothing done.
export function boardTrick(air) {
  const f = flips(air);
  const s = shoves(air);
  const kick = air.flip >= 0;
  if (!f) {
    if (s === 1) return 'pop shove-it';
    if (s > 1) return `${s * 180} shove-it`;
    return air.popped ? 'ollie' : '';
  }
  const flip = `${f < TIMES.length ? TIMES[f] : `${f}× `}${kick ? 'kickflip' : 'heelflip'}`;
  if (s === 1) return `varial ${flip}`;
  if (s === 2 && f === 1) return kick ? '360 flip' : 'laser flip';
  if (s > 1) return `${s * 180} ${flip}`;
  return flip;
}

// What it's called: 'kickflip', 'frontside 180', 'fakie backside 360
// heelflip', 'big drop', or '' for a hop not worth a name.
export function nameOf(air) {
  const h = halves(air);
  let trick = boardTrick(air);
  if (h) {
    const spin = `${air.spin > 0 ? 'frontside' : 'backside'} ${h * 180}`;
    trick = trick && trick !== 'ollie' ? `${spin} ${trick}` : spin;
  }
  if (!trick) return air.time >= 0.8 ? 'big drop' : '';
  return air.fakie ? `fakie ${trick}` : trick;
}

// -> points for it, landed clean. Rolling away backwards (fakie, as you
// land) is worth a little more.
export function score(air, { fakie = false } = {}) {
  if (!counts(air)) return 0;
  const h = halves(air);
  const f = flips(air);
  const s = shoves(air);
  let p = air.time * POINTS.air + (air.popped ? POINTS.ollie : 0);
  p += POINTS.flip * f * f;
  p += POINTS.shove * s;
  for (let i = 0; i < h; i++) p += POINTS.half * (1 + 0.25 * i);
  if (air.fakie) p += POINTS.fakie;
  if (fakie) p += POINTS.fakie;
  return Math.round(p / 5) * 5;
}
