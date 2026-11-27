// The sky as light.
//
// The light that isn't the sun's comes from the whole of the sky, and from
// the ground. A two-colour hemisphere light is the least of that: one colour
// from straight up, another from straight down, blended. The real sky is
// brighter round the sun and toward the horizon, warm on the sun's side at
// the end of the day and blue on the other, and flat and white under cloud;
// and what shines mirrors it. So:
//
//   - What lights things from all round is a light probe (spherical
//     harmonics: the light from every direction, smoothed), worked out here
//     from the sky as the shader draws it. Its brightness and colour from
//     straight up, from straight down and on average from the side are the
//     hemisphere light's, which were set by eye (world/sky.js) and which
//     everyone else still reads and changes (a flash of lightning, a cave's
//     mouth, Purgatory's smoke): the sky only gives that light its direction,
//     more from the sun's side and warmer, less and bluer from the other.
//     SKY_OWN_COLOUR and SKY_OWN_SIDES say how far the sky's own colour, and
//     its own brightness from the side (its horizon is bright: more than a
//     wood shows of it), come through too, for when they can be set against
//     photographs (tools/look.mjs).
//   - What a glossy thing mirrors is the sky itself (scene.environment): the
//     same sky, drawn into a small cube now and then, and blurred for each
//     roughness (PMREM). Only what it mirrors: three.js would light things
//     from it as well, but more roughly than the probe does (its blurriest
//     level is not the light from a whole hemisphere), so that part is taken
//     out of every material, once, here (CUBE_PATCH). And only what is glossy
//     (MIRROR_ROUGHNESS): something rough mirrors a wide cone round the
//     reflected ray, which in a wood is mostly the wood, not the open sky the
//     cube holds; and three.js can't tell what's in the way. Left in, needles
//     and bark took a blue sheen of sky as bright as the light they had from
//     all round (measured, tools/look.mjs: the middle of a wood went from 44
//     to 68 in blue).
//
// Neither has the sun's disc in it (the sun is a light of its own), or the
// moon, the stars or the clouds: the sky in it is skyGradient() of glsl.js,
// flattened as cloud covers it, over the ground's colour below the horizon.
// It's worked out again only when the sky has changed by enough to see
// (CHANGED), which is never while time stands still.
//
// While the forest's scene is drawn, the hemisphere light stands aside and
// these two take its intensity from it, so the two are never both lighting
// it. In any other scene it lights what it did (Purgatory brings it along).
//
// ?no=skylight (config.js) leaves all of this out.

import * as THREE from 'three';
import { SKY } from './uniforms.js';
import { SKY_GLSL, SKY_UNIFORMS_GLSL } from './glsl.js';

// How far the sky's own colour comes through in its light, 0..1: 0 keeps the
// hemisphere light's colours as they were set (only the direction is the
// sky's), 1 is the sky's own (bluer in the shade, warmer toward the sun).
export const SKY_OWN_COLOUR = 0;
// How far the light from the side is the sky's own, 0..1: 0 keeps the
// hemisphere light's (half its up and half its down), 1 is as bright as the
// whole of the sky's horizon would make it, unhidden by trees.
export const SKY_OWN_SIDES = 0;
// How much of the sky's shape goes as cloud covers it (sky.overcast 0..1).
const OVERCAST_FLAT = 1;
// The cube the sky is drawn into for what it mirrors: pixels a side. (Blurred
// into a PMREM at least 256 a side whatever this is.)
const CUBE_SIZE = 128;
// How much the sky must have changed to be worked out again: the sun's
// direction (radians) and any colour (as a share of what it was). And how
// often, at the most, while it goes on changing (ms): the light all round
// (a few milliseconds of sums), and the cube it mirrors (drawn six times
// over and blurred: a wildfire's smoke thickens the cloud a little every
// frame, and redrawing the cube every frame cost more than the fire).
const CHANGED = { turn: 0.006, colour: 0.02, overcast: 0.01 };
const AT_MOST = { probe: 250, cube: 2000 };
// Points the sphere is read at to work out the light (elevation × azimuth).
const ROWS = 48;
const COLUMNS = 96;
// Ways round the horizon the light from the side is averaged over.
const SIDES = 16;
// Roughness up to which a thing mirrors all of the sky, and from which none
// (in between, less and less): paint, tin, wet stone and glass mirror it;
// bark, needles, leaves and the ground don't.
const MIRROR_ROUGHNESS = [0.4, 0.8];
// Below the horizon, the ground: how far down the sky gives way to it.
const HORIZON_BAND = 0.05;

