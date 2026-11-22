// Flame: fire as a volume of burning gas rather than a picture of one on a
// card. Each flame is a box (its foot at y = 0, a unit wide and high, scaled
// to the size of the fire), and the shader follows each ray through the box
// in a dozen steps, adding up the light of the gas it passes: a tongue
// shape torn up by turbulence that rises and quickens as it goes, hottest
// low in the middle and cooling to dull red at its tips and edges, the
// colour and brightness of each part from how hot it is (red, then orange,
// yellow, and nearly white, brightening steeply as it goes: a body glows
// with the fourth power of its heat). Seen from any side it is round; seen
// through more of it, brighter; and it doesn't end in a straight cut where
// it meets the ground, but fades into it: what is behind it is read from
// the copy of the scene (render/pipeline.js, BEHIND), so a flame must be on
// the OVER layer (and it is drawn without the depth test: it finds what is
// in front of it, and behind, from that copy).
//
//   const mat = createFlameMaterial();
//   const mesh = new THREE.InstancedMesh(flameBox(), mat, n); mesh.layers.set(OVER);
//
// Instanced, each flame's own seed comes from where it stands; a single one
// has uSeed. uHeat (0..1) is how fierce it is: a dying fire is low, red,
// and slow. `head` and `move` let a flame be carried about (hell/shades.js:
// flames that walk): GLSL added to the top of the vertex shader, and run on
// `vec4 p` (where the instance's vertex is in its mesh) to set `vec3 carry`
// (how far it has been carried) and `float fade` (how much of it is there).
//
// Patterns are in the flame's own box, which never moves: nothing of the
// origin (render/origin.js) comes into it.

import * as THREE from 'three';
import { SHARED, BEHIND } from './uniforms.js';
import { NOISE_GLSL, NOISE3_GLSL } from './glsl.js';

const STEPS = 12; // along each ray through a flame
const GLOW = 5; // how bright the hottest of it is (HDR): enough that the eye's tone curve whitens its heart

// The colour of something glowing at heat t (0 dull red .. 1 white-yellow),
// and as bright as it is: brighter much faster than it gets hotter.
export const HEAT_GLSL = /* glsl */ `
vec3 heatColour(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c = mix(vec3(1.0, 0.12, 0.015), vec3(1.0, 0.42, 0.07), smoothstep(0.0, 0.45, t));
  c = mix(c, vec3(1.0, 0.72, 0.32), smoothstep(0.4, 0.8, t));
  c = mix(c, vec3(1.0, 0.92, 0.75), smoothstep(0.8, 1.0, t));
  return c * (t * t * t * t * 0.9 + t * 0.1);
}
`;

// The box a flame fills: its foot at y = 0, a unit across and high.
export function flameBox() {
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 0.9);
  return g;
}

