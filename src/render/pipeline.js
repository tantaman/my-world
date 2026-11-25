// The look: how a drawn scene is turned into the picture on the screen.
//
// 1. The scene is drawn into an HDR target with a depth texture: at the
//    screen's own resolution (up to a cap, past which it's drawn smaller and
//    blown up smoothly), multisampled so edges are smooth, or, with pixel
//    art on, a few hundred lines tall and hard-edged. It's drawn in two
//    goes. First everything but what is on the OVER layer; then a copy is
//    kept of that (BEHIND in uniforms.js: its colour, and how far off each
//    pixel is), and what is on OVER is drawn over it. That is the water, so
//    it can show what lies under it, bent by the ripples and dimmed by how
//    much water the light comes through, and mirror what stands over it
//    (world/waterSurface.js); and with it whatever is seen in front of the
//    water (splashes, motes), so they aren't taken for what lies under it.
// 2. Ambient occlusion, from the depth alone, at half that resolution: how
//    much of the open sky each spot can't see past what's right next to it.
//    It's what sets a trunk in the ground, a rock in the grass and the hiker
//    on the path. It is worked out with a pattern that repeats every 4 × 4
//    pixels, and blurred over just that, keeping to one surface.
// 3. A composite pass, still in HDR: the occlusion; with pixel art on,
//    outlines on silhouettes; height fog that melts into the sky; a layer of
//    cloud where the country has one (see DECK in uniforms.js). With the
//    camera under water, the fog is the water's instead: everything loses its
//    reds with depth, fades into green or blue within a few tens of metres,
//    and light comes down through it in slanting shafts.
//    And where the air over something hot shimmers (the HEAT layer, below:
//    render/haze.js), the picture is drawn through it, bent this way and
//    that.
//    And round each light that things give off (render/lights.js: a fire,
//    lava), the air between glows with the light it scatters back at you:
//    a halo in a haze, a fire's warmth hanging in the smoke over it.
// 4. Bloom: the brightest light spills a little into what's round it, as it
//    does in an eye or a lens: the sun through the branches, a fire at night.
//    A chain of ever smaller copies, each blurred, added back up again.
// 5. The eye adjusts: the average brightness of the picture (taken from the
//    smallest copy) draws the exposure after it over a second or so, but
//    only part of the way and only so far, so a wood is still darker than a
//    meadow, just less so once you're in it. By day in the open air only:
//    night and caves are as dark as the sky (world/sky.js) makes them.
// 6. The final pass: exposure, a filmic tone curve (ACES) and a light grade,
//    then onto 8 bits: with pixel art, ordered dithering onto a reduced
//    palette, which reads as pixel texture; without it, a whisper of noise
//    so the sky doesn't band.
// 7. Up to the screen: with pixel art, each art pixel is snapped and blended
//    across a band at its edges whose width is the "softness"; without it,
//    smoothly, where the picture was drawn smaller than the screen.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { SKY, DECK, UNDER, SHARED, BEHIND } from './uniforms.js';
import { NOISE_GLSL, SKY_GLSL, SKY_UNIFORMS_GLSL, WORLD_GLSL, WORLD_NOISE_GLSL, UNDER_GLSL } from './glsl.js';
import { Lights, LIGHTS_AIR } from './lights.js';
import { Casters } from './casters.ts';

// The layer that is drawn second, over a copy of everything else (see 1.,
// above): `mesh.layers.set(OVER)`. Lights that should fall on it are on it
// too (`light.layers.enableAll()`), since three.js only lights a thing with
// the lights the camera can see.
export const OVER = 1;

// The layer of what makes the air over it shimmer (render/haze.js): drawn
// not into the picture but into a small buffer of how far each pixel is
// bent, which the composite draws the picture through. Only for a scene that
// says it has any (scene.userData.heat), so that others don't pay for it.
export const HEAT = 2;

const FOG_DENSITY = 0.0021; // per metre at the height of the eye, in the forest's air
const FOG_THIN = 0.03; // per metre of height: how quickly the forest's haze thins upward
const FOG_TINT = 0.82; // the fog's colour: the sky's behind it, a little dimmed
const FAR_Z = 6.0e4; // m: how far off the sky is said to be in the copy (as far as half a float holds)
const GLOW_AIR = 1.6; // how much more the air near a light scatters than the haze shows: the smoke and heat over a fire
const GLOW_NEAR = 0.2; // m: the least a ray passes a light by (none is a point)

const AO_RADIUS = 0.9; // m: how far round a spot the occlusion looks
const AO_SAMPLES = 10; // per pixel (times the 16 turns of the pattern)
const AO_MAX_SPAN = 0.12; // of the picture's height, at the most, however close
const BLOOM_LEVELS = 6; // halvings, at the most
const BLOOM_MIX = 0.045; // how much of the picture is the spilt light
const BLOOM_CLAMP = 40.0; // HDR: brighter than this is a speck that would flicker
const VIGNETTE = 0.55;
const ADAPT_KEY = 0.21; // the average brightness the eye adjusts to (linear, after exposure)
const ADAPT_SHARE = 0.5; // how much of the way it goes (in stops)
const ADAPT_DOWN = 0.75; // the least it makes of the exposure...
const ADAPT_UP = 1.65; // ...and the most, by day in the open
const ADAPT_RATE = 1.4; // 1/s

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// ── Ambient occlusion ──────────────────────────────────────────────────────
// For each pixel, a spiral of samples in a disc whose size on screen is
// AO_RADIUS at that depth. A sample that stands up over the surface (towards
// its normal, built from the depth of the pixels either side) and close to it
// hides some of the sky. Out: (how open it is, 0..1; the depth, m) for the
// blur in the composite to keep to one surface by.
const AO_FRAG = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 uDepthRes;
uniform mat4 uProj;
uniform mat4 uProjInv;
uniform float uRadius;
uniform float uMaxSpan;
varying vec2 vUv;

// Where a depth texel is, in view space. (The middle of the
// texel, whose depth it is: anywhere else, a slope seen edge on would seem
// to stand up in front of itself. The sky's depth is 1, which is infinitely
// far: it's read as just short of that, far enough to hide nothing.)
vec3 viewPos(ivec2 texel) {
  texel = clamp(texel, ivec2(0), ivec2(uDepthRes) - 1);
  vec2 uv = (vec2(texel) + 0.5) / uDepthRes;
  float d = min(texelFetch(tDepth, texel, 0).x, 0.99999);
  vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}