// What this needs of the sky (world/sky.js): the hemisphere light everyone
// reads and changes, the intensity it was given before anyone changed it,
// and how overcast it is.
export type SkySource = {
  hemi: THREE.HemisphereLight;
  ambient: number;
  overcast: number;
};

type RGB = [number, number, number];

// ── The sky, in JavaScript ───────────────────────────────────────────────────
// skyGradient() in glsl.js (SKY_GLSL), for a direction at or above the
// horizon: change both together.
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function skyGradient(d: THREE.Vector3, sky: { zen: RGB; hor: RGB; sunColor: RGB; sunDir: THREE.Vector3 }, out: RGB): RGB {
  const y = d.y;
  const t = Math.pow(Math.min(1, Math.max(0, y)), 0.4);
  const below = smooth(0, -0.25, y);
  const sd = Math.max(d.dot(sky.sunDir), 0);
  const sunUp = Math.min(1, Math.max(0, sky.sunDir.y * 5 + 0.5));
  const glow = (Math.pow(sd, 5) * 0.32 + Math.pow(sd, 40) * 0.55) * sunUp;
  for (let i = 0; i < 3; i++) {
    const c = sky.hor[i] + (sky.zen[i] - sky.hor[i]) * t;
    out[i] = c + (sky.hor[i] * 0.85 - c) * below + sky.sunColor[i] * glow;
  }
  return out;
}

// The light from the sky and the ground, as spherical harmonics, so that the
// irradiance from straight up is `up`, from straight down is `down`, and on
// average from the side is half of each (each RGB, as a hemisphere light's
// colour times its intensity). `own` (0..1) is how far the sky's own colour
// comes through over up's; `sides` (0..1) how far its own brightness from
// the side does; `flat` (0..1) how far the sky is flattened, as cloud
// flattens it. Returns the coefficients, and the clear sky's mean (for
// drawing it flattened into the cube).
//
// It's made of three things, as much of each as gives those three: the sky
// as it is drawn (which brings its direction), the sky brighter straight up
// and dimming to nothing at the horizon (to take the light from the side
// down to what's wanted while keeping it from above), and the ground.
const _d = new THREE.Vector3();
const _basis: number[] = new Array(9).fill(0);
const _sh = new THREE.SphericalHarmonics3();
const _e = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const LUMA: RGB = [0.2126, 0.7152, 0.0722];
const luma = (c: RGB | number[]) => c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2];

