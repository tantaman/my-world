// Skin: what anything alive (or once alive) is drawn with, and what it
// wears and carries. A hide, a horn, an iron hook, a wing's membrane, a crust
// with fire under it: each is a kind of surface, said vertex by vertex, and
// drawn pixel by pixel from where on the thing a pixel is, so there's no
// texture anywhere.
//
//   const mat = createSkinMaterial({ hot: true, baked: true });
//   mesh = new THREE.Mesh(geometry, mat);
//
// What it reads from the geometry:
//   color     what colour it is (linear light, as everything is)
//   aSurf     (with baked) x: what kind of surface (SURF, below); y: how big
//             the thing is, as so many men (a giant's veins are a giant's)
//   aOcc      (with baked) how open to the light round it a spot is, 0..1:
//             the creases between muscles, under the jaw, in the ear
//   aThin     (with baked) how thick it is through there, m: light comes
//             through an ear, a wing, a finger
//   aHot      (with hot) how hot, 0..1: an eye like a coal, a mouth full of
//             fire, the seams of a crust
// Without `baked` the whole of it is flesh, open and thick, man-sized.
//
// What makes it look like skin rather than painted plastic:
//   - its small shape, drawn (render/glsl.js: relief): pores, the fine
//     crumple of skin, veins standing out, the rings of a horn, pitted iron,
//     plates of crust. Each fades as it comes down to a pixel or two.
//   - the light: skin is lit from inside as much as off its face. Light that
//     goes in on the lit side comes out a little way round, so the edge of
//     the shadow on it is soft and red; and where it is thin, light comes
//     through from behind, red with the blood it went through.
//   - wet: a thin clear layer over it that shines (clearcoat), most of all in
//     the creases, where it gathers.
//   - creases are dark: the light round it doesn't get into them (aOcc).
//
// Patterns are drawn from where a pixel is in the thing's own frame (its
// mesh's, or its instance's), which never moves: nothing of the origin
// (render/origin.js) comes into it.

import * as THREE from 'three';
import { SHARED } from './uniforms.js';
import { NOISE_GLSL, NOISE3_GLSL, RELIEF_GLSL } from './glsl.js';

// The kinds of surface (aSurf.x).
export const SURF = {
  flesh: 0, // a hide: pores, veins, mottle, wet in the creases
  horn: 1, // horn, bone, a claw, a tooth: ringed, hard, a little glossy
  iron: 2, // wrought iron: dark metal, pitted, rusting
  wood: 3, // a pole, a club: grain
  cloth: 4, // cloth, rags, coarse hair: rough, fibrous
  membrane: 5, // a wing: thin, veined, the light comes through it
  molten: 6, // a crust over fire: black plates, burning seams
  scales: 7, // a serpent's, a dragon's: overlapping plates
};

const SSS = {
  colour: [1.0, 0.32, 0.2], // how light that has been through flesh is tinted: by blood
  wrap: 0.55, // how far round past the edge of the shadow light gets in skin
  depth: 0.035, // m: light through flesh falls to a third in this much of it
};

