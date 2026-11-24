// How you stand on the board, frame by frame: the hiker's stance
// (Character.stance), how the body is turned and tipped, and how the board
// turns and flips under the feet. The skater (skater.js) says where you are
// and what you're doing; this says what that looks like.
//
// Riding, you stand across the board, left foot forward over the front
// truck, back foot on the tail, knees bent, arms out, looking down the nose.
// Pushing, you turn to face along it, the front foot turned with you, and
// the back foot steps off beside it, down onto the ground, kicks back, and
// comes up again. Braking slowly, the back foot drags along behind; at speed
// you turn the board out sideways under you and lean back against it. The
// body tips with the ground and leans into the turns. In the air the feet
// come up, the board drops away from them a little to flip or turn, and
// comes back up to meet them. Bailed, you tumble over and over without it.
//
// Where the feet go is said on the board: `a` along it toward the nose (the
// way you'd ride it, not fakie), `c` across it to its left, `lift` up off
// it (down to the ground beside it, negative), and which way the toes point,
// `toe` (radians from the nose, to the left).

import { GRAVITY, DECK } from './skater.js';
import { clamp } from '../noise.js';
import { wrapAngle as wrap } from '../core/geom.js';

const HALF = Math.PI / 2;
// Riding and pushing: where the body faces (radians left of the nose: across
// the board to its right, riding), the front foot and the back, and how the
// body holds itself.
const RIDE = {
  face: -HALF,
  front: { a: 0.19, c: 0.03, lift: 0, toe: -HALF + 0.45 },
  back: { a: -0.21, c: 0.03, lift: 0, toe: -HALF + 0.12 },
  lean: 0.12,
  twist: 0.45,
  look: 1.3,
};
const PUSH = {
  face: -0.35,
  front: { a: 0.15, c: 0.0, lift: 0, toe: -0.2 },
  lean: 0.3,
  twist: 0,
  look: 0.15,
};
// The pushing foot through one push (skater.js PUSH.kick: when it's down):
// forward beside the front foot, down on the ground, kicked back, and up.
const KICK = { ahead: 0.12, behind: -0.5, side: -0.18, up: 0.06 };
// Dragged to brake: behind, beside the board, on the ground.
const DRAG = { a: -0.38, c: -0.14, toe: -0.6 };
// How quickly (1/s) the body turns to push and back, and the free foot follows.
const EASE = { push: 7, foot: 30 };
const LEAN_MOST = 0.5; // radians into a turn
const SLIDE_TURN = 1.15; // radians the board turns out under you in a powerslide
// How quickly (1/s) the body comes round to the ground under it: on it, and in the air.
const SETTLE = [9, 2.5];
// Bailed and stopped, you lie this far over (rad), and spring up this quickly (1/s).
const LIE = -1.45;
const SPRING = 7;
// In the air, how far (m) the board drops away from the feet to flip, and
// how far (rad) its nose comes up as you pop.
const DROP = 0.12;
const POP_TIP = 0.45;

export class Pose {
  // board: makeBoard()'s
  constructor(board) {
    this.board = board;
    // what the hiker is handed (Character.stance), changed in place each
    // frame: on the board, and down without it
    this.stance = blank(board.object);
    this.fallen = blank(null);
    this.yaw = 0; // which way the body faces
    this.rx = 0; // the root's tip forward and roll to the right
    this.rz = 0;
    this.up = { x: 0, y: 1, z: 0 };
    this.lean = 0;
    this.tumble = 0;
    this.pushing = 0; // 0..1 turned to push
    this.foot = { ...RIDE.back }; // the back foot, wherever it is
    this.drop = 0;
    this.tip = 0;
    this.standing();
  }

  // Standing on it, still: how someone else here is seen on theirs.
  standing() {
    place(this.stance, RIDE.face, RIDE.front, RIDE.back);
    Object.assign(this.stance, { crouch: 0.25, lean: RIDE.lean, twist: RIDE.twist, look: RIDE.look, tuck: 0, pitch: 0, roll: 0 });
    this._board(RIDE.face, 0, 0, 0);
    return this.stance;
  }

  // What the hiker should be stood as now: on the board, or down.
  current(sk) {
    return sk.down >= 0 ? this.fallen : this.stance;
  }

