// How a fighter moves in the town: on foot, carefully, the way a round that
// can't be taken back is played.
//
// You run at a pace set by what's in your hands (a knife is quicker than a
// long rifle), get up to it in a few steps and stop in a couple. Walking
// (shift) is half that and makes no sound; crouching is a third, and lowers
// you behind a crate. A jump is about a metre: onto a low crate, not over a
// wall. In the air you keep going the way you were, more or less, and
// landing takes the speed out of you, so hopping gets you nowhere faster.
//
// The world is boxes (town.js); a fighter is a box too, HALF m either way
// and as tall as they're standing, moved one axis at a time and stopped by
// what it meets. A ledge up to STEP high is walked up onto, and one as high
// down is walked off without leaving the ground.
//
// No three.js in here: a body is { pos, vel, grounded, crouch } of plain
// { x, y, z }, crouch 0 (standing) .. 1 (down).

import { rayBoxes, rayBox } from '../spaceport/mover.js';

export { rayBoxes, rayBox };

export const MOVE = {
  speed: 5.6, // m/s, running with nothing heavy in hand
  walk: 0.52, // of that, walking (shift): silent
  duck: 0.34, // of that, crouched
  accel: 9, // how quickly you get up to speed on the ground (1/s)
  airAccel: 5, // ...and in the air, where you can only nudge your way...
  airMost: 1.2, // ...by this much (m/s) across the way you're going
  friction: 7, // how quickly you slow on the ground (1/s)...
  stop: 1.6, // ...as if going at least this fast (m/s), so you stop dead
  landing: 0.55, // of your speed kept on coming down from a jump
  gravity: 19, // m/s²
  jump: 6.6, // m/s up: a jump about 1.15 m high
  step: 0.5, // m: the highest ledge you walk up onto
  half: 0.4, // m: the body's half-width
  height: 1.8, // m, standing
  low: 1.25, // m, crouched
  eye: 1.62, // m above the feet, standing
  eyeLow: 1.08, // ...and crouched
  duckTime: 0.2, // s to get down, or up again
};
const SUB = 1 / 120; // s: the longest step the movement is worked out in
const EPS = 1e-4;

export function makeBody(x = 0, y = 0, z = 0) {
  return { pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, grounded: true, crouch: 0 };
}

// How tall a body stands, and where its eye is, for how far down it is.
export const heightOf = (b) => MOVE.height + (MOVE.low - MOVE.height) * b.crouch;
export const eyeOf = (b) => MOVE.eye + (MOVE.eyeLow - MOVE.eye) * b.crouch;

// Move a body on for dt seconds.
//   wish     { x, z }: which way to go in the world, length 0..1
//   how      { jump, crouch, walk, speed }: jump and crouch held or not;
//            walk held; speed, the running pace of what's in hand (m/s)
//   boxes    the town's
//   events   an array that gets what happened: { what: 'jump' | 'land', speed? }
export function moveBody(body, wish, how, dt, boxes, events = null) {
  const n = Math.max(1, Math.ceil(dt / SUB));
  const h = dt / n;
  for (let i = 0; i < n; i++) step(body, wish, how, h, boxes, events);
}

function step(b, wish, how, h, boxes, events) {
  // down, or up again if there's room to stand
  const target = how.crouch ? 1 : 0;
  if (b.crouch !== target) {
    const next = Math.max(0, Math.min(1, b.crouch + (Math.sign(target - b.crouch) * h) / MOVE.duckTime));
    if (next > b.crouch || free(boxes, b.pos.x, b.pos.y, b.pos.z, MOVE.height + (MOVE.low - MOVE.height) * next)) b.crouch = next;
  }
  const tall = heightOf(b);
  if (b.grounded) stayOnFloor(b, boxes);
  const len = Math.hypot(wish.x, wish.z);
  const wx = len > 1e-6 ? wish.x / len : 0;
  const wz = len > 1e-6 ? wish.z / len : 0;
  const pace = (how.speed ?? MOVE.speed) * (b.crouch > 0.5 ? MOVE.duck : how.walk ? MOVE.walk : 1);
  const want = Math.min(1, len) * pace;
  if (b.grounded && how.jump && b.crouch < 0.5) {
    b.vel.y = MOVE.jump;
    b.grounded = false;
    if (events) events.push({ what: 'jump' });
  }
  if (b.grounded) {
    friction(b, h);
    accelerate(b, wx, wz, want, MOVE.accel, h);
  } else {
    accelerate(b, wx, wz, Math.min(want, MOVE.airMost), MOVE.airAccel, h);
    b.vel.y -= MOVE.gravity * h;
  }
  across(b, 'x', b.vel.x * h, boxes, tall);
  across(b, 'z', b.vel.z * h, boxes, tall);
  if (!b.grounded) upDown(b, b.vel.y * h, boxes, tall, events);
}

