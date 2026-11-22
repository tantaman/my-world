// The surface of a liquid: water black or clear, blood, pitch, a marsh's
// muck, slush, lava. What a real surface is, a mirror and a window at once
// (as world/waterSurface.js is for the forest's own water), for any liquid,
// by what that liquid does to light:
//
//   absorb    how much of each colour it takes, per metre of it the light
//             comes through (blood takes greens and blues, and passes red;
//             pitch takes everything within a few centimetres)
//   murk      how much it scatters, per metre: how cloudy it is, and so how
//             much of the light on it comes back out of it, in `tint`
//   rough     how blurred its mirror is, and how broad a light's glint on it
//   slow      how thick it is: its ripples are fewer, longer and slower
//   boil      how much breaks its surface: bubbles, rings spreading from them
//   glow      light of its own (HDR): blood near boiling, lava
//   crust     how much of it has cooled into black plates (lava), the glow
//             showing in the cracks between them
//
// It is drawn on the OVER layer (render/pipeline.js), over a copy of the
// picture without it (BEHIND): so it shows what lies under it, bent by its
// ripples and dimmed by the depth the light comes up through, and mirrors
// what stands over it by following the mirrored ray across that copy
// (glsl.js: mirrorGLSL), the sky where that ray leaves the picture. How
// much it mirrors goes by the angle (Fresnel). The lights (render/lights.js)
// glint on it as on anything shiny.
//
//   const mat = createLiquidMaterial(kinds);   // kinds: [{ absorb, murk, ... }]
//   geometry: position (its surface), aDepth (m of it here), aKind (which)
//
// Patterns are drawn from where a pixel is in the world (worldXZ), so they
// stay put when the picture's origin moves (render/origin.js).

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { SHARED, SKY, BEHIND } from './uniforms.js';
import { NOISE_GLSL, NOISE3_GLSL, WORLD_GLSL, WORLD_NOISE_GLSL, SKY_GLSL, SKY_UNIFORMS_GLSL, mirrorGLSL } from './glsl.js';

