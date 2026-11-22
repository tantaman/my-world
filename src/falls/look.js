// What a waterfall looks like: the falling water, and the mist at its foot.
//
// The water is a sheet hung from the lip (falls.js says its shape): strands
// of white water down it, each running down the faster the further it has
// fallen, ragged at the sides, holding together at the lip and coming apart
// lower down, with the colour of the creek in it near the top. A cascade's
// sheet lies down its slope instead, thinner. At the foot of a fall, mist
// rises and drifts off: soft puffs that swell and fade as they go.
//
// Each is built round its lip, and the mesh stands there in the world
// (render/origin.js). Its patterns are drawn from its own across and down,
// not from where it is in the world, so they keep still on it.

import * as THREE from 'three';
import { SHARED, SKY } from '../render/uniforms.js';
import { NOISE_GLSL } from '../render/glsl.js';
import { curtain } from './falls.js';

const ACROSS = 14; // columns of the sheet
const ROW = 0.5; // m between its rows, down the fall
// How wide a fall's water is, as a share of how far it drops, between these
// (m); never wider than its stream. A cascade spills over the whole stream.
const WIDE = 0.8;
const NARROWEST = 1.2;
const SPREAD = 0.35; // how much wider it is at the foot than at the lip
const FALL_SPEED = 2.6; // m/s the strands run down at, as drawn
// Mist: how many puffs for each metre a fall drops, how long one lasts (s),
// and how big one grows (m).
const MIST_PER_M = 14;
const MIST_LIFE = 5;
const MIST_SIZE = 1.1;