export function skyHarmonics(
  sky: { zen: RGB; hor: RGB; sunColor: RGB; sunDir: THREE.Vector3 },
  up: RGB,
  down: RGB,
  { own = SKY_OWN_COLOUR, sides = SKY_OWN_SIDES, flat = 0 } = {},
): { sh: THREE.SphericalHarmonics3; mean: RGB } {
  // Project the sky (above) and a plain ground (below) separately, in
  // radiance; the cosine-weighted mean of the clear sky, for flattening it.
  const skyLm = Array.from({ length: 9 }, () => [0, 0, 0]);
  const zenithLm = new Array(9).fill(0);
  const groundLm = new Array(9).fill(0);
  const mean: RGB = [0, 0, 0];
  let meanW = 0;
  const c: RGB = [0, 0, 0];
  const dEl = Math.PI / ROWS;
  const dAz = (2 * Math.PI) / COLUMNS;
  // first the clear sky's mean (the flattened sky is that, brighter overhead)
  for (let i = 0; i < ROWS / 2; i++) {
    const el = (i + 0.5) * dEl;
    const w = Math.cos(el) * dEl * dAz * Math.sin(el);
    for (let j = 0; j < COLUMNS; j++) {
      const az = (j + 0.5) * dAz;
      _d.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
      skyGradient(_d, sky, c);
      for (let k = 0; k < 3; k++) mean[k] += c[k] * w;
      meanW += w;
    }
  }
  for (let k = 0; k < 3; k++) mean[k] /= meanW;
  for (let i = 0; i < ROWS; i++) {
    const el = -Math.PI / 2 + (i + 0.5) * dEl;
    const w = Math.cos(el) * dEl * dAz;
    for (let j = 0; j < COLUMNS; j++) {
      const az = (j + 0.5) * dAz;
      _d.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
      THREE.SphericalHarmonics3.getBasisAt(_d, _basis);
      if (el > 0) {
        skyGradient(_d, sky, c);
        const overcast = (3 / 7) * (1 + 2 * _d.y);
        for (let k = 0; k < 3; k++) c[k] += (mean[k] * overcast - c[k]) * flat;
        for (let m = 0; m < 9; m++) for (let k = 0; k < 3; k++) skyLm[m][k] += c[k] * _basis[m] * w;
        for (let m = 0; m < 9; m++) zenithLm[m] += _d.y * _basis[m] * w;
      } else {
        for (let m = 0; m < 9; m++) groundLm[m] += _basis[m] * w;
      }
    }
  }
  // What each gives from straight up and straight down, by colour.
  const at = (lm: (m: number) => number, n: THREE.Vector3) => {
    for (let m = 0; m < 9; m++) _sh.coefficients[m].setScalar(lm(m));
    return _sh.getIrradianceAt(n, _e).x;
  };
  // (from the side: the mean over every way round)
  const side = (lm: (m: number) => number) => {
    for (let m = 0; m < 9; m++) _sh.coefficients[m].setScalar(lm(m));
    let e = 0;
    for (let j = 0; j < SIDES; j++) e += _sh.getIrradianceAt(_d.set(Math.cos((j * 2 * Math.PI) / SIDES), 0, Math.sin((j * 2 * Math.PI) / SIDES)), _e).x;
    return e / SIDES;
  };
  const G = [at((m) => groundLm[m], UP), at((m) => groundLm[m], DOWN), side((m) => groundLm[m])];
  const Z = [at((m) => zenithLm[m], UP), at((m) => zenithLm[m], DOWN), side((m) => zenithLm[m])];
  // the colour wanted from overhead: the hemisphere light's, or as far as
  // `own` says the sky's, as bright
  const skyUp: RGB = [0, 0, 0];
  for (let k = 0; k < 3; k++) skyUp[k] = at((m) => skyLm[m][k], UP);
  const want: RGB = [...up];
  if (own > 0) {
    const s = luma(up) / Math.max(luma(skyUp), 1e-6);
    for (let k = 0; k < 3; k++) want[k] += (skyUp[k] * s - up[k]) * own;
  }
  // Solve, colour by colour, for how much of the sky (a), of the sky
  // brighter overhead (z) and of the ground (b) give `want` from above,
  // `down` from below, and from the side what `sides` says. First without
  // the second: what the sky on its own would give from the side.
  const sh = new THREE.SphericalHarmonics3();
  for (let k = 0; k < 3; k++) {
    const S = [skyUp[k], at((m) => skyLm[m][k], DOWN), side((m) => skyLm[m][k])];
    const det2 = S[0] * G[1] - G[0] * S[1];
    const a2 = Math.abs(det2) > 1e-9 ? (want[k] * G[1] - G[0] * down[k]) / det2 : 0;
    const b2 = Math.abs(det2) > 1e-9 ? (S[0] * down[k] - want[k] * S[1]) / det2 : 0;
    const ownSide = a2 * S[2] + b2 * G[2];
    const wantSide = (want[k] + down[k]) / 2 + (ownSide - (want[k] + down[k]) / 2) * sides;
    let [a, z, b] = solve3([S, Z, G], [want[k], down[k], wantSide]);
    // (a sky that can't be made to give that without a negative part keeps
    // its own light from the side)
    if (!(a >= 0 && z >= 0 && b >= 0)) [a, z, b] = [Math.max(a2, 0), 0, Math.max(b2, 0)];
    for (let m = 0; m < 9; m++) sh.coefficients[m].setComponent(k, a * skyLm[m][k] + z * zenithLm[m] + b * groundLm[m]);
  }
  return { sh, mean };
}

