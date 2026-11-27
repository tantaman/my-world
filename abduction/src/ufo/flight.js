// Where the saucer is, against t (PLAN.md 5.11): in from +X along the road,
// banked so its underside shows, easing out to settle above the cow at
// 50.5 s; a hover (15 cm of bob, a couple of degrees of wobble); then it
// tips its top away from the camera and toward where it is going, and
// leaves away and to the right, its distance growing exponentially, gone by
// 64.8 s. Before and after, it is somewhere else (visible = false).
//
// Also the swirl its trails are drawn from (trails.js): points on the rim
// that run round it while it flies, so that hovering they wrap round the rim
// in arcs, as the original's do in the second before it leaves, and moving
// they stream out behind. The swirl's angle is the integral of its rate,
// exactly, so any t gives the same answer with no state.
import { Vector3, Euler } from 'three/webgpu';
import { UFO } from '../set/layout.js';
import { T, clamp, smooth, env } from '../timeline.js';
import { noise1 } from '../noise1.js';

const ARRIVE_FROM = new Vector3(80, 2, 75);    // metres from the hover point at T.ufoArrive: in from +X, far off, at about its hover height
const ARRIVE_EASE = 2.0;     // the power its distance to go falls by: still moving as it comes over the cow
const BANK = { pitch: 0.08, roll: 0.2 };        // radians at the start of the arrival (top away from the road, +X side up), easing to level
// Away toward +X, left of frame, and climbing a little: the original's camera
// turns left and down after it (yaw 57 to 47.5, pitch 23.5 to 14, 61 to 64 s).
const LEAVE_DIR = new Vector3(0.72, 0.3, 0.62).normalize();
// Leaving, its distance is LEAVE_SCALE (e^(LEAVE_RATE s) - 1) metres, s seconds after it starts to move.
const LEAVE_SCALE = 30;
const LEAVE_RATE = 0.65;     // 1/s
const LEAVE_AFTER = 0.5;     // seconds after T.ufoTip it starts to move
const TIP = { away: 0.16, side: 0.2, time: 0.7 };   // radians it tips (top away, toward -X), seconds it takes
const SPIN = 0.15;           // radians a second, the hull about its own axis
const BOB = { metres: 0.15, hz: 0.45 };
const WOBBLE = 0.035;        // radians

// The trails' swirl: radians a second the rim points run round, against t.
// Leaving, they run round only while it tips, wrapping the rim, and stop
// as it goes, so the strands stream straight back from its two sides.
const SWIRL = [
  [T.ufoArrive, 2.0], [T.ufoStop - 0.8, 1.5], [T.ufoStop + 0.4, 0],
  [T.ufoTip - 0.05, 0], [T.ufoTip + 0.3, 5], [T.ufoTip + 0.6, 4], [T.ufoTip + 1.3, 0],
];
// When the swirl has stopped, leaving: the trails set their points by it.
export const SWIRL_DONE = T.ufoTip + 1.3;
export const SPIN_RATE = SPIN;
// The way it leaves, in the rim's angle (atan2(z, x)).
export const LEAVE_ANGLE = Math.atan2(LEAVE_DIR.z, LEAVE_DIR.x);
// How strongly the trails shine as they are made, against t.
const TRAILS = [
  [T.ufoArrive, 0], [T.ufoArrive + 0.15, 1], [T.ufoStop - 0.9, 0.85], [T.ufoStop + 0.25, 0],
  [T.ufoTip - 0.05, 0], [T.ufoTip + 0.35, 1], [T.ufoGone, 1],
];

const _p = new Vector3();

// Fills out = { position: Vector3, rotation: Euler, visible, speed } for time t.
export function flightAt(t, out) {
  const hover = _p.set(UFO.x, UFO.y, UFO.z);
  out.visible = t >= T.ufoArrive && t < T.ufoGone;
  // Spun about its own axis first, then tipped in the world's axes.
  out.rotation.set(0, t * SPIN, 0, 'ZXY');
  if (t < T.ufoStop) {
    // Arriving: eases out (fast at first, settling).
    const s = clamp((t - T.ufoArrive) / (T.ufoStop - T.ufoArrive));
    const left = Math.pow(1 - s, ARRIVE_EASE);
    out.position.copy(hover).addScaledVector(ARRIVE_FROM, left);
    // Banked as it comes in, levelling as it slows.
    const bank = Math.pow(1 - s, 1.5);
    out.rotation.x = BANK.pitch * bank;
    out.rotation.z = BANK.roll * bank;
    out.speed = ARRIVE_EASE * (ARRIVE_FROM.length() / (T.ufoStop - T.ufoArrive)) * Math.pow(1 - s, ARRIVE_EASE - 1);
  } else if (t < T.ufoTip) {
    out.position.copy(hover);
    out.speed = 0;
  } else {
    // Tips over, then away.
    const k = smooth(clamp((t - T.ufoTip) / TIP.time));
    out.rotation.x = TIP.away * k;
    out.rotation.z = TIP.side * k;
    const go = Math.max(0, t - T.ufoTip - LEAVE_AFTER);
    const d = LEAVE_SCALE * (Math.exp(LEAVE_RATE * go) - 1);
    out.position.copy(hover).addScaledVector(LEAVE_DIR, d);
    out.speed = go > 0 ? LEAVE_SCALE * LEAVE_RATE * Math.exp(LEAVE_RATE * go) : 0;
  }
  // The hover's bob and wobble, always there, smaller when it moves fast.
  const calm = 1 / (1 + out.speed * 0.2);
  out.position.y += BOB.metres * Math.sin(t * 2 * Math.PI * BOB.hz) * calm;
  out.rotation.x += WOBBLE * noise1(t * 0.6, 11) * calm;
  out.rotation.z += WOBBLE * noise1(t * 0.5, 12) * calm;
  return out;
}

export function createFlightState() {
  return { position: new Vector3(), rotation: new Euler(0, 0, 0, 'ZXY'), visible: false, speed: 0 };
}

// The swirl's angle at t: the rate's integral from the start, exactly (the
// rate is piecewise linear).
export function swirlAt(t) {
  let a = 0;
  if (t <= SWIRL[0][0]) return 0;
  for (let i = 1; i < SWIRL.length; i++) {
    const [t0, w0] = SWIRL[i - 1];
    const [t1, w1] = SWIRL[i];
    const end = Math.min(t, t1);
    if (end > t0) {
      const wEnd = w0 + ((w1 - w0) * (end - t0)) / (t1 - t0);
      a += 0.5 * (w0 + wEnd) * (end - t0);
    }
    if (t <= t1) return a;
  }
  return a + SWIRL[SWIRL.length - 1][1] * (t - SWIRL[SWIRL.length - 1][0]);
}

// How brightly the trails are being made at t, 0..1.
export function trailsAt(t) {
  return t < T.ufoArrive || t >= T.ufoGone ? 0 : env(t, TRAILS);
}
