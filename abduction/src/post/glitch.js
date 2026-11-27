// The end (PLAN.md 5.14, 71.2 to 71.8 s), as the original has it: the
// picture breaks into rectangular blocks, rows of them of random height, cut
// across into lengths of random width, and more of them slip sideways each
// frame, mostly by a little (10 to 40 pixels at 2048 wide), now and then by
// more; colours split on bright things; blocks go dark one by one until the
// whole picture is a dark mosaic, then black. g is how far into it, 0..1.
import { Fn, vec3, float, floor, hash, step, mix, pow } from 'three/tsl';

const ROWS = [14, 40];        // rows of blocks over the height, changing every frame
const CUTS = [3, 14];         // blocks across a row
const SMALL = [0.004, 0.02];  // most slips, as a fraction of the width
const LARGE = 0.06;           // the odd big slip
const SPLIT = 0.004;          // red and blue apart at the end, as a fraction of the width

// Returns vec3(sideways slip, colour split, how dark the block has gone 0..1).
export const glitch = Fn(([uv, t, g]) => {
  const frame = floor(t.mul(60));
  const rows = mix(ROWS[0], ROWS[1], hash(frame.add(3.1)));
  const by = floor(uv.y.mul(rows));
  const cuts = mix(CUTS[0], CUTS[1], hash(frame.mul(1.3).add(by).add(9.7)));
  // Cut lines slide with the row, so blocks are of uneven width.
  const bx = floor(uv.x.mul(cuts).add(hash(by.add(frame.mul(0.7)))));
  const id = by.mul(13.1).add(bx.mul(5.3)).add(frame.mul(1.7));
  // More blocks move as it goes on.
  const moves = step(float(1).sub(pow(g, 1.3).mul(0.8)), hash(id));
  const big = step(0.93, hash(id.add(2.2)));
  const size = mix(mix(SMALL[0], SMALL[1], hash(id.add(4.4))), LARGE, big);
  const dir = step(0.5, hash(id.add(7.7))).mul(2).sub(1);
  // Blocks go dark, more of them late on.
  const dark = step(float(1).sub(pow(g, 3)), hash(id.add(11.1))).mul(mix(0.4, 0.95, hash(id.add(12.3))));
  return vec3(size.mul(dir).mul(moves), g.mul(SPLIT), dark);
});
