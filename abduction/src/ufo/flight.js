// Where the saucer is, against t (PLAN.md 5.11): in from +X along the road,
// trailing light, easing out to settle above the cow at 50.5 s; a hover (15
// cm of bob, a couple of degrees of wobble); then it tips about 25 degrees
// and leaves up and away toward -X, its distance growing exponentially,
// gone by 64.8 s. Before and after, it is somewhere else (visible = false).
import { Vector3, Euler } from 'three/webgpu';
import { UFO } from '../set/layout.js';
import { T, clamp, smooth } from '../timeline.js';
import { noise1 } from '../noise1.js';

const ARRIVE_FROM = new Vector3(85, 22, 52);   // metres from the hover point at T.ufoArrive
const LEAVE_DIR = new Vector3(-0.55, 0.22, 0.8).normalize();
const LEAVE_RATE = 2.1;      // 1/s: the exponent of its flight away
const TIP = 0.44;            // radians it tips before leaving
const SPIN = 0.25;           // radians a second about its own axis

const _p = new Vector3();

// Fills out = { position: Vector3, rotation: Euler, visible, speed } for time t.
export function flightAt(t, out) {
  const hover = _p.set(UFO.x, UFO.y, UFO.z);
  out.visible = t >= T.ufoArrive && t < T.ufoGone;
  out.rotation.set(0, t * SPIN, 0, 'YXZ');
  if (t < T.ufoStop) {
    // Arriving: eases out (fast at first, settling).
    const s = clamp((t - T.ufoArrive) / (T.ufoStop - T.ufoArrive));
    const left = Math.pow(1 - s, 3);
    out.position.copy(hover).addScaledVector(ARRIVE_FROM, left);
    // Banked into its slowing: nose up and leaning in.
    out.rotation.x = -0.32 * left * 2.2 * (1 - s);
    out.rotation.z = 0.28 * left * 2.0;
    out.speed = 3 * (ARRIVE_FROM.length() / (T.ufoStop - T.ufoArrive)) * (1 - s) * (1 - s);
  } else if (t < T.ufoTip) {
    out.position.copy(hover);
    out.speed = 0;
  } else {
    // Tips over, then away.
    const k = clamp((t - T.ufoTip) / 0.5);
    out.rotation.z = -TIP * smooth(k);
    out.rotation.x = 0.12 * smooth(k);
    const go = Math.max(0, t - T.ufoTip - 0.3);
    const d = 1.6 * (Math.exp(LEAVE_RATE * go) - 1);
    out.position.copy(hover).addScaledVector(LEAVE_DIR, d);
    out.speed = 1.6 * LEAVE_RATE * Math.exp(LEAVE_RATE * go);
  }
  // The hover's bob and wobble, always there, smaller when it moves fast.
  const calm = 1 / (1 + out.speed * 0.2);
  out.position.y += 0.15 * Math.sin(t * 2 * Math.PI * 0.45) * calm;
  out.rotation.x += 0.035 * noise1(t * 0.6, 11) * calm;
  out.rotation.z += 0.035 * noise1(t * 0.5, 12) * calm;
  return out;
}

export function createFlightState() {
  return { position: new Vector3(), rotation: new Euler(), visible: false, speed: 0 };
}
