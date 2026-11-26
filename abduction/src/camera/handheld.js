// The person carrying the camera, on top of the path: a step while walking,
// slow sway while standing, a touch of fast jitter. All from noise of t, so
// it repeats.
import { WHERE } from './path.js';
import { LENGTH } from '../timeline.js';
import { noise1, fbm1 } from '../noise1.js';

const STRIDE = 0.78;        // metres a step
const BOB = 0.02;           // metres up and down a step
const SWAY = 0.015;         // metres side to side a step
const ROLL = 0.5;           // degrees of roll a step
const BREATH = 0.25;        // degrees of slow sway while standing
const JITTER = 0.08;        // degrees of fast shake
const WALKING = 0.35;       // m/s above which the person is walking

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
  const walking = Math.min(1, Math.max(0, (speed - WALKING) / 0.5));
  const phase = (dist / STRIDE) * Math.PI;
  const standing = 1 - walking * 0.6;
  out.up = walking * BOB * (Math.abs(Math.sin(phase)) - 0.5);
  out.side = walking * SWAY * Math.sin(phase);
  out.roll = walking * ROLL * Math.sin(phase) + fbm1(t * 0.35, 3) * 0.6;
  out.yaw = standing * BREATH * fbm1(t * 0.3, 1) + JITTER * noise1(t * 9, 5) + walking * 0.35 * Math.sin(phase);
  out.pitch = standing * BREATH * fbm1(t * 0.25 + 10, 2) + JITTER * noise1(t * 11, 6) + walking * 0.4 * Math.cos(phase * 2);
  return out;
}
