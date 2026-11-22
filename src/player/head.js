// The hiker's head, drawn from a photo of the man himself on a snowfield: a
// lean, long face with a straight, prominent nose, a full dark beard kept
// short on the cheeks and fuller at the chin, short dark hair under a brown
// snapback with a flat maroon brim, and white square-framed sunglasses with
// dark lenses that catch the sky.
//
// Everything is placed from the centre of the head (the group handed in),
// with +z the way the face looks and +y up, y = 0 at eye level, in metres,
// the size a real head is.
//
// The skin is one surface. A ray from the centre in each direction meets the
// skull, which is a few overlapping egg shapes rounded into one (the cranium,
// the cheekbones and upper jaw, the jaw, the chin); the face's own relief is
// then raised from its front: the nose, the brow, the eye sockets, the lips.
// The rays are packed close across the face, where that relief is, and
// spread out at the back of the head, where the cap and hair are.
//
// Hair is drawn as shells: copies of the skin where it grows, each further
// out, which the shader cuts into the cross-sections of strands at that
// height, so together they make a pile of strands thinning to their tips,
// combed the way they lie. Further off than a strand is a pixel, they are
// the lumpy mass they make together instead (HAIR_GLSL).

import * as THREE from 'three';
import { textile } from './clothing.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { smoothstep, lerp, clamp, phash } from '../noise.js';
import { NOISE_GLSL, SKY_GLSL, SKY_UNIFORMS_GLSL } from '../render/glsl.js';
import { SHARED, SKY } from '../render/uniforms.js';

const TAU = Math.PI * 2;

// ── The skull ───────────────────────────────────────────────────────────────
// Egg shapes, [centre, half-sizes], whose surfaces are rounded into one
// another over SKULL_ROUND (m).
const SKULL = [
  [[0, 0.024, -0.008], [0.0755, 0.097, 0.099]], // cranium
  [[0, -0.02, 0.013], [0.066, 0.056, 0.077]], // cheekbones and upper jaw
  [[0, -0.058, 0.004], [0.0555, 0.062, 0.083]], // jaw
  [[0, -0.097, 0.054], [0.029, 0.026, 0.032]], // chin
];
const SKULL_ROUND = 0.016;

// ── The face ────────────────────────────────────────────────────────────────
const EYE_X = 0.032; // half the distance between the pupils
const SOCKET = 0.0075; // how deep the eye sits under the brow
const BROW_Y = 0.024; // the brow ridge, above eye level
// The nose: from the bridge between the eyes (NASION) straight down its back
// to the tip, round the tip and back under it to the lip (SUBNASALE). Across,
// it is a ridge, rounded on top, whose sides slope down and out to the
// cheeks; fuller and rounder toward the tip. Its wings are swellings either
// side of its base. All smooth, so it is a long, strong nose and not a
// pinched one.
const NASION = { y: 0.014, z: 0.0912 };
const NOSE_SLOPE = 0.62; // how far forward its back comes for each metre down
const HUMP = 0.0007; // m, a hint of one partway down
const TIP = { y: -0.0362, round: 0.006 }; // where the tip is, and how round (m)
const UNDER = { z: 0.096, slope: 1.8 }; // under the tip: how far forward at the lip, and how steeply it rises
const BRIDGE_ROUND = 0.0042; // m, how round the top of the ridge is at the bridge
const TIP_ROUND = 0.0078; // ...and at the tip
const NOSE_STEEP = [1.45, 2.3]; // how steeply its sides fall, at the bridge and at the tip
const NOSE_SIDE_CURVE = 30; // 1/m: how the sides curve over, to turn into the cheek
const ALA = { x: 0.0115, y: -0.0412, rx: 0.0062, ry: 0.0056, lift: 0.0085 }; // the wings: where, how big, how far they stand out (m)
const SUBNASALE = -0.0498; // where the nose meets the upper lip
const MOUTH_Y = -0.0695; // the line between the lips, in the middle
const MOUTH_W = 0.0235; // half its width
const SMILE = 0.0035; // m the corners of the mouth turn up
const PARTED = 0.0026; // m between the lips, the upper teeth showing

// How finely the skin is cut: columns round, rows top to bottom, and how
// much closer together they are over the face than elsewhere.
const SKIN_GRID = { cols: 160, rows: 112, front: 3, band: 2.6 };
const HAIR_GRID = { cols: 104, rows: 76, front: 2.4, band: 2.2 };

// ── Hair ────────────────────────────────────────────────────────────────────
const SHELLS = 12; // layers of hair
const HAIR_LIFT = 0.0005; // m the innermost layer stands off the skin
const STRAND = 0.0007; // m between strands
const COMB = 0.7; // how far the tips lie over the way it's combed, for each metre of length
// How long it grows (m)
const BEARD_CHEEK = 0.008;
const BEARD_JAW = 0.0145;
const BEARD_CHIN = 0.0155;
const MOUSTACHE = 0.0075;
const SCALP = 0.0055; // short at the sides, under the cap
const BROWS = 0.0035;
const HAIR_EDGE = 0.005; // m over which hair thins out at its edges
const BEARD_COLOR = 0x3a2517;
const HAIR_COLOR = 0x37261a;

// ── Ears ────────────────────────────────────────────────────────────────────
// Where its middle is (m), half its height and width (m), and how far
// (radians) its back edge stands out from the head and its top leans back.
const EAR = { x: 0.0735, y: -0.006, z: -0.012, h: 0.031, w: 0.0168, flare: 0.36, lean: 0.2 };

// ── Sunglasses ──────────────────────────────────────────────────────────────
const GLASSES_Y = 0.002; // lens centres, a hair above eye level
const GLASSES_Z = 0.099; // the front of the frame at the bridge
const GLASSES_R = 0.1; // radius the front is bent round (m): a gentle wrap
const TEMPLE_END = new THREE.Vector3(0.084, 0.022, -0.02); // the arm rests on the ear

