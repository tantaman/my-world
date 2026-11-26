// Smooth 1D noise of time, for things that wobble (the hand holding the
// camera, the saucer's hover, the wind). Same input, same output: no state.

function hash(i) {
  let h = (i | 0) * 374761393 + 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Value noise in -1..1, smooth, about one wiggle per unit of x.
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  const a = hash(i + seed * 7919);
  const b = hash(i + 1 + seed * 7919);
  return (a + (b - a) * u) * 2 - 1;
}

// A few octaves of it.
export function fbm1(x, seed = 0, octaves = 3) {
  let s = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    s += noise1(x, seed + o * 31) * amp;
    norm += amp;
    x *= 2.03;
    amp *= 0.5;
  }
  return s / norm;
}

// A repeatable random number in 0..1 for an integer.
export const rand = (i, seed = 0) => hash(i * 31 + seed * 1013904223);
