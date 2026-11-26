// The saucer's interference (PLAN.md 5.14): one or two horizontal bands that
// wander up and down. In a band each row of pixels slides sideways by its
// own small amount (which kinks the lamp pole and slants the trunks), red
// and blue pull apart, and dotted static is added. emi is how strong, 0..1.
import { Fn, vec2, vec3, float, floor, abs, smoothstep, sin, hash, max, step, fract } from 'three/tsl';

const ROWS = 360;          // rows of pixels that slide together, over the height
const SHIFT = 0.018;       // widest sideways slide, as a fraction of the width
const SPLIT = 0.004;       // red/blue apart, as a fraction of the width

// How much of a band covers screen height y (0 top .. 1 bottom) at time t.
export const bandAt = Fn(([y, t]) => {
  const c1 = sin(t.mul(0.73)).mul(0.33).add(sin(t.mul(1.9)).mul(0.08)).add(0.5);
  const c2 = sin(t.mul(0.41).add(2.0)).mul(0.4).add(0.45);
  const w1 = sin(t.mul(2.3)).mul(0.015).add(0.035);
  const w2 = sin(t.mul(1.7).add(1.0)).mul(0.01).add(0.02);
  const b1 = smoothstep(w1, w1.mul(0.25), abs(y.sub(c1)));
  const b2 = smoothstep(w2, w2.mul(0.3), abs(y.sub(c2))).mul(sin(t.mul(0.9)).mul(0.5).add(0.5));
  return max(b1, b2);
});

// Returns vec3(row slide, colour split, static amount), all as fractions.
export const interference = Fn(([uv, t, emi]) => {
  const band = bandAt(uv.y, t).mul(emi);
  const frame = floor(t.mul(30));
  const row = floor(uv.y.mul(ROWS));
  const r1 = hash(row.add(frame.mul(1.37)));
  const r2 = hash(floor(row.div(7)).add(frame.mul(0.71)).add(19.0));
  const slide = r1.sub(0.5).mul(0.6).add(r2.sub(0.5)).mul(SHIFT).mul(band);
  const split = band.mul(SPLIT);
  return vec3(slide, split, band);
});

// Dotted static for a pixel.
export const staticDots = Fn(([pix, t, amount]) => {
  const n = hash(pix.x.add(pix.y.mul(1973.0)).add(floor(t.mul(60)).mul(7919.0)));
  return step(0.985, n).mul(amount).mul(0.3);
});
