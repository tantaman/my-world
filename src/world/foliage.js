// What a plant's surfaces are, drawn without textures: each vertex says what
// sort of surface it's on (CARD, below) and where on it (aCard), and the
// shader works the pattern out from that, pixel by pixel. A card is a flat
// quad carrying a spray of needles, a cluster of leaves, a fern's frond; the
// shader cuts the needles and leaves out of it, so you see through the gaps.
// Bark is furrowed into plates, birch bark marked; the dense middle of a crown is a
// ragged volume (FILL), and so are distant crowns.
//
// aCard = (x, y, length, sort): for a card, x is metres along it from where
// it grows (0 .. length) and y metres across it; for bark, x goes round the
// trunk (0 .. 1), y is the height (m) and length is how many furrows there
// are round it; for FILL, only the sort counts (the pattern is in the
// plant's own space). A vertex with no card is plain (SOLID).
//
// Each pattern knows how big its parts are and how much ground a pixel
// covers (fw, metres): parts smaller than a pixel or two give way to the
// shape they make together, so nothing shimmers as you walk away from it.
// The answer is how much of the pixel is covered, 0..1, with its edges
// soft over a pixel; the material either cuts at a half (no multisampling)
// or hands it to the card as coverage (alpha to coverage). The gaps that
// stand in for parts too small to see have steep edges, or a far crown
// would be half there all over, and look like glass. The shadow is cut from
// the same pattern, at the shadow map's own scale.

export const CARD = {
  SOLID: 0,
  SPRAY: 1, // a conifer's branch: a stem, side shoots slanting forward, needles all along
  LEAVES: 2, // a twig of broad leaves, an oval spray of them
  SMALL: 3, // a hanging strip of small leaves (a birch's)
  BARK: 4, // furrowed into plates
  BIRCH: 5, // white, with dark dashes across it (lenticels)
  FILL: 6, // the thick of a crown: ragged, with holes
  FROND: 7, // a fern's: leaflets either side of the stem
};