const MOST = 8; // kinds of liquid a material can tell apart
const MIRROR = { steps: Math.max(0, Math.round(CONFIG.mirror)), first: 0.25, far: 300, refine: CONFIG.mirror < 20 ? 3 : 5 };
MIRROR.grow = Math.pow(MIRROR.far / MIRROR.first, 1 / Math.max(1, MIRROR.steps - 1));
const FAR_SKY = 5.0e4; // m: past this, the copy behind is the sky (render/pipeline.js)
const REFRACT = 0.2; // how far the ripples bend what's under them, for each metre of it

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export function createLiquidMaterial(kinds) {
  const pick = (key, def) => Array.from({ length: MOST }, (_, i) => (kinds[i] && kinds[i][key] !== undefined ? kinds[i][key] : def));
  const uniforms = {
    uTime: SHARED.uTime,
    uOrigin: SHARED.uOrigin,
    ...SKY,
    tBehind: BEHIND.tBehind,
    uBehindRes: BEHIND.uBehindRes,
    uProj: BEHIND.uProj,
    uAbsorb: { value: pick('absorb', [1, 1, 1]).map(v3) },
    uTint: { value: pick('tint', [0.02, 0.02, 0.02]).map(v3) },
    uGlow: { value: pick('glow', [0, 0, 0]).map(v3) },
    uMurk: { value: pick('murk', 0.5) },
    uRough: { value: pick('rough', 0.1) },
    uSlow: { value: pick('slow', 1) },
    uBoil: { value: pick('boil', 0) },
    uCrust: { value: pick('crust', 0) },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aDepth;
        attribute float aKind;
        varying float vDepth;
        varying float vKind;
        varying vec3 vDrawn;`,
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        vDepth = aDepth;
        vKind = aKind;
        vDrawn = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tBehind;
        uniform vec2 uBehindRes;
        uniform mat4 uProj;
        uniform vec3 uAbsorb[${MOST}];
        uniform vec3 uTint[${MOST}];
        uniform vec3 uGlow[${MOST}];
        uniform float uMurk[${MOST}];
        uniform float uRough[${MOST}];
        uniform float uSlow[${MOST}];
        uniform float uBoil[${MOST}];
        uniform float uCrust[${MOST}];
        varying float vDepth;
        varying float vKind;
        varying vec3 vDrawn;
        ${SKY_UNIFORMS_GLSL}
        ${SKY_GLSL}
        ${NOISE_GLSL}
        ${NOISE3_GLSL}
        ${WORLD_GLSL}
        ${WORLD_NOISE_GLSL}
        ${mirrorGLSL({ ...MIRROR, farSky: FAR_SKY })}
        vec2 gTilt;
        float gCrust;
        vec3 gHeat;
        // Rings spreading from where things break the surface: bubbles, drops.
        float rings(vec2 wp, float many, float rate) {
          float m = cellsIn(many);
          vec2 p = wp * (m / PERIOD);
          vec2 c = floor(p);
          vec2 id = wrapCell(c, m);
          float t = fract(uTime * rate * (0.6 + 0.8 * hash12(id + 3.0)) + hash12(id));
          vec2 at = c + 0.25 + 0.5 * vec2(hash12(id + 7.0), hash12(id + 11.0));
          float d = length(p - at) * 2.4;
          return smoothstep(0.08, 0.0, abs(d - t)) * (1.0 - t) * step(0.35, hash12(id + 17.0));
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        int kind = int(vKind + 0.5);
        vec2 wp = worldXZ(vDrawn);
        float far_ = length(vViewPosition);
        float near = 1.0 - smoothstep(40.0, 200.0, far_);
        float slow = uSlow[kind];
        // ripples, longer and slower the thicker it is, with a slow swell
        // under them; and where it boils, rings and heaving
        vec2 flow = vec2(uTime * 0.05, uTime * 0.017) / slow;
        float s1 = wnoise(wp, 0.35 / slow, flow) - 0.5;
        float s2 = wnoise(wp, 0.35 / slow, flow + vec2(0.37, 0.0)) - 0.5;
        float r1 = wnoise(wp, 1.9 / slow, -flow * 2.3) - 0.5;
        float r2 = wnoise(wp, 1.9 / slow, -flow * 2.3 + vec2(0.0, 0.29)) - 0.5;
        gTilt = vec2(s1 - s2, r1 - r2) * vec2(0.6, 0.35) * near + vec2(s1, s2) * 0.1;
        float boil = uBoil[kind];
        if (boil > 0.0) {
          float b = rings(wp, 0.45 / slow, 0.4 / slow) + rings(wp + 13.0, 0.95 / slow, 0.6 / slow) * 0.6;
          float heave = smoothstep(0.5, 0.9, wnoise(wp, 0.8 / slow, vec2(uTime * 0.3, -uTime * 0.2) / slow));
          gTilt += (vec2(b) * 0.6 + vec2(heave - 0.5) * 0.5) * boil;
          gHeat = vec3(heave * 0.6 + b * 0.4) * boil;
        } else gHeat = vec3(0.0);
        // a crust: black plates on it, drifting, their cracks burning
        gCrust = 0.0;
        if (uCrust[kind] > 0.0) {
          // (the plates warped, so they're torn rather than cut)
          vec2 warp = vec2(wnoise(wp, 0.9, flow), wnoise(wp, 0.9, flow + vec2(0.0, 0.41))) - 0.5;
          vec3 c = wcells(wp + flow * 5.0 + warp * 1.6, 0.55);
          float crack = 1.0 - smoothstep(0.0, 0.1 + 0.1 * wnoise(wp, 2.0), c.y - c.x);
          float patchy = wnoise(wp, 0.12, flow * 0.5);
          gCrust = smoothstep(0.25, 0.55, uCrust[kind] + (c.z - 0.5) * 0.5 + (patchy - 0.5) * 0.9) * (1.0 - crack);
          gTilt += (vec2(c.z) - 0.5) * gCrust * 0.4;
        }
        diffuseColor.rgb = uTint[kind];`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(uRough[kind], 0.95, gCrust);')
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        normal = normalize(normal + (viewMatrix * vec4(gTilt.x, 0.0, gTilt.y, 0.0)).xyz * 0.25);`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          vec3 P = -vViewPosition;
          vec3 V = normalize(vViewPosition);
          float cosv = clamp(dot(normal, V), 0.0, 1.0);
          float F = 0.03 + 0.97 * pow(1.0 - cosv, 5.0);
          // through it: what is under it, bent by the ripples, dimmed by how
          // much of it the light came up through, and clouded by what it
          // scatters
          vec2 suv = gl_FragCoord.xy / uBehindRes;
          float zs = -P.z;
          float deep = clamp(vDepth, 0.0, 3.0);
          vec2 ruv = suv + vec2(uProj[0][0], uProj[1][1]) * 0.5 * gTilt * ${REFRACT.toFixed(3)} * deep / zs;
          float zr = behindZ(ruv);
          if (zr < zs) {
            ruv = suv;
            zr = behindZ(suv);
          }
          float through = max(zr - zs, 0.0) * far_ / zs;
          vec3 seen = texture2D(tBehind, ruv).rgb * exp(-through * uAbsorb[kind]);
          float cloud = 1.0 - exp(-through * uMurk[kind]);
          // what it mirrors: what stands over it, where that is in the
          // picture; else the dark overhead. A rough one mirrors less, and
          // blurred.
          vec3 R = reflect(-V, normal);
          vec3 Rw = (vec4(R, 0.0) * viewMatrix).xyz;
          Rw.y = abs(Rw.y);
          vec3 refl = skyGradient(normalize(Rw));
          ${
            MIRROR.steps > 0
              ? `if (R.z < 0.2) {
            vec4 hit = mirrored(P, R);
            if (hit.z > 0.0) refl = mix(refl, texture2D(tBehind, hit.xy).rgb, hit.z);
          }`
              : ''
          }
          float rough = mix(uRough[kind], 1.0, gCrust);
          refl *= 1.0 - rough * 0.85;
          // the light on it, scattered back out of it (the material's own
          // lighting, in its tint), and its glints
          vec3 lit = totalDiffuse * cloud;
          vec3 body = mix(seen, lit, cloud);
          // (at the very edge, where there is hardly any of it over the bed,
          // the bed shows through and it has no light of its own: the shore
          // follows the ground pixel by pixel, not the triangles)
          float edge = smoothstep(0.0, 0.25, through);
          outgoingLight = body * (1.0 - F * edge) + (refl * F + totalSpecular) * edge;
          // and its own light: a glow from under it, brighter where it heaves
          // and in a crust's cracks; the plates themselves black and dull
          vec3 glow = uGlow[kind] * (0.2 + 1.4 * gHeat.r * gHeat.r) * edge;
          outgoingLight = mix(outgoingLight + glow, totalDiffuse * 0.5 + totalSpecular * 0.2, gCrust * edge);
          diffuseColor.a = 1.0;
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => `liquid-v1-${MIRROR.steps}`;
  return mat;
}