export function createFlameMaterial({ head = '', move = '' } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: SHARED.uTime,
      uHeat: { value: 1 },
      uSeed: { value: 0 },
      tBehind: BEHIND.tBehind,
      uBehindRes: BEHIND.uBehindRes,
    },
    vertexShader: /* glsl */ `
      uniform float uSeed;
      varying vec3 vBox;      // this vertex, in the flame's box
      varying vec3 vEye;      // the eye, in the flame's box
      varying float vSeed;
      varying float vFade;
      varying float vDepth;   // how far off this vertex is (view depth, m)
      ${head}
      void main() {
        vec4 p = vec4(position, 1.0);
        mat4 inst = mat4(1.0);
        #ifdef USE_INSTANCING
          inst = instanceMatrix;
        #endif
        p = inst * p;
        vec3 carry = vec3(0.0);
        float fade = 1.0;
        ${move}
        p.xyz += carry;
        #ifdef USE_INSTANCING
          vSeed = fract(inst[3].x * 0.37 + inst[3].z * 0.71) * 50.0;
        #else
          vSeed = uSeed;
        #endif
        vFade = fade;
        vBox = position;
        // the eye in the box: back through the mesh, the carrying, the instance
        vec4 eye = inverse(modelMatrix) * vec4(cameraPosition, 1.0);
        eye.xyz -= carry;
        vEye = (inverse(inst) * eye).xyz;
        vec4 mv = modelViewMatrix * p;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uHeat;
      uniform sampler2D tBehind;
      uniform vec2 uBehindRes;
      varying vec3 vBox;
      varying vec3 vEye;
      varying float vSeed;
      varying float vFade;
      varying float vDepth;
      ${NOISE_GLSL}
      ${NOISE3_GLSL}
      ${HEAT_GLSL}

      // How much burning gas there is at p (in the box), and how hot it is.
      vec2 gas(vec3 p) {
        float y = p.y;
        float t = uTime * (0.7 + 0.6 * uHeat);
        // the gas rises, faster as it goes, and twists
        vec3 q = vec3(p.x * 3.2, y * 2.2 - t * 2.1, p.z * 3.2) + vSeed;
        vec3 warp = vec3(vnoise3(q * 0.8 + 3.0), vnoise3(q * 0.8 - 5.0), vnoise3(q * 0.8 + 11.0)) - 0.5;
        float n = vnoise3(q + warp * 2.2) * 0.6 + vnoise3(q * 2.7 + warp * 1.3) * 0.4;
        // tongues: the edge goes in and out round the flame, the lobes
        // drifting up and round as they rise
        vec2 lean = (vec2(vnoise3(vec3(t * 0.9, vSeed, 1.0)), vnoise3(vec3(vSeed, t * 0.9, 2.0))) - 0.5) * 0.3 * y * y;
        vec2 xz = p.xz - lean;
        float a = atan(xz.y, xz.x);
        float lobes = vnoise3(vec3(cos(a) * 1.6, sin(a) * 1.6, y * 2.5 - t * 1.4) + vSeed * 0.3);
        float r = length(xz) * 2.0;
        float wide = pow(1.0 - y, 1.3) * (0.5 + 0.5 * smoothstep(0.0, 0.2, y)) * (0.8 + 0.35 * uHeat) * (0.7 + 0.6 * lobes);
        float d = wide - r + (n - 0.5) * (0.35 + 1.6 * y);
        float body = smoothstep(0.0, 0.07, d) * smoothstep(0.0, 0.05, y);
        // hottest low in the middle; cooler outward and upward
        float heat = clamp(d * 1.8 + 0.3 - y * 0.75, 0.0, 1.0) * (0.55 + 0.45 * uHeat);
        return vec2(body, heat);
      }

      void main() {
        // the ray from the eye through this pixel of the box: eye + dir * u,
        // u = 1 here
        vec3 dir = vBox - vEye;
        vec3 inv = 1.0 / dir;
        vec3 ta = (vec3(-0.5, 0.0, -0.5) - vEye) * inv;
        vec3 tb = (vec3(0.5, 1.0, 0.5) - vEye) * inv;
        vec3 lo = min(ta, tb);
        vec3 hi = max(ta, tb);
        float u0 = max(max(max(lo.x, lo.y), lo.z), 0.0);
        float u1 = min(min(hi.x, hi.y), hi.z);
        // no further than whatever is behind it (it fades into the ground)
        float behind = texture2D(tBehind, gl_FragCoord.xy / uBehindRes).a;
        float uScene = behind / max(vDepth, 1.0e-3);
        u1 = min(u1, uScene);
        if (u1 <= u0) discard;
        float du = (u1 - u0) / ${STEPS}.0;
        float jitter = hash12(gl_FragCoord.xy + fract(uTime) * 61.0);
        float len = length(dir) * du;
        vec3 sum = vec3(0.0);
        for (int i = 0; i < ${STEPS}; i++) {
          vec3 p = vEye + dir * (u0 + (float(i) + jitter) * du);
          vec2 g = gas(p);
          if (g.x > 0.001) sum += heatColour(g.y) * g.x * len;
        }
        // (and it softens where the ground cuts across it)
        float meet = smoothstep(0.0, 0.25, (uScene - u0) * vDepth);
        vec3 col = sum * ${GLOW.toFixed(1)} * vFade * meet;
        if (col.r + col.g + col.b < 1.0e-4) discard;
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
}
