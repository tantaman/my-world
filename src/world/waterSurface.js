// The surface of ponds, lakes, streams and rivers.
//
// Each chunk gets one water mesh, built from its height grid and the water
// grids the chunk worker produced (see chunkGen.js). A cell of the grid gets
// water if any of its corners is under the water level where water may stand,
// so the surface runs a little way up under the banks and the terrain hides
// the rest. Built on the main thread from the live heights, it's rebuilt when
// you dig: cut a hole beside a lake or a stream and it fills to their level.
//
// It is drawn over everything else (the OVER layer, render/pipeline.js), with
// a copy of what lies behind it to hand (BEHIND in render/uniforms.js), and
// it is what a real surface of water is: a mirror and a window at once.
//
//   - It mirrors what stands over it: the banks, the trees across the water,
//     a cabin on the shore, you. The mirrored ray is followed across the copy
//     until it passes behind something drawn there, and that is what it sees
//     (screen-space reflection). Where it leaves the picture without meeting
//     anything it sees the sky, the clouds where the sky is in the picture,
//     and low down the dark of the trees round the water; and the narrower
//     the water, the more of it is its banks and the leaves over it.
//   - How much it mirrors goes by the angle (Fresnel): looking straight down
//     you see into it; looking across it, it's all reflection.
//   - Through it you see the bed, bent by the ripples a quarter of the way
//     the water is deep, and dimmed and tinted by how much water the light
//     comes up through to your eye: reds first, so the shallows are the
//     colour of their stones and the deep goes green and dark. The water
//     itself scatters some light back, lit by the sun where the sun reaches
//     it. (The light on its way down to the bed is the terrain's business:
//     materials.js.)
//   - The wind runs short waves across still water, a few lengths of them
//     spread either side of the way it blows; and as they get finer than a
//     pixel or two they're let go, so far off it lies smooth and mirrors the
//     shore, as real water does, rather than shimmering.
//   - Running water is drawn out into streaks along the current and carries
//     flecks of foam and bubbles with it, more below a cascade, so you can
//     see which way it goes and how fast. It turns white on cascades, along
//     the shore and around your legs, and where it runs past you it opens
//     into a wake.
//
// A real place whose country has water of its own colour (country.js: the
// milky blue-green of a creek that lays down travertine) has it, as far as
// the ground there is that country's.
//
// The forest's own sea (sea.js) rises and falls in a slow swell and is bluer
// than a lake; it breaks white along the shore, as a real place's sea does,
// by the foam it carries. Seen from underneath, any water is a ceiling of
// moving light: the sky through a bright round window straight overhead, and
// beyond it, the water mirrored back down (Snell's window).

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { NOISE_GLSL, WORLD_GLSL, WORLD_NOISE_GLSL, SKY_GLSL, SKY_UNIFORMS_GLSL, UNDER_GLSL, PERIOD, wave } from '../render/glsl.js';
import { SHARED, SKY, WADE, UNDER, BEHIND, WATERS, MAX_COUNTRIES } from '../render/uniforms.js';
import { NO_WATER } from './water.js';
import { WATER_STRIDE as WS, SURFACE_STRIDE as SS } from './chunkGen.js';


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