// Slowing on the ground: as if going at least `stop`, so a slow drift ends.
function friction(b, h) {
  const v = Math.hypot(b.vel.x, b.vel.z);
  if (v < 1e-4) {
    b.vel.x = b.vel.z = 0;
    return;
  }
  const drop = Math.max(v, MOVE.stop) * MOVE.friction * h;
  const k = Math.max(0, v - drop) / v;
  b.vel.x *= k;
  b.vel.z *= k;
}

// Speed up towards `want` m/s the way you wish to go.
function accelerate(b, wx, wz, want, accel, h) {
  if (want <= 0) return;
  const now = b.vel.x * wx + b.vel.z * wz;
  const add = want - now;
  if (add <= 0) return;
  const k = Math.min(accel * want * h, add);
  b.vel.x += wx * k;
  b.vel.z += wz * k;
}

const hits = (box, x, y, z, tall) => x + MOVE.half > box.x0 + EPS && x - MOVE.half < box.x1 - EPS && z + MOVE.half > box.z0 + EPS && z - MOVE.half < box.z1 - EPS && y + tall > box.y0 + EPS && y < box.y1 - EPS;

// Is there room for a body `tall` high with its feet at (x, y, z)?
export function free(boxes, x, y, z, tall = MOVE.height) {
  for (const box of boxes) if (hits(box, x, y, z, tall)) return false;
  return true;
}

// The highest top within `reach` m under the feet at (x, y, z), or -Infinity.
function floorUnder(boxes, x, y, z, reach) {
  let best = -Infinity;
  for (const box of boxes) {
    if (x + MOVE.half <= box.x0 + EPS || x - MOVE.half >= box.x1 - EPS || z + MOVE.half <= box.z0 + EPS || z - MOVE.half >= box.z1 - EPS) continue;
    if (box.y1 <= y + EPS && box.y1 >= y - reach && box.y1 > best) best = box.y1;
  }
  return best;
}

// Standing: on the floor still, or a step down onto the next one, or off
// the edge and falling.
function stayOnFloor(b, boxes) {
  const top = floorUnder(boxes, b.pos.x, b.pos.y, b.pos.z, MOVE.step);
  if (top === -Infinity) {
    b.grounded = false;
    return;
  }
  b.pos.y = top;
  b.vel.y = 0;
}

// Along x or z by d, stopped by what's there, or up onto it if it's a step.
function across(b, axis, d, boxes, tall) {
  if (d === 0) return;
  const p = b.pos;
  const to = p[axis] + d;
  const x = axis === 'x' ? to : p.x;
  const z = axis === 'z' ? to : p.z;
  let blocked = null;
  for (const box of boxes) {
    if (!hits(box, x, p.y, z, tall)) continue;
    const rise = box.y1 - p.y;
    if (b.grounded && rise > 0 && rise <= MOVE.step && free(boxes, x, box.y1, z, tall)) {
      p.y = box.y1;
      continue;
    }
    blocked = box;
    break;
  }
  if (!blocked) {
    p[axis] = to;
    return;
  }
  const lo = axis === 'x' ? blocked.x0 : blocked.z0;
  const hi = axis === 'x' ? blocked.x1 : blocked.z1;
  const flush = d > 0 ? lo - MOVE.half - EPS * 2 : hi + MOVE.half + EPS * 2;
  // only ever back towards where it was, never through to the far side
  if ((d > 0 && flush > p[axis]) || (d < 0 && flush < p[axis])) {
    const fx = axis === 'x' ? flush : p.x;
    const fz = axis === 'z' ? flush : p.z;
    if (free(boxes, fx, p.y, fz, tall)) p[axis] = flush;
  }
  b.vel[axis] = 0;
}

// Up or down by d: landing on a floor, or bumping a head on a ceiling.
function upDown(b, d, boxes, tall, events) {
  const p = b.pos;
  const to = p.y + d;
  for (const box of boxes) {
    if (!hits(box, p.x, to, p.z, tall)) continue;
    if (d < 0) {
      p.y = box.y1;
      if (events) events.push({ what: 'land', speed: -b.vel.y });
      b.vel.y = 0;
      b.vel.x *= MOVE.landing;
      b.vel.z *= MOVE.landing;
      b.grounded = true;
    } else {
      p.y = Math.min(p.y, box.y0 - tall - EPS * 2);
      b.vel.y = 0;
    }
    return;
  }
  p.y = to;
}

// Which way someone looking at (yaw, pitch) looks: a unit vector. (A yaw of
// 0 faces −z, as a camera does.)
export function aim(yaw, pitch, out = {}) {
  const c = Math.cos(pitch);
  out.x = -Math.sin(yaw) * c;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * c;
  return out;
}