// The light on water thrown into the air: the sky's, and the sun's (as the
// splashes have it).
const LIT_GLSL = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
vec3 airLight() {
  return mix(uHorizon, uZenith, 0.35) * 1.3 + uSunColor * 0.6 * clamp(uSunDir.y * 3.0, 0.0, 1.0);
}
`;
const sky = () => ({ uZenith: SKY.uZenith, uHorizon: SKY.uHorizon, uSunColor: SKY.uSunColor, uSunDir: SKY.uSunDir, uTime: SHARED.uTime, uLines: SHARED.uLines });

// The falling water of `fall` (findFall), as a mesh standing at its lip.
// tint: the colour of the creek's water (linear), for the top of the sheet.
export function makeFall(fall, ground, tint = [0.2, 0.45, 0.42]) {
  const g = new THREE.Group();
  const [lx, top, lz] = fall.top;
  g.position.set(lx, top, lz);
  g.add(sheet(fall, ground, tint));
  if (!fall.cascade) g.add(mist(fall));
  return g;
}

function sheet(fall, ground, tint) {
  const h = fall.height;
  const top = fall.top[1];
  const rows = Math.max(4, Math.ceil(h / ROW));
  const shape = curtain(fall, ground, rows);
  const [dx, dz] = fall.dir;
  const [ax, az] = [-dz, dx]; // across
  const wide = fall.cascade ? fall.width * 0.9 : Math.min(fall.width, Math.max(NARROWEST, h * WIDE));
  const N = (ACROSS + 1) * (rows + 1);
  const pos = new Float32Array(N * 3);
  const uv = new Float32Array(N * 2);
  const down = new Float32Array(N);
  for (let r = 0; r <= rows; r++) {
    const [out, y] = shape[r];
    const t = r / rows;
    const w = wide * (fall.cascade ? 1 : 1 + SPREAD * t);
    for (let c = 0; c <= ACROSS; c++) {
      const u = c / ACROSS;
      const k = r * (ACROSS + 1) + c;
      const side = (u - 0.5) * w;
      pos[k * 3] = dx * out + ax * side;
      pos[k * 3 + 1] = y - top + (fall.cascade ? 0.06 : 0);
      pos[k * 3 + 2] = dz * out + az * side;
      uv[k * 2] = u;
      uv[k * 2 + 1] = t;
      down[k] = h * t;
    }
  }
  const idx = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < ACROSS; c++) {
      const a = r * (ACROSS + 1) + c;
      idx.push(a, a + ACROSS + 1, a + 1, a + 1, a + ACROSS + 1, a + ACROSS + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aUV', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aDown', new THREE.BufferAttribute(down, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...sky(), uTint: { value: new THREE.Color(...tint) }, uWide: { value: wide }, uCascade: { value: fall.cascade ? 1 : 0 } },
    vertexShader: /* glsl */ `
      attribute vec2 aUV;
      attribute float aDown;
      varying vec2 vUV;
      varying float vDown;
      void main() {
        vUV = aUV;
        vDown = aDown;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uTint;
      uniform float uWide;
      uniform float uCascade;
      varying vec2 vUV;
      varying float vDown;
      ${NOISE_GLSL}
      ${LIT_GLSL}
      void main() {
        // Strands: fixed across the sheet, each carrying lumps of white
        // water down it, faster the further it has fallen.
        float across = vUV.x * uWide;
        float run = sqrt(vDown + 0.3) * 2.2 - uTime * ${FALL_SPEED.toFixed(2)} * mix(0.55, 0.3, uCascade);
        float strands = vnoise(vec2(across * 2.3, 3.7));
        float lumps = vnoise(vec2(across * 5.0, run * 1.6));
        float fine = vnoise(vec2(across * 13.0 + 5.1, run * 4.1));
        // (gaps between the strands, opening as it falls)
        float body = smoothstep(0.12 + 0.2 * vUV.y, 0.7, 0.2 + 0.45 * strands + 0.3 * lumps + 0.25 * fine);
        // ragged at the sides, each side wandering as it falls
        float l = 0.04 + 0.14 * vnoise(vec2(run * 0.7, 9.1));
        float r = 0.04 + 0.14 * vnoise(vec2(run * 0.7, 23.7));
        float side = smoothstep(l - 0.05, l + 0.05, vUV.x) * smoothstep(r - 0.05, r + 0.05, 1.0 - vUV.x);
        // holding together at the lip, coming apart lower down; a cascade's
        // is a skin of white water over the stream
        float a = clamp(body * mix(1.05, 0.7, vUV.y), 0.0, 1.0) * side * smoothstep(0.0, 0.05, vUV.y + 0.02);
        a *= mix(1.0, 0.75, uCascade);
        // the creek's colour in it at the top, white below
        float white = clamp(smoothstep(0.02, 0.4, vUV.y) * 0.7 + fine * 0.5, 0.0, 1.0);
        vec3 c = airLight() * mix(uTint * 1.8, vec3(0.95), white);
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2; // over the stream's own water
  return mesh;
}

function mist(fall) {
  const h = fall.height;
  const n = Math.max(12, Math.round(h * MIST_PER_M));
  const [dx, dz] = fall.dir;
  const [ax, az] = [-dz, dx];
  const wide = Math.min(fall.width, Math.max(NARROWEST, h * WIDE)) * (1 + SPREAD);
  // where it lands, in the mesh's own frame (the lip is its middle)
  const [fx, , fz] = fall.foot;
  const [ox, oz] = [fx - fall.top[0] + dx * 0.4, fz - fall.top[2] + dz * 0.4];
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n * 3);
  let s = 0x2545f491 ^ Math.round(fall.top[0] * 7 + fall.top[2] * 13);
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < n; i++) {
    const side = (rnd() - 0.5) * wide;
    pos[i * 3] = ox + ax * side;
    pos[i * 3 + 1] = -h;
    pos[i * 3 + 2] = oz + az * side;
    seed[i * 3] = rnd();
    seed[i * 3 + 1] = rnd();
    seed[i * 3 + 2] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(ox, -h * 0.7, oz), h + wide + MIST_SIZE * 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...sky(), uDrop: { value: h }, uOut: { value: new THREE.Vector2(dx, dz) } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uLines;
      uniform float uDrop;
      uniform vec2 uOut;
      attribute vec3 aSeed;
      varying float vFade;
      void main() {
        float life = fract(aSeed.x + uTime / ${MIST_LIFE.toFixed(1)});
        vec3 p = position;
        // up off the pool, and off downstream and to the sides
        p.y += life * (0.25 + 0.3 * aSeed.y) * uDrop;
        p.xz += uOut * life * (1.0 + 2.5 * aSeed.z) + vec2(aSeed.y - 0.5, aSeed.z - 0.5) * life * 2.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = ${MIST_SIZE.toFixed(2)} * (0.35 + 0.65 * life) * clamp(uDrop / 6.0, 0.6, 1.6);
        gl_PointSize = clamp(size * projectionMatrix[1][1] * 0.5 * uLines / max(-mv.z, 0.1), 1.0, uLines * 0.25);
        vFade = sin(life * 3.14159) * (0.5 + 0.5 * aSeed.y);
      }`,
    fragmentShader: /* glsl */ `
      varying float vFade;
      ${LIT_GLSL}
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.0, 1.0, r)) * vFade * 0.1;
        gl_FragColor = vec4(airLight() * 0.95, a);
      }`,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.renderOrder = 3;
  return points;
}
