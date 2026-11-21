// How you hang under a hang glider: in a harness, from a strap off its keel.
// Upright while it opens and as you come in to land, and lying flat along
// under it while you fly, rolling with it as it banks, hands out to the bar
// (Character.hang).
//
// The hang point is where the strap holds the harness: HANG metres over
// where your feet would be if you were standing, and what the wing is built
// round (wing.js). The harness holds you by the back, at about your middle,
// so you swing about there from upright to flat.

import * as THREE from 'three';
import { lerp } from '../noise.js';

export const HANG = 1.0;
// Where the harness holds you, on the hiker (m, the hiker's own frame: +z ahead).
const HARNESS = new THREE.Vector3(0, HANG, -0.18);
// How far you're pitched forward (radians): upright, and lying flat.
const TILT = { up: 0.15, flat: 1.45 };
// How far below straight ahead your hands reach out (radians): upright, to the
// A-frame's sides at your shoulders, and lying flat, down to the bar.
const REACH = { up: 0.15, flat: 0.62 };
const SPREAD = 0.42;

const _p = new THREE.Vector3();

// What to hand Character.hang, kept up to date by pose().
export function harness() {
  return { tilt: TILT.up, reach: REACH.up, spread: SPREAD };
}

// Hang a hiker (its root, and what it was handed by harness()) from a hang
// point at (x, y, z), flying toward heading, rolled right by bank, and
// upright (1) or lying flat (0).
export function pose(root, spec, x, y, z, heading, bank, upright) {
  spec.tilt = lerp(TILT.flat, TILT.up, upright);
  spec.reach = lerp(REACH.flat, REACH.up, upright);
  root.rotation.order = 'YZX'; // yaw, then roll about the way it flies, then pitch
  root.rotation.set(spec.tilt, heading, bank);
  _p.copy(HARNESS).applyEuler(root.rotation);
  root.position.set(x - _p.x, y - _p.y, z - _p.z);
}

// Out of the harness: the root as everything else expects it.
export function unhang(root) {
  root.rotation.order = 'YXZ';
  root.rotation.x = 0;
  root.rotation.z = 0;
}