// The wind's waves on still water: which way, either side of the way the wind
// blows (rad); how long (m); how steep (height × wavenumber). Each is brought
// round on the world's period (render/glsl.js) so it never jumps, and runs at
// the speed water waves that long do.
const WIND_WAY = 0.6; // rad from +x toward +z: the way the wind blows over still water
const WIND_WAVES = [
  [0.0, 3.3, 0.022],
  [-0.62, 2.3, 0.026],
  [0.55, 1.6, 0.028],
  [-0.25, 1.13, 0.03],
  [0.85, 0.79, 0.03],
  [-0.95, 0.56, 0.028],
  [0.35, 0.4, 0.026],
  [-0.5, 0.29, 0.022],
  [1.2, 0.21, 0.018],
];
// The wind comes in gusts: patches of ruffled water a few tens of metres
// across drift over a lake, with glassy calm between them. How big (cells to
// the metre), how fast they drift (m/s), and the calmest and the most
// ruffled, against the waves as above.
const GUSTS = { cells: 0.022, drift: 1.4, calm: 0.25, most: 1.6 };
const WIND_GLSL = /* glsl */ `
// the slope of the wind's waves at world place p; fw: metres to a pixel there,
// for letting go of the ones too fine to draw
vec2 windWaves(vec2 p, float t, float fw) {
  vec2 g = vec2(0.0);
  // the waves come in groups: two slow swells of how big they are, each wave
  // riding one or the other
  float e0 = 0.35 + 1.3 * wnoise(p, 0.07, vec2(t * 0.05, 0.0));
  float e1 = 0.35 + 1.3 * wnoise(p, 0.05, vec2(5.0, -t * 0.04));
${WIND_WAVES.map(([turn, len, steep], i) => {
  const a = WIND_WAY + turn;
  const k = (2 * Math.PI) / len;
  const kx = Number(wave(Math.cos(a) * k));
  const kz = Number(wave(Math.sin(a) * k));
  const kk = Math.hypot(kx, kz);
  const f = (v) => v.toFixed(6);
  return `  { float ph = ${f(kx)} * p.x + ${f(kz)} * p.y - t * ${f(Math.sqrt(9.8 * kk))} + ${f(i * 2.39996)}; g += ${f(steep)} * e${i % 2} * cos(ph) * vec2(${f(kx / kk)}, ${f(kz / kk)}) * smoothstep(1.5, 4.0, ${f(len)} / fw); }`;
}).join('\n')}
  return g;
}
`;

