// How you lie and stand on the board, frame by frame, and how the board sits
// on the water. The surfer (surfer.js) says where you are and what you're
// doing; this says what that looks like.
//
// The board rides the water's own slope, nose up a face and down the back,
// and banks over on its rail as you carve. Lying on it you're flat along it
// (Character.hang, as a harness lays you along under a glider), head up,
// legs over the tail, both arms reaching forward and pulling back through
// the water as you paddle. Standing, you're across it, left foot forward,
// knees bent, arms out (Character.stance), leaning into the turn as hard as
// it pulls, down into the knees crouched, and drawn up tight in the air.
// Fallen, you go over and over under the water, and the board tumbles on
// its leash beside you.

import * as THREE from 'three';
import { clamp } from '../noise.js';
import { wrapAngle as wrap } from '../core/geom.js';

// Standing across the board, left foot forward (m, the body's frame: +x is
// the hiker's left, which faces the nose; +z ahead, which faces off the
// board's side).
const STAND = { feet: [[0.32, -0.03], [-0.3, -0.03]], out: [0.3, -0.2], twist: 0.4, look: 1.2, lean: 0.14, face: -Math.PI / 2 };
// Lying along it: pitched this far forward (rad), the point on the hiker the
// body turns about (m, its own frame) put this far over the deck and back
// from the board's middle; paddling this many strokes a second, the arms
// reaching between these (rad below straight ahead) this far out to the
// sides; and at rest, forward of the shoulders.
const LIE = { tilt: 1.5, pivot: new THREE.Vector3(0, 1.0, -0.12), over: 0.13, back: 0.25, strokes: 0.95, reach: [0.25, 1.75], spread: 0.62, rest: 0.6 };
// The deck rides this far over the water (m): lying on it, and standing.
const FLOAT = [0.02, 0.05];
// Leaning into a turn: as far as the turn pulls (rad), at most this far.
const LEAN_MOST = 0.75;
// How quickly (1/s) the board and body come round to the water under them.
const SETTLE = 8;

const _q = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _qr = new THREE.Quaternion();
const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

export class SurfPose {
  // board: the board (board.js), which this puts on the water
  constructor(board) {
    this.board = board;
    this.stance = {
      feet: STAND.feet.map((f) => [...f]),
      out: [...STAND.out],
      arms: 'out',
      twist: STAND.twist,
      look: STAND.look,
      lean: STAND.lean,
      crouch: 0.3,
      pitch: 0,
      roll: 0,
      plant: [0, 0],
      reach: 0,
      tuck: 0,
    };
    this.hang = { tilt: LIE.tilt, reach: LIE.rest, spread: LIE.spread };
    this.up = new THREE.Vector3(0, 1, 0); // which way the water under the board faces, settled
    this.lean = 0;
    this.stroke = 0;
    this.tumble = 0;
    this.yaw = 0; // which way the body faces
  }

  // The board, and the hiker (character) on it: sf the Surfer, c the controls.
  update(dt, sf, c, character) {
    const k = 1 - Math.exp(-dt * SETTLE);
    // the water's slope under the board, settled
    _n.set(-sf.gx, 1, -sf.gz).normalize();
    if (sf.flying) _n.copy(UP);
    this.up.lerp(_n, k).normalize();
    // leaning into a carve
    let lean = sf.mode === 'riding' && !sf.flying ? clamp(Math.atan2(sf.lateral, 9.8), -LEAN_MOST, LEAN_MOST) : 0;
    this.lean += (lean - this.lean) * (1 - Math.exp(-dt * 7));

    // the board: turned the way it points, tipped with the water, on its rail
    const board = this.board;
    const down = sf.mode === 'down';
    if (down) this.tumble += dt * 5;
    else this.tumble = 0;
    _qy.setFromAxisAngle(Y, sf.yaw);
    _q.setFromUnitVectors(UP, this.up);
    _qr.setFromAxisAngle(Z, -this.lean + (down ? this.tumble * 0.7 : 0));
    board.quaternion.copy(_q).multiply(_qy).multiply(_qr);
    const fx = Math.sin(sf.yaw);
    const fz = Math.cos(sf.yaw);
    const standing = sf.mode === 'riding';
    const lift = standing ? FLOAT[1] : FLOAT[0];
    if (down) {
      // off on its leash, beside you
      board.position.set(sf.x + fz * 1.4, sf.y + 0.75 + lift, sf.z - fx * 1.4);
    } else board.position.set(sf.x, sf.y + lift + (standing ? this.stance.tuck * 0.32 : 0), sf.z);

    const root = character.root;
    if (standing) {
      character.hang(null);
      character.stance(this.stance);
      this._stand(dt, sf, c, root);
    } else {
      character.stance(null);
      character.hang(this.hang);
      this._lie(dt, sf, c, root, down);
    }
  }

