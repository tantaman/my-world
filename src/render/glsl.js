// GLSL snippets shared between materials and post-processing.

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm4(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, -9.7);
    a *= 0.5;
  }
  return s / 0.9375;
}
`;

// Sky colour as a function of view direction. Used by the sky dome AND by the
// fog in post-processing so distant hills melt seamlessly into the sky.
export const SKY_UNIFORMS_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform float uNight;
uniform float uTime;
`;

export const SKY_GLSL = /* glsl */ `
vec3 skyGradient(vec3 rd) {
  float y = rd.y;
  float t = pow(clamp(y, 0.0, 1.0), 0.4);
  vec3 col = mix(uHorizon, uZenith, t);
  col = mix(col, uHorizon * 0.85, smoothstep(0.0, -0.25, y));
  float sd = max(dot(rd, uSunDir), 0.0);
  float sunUp = clamp(uSunDir.y * 5.0 + 0.5, 0.0, 1.0);
  float glow = pow(sd, 5.0) * 0.32 + pow(sd, 40.0) * 0.55;
  col += uSunColor * glow * sunUp;
  return col;
}
`;

// Ground albedo from world position + masks. Shared by the terrain and the
// grass so blades grow seamlessly out of the ground they stand on.
// (requires NOISE_GLSL)
export const GROUND_GLSL = /* glsl */ `
vec3 groundColor(vec2 wp, float pathM, float forestM, float slope) {
  float n1 = vnoise(wp * 0.33);
  float n2 = vnoise(wp * 1.6 + 13.0);
  float n3 = fbm4(wp * 0.045 - 7.0);
  float n4 = vnoise(wp * 4.1 - 3.0);

  // meadow grass: green with drifts of dry, golden grass
  vec3 grassA = vec3(0.090, 0.170, 0.032);
  vec3 grassB = vec3(0.200, 0.215, 0.055);
  vec3 grassC = vec3(0.055, 0.120, 0.030);
  vec3 meadow = mix(grassA, grassB, smoothstep(0.45, 0.8, n3) * 0.75);
  meadow = mix(meadow, grassC, smoothstep(0.55, 0.85, n1) * 0.6);
  meadow *= 0.82 + 0.32 * n2;

  // forest floor: leaf litter, needles and moss
  vec3 litter = vec3(0.080, 0.056, 0.028);
  vec3 needles = vec3(0.110, 0.070, 0.035);
  vec3 moss = vec3(0.045, 0.085, 0.020);
  vec3 floorc = mix(litter, needles, smoothstep(0.3, 0.7, n2));
  floorc = mix(floorc, moss, smoothstep(0.45, 0.75, n1) * 0.8);
  floorc *= 0.78 + 0.4 * n4;

  float forest = clamp(forestM + (n1 - 0.5) * 0.35, 0.0, 1.0);
  vec3 col = mix(meadow, floorc, smoothstep(0.3, 0.9, forest));

  // footpath: packed earth, the odd pebble, worn grassy edges
  float pm = pathM + (n2 - 0.5) * 0.38 + (n4 - 0.5) * 0.18;
  vec3 dirt = vec3(0.200, 0.135, 0.075);
  vec3 dirtDark = vec3(0.115, 0.078, 0.045);
  vec3 dirtc = mix(dirt, dirtDark, smoothstep(0.35, 0.8, n2) * 0.7);
  vec2 pq = wp * 8.0 + vec2(vnoise(wp * 3.0), vnoise(wp * 3.0 + 7.0)) * 2.0;
  float peb = step(0.955, hash12(floor(pq)));
  dirtc = mix(dirtc, vec3(0.21, 0.18, 0.14), peb * 0.5);
  float edge = smoothstep(0.30, 0.45, pm) * (1.0 - smoothstep(0.45, 0.62, pm));
  col = mix(col, col * 0.62 + dirtDark * 0.3, edge);
  col = mix(col, dirtc, smoothstep(0.45, 0.6, pm));

  // rock on steep slopes
  vec3 rock = vec3(0.16, 0.155, 0.145) * (0.75 + 0.5 * n2);
  col = mix(col, rock, smoothstep(0.30, 0.45, slope + (n1 - 0.5) * 0.12));

  return col;
}
`;
