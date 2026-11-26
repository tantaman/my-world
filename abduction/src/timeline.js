// The clock, and every event's time in one table.
//
// One number, t (seconds since the start of the take), drives everything:
// the camera, the car, the saucer, the lightning, the wind and the lens. Each
// thing reads t and nothing else it did not make itself, so ?t=53 shows the
// same frame every time and a capture repeats exactly.

// The length of the take, the last second black.
export const LENGTH = 72.5;

// When things happen, in seconds. PLAN.md section 3 is where they come from.
export const T = {
  strike1: 5.70,
  lightInSky: [9.5, 15.0],
  carSeen: 16.5,
  carPasses: 20.3,       // nearest the camera
  carGone: 24.0,
  strike2: 42.20,
  ufoArrive: 46.5,       // comes in from +X along the road
  ufoStop: 50.5,         // above the cow
  ringOn: 53.3,          // the ring under the hull brightens
  beamStart: 53.5,       // the beam grows down
  beamGround: 54.2,      // and reaches the ground
  liftStart: 54.6,       // the cow leaves the ground
  liftEnd: 58.8,         // and reaches the hull
  beamUp: 59.0,          // the beam draws back up
  beamOff: 59.8,
  ufoTip: 61.8,          // tips over, then leaves fast
  ufoGone: 64.8,
  glitch: [71.2, 71.8],  // signal loss, then black
  black: 71.8,
};

// The overlay's clock reads 21:45:00.6 plus t.
export const CLOCK_START = { h: 21, m: 45, s: 0.6 };

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const mix = (a, b, f) => a + (b - a) * f;
export const smooth = (x) => x * x * (3 - 2 * x);
// 0 before a, 1 after b, eased between.
export const ramp = (t, a, b) => smooth(clamp((t - a) / (b - a)));

// Piecewise-linear lookup in [[t, value], ...] (sorted by t).
export function env(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t < keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return keys[keys.length - 1][1];
}

// Brightness of a lightning strike against seconds after it (PLAN 5.6).
const STRIKE_1 = [[-0.01, 0], [0, 1], [0.08, 0.5], [0.15, 0.9], [0.3, 0.35], [0.6, 0.1], [0.9, 0]];
const STRIKE_2 = [[-0.01, 0], [0, 1], [0.08, 0.5], [0.15, 0.85], [0.22, 0.4], [0.3, 0.9], [0.45, 0.9], [0.6, 0.3], [0.8, 0.08], [1.0, 0]];

// Which strike is lighting the world at t, and how brightly: { flash, which }.
export function flash(t) {
  const a = env(t - T.strike1, STRIKE_1);
  const b = env(t - T.strike2, STRIKE_2);
  return a >= b ? { flash: a, which: 0 } : { flash: b, which: 1 };
}

// How hard the saucer is disturbing the picture: 0 until it comes, 1 while
// the beam is on, 0 once it has gone (PLAN 5.14).
export function emi(t) {
  return env(t, [
    [T.ufoArrive, 0], [T.ufoStop, 0.35], [T.ringOn, 0.55], [T.beamGround, 1],
    [T.beamOff, 1], [T.ufoTip, 0.5], [63.5, 0.6], [T.ufoGone, 0],
  ]);
}

// The clock that drives t while playing: the audio clock once sound has
// started (so picture and sound cannot drift apart), else the page's.
export function createClock(fixed) {
  let audio = null;
  let audioStart = 0;
  let wallStart = performance.now();
  // Not running until start() (the title card's Play), unless held at a time.
  let running = false;
  return {
    fixed,
    get running() { return running; },
    // ctx: an AudioContext whose clock to follow from `at` (its time), or null.
    start(ctx, at) {
      audio = ctx ?? null;
      audioStart = audio ? at ?? audio.currentTime : 0;
      wallStart = performance.now();
      running = true;
    },
    now() {
      if (fixed != null) return fixed;
      if (!running) return 0;
      const s = audio ? audio.currentTime - audioStart : (performance.now() - wallStart) / 1000;
      return Math.max(0, Math.min(s, LENGTH));
    },
  };
}