export const SKIN_GLSL = /* glsl */ `
${NOISE3_GLSL}
${RELIEF_GLSL}
// What a pixel of skin is, worked out before it is lit.
float gRelief;     // its height over the smooth surface, m
float gRough;
float gMetal;
float gWet;        // the clear wet layer over it, 0..1
vec3 gSub;         // the colour light comes out of it with (0: none)
float gWrap;       // how far round the edge of the shadow light gets in
float gThin;       // m through it, here
vec3 gGlow;        // light of its own

// p: where, in a man's metres (the thing's own frame over its size); k: its
// kind; col: its colour, changed here; open: aOcc; hot: aHot
void skinSurface(vec3 p, int k, inout vec3 col, float open, float hot, float thin, float body) {
  float f1 = fine(p, 0.04);   // a few centimetres: veins, plates
  float f2 = fine(p, 0.008);  // the fine crumple
  float f3 = fine(p, 0.0025); // pores
  float mott = fbm3(p * 7.0);
  gRelief = 0.0;
  gRough = 0.6;
  gMetal = 0.0;
  gWet = 0.0;
  gSub = vec3(0.0);
  gWrap = 0.0;
  gThin = thin;
  gGlow = vec3(0.0);
  float crease = 1.0 - open;
  if (k == ${SURF.flesh} || k == ${SURF.membrane}) {
    // a hide: a net of creases over it, as a hide that has been worked has,
    // its plates puffed between them; ridged wrinkles finer than that;
    // veins standing out, darker and bluer; and pores
    // (the creases are fine: they go before they'd shimmer)
    float fc = fine(p, 0.012);
    vec3 c = fc > 0.0 ? cells3(p * vec3(34.0, 26.0, 34.0) + (fbm3(p * 9.0) - 0.5) * 1.5) : vec3(0.0, 1.0, 0.0);
    float plate = mix(1.0, smoothstep(0.0, 0.22, c.y - c.x), smoothstep(0.35, 0.7, fbm3(p * 4.0 + 9.0)) * 0.8 * fc);
    float wr = 1.0 - abs(vnoise3(p * vec3(70.0, 22.0, 70.0)) * 2.0 - 1.0);
    float vn = fbm3(p * 5.0 + vec3(3.1));
    float vein = (1.0 - smoothstep(0.0, 0.05, abs(vn - 0.5))) * smoothstep(0.3, 0.6, fbm3(p * 2.3 - 7.0)) * f1;
    float crumple = f2 > 0.0 ? (vnoise3(p * 160.0) - 0.5) * f2 : 0.0;
    float pore = f3 > 0.0 ? (1.0 - smoothstep(0.0, 0.25, cells3(p * 380.0).x)) * f3 : 0.0;
    float lump = fbm3(p * 11.0);
    gRelief = (plate - 1.0) * 0.0012 * f1 + (lump - 0.5) * 0.004 * f1 + wr * wr * 0.0009 * f2 + vein * 0.0022 + crumple * 0.0004 - pore * 0.00025;
    col *= (0.7 + 0.5 * mott) * mix(0.75, 1.0, plate);
    col = mix(col, col * vec3(1.25, 0.8, 0.75), smoothstep(0.55, 0.8, fbm3(p * 1.7 + 4.0)) * 0.6);
    col = mix(col, col * vec3(0.5, 0.45, 0.7), vein * 0.6);
    col *= 1.0 - 0.15 * pore;
    // drier on what stands out, wet in the creases and in patches
    float damp = smoothstep(0.3, 0.75, fbm3(p * 3.1 + 17.0));
    gRough = 0.66 + 0.12 * mott - 0.16 * crease - 0.14 * damp - 0.1 * (1.0 - plate);
    gWet = (0.05 + 0.25 * damp) * (0.4 + 0.6 * crease) + 0.25 * crease + 0.15 * (1.0 - plate) * damp;
    gSub = vec3(${SSS.colour.map((c) => c.toFixed(3)).join(', ')});
    gWrap = ${SSS.wrap.toFixed(2)};
    if (k == ${SURF.membrane}) {
      // a wing: a net of veins over thin skin
      vec3 c = cells3(p * 9.0);
      float net = (1.0 - smoothstep(0.0, 0.05, c.y - c.x)) * f1;
      gRelief += net * 0.0015;
      col = mix(col, col * vec3(0.6, 0.35, 0.3), net * 0.5);
      gThin = min(thin, 0.006);
      gWet = 0.35;
    }
  } else if (k == ${SURF.horn}) {
    // rings of growth and long fine streaks
    float ring = vnoise3(p * vec3(12.0, 70.0, 12.0));
    float streak = vnoise3(p * vec3(90.0, 8.0, 90.0));
    gRelief = (ring - 0.5) * 0.0015 * f1 + (streak - 0.5) * 0.0004 * f2;
    col *= 0.75 + 0.5 * ring * (0.7 + 0.3 * mott);
    gRough = 0.32 + 0.2 * streak;
    gWet = 0.2;
    gSub = vec3(1.0, 0.6, 0.3);
    gWrap = 0.2;
  } else if (k == ${SURF.iron}) {
    // dark metal, pitted, with rust coming through in patches
    float rust = smoothstep(0.45, 0.75, fbm3(p * 6.0 + 11.0));
    float pit = f2 > 0.0 ? (1.0 - smoothstep(0.0, 0.3, cells3(p * 70.0).x)) * f2 : 0.0;
    gRelief = -pit * 0.0006 + (mott - 0.5) * 0.0008 * f1;
    col = mix(vec3(0.05, 0.05, 0.055) * (0.8 + 0.4 * mott), vec3(0.16, 0.06, 0.025) * (0.6 + 0.6 * mott), rust);
    gMetal = 0.85 * (1.0 - rust);
    gRough = mix(0.38, 0.88, rust) + 0.15 * pit;
  } else if (k == ${SURF.wood}) {
    float grain = vnoise3(p * vec3(60.0, 3.0, 60.0) + mott);
    gRelief = (grain - 0.5) * 0.0008 * f2;
    col *= 0.7 + 0.6 * grain;
    gRough = 0.8;
  } else if (k == ${SURF.cloth}) {
    float fib = vnoise3(p * vec3(260.0, 30.0, 260.0));
    gRelief = (fib - 0.5) * 0.0005 * f3 + (mott - 0.5) * 0.002 * f1;
    col *= 0.75 + 0.45 * fib * (0.6 + 0.4 * mott);
    gRough = 0.95;
    gWrap = 0.4;
    gSub = vec3(1.0);
  } else if (k == ${SURF.molten}) {
    // black plates of crust, and the fire in the seams between them, brighter
    // where it is hotter, breathing
    vec3 c = cells3(p * 6.0);
    float seam = 1.0 - smoothstep(0.0, 0.07 + 0.06 * hot, c.y - c.x);
    vec3 c2 = f2 > 0.0 ? cells3(p * 23.0 + 5.0) : vec3(0.0, 1.0, 0.0);
    float fine_ = 1.0 - smoothstep(0.0, 0.05, c2.y - c2.x);
    float breathe = 0.65 + 0.35 * sin(uTime * (1.1 + c.z) + c.z * 40.0);
    gRelief = (1.0 - seam) * 0.004 * f1 + (c.z - 0.5) * 0.002 * f1 - fine_ * 0.0008 * f2;
    col = mix(col * (0.5 + 0.5 * mott), vec3(0.03, 0.02, 0.018), 0.6);
    float heat = max(seam, fine_ * 0.45 * f2) * (0.35 + 0.65 * hot) * breathe;
    gGlow += vec3(1.0, 0.3, 0.05) * heat * heat * 6.0 + vec3(1.0, 0.7, 0.3) * pow(heat, 4.0) * 6.0;
    gRough = 0.85 - 0.4 * seam;
    gSub = vec3(1.0, 0.25, 0.08) * hot;
    gWrap = 0.3;
  } else if (k == ${SURF.scales}) {
    vec3 c = cells3(p * 38.0);
    float plate = smoothstep(0.0, 0.12, c.y - c.x);
    gRelief = plate * 0.0012 * f1 - (1.0 - plate) * 0.0005 * f1;
    col *= mix(0.55, 1.0, plate) * (0.85 + 0.3 * c.z);
    gRough = 0.35 + 0.3 * (1.0 - plate);
    gWet = 0.35;
    gSub = vec3(1.0, 0.5, 0.25);
    gWrap = 0.25;
  }
  // a giant's pores are a giant's
  gRelief *= body;
  // creases are dark: little of the light round it gets in
  col *= 0.55 + 0.45 * open;
  // anything hot glows (an eye like a coal); and the hide's own glow, if hot
  if (k != ${SURF.molten}) gGlow += vec3(1.0, 0.22, 0.04) * hot * (0.85 + 0.3 * vnoise3(p * 3.0 + uTime * 1.3)) * 3.0;
}
`;