  _stand(dt, sf, c, root) {
    const S = this.stance;
    const k = (rate) => 1 - Math.exp(-dt * rate);
    this.yaw = wrap(sf.yaw + STAND.face);
    // the body upright over the board: tipped with the water, leaned in
    const lx = Math.cos(sf.yaw);
    const lz = -Math.sin(sf.yaw);
    let ux = this.up.x * Math.cos(this.lean) + lx * Math.sin(this.lean);
    let uy = this.up.y * Math.cos(this.lean);
    let uz = this.up.z * Math.cos(this.lean) + lz * Math.sin(this.lean);
    const ul = Math.hypot(ux, uy, uz);
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const nx = ux * cy - uz * sy;
    const nz = ux * sy + uz * cy;
    const pitch = Math.atan2(nz, uy);
    const roll = -Math.asin(clamp(nx, -1, 1));
    root.rotation.order = 'YXZ';
    root.rotation.set(pitch, this.yaw, roll);
    root.position.set(sf.x, sf.y + FLOAT[1] + S.tuck * 0.32, sf.z);
    // down into the knees, crouched; drawn up tight in the air
    const crouch = 0.28 + (c.crouch ? 0.45 : 0) + Math.max(0, c.push || 0) * 0.08 + (sf.flying ? 0.15 : 0);
    S.crouch += (clamp(crouch, 0, 1) - S.crouch) * k(10);
    S.tuck += ((sf.flying ? 0.7 : 0) - S.tuck) * k(sf.flying ? 12 : 8);
    S.reach += ((sf.flying && c.crouch ? 1 : 0) - S.reach) * k(14);
    // forward over the nose pumping, back on the tail stalling
    S.lean = STAND.lean + (c.push || 0) * 0.12;
    S.pitch = pitch;
    S.roll = roll;
  }

  _lie(dt, sf, c, root, down) {
    const H = this.hang;
    const k = (rate) => 1 - Math.exp(-dt * rate);
    const fx = Math.sin(sf.yaw);
    const fz = Math.cos(sf.yaw);
    // how far the nose is up, and the board over to the right, on the water
    const nose = Math.atan2(-(this.up.x * fx + this.up.z * fz), this.up.y);
    const bank = Math.atan2(this.up.x * fz - this.up.z * fx, this.up.y);
    // paddling: both arms reaching forward and pulling back through the water
    const paddling = (c.push || 0) > 0.1 && !down && !sf.ducking;
    if (paddling) this.stroke += dt * LIE.strokes * (c.sprint ? 1.35 : 1);
    const ph = this.stroke * Math.PI * 2;
    const reach = paddling ? LIE.reach[0] + (LIE.reach[1] - LIE.reach[0]) * (0.5 - 0.5 * Math.cos(ph)) : sf.ducking ? 0.1 : LIE.rest;
    H.reach += (reach - H.reach) * k(paddling ? 30 : 6);
    H.spread = LIE.spread;
    H.tilt = LIE.tilt - nose + (sf.ducking ? 0.35 : 0);
    this.yaw = sf.yaw;
    root.rotation.order = 'YZX';
    root.rotation.set(H.tilt + (down ? this.tumble : 0), sf.yaw, bank + (down ? Math.sin(this.tumble * 0.7) * 1.2 : 0));
    _p.copy(LIE.pivot).applyEuler(root.rotation);
    const over = LIE.over + FLOAT[0];
    root.position.set(sf.x - fx * LIE.back + this.up.x * over - _p.x, sf.y + this.up.y * over - _p.y, sf.z - fz * LIE.back + this.up.z * over - _p.z);
  }

  // Off the board: the root as everything else expects it.
  static clear(character) {
    character.stance(null);
    character.hang(null);
    const root = character.root;
    root.rotation.order = 'YXZ';
    root.rotation.x = 0;
    root.rotation.z = 0;
  }
}