void main() {
  // At half resolution vUv can land exactly between depth texels. Choose
  // the centre once so rounding can't make a neighbour coincide with it.
  ivec2 centre = ivec2(vUv * uDepthRes);
  float d = texelFetch(tDepth, centre, 0).x;
  if (d >= 0.99999) {
    gl_FragColor = vec4(1.0, 6.0e4, 0.0, 1.0); // (as far as half a float holds)
    return;
  }
  vec3 p = viewPos(centre);
  float z = -p.z;
  // the surface's normal: from the neighbours on whichever side is nearer,
  // so an edge doesn't bend it
  vec3 pl = viewPos(centre - ivec2(1, 0));
  vec3 pr = viewPos(centre + ivec2(1, 0));
  vec3 pd = viewPos(centre - ivec2(0, 1));
  vec3 pu = viewPos(centre + ivec2(0, 1));
  ivec2 last = ivec2(uDepthRes) - 1;
  bool useRight = centre.x == 0 || (centre.x < last.x && abs(pr.z - p.z) < abs(p.z - pl.z));
  bool useUp = centre.y == 0 || (centre.y < last.y && abs(pu.z - p.z) < abs(p.z - pd.z));
  vec3 dx = useRight ? pr - p : p - pl;
  vec3 dy = useUp ? pu - p : p - pd;
  vec3 n = normalize(cross(dx, dy));

  // the disc on screen, in uv (y); x is squeezed by the picture's shape
  float span = min(uRadius * uProj[1][1] * 0.5 / z, uMaxSpan);
  if (span * uDepthRes.y < 1.5) {
    gl_FragColor = vec4(1.0, z, 0.0, 1.0);
    return;
  }
  vec2 aspect = vec2(uDepthRes.y / uDepthRes.x, 1.0);
  // turned by a 4 × 4 pattern, which the blur takes out again
  ivec2 cell = ivec2(mod(floor(gl_FragCoord.xy), 4.0));
  int bayer[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  float turn = float(bayer[cell.x + cell.y * 4]) / 16.0 * 6.2832;
  float r2 = uRadius * uRadius;
  float occ = 0.0;
  for (int i = 0; i < ${AO_SAMPLES}; i++) {
    float t = (float(i) + 0.5) / ${AO_SAMPLES}.0;
    float a = float(i) * 2.39996 + turn;
    vec2 off = vec2(cos(a), sin(a)) * sqrt(t) * span * aspect;
    vec3 v = viewPos(ivec2(vec2(centre) + 0.5 + off * uDepthRes)) - p;
    float vv = dot(v, v);
    float c = dot(v, n) * inversesqrt(vv + 1.0e-4);
    occ += max(c - 0.12, 0.0) * max(1.0 - vv / r2, 0.0);
  }
  float open = 1.0 - occ * 2.0 / ${AO_SAMPLES}.0;
  gl_FragColor = vec4(clamp(open, 0.0, 1.0), z, 0.0, 1.0);
}`;

// ── What lies behind the water ─────────────────────────────────────────────
// A copy of the scene drawn so far, for what is drawn over it to read: its
// colour, and in alpha how far off it is (view depth, m; the sky FAR_Z).
const BEHIND_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform float uNear;
uniform float uFar;
varying vec2 vUv;
void main() {
  float d = texture2D(tDepth, vUv).x;
  float z = d >= 0.99999 ? ${FAR_Z.toFixed(1)} : min(-perspectiveDepthToViewZ(d, uNear, uFar), ${FAR_Z.toFixed(1)});
  gl_FragColor = vec4(texture2D(tColor, vUv).rgb, z);
}`;

// ── Composite (HDR in, HDR out) ────────────────────────────────────────────
const COMPOSITE_FRAG = /* glsl */ `
#include <packing>
${SKY_UNIFORMS_GLSL}
${SKY_GLSL}
${UNDER_GLSL}
uniform float uUnder;
uniform float uUnderLevel;
uniform float uUnderSea;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tAO;
uniform sampler2D tHeat;
uniform float uHeat;
uniform vec2 uAORes;
uniform float uAO;
uniform vec2 uRes;
uniform float uNear;
uniform float uFar;
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform float uOutline;
uniform float uFogDensity;
uniform float uFogHeight;
uniform float uFogFloor;
uniform float uFogFar;
uniform float uFogTint;
uniform vec3 uGroundMist; // height of the layer, falloff distance, and density
uniform vec2 uMistWind;
uniform vec3 uBankCenter; // centre of the arc, at its floor
uniform vec4 uBankShape; // inner radius, outer radius, height (m), density (1/m)
uniform vec4 uBankEdges; // inward normals at the ends of the arc
uniform float uBankFeather; // m over which either end builds up
uniform float uDeck;
uniform float uDeckCover;
uniform vec2 uDeckMid;
uniform vec3 uGlowPos[${LIGHTS_AIR}];
uniform vec3 uGlowCol[${LIGHTS_AIR}];
uniform float uGlowRange[${LIGHTS_AIR}];
uniform float uGlowAir;
varying vec2 vUv;
${NOISE_GLSL}
${WORLD_GLSL}
${WORLD_NOISE_GLSL}

// The layer of cloud. It is a sheet at uDeck, pushed up and down by its own
// billows; this is how much cloud there is where a ray from the eye meets it
// (xy: where, measured from the middle of the land it lies over; t: how far
// along the ray), and how high the billow stands there, 0..1, in tall.
const float DECK_BILLOW = 14.0; // m, crest to trough
const float DECK_THICK = 16.0; // m either side of it that you're in cloud
float deckAt(vec2 p, float t, out float tall) {
  vec2 drift = vec2(uTime * 0.9, uTime * 0.35);
  float n = fbm4((p + drift) * 0.0031) * 0.72 + fbm4((p - drift * 0.6) * 0.0113 + 7.0) * 0.28;
  // far off there's no telling one billow from the next
  n = mix(n, 0.5, smoothstep(2500.0, 9000.0, t));
  tall = n;
  return smoothstep(0.0, 0.3, n - (1.0 - uDeckCover) * 0.75);
}

float viewZ(float d) { return -perspectiveDepthToViewZ(d, uNear, uFar); }

// Optical depth through a low, drifting layer. Stop at the first opaque
// surface so near silhouettes cut into the fog and distant ones fade into it.
float groundMist(vec3 rd, float dist) {
  float start = 0.0;
  float end = min(dist, 580.0);
  float above = uCamPos.y - uGroundMist.x;
  float band = 3.5 * uGroundMist.y;
  if (abs(rd.y) > 1.0e-4) {
    float mid = -above / rd.y;
    float halfBand = band / abs(rd.y);
    start = max(start, mid - halfBand);
    end = min(end, mid + halfBand);
  } else if (abs(above) > band) return 0.0;
  if (start >= end) return 0.0;
  float stride = (end - start) / 5.0;
  float density = 0.0;
  vec2 drift = uMistWind * uTime;
  for (int i = 0; i < 5; i++) {
    vec3 p = uCamPos + rd * (start + (float(i) + 0.5) * stride);
    vec2 wp = worldXZ(p) - drift;
    float billow = wnoise(wp, 0.016) * 0.72 + wnoise(wp, 0.045, vec2(2.7)) * 0.28;
    float height = (p.y - uGroundMist.x) / uGroundMist.y;
    density += exp(-abs(height - billow + 0.5) * 1.6) * smoothstep(0.18, 0.78, billow);
  }
  return density * stride * uGroundMist.z;
}

// Narrow the part of the ray we sample to one side of a plane.
bool clipBank(inout vec2 span, float at, float slope) {
  if (abs(slope) < 1.0e-6) return at >= 0.0;
  float t = -at / slope;
  if (slope > 0.0) span.x = max(span.x, t);
  else span.y = min(span.y, t);
  return span.x < span.y;
}

// A bank that follows an arc, with an uneven top and wisps at its edges.
// Limit the march to its bounds and stop at the surface behind it. A ray
// into the sky still passes through the bank.
vec4 airBank(vec3 rd, float dist) {
  vec3 eye = uCamPos - uBankCenter;
  float height = uBankShape.z;
  vec2 span = vec2(0.0, dist);
  if (!clipBank(span, eye.y + 7.0, rd.y)) return vec4(0.0);
  if (!clipBank(span, height - eye.y, -rd.y)) return vec4(0.0);
  if (!clipBank(span, dot(eye.xz, uBankEdges.xy), dot(rd.xz, uBankEdges.xy))) return vec4(0.0);
  if (!clipBank(span, dot(eye.xz, uBankEdges.zw), dot(rd.xz, uBankEdges.zw))) return vec4(0.0);
  vec2 hollow = vec2(0.0);
  float speed = dot(rd.xz, rd.xz);
  float b = dot(eye.xz, rd.xz);
  float r2 = dot(eye.xz, eye.xz);
  float inner2 = uBankShape.x * uBankShape.x;
  float outer2 = uBankShape.y * uBankShape.y;
  if (speed < 1.0e-6) {
    if (r2 < inner2 || r2 > outer2) return vec4(0.0);
  } else {
    float disc = b * b - speed * (r2 - outer2);
    if (disc <= 0.0) return vec4(0.0);
    float halfWidth = sqrt(disc);
    span = vec2(max(span.x, (-b - halfWidth) / speed), min(span.y, (-b + halfWidth) / speed));
    float innerDisc = b * b - speed * (r2 - inner2);
    if (innerDisc > 0.0) {
      float innerWidth = sqrt(innerDisc);
      hollow = vec2(max(span.x, (-b - innerWidth) / speed), min(span.y, (-b + innerWidth) / speed));
    }
  }
  // Leave the empty middle of the arc out of the march. Use the shortest
  // steps where the ray enters the bank, to resolve the nearest shapes.
  float gap = max(0.0, hollow.y - hollow.x);
  float reach = span.y - span.x - gap;
  if (reach <= 0.0) return vec4(0.0);

  float through = 1.0;
  vec3 scattered = vec3(0.0);
  float day = 1.0 - 0.86 * uNight;
  vec2 wind = uTime * vec2(0.27, -0.13);
  for (int i = 0; i < 16; i++) {
    float t0 = float(i) / 16.0;
    float t1 = float(i + 1) / 16.0;
    float t = span.x + 0.5 * (t0 * t0 + t1 * t1) * reach;
    vec3 p = eye + rd * (t + (t >= hollow.x ? gap : 0.0));
    float stepSize = (t1 * t1 - t0 * t0) * reach;
    vec2 at = p.xz + p.y * vec2(0.42, -0.26) + wind;
    float billow = vnoise(at * 0.09) * 0.74 + vnoise(at * 0.25) * 0.26;
    float r = length(p.xz);
    float rim = uBankShape.y - mix(7.0, 0.0, billow);
    float across = smoothstep(uBankShape.x, uBankShape.x + 3.0, r) * (1.0 - smoothstep(rim - 10.0, rim, r));
    float low = mix(-6.0, -1.2, billow);
    float high = mix(0.46, 1.0, billow) * height;
    float edge = min(dot(p.xz, uBankEdges.xy), dot(p.xz, uBankEdges.zw));
    float along = smoothstep(0.0, uBankFeather, edge * mix(0.42, 1.55, billow));
    float vertical = smoothstep(low, low + 4.0, p.y) * (1.0 - smoothstep(high - 7.0, high, p.y));
    float absorb = 1.0 - exp(-stepSize * uBankShape.w * across * along * vertical * mix(0.24, 1.34, billow));
    float surface = smoothstep(0.04, 0.95, p.y / high) * (0.35 + 0.65 * billow);
    vec3 soot = mix(vec3(0.021, 0.019, 0.017), vec3(0.20, 0.184, 0.168), surface) * day;
    scattered += through * absorb * soot;
    through *= 1.0 - absorb;
    if (through < 0.005) break;
  }
  return vec4(scattered, 1.0 - through);
}

// How open to the sky this pixel is: the occlusion's 4 × 4 texels round it,
// each counted as far as it's on the same surface. dz: how the depth runs
// across the screen here (m a pixel), so a slope seen edge on, whose depth
// changes fast from row to row, still counts as one surface.
float openness(float z, vec2 dz) {
  vec2 base = floor(vUv * uAORes - 1.5);
  float sum = 0.0;
  float wsum = 0.0;
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      vec2 at = (base + vec2(float(i), float(j)) + 0.5) / uAORes;
      vec2 s = texture2D(tAO, at).xy;
      // (a few per cent off where this surface would be is still it; much
      // more is something in front of it or behind)
      float off = (s.y - z - dot(dz, (at - vUv) * uRes)) / (z * 0.04);
      float w = exp(-off * off);
      sum += s.x * w;
      wsum += w;
    }
  }
  return wsum > 0.01 ? sum / wsum : 1.0;
}

// Silhouette outline (pixel art): darker where the neighbours lie much further off.
float outlineAt(float d) {
  vec2 px = 1.0 / uRes;
  float z = viewZ(d);
  float zl = viewZ(texture2D(tDepth, vUv - vec2(px.x, 0.0)).x);
  float zr = viewZ(texture2D(tDepth, vUv + vec2(px.x, 0.0)).x);
  float zu = viewZ(texture2D(tDepth, vUv + vec2(0.0, px.y)).x);
  float zd = viewZ(texture2D(tDepth, vUv - vec2(0.0, px.y)).x);
  float far = max(max(zl, zr), max(zu, zd));
  return smoothstep(0.06, 0.2, (far - z) / z);
}

// Under water: what lies dist m off along rd looks like through the water.
vec3 underWater(vec3 col, vec3 rd, float dist, vec2 frag) {
  float k = uUnderSea;
  vec3 p = uCamPos + rd * dist;
  // the daylight that reached it came down through the water over it
  col *= exp(-max(uUnderLevel - p.y, 0.0) * waterAbsorb(k));
  // and what it sends back fades into the water between, which glows with
  // the light it scatters
  float fog = waterFog(k);
  float camDepth = max(uUnderLevel - uCamPos.y, 0.0);
  float far = 1.0 - exp(-dist * fog);
  vec3 glow = waterGlow(k, camDepth + max(0.0, -rd.y) * min(dist, 30.0) * 0.5);
  col = mix(col, glow, far);
  // Shafts: sunlight through the moving surface, slanting with the sun,
  // brightest near the top.
  float sun = smoothstep(0.02, 0.25, uSunDir.y) * (1.0 - uNight);
  if (sun > 0.0) {
    float reach = min(dist, 26.0);
    float jitter = 0.5; // (the same for every pixel: jittered, it shows as static)
    vec2 slant = uSunDir.xz / max(uSunDir.y, 0.25);
    float shafts = 0.0;
    for (int i = 0; i < 6; i++) {
      float t = reach * (float(i) + jitter) / 6.0;
      vec3 q = uCamPos + rd * t;
      float dq = max(uUnderLevel - q.y, 0.0);
      vec2 at = worldXZ(q) + slant * dq; // (q is as drawn, from near the camera)
      float n = wnoise(at, 0.32, vec2(uTime * 0.13, uTime * 0.05)) * wnoise(at, 0.71, -vec2(uTime * 0.04, uTime * 0.11));
      shafts += smoothstep(0.22, 0.6, n) * exp(-dq * 0.07 - t * fog);
    }
    col += uSunColor * mix(vec3(0.5, 0.9, 0.7), vec3(0.45, 0.8, 1.0), k) * shafts * (reach / 6.0) * 0.03 * sun;
  }
  return col;
}

// The light each light scatters toward the eye from the air along the ray,
// up to dist: for a light I at distance h from the ray, the sum of
// I / (h² + (t - tc)²) along it is I / h times the angle the stretch of ray
// subtends at the light. Only the stretch within its range counts, and it
// fades as the ray passes nearer the edge of that.
vec3 airGlow(vec3 rd, float dist) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ${LIGHTS_AIR}; i++) {
    vec3 L = uGlowCol[i];
    if (L.r + L.g + L.b <= 0.0) continue;
    vec3 q = uGlowPos[i] - uCamPos;
    float tc = dot(q, rd);
    float R2 = uGlowRange[i] * uGlowRange[i];
    float h2 = max(dot(q, q) - tc * tc, ${(GLOW_NEAR * GLOW_NEAR).toFixed(4)});
    if (h2 >= R2) continue;
    float half_ = sqrt(R2 - h2);
    float t0 = max(0.0, tc - half_);
    float t1 = min(dist, tc + half_);
    if (t1 <= t0) continue;
    float h = sqrt(h2);
    float a = atan((t1 - tc) / h) - atan((t0 - tc) / h);
    float win = 1.0 - h2 / R2;
    sum += L * (a / h) * win * win;
  }
  return sum * uGlowAir * 0.0796; // (1 / 4π: scattered evenly every way)
}

void main() {
  // (drawn through the shimmer over anything hot)
  vec2 bent = uHeat > 0.0 ? texture2D(tHeat, vUv).xy : vec2(0.0);
  vec3 col = texture2D(tColor, vUv + bent).rgb;
  // (a pixel that has come out as no number at all would spread through the
  // bloom into a blot: it is dark instead)
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  float d = texture2D(tDepth, vUv).x;
  bool sky = d >= 0.99999;
  // the ray through this pixel, and how far along it the scene is
  vec4 vp = uProjInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vp.xyz /= vp.w;
  vec3 rd = normalize(mat3(uCamWorld) * vp.xyz);
  float dist = sky ? 1.0e6 : length(vp.xyz);
  // how the depth runs across the screen, but not over an edge
  float zc = viewZ(d);
  vec2 dz = vec2(dFdx(zc), dFdy(zc));
  if (max(abs(dz.x), abs(dz.y)) > zc * 0.1) dz = vec2(0.0);

  if (!sky) {
    float z = zc;
    if (uAO > 0.0) col *= mix(1.0, openness(z, dz), uAO);
    if (uOutline > 0.0) col *= 1.0 - outlineAt(d) * uOutline;
  }

  if (uUnder > 0.5) {
    col = underWater(col, rd, sky ? 1000.0 : dist, gl_FragCoord.xy);
  } else if (!sky) {
    // Height fog with sun in-scattering, coloured by the sky behind it.
    float b = uFogHeight;
    float ry = abs(rd.y) < 1e-3 ? 1e-3 : rd.y;
    float fogAmt = uFogDensity * exp(-(uCamPos.y - uFogFloor) * b) * (1.0 - exp(-dist * ry * b)) / (ry * b);
    if (uGroundMist.z > 0.0) fogAmt += groundMist(rd, dist);
    float fog = 1.0 - exp(-max(fogAmt, 0.0));
    fog = max(fog, smoothstep(uFogFar * 0.55, uFogFar, dist));
    vec3 frd = normalize(vec3(rd.x, clamp(rd.y, 0.0, 0.08), rd.z));
    col = mix(col, skyGradient(frd) * uFogTint, clamp(fog, 0.0, 1.0));
  }
  if (uUnder < 0.5 && uGlowAir > 0.0) col += airGlow(rd, sky ? 1.0e4 : dist);

  // The layer of cloud: whatever lies past it along the ray is behind it.
  if (uDeckCover > 0.003) {
    float up = uDeck - uCamPos.y; // how far over the eye it lies (under it, if negative)
    float sunUp = clamp(uSunDir.y * 4.0 + 0.3, 0.0, 1.0);
    vec3 bright = mix(uHorizon * 1.05, vec3(0.92, 0.94, 0.98) * (0.25 + 0.75 * sunUp) + uSunColor * 0.22, 0.75) * (1.0 - 0.8 * uNight);
    vec3 dim = mix(uZenith, uHorizon, 0.55) * 0.62 + vec3(0.03) * (1.0 - uNight);
    float ry = abs(rd.y) < 1.0e-4 ? 1.0e-4 : rd.y;
    float t = up / ry;
    if (t > 0.0) {
      vec2 eye = uCamPos.xz - uDeckMid;
      float tall;
      float cov = deckAt(eye + rd.xz * t, t, tall);
      // meet it again where the billow stands, so near ones have a shape
      t = (up + (tall - 0.5) * DECK_BILLOW) / ry;
      if (t > 0.0) {
        cov = deckAt(eye + rd.xz * t, t, tall);
        // from over it: lit crests, blue hollows. From under: its grey base.
        vec3 c = up < 0.0 ? mix(dim, bright, smoothstep(0.3, 0.8, tall)) : mix(dim * 0.95, bright * 0.7, smoothstep(0.35, 0.9, tall) * 0.5);
        // towards the horizon it goes off into the haze
        vec3 hz = skyGradient(normalize(vec3(rd.x, 0.02, rd.z)));
        c = mix(c, mix(c, hz, 0.75), smoothstep(3000.0, 14000.0, t));
        col = mix(col, c, cov * smoothstep(0.0, 22.0, dist - t));
      }
    }
    // and in it, you see nothing much
    float here = deckAt(uCamPos.xz - uDeckMid, 0.0, t);
    float inIt = (1.0 - smoothstep(DECK_THICK * 0.35, DECK_THICK, abs(up))) * here;
    col = mix(col, mix(dim, bright, 0.45), inIt * (1.0 - exp(-dist / 16.0)));
  }

  if (uUnder < 0.5 && uBankShape.w > 0.0) {
    vec4 smoke = airBank(rd, dist);
    col = col * (1.0 - smoke.a) + smoke.rgb;
  }

  gl_FragColor = vec4(col, 1.0);
}`;

// ── Bloom ──────────────────────────────────────────────────────────────────
// Down: thirteen taps, weighted so each level is a smooth half of the last.
// The first takes each group of taps by how bright it isn't (Karis), so a
// lone blazing pixel can't flicker the whole glow.
const BLOOM_DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uFirst;
varying vec2 vUv;
vec3 tap(vec2 o) { return min(texture2D(tSrc, vUv + o * uTexel).rgb, vec3(${BLOOM_CLAMP.toFixed(1)})); }
float karis(vec3 c) { return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722)) * uFirst); }
void main() {
  vec3 a = tap(vec2(-2.0, 2.0)), b = tap(vec2(0.0, 2.0)), c = tap(vec2(2.0, 2.0));
  vec3 d = tap(vec2(-2.0, 0.0)), e = tap(vec2(0.0, 0.0)), f = tap(vec2(2.0, 0.0));
  vec3 g = tap(vec2(-2.0, -2.0)), h = tap(vec2(0.0, -2.0)), i = tap(vec2(2.0, -2.0));
  vec3 j = tap(vec2(-1.0, 1.0)), k = tap(vec2(1.0, 1.0)), l = tap(vec2(-1.0, -1.0)), m = tap(vec2(1.0, -1.0));
  vec3 g0 = (j + k + l + m) * 0.25;
  vec3 g1 = (a + b + d + e) * 0.25;
  vec3 g2 = (b + c + e + f) * 0.25;
  vec3 g3 = (d + e + g + h) * 0.25;
  vec3 g4 = (e + f + h + i) * 0.25;
  vec4 w = vec4(karis(g1), karis(g2), karis(g3), karis(g4)) * 0.125;
  float w0 = karis(g0) * 0.5;
  vec3 col = g0 * w0 + g1 * w.x + g2 * w.y + g3 * w.z + g4 * w.w;
  gl_FragColor = vec4(col / (w0 + w.x + w.y + w.z + w.w), 1.0);
}`;

// Up: a 3 × 3 tent from the level below, added onto this one.
const BLOOM_UP_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
  s += (texture2D(tSrc, vUv + vec2(-1.0, 0.0) * uTexel).rgb + texture2D(tSrc, vUv + vec2(1.0, 0.0) * uTexel).rgb
      + texture2D(tSrc, vUv + vec2(0.0, -1.0) * uTexel).rgb + texture2D(tSrc, vUv + vec2(0.0, 1.0) * uTexel).rgb) * 2.0;
  s += texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb + texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb
     + texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb + texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb;
  gl_FragColor = vec4(s / 16.0, 1.0);
}`;

