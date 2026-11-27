// The person carrying the camera, on top of the path: a step while walking,
// slow sway while standing, a touch of fast jitter. All from noise of t, so
// it repeats. Measured on the original (frame to frame, 42-47 s): it walks
// at about half a metre a second and its picture dips about once every
// 1.15 s, by only a few pixels: a smooth, slow carry.
import { WHERE } from './path.js';
import { LENGTH } from '../timeline.js';
import { noise1, fbm1 } from '../noise1.js';

const STRIDE = 0.55;        // metres a step: a dip every 1.15 s at the original's 0.5 m/s
const BOB = 0.02;           // metres up and down a step
const SWAY = 0.015;         // metres side to side a step
const ROLL = 0.5;           // degrees of roll a step
const BREATH = 0.25;        // degrees of slow sway while standing
const JITTER = 0.08;        // degrees of fast shake
const WALKING = 0.25;       // m/s above which the person is walking (the original walks at 0.45-0.75)
const WALK_RAMP = 0.2;      // m/s more over which the step comes in fully
const STEP_YAW = 0.15;      // degrees of side to side turn a stride
const STEP_PITCH = 0.2;     // degrees of nod a step

// Distance walked by each 1/60 s, so the step's phase follows the feet.
const STEP = 1 / 60;
const walked = new Float32Array(Math.ceil(LENGTH / STEP) + 2);
const speeds = new Float32Array(walked.length);
{
  const a = [0, 0];
  const b = [0, 0];
  WHERE.sample(0, a);
  for (let i = 1; i < walked.length; i++) {
    WHERE.sample(i * STEP, b);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    walked[i] = walked[i - 1] + d;
    speeds[i] = d / STEP;
    a[0] = b[0];
    a[1] = b[1];
  }
}

function lookup(arr, t) {
  const f = Math.max(0, Math.min(arr.length - 1.001, t / STEP));
  const i = Math.floor(f);
  return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
}

// Fills out = { up, side, yaw, pitch, roll } (metres, degrees).
export function handheldAt(t, out) {
  const dist = lookup(walked, t);
  const speed = lookup(speeds, t);
  const walking = Math.min(1, Math.max(0, (speed - WALKING) / WALK_RAMP));
  const phase = (dist / STRIDE) * Math.PI;
  const standing = 1 - walking * 0.6;
  out.up = walking * BOB * (Math.abs(Math.sin(phase)) - 0.5);
  out.side = walking * SWAY * Math.sin(phase);
  out.roll = walking * ROLL * Math.sin(phase) + fbm1(t * 0.35, 3) * 0.6;
  out.yaw = standing * BREATH * fbm1(t * 0.3, 1) + JITTER * noise1(t * 9, 5) + walking * STEP_YAW * Math.sin(phase);
  out.pitch = standing * BREATH * fbm1(t * 0.25 + 10, 2) + JITTER * noise1(t * 11, 6) + walking * STEP_PITCH * Math.cos(phase * 2);
  return out;
}