// ── The cube: the sky as it's mirrored ──────────────────────────────────────
const DOME_FRAG = /* glsl */ `
${SKY_UNIFORMS_GLSL}
${SKY_GLSL}
uniform vec3 uMean;
uniform float uFlat;
uniform vec3 uGround;
varying vec3 vDir;
void main() {
  vec3 rd = normalize(vDir);
  // (below the horizon, the sky at the horizon that way, for the band where
  // it gives way to the ground; straight down there is no way, and no sky)
  vec2 across = rd.xz;
  vec3 above = rd.y > 0.0 ? rd : (dot(across, across) > 1e-8 ? vec3(normalize(across).x, 0.0, normalize(across).y) : vec3(1.0, 0.0, 0.0));
  vec3 col = skyGradient(above);
  col = mix(col, uMean * (3.0 / 7.0) * (1.0 + 2.0 * above.y), uFlat);
  col = mix(col, uGround, smoothstep(0.0, -${HORIZON_BAND.toFixed(3)}, rd.y));
  gl_FragColor = vec4(col, 1.0);
}`;
const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// In every material that has the cube (CUBE_PATCH): three.js's light from it
// onto rough things taken out (the probe is that light here), and what it
// mirrors kept to what is glossy. See the top.
let patched = false;
function patchCubeLight() {
  if (patched) return;
  patched = true;
  let chunk = THREE.ShaderChunk.lights_fragment_maps;
  const diffuse = 'iblIrradiance += getIBLIrradiance( geometryNormal );';
  const mirrored = 'radiance += iblRadiance;';
  const read = 'vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );';
  if (!chunk.includes(diffuse) || !chunk.includes(mirrored) || !chunk.includes(read)) throw new Error('skyLight: three.js has changed lights_fragment_maps; see CUBE_PATCH');
  chunk = chunk.replace(diffuse, '/* (render/skyLight.ts: the light probe is this light) */');
  const [from, to] = MIRROR_ROUGHNESS.map((r) => r.toFixed(3));
  // (and the cube not read at all for what's too rough to mirror it: the
  // ground, leaves and bark are most of the picture)
  chunk = chunk.replace(read, `vec3 iblRadiance = material.roughness < ${to} ? getIBLRadiance( geometryViewDir, geometryNormal, material.roughness ) : vec3( 0.0 );`);
  chunk = chunk.replace(mirrored, `radiance += iblRadiance * (1.0 - smoothstep(${from}, ${to}, material.roughness)); // (render/skyLight.ts: only what is glossy)`);
  THREE.ShaderChunk.lights_fragment_maps = chunk;
}

// x for M x = r, where M's columns are cols (each [up, down, side]), by
// Cramer's rule; NaNs if it has none.
function solve3(cols: number[][], r: number[]): [number, number, number] {
  const det = (c: number[][]) =>
    c[0][0] * (c[1][1] * c[2][2] - c[2][1] * c[1][2]) - c[1][0] * (c[0][1] * c[2][2] - c[2][1] * c[0][2]) + c[2][0] * (c[0][1] * c[1][2] - c[1][1] * c[0][2]);
  const d = det(cols);
  if (Math.abs(d) < 1e-12) return [NaN, NaN, NaN];
  return [0, 1, 2].map((i) => det(cols.map((c, j) => (j === i ? r : c))) / d) as [number, number, number];
}

const _turn = new THREE.Vector3();