// Following a mirrored ray across the picture (screen-space reflection): how
// many steps, each this much longer than the last, from the first (m); and
// how many halvings to find where it met what it met. Fewer on a modest card.
// (CONFIG.mirror: 0, and it only mirrors the sky and the treeline.)
const MIRROR = { steps: Math.max(0, Math.round(CONFIG.mirror)), first: 0.25, far: 300, refine: CONFIG.mirror < 20 ? 3 : 5 };
MIRROR.grow = Math.pow(MIRROR.far / MIRROR.first, 1 / Math.max(1, MIRROR.steps - 1));
const REFRACT = 0.25; // how far the ripples bend what's under them, for each metre of water (n = 1.33)
// per m: how cloudy it is to see through; milky, a creek that lays down
// travertine (country.js `water.milk`)
const MURK = { still: 0.38, running: 0.22, sea: 0.14, milky: 3 };
const FAR_SKY = 5.0e4; // m: past this, the copy behind is the sky (render/pipeline.js)

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
  // how far it is a real place's own water, and which country's (country.js)
  const land = new Float32Array(count * 2);
  const surface = ch.surface;
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
    if (surface) {
      land[m * 2] = surface[k * SS + 2];
      land[m * 2 + 1] = surface[k * SS + 3];
    }
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
  geo.setAttribute('aLand', new THREE.BufferAttribute(land, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

export function createWaterMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.05,
    metalness: 0,
    // Drawn over a copy of what is behind it (render/pipeline.js), so it
    // works out the whole of what is seen at each point itself, the bed
    // through it included, and covers what was there.
    side: THREE.DoubleSide, // so it can be seen from under it
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SKY, WADE, UNDER, BEHIND, WATERS, { uPlayer: SHARED.uPlayer, uWind: SHARED.uWind, uOrigin: SHARED.uOrigin });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 aFlow;
        attribute float aFoam;
        attribute float aDepth;
        attribute vec2 aSky;
        attribute vec2 aLand;
        uniform float uTime;
        uniform float uSea;
        varying vec2 vFlow;
        varying float vFoam;
        varying float vDepth;
        varying vec2 vSky;
        varying vec3 vWPos;
        varying float vSea;
        varying float vOwn;
        flat varying float vCountry;
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
        vOwn = aLand.x;
        vCountry = aLand.y;
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
        uniform sampler2D tBehind;
        uniform vec2 uBehindRes;
        uniform mat4 uProj;
        uniform float uAirFog;
        varying vec2 vFlow;
        varying float vFoam;
        varying float vDepth;
        varying vec2 vSky; // x: leaves overhead, y: how open it is
        varying vec3 vWPos; // as drawn: see worldXZ
        varying float vSea; // 1 on the sea
        varying float vOwn; // how far it is a real place's own water
        flat varying float vCountry; // and which country's
        uniform vec3 uWaterShallow[${MAX_COUNTRIES}];
        uniform vec3 uWaterDeep[${MAX_COUNTRIES}];
        uniform float uWaterMilk[${MAX_COUNTRIES}];
        ${NOISE_GLSL}
        ${WORLD_GLSL}
        ${WORLD_NOISE_GLSL}
        ${SKY_GLSL}
        ${UNDER_GLSL}
        ${SWELL_GLSL}
        ${WIND_GLSL}
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
        }

        // What lies behind the water, from the copy (render/pipeline.js):
        // how far off it is (view depth, m) at a place in the picture (uv).
        float behindZ(vec2 uv) {
          return texelFetch(tBehind, ivec2(clamp(uv, 0.0, 1.0) * uBehindRes - 0.5), 0).a;
        }
        vec2 onScreen(vec3 q) {
          vec4 c = uProj * vec4(q, 1.0);
          return c.xy / c.w * 0.5 + 0.5;
        }
        // Follow a ray from p along r (view space) across the copy until it
        // passes behind something drawn there: (where in the picture, how
        // sure, how far along it, m). Sure is 0 if it met nothing in sight.
        vec4 mirrored(vec3 p, vec3 r) {
          float t0 = 0.0;
          float t = ${MIRROR.first.toFixed(3)};
          for (int i = 0; i < ${MIRROR.steps}; i++) {
            vec3 q = p + r * t;
            if (q.z > -0.05) break; // behind the eye
            vec2 uv = onScreen(q);
            if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
            float zb = behindZ(uv);
            float dz = -q.z - zb;
            // behind it, but not so far that it went behind something thin
            // and is out the other side
            if (dz > 0.0 && zb < ${FAR_SKY.toFixed(1)} && dz < (t - t0) * 1.5 + zb * 0.02 + 0.2) {
              float a = t0;
              float b = t;
              for (int k = 0; k < ${MIRROR.refine}; k++) {
                float m = 0.5 * (a + b);
                vec3 qm = p + r * m;
                if (-qm.z > behindZ(onScreen(qm))) b = m;
                else a = m;
              }
              vec2 hit = onScreen(p + r * b);
              vec2 edge = min(hit, 1.0 - hit);
              float sure = smoothstep(0.0, 0.07, min(edge.x, edge.y)) * (1.0 - smoothstep(${(MIRROR.far * 0.6).toFixed(1)}, ${MIRROR.far.toFixed(1)}, b));
              return vec4(hit, sure, b);
            }
            t0 = t;
            t *= ${MIRROR.grow.toFixed(6)};
          }
          return vec4(0.0);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 wp = worldXZ(vWPos);
        float fw = max(max(length(dFdx(wp)), length(dFdy(wp))), 1e-4); // metres to a pixel, here
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
        gRun *= 1.0 - smoothstep(0.25, 0.6, fw); // (too fine to draw, far off)
        // Still water: the wind's waves, and a ruffle of noise over them so
        // no two patches are alike; calmer where the woods shelter it.
        float shelter = mix(0.45, 1.0, vSky.y);
        float gust = wnoise(wp, ${GUSTS.cells}, -vec2(cos(${WIND_WAY}), sin(${WIND_WAY})) * uTime * ${(GUSTS.drift * GUSTS.cells).toFixed(5)});
        gust = mix(${GUSTS.calm}, ${GUSTS.most}, smoothstep(0.3, 0.75, gust));
        vec2 gStill = windWaves(wp, uTime, fw) * gust;
        gStill += (rippleGrad(wp * ${RUFFLE_A.scale} + vec2(uTime * 0.21, uTime * 0.08), ${RUFFLE_A.args}) * 0.9 * 0.012 * (1.0 - smoothstep(0.12, 0.3, fw))
                 + rippleGrad(wp * ${RUFFLE_B.scale} - vec2(uTime * 0.05, -uTime * 0.09), ${RUFFLE_B.args}) * 0.37 * 0.02 * (1.0 - smoothstep(0.3, 0.8, fw)));
        gStill *= (0.45 + 0.6 * uWind) * shelter;
        vec2 g = mix(gRun, gStill, still);
        // the sea's swell under the ripples
        float depthV = max(vDepth, 0.0);
        if (vSea > 0.5) g += swell(wp, uTime).yz * mix(0.35, 1.0, smoothstep(0.3, 3.0, depthV));

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
        foam = max(foam, (1.0 - smoothstep(0.0, 0.07 + 0.05 * lace, depthV)) * smoothstep(0.4, 0.7, lace) * 0.8);
        foam = max(foam, (1.0 - smoothstep(0.3, 0.75, rMe)) * smoothstep(0.35, 0.65, churn) * uWade * 0.9);
        foam = max(foam, max(wake, bow) * smoothstep(0.3, 0.6, churn + 0.15));
        // flecks of foam and bubbles riding the current, thicker below a
        // cascade, so you can see which way and how fast it runs
        float flecks = fleck(run0 * vec2(1.2, 2.6), 0.08 + 0.5 * vFoam) * wt0
                     + fleck(run1 * vec2(1.2, 2.6), 0.08 + 0.5 * vFoam) * (1.0 - wt0);
        foam = max(foam, flecks * smoothstep(0.25, 0.8, speed) * 0.85);
        float cloud = vFoam * (1.0 - foam) * 0.3;

        // How much water the light from what's under it comes up through to
        // the eye (m), from the copy of what's behind: and so how much of what
        // you see of it is the water itself, scattering the light that gets
        // into it. Running water is clearer: it doesn't stand long enough to
        // silt up; the sea is clearer still. A real place's water may be of
        // its country's own colour, and milky (country.js): milky water hides
        // what's under it much sooner.
        vec2 suv = gl_FragCoord.xy / uBehindRes;
        float zs = max(vViewPosition.z, 1e-3);
        float sight = max(behindZ(suv) - zs, 0.0) * length(vViewPosition) / zs;
        int wc = int(vCountry + 0.5);
        float milk = uWaterMilk[wc] * vOwn;
        float murkK = mix(mix(${MURK.running.toFixed(3)}, ${MURK.still.toFixed(3)}, still), ${MURK.sea.toFixed(3)}, vSea);
        murkK = mix(murkK, ${MURK.milky.toFixed(3)}, milk);
        float murk = 1.0 - exp(-sight * murkK);
        // the water's own colour, as it scatters: greener in a lake, bluer in
        // the sea, or its country's own
        vec3 body = mix(vec3(0.05, 0.085, 0.06), vec3(0.02, 0.06, 0.07), smoothstep(1.0, 8.0, sight));
        body = mix(body, mix(uWaterShallow[wc], uWaterDeep[wc], smoothstep(1.0, 8.0, sight)), vOwn);
        body = mix(body, mix(vec3(0.04, 0.1, 0.1), vec3(0.012, 0.05, 0.085), smoothstep(1.0, 12.0, sight)), vSea);
        body = mix(body * murk, vec3(0.5, 0.58, 0.55) * 0.5, cloud);
        diffuseColor.rgb = mix(body, vec3(0.78, 0.8, 0.78), foam);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // what's too fine to draw still breaks up the sun's glint, far off
        roughnessFactor = mix(mix(roughnessFactor, 0.16, smoothstep(0.05, 0.6, fw)), 0.9, foam);`,
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
        } else {
          vec3 P = -vViewPosition; // view space
          vec3 V = normalize(cameraPosition - vWPos);
          float cosV = clamp(dot(V, waterN), 0.0, 1.0);
          float F = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);

          // Through it: what's under it, bent by the ripples, dimmed and
          // tinted by the water it comes up through. (Unless what the bend
          // lands on is in front of the water: a bank, your legs.)
          vec3 tilt = mat3(viewMatrix) * (waterN - vec3(0.0, 1.0, 0.0));
          float deep = min(sight * zs / length(vViewPosition), 3.0);
          vec2 ruv = suv + vec2(uProj[0][0], uProj[1][1]) * 0.5 * tilt.xy * ${REFRACT.toFixed(3)} * deep / zs;
          float zr = behindZ(ruv);
          if (zr < zs) {
            ruv = suv;
            zr = behindZ(suv);
          }
          float through = max(zr - zs, 0.0) * length(vViewPosition) / zs;
          float k = vSea;
          vec3 seen = texture2D(tBehind, ruv).rgb * exp(-through * (waterAbsorb(k) + murkK));

          // Mirrored: what stands over it, where that is in the picture;
          // otherwise the sky, and low down the dark of the trees round the
          // water. The narrower the water, the higher its banks and the
          // trees on them stand in the reflection.
          vec3 R = reflect(-V, waterN);
          R.y = abs(R.y);
          float az = atan(R.z, R.x);
          float tree = 0.06 + 0.07 * vnoise(vec2(az * 9.0, 1.7)) + 0.04 * vnoise(vec2(az * 31.0, 5.3)) + (1.0 - vSky.y) * 0.45;
          vec3 trees = (uHorizon * 0.5 + uZenith * 0.5) * vec3(0.09, 0.13, 0.08);
          vec3 Rv = reflect(normalize(P), normal);
          // the sky, as the picture has it where it's in sight (with its
          // clouds), else as the sky is
          vec3 sky = skyGradient(R);
          {
            vec4 c = uProj * vec4(Rv, 0.0);
            vec2 at = c.xy / max(c.w, 1e-4) * 0.5 + 0.5;
            vec2 e = min(at, 1.0 - at);
            if (c.w > 0.0 && min(e.x, e.y) > 0.0) {
              vec4 s = texture2D(tBehind, at);
              float in_ = smoothstep(0.0, 0.06, min(e.x, e.y)) * step(${FAR_SKY.toFixed(1)}, s.a);
              sky = mix(sky, s.rgb, in_);
            }
          }
          vec3 refl = mix(trees, sky, smoothstep(tree - 0.015, tree + 0.015, R.y));
          // under the trees, mostly leaves with the odd bright gap
          vec2 leafUV = wp * ${LEAVES.scale} + R.xz / max(R.y, 0.15) * 1.5;
          const vec3 LEAF = vec3(${LEAVES.args}); // wrap, how much finer, wrap
          float leafN = vnoiseD(ROT1 * leafUV, LEAF.x).x * 0.65 + vnoiseD(ROT2 * leafUV * LEAF.y + 3.7, LEAF.z).x * 0.35;
          float leaves = vSky.x * smoothstep(0.22, 0.62, leafN + 0.1);
          refl = mix(refl, trees * 1.3, leaves);
          ${MIRROR.steps > 0 ? `
          if (Rv.z < 0.2) {
            vec4 hit = mirrored(P, Rv);
            if (hit.z > 0.0) {
              vec3 got = texture2D(tBehind, hit.xy).rgb;
              // and fogged by the air between it and the water
              got = mix(got, skyGradient(normalize(vec3(R.x, 0.04, R.z))) * 0.82, 1.0 - exp(-hit.w * uAirFog));
              refl = mix(refl, got, hit.z);
            }
          }` : ''}

          outgoingLight += (seen * (1.0 - F) + refl * F) * (1.0 - foam);
        }
        diffuseColor.a = 1.0;
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => `water-v8-${MIRROR.steps}`;
  return mat;
}
