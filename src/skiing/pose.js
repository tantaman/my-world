// How you stand on them, frame by frame: the hiker's stance (Character.stance)
// and how the body is turned and tipped over the snow. The skier (skier.js)
// says where you are and what you're doing; this says what that looks like.
//
// On skis you face the way they point, knees bent, poles in your hands, and
// plant one as you start each turn. On a board you stand across it, left
// foot forward, arms out, looking down its nose. Either way the body tips
// with the snow under it, leans into the turn as hard as the turn pulls, and
// tumbles over and over when you fall.

import { BOARD } from './gear.js';
import { GRAVITY } from './skier.js';
import { clamp } from '../noise.js';

// Leaning into a turn: as far as the turn pulls (rad), at most this far.
const LEAN_MOST = 0.8;
// How quickly (1/s) the body comes round to the snow under it: on it, and in the air.
const SETTLE = [9, 2.5];
// A pole plant lasts this long (s), as a turn starts this hard (m/s²).
const PLANT = { time: 0.35, turn: 3 };
// Fallen and stopped, you lie on your back this far over (rad), and spring up
// this quickly (1/s).
const LIE = -1.45;
const SPRING = 7;

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// What each stands like. face: how far the body is turned from the way the
// skis point (a board is stood across).
const STANDS = {
  skis: { feet: [[0.11, 0], [-0.11, 0]], out: [0, 0], arms: 'poles', twist: 0, look: 0, lean: 0.3, face: 0 },
  board: { feet: [[BOARD.stance, -0.045], [-BOARD.stance, -0.045]], out: [0.26, -0.1], arms: 'out', twist: 0.45, look: 1.3, lean: 0.12, face: -Math.PI / 2 },
};

export class Pose {
  // gear: { skis, poles, board } (gear.js)
  constructor(gear) {
    this.gear = gear;
    this.kind = 'skis';
    // what the hiker is handed (Character.stance), changed in place each frame
    this.stance = null;
    // the body's turn and tip: root rotation y, x, z
    this.yaw = 0;
    this.rx = 0;
    this.rz = 0;
    this.up = { x: 0, y: 1, z: 0 };
    this.lean = 0;
    this.tumble = 0; // how far over you are, fallen
    this._plant = [0, 0];
    this._turn = 0;
  }

  // -> the stance for skis or a board (a new object, so the hiker swaps gear)
  use(kind) {
    this.kind = STANDS[kind] ? kind : 'skis';
    const st = STANDS[this.kind];
    const ski = this.kind === 'skis';
    this.stance = {
      feet: st.feet.map((f) => [...f]),
      out: [...st.out],
      arms: st.arms,
      twist: st.twist,
      look: st.look,
      lean: st.lean,
      crouch: 0.3,
      pitch: 0,
      roll: 0,
      plant: [0, 0],
      reach: 0,
      tuck: 0,
      shod: ski ? this.gear.skis : null,
      hands: ski ? this.gear.poles : null,
      board: ski ? null : this.gear.board,
    };
    return this.stance;
  }

  // sk: the Skier; c: the controls; up: which way the snow under you faces
  update(dt, sk, c, up) {
    const S = this.stance;
    const st = STANDS[this.kind];
    const ski = this.kind === 'skis';
    const k = (rate) => 1 - Math.exp(-dt * rate);
    const fallen = sk.down >= 0;

    // which way the body faces
    this.yaw = wrap(sk.yaw + sk.face + st.face);

    // tipped with the snow (and in the air, slowly coming round to it)
    const ks = k(SETTLE[sk.grounded ? 0 : 1]);
    this.up.x += (up.x - this.up.x) * ks;
    this.up.y += (up.y - this.up.y) * ks;
    this.up.z += (up.z - this.up.z) * ks;
    // ...and into the turn, as hard as it pulls (on a board, back on the heels to brake)
    let lean = clamp(Math.atan2(sk.lateral, GRAVITY), -LEAN_MOST, LEAN_MOST);
    if (!ski) lean += (c.brake || 0) * 0.35;
    if (fallen || !sk.grounded) lean = 0;
    this.lean += (lean - this.lean) * k(8);
    const h = sk.heading;
    // the left of the way you're going
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

    // head over heels: flipping, or tumbling after a fall
    if (fallen) {
      const moving = Math.hypot(sk.vx, sk.vz) > 1.5;
      if (moving) this.tumble = sk.roll;
      else this.tumble += (Math.round((this.tumble - LIE) / (Math.PI * 2)) * Math.PI * 2 + LIE - this.tumble) * k(5);
    } else this.tumble -= wrap(this.tumble) * k(SPRING);
    const over = sk.flipA + this.tumble;
    this.rx = pitch + (ski ? over : 0);
    this.rz = roll - (ski ? 0 : over);

    // the body: down into the knees, tucked, grabbing, braking
    const flying = sk.flying && !fallen;
    const tuck = flying ? (sk.grabbing ? 1 : 0.55) : 0;
    const crouch = fallen ? 1 : 0.28 + (c.tuck || 0) * 0.45 + sk.compress * 0.5 + (c.brake || 0) * 0.12 + (flying ? 0.2 : 0);
    S.crouch += (clamp(crouch, 0, 1) - S.crouch) * k(10);
    S.tuck += ((fallen ? 0.9 : tuck) - S.tuck) * k(flying || fallen ? 12 : 8);
    S.reach += ((sk.grabbing ? 1 : 0) - S.reach) * k(14);
    S.lean = st.lean + (c.tuck || 0) * (ski ? 0.3 : 0.15);
    S.pitch = this.rx - (ski ? over : 0);
    S.roll = this.rz + (ski ? 0 : over);
    if (ski) {
      // a snowplough: tips together, feet apart
      const wedge = (c.brake || 0) * (sk.grounded ? 1 : 0);
      S.feet[0][0] = 0.11 + 0.1 * wedge;
      S.feet[1][0] = -0.11 - 0.1 * wedge;
      S.out[0] = -0.3 * wedge;
      S.out[1] = 0.3 * wedge;
      // plant a pole as each turn starts
      const turn = Math.sign(sk.lateral) * (Math.abs(sk.lateral) > PLANT.turn ? 1 : 0);
      if (turn && turn !== this._turn && sk.grounded) this._plant[turn > 0 ? 0 : 1] = PLANT.time;
      this._turn = turn;
      for (let i = 0; i < 2; i++) {
        this._plant[i] = Math.max(0, this._plant[i] - dt);
        S.plant[i] = Math.sin((this._plant[i] / PLANT.time) * Math.PI);
      }
    }
  }
}