export class SkyLight {
  probe: THREE.LightProbe;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private sky: SkySource;
  private own: THREE.Scene;
  private cubeCamera: THREE.CubeCamera;
  private cube: THREE.WebGLCubeRenderTarget;
  private pmrem: THREE.PMREMGenerator;
  private mirrored: ReturnType<THREE.PMREMGenerator["fromCubemap"]> | null = null;
  private uniforms: { uMean: { value: THREE.Color }; uFlat: { value: number }; uGround: { value: THREE.Color } };
  private last: { sunDir: THREE.Vector3; colours: number[]; overcast: number } | null = null;
  private probeAt = -Infinity;
  private cubeAt = -Infinity;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, sky: SkySource) {
    this.renderer = renderer;
    this.scene = scene;
    this.sky = sky;
    patchCubeLight();

    this.probe = new THREE.LightProbe();
    // (lights everything, as the hemisphere light does: render/pipeline.js, OVER)
    this.probe.layers.enableAll();
    scene.add(this.probe);

    this.uniforms = { uMean: { value: new THREE.Color() }, uFlat: { value: 0 }, uGround: { value: new THREE.Color() } };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(10, 32, 16),
      new THREE.ShaderMaterial({ uniforms: { ...SKY, ...this.uniforms }, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false }),
    );
    this.own = new THREE.Scene();
    this.cube = new THREE.WebGLCubeRenderTarget(CUBE_SIZE, { type: THREE.HalfFloatType });
    this.cubeCamera = new THREE.CubeCamera(1, 100, this.cube);
    this.own.add(dome, this.cubeCamera);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileCubemapShader();

    // While this scene is drawn, the hemisphere light gives its intensity to
    // the probe and the cube, and stands aside.
    const before = scene.onBeforeRender;
    const after = scene.onAfterRender;
    scene.onBeforeRender = (...args) => {
      const hemi = this.sky.hemi;
      this.probe.intensity = hemi.intensity;
      scene.environmentIntensity = this.sky.ambient > 0 ? hemi.intensity / this.sky.ambient : 0;
      hemi.visible = false;
      before.apply(scene, args);
    };
    scene.onAfterRender = (...args) => {
      this.sky.hemi.visible = true;
      after.apply(scene, args);
    };
  }

  // After the sky has been updated (world/sky.js): works the light out again
  // if the sky has changed enough to see.
  update() {
    const hemi = this.sky.hemi;
    const colours = [...SKY.uZenith.value.toArray(), ...SKY.uHorizon.value.toArray(), ...SKY.uSunColor.value.toArray(), ...hemi.color.toArray(), ...hemi.groundColor.toArray()];
    const sunDir = SKY.uSunDir.value;
    const last = this.last;
    if (last) {
      const turned = _turn.copy(sunDir).angleTo(last.sunDir) > CHANGED.turn;
      const recoloured = colours.some((c, i) => Math.abs(c - last.colours[i]) > CHANGED.colour * Math.max(Math.abs(last.colours[i]), 0.01));
      const clouded = Math.abs(this.sky.overcast - last.overcast) > CHANGED.overcast;
      if (!turned && !recoloured && !clouded) return;
    }
    // (while it goes on changing: the light all round now and then, and the
    // cube less often; once it's settled, both are worked out as it is)
    const now = performance.now();
    if (now - this.probeAt < AT_MOST.probe) return;
    this.probeAt = now;
    const cube = now - this.cubeAt >= AT_MOST.cube;
    if (cube) {
      this.cubeAt = now;
      this.last = { sunDir: sunDir.clone(), colours, overcast: this.sky.overcast };
    }

    // the light all round: the hemisphere light's up and down, as the sky has it
    const rgb = (c: THREE.Color): RGB => [c.r, c.g, c.b];
    const flat = Math.min(1, this.sky.overcast * OVERCAST_FLAT);
    const sky = { zen: rgb(SKY.uZenith.value), hor: rgb(SKY.uHorizon.value), sunColor: rgb(SKY.uSunColor.value), sunDir };
    const { sh, mean } = skyHarmonics(sky, rgb(hemi.color), rgb(hemi.groundColor), { flat });
    this.probe.sh.copy(sh);

    // what it mirrors: the sky itself, over the ground lit as the hemisphere
    // light has it (radiance: its colour over pi)
    this.uniforms.uMean.value.setRGB(...mean);
    this.uniforms.uFlat.value = flat;
    this.uniforms.uGround.value.copy(hemi.groundColor).multiplyScalar(this.sky.ambient / Math.PI);
    if (!cube) return;
    this.cubeCamera.update(this.renderer, this.own);
    this.mirrored = this.pmrem.fromCubemap(this.cube.texture, this.mirrored);
    this.scene.environment = this.mirrored.texture;
  }
}