// ── Snapback ────────────────────────────────────────────────────────────────
// A high, boxy six-panel crown, worn level and a touch back.
const CROWN_RX = 0.086; // half-width at the band
const CROWN_RZ = 0.107; // half-depth at the band
const CROWN_Z = -0.008; // band centred a touch behind the face, over the hair
const CROWN_H_FRONT = 0.104; // crown height over the band at the front panel
const CROWN_H_BACK = 0.09;
const CROWN_SQUARE = 4.5; // 2 is a dome; more is boxier
const HAT_Y = 0.029; // the band, above eye level
const HAT_TILT = -0.08; // radians; negative tips the brim up
const BRIM_W = 0.094; // half-width
const BRIM_L = 0.072; // how far it reaches past the front of the crown
const BRIM_ATTACH = 1.2; // radians round the band from the front that it's sewn to

const M = (hex, rough = 0.85, extra) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0, ...extra });

const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _c = new THREE.Color();

const gauss = (u, v = 0) => Math.exp(-(u * u + v * v));

// The larger of a and b, rounded where they're within k of each other.
function smax(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

// How far along the ray from the centre in unit direction n its surface is,
// for an egg shape [centre, half-sizes]; 0 if the ray misses it.
function rayToEgg(n, [c, r]) {
  let a = 0;
  let b = 0;
  let k = -1;
  for (let i = 0; i < 3; i++) {
    const ni = n.getComponent(i) / r[i];
    const ci = c[i] / r[i];
    a += ni * ni;
    b -= 2 * ni * ci;
    k += ci * ci;
  }
  const disc = b * b - 4 * a * k;
  if (disc < 0) return 0;
  return Math.max(0, (-b + Math.sqrt(disc)) / (2 * a));
}

// The smaller of a and b, rounded where they're within k of each other.
const smin = (a, b, k) => -smax(-a, -b, k);

// The nose seen from the front: how far forward it comes at (x, y), or -1
// off it (the wings are in relief()).
function nose(x, y) {
  if (y > NASION.y + 0.012 || y < SUBNASALE - 0.006) return -1;
  const t = clamp((NASION.y - y) / (NASION.y - TIP.y), 0, 1); // 0 at the bridge, 1 at the tip
  // down the middle: its straight back, and the underside rising from the
  // lip, rounded into each other at the tip
  const back = NASION.z + (NASION.y - y) * NOSE_SLOPE + HUMP * Math.sin(Math.PI * t) - 2.5 * Math.max(0, y - NASION.y);
  const under = UNDER.z + (y - SUBNASALE) * UNDER.slope;
  const mid = smin(back, under, TIP.round);
  const round = lerp(BRIDGE_ROUND, TIP_ROUND, t * t);
  const steep = lerp(NOSE_STEEP[0], NOSE_STEEP[1], t);
  return mid - steep * (Math.hypot(x, round) - round) - NOSE_SIDE_CURVE * x * x;
}

// The line between the lips at x: up at the corners in a smile.
const mouthY = (x) => MOUTH_Y + SMILE * Math.min(1, (x / MOUTH_W) ** 2);

// The face's relief over the skull's front z0 at (x, y): its new z.
function relief(x, y, z0) {
  const ax = Math.abs(x);
  const my = mouthY(x);
  let z = z0;
  z -= SOCKET * gauss((ax - EYE_X) / 0.0165, (y - 0.001) / 0.0135); // eye sockets
  z += 0.0035 * gauss((ax - 0.03) / 0.024, (y - BROW_Y) / 0.0075); // brow ridge
  z -= 0.0012 * gauss(ax / 0.01, (y - 0.012) / 0.008); // the dip at the top of the nose
  z += 0.0042 * gauss((ax - 0.047) / 0.016, (y + 0.021) / 0.013); // cheekbones
  z += 0.0035 * gauss((ax - 0.035) / 0.016, (y + 0.026) / 0.013); // the round of the cheeks, lifted by the smile
  z += 0.0055 * gauss(ax / 0.028, (y - MOUTH_Y) / 0.019); // the teeth behind the lips
  z += 0.0022 * gauss(ax / 0.02, (y - my - 0.0035) / 0.0034) * smoothstep(MOUTH_W, MOUTH_W - 0.008, ax); // upper lip
  z += 0.0024 * gauss(ax / 0.018, (y - my + PARTED + 0.0035) / 0.0042) * smoothstep(MOUTH_W, MOUTH_W - 0.009, ax); // lower lip
  z -= 0.0034 * gauss(ax / MOUTH_W, (y - my + PARTED / 2) / (0.0012 + PARTED / 2)); // between them
  z -= 0.0018 * gauss(ax / 0.016, (y - MOUTH_Y + 0.017) / 0.005); // under the lower lip
  z += 0.0028 * gauss(ax / 0.016, (y + 0.1) / 0.01); // point of the chin
  z += ALA.lift * gauss((ax - ALA.x) / ALA.rx, (y - ALA.y) / ALA.ry); // the wings of the nose
  z -= 0.0008 * gauss((ax - ALA.x - ALA.rx * 1.2) / 0.0028, (y - ALA.y) / 0.007); // the crease round them
  return smax(z, nose(x, y), 0.005);
}

// The skin in unit direction n: out = its point.
function skinPoint(n, out) {
  let r = 0;
  for (const egg of SKULL) r = smax(r, rayToEgg(n, egg), SKULL_ROUND);
  out.copy(n).multiplyScalar(r);
  // the face is raised from the front only
  const w = smoothstep(0.01, 0.05, out.z);
  if (w > 0) out.z = lerp(out.z, relief(out.x, out.y, out.z), w);
  return out;
}

// n+1 values from lo to hi, closer together where density(v) is higher.
function spaced(n, lo, hi, density) {
  const N = 2048;
  const cdf = new Float64Array(N + 1);
  for (let k = 1; k <= N; k++) cdf[k] = cdf[k - 1] + density(lo + (hi - lo) * (k - 0.5) / N);
  const out = [];
  let k = 0;
  for (let i = 0; i <= n; i++) {
    const target = (cdf[N] * i) / n;
    while (k < N - 1 && cdf[k + 1] < target) k++;
    const f = clamp((target - cdf[k]) / Math.max(1e-12, cdf[k + 1] - cdf[k]), 0, 1);
    out.push(lo + ((hi - lo) * (k + f)) / N);
  }
  return out;
}

// The skin as a closed grid of rays: rows from the crown to under the chin,
// columns round from the back, with a single point at each pole. -> a
// geometry with the positions on the skin and smooth normals.
function skinGrid({ cols, rows, front, band }) {
  const az = spaced(cols, -Math.PI, Math.PI, (a) => 1 + (front - 1) * gauss(a / 0.75));
  const po = spaced(rows, 0, Math.PI, (t) => 1 + (band - 1) * gauss((t - 1.95) / 0.55));
  const dirs = [];
  dirs.push(new THREE.Vector3(0, 1, 0));
  for (let j = 1; j < rows; j++) {
    const s = Math.sin(po[j]);
    const c = Math.cos(po[j]);
    for (let i = 0; i < cols; i++) dirs.push(new THREE.Vector3(s * Math.sin(az[i]), c, s * Math.cos(az[i])));
  }
  dirs.push(new THREE.Vector3(0, -1, 0));
  const at = (j, i) => 1 + (j - 1) * cols + (i % cols);
  const bottom = dirs.length - 1;
  const index = [];
  for (let i = 0; i < cols; i++) index.push(0, at(1, i), at(1, i + 1));
  for (let j = 1; j < rows - 1; j++) {
    for (let i = 0; i < cols; i++) {
      const a = at(j, i);
      const b = at(j, i + 1);
      const c = at(j + 1, i);
      const d = at(j + 1, i + 1);
      index.push(a, c, b, b, c, d);
    }
  }
  for (let i = 0; i < cols; i++) index.push(bottom, at(rows - 1, i + 1), at(rows - 1, i));
  const pos = new Float32Array(dirs.length * 3);
  dirs.forEach((n, i) => skinPoint(n, _p).toArray(pos, i * 3));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

// ── Where hair grows ────────────────────────────────────────────────────────
// At a point p on the skin: { len (m), flow (which way it's combed, a unit
// vector along the skin), color }. len is 0 where there's none.
const _hair = { len: 0, flow: new THREE.Vector3(), color: new THREE.Color() };
const cBeard = new THREE.Color(BEARD_COLOR);
const cHair = new THREE.Color(HAIR_COLOR);
const cAuburn = new THREE.Color(0x553420);

// Height of the beard's upper edge at angle a round from the front (0) to
// the ear (pi/2): under the nose, across the cheek and up the sideburn.
const cheekLine = (a) => lerp(lerp(SUBNASALE - 0.0015, -0.031, smoothstep(0.24, 0.62, a)), 0.016, smoothstep(0.62, 1.32, a));

function hairAt(p, normal) {
  const ax = Math.abs(p.x);
  const a = Math.atan2(ax, p.z); // 0 ahead, pi/2 at the ear, pi behind
  const out = _hair;
  out.len = 0;
  // the ear: none on it or right round it
  const ear = ((p.y - EAR.y) / (EAR.h + 0.003)) ** 2 + ((p.z - EAR.z + 0.004) / (EAR.w + 0.001)) ** 2;

  // Beard: below the cheek line; not behind the ear except under the jaw.
  const below = cheekLine(Math.min(a, 1.45)) - p.y;
  const behind = smoothstep(1.5, 1.62, a); // past the front of the ear
  const underJaw = smoothstep(-0.062, -0.085, p.y + 0.025 * (a - 1.5));
  let beard = smoothstep(0, HAIR_EDGE, below) * lerp(1, underJaw, behind);
  beard *= smoothstep(2.25, 2.0, a); // not round to the nape
  // the lips are bare: the lower lip and the corners of the mouth
  const lip = (p.x / (MOUTH_W - 0.002)) ** 2 + ((p.y - mouthY(p.x) + PARTED + 0.003) / 0.0068) ** 2;
  beard *= Math.min(1, smoothstep(0.75, 1.25, lip) + smoothstep(0.35, 0.55, a));
  // nor is the very edge of the upper lip, where the moustache hangs over it
  beard *= 1 - 0.7 * gauss(p.x / 0.02, (p.y - mouthY(p.x) - 0.0025) / 0.003) * smoothstep(0.02, 0.07, p.z);
  if (beard > 0.001) {
    const chin = gauss(p.x / 0.04, (p.y + 0.105) / 0.022);
    let len = lerp(BEARD_CHEEK, BEARD_JAW, smoothstep(-0.03, -0.085, p.y)) + (BEARD_CHIN - BEARD_JAW) * chin;
    // a short moustache, and short at the sideburn
    const lipTop = gauss(p.x / 0.03, (p.y - (SUBNASALE + MOUTH_Y) / 2) / 0.01) * smoothstep(0.03, 0.07, p.z);
    len = lerp(len, MOUSTACHE, lipTop);
    len *= lerp(1, 0.7, smoothstep(0.9, 1.4, a) * smoothstep(-0.05, 0.0, p.y));
    out.len = len * beard;
    // combed down, and out from the middle over the lip
    out.flow.set(Math.sign(p.x) * 0.6 * lipTop, -1, 0.25 + 0.3 * chin);
    out.color.copy(cBeard).lerp(cAuburn, 0.35 * chin);
  }

  // Scalp: above the hairline round the ear and down to the nape; below the
  // cap's band, which hides the rest.
  const hairline = lerp(lerp(0.075, 0.026, smoothstep(1.0, 1.4, a)), -0.07, smoothstep(1.6, 2.5, a));
  const band = HAT_Y - p.z * Math.sin(HAT_TILT) + 0.006; // tucked up under the cap's band
  const scalp = smoothstep(hairline, hairline + HAIR_EDGE, p.y) * smoothstep(1.3, 1.45, a) * smoothstep(band + 0.004, band, p.y);
  if (scalp * SCALP > out.len) {
    out.len = SCALP * scalp * lerp(1, 0.6, smoothstep(-0.03, -0.07, p.y));
    out.flow.set(0, -0.8, -0.6);
    out.color.copy(cHair);
  }

  // Eyebrows: an arch over each eye, thick at the inner end, thin at the tail.
  const t = (ax - 0.009) / 0.044; // 0 at the inner end, 1 at the tail
  if (t > -0.2 && t < 1.2 && p.z > 0.03) {
    const mid = BROW_Y - 0.002 + 0.006 * Math.sin(Math.PI * clamp(t * 0.9 + 0.05, 0, 1)) - 0.004 * smoothstep(0.7, 1.1, t);
    const half = lerp(0.0055, 0.0022, clamp(t, 0, 1));
    const brow = smoothstep(half + 0.0015, half - 0.0015, Math.abs(p.y - mid)) * smoothstep(-0.15, 0.05, t) * smoothstep(1.15, 0.95, t);
    if (brow * BROWS > out.len) {
      out.len = BROWS * brow;
      out.flow.set(Math.sign(p.x), 0.25 - 0.6 * t, 0);
      out.color.copy(cHair);
    }
  }
  if (ear < 1) out.len *= smoothstep(0.6, 1, ear);
  // comb it along the skin
  out.flow.addScaledVector(normal, -out.flow.dot(normal)).normalize();
  return out;
}

// ── Skin colour ─────────────────────────────────────────────────────────────
const cRosy = new THREE.Color(0xb8664f);
const cLip = new THREE.Color(0x8e5a4d);
const cBrow = new THREE.Color(0xdcae90);
const cRoot = new THREE.Color(0x3a281e); // skin seen through a thick beard
const cNostril = new THREE.Color(0x24130e);
const cSocket = new THREE.Color(0x6b4a3c);
const cTeeth = new THREE.Color(0xcfc4b2);
const cMouth = new THREE.Color(0x2a1410);
const _c2 = new THREE.Color();

function skinColor(p, nrm, hair, base, out) {
  const ax = Math.abs(p.x);
  out.copy(base);
  // sun-browned forehead, a little lighter
  out.lerp(cBrow, 0.12 * smoothstep(0.02, 0.05, p.y));
  // colour in the nose, the cheeks above the beard and the ears
  const flush = 0.28 * gauss(p.x / 0.014, (p.y - TIP.y - 0.004) / 0.014) + 0.3 * gauss((ax - 0.045) / 0.018, (p.y + 0.022) / 0.014);
  out.lerp(cRosy, Math.min(0.5, flush) * smoothstep(0.03, 0.07, p.z));
  // the sockets, in the glasses' shade
  out.lerp(cSocket, 0.3 * gauss((ax - EYE_X) / 0.014, (p.y - 0.004) / 0.008) * smoothstep(0.04, 0.07, p.z));
  // lips
  const my = mouthY(p.x);
  const lip = (p.x / (MOUTH_W - 0.002)) ** 2 + ((p.y - my + PARTED / 2) / (0.0072 + PARTED / 2)) ** 2;
  out.lerp(cLip, 0.7 * smoothstep(1, 0.55, lip) * smoothstep(0.06, 0.08, p.z));
  // where they part: the upper teeth, and the dark of the mouth under them
  const gap = gauss(p.x / (MOUTH_W - 0.003), 0) * smoothstep(0.07, 0.085, p.z);
  const inGap = smoothstep(0.0006, -0.0002, p.y - my) * smoothstep(-PARTED - 0.0006, -PARTED + 0.0002, p.y - my);
  const teeth = smoothstep(-PARTED * 0.75, -PARTED * 0.35, p.y - my);
  out.lerp(_c2.copy(cMouth).lerp(cTeeth, teeth * smoothstep(MOUTH_W - 0.004, MOUTH_W - 0.012, Math.abs(p.x))), inGap * gap);
  // nostrils, under the tip either side
  const nostril = gauss((ax - 0.0066) / 0.0028, (p.y - SUBNASALE - 0.0032) / 0.0022) * smoothstep(-0.3, -0.7, nrm.y);
  out.lerp(cNostril, 0.75 * nostril);
  // faintly blotchy, as skin is
  out.multiplyScalar(0.97 + 0.06 * phash(p.x * 900, p.y * 900, p.z * 900));
  // dark under hair, so the gaps between strands don't show bare skin
  out.lerp(cRoot, smoothstep(0, 0.6, hair.len / 0.004));
  return out;
}

// ── Shaders ─────────────────────────────────────────────────────────────────
// Skin lets light in and out again a little way off, reddened: the direct
// light wraps further round into the shade than on a hard surface, and red
// furthest. (Patched into three's direct light, for the skin only.)
const SKIN_WRAP = '0.32, 0.17, 0.12'; // how far round each of red, green, blue wraps (as a cosine)
function skinLight(shader) {
  const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
  const line = 'reflectedLight.directDiffuse += irradiance * diffuseBRDF * ( 1.0 - F );';
  if (!chunk.includes(line)) return;
  shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', chunk.replace(line, `{
      vec3 wrap = vec3(${SKIN_WRAP});
      float ndl = dot(geometryNormal, directLight.direction);
      vec3 wrapped = clamp((vec3(ndl) + wrap) / (1.0 + wrap), 0.0, 1.0) / (1.0 + wrap * 0.5);
      reflectedLight.directDiffuse += directLight.color * wrapped * diffuseBRDF * (1.0 - F);
    }`));
}

// One strand per cell of a fine lattice in the head's own space; at each
// layer, its cross-section is cut out where the strand reaches. Strands
// taper and stop at different lengths, so the outside is ragged. Once a
// strand is under a pixel or so, the layers are cut instead to a lumpy
// surface at about half the hair's length (steep-edged, so it reads as a
// solid mass of hair and not a haze).
const HAIR_GLSL = /* glsl */ `
float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x);
  float b = mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x);
  float c = mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x);
  float d = mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x);
  return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
}
float hairCover(vec3 root, float h, float len, float fw, out float tone) {
  vec3 q = root / ${STRAND};
  vec3 cell = floor(q);
  float r1 = hash13(cell);
  float r2 = hash13(cell + 17.31);
  vec3 jitter = vec3(hash13(cell + 3.7), hash13(cell + 7.9), hash13(cell + 11.3)) - 0.5;
  float thick = smoothstep(0.0, ${HAIR_EDGE * 0.6}, len); // sparse where it thins out
  float reach = 0.5 + 0.5 * r1; // how far out this strand gets, of the hair's length
  float there = step(r2, thick) * step(h, reach);
  float radius = 0.46 * (1.0 - 0.7 * h / reach);
  float d = length(fract(q) - 0.5 - jitter * 0.35);
  float aa = fw / ${STRAND};
  float near = there * (1.0 - smoothstep(radius - aa, radius + aa, d));
  float lump = vnoise3(root / 0.0035) * 0.6 + vnoise3(root / 0.0013) * 0.4;
  float far = step(h, (0.25 + 0.6 * lump) * thick);
  tone = mix(0.7 + 0.6 * r1, 0.6 + 0.8 * lump, smoothstep(0.6, 1.4, aa));
  return mix(near, far, smoothstep(0.6, 1.4, aa));
}
`;

function hairMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, alphaToCoverage: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uAlphaCut = SHARED.uAlphaCut;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aShell;
        attribute float aLen;
        attribute vec3 aFlow;
        varying vec3 vRoot;
        varying float vShell;
        varying float vLen;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRoot = position;
        vShell = aShell;
        vLen = aLen;
        transformed += normal * (${HAIR_LIFT} + aShell * aLen) + aFlow * aLen * aShell * aShell * ${COMB.toFixed(3)};`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uAlphaCut;
        varying vec3 vRoot;
        varying float vShell;
        varying float vLen;
        ${NOISE_GLSL}
        ${HAIR_GLSL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float tone;
        float cov = hairCover(vRoot, vShell, vLen, max(length(fwidth(vRoot)), 1e-6), tone);
        if (cov < uAlphaCut) discard;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= tone * mix(0.3, 1.0, pow(vShell, 0.8)); // darker in among the roots
        diffuseColor.a = clamp((cov - 0.5) * 1.5 + 0.5, 0.0, 1.0);`);
  };
  mat.customProgramCacheKey = () => 'hiker-hair-v1';
  return mat;
}

// Dark lenses with a mirror coat: the sky in them, more at a glancing look.
function lensMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.06, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SKY);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${SKY_UNIFORMS_GLSL}
        ${SKY_GLSL}`)
      .replace('#include <opaque_fragment>', `{
          vec3 v = normalize(vViewPosition);
          vec3 r = transformNormalByInverseViewMatrix(reflect(-v, normal), viewMatrix);
          float f = 0.18 + 0.82 * pow(1.0 - clamp(dot(normal, v), 0.0, 1.0), 4.0);
          // below the horizon it's the ground, darker
          vec3 seen = r.y > 0.0 ? skyGradient(r) : uHorizon * 0.25;
          outgoingLight += seen * f * vec3(0.55, 0.68, 0.95);
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'hiker-lens-v1';
  return mat;
}

// ── Building it ─────────────────────────────────────────────────────────────

// The skin and hair are the same for every hiker; work them out once.
let shapes = null;
function headShapes(skinHex) {
  if (shapes && shapes.skinHex === skinHex) return shapes;
  const base = new THREE.Color(skinHex);

  // The skin, coloured.
  const skin = skinGrid(SKIN_GRID);
  {
    const p = skin.attributes.position;
    const nrm = skin.attributes.normal;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      _p.fromBufferAttribute(p, i);
      _n.fromBufferAttribute(nrm, i);
      skinColor(_p, _n, hairAt(_p, _n), base, _c).toArray(col, i * 3);
    }
    skin.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }

  // The hair: the triangles of a coarser grid that have any, in layers. The
  // layers go in an order where every first few spread through the whole
  // depth (Van der Corput's), so drawing only the first few, from far off,
  // still fills it.
  const grid = skinGrid(HAIR_GRID);
  const gp = grid.attributes.position;
  const gn = grid.attributes.normal;
  const len = new Float32Array(gp.count);
  const flow = new Float32Array(gp.count * 3);
  const col = new Float32Array(gp.count * 3);
  for (let i = 0; i < gp.count; i++) {
    _p.fromBufferAttribute(gp, i);
    _n.fromBufferAttribute(gn, i);
    const h = hairAt(_p, _n);
    len[i] = h.len;
    h.flow.toArray(flow, i * 3);
    h.color.toArray(col, i * 3);
  }
  const gi = grid.index.array;
  const keep = [];
  for (let t = 0; t < gi.length; t += 3) {
    if (len[gi[t]] > 0 || len[gi[t + 1]] > 0 || len[gi[t + 2]] > 0) keep.push(gi[t], gi[t + 1], gi[t + 2]);
  }
  const used = [...new Set(keep)];
  const remap = new Map(used.map((v, i) => [v, i]));
  const nv = used.length;
  const layer = (k) => {
    let x = 0;
    let f = 0.5;
    for (let b = k + 1; b > 0; b >>= 1, f /= 2) if (b & 1) x += f;
    return x;
  };
  const hp = new Float32Array(nv * SHELLS * 3);
  const hn = new Float32Array(nv * SHELLS * 3);
  const hf = new Float32Array(nv * SHELLS * 3);
  const hc = new Float32Array(nv * SHELLS * 3);
  const hl = new Float32Array(nv * SHELLS);
  const hs = new Float32Array(nv * SHELLS);
  const hi = new Uint32Array(keep.length * SHELLS);
  for (let s = 0; s < SHELLS; s++) {
    const h = layer(s);
    used.forEach((v, j) => {
      const o = s * nv + j;
      for (let k = 0; k < 3; k++) {
        hp[o * 3 + k] = gp.array[v * 3 + k];
        hn[o * 3 + k] = gn.array[v * 3 + k];
        hf[o * 3 + k] = flow[v * 3 + k];
        hc[o * 3 + k] = col[v * 3 + k];
      }
      hl[o] = len[v];
      hs[o] = h;
    });
    keep.forEach((v, t) => (hi[s * keep.length + t] = s * nv + remap.get(v)));
  }
  shapes = { skinHex, skin, hair: { hp, hn, hf, hc, hl, hs, hi, perShell: keep.length } };
  return shapes;
}

// A fresh geometry over the same arrays (each hiker disposes its own).
function hairGeometry({ hp, hn, hf, hc, hl, hs, hi }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(hp, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(hn, 3));
  g.setAttribute('aFlow', new THREE.BufferAttribute(hf, 3));
  g.setAttribute('color', new THREE.BufferAttribute(hc, 3));
  g.setAttribute('aLen', new THREE.BufferAttribute(hl, 1));
  g.setAttribute('aShell', new THREE.BufferAttribute(hs, 1));
  g.setIndex(new THREE.BufferAttribute(hi, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -0.02, 0), 0.16);
  return g;
}

// An ear, the right one (+x), from its middle: x out from the head, y up,
// z ahead. Outlined as a tall egg narrowing to the lobe; the rim (helix)
// rolls over all round its back, the ridge inside it (antihelix) runs round
// the bowl (concha) that leads into the head, and the little flap in front
// of that (tragus) stands over it. The back is a shallow dome; the two meet
// at the rim.
function earGeometry(base) {
  const RINGS = 14;
  const SECTORS = 44;
  const pos = [];
  const index = [];
  const outline = (th) => {
    const up = Math.sin(th);
    const wide = EAR.w * (1 + 0.12 * up - 0.28 * smoothstep(-0.2, -1, up) * smoothstep(-0.6, 0.3, -Math.cos(th)));
    return [Math.cos(th) * wide, up * EAR.h];
  };
  const height = (r, th) => {
    const back = Math.cos(th); // 1 at the back of the ear (away from the face), -1 at the front
    const up = Math.sin(th);
    const [v, u] = outline(th).map((x) => x * r);
    const helix = 0.0036 * gauss((r - 0.86) / 0.075) * smoothstep(-0.8, -0.3, Math.max(up, back));
    const scapha = -0.0014 * gauss((r - 0.7) / 0.05) * smoothstep(-0.2, 0.4, Math.max(up, back));
    const anti = 0.0022 * gauss((r - 0.52) / 0.07) * smoothstep(-0.5, 0.2, back + up * 0.6);
    const concha = -0.0055 * gauss((v + 0.003) / 0.0085, (u + 0.004) / 0.011);
    const tragus = 0.0035 * gauss((v + 0.0125) / 0.0035, (u + 0.004) / 0.005);
    const lobe = 0.0016 * smoothstep(-0.4, -0.9, up) * gauss((r - 0.6) / 0.3);
    return (0.0022 + helix + scapha + anti + concha + tragus + lobe) * smoothstep(1, 0.9, r);
  };
  // front surface rings 0..RINGS (ring RINGS is the rim, shared), back after
  const col = [];
  const put = (r, th, w) => {
    const [v, u] = outline(th).map((x) => x * r);
    pos.push(w, u, -v);
    // flushed at the rim, shadowed down in the bowl
    _c.copy(base).lerp(cRosy, 0.2 + 0.25 * smoothstep(0.6, 1, r)).multiplyScalar(lerp(1, 0.55, smoothstep(0, -0.004, w)));
    col.push(_c.r, _c.g, _c.b);
  };
  put(0, 0, height(0, 0));
  for (let k = 1; k <= RINGS; k++) {
    for (let s = 0; s < SECTORS; s++) {
      const th = (s / SECTORS) * TAU;
      put(k / RINGS, th, height(k / RINGS, th));
    }
  }
  const backCentre = pos.length / 3;
  put(0, 0, -0.0035);
  for (let k = 1; k < RINGS; k++) {
    for (let s = 0; s < SECTORS; s++) {
      const r = k / RINGS;
      put(r, (s / SECTORS) * TAU, -0.0035 * (1 - r * r));
    }
  }
  const F = (k, s) => (k === 0 ? 0 : 1 + (k - 1) * SECTORS + (s % SECTORS));
  const B = (k, s) => (k === RINGS ? F(RINGS, s) : k === 0 ? backCentre : backCentre + 1 + (k - 1) * SECTORS + (s % SECTORS));
  for (let k = 0; k < RINGS; k++) {
    for (let s = 0; s < SECTORS; s++) {
      if (k === 0) {
        index.push(F(0, 0), F(1, s), F(1, s + 1));
        index.push(B(0, 0), B(1, s + 1), B(1, s));
      } else {
        index.push(F(k, s), F(k + 1, s), F(k + 1, s + 1), F(k, s), F(k + 1, s + 1), F(k, s + 1));
        index.push(B(k, s), B(k + 1, s + 1), B(k + 1, s), B(k, s), B(k, s + 1), B(k + 1, s + 1));
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// Bend a flat piece round the face: x runs along it, z is outward, and the
// piece is wrapped round a vertical cylinder of radius r whose front is at
// z = front.
function wrapRound(geo, r, frontZ) {
  const p = geo.attributes.position;
  const nrm = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const a = p.getX(i) / r;
    const d = r + p.getZ(i);
    const s = Math.sin(a);
    const c = Math.cos(a);
    p.setXYZ(i, s * d, p.getY(i), frontZ - r + c * d);
    if (nrm) {
      const nx = nrm.getX(i);
      const nz = nrm.getZ(i);
      nrm.setXYZ(i, nx * c + nz * s, nrm.getY(i), -nx * s + nz * c);
    }
  }
  return geo;
}

// Flat geometry has big triangles; cut them small enough to bend smoothly.
const fine = (geo) => new TessellateModifier(0.005, 8).modify(geo);

// A rounded rectangle as a path: [x0, x1] by [y0, y1], corner radius r,
// with the bottom corner at x0 (by the nose) rounder still (rIn).
function roundRect(path, x0, y0, x1, y1, r, rIn) {
  return path.moveTo(x0 + r, y1)
    .lineTo(x1 - r, y1).quadraticCurveTo(x1, y1, x1, y1 - r)
    .lineTo(x1, y0 + r).quadraticCurveTo(x1, y0, x1 - r, y0)
    .lineTo(x0 + rIn, y0).quadraticCurveTo(x0, y0, x0, y0 + rIn)
    .lineTo(x0, y1 - r).quadraticCurveTo(x0, y1, x0 + r, y1);
}

// The face, the hair and beard, the sunglasses and the cap, built onto
// `head`. -> { brow, crown }: where something worn on the cap goes
// (Character.addWorn), and the crown's size there, for a strap round it.
export function buildHead(head, skin) {
  const cast = (m) => {
    m.castShadow = true;
    return m;
  };
  const { skin: skinGeo, hair } = headShapes(skin.color.getHex());

  // ── Skin ──
  const skinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52, metalness: 0 });
  skinMat.onBeforeCompile = skinLight;
  skinMat.customProgramCacheKey = () => 'hiker-skin-v1';
  const face = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) face.setAttribute(name, skinGeo.attributes[name]);
  face.setIndex(skinGeo.index);
  head.add(cast(new THREE.Mesh(face, skinMat)));

  // ── Hair and beard ──
  // Fewer layers from further off: no more than one every couple of pixels
  // through the beard's depth.
  const hairMesh = new THREE.Mesh(hairGeometry(hair), hairMaterial());
  hairMesh.onBeforeRender = (renderer, scene, camera) => {
    hairMesh.getWorldPosition(_q);
    const dist = Math.max(0.05, _q.distanceTo(camera.getWorldPosition(_p)));
    const px = (BEARD_CHIN * SHARED.uLines.value * 0.5 * camera.projectionMatrix.elements[5]) / dist;
    const layers = clamp(Math.ceil(px / 2), 3, SHELLS);
    hairMesh.geometry.setDrawRange(0, layers * hair.perShell);
  };
  head.add(hairMesh);

  // ── Ears ──
  const earGeo = earGeometry(skin.color);
  for (const sx of [-1, 1]) {
    const ear = cast(new THREE.Mesh(earGeo, skinMat));
    ear.position.set(sx * EAR.x, EAR.y, EAR.z);
    ear.rotation.set(-EAR.lean, -sx * EAR.flare, 0, 'YXZ');
    ear.scale.x = sx;
    head.add(ear);
  }

  // ── Sunglasses ──
  // One side is drawn (u along the face from the bridge, v up from the lens
  // centres) and the other is its mirror. Thick white square frames; the
  // lenses sit in them, set back a little, so the frame shows as a rim.
  const frameMat = M(0xf2f1ec, 0.28);
  const lensMat = lensMaterial();
  const LX0 = 0.009, LX1 = 0.058, LY0 = -0.0162, LY1 = 0.0158; // the lens
  // The frame: a thick rim round the lens, carried across the nose as a
  // bridge above it.
  const TOP = LY1 + 0.0055, BOT = LY0 - 0.0036, OUT = LX1 + 0.0062, IN = LX0 - 0.0034;
  const outer = new THREE.Shape().moveTo(0, TOP)
    .lineTo(OUT - 0.007, TOP).quadraticCurveTo(OUT, TOP, OUT, TOP - 0.007)
    .lineTo(OUT, BOT + 0.008).quadraticCurveTo(OUT, BOT, OUT - 0.008, BOT)
    .lineTo(IN + 0.013, BOT).quadraticCurveTo(IN, BOT, IN, BOT + 0.013)
    .quadraticCurveTo(IN, 0.0085, 0.0025, 0.0098).lineTo(0, 0.0098).lineTo(0, TOP);
  // the lens's hole, going round the other way
  outer.holes.push(new THREE.Path(roundRect(new THREE.Path(), LX0, LY0, LX1, LY1, 0.0065, 0.011).getPoints(10).reverse()));
  const frameFlat = new THREE.ExtrudeGeometry(outer, { depth: 0.0048, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 2, curveSegments: 8 });
  frameFlat.translate(0, 0, -0.0048);
  const frameGeo = wrapRound(fine(frameFlat), GLASSES_R, GLASSES_Z);
  frameGeo.computeVertexNormals();
  const lensShape = roundRect(new THREE.Shape(), LX0 - 0.001, LY0 - 0.001, LX1 + 0.001, LY1 + 0.001, 0.007, 0.0115);
  const lensFlat = new THREE.ShapeGeometry(lensShape, 8);
  lensFlat.translate(0, 0, -0.0022);
  const lensGeo = wrapRound(fine(lensFlat), GLASSES_R, GLASSES_Z);
  const glasses = new THREE.Group();
  glasses.position.y = GLASSES_Y;
  head.add(glasses);
  // where the frame ends at the temple, for the arm to carry on from
  const hingeU = LX1 + 0.0055;
  const a = hingeU / GLASSES_R;
  _p.set(Math.sin(a) * (GLASSES_R - 0.003), LY1 - 0.003, GLASSES_Z - GLASSES_R + Math.cos(a) * (GLASSES_R - 0.003));
  for (const sx of [-1, 1]) {
    const side = new THREE.Group();
    side.scale.x = sx;
    side.add(cast(new THREE.Mesh(frameGeo, frameMat)));
    side.add(new THREE.Mesh(lensGeo, lensMat));
    // the arm, straight back to the ear, then down behind it
    _q.copy(TEMPLE_END);
    _q.y -= GLASSES_Y;
    const len = _p.distanceTo(_q);
    const arm = cast(new THREE.Mesh(new THREE.BoxGeometry(0.0034, 0.0075, len), frameMat));
    arm.position.copy(_p).add(_q).multiplyScalar(0.5);
    arm.lookAt(_q);
    side.add(arm);
    const tip = cast(new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.004, 0.026), frameMat));
    tip.position.copy(_q).add(new THREE.Vector3(-0.002, -0.009, -0.009));
    tip.rotation.x = -0.9;
    side.add(tip);
    glasses.add(side);
  }

  // ── Snapback ──
  const crownMat = M(0x6c5932, 0.95, { side: THREE.DoubleSide, ...textile('twill') });
  const hat = new THREE.Group();
  hat.position.y = HAT_Y;
  hat.rotation.x = HAT_TILT;
  head.add(hat);
  // A superellipse in profile: flat-topped with steep sides, taller at the
  // front panel than at the back.
  const e = 2 / CROWN_SQUARE;
  const crownAt = (dx, dz, h, out) => {
    const H = lerp(CROWN_H_BACK, CROWN_H_FRONT, (dz + 1) / 2);
    const r = Math.pow(Math.max(0, 1 - h * h), e / 2);
    return out.set(dx * r * CROWN_RX, Math.pow(h, e) * H, dz * r * CROWN_RZ + CROWN_Z);
  };
  const crownGeo = new THREE.SphereGeometry(1, 36, 12, -Math.PI / 2, TAU, 0, Math.PI / 2);
  {
    const p = crownGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const r = Math.hypot(x, z);
      crownAt(r > 1e-6 ? x / r : 0, r > 1e-6 ? z / r : 0, y, _p);
      p.setXYZ(i, _p.x, _p.y, _p.z);
    }
    crownGeo.computeVertexNormals();
  }
  hat.add(cast(new THREE.Mesh(crownGeo, crownMat)));
  const seam = M(0x56452f, 0.94);
  const seams = [];
  for (let panel = 0; panel < 6; panel++) {
    const a = (panel + 0.5) * TAU / 6;
    const path = [];
    for (let i = 0; i <= 10; i++) {
      const h = Math.sin(i * Math.PI / 20) * 0.998;
      path.push(crownAt(Math.sin(a), Math.cos(a), h, new THREE.Vector3()));
    }
    seams.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 14, 0.001, 4));
  }
  // and a stitched band round the bottom
  const bandPath = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * TAU;
    bandPath.push(crownAt(Math.sin(a), Math.cos(a), 0.0015, new THREE.Vector3()));
  }
  seams.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bandPath, true), 60, 0.0009, 4, true));
  hat.add(cast(new THREE.Mesh(mergeGeometries(seams), seam)));
  // The flat brim: sewn to the front of the band, out to a rounded front.
  {
    const s = new THREE.Shape();
    const zA = CROWN_Z + CROWN_RZ * Math.cos(BRIM_ATTACH);
    const reach = CROWN_Z + CROWN_RZ + BRIM_L;
    // outer edge, from one side round the front to the other
    const N = 28;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * 2 - 1;
      const ang = t * Math.PI / 2;
      const x = Math.sin(ang) * BRIM_W;
      const z = zA - 0.004 + Math.cos(ang) * (reach - zA + 0.004);
      if (i === 0) s.moveTo(x, z);
      else s.lineTo(x, z);
    }
    // back along the band, a little inside it
    for (let i = 0; i <= N; i++) {
      const ang = BRIM_ATTACH * (1 - (i / N) * 2);
      s.lineTo(Math.sin(ang) * CROWN_RX * 0.96, CROWN_Z + Math.cos(ang) * CROWN_RZ * 0.96);
    }
    const brimGeo = new THREE.ExtrudeGeometry(s, { depth: 0.0045, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.0012, bevelSegments: 2, curveSegments: 4 });
    brimGeo.rotateX(Math.PI / 2); // shape y -> z, extruded downward
    brimGeo.translate(0, 0.003, 0);
    hat.add(cast(new THREE.Mesh(brimGeo, M(0x6e1f2c, 0.88))));
  }
  // leather patch, flat on the front panel
  const ph = 0.42; // how far up the front panel, 0..1
  crownAt(0, 1, ph, _p);
  crownAt(0, 1, ph + 0.01, _q).sub(_p); // up the panel
  const patch = cast(new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.028, 0.003), M(0xa8784f, 0.8)));
  patch.rotation.x = -Math.atan2(-_q.z, _q.y);
  patch.position.copy(_p);
  patch.translateZ(0.0012);
  hat.add(patch);
  // a small white woven label low on the right front panel
  {
    const la = -0.62; // radians round the band from the front (the wearer's right)
    crownAt(Math.sin(la), Math.cos(la), 0.2, _p);
    const label = cast(new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.009, 0.0015), M(0xe9e6dc, 0.7)));
    label.position.copy(_p);
    label.rotation.y = la;
    label.translateZ(0.0009);
    hat.add(label);
  }
  // the button on top
  const button = cast(new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 5), crownMat));
  button.scale.y = 0.5;
  crownAt(0, 0, 1, button.position);
  hat.add(button);

  // Where something strapped round the cap sits (a headlamp): the middle of
  // the front panel, facing out of it, a little above the patch.
  const brow = new THREE.Group();
  crownAt(0, 1, ph + 0.22, brow.position);
  brow.rotation.x = patch.rotation.x;
  hat.add(brow);
  return { brow, crown: { rx: CROWN_RX, rz: CROWN_RZ, z: CROWN_Z, y: crownAt(1, 0, ph + 0.22, new THREE.Vector3()).y } };
}