  // sk: the Skater; dt: s
  update(dt, sk) {
    const k = (rate) => 1 - Math.exp(-dt * rate);
    const fallen = sk.down >= 0;
    const flying = !sk.grounded && !fallen;

    // turned to push, or riding across the board
    this.pushing += ((sk.pushing && sk.grounded ? 1 : 0) - this.pushing) * k(EASE.push);
    const p = this.pushing;
    const face = lerp(RIDE.face, PUSH.face, p);
    const slide = sk.slide * SLIDE_TURN;
    // the rider's nose (the way they'd ride it), and the body round from it
    this.yaw = wrap(sk.yaw + sk.face + face + (sk.fakie ? -slide : slide));

    // the free foot: kicking, dragging, or back on the tail
    const ph = sk.pushPhase;
    let want = RIDE.back;
    if (ph >= 0) want = kickAt(ph);
    else if (sk.dragging) want = { ...DRAG, lift: -DECK + 0.01 };
    const f = this.foot;
    const kf = k(EASE.foot);
    for (const key of ['a', 'c', 'lift', 'toe']) f[key] += (want[key] - f[key]) * kf;
    const front = mix(RIDE.front, PUSH.front, p);
    const S = fallen ? this.fallen : this.stance;
    place(S, face, front, f);

    // tipped with the ground (and in the air, slowly coming round to it),
    // and into the turn, as hard as it pulls
    const h = sk.heading;
    const dx = Math.sin(h);
    const dz = Math.cos(h);
    const g = sk.grounded ? sk.grade : 0;
    const nl = Math.hypot(g, 1);
    const ks = k(SETTLE[sk.grounded ? 0 : 1]);
    this.up.x += ((-g * dx) / nl - this.up.x) * ks;
    this.up.y += (1 / nl - this.up.y) * ks;
    this.up.z += ((-g * dz) / nl - this.up.z) * ks;
    let lean = clamp(Math.atan2(sk.lateral, GRAVITY), -LEAN_MOST, LEAN_MOST);
    if (fallen || flying) lean = 0;
    this.lean += (lean - this.lean) * k(8);
    const lx = Math.cos(h);
    const lz = -Math.sin(h);
    let ux = this.up.x * Math.cos(this.lean) + lx * Math.sin(this.lean);
    let uy = this.up.y * Math.cos(this.lean);
    let uz = this.up.z * Math.cos(this.lean) + lz * Math.sin(this.lean);
    const ul = Math.hypot(ux, uy, uz);
    ux /= ul;
    uy /= ul;
    uz /= ul;
    // as root rotations (order YXZ: yaw, then tip forward, then roll)
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const nx = ux * cy - uz * sy;
    const nz = ux * sy + uz * cy;
    const pitch = Math.atan2(nz, uy);
    const roll = -Math.asin(clamp(nx, -1, 1));

    // over and over, bailed
    if (fallen) {
      if (sk.speed > 1.2) this.tumble = sk.roll;
      else this.tumble += (Math.round((this.tumble - LIE) / (Math.PI * 2)) * Math.PI * 2 + LIE - this.tumble) * k(5);
    } else this.tumble -= wrap(this.tumble) * k(SPRING);
    this.rx = pitch;
    this.rz = roll - this.tumble;

    // the body: down into the knees, crouched, leaning back into a slide
    const tuck = flying ? 0.75 : 0;
    const crouch = fallen ? 1 : 0.22 + sk.crouch * 0.5 + sk.compress * 0.5 + p * 0.2 + sk.slide * 0.3 + (sk.dragging ? 0.2 : 0) + (flying ? 0.2 : 0);
    S.crouch += (clamp(crouch, 0, 1) - S.crouch) * k(10);
    S.tuck += ((fallen ? 0.9 : tuck) - S.tuck) * k(flying || fallen ? 14 : 9);
    S.lean = lerp(RIDE.lean, PUSH.lean, p) + sk.crouch * 0.2 - sk.slide * 0.3;
    S.twist = sk.fakie ? -0.2 : lerp(RIDE.twist, PUSH.twist, p);
    S.look = sk.fakie ? -1.0 : lerp(RIDE.look, PUSH.look, p);
    S.pitch = this.rx;
    S.roll = this.rz;

    // the board: popped nose up, dropped away from the feet while it flips
    // or turns under you, coming back up to them to land
    if (!fallen) {
      const turning = sk.flip % (Math.PI * 2) !== 0 || sk.shove % Math.PI !== 0;
      this.drop += ((flying && turning ? DROP : 0) - this.drop) * k(16);
      this.tip *= Math.exp(-dt * 7);
      this._board(face, sk.flip, sk.shove, this.tip);
      this.board.turn.position.y = -DECK / 2 - this.drop;
    }
  }

  // Off the ground with a pop: the tail snapped down, the nose up.
  popped() {
    this.tip = POP_TIP;
  }

  // The board under the feet, in the body's frame: along the rider's nose,
  // turned `shove` under them, flipped `flip` over about its length, its
  // nose tipped up `tip`.
  _board(face, flip, shove, tip) {
    this.board.object.rotation.y = -(face + HALF);
    this.board.turn.rotation.set(flip, shove, tip, 'YXZ');
  }
}

// The pushing foot, ph of the way through a push (skater.js PUSH.kick: down
// from 0.25 to 0.65 of it).
function kickAt(ph) {
  const down = -DECK;
  let a;
  let lift;
  if (ph < 0.25) {
    // forward beside the front foot, coming down
    const t = ph / 0.25;
    a = lerp(KICK.behind * 0.5, KICK.ahead, t);
    lift = lerp(KICK.up, down, t * t);
  } else if (ph < 0.65) {
    // on the ground, kicked back
    a = lerp(KICK.ahead, KICK.behind, (ph - 0.25) / 0.4);
    lift = down;
  } else {
    // up off it, and forward again
    const t = (ph - 0.65) / 0.35;
    a = lerp(KICK.behind, KICK.behind * 0.5, t);
    lift = lerp(down, KICK.up, Math.sqrt(t));
  }
  return { a, c: KICK.side, lift, toe: -0.15 };
}

// Both feet, said on the board, put into the stance in the body's frame,
// which faces `face` radians left of the board's nose.
function place(S, face, front, back) {
  const sf = Math.sin(face);
  const cf = Math.cos(face);
  const at = (o, foot) => {
    foot[0] = -o.a * sf + o.c * cf;
    foot[1] = o.a * cf + o.c * sf;
    foot[2] = o.lift;
  };
  at(front, S.feet[0]);
  at(back, S.feet[1]);
  S.out[0] = front.toe - face;
  S.out[1] = -(back.toe - face);
}

function blank(board) {
  return { feet: [[0, 0, 0], [0, 0, 0]], out: [0, 0], arms: 'out', crouch: 0.25, lean: RIDE.lean, twist: RIDE.twist, look: RIDE.look, pitch: 0, roll: 0, reach: 0, tuck: 0, shod: null, hands: null, board };
}

function mix(a, b, t) {
  return { a: lerp(a.a, b.a, t), c: lerp(a.c, b.c, t), lift: lerp(a.lift, b.lift, t), toe: lerp(a.toe, b.toe, t) };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
