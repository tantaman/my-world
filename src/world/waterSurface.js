// The surface of ponds, lakes, streams and rivers.
//
// Each chunk gets one water mesh, built from its height grid and the water
// grids the chunk worker produced (see chunkGen.js). A cell of the grid gets
// water if any of its corners is under the water level where water may stand,
// so the surface runs a little way up under the banks and the terrain hides
// the rest. Built on the main thread from the live heights, it's rebuilt when
// you dig: cut a hole beside a lake or a stream and it fills to their level.
//
// The material is see-through and writes depth (so fog and outlines treat it
// as the surface it is). It reflects the sky, with a dark band where the
// reflection would catch the treeline, glints in the sun, and ripples in the
// wind. Running water is drawn out into streaks along the current and
// carries flecks of foam and bubbles with it, more below a cascade, so you
// can see which way it goes and how fast. It turns white on cascades, along
// the shore and around your legs, and where it runs past you it opens into a
// wake. The bed beneath is darkened with depth by the terrain shader
// (materials.js), so shallow water shows its stones.
//
// The forest's own sea (sea.js) rises and falls in a slow swell and is bluer
// than a lake; it breaks white along the shore, as a real place's sea does,
// by the foam it carries. Seen from underneath, any water is a ceiling of
// moving light: the sky through a bright round window straight overhead, and
// beyond it, the water mirrored back down (Snell's window).

import * as THREE from 'three';
import { NOISE_GLSL, WORLD_GLSL, WORLD_NOISE_GLSL, SKY_GLSL, SKY_UNIFORMS_GLSL, UNDER_GLSL, PERIOD, wave } from '../render/glsl.js';
import { SHARED, SKY, WADE, UNDER } from '../render/uniforms.js';
import { NO_WATER } from './water.js';
import { WATER_STRIDE as WS } from './chunkGen.js';


const UNSET = NO_WATER * 0.5;

// The wind's ripples on still water are two layers of noise, each on a grid
// turned (by ROT1 and ROT2 in the shader: a 3-4-5 and a 7-24-25 triangle) so
// that neither grid shows. For a turned grid to repeat on the world's period
// (render/glsl.js) the cells across it must come to a multiple of 5, or of
// 25, and the lattice then wraps a fifth, or a twenty-fifth, of the way.
// → the GLSL arguments of rippleGrad for a first layer of about f cells to
// the metre and a second k times finer: its scale, and the two wraps.
function turned(f, k) {
  const n1 = Math.round((f * PERIOD) / 5) * 5;
  const n2 = Math.round((f * k * PERIOD) / 25) * 25;
  const lit = (v) => (Number.isInteger(v) ? v.toFixed(1) : v.toPrecision(9));
  return { scale: lit(n1 / PERIOD), args: `${lit(n1 / 5)}, ${lit(n2 / n1)}, ${lit(n2 / 25)}` };
}
const RUFFLE_A = turned(0.9, 2.3);
const RUFFLE_B = turned(0.37, 2.3);
const LEAVES = turned(0.35, 2.9);
// Running water's patterns are drawn in a frame that turns with the current,
// which can't repeat on any period: their lattice just wraps far away.
const LOOSE = '4096.0, 2.3, 4096.0';

// The sea's swell: a few long, low waves running in from different ways
// (which way, waves per 10 m, and how high, m), each brought round on the
// world's period (render/glsl.js) so it never jumps: as a height (m) and its
// slope, at world place p.
const SWELLS = [
  [0.8, 0.6, 0.45, 0.16],
  [-0.3, 0.95, 0.7, 0.09],
  [0.95, -0.3, 1.05, 0.05],
];
const SWELL_GLSL = /* glsl */ `
vec3 swell(vec2 p, float t) {
  vec3 o = vec3(0.0); // height, d/dx, d/dz
${SWELLS.map(([dx, dz, n, h]) => {
  const k = n * 0.6283;
  const kx = wave(dx * k);
  const kz = wave(dz * k);
  return `  { float ph = ${kx} * p.x + ${kz} * p.y - t * ${Math.sqrt(9.8 * k).toFixed(6)}; o.x += ${h.toFixed(3)} * sin(ph); o.yz += ${h.toFixed(3)} * cos(ph) * vec2(${kx}, ${kz}); }`;
}).join('\n')}
  return o;
}
`;

