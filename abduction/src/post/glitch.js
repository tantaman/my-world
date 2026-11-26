// The end (PLAN.md 5.14, 71.2 to 71.8 s): the frame cut into blocks of
// random size that slide sideways by 5 to 15% of the width, different every
// frame; colours split by about 1%; the whole picture ramps to black.
// g is how far into it, 0..1.
import { Fn, vec2, vec3, float, floor, hash, step, mix, fract } from 'three/tsl';

// Returns vec2(sideways slide, colour split) for screen uv at time t.
export const glitch = Fn(([uv, t, g]) => {
  const frame = floor(t.mul(60));
  // Rows of blocks, their height changing every frame.
  const rows = hash(frame.add(3.1)).mul(24).add(18);
  const by = floor(uv.y.mul(rows));
  const cols = hash(frame.add(by).add(9.7)).mul(14).add(6);
  const bx = floor(uv.x.mul(cols));
  const pick = hash(by.mul(13.1).add(bx.mul(5.3)).add(frame.mul(1.7)));
  const amount = mix(0.05, 0.15, hash(by.add(frame.mul(3.3)).add(1.1)));
  const dir = step(0.5, hash(by.add(frame).add(7.7))).mul(2).sub(1);
  const moves = step(0.6, pick).mul(step(0.02, g));
  return vec2(amount.mul(dir).mul(moves).mul(g.mul(1.5).min(1)), g.mul(0.01));
});