// Lighting for skin: the physical model, then the light that goes in and
// comes out further round, and the light that comes through thin parts.
const SKIN_LIGHT_GLSL = /* glsl */ `
void RE_Direct_Skin(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  if (gSub.r + gSub.g + gSub.b <= 0.0) return;
  float nl = dot(geometryNormal, directLight.direction);
  vec3 alb = material.diffuseColor;
  // past the edge of the shadow, a little way round: soft, and red (as
  // much as it is pale: little comes back out of a dark hide)
  float round_ = max(0.0, (nl + gWrap) / (1.0 + gWrap)) - max(nl, 0.0);
  // through from behind, where it is thin
  vec3 h = normalize(directLight.direction + geometryNormal * 0.35);
  float back = pow(saturate(dot(geometryViewDir, -h)), 3.0) * exp(-gThin / ${SSS.depth.toFixed(3)});
  reflectedLight.directDiffuse += directLight.color * gSub * (alb * round_ * 1.2 + (0.04 + alb) * back * 1.6) * RECIPROCAL_PI;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Skin
`;

// Put skin into a physical material's shader (from onBeforeCompile), for a
// material that wants other things of its own besides (shades.js).
//   hot     reads aHot
//   baked   reads aSurf, aOcc, aThin
//   noise   false if the shader already has NOISE_GLSL (glsl.js) in its
//           fragment part
// (When instanced, patterns go by the instance's frame.)
export function skinShader(shader, { hot = false, baked = false, noise = true } = {}) {
  shader.uniforms.uTime = SHARED.uTime;
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
      ${hot ? 'attribute float aHot;' : ''}
      ${baked ? 'attribute vec2 aSurf; attribute float aOcc; attribute float aThin;' : ''}
      varying vec3 vSkinAt;
      varying vec4 vSkin; // kind, body, open, thin
      varying float vSkinHot;`,
    )
    .replace(
      '#include <fog_vertex>',
      `#include <fog_vertex>
      #ifdef USE_INSTANCING
        vSkinAt = (instanceMatrix * vec4(transformed, 1.0)).xyz;
      #else
        vSkinAt = transformed;
      #endif
      ${baked ? 'vSkin = vec4(aSurf.x, max(aSurf.y, 0.05), aOcc, aThin);' : 'vSkin = vec4(0.0, 1.0, 1.0, 1.0);'}
      vSkinHot = ${hot ? 'aHot' : '0.0'};`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
      uniform float uTime;
      varying vec3 vSkinAt;
      varying vec4 vSkin;
      varying float vSkinHot;
      ${noise ? NOISE_GLSL : ''}
      ${SKIN_GLSL}`,
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      skinSurface(vSkinAt / vSkin.y, int(vSkin.x + 0.5), diffuseColor.rgb, vSkin.z, vSkinHot, vSkin.w, vSkin.y);`,
    )
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
    .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = gMetal;')
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      normal = relief(normal, -vViewPosition, gRelief);`,
    )
    .replace(
      '#include <lights_physical_fragment>',
      `#include <lights_physical_fragment>
      #ifdef USE_CLEARCOAT
        material.clearcoat = gWet;
        material.clearcoatRoughness = 0.18;
      #endif`,
    )
    .replace(
      '#include <lights_physical_pars_fragment>',
      `#include <lights_physical_pars_fragment>
      ${SKIN_LIGHT_GLSL}`,
    )
    .replace(
      '#include <aomap_fragment>',
      `#include <aomap_fragment>
      // the light from all round barely gets into a crease, and what comes
      // straight from a light gets in a little less
      reflectedLight.indirectDiffuse *= vSkin.z;
      reflectedLight.indirectSpecular *= vSkin.z * vSkin.z;
      reflectedLight.directDiffuse *= mix(1.0, vSkin.z, 0.35);`,
    )
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      totalEmissiveRadiance += gGlow;`,
    );
  return shader;
}

// A material for skin. With `side` for something seen from both sides (a
// wing). `wet` is how wet it is overall (it is wetter in its creases).
export function createSkinMaterial({ hot = false, baked = false, side = THREE.FrontSide } = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.6,
    metalness: 0,
    clearcoat: 1, // (how much, pixel by pixel: gWet)
    clearcoatRoughness: 0.2,
    side,
  });
  mat.onBeforeCompile = (shader) => skinShader(shader, { hot, baked });
  mat.customProgramCacheKey = () => `skin-${hot ? 1 : 0}${baked ? 1 : 0}`;
  return mat;
}