// Water geometry for a chunk, or null if it has none. Positions are local to
// the chunk, like its terrain mesh.
export function buildWaterGeometry(ch) {
  const { n, step, heights: H, wLevel: L, wData: D } = ch;
  if (!ch.hasWater) return null;
  const N = n + 1;
  const wet = (k) => D[k * WS] > 0.5 && H[k] < L[k] - 0.002;
  const map = new Int32Array(N * N).fill(-1);
  const cells = [];
  let count = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * N + i;
      if (!(wet(a) || wet(a + 1) || wet(a + N) || wet(a + N + 1))) continue;
      cells.push(a);
      for (const k of [a, a + 1, a + N, a + N + 1]) if (map[k] < 0) map[k] = count++;
    }
  }
  if (!count) return null;

  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const flow = new Float32Array(count * 2);
  const foam = new Float32Array(count);
  const depth = new Float32Array(count);
  const sky = new Float32Array(count * 2); // leaves overhead, how open it is
  // A corner with no water level of its own (rare: a coarse cell straddling
  // the edge of a stream's valley) borrows the highest one around it.
  const level = (i, j) => {
    i = Math.min(n, Math.max(0, i));
    j = Math.min(n, Math.max(0, j));
    const k = j * N + i;
    if (L[k] > UNSET) return L[k];
    let best = UNSET;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii > n || jj > n) continue;
        const l = L[jj * N + ii];
        if (l > best) best = l;
      }
    }
    return best > UNSET ? best : H[k];
  };
  for (let k = 0; k < N * N; k++) {
    const m = map[k];
    if (m < 0) continue;
    const i = k % N;
    const j = (k - i) / N;
    const y = level(i, j);
    pos[m * 3] = i * step;
    pos[m * 3 + 1] = y;
    pos[m * 3 + 2] = j * step;
    // the surface tilts where it runs down a step
    const nx = level(i - 1, j) - level(i + 1, j);
    const nz = level(i, j - 1) - level(i, j + 1);
    const l = Math.hypot(nx, 2 * step, nz);
    nor[m * 3] = nx / l;
    nor[m * 3 + 1] = (2 * step) / l;
    nor[m * 3 + 2] = nz / l;
    flow[m * 2] = D[k * WS + 1];
    flow[m * 2 + 1] = D[k * WS + 2];
    foam[m] = D[k * WS + 3];
    depth[m] = y - H[k];
    // leaves overhead, where the woods close in over narrow water
    sky[m * 2] = ch.forest[k] * (1 - D[k * WS + 4]);
    sky[m * 2 + 1] = D[k * WS + 4];
  }
  const idx = new Uint16Array(cells.length * 6);
  let w = 0;
  for (const a of cells) {
    const A = map[a];
    const B = map[a + 1];
    const C = map[a + N];
    const Dd = map[a + N + 1];
    idx[w++] = A;
    idx[w++] = C;
    idx[w++] = B;
    idx[w++] = B;
    idx[w++] = C;
    idx[w++] = Dd;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
  geo.setAttribute('aFoam', new THREE.BufferAttribute(foam, 1));
  geo.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
  geo.setAttribute('aSky', new THREE.BufferAttribute(sky, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

export function createWaterMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide, // so it can be seen from under it
    // The shader works out what light the water itself sends back (scatter,
    // glints, reflected sky) and how much of the bed it hides (alpha):
    // out = water + bed × (1 − alpha).
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SKY, WADE, UNDER, { uPlayer: SHARED.uPlayer, uWind: SHARED.uWind, uOrigin: SHARED.uOrigin });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 aFlow;
        attribute float aFoam;
        attribute float aDepth;
        attribute vec2 aSky;
        uniform float uTime;
        uniform float uSea;
        varying vec2 vFlow;
        varying float vFoam;
        varying float vDepth;
        varying vec2 vSky;
        varying vec3 vWPos;
        varying float vSea;
        ${WORLD_GLSL}
        ${SWELL_GLSL}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // the sea's swell, lower over the shallows
        vSea = abs(position.y - uSea) < 0.02 ? 1.0 : 0.0;
        if (vSea > 0.5) {
          vec2 wxz = worldXZ((modelMatrix * vec4(position, 1.0)).xyz);
          transformed.y += swell(wxz, uTime).x * mix(0.35, 1.0, smoothstep(0.3, 3.0, aDepth));
        }`,
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        vFlow = aFlow;
        vFoam = aFoam;
        vDepth = aDepth;
        vSky = aSky;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${SKY_UNIFORMS_GLSL}
        uniform vec3 uPlayer;
        uniform float uWade;
        uniform vec2 uWadeFlow;
        uniform float uWind;
        uniform float uSea;
        uniform float uUnderSea;
        varying vec2 vFlow;
        varying float vFoam;
        varying float vDepth;
        varying vec2 vSky; // x: leaves overhead, y: how open it is
        varying vec3 vWPos; // as drawn: see worldXZ
        varying float vSea; // 1 on the sea
        ${NOISE_GLSL}
        ${WORLD_GLSL}
        ${WORLD_NOISE_GLSL}
        ${SKY_GLSL}
        ${UNDER_GLSL}
        ${SWELL_GLSL}
        // Smooth value noise (quintic, so its slope has no creases) with its
        // gradient: (value, d/dx, d/dy). Its lattice repeats every m cells.
        vec3 vnoiseD(vec2 p, float m) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
          vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
          float a = hash12(wrapCell(i, m));
          float b = hash12(wrapCell(i + vec2(1.0, 0.0), m));
          float c = hash12(wrapCell(i + vec2(0.0, 1.0), m));
          float d = hash12(wrapCell(i + vec2(1.0, 1.0), m));
          float k4 = a - b - c + d;
          return vec3(a + (b - a) * u.x + (c - a) * u.y + k4 * u.x * u.y, du * (vec2(b - a, c - a) + k4 * u.yx));
        }
        // gradient of the ripple field (per unit of p): two layers, turned
        // against each other so the grid they're made on doesn't show. The
        // second is k2 times finer; m1 and m2 are where their lattices wrap
        // (see turned(), above).
        const mat2 ROT1 = mat2(0.8, 0.6, -0.6, 0.8);
        const mat2 ROT2 = mat2(0.28, -0.96, 0.96, 0.28);
        vec2 rippleGrad(vec2 p, float m1, float k2, float m2) {
          vec2 g1 = vnoiseD(ROT1 * p, m1).yz * ROT1;
          vec2 g2 = vnoiseD(ROT2 * p * k2 + 7.1, m2).yz * ROT2;
          return g1 * 0.65 + g2 * (0.35 * k2);
        }
        // a scatter of small specks, one at most to a cell, this many of them
        float fleck(vec2 p, float many) {
          vec2 c = floor(p);
          vec2 f = fract(p) - 0.25 - 0.5 * vec2(hash12(c + 3.1), hash12(c + 7.7));
          return step(hash12(c), many) * (1.0 - smoothstep(0.07, 0.15, length(f)));
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 wp = worldXZ(vWPos);
        float depth = max(vDepth, 0.0);
        float speed = length(vFlow);
        float still = 1.0 - smoothstep(0.06, 0.3, speed);
        // a frame that runs with the current: x downstream, y across
        vec2 fdir = speed > 1e-4 ? vFlow / speed : vec2(1.0, 0.0);
        vec2 fper = vec2(-fdir.y, fdir.x);
        vec2 fp = vec2(dot(wp, fdir), dot(wp, fper));

        // Running water is carried along by the current: two copies of each
        // pattern, half a cycle apart, fade in and out so it never smears.
        const float CYC = 1.6;
        float ph0 = fract(uTime / CYC);
        float ph1 = fract(uTime / CYC + 0.5);
        float wt0 = 1.0 - abs(2.0 * ph0 - 1.0);
        vec2 run0 = fp - vec2(speed * ph0 * CYC, 0.0);
        vec2 run1 = fp - vec2(speed * ph1 * CYC, 0.0) + vec2(5.3, 2.9);
        // ripples, and over them streaks drawn out along the current, the
        // faster it runs the longer and finer
        vec2 g0 = rippleGrad(run0 * 1.1, ${LOOSE});
        vec2 g1 = rippleGrad(run1 * 1.1, ${LOOSE});
        vec2 gr = g0.x * fdir + g0.y * fper;
        gr = mix(g1.x * fdir + g1.y * fper, gr, wt0) * 1.1;
        float stretch = 1.0 + 1.5 * smoothstep(0.3, 2.0, speed);
        vec2 sk = vec2(0.5 / stretch, 2.2);
        vec2 s0 = rippleGrad(run0 * sk, ${LOOSE});
        vec2 s1 = rippleGrad(run1 * sk + 0.37, ${LOOSE});
        vec2 gs = mix(s1, s0, wt0);
        gs = (gs.x * sk.x) * fdir + (gs.y * sk.y) * fper;
        vec2 gRun = (gr * 0.6 + gs * 0.5) * (0.05 + 0.035 * min(speed, 2.5));
        // Still water: the wind ruffles it in two drifting layers.
        vec2 gStill = rippleGrad(wp * ${RUFFLE_A.scale} + vec2(uTime * 0.21, uTime * 0.08), ${RUFFLE_A.args}) * 0.9 * 0.03
                    + rippleGrad(wp * ${RUFFLE_B.scale} - vec2(uTime * 0.05, -uTime * 0.09), ${RUFFLE_B.args}) * 0.37 * 0.04;
        gStill *= 0.6 + 0.5 * uWind;
        vec2 g = mix(gRun, gStill, still);
        // the sea's swell under the ripples
        if (vSea > 0.5) g += swell(wp, uTime).yz * mix(0.35, 1.0, smoothstep(0.3, 3.0, depth));

        // rings spreading out from your legs as you wade
        vec2 toMe = vWPos.xz - uPlayer.xz;
        float rMe = length(toMe);
        float ring = cos(rMe * 8.0 - uTime * 6.5) * exp(-rMe * 0.9) * uWade;
        g += toMe / max(rMe, 1e-3) * ring * 0.35;
        // and where the water goes past them (or you through it), a wake
        // opening out behind, and a little bow wave piling up in front
        float rs = length(uWadeFlow);
        float wake = 0.0;
        float bow = 0.0;
        if (rs > 0.05 && rMe < 6.0) {
          vec2 rd = uWadeFlow / rs;
          float al = dot(toMe, rd);
          float ac = dot(toMe, vec2(-rd.y, rd.x));
          float arm = abs(abs(ac) - (0.2 + al * 0.36));
          float k = smoothstep(0.08, 0.9, rs) * uWade;
          wake = step(0.0, al) * exp(-al * 1.1) * (1.0 - smoothstep(0.0, 0.05 + al * 0.035, arm)) * k;
          bow = exp(-max(-al, 0.0) * 5.0) * step(al, 0.15) * (1.0 - smoothstep(0.18, 0.4, abs(ac))) * k;
          g += vec2(-rd.y, rd.x) * sign(ac) * wake * 0.25 - rd * bow * 0.2;
        }

        vec3 waterN = vec3(0.0, 1.0, 0.0); // world space; set with the normal below

        // White water on cascades and riffles, a lacy line along the shore,
        // and a froth around your legs.
        // (vFoam is how churned up the water is: solid white only where it's
        // most churned, in clots and streaks; elsewhere bubbles and a paler,
        // cloudier water)
        float churn = vnoise(run0 * vec2(1.6, 3.4)) * wt0 + vnoise(run1 * vec2(1.6, 3.4) + 3.1) * (1.0 - wt0);
        float foam = smoothstep(0.5, 0.9, vFoam * (0.4 + 0.9 * churn));
        float lace = wnoise(wp, 3.1, vec2(uTime * 0.3, 0.0));
        foam = max(foam, (1.0 - smoothstep(0.0, 0.07 + 0.05 * lace, depth)) * smoothstep(0.4, 0.7, lace) * 0.8);
        foam = max(foam, (1.0 - smoothstep(0.3, 0.75, rMe)) * smoothstep(0.35, 0.65, churn) * uWade * 0.9);
        foam = max(foam, max(wake, bow) * smoothstep(0.3, 0.6, churn + 0.15));
        // flecks of foam and bubbles riding the current, thicker below a
        // cascade, so you can see which way and how fast it runs
        float flecks = fleck(run0 * vec2(1.2, 2.6), 0.08 + 0.5 * vFoam) * wt0
                     + fleck(run1 * vec2(1.2, 2.6), 0.08 + 0.5 * vFoam) * (1.0 - wt0);
        foam = max(foam, flecks * smoothstep(0.25, 0.8, speed) * 0.85);
        float cloud = vFoam * (1.0 - foam) * 0.3;

        // How much the water itself scatters back, from shallow to deep.
        // Running water is clearer: it doesn't stand long enough to silt up.
        float murk = 1.0 - exp(-depth * mix(0.45, 0.75, still));
        vec3 body = mix(vec3(0.05, 0.085, 0.06), vec3(0.012, 0.04, 0.045), smoothstep(0.3, 3.0, depth));
        body = mix(body, mix(vec3(0.04, 0.1, 0.1), vec3(0.008, 0.04, 0.075), smoothstep(0.5, 6.0, depth)), vSea);
        float scatter = mix(0.06, 0.8, murk) + cloud;
        body = mix(body, vec3(0.5, 0.58, 0.55), cloud);
        diffuseColor.rgb = mix(body * scatter, vec3(0.78, 0.8, 0.78), foam);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.9, foam);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // tilt with the surface on cascades, then add the ripples
          vec3 base = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          waterN = normalize(base + vec3(-g.x, 0.0, -g.y));
          normal = normalize((viewMatrix * vec4(waterN, 0.0)).xyz);
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `if (!gl_FrontFacing && cameraPosition.y < vWPos.y + 0.05) {
          // From underneath. Looking up within about 48 degrees of straight
          // up, the sky comes through, bent; further over, the surface is a
          // mirror for the water below it.
          vec3 I = normalize(vWPos - cameraPosition);
          vec3 T = refract(I, -waterN, 1.33);
          float win = step(1e-4, dot(T, T));
          float cosI = clamp(dot(I, waterN), 0.0, 1.0);
          float edge = smoothstep(0.62, 0.7, cosI); // softened by the ripples
          vec3 sky = skyGradient(normalize(T + vec3(0.0, 1e-4, 0.0))) * 1.5;
          vec3 mirror = waterGlow(uUnderSea, 0.0) * 0.7;
          outgoingLight = mix(mirror, sky, win * edge) + vec3(0.7, 0.75, 0.72) * foam * 0.4;
          diffuseColor.a = 1.0;
        } else {
          // Reflection: the sky, except low down, where it would be the trees
          // across the water. The narrower the water, the higher its banks
          // and the trees on them stand in the reflection.
          vec3 V = normalize(cameraPosition - vWPos);
          vec3 R = reflect(-V, waterN);
          R.y = abs(R.y);
          float az = atan(R.z, R.x);
          float tree = 0.06 + 0.07 * vnoise(vec2(az * 9.0, 1.7)) + 0.04 * vnoise(vec2(az * 31.0, 5.3)) + (1.0 - vSky.y) * 0.45;
          vec3 sky = skyGradient(R);
          vec3 trees = (uHorizon * 0.5 + uZenith * 0.5) * vec3(0.09, 0.13, 0.08);
          vec3 refl = mix(trees, sky, smoothstep(tree - 0.015, tree + 0.015, R.y));
          // under the trees, mostly leaves with the odd bright gap
          vec2 leafUV = wp * ${LEAVES.scale} + R.xz / max(R.y, 0.15) * 1.5;
          const vec3 LEAF = vec3(${LEAVES.args}); // wrap, how much finer, wrap
          float leafN = vnoiseD(ROT1 * leafUV, LEAF.x).x * 0.65 + vnoiseD(ROT2 * leafUV * LEAF.y + 3.7, LEAF.z).x * 0.35;
          float leaves = vSky.x * smoothstep(0.22, 0.62, leafN + 0.1);
          refl = mix(refl, trees * 1.3, leaves);
          float cosV = clamp(dot(V, waterN), 0.0, 1.0);
          float F = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);
          outgoingLight += refl * F * (1.0 - foam);
          diffuseColor.a = clamp(scatter + F * (1.0 - scatter) + foam, 0.0, 1.0);
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'water-v6';
  return mat;
}