// (needs NOISE_GLSL)
export const FOLIAGE_GLSL = /* glsl */ `
// Lumps and holes a few times bigger than the parts they stand in for: what
// a spray or a cluster of leaves is made of, seen from too far off to make
// out the parts. Negative in a hole (m, about).
float clumps(vec2 p, float size) {
  float n = vnoise(p / size) * 0.6 + vnoise(p / (size * 0.43) + 5.1) * 0.4;
  return (n - 0.36) * size * 3.0;
}

// ── Conifer sprays ──
// A branch seen flat: its stem, and all along it tufts of needles (a side
// shoot each, a few centimetres long) packed close, each slanting forward and
// out its own way; they stop short at the spray's edge at different places,
// so the outline is ragged. Once a tuft is down to a few pixels, the tufts
// give way to what they make together: a mass with gaps in it drawn out the
// way the shoots go, and a fringe of shoot tips at its edge.
const float TUFT = 0.05; // m between tufts
const float NEEDLE_GAP = 0.0065; // m between needles
const float SLANT = 0.85; // how far forward a shoot runs for each metre out
float spray(vec2 p, float len, float fw, out float shade) {
  float u = clamp(p.x / len, 0.0, 1.0);
  float ay = abs(p.y);
  // the spray's outline: narrow where it leaves the trunk, broadest a third
  // of the way along, coming to a point
  float halfW = len * 0.3 * smoothstep(0.0, 0.2, u) * (1.0 - 0.85 * u * u) + 0.035;
  float far = smoothstep(TUFT * 0.25, TUFT * 0.7, fw);
  float d = -1.0;
  float id = 0.5;
  float along = 0.0;
  if (far < 1.0) {
    vec2 c = floor(p / TUFT);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 k = c + vec2(float(i), float(j));
        float h1 = hash12(k + 0.37 * len);
        float h2 = hash12(k + 11.3);
        float h3 = hash12(k + 23.9);
        vec2 at = (k + 0.5 + (vec2(h2, h3) - 0.5) * 0.9) * TUFT;
        if (abs(at.y) > halfW * (0.7 + 0.4 * h1) || at.x < 0.0 || at.x > len || h3 < 0.1) continue;
        float ang = sign(at.y + 1e-4) * (0.86 + (h1 - 0.5) * 0.7);
        vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * (p - at);
        float a = TUFT * (0.85 + 0.6 * h2);
        float t = clamp(q.x / a, -1.0, 1.0);
        float dl = min(a - abs(q.x), a * 0.45 * sqrt(max(0.0, 1.0 - t * t)) - abs(q.y));
        if (dl > d) {
          d = dl;
          id = h1;
          along = q.x;
        }
      }
    }
  }
  float dStem = min(0.008 + 0.01 * (1.0 - u) - ay, len - p.x);
  d = max(d, dStem);
  // the needles themselves, while there's a pixel or more to each gap
  float g = abs(fract(along / NEEDLE_GAP) - 0.5) * NEEDLE_GAP;
  d = mix(max(min(d, 0.0024 - g), dStem), d, smoothstep(NEEDLE_GAP * 0.15, NEEDLE_GAP * 0.5, fw));
  // further off: the mass, its gaps drawn out along the shoots
  vec2 q = vec2(p.x - ay * SLANT, ay) + step(0.0, p.y) * 31.7;
  float n = vnoise(q / vec2(0.05, 0.16)) * 0.6 + vnoise(q / vec2(0.11, 0.3) + 4.1) * 0.4;
  float dFar = min(halfW * (0.6 + 0.45 * n) - ay, (n - 0.32) * 0.25);
  d = mix(d, dFar, far);
  shade = mix(0.66 + 0.48 * id, 0.62 + 0.6 * smoothstep(0.25, 0.8, n), far) * mix(0.85, 1.05, u);
  return clamp(d / fw + 0.5, 0.0, 1.0);
}

// ── Broad leaves ──
// Leaves about cell m apart, each size m long and round times as wide, over
// an oval wide times as wide as it's long, with a twig up the middle.
float leaves(vec2 p, float len, float fw, float cell, float size, float round, float wide, out float shade) {
  vec2 mid = vec2(len * 0.5, 0.0);
  vec2 radii = vec2(len * 0.5, len * wide);
  float dEnv = (1.0 - length((p - mid) / radii)) * radii.y;
  vec2 c = floor(p / cell);
  float best = -1.0;
  float id = 0.5;
  float across = 1.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 k = c + vec2(float(i), float(j));
      float h1 = hash12(k + 0.37 * len);
      if (h1 < 0.1) continue; // here and there, a gap
      float h2 = hash12(k + 11.3);
      float h3 = hash12(k + 23.9);
      vec2 at = (k + 0.5 + (vec2(h2, h3) - 0.5) * 0.8) * cell;
      // pointing on along the twig and out from it
      float ang = sign(at.y + 1e-4) * 0.75 + (h1 - 0.5) * 1.6;
      vec2 r = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * (p - at);
      float a = size * (0.75 + 0.5 * h3);
      float t = clamp(r.x / a, -1.0, 1.0);
      float w = a * round * sqrt(max(0.0, 1.0 - t * t)) * (1.0 - 0.3 * t);
      float dl = min(a - abs(r.x), w - abs(r.y));
      if (dl > best) {
        best = dl;
        id = h1;
        across = abs(r.y) / max(w, 1e-4);
      }
    }
  }
  float dTwig = min(0.005 - abs(p.y), len * 0.85 - p.x);
  float d = max(min(best, dEnv + cell * 0.35), dTwig);
  // further off, the leaves run together into lumps with gaps between, and
  // the lumps into the spray's outline, frayed
  float far = smoothstep(cell * 0.12, cell * 0.4, fw);
  d = mix(d, min(dEnv - 0.2 * cell + clumps(p, cell * 1.6) * 0.5, clumps(p + 2.3, cell * 2.6)), far);
  // each leaf turned its own way to the light, its midrib a shade darker
  shade = mix((0.78 + 0.38 * id) * (0.9 + 0.1 * smoothstep(0.0, 0.2, across)), 0.75 + 0.35 * vnoise(p / cell * 0.5), far);
  return clamp(d / fw + 0.5, 0.0, 1.0);
}

// ── A fern's frond ──
// Its own outline is the geometry's (models.js: makeFern); this cuts leaflets
// either side of the stem, slanting forward, narrowing to their tips.
float frond(vec2 p, float len, float fw, out float shade) {
  float u = clamp(p.x / len, 0.0, 1.0);
  float W = sin(min(1.0, u * 1.15) * 3.14159) * 0.16 * len + 0.004;
  float ay = abs(p.y);
  const float GAP = 0.028; // m between leaflets
  float off = (fract((p.x - ay * 0.35) / GAP) - 0.5) * GAP;
  float d = min(GAP * 0.38 * (1.0 - 0.65 * ay / W) - abs(off), W - ay);
  d = max(d, 0.003 - ay);
  d = mix(d, W * 0.85 - ay, smoothstep(GAP * 0.15, GAP * 0.45, fw));
  shade = 0.85 + 0.2 * (1.0 - ay / W);
  return clamp(d / fw + 0.5, 0.0, 1.0);
}

// ── The thick of a crown ──
float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y);
  float b = mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y);
  return mix(a, b, u.z);
}
float fill(vec3 l, float fw, out float shade) {
  float n = vnoise3(l * 2.3) * 0.62 + vnoise3(l * 6.1 + 3.1) * 0.38;
  float d = (n - 0.42) * 0.9;
  // far off, it closes up: holes smaller than a pixel would only flicker
  d = mix(d, max(d, 0.02), smoothstep(0.04, 0.15, fw));
  shade = 0.72 + 0.4 * n;
  return clamp(d / fw + 0.5, 0.0, 1.0);
}

// ── Bark ──
// Noise that comes round after m cells across (so round the trunk), not up it.
float roundNoise(vec2 p, float m) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float i0 = mod(i.x, m);
  float i1 = mod(i.x + 1.0, m);
  float a = hash12(vec2(i0, i.y));
  float b = hash12(vec2(i1, i.y));
  float c = hash12(vec2(i0, i.y + 1.0));
  float d = hash12(vec2(i1, i.y + 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// Plates of bark, a hand's breadth long, between furrows that wander up the
// trunk; m furrows round it. p: (round it 0..1, height m); fw: how much of p
// a pixel spans. Once a furrow is under a pixel or so, it's its average.
const float PLATE = 0.22; // m: how tall a plate is
float bark(vec2 p, float m, vec2 fw) {
  vec2 q = vec2(p.x * m, p.y / PLATE);
  q.x += (roundNoise(vec2(p.x * m * 0.25, p.y * 0.9), m * 0.25) - 0.5) * 1.6;
  float col = floor(q.x);
  float y = q.y + hash12(vec2(mod(col, m), 3.1)) * 3.0; // plates in one column don't line up with the next's
  vec2 f = fract(vec2(q.x, y));
  vec2 cell = vec2(mod(col, m), floor(y));
  float furrow = smoothstep(0.24, 0.08, min(f.x, 1.0 - f.x));
  float crack = smoothstep(0.1, 0.02, min(f.y, 1.0 - f.y)) * 0.6;
  float tone = 0.82 + 0.34 * hash12(cell + 0.5);
  float near = smoothstep(0.5, 0.2, max(fw.x * m, fw.y / PLATE));
  return mix(0.78, tone * (1.0 - 0.62 * max(furrow, crack)), near);
}
// White, with dark dashes across it (lenticels), and dark and cracked near
// the foot.
float birch(vec2 p, float m, vec2 fw) {
  float q = p.x * m * 3.0;
  vec2 cell = vec2(floor(q), floor(p.y * 13.0));
  float h = hash12(vec2(mod(cell.x, m * 3.0), cell.y));
  float across = fract(q);
  float dash = step(0.55, h) * step(abs(fract(p.y * 13.0) - 0.5), 0.13) * step(0.15, across) * step(across, 0.2 + 0.7 * h);
  dash *= smoothstep(0.5, 0.2, max(fw.x * m * 3.0, fw.y * 20.0)); // (too thin to see far off)
  float rough = roundNoise(vec2(p.x * m * 1.5, p.y * 3.0), m * 1.5);
  float foot = 1.0 - smoothstep(0.3, 1.1, p.y + (rough - 0.5) * 0.6);
  return (1.0 - 0.78 * dash) * (0.88 + 0.16 * rough) * (1.0 - 0.55 * foot * smoothstep(0.35, 0.6, rough));
}

// How much of this pixel the surface covers, 0..1, and how lit its own bit
// of it is (shade, times its colour). card: aCard; local: where it is in the
// plant's own space (m); fw: how much of card.xy a pixel spans; fl: how many
// metres of local.
float cover(vec4 card, vec3 local, vec2 fw, float fl, out float shade) {
  int sort = int(card.w + 0.5);
  float f = max(length(fw), 1e-5);
  shade = 1.0;
  if (sort == ${CARD.SPRAY}) return spray(card.xy, card.z, f, shade);
  if (sort == ${CARD.LEAVES}) return leaves(card.xy, card.z, f, 0.085, 0.072, 0.5, 0.38, shade);
  if (sort == ${CARD.SMALL}) return leaves(card.xy, card.z, f, 0.05, 0.03, 0.72, 0.14, shade);
  if (sort == ${CARD.FROND}) return frond(card.xy, card.z, f, shade);
  if (sort == ${CARD.FILL}) return fill(local, fl, shade);
  if (sort == ${CARD.BARK}) shade = bark(card.xy, card.z, fw);
  if (sort == ${CARD.BIRCH}) shade = birch(card.xy, card.z, fw);
  return 1.0;
}
`;

// (the shadow's material wants only the coverage, but the rest costs nothing there)
export const FOLIAGE_DEPTH_GLSL = FOLIAGE_GLSL;
