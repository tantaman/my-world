// How a fighter moves in the arena: the quick, slippery movement of the old
// arena shooters, not the hiker's careful walk.
//
// On the ground you get up to running speed almost at once and stop almost
// at once. In the air you can't speed up the way you're already going, but
// you can steer: turning the view while you strafe sideways bends your path,
// and done in rhythm over a run of jumps it carries you faster than running
// (strafe-jumping). Land with jump held and you're straight off again before
// the ground has had time to slow you (bunny-hopping). Jump pads throw you in
// an arc to wherever they're aimed.
//
// The world is boxes (orrery.js); a fighter is a box too, HALF m either way
// and HEIGHT tall, moved one axis at a time and stopped by what it meets. A
// ledge up to STEP high is walked up onto, and one as high down is walked
// down off without leaving the ground.
//
// No three.js in here: a body is { pos, vel, grounded } of plain { x, y, z }.

// The numbers are the old games' own, in metres: they measured in units of
// about 3.2 cm (a fighter 56 tall, running at 320).
export const MOVE = {
  speed: 10.2, // m/s, running
  accel: 10, // how quickly you get up to speed on the ground (1/s)
  airAccel: 1, // ...and in the air
  friction: 6, // how quickly you slow on the ground (1/s)...
  stop: 3.2, // ...as if going at least this fast (m/s), so you stop dead
  gravity: 25.6, // m/s²
  jump: 8.6, // m/s up: a jump about 1.45 m high
  step: 0.58, // m: the highest ledge you walk up onto
  half: 0.45, // m: the body's half-width
  height: 1.8, // m
  eye: 1.6, // m above the feet
};
const SUB = 1 / 120; // s: the longest step the movement is worked out in
const EPS = 1e-4;
const PROBE = 0.06; // m below the feet that still counts as standing

export function makeBody(x = 0, y = 0, z = 0) {
  return { pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, grounded: false };
}

// The velocity that throws something from `from` to land at `to`, the top of
// its arc `over` m above the higher of the two. -> { x, y, z, t } (t: s in the air)
export function launch(from, to, over, g = MOVE.gravity) {
  const top = Math.max(from.y, to.y) + over;
  const up = Math.sqrt(2 * g * (top - from.y));
  const t = up / g + Math.sqrt((2 * (top - to.y)) / g);
  return { x: (to.x - from.x) / t, y: up, z: (to.z - from.z) / t, t };
}

// How far something landing at `speed` m/s slides before the ground stops
// it (friction slows it in proportion to its speed, down to `stop`, then
// steadily).
export function slide(speed) {
  if (speed <= MOVE.stop) return (speed * speed) / (2 * MOVE.stop * MOVE.friction);
  return (speed - MOVE.stop) / MOVE.friction + MOVE.stop / (2 * MOVE.friction);
}

// What a jump pad throws you with, to come to rest at its `to` after the
// slide on landing: aimed short by that much.
export function padLaunch(from, pad) {
  const to = pad.to;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  let short = 0;
  let v = null;
  for (let i = 0; i < 4; i++) {
    const k = d > 1e-6 ? Math.max(0, d - short) / d : 0;
    v = launch(from, { x: from.x + dx * k, y: to.y, z: from.z + dz * k }, pad.over);
    short = slide(Math.hypot(v.x, v.z));
  }
  return v;
}

// Move a body on for dt seconds.
//   wish     { x, z }: which way to go in the world, length 0..1
//   jump     whether jump is held
//   map      { boxes, pads }
//   events   an array that gets what happened: { what: 'jump' | 'land' |
//            'pad', speed?, pad? }
export function moveBody(body, wish, jump, dt, map, events = null) {
  const n = Math.max(1, Math.ceil(dt / SUB));
  const h = dt / n;
  for (let i = 0; i < n; i++) step(body, wish, jump, h, map, events);
}