// ── The eye adjusting ──────────────────────────────────────────────────────
// Into a single pixel: the log-average brightness of a small copy of the
// picture (the middle counting most), what that asks of the exposure, and
// last frame's answer moved towards it.
const ADAPT_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform sampler2D tPrev;
uniform float uExposure;
uniform float uMost;
uniform float uStep;
varying vec2 vUv;
void main() {
  float sum = 0.0;
  float wsum = 0.0;
  for (int j = 0; j < 8; j++) {
    for (int i = 0; i < 8; i++) {
      vec2 uv = (vec2(float(i), float(j)) + 0.5) / 8.0;
      float w = 1.0 - 0.6 * length(uv - 0.5) * 1.4142;
      float l = dot(texture2D(tSrc, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
      sum += log(l * uExposure + 1.0e-4) * w;
      wsum += w;
    }
  }
  float avg = exp(sum / wsum);
  float want = clamp(pow(${ADAPT_KEY.toFixed(3)} / avg, ${ADAPT_SHARE.toFixed(2)}), ${ADAPT_DOWN.toFixed(2)}, uMost);
  float was = texture2D(tPrev, vec2(0.5)).r;
  gl_FragColor = vec4(mix(was, want, uStep), 0.0, 0.0, 1.0);
}`;

// ── Final: tone map, grade, onto 8 bits ────────────────────────────────────
const FINAL_FRAG = /* glsl */ `
uniform sampler2D tHDR;
uniform sampler2D tBloom;
uniform float uBloom;
uniform float uBloomLevels;
uniform sampler2D tAdapt;
uniform float uExposure;
uniform float uPixel;
uniform float uLevels;
uniform float uDither;
uniform float uVignette;
varying vec2 vUv;

// ACES, as fitted by Stephen Hill: into the ACES working space, the
// reference rendering and output transforms, and back. Bright colours go
// towards white the way film does, rather than going flat at full strength.
vec3 rrtOdt(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 c) {
  const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  return clamp(OUT * rrtOdt(IN * (c / 0.6)), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int idx = i.x + i.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[idx]) + 0.5) / 16.0;
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

void main() {
  vec3 col = texture2D(tHDR, vUv).rgb;
  if (uBloom > 0.0) col = mix(col, texture2D(tBloom, vUv).rgb / uBloomLevels, uBloom);

  col = aces(col * uExposure * texture2D(tAdapt, vec2(0.5)).r);
  // a light grade: shadows a little cool, highlights a little warm
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, mix(1.04, 1.12, uPixel));
  col = mix(col, col * vec3(0.95, 0.99, 1.05), (1.0 - smoothstep(0.0, 0.35, l)) * 0.5);
  col = mix(col, col * vec3(1.03, 1.0, 0.95), smoothstep(0.5, 1.0, l) * 0.5);
  col = toSRGB(clamp(col, 0.0, 1.0));

  if (uPixel > 0.5) {
    // Ordered dither onto a reduced palette: pixel-art texture without banding.
    float th = mix(0.5, bayer4(gl_FragCoord.xy), uDither);
    col = floor(col * uLevels + th) / uLevels;
  } else {
    // A least step of noise either way, so smooth skies don't band.
    col += (ign(gl_FragCoord.xy) + ign(gl_FragCoord.yx + 19.0) - 1.0) / 255.0;
  }
  vec2 q = vUv - 0.5;
  col *= 1.0 - dot(q, q) * uVignette;
  gl_FragColor = vec4(col, 1.0);
}`;

// ── Up to the screen ───────────────────────────────────────────────────────
const UPSCALE_FRAG = /* glsl */ `
uniform sampler2D tLow;
uniform vec2 uLowRes;
uniform float uSoft;
uniform float uVignette;
varying vec2 vUv;
void main() {
  // "Soft pixel" sampling: snap to the nearest art pixel, but blend across a
  // band at each pixel edge whose width is uSoft (0 = nearest, 1 = bilinear).
  vec2 p = vUv * uLowRes - 0.5;
  vec2 i = floor(p);
  vec2 f = p - i;
  float w = max(uSoft, 1e-3);
  f = clamp((f - 0.5) / w + 0.5, 0.0, 1.0);
  f = f * f * (3.0 - 2.0 * f);
  vec3 col = texture2D(tLow, (i + f + 0.5) / uLowRes).rgb;
  vec2 q = vUv - 0.5;
  col *= 1.0 - dot(q, q) * uVignette;
  gl_FragColor = vec4(col, 1.0);
}`;

const _eye = new THREE.Vector3();
const _clear = new THREE.Color();

const pass = (uniforms, fragmentShader, extra = {}) =>
  new THREE.ShaderMaterial({ uniforms, vertexShader: FS_VERT, fragmentShader, depthTest: false, depthWrite: false, ...extra });

const hdrTarget = (w, h, filter = THREE.LinearFilter) =>
  new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: filter, magFilter: filter, depthBuffer: false });

// What another pipeline takes on of the game's own, drawing another part of
// a split screen (render/views.ts, lookLike below): how it looks, and the air.
const LOOK = ['enabled', 'pixelSize', 'softness', 'outline', 'levels', 'dither', 'ao', 'bloom', 'fogFar', 'haze', 'fogFloor', 'fogThin'];

export class Pipeline {
  // lights, casters: the pool of lights given off by things (lights.js), and
  // what is drawn into their shadows (casters.ts), to share with another
  // pipeline drawing the same world; or none, to have its own.
  /**
   * @param {import('three').WebGLRenderer} renderer
   * @param {{ lights?: Lights | null, casters?: Casters | null }} [opts]
   */
  constructor(renderer, { lights = null, casters = null } = {}) {
    this.renderer = renderer;
    // Pixel art: drawn a few hundred lines tall and blown up in soft pixels,
    // with outlines and a reduced palette. Off, the picture is as fine as the
    // screen (up to CONFIG.sharpLines).
    this.enabled = CONFIG.pixelArt;
    this.pixelSize = CONFIG.pixelSize;
    this.softness = CONFIG.softness;
    this.outline = CONFIG.outline;
    this.levels = CONFIG.colorLevels;
    this.dither = 1;
    // How strong the ambient occlusion is (0 = none) and the bloom.
    this.ao = CONFIG.ao;
    this.bloom = BLOOM_MIX;
    // Where the fog closes in (m). Unset, it is where the loaded chunks end;
    // something drawing further than that (a far view) may push it out.
    this.fogFar = 0;
    // How thick the air is, 1 being the forest's: a country may say (world/country.js).
    this.haze = 1;
    // The height (m) the haze thins out up from: the forest's floor, or the
    // bottom of a real place that goes down below it (a canyon cut into a
    // plateau), set by the country feature. Thick air is a thing of the
    // valley floor, wherever the floor is.
    this.fogFloor = 0;
    // How quickly the haze thins with height above that (1/m): under the sky
    // it is gone in a few tens of metres. Somewhere with no sky over it
    // (src/hell/), where the air is as thick at any height, makes this next
    // to nothing.
    this.fogThin = FOG_THIN;
    // An optional second layer of fog, concentrated around a world height.
    this.groundMist = null;
    // A local bank of smoke or fog lying along a curved ledge.
    /** @type {{ center: THREE.Vector3, shape: THREE.Vector4, edges: THREE.Vector4, feather: number } | null} */
    this.airBank = null;

    // Light given off by things in the world (lights.js): a pool of real
    // lights, given each frame to the sources that matter most in the scene
    // being drawn, the nearest casting shadows.
    this.lights = lights || new Lights({ count: CONFIG.lights, shadows: CONFIG.lightShadows });
    // What is drawn into those lights' shadows, and the sun's, from just what
    // is in each one's reach (casters.ts). Shared, like the lights, with
    // another pipeline drawing the same world, which picks them again for
    // where the lights are as it draws.
    this.casters = casters || new Casters();
    if (!casters) for (const l of this.lights.pool) if (l.castShadow) this.casters.light(l);

    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;

    this.occlusion = pass(
      {
        tDepth: { value: null },
        uDepthRes: { value: new THREE.Vector2() },
        uProj: { value: new THREE.Matrix4() },
        uProjInv: { value: new THREE.Matrix4() },
        uRadius: { value: AO_RADIUS },
        uMaxSpan: { value: AO_MAX_SPAN },
      },
      AO_FRAG,
    );
    this.composite = pass(
      {
        ...SKY,
        ...DECK,
        ...UNDER,
        uOrigin: SHARED.uOrigin,
        tColor: { value: null },
        tDepth: { value: null },
        tAO: { value: null },
        tHeat: { value: null },
        uHeat: { value: 0 },
        uAORes: { value: new THREE.Vector2() },
        uAO: { value: 0 },
        uRes: { value: new THREE.Vector2() },
        uNear: { value: 0.1 },
        uFar: { value: 1000 },
        uProjInv: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uOutline: { value: 0 },
        uFogDensity: { value: FOG_DENSITY },
        uFogHeight: { value: FOG_THIN },
        uFogFloor: { value: 0 },
        uFogFar: { value: 250 },
        uFogTint: { value: FOG_TINT },
        uGroundMist: { value: new THREE.Vector3(0, 1, 0) },
        uMistWind: { value: new THREE.Vector2() },
        uBankCenter: { value: new THREE.Vector3() },
        uBankShape: { value: new THREE.Vector4(0, 0, 0, 0) },
        uBankEdges: { value: new THREE.Vector4() },
        uBankFeather: { value: 1 },
        uGlowPos: { value: Array.from({ length: LIGHTS_AIR }, () => new THREE.Vector3()) },
        uGlowCol: { value: Array.from({ length: LIGHTS_AIR }, () => new THREE.Vector3()) },
        uGlowRange: { value: new Array(LIGHTS_AIR).fill(1) },
        uGlowAir: { value: 0 },
      },
      COMPOSITE_FRAG,
    );
    this.behind = pass({ tColor: { value: null }, tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 1000 } }, BEHIND_FRAG);
    this.bloomDown = pass({ tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 } }, BLOOM_DOWN_FRAG);
    this.bloomUp = pass({ tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }, BLOOM_UP_FRAG, { blending: THREE.AdditiveBlending });
    this.final = pass(
      {
        tHDR: { value: null },
        tBloom: { value: null },
        uBloom: { value: 0 },
        uBloomLevels: { value: 1 },
        tAdapt: { value: null },
        uExposure: { value: 1 },
        uPixel: { value: 0 },
        uLevels: { value: this.levels },
        uDither: { value: 1 },
        uVignette: { value: 0 },
      },
      FINAL_FRAG,
    );
    this.upscale = pass(
      {
        tLow: { value: null },
        uLowRes: { value: new THREE.Vector2() },
        uSoft: { value: this.softness },
        uVignette: { value: VIGNETTE },
      },
      UPSCALE_FRAG,
    );
    this.adapt = pass(
      { tSrc: { value: null }, tPrev: { value: null }, uExposure: { value: 1 }, uMost: { value: 1 }, uStep: { value: 1 } },
      ADAPT_FRAG,
    );
    // what the eye has made of the exposure so far: last frame's and this one's
    const one = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    this.adapted = [one(), one()];
    this.adaptFresh = true; // (nothing to go on: start where it wants to be)
    this.screenW = 0; // what it is drawn onto, in device pixels (setSize)
    this.screenH = 0;
    this.lowW = 0;
    this.lowH = 0;
    this.bloomChain = [];
  }

  // Screen size in device pixels.
  setSize(w, h) {
    this.screenW = w;
    this.screenH = h;
    const ps = this.currentPixelSize();
    const lw = Math.max(64, Math.round(w / ps));
    const lh = Math.max(36, Math.round(h / ps));
    if (lw === this.lowW && lh === this.lowH) return;
    this.lowW = lw;
    this.lowH = lh;
    for (const rt of [this.rtScene, this.rtBehind, this.rtAO, this.rtHeat, this.rtHDR, this.rtLow, ...this.bloomChain]) {
      if (!rt) continue;
      rt.depthTexture?.dispose();
      rt.dispose();
    }
    const samples = this.enabled ? 0 : CONFIG.msaa;
    this.rtScene = new THREE.WebGLRenderTarget(lw, lh, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      depthTexture: new THREE.DepthTexture(lw, lh, THREE.UnsignedIntType),
      samples,
    });
    // the copy of it that what's on OVER is drawn over
    this.rtBehind = hdrTarget(lw, lh);
    // the occlusion at half size, once there are pixels enough to spare
    const aoDiv = lh > 400 ? 2 : 1;
    this.rtAO = hdrTarget(Math.ceil(lw / aoDiv), Math.ceil(lh / aoDiv), THREE.NearestFilter);
    // how far the shimmer over anything hot bends each pixel: at half size
    this.rtHeat = hdrTarget(Math.ceil(lw / 2), Math.ceil(lh / 2));
    this.rtHDR = hdrTarget(lw, lh);
    this.rtLow = new THREE.WebGLRenderTarget(lw, lh, {
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
    this.bloomChain = [];
    let bw = lw;
    let bh = lh;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      bw = Math.max(1, Math.floor(bw / 2));
      bh = Math.max(1, Math.floor(bh / 2));
      if (bh < 4) break;
      this.bloomChain.push(hdrTarget(bw, bh));
    }
    this._share();
    this.composite.uniforms.uRes.value.set(lw, lh);
    this.composite.uniforms.uAORes.value.set(this.rtAO.width, this.rtAO.height);
    this.occlusion.uniforms.uDepthRes.value.set(lw, lh);
    this.upscale.uniforms.uLowRes.value.set(lw, lh);
  }

  // What the scene's own shaders are told of what this draws into: the
  // copy of the picture that the water reads, how many lines tall it is,
  // and so how a leaf's cutout is taken (where there are samples, how much
  // of the pixel it covers is how many of them it takes; where there aren't,
  // all or none). Told again before each picture, since more than one
  // pipeline may draw in turn (render/views.ts).
  _share() {
    BEHIND.tBehind.value = this.rtBehind.texture;
    BEHIND.uBehindRes.value.set(this.lowW, this.lowH);
    SHARED.uLines.value = this.lowH;
    SHARED.uAlphaCut.value = this.rtScene.samples > 0 ? 0.02 : 0.5;
  }

  // Look as `other` does (another pipeline, drawing another part of the
  // screen): its settings and its air, as they are now. A setting that
  // changes what the picture is drawn into makes that again.
  lookLike(other) {
    const remake = other.enabled !== this.enabled || other.pixelSize !== this.pixelSize;
    for (const k of LOOK) this[k] = other[k];
    if (remake && this.screenW) {
      this.lowW = 0;
      this.setSize(this.screenW, this.screenH);
    }
  }

  // Let go of everything it draws into, and its passes.
  dispose() {
    for (const rt of [this.rtScene, this.rtBehind, this.rtAO, this.rtHeat, this.rtHDR, this.rtLow, ...this.bloomChain, ...this.adapted]) {
      if (!rt) continue;
      rt.depthTexture?.dispose();
      rt.dispose();
    }
    for (const p of [this.occlusion, this.composite, this.behind, this.bloomDown, this.bloomUp, this.final, this.upscale, this.adapt]) p.dispose();
    this.quad.geometry.dispose();
    this.lowW = this.lowH = 0;
  }

  currentPixelSize() {
    if (!this.enabled) {
      // As fine as the screen, but no finer than sharpLines (and enough
      // columns, in portrait): past that it's drawn smaller and blown up.
      const t = CONFIG.sharpLines;
      return Math.max(1, Math.min(this.screenH / t, this.screenW / (t * 0.9)));
    }
    if (this.pixelSize > 0) return this.pixelSize;
    // Aim for ~pixelTargetHeight art-pixel lines; in portrait, keep enough columns too.
    const t = CONFIG.pixelTargetHeight;
    return Math.max(1, Math.min(this.screenH / t, this.screenW / (t * 0.9)));
  }

  setPixelSize(ps) {
    this.pixelSize = ps;
    this.lowW = 0;
    this.setSize(this.screenW, this.screenH);
  }

  draw(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quad, this.quadCam);
  }

  // fogLight: how much daylight the air holds (the sky's `open`): in a cave
  // the far walls fade into the dark, not into a misty sky. dt: seconds
  // since the last frame, for the eye to adjust over.
  render(scene, camera, exposure, fogLight = 1, dt = 1 / 60) {
    const r = this.renderer;
    const pixel = this.enabled;
    this._share();

    // The lights things give off, to those that matter most from here. (The
    // scene may be slid to an origin near the camera just now, origin.js, and
    // the camera with it: where the eye is in the world is the difference.)
    _eye.copy(camera.position).sub(scene.position);
    this.lights.assign(scene, _eye, SHARED.uTime.value);
    // ...and to each light's shadow, what it can reach from there
    this.casters.update();

    // Everything but what is on OVER...
    const layers = camera.layers.mask;
    r.setRenderTarget(this.rtScene);
    r.clear();
    camera.layers.mask = layers & ~(1 << OVER);
    r.render(scene, camera);
    // ...a copy of it, for the water to see what lies under it and what
    // stands over it...
    const b = this.behind.uniforms;
    b.tColor.value = this.rtScene.texture;
    b.tDepth.value = this.rtScene.depthTexture;
    b.uNear.value = camera.near;
    b.uFar.value = camera.far;
    this.draw(this.behind, this.rtBehind);
    BEHIND.uProj.value.copy(camera.projectionMatrix);
    BEHIND.uAirFog.value = FOG_DENSITY * this.haze;
    // ...and what is on OVER, over it: the same shadows, not drawn again,
    // the same background, not cleared again, and everything where the
    // first go put it (three.js would otherwise work out where every
    // object in the scene is again, for each go)
    const shadows = r.shadowMap.autoUpdate;
    const background = scene.background;
    const clears = r.autoClear;
    const placed = scene.matrixWorldAutoUpdate;
    r.shadowMap.autoUpdate = false;
    scene.background = null;
    r.autoClear = false;
    scene.matrixWorldAutoUpdate = false;
    camera.layers.mask = 1 << OVER;
    try {
      r.setRenderTarget(this.rtScene);
      r.render(scene, camera);
    } finally {
      camera.layers.mask = layers;
      r.autoClear = clears;
      scene.background = background;
      scene.matrixWorldAutoUpdate = placed;
      r.shadowMap.autoUpdate = shadows;
    }

    // The shimmer over anything hot, if there is any here: how far it bends
    // each pixel (haze.js), from the same view, over a clear buffer.
    const heat = !!scene.userData.heat;
    if (heat) {
      const clear = r.getClearAlpha();
      r.getClearColor(_clear);
      r.setClearColor(0x000000, 0);
      r.shadowMap.autoUpdate = false;
      scene.background = null;
      scene.matrixWorldAutoUpdate = false;
      camera.layers.mask = 1 << HEAT;
      try {
        r.setRenderTarget(this.rtHeat);
        r.clear();
        r.render(scene, camera);
      } finally {
        camera.layers.mask = layers;
        scene.background = background;
        scene.matrixWorldAutoUpdate = placed;
        r.shadowMap.autoUpdate = shadows;
        r.setClearColor(_clear, clear);
      }
    }

    if (this.ao > 0) {
      const o = this.occlusion.uniforms;
      o.tDepth.value = this.rtScene.depthTexture;
      o.uProj.value.copy(camera.projectionMatrix);
      o.uProjInv.value.copy(camera.projectionMatrixInverse);
      this.draw(this.occlusion, this.rtAO);
    }

    const u = this.composite.uniforms;
    u.tColor.value = this.rtScene.texture;
    u.tDepth.value = this.rtScene.depthTexture;
    u.tAO.value = this.rtAO.texture;
    u.uAO.value = this.ao;
    u.tHeat.value = this.rtHeat.texture;
    u.uHeat.value = heat ? 1 : 0;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uCamPos.value.copy(camera.position);
    u.uFogTint.value = FOG_TINT * fogLight;
    u.uOutline.value = pixel ? this.outline : 0;
    u.uFogFar.value = this.fogFar || (CONFIG.viewRadius - 0.15) * CONFIG.chunkSize;
    u.uFogDensity.value = FOG_DENSITY * this.haze;
    u.uFogFloor.value = this.fogFloor;
    u.uFogHeight.value = this.fogThin;
    const mist = this.groundMist;
    u.uGroundMist.value.set(mist?.floor ?? 0, mist?.height ?? 1, mist?.density ?? 0);
    if (mist) u.uMistWind.value.copy(mist.wind);
    const bank = this.airBank;
    if (bank) {
      u.uBankCenter.value.copy(bank.center).add(scene.position);
      u.uBankShape.value.copy(bank.shape);
      u.uBankEdges.value.copy(bank.edges);
      u.uBankFeather.value = bank.feather;
    } else {
      u.uBankShape.value.w = 0;
    }
    // the air round the lights, where they are in the picture's frame (slid
    // as the scene is)
    u.uGlowAir.value = FOG_DENSITY * this.haze * GLOW_AIR;
    const glow = this.lights.glow;
    for (let i = 0; i < glow.length; i++) {
      const o = glow[i];
      u.uGlowPos.value[i].set(o.x + scene.position.x, o.y + scene.position.y, o.z + scene.position.z);
      if (o.on) u.uGlowCol.value[i].set(o.r, o.g, o.b);
      else u.uGlowCol.value[i].set(0, 0, 0);
      u.uGlowRange.value[i] = o.range;
    }
    this.draw(this.composite, this.rtHDR);

    // the ever smaller copies, which the bloom and the eye both work from
    const chain = this.bloomChain;
    const d = this.bloomDown.uniforms;
    let src = this.rtHDR;
    for (let i = 0; i < chain.length; i++) {
      d.tSrc.value = src.texture;
      d.uTexel.value.set(1 / src.width, 1 / src.height);
      d.uFirst.value = i === 0 ? 1 : 0;
      this.draw(this.bloomDown, chain[i]);
      src = chain[i];
    }

    // the eye: free to open up by day out in the open, not at night or in a cave
    const [was, now] = this.adapted;
    const sunUp = Math.min(1, Math.max(0, (SKY.uSunDir.value.y - 0.02) / 0.18));
    const a = this.adapt.uniforms;
    a.tSrc.value = src.texture;
    a.tPrev.value = was.texture;
    a.uExposure.value = exposure;
    a.uMost.value = 1 + (ADAPT_UP - 1) * sunUp * sunUp * (3 - 2 * sunUp) * fogLight;
    a.uStep.value = this.adaptFresh ? 1 : 1 - Math.exp(-dt * ADAPT_RATE);
    this.draw(this.adapt, now);
    this.adapted = [now, was];
    this.adaptFresh = false;

    const bloom = this.bloom > 0 && chain.length > 0;
    if (bloom) {
      const up = this.bloomUp.uniforms;
      const auto = r.autoClear;
      r.autoClear = false;
      for (let i = chain.length - 1; i > 0; i--) {
        up.tSrc.value = chain[i].texture;
        up.uTexel.value.set(1 / chain[i].width, 1 / chain[i].height);
        this.draw(this.bloomUp, chain[i - 1]);
      }
      r.autoClear = auto;
    }

    // Straight to the screen when the picture is drawn at the screen's own
    // size; otherwise at its own, and blown up after.
    const direct = !pixel && this.lowW === this.screenW && this.lowH === this.screenH;
    const f = this.final.uniforms;
    f.tHDR.value = this.rtHDR.texture;
    f.tBloom.value = bloom ? chain[0].texture : null;
    f.uBloom.value = bloom ? this.bloom : 0;
    f.uBloomLevels.value = Math.max(1, chain.length);
    f.tAdapt.value = now.texture;
    f.uExposure.value = exposure;
    f.uPixel.value = pixel ? 1 : 0;
    f.uLevels.value = this.levels;
    f.uDither.value = this.dither;
    f.uVignette.value = direct ? VIGNETTE : 0;
    this.draw(this.final, direct ? null : this.rtLow);

    if (!direct) {
      this.upscale.uniforms.uSoft.value = pixel ? this.softness : 1;
      this.upscale.uniforms.tLow.value = this.rtLow.texture;
      this.draw(this.upscale, null);
    }
  }
}
