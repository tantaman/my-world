// The saucer's interference (PLAN.md 5.14), as the original has it: now and
// then, for a few frames at a time, one to four horizontal tears, each a
// block of rows slid sideways together by 10 to 40 pixels (at 2048 wide)
// with a hard edge, which is what kinks the lamp pole at 53.2 s and splits
// the hull at 57.8 s. The rows at a tear's edges carry a thin line of
// static, and red and blue pull apart inside it. Between tears the picture
// is clean. emi (0..1) is how often tears come and how far they slide.
import { Fn, vec3, float, floor, abs, hash, step, mix, max, min, smoothstep, screenSize } from 'three/tsl';

const RATE = 15;            // tears are drawn anew this many times a second (four frames at 60)
const SLOTS = 4;            // at most this many tears at once
const CHANCE = 0.55;        // of each slot holding a tear, at full strength
const HEIGHT = [0.006, 0.11];  // a tear's height, as a fraction of the picture's
const SLIDE = [0.004, 0.02];   // how far it slides, as a fraction of the width
const SPLIT = 0.25;         // red/blue apart inside a tear, as a fraction of its slide
const EDGE_PX = 2.0;        // the static along a tear's edges, in pixels

// Returns vec3(row slide, colour split, static amount); slides and splits
// are fractions of the width.
export const interference = Fn(([uv, t, emi]) => {
  const ev = floor(t.mul(RATE));
  const slide = float(0).toVar();
  const edge = float(0).toVar();
  const px = float(1).div(screenSize.y);
  for (let i = 0; i < SLOTS; i++) {
    const s = ev.mul(17.31).add(i * 101.7);
    const on = step(float(1).sub(emi.mul(CHANCE)), hash(s.add(1.3)));
    const y0 = hash(s.add(2.9));
    const h = mix(HEIGHT[0], HEIGHT[1], hash(s.add(4.1)).pow(2));
    const inside = step(y0, uv.y).mul(step(uv.y, y0.add(h)));
    const dir = step(0.5, hash(s.add(5.7))).mul(2).sub(1);
    const amount = mix(SLIDE[0], SLIDE[1], hash(s.add(6.3))).mul(dir).mul(emi.mul(0.6).add(0.4));
    slide.addAssign(amount.mul(inside).mul(on));
    const nearEdge = max(
      float(1).sub(smoothstep(0, px.mul(EDGE_PX), abs(uv.y.sub(y0)))),
      float(1).sub(smoothstep(0, px.mul(EDGE_PX), abs(uv.y.sub(y0.add(h))))),
    );
    edge.assign(max(edge, nearEdge.mul(on)));
  }
  return vec3(slide, abs(slide).mul(SPLIT), min(edge, 1));
});

// Static for a pixel: sparse bright dots, dense along a tear's edge.
export const staticDots = Fn(([pix, t, amount]) => {
  const n = hash(pix.x.add(pix.y.mul(1973.0)).add(floor(t.mul(60)).mul(7919.0)));
  return step(mix(0.999, 0.9, amount), n).mul(amount.mul(0.12));
});