function step(b, wish, jump, h, map, events) {
  const { boxes } = map;
  if (b.grounded) stayOnFloor(b, boxes);
  const len = Math.hypot(wish.x, wish.z);
  const wx = len > 1e-6 ? wish.x / len : 0;
  const wz = len > 1e-6 ? wish.z / len : 0;
  const want = Math.min(1, len) * MOVE.speed;
  if (b.grounded && jump) {
    // straight off again, before the ground can slow you
    b.vel.y = MOVE.jump;
    b.grounded = false;
    if (events) events.push({ what: 'jump' });
  }
  if (b.grounded) {
    friction(b, h);
    accelerate(b, wx, wz, want, MOVE.accel, h);
  } else {
    accelerate(b, wx, wz, want, MOVE.airAccel, h);
    b.vel.y -= MOVE.gravity * h;
  }
  across(b, 'x', b.vel.x * h, boxes);
  across(b, 'z', b.vel.z * h, boxes);
  if (!b.grounded) upDown(b, b.vel.y * h, boxes, events);
  if (b.grounded && map.pads) {
    for (const p of map.pads) {
      if (Math.abs(b.pos.y - p.y) > 0.3 || Math.hypot(b.pos.x - p.x, b.pos.z - p.z) > p.r) continue;
      const v = padLaunch(b.pos, p);
      b.vel.x = v.x;
      b.vel.y = v.y;
      b.vel.z = v.z;
      b.grounded = false;
      if (events) events.push({ what: 'pad', pad: p });
      break;
    }
  }
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

// Speed up towards `want` m/s the way you wish to go. Only the speed already
// going that way counts against it, which is what lets you gain speed in the
// air by strafing across the way you're going.
function accelerate(b, wx, wz, want, accel, h) {
  if (want <= 0) return;
  const now = b.vel.x * wx + b.vel.z * wz;
  const add = want - now;
  if (add <= 0) return;
  const k = Math.min(accel * want * h, add);
  b.vel.x += wx * k;
  b.vel.z += wz * k;
}

const hits = (box, x, y, z) => x + MOVE.half > box.x0 + EPS && x - MOVE.half < box.x1 - EPS && z + MOVE.half > box.z0 + EPS && z - MOVE.half < box.z1 - EPS && y + MOVE.height > box.y0 + EPS && y < box.y1 - EPS;

function free(boxes, x, y, z) {
  for (const box of boxes) if (hits(box, x, y, z)) return false;
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
function across(b, axis, d, boxes) {
  if (d === 0) return;
  const p = b.pos;
  const to = p[axis] + d;
  const x = axis === 'x' ? to : p.x;
  const z = axis === 'z' ? to : p.z;
  let blocked = null;
  for (const box of boxes) {
    if (!hits(box, x, p.y, z)) continue;
    const rise = box.y1 - p.y;
    if (b.grounded && rise > 0 && rise <= MOVE.step && free(boxes, x, box.y1, z)) {
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
    if (free(boxes, fx, p.y, fz)) p[axis] = flush;
  }
  b.vel[axis] = 0;
}

// Up or down by d: landing on a floor, or bumping a head on a ceiling.
function upDown(b, d, boxes, events) {
  const p = b.pos;
  const to = p.y + d;
  for (const box of boxes) {
    if (!hits(box, p.x, to, p.z)) continue;
    if (d < 0) {
      p.y = box.y1;
      if (events) events.push({ what: 'land', speed: -b.vel.y });
      b.vel.y = 0;
      b.grounded = true;
    } else {
      p.y = Math.min(p.y, box.y0 - MOVE.height - EPS * 2);
      b.vel.y = 0;
    }
    return;
  }
  p.y = to;
}

// Where an eye at `o` looking along `d` (unit) first meets a box: the
// distance, or Infinity. (Slabs: the ray's span inside each pair of faces.)
export function rayBoxes(o, d, boxes, max = Infinity, normal = null) {
  let best = max;
  let face = -1;
  for (const box of boxes) {
    const t = rayBox(o, d, box.x0, box.y0, box.z0, box.x1, box.y1, box.z1, best);
    if (t < best) {
      best = t;
      face = _face;
    }
  }
  if (normal && face >= 0) {
    normal.x = normal.y = normal.z = 0;
    normal[FACE_AXIS[face >> 1]] = face & 1 ? 1 : -1;
  }
  return best < max ? best : Infinity;
}

const FACE_AXIS = ['x', 'y', 'z'];
let _face = -1;
// The distance along the ray to the box (x0..x1, ...), or Infinity; the
// face it came in by is left in _face (axis * 2, + 1 for the high side).
export function rayBox(o, d, x0, y0, z0, x1, y1, z1, max = Infinity) {
  let near = 0;
  let far = max;
  let face = -1;
  const lo = [x0, y0, z0];
  const hi = [x1, y1, z1];
  const os = [o.x, o.y, o.z];
  const ds = [d.x, d.y, d.z];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(ds[a]) < 1e-9) {
      if (os[a] < lo[a] || os[a] > hi[a]) return Infinity;
      continue;
    }
    let t0 = (lo[a] - os[a]) / ds[a];
    let t1 = (hi[a] - os[a]) / ds[a];
    let f = a * 2;
    if (t0 > t1) {
      [t0, t1] = [t1, t0];
      f += 1;
    }
    if (t0 > near) {
      near = t0;
      face = f;
    }
    if (t1 < far) far = t1;
    if (near > far) return Infinity;
  }
  if (face < 0) return Infinity; // starting inside
  _face = face;
  return near;
}
