// A grown-up's head, made to a look: the skin of the face, the hair that
// grows on it, the ears; and, for whoever wears them, sunglasses and a cap.
// Who each grown-up is, is a look handed in by their hiker (hikers/hiker.js,
// hikers/lauren.js), drawn from photos of them: the shape of the skull and
// the face, where hair grows and how it lies, their colours.
//
// Everything is placed from the centre of the head (the group handed in),
// with +z the way the face looks and +y up, y = 0 at eye level, in metres,
// the size a real head is.
//
// The skin is one surface. A ray from the centre in each direction meets the
// skull, which is a few overlapping egg shapes rounded into one (the cranium,
// the cheekbones and upper jaw, the jaw, the chin), those of the face cut
// back if the look says to a few more (along the jaw, so it has an edge); the
// face's own relief is then raised from its front: the nose, the brow, the
// eye sockets, the lips.
// The rays are packed close across the face, where that relief is, and
// spread out at the back of the head, where the cap and hair are.
//
// Hair is drawn as shells: copies of the skin where it grows, each further
// out, which the shader cuts into the cross-sections of strands at that
// height, so together they make a pile of strands thinning to their tips,
// combed the way they lie. Further off than a strand is a pixel, they are
// the lumpy mass they make together instead (HAIR_GLSL). Long hair drawn
// back smooth is one layer over the skin instead, glossy, its strands drawn
// on it running back to where it's gathered (SLEEK_GLSL).

import * as THREE from 'three';
import { textile } from './clothing.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { smoothstep, lerp, clamp, phash } from '../noise.js';
import { NOISE_GLSL, SKY_GLSL, SKY_UNIFORMS_GLSL } from '../render/glsl.js';
import { SHARED, SKY } from '../render/uniforms.js';

const TAU = Math.PI * 2;

// ── A look ──────────────────────────────────────────────────────────────────
//   skull    egg shapes, [centre, half-sizes, tilt, cut], whose surfaces
//            are rounded into one another over `round` (m); tilted (radians,
//            if given) about x, its bottom forward. Each should take in the
//            middle of the head, which the skin is cast out from: one that
//            doesn't leaves a seam where it ends. An egg may be cut back to
//            others (`cut`, given as the skull's are): none of it is kept
//            outside any of them, and the edge is rounded over `cutRound`
//            (m). So the eggs of the face can be cut along the jaw, and the
//            jawline is an edge where the side of the face turns under, while
//            the cranium behind it is left whole
//   eyeX     half the distance between the pupils
//   brow     the brow ridge, above eye level
//   nose     from the bridge between the eyes (nasion: { y, z }) straight
//            down its back (`slope` forward for each metre down, a `hump`
//            partway) to the `tip` ({ y, round }), round it and back under
//            it (`under`: { z at the lip, slope }) to where it meets the lip
//            (`base`). Across, a ridge as round as `bridgeRound` at the
//            bridge and `tipRound` at the tip, whose sides fall as `steep`
//            ([at the bridge, at the tip]) and curve over (`sideCurve`,
//            1/m) into the cheek. Its wings (`ala`: { x, y, rx, ry, lift }:
//            where, how big, how far they stand out); the nostrils `nostril`
//            either side of the middle.
//   mouth    { y, w, smile, parted, teeth }: the line between the lips in
//            the middle, half its width, how far the corners turn up, how
//            far apart the lips are, and how much of the gap is upper teeth
//            ([from, full], as shares of it down from the upper lip)
//   relief   how far the face's features stand out of the skull (m): the eye
//            `socket` sunk under the brow, the `browRidge`, the `cheekbones`
//            and the round of the `cheeks` ([how far, x, y]), the `teeth`
//            behind the lips, the `lips` ([upper, lower]) and how wide they
//            are (`lipW`), the point of the `chin` ([how far, y])
//   ear      { x, y, z, h, w, flare, lean }: where its middle is, half its
//            height and width, and how far (radians) its back edge stands
//            out from the head and its top leans back
//   colour   of the skin's parts, over the skin's own: { rosy, lip, brow
//            (the forehead), root (skin under thick hair), nostril, socket,
//            teeth, mouth }
//   hair     where it grows, how long, how it lies and what colour, as
//            { beard, scalp, brows, deepest } (see hairAt)

// How finely the skin is cut: columns round, rows top to bottom, and how
// much closer together they are over the face than elsewhere.
const SKIN_GRID = { cols: 160, rows: 112, front: 3, band: 2.6 };
const HAIR_GRID = { cols: 104, rows: 76, front: 2.4, band: 2.2 };

// ── Hair ────────────────────────────────────────────────────────────────────
const SHELLS = 12; // layers of hair
const HAIR_LIFT = 0.0005; // m the innermost layer stands off the skin
const STRAND = 0.0007; // m between strands
const COMB = 0.7; // how far the tips lie over the way it's combed, for each metre of length
const HAIR_EDGE = 0.005; // m over which hair thins out at its edges

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
// for an egg shape [centre, half-sizes, tilt]; 0 if the ray misses it.
const _ray = [0, 0, 0];
function rayToEgg(n, [c, r, tilt]) {
  let N = n.toArray(_ray);
  let C = c;
  if (tilt) {
    // into the egg's own frame (how far along the ray is the same in it)
    const co = Math.cos(tilt);
    const si = Math.sin(tilt);
    N = [N[0], N[1] * co - N[2] * si, N[1] * si + N[2] * co];
    C = [c[0], c[1] * co - c[2] * si, c[1] * si + c[2] * co];
  }
  let a = 0;
  let b = 0;
  let k = -1;
  for (let i = 0; i < 3; i++) {
    const ni = N[i] / r[i];
    const ci = C[i] / r[i];
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
function nose(N, x, y) {
  if (y > N.nasion.y + 0.012 || y < N.base - 0.006) return -1;
  const t = clamp((N.nasion.y - y) / (N.nasion.y - N.tip.y), 0, 1); // 0 at the bridge, 1 at the tip
  // down the middle: its straight back, and the underside rising from the
  // lip, rounded into each other at the tip
  const back = N.nasion.z + (N.nasion.y - y) * N.slope + N.hump * Math.sin(Math.PI * t) - 2.5 * Math.max(0, y - N.nasion.y);
  const under = N.under.z + (y - N.base) * N.under.slope;
  const mid = smin(back, under, N.tip.round);
  const round = lerp(N.bridgeRound, N.tipRound, t * t);
  const steep = lerp(N.steep[0], N.steep[1], t);
  return mid - steep * (Math.hypot(x, round) - round) - N.sideCurve * x * x;
}

// The line between the lips at x: up at the corners in a smile.
const mouthY = (m, x) => m.y + m.smile * Math.min(1, (x / m.w) ** 2);

// The face's relief over the skull's front z0 at (x, y): its new z.
function relief(L, x, y, z0) {
  const R = L.relief;
  const m = L.mouth;
  const A = L.nose.ala;
  const ax = Math.abs(x);
  const my = mouthY(m, x);
  let z = z0;
  z -= R.socket * gauss((ax - L.eyeX) / 0.0165, (y - 0.001) / 0.0135); // eye sockets
  z += R.browRidge * gauss((ax - 0.03) / 0.024, (y - L.brow) / 0.0075); // brow ridge
  z -= 0.0012 * gauss(ax / 0.01, (y - 0.012) / 0.008); // the dip at the top of the nose
  z += R.cheekbones[0] * gauss((ax - R.cheekbones[1]) / 0.016, (y - R.cheekbones[2]) / 0.013); // cheekbones
  z += R.cheeks[0] * gauss((ax - R.cheeks[1]) / 0.016, (y - R.cheeks[2]) / 0.013); // the round of the cheeks, lifted by the smile
  z += R.teeth * gauss(ax / 0.028, (y - m.y) / 0.019); // the teeth behind the lips
  z += R.lips[0] * gauss(ax / R.lipW[0], (y - my - 0.0035) / 0.0034) * smoothstep(m.w, m.w - 0.008, ax); // upper lip
  z += R.lips[1] * gauss(ax / R.lipW[1], (y - my + m.parted + 0.0035) / 0.0042) * smoothstep(m.w, m.w - 0.009, ax); // lower lip
  z -= 0.0034 * gauss(ax / m.w, (y - my + m.parted / 2) / (0.0012 + m.parted / 2)); // between them
  z -= 0.0018 * gauss(ax / 0.016, (y - m.y + 0.017) / 0.005); // under the lower lip
  z += R.chin[0] * gauss(ax / 0.016, (y - R.chin[1]) / 0.01); // point of the chin
  z += A.lift * gauss((ax - A.x) / A.rx, (y - A.y) / A.ry); // the wings of the nose
  z -= 0.0008 * gauss((ax - A.x - A.rx * 1.2) / 0.0028, (y - A.y) / 0.007); // the crease round them
  return smax(z, nose(L.nose, x, y), 0.005);
}

// The skin in unit direction n: out = its point.
function skinPoint(L, n, out) {
  let r = 0;
  for (const egg of L.skull) {
    let e = rayToEgg(n, egg);
    for (const cut of egg[3] ?? []) e = smin(e, rayToEgg(n, cut), L.cutRound);
    r = smax(r, e, L.round);
  }
  out.copy(n).multiplyScalar(r);
  // the face is raised from the front only
  const w = smoothstep(0.01, 0.05, out.z);
  if (w > 0) out.z = lerp(out.z, relief(L, out.x, out.y, out.z), w);
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
function skinGrid(L, { cols, rows, front, band }) {
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
  dirs.forEach((n, i) => skinPoint(L, n, _p).toArray(pos, i * 3));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

// ── Where hair grows ────────────────────────────────────────────────────────
// At a point p on the skin: { len (m), flow (which way it's combed, along
// the skin: a unit vector, or longer for hair that lies flatter), color }.
// len is 0 where there's none. A look's hair says where:
//   beard   (or none) { cheek, jaw, chin, moustache, colour, auburn }: how
//           long on the cheeks, along the jaw, at the chin and over the lip,
//           and its colour, auburn at the chin
//   scalp   { line: [front, side, nape], from: [start, full], band: { y,
//           tilt }, len, thin, colour, flow | toward, comb }: the hairline's
//           height at the front, in front of the ear and at the nape; how
//           far round from the front of the face it starts (radians: the
//           rest is under the cap); the band of the cap it is tucked up
//           under (its height above eye level and tilt); how long it is, and
//           how much of that it has low down; which way it's combed (`flow`),
//           or the point it's drawn back to (`toward`); and how much flatter
//           than a beard it lies (`comb`, 1 if not given). `sleek`: long hair
//           drawn back smooth to `toward`, a glossy layer `len` deep rather
//           than a pile of strands
//   brows   { inner, span, arch, tail, drop, half: [inner, tail], len,
//           colour }: an arch over each eye from `inner` across the middle
//           for `span`, rising `arch` and falling `tail` at its end, set
//           `drop` under the brow ridge; half as thick as `half`, from the
//           inner end to the tail
//   deepest the longest it grows (m): how many layers it needs from afar
// (and for long hair drawn back smooth, `edge`: how far inside its edges
// the point is, in metres, negative outside them)
const _hair = { len: 0, flow: new THREE.Vector3(), color: new THREE.Color(), sleek: false, edge: -1 };

// Height of the beard's upper edge at angle a round from the front (0) to
// the ear (pi/2): under the nose, across the cheek and up the sideburn.
const cheekLine = (L, a) => lerp(lerp(L.nose.base - 0.0015, -0.031, smoothstep(0.24, 0.62, a)), 0.016, smoothstep(0.62, 1.32, a));

function hairAt(L, p, normal) {
  const H = L.hair;
  const E = L.ear;
  const m = L.mouth;
  const ax = Math.abs(p.x);
  const a = Math.atan2(ax, p.z); // 0 ahead, pi/2 at the ear, pi behind
  const out = _hair;
  out.len = 0;
  out.sleek = false;
  out.edge = -1;
  let comb = 1;
  // the ear: none on it or right round it
  const ear = ((p.y - E.y) / (E.h + 0.003)) ** 2 + ((p.z - E.z + 0.004) / (E.w + 0.001)) ** 2;

  // Beard: below the cheek line; not behind the ear except under the jaw.
  const B = H.beard;
  if (B) {
    const below = cheekLine(L, Math.min(a, 1.45)) - p.y;
    const behind = smoothstep(1.5, 1.62, a); // past the front of the ear
    const underJaw = smoothstep(-0.062, -0.085, p.y + 0.025 * (a - 1.5));
    let beard = smoothstep(0, HAIR_EDGE, below) * lerp(1, underJaw, behind);
    beard *= smoothstep(2.25, 2.0, a); // not round to the nape
    // the lips are bare: the lower lip and the corners of the mouth
    const lip = (p.x / (m.w - 0.002)) ** 2 + ((p.y - mouthY(m, p.x) + m.parted + 0.003) / 0.0068) ** 2;
    beard *= Math.min(1, smoothstep(0.75, 1.25, lip) + smoothstep(0.35, 0.55, a));
    // nor is the very edge of the upper lip, where the moustache hangs over it
    beard *= 1 - 0.7 * gauss(p.x / 0.02, (p.y - mouthY(m, p.x) - 0.0025) / 0.003) * smoothstep(0.02, 0.07, p.z);
    if (beard > 0.001) {
      const chin = gauss(p.x / 0.04, (p.y + 0.105) / 0.022);
      let len = lerp(B.cheek, B.jaw, smoothstep(-0.03, -0.085, p.y)) + (B.chin - B.jaw) * chin;
      // a short moustache, and short at the sideburn
      const lipTop = gauss(p.x / 0.03, (p.y - (L.nose.base + m.y) / 2) / 0.01) * smoothstep(0.03, 0.07, p.z);
      len = lerp(len, B.moustache, lipTop);
      len *= lerp(1, 0.7, smoothstep(0.9, 1.4, a) * smoothstep(-0.05, 0.0, p.y));
      out.len = len * beard;
      // combed down, and out from the middle over the lip
      out.flow.set(Math.sign(p.x) * 0.6 * lipTop, -1, 0.25 + 0.3 * chin);
      out.color.copy(B.colour).lerp(B.auburn, 0.35 * chin);
    }
  }

  // Scalp: above the hairline round the ear and down to the nape; below the
  // cap's band, which hides the rest.
  const S = H.scalp;
  const hairline = lerp(lerp(S.line[0], S.line[1], smoothstep(1.0, 1.4, a)), S.line[2], smoothstep(1.6, 2.5, a));
  const band = S.band.y - p.z * Math.sin(S.band.tilt) + 0.006; // tucked up under the cap's band
  const scalp = smoothstep(hairline, hairline + HAIR_EDGE, p.y) * smoothstep(S.from[0], S.from[1], a) * smoothstep(band + 0.004, band, p.y);
  if (scalp * S.len > out.len) {
    out.len = S.len * scalp * lerp(1, S.thin, smoothstep(-0.03, -0.07, p.y));
    if (S.toward) out.flow.subVectors(S.toward, p);
    else out.flow.copy(S.flow);
    out.color.copy(S.colour);
    comb = S.comb ?? 1;
    out.sleek = !!S.sleek;
  }
  if (S.sleek) {
    // as a distance, so its edge can be drawn smooth across the skin's grid:
    // to the hairline, round to where it starts, up to the band, out to the ear
    const r = Math.hypot(p.x, p.z);
    out.edge = Math.min(p.y - hairline, (a - (S.from[0] + S.from[1]) / 2) * r, band - p.y, (Math.sqrt(ear) - 0.85) * E.h);
  }

  // Eyebrows: an arch over each eye, thick at the inner end, thin at the tail.
  const W = H.brows;
  const t = (ax - W.inner) / W.span; // 0 at the inner end, 1 at the tail
  if (t > -0.2 && t < 1.2 && p.z > 0.03) {
    const mid = L.brow - W.drop + W.arch * Math.sin(Math.PI * clamp(t * 0.9 + 0.05, 0, 1)) - W.tail * smoothstep(0.7, 1.1, t);
    const half = lerp(W.half[0], W.half[1], clamp(t, 0, 1));
    const brow = smoothstep(half + 0.0015, half - 0.0015, Math.abs(p.y - mid)) * smoothstep(-0.15, 0.05, t) * smoothstep(1.15, 0.95, t);
    if (brow * W.len > out.len) {
      out.len = W.len * brow;
      out.flow.set(Math.sign(p.x), 0.25 - 0.6 * t, 0);
      out.color.copy(W.colour);
      comb = 1;
      out.sleek = false;
      out.edge = -1;
    }
  }
  if (ear < 1) out.len *= smoothstep(0.6, 1, ear);
  // comb it along the skin
  out.flow.addScaledVector(normal, -out.flow.dot(normal)).normalize();
  if (comb !== 1) out.flow.multiplyScalar(comb);
  return out;
}

// ── Skin colour ─────────────────────────────────────────────────────────────
const _c2 = new THREE.Color();

function skinColor(L, p, nrm, hair, base, out) {
  const C = L.colour;
  const m = L.mouth;
  const ax = Math.abs(p.x);
  out.copy(base);
  // sun-browned forehead, a little lighter
  out.lerp(C.brow, 0.12 * smoothstep(0.02, 0.05, p.y));
  // colour in the nose, the cheeks above the beard and the ears
  const flush = 0.28 * gauss(p.x / 0.014, (p.y - L.nose.tip.y - 0.004) / 0.014) + 0.3 * gauss((ax - 0.045) / 0.018, (p.y + 0.022) / 0.014);
  out.lerp(C.rosy, Math.min(0.5, flush) * smoothstep(0.03, 0.07, p.z));
  // the sockets, in the glasses' shade
  out.lerp(C.socket, 0.3 * gauss((ax - L.eyeX) / 0.014, (p.y - 0.004) / 0.008) * smoothstep(0.04, 0.07, p.z));
  // lips
  const my = mouthY(m, p.x);
  const lip = (p.x / (m.w - 0.002)) ** 2 + ((p.y - my + m.parted / 2) / (0.0072 + m.parted / 2)) ** 2;
  out.lerp(C.lip, 0.7 * smoothstep(1, 0.55, lip) * smoothstep(0.06, 0.08, p.z));
  // where they part: the upper teeth, and the dark of the mouth under them
  const gap = gauss(p.x / (m.w - 0.003), 0) * smoothstep(0.07, 0.085, p.z);
  const inGap = smoothstep(0.0006, -0.0002, p.y - my) * smoothstep(-m.parted - 0.0006, -m.parted + 0.0002, p.y - my);
  const teeth = smoothstep(-m.parted * m.teeth[0], -m.parted * m.teeth[1], p.y - my);
  out.lerp(_c2.copy(C.mouth).lerp(C.teeth, teeth * smoothstep(m.w - 0.004, m.w - 0.012, Math.abs(p.x))), inGap * gap);
  // nostrils, under the tip either side
  const nostril = gauss((ax - L.nose.nostril) / 0.0028, (p.y - L.nose.base - 0.0032) / 0.0022) * smoothstep(-0.3, -0.7, nrm.y);
  out.lerp(C.nostril, 0.75 * nostril);
  // faintly blotchy, as skin is
  out.multiplyScalar(0.97 + 0.06 * phash(p.x * 900, p.y * 900, p.z * 900));
  // dark under hair, so the gaps between strands don't show bare skin
  out.lerp(C.root, smoothstep(0, 0.6, hair.len / 0.004));
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

// Long hair drawn back smooth: a glossy layer over the scalp. Its strands
// run from all round the head back to where it's gathered, so they're
// drawn by which way round that point (an axis from the middle of the
// head through it) each spot is, finely, with how far from it to vary
// them; brighter and glossier along a strand, darker between. It thins
// towards the hairline and is cut off there, where how far inside its edge
// a point is (aEdge) comes to nothing: a distance, so the cut runs smooth
// across the triangles rather than along them.
const SLEEK_GLSL = /* glsl */ `
float strands(vec3 p, vec3 axis) {
  vec3 d = normalize(p - uHairCentre);
  vec3 e1 = normalize(cross(axis, vec3(1.0, 0.0, 0.0)));
  vec3 e2 = cross(axis, e1);
  float round = atan(dot(d, e2), dot(d, e1));
  float along = acos(clamp(dot(d, axis), -1.0, 1.0));
  return vnoise(vec2(round * 150.0, along * 5.0)) * 0.55 + vnoise(vec2(round * 480.0, along * 11.0)) * 0.45;
}
`;
const SLEEK_LIFT = 0.0003; // m the layer stands off the skin at its edge
const SLEEK_THIN = 0.006; // m in from its edge over which it thins
const SLEEK_CENTRE = new THREE.Vector3(0, 0.01, -0.01); // about the middle of a head
function sleekMaterial(centre, toward) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0 });
  const uniforms = {
    uHairCentre: { value: centre.clone() },
    uHairAxis: { value: toward.clone().sub(centre).normalize() },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aEdge;
        varying vec3 vHead;
        varying float vEdge;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vHead = position;
        vEdge = aEdge;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uHairCentre;
        uniform vec3 uHairAxis;
        varying vec3 vHead;
        varying float vEdge;
        ${NOISE_GLSL}
        ${SLEEK_GLSL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (vEdge < 0.0) discard;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float strand = strands(vHead, uHairAxis);
        diffuseColor.rgb *= 0.62 + 0.7 * strand;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.55, 0.3, strand);`);
  };
  mat.customProgramCacheKey = () => 'hiker-sleek-v1';
  return mat;
}

// Lenses with a mirror coat: the sky in them, more at a glancing look.
//   color   the lens itself, seen through the coat
//   tint    what colour the coat turns what it mirrors, [r, g, b]
//   mirror  how much it mirrors looked at square on (all of it, edge on)
// (Each lens's own colours are uniforms, so every pair shares one program.)
const LENS = { color: 0x07090c, tint: [0.55, 0.68, 0.95], mirror: 0.18 };
export function lensMaterial({ color = LENS.color, tint = LENS.tint, mirror = LENS.mirror } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.06, metalness: 0 });
  const uniforms = { uLensTint: { value: new THREE.Vector3(...tint) }, uLensMirror: { value: mirror } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SKY, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uLensTint;
        uniform float uLensMirror;
        ${SKY_UNIFORMS_GLSL}
        ${SKY_GLSL}`)
      .replace('#include <opaque_fragment>', `{
          vec3 v = normalize(vViewPosition);
          vec3 r = transformNormalByInverseViewMatrix(reflect(-v, normal), viewMatrix);
          float f = uLensMirror + (1.0 - uLensMirror) * pow(1.0 - clamp(dot(normal, v), 0.0, 1.0), 4.0);
          // below the horizon it's the ground, darker
          vec3 seen = r.y > 0.0 ? skyGradient(r) : uHorizon * 0.25;
          outgoingLight += seen * f * uLensTint;
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'hiker-lens-v1';
  return mat;
}

// Skin for the rest of someone (arms, neck, shoulders): the face's light
// through it, in one colour.
export function bareSkin(hex, rough = 0.55) {
  const mat = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0 });
  mat.onBeforeCompile = skinLight;
  mat.customProgramCacheKey = () => 'hiker-skin-v1';
  return mat;
}

// ── Building it ─────────────────────────────────────────────────────────────

// Each look's skin and hair are the same for whoever has it; work them out
// once.
const shapesOf = new WeakMap();
function headShapes(L, skinHex) {
  const known = shapesOf.get(L);
  if (known && known.skinHex === skinHex) return known;
  const base = new THREE.Color(skinHex);

  // The skin, coloured.
  const skin = skinGrid(L, SKIN_GRID);
  {
    const p = skin.attributes.position;
    const nrm = skin.attributes.normal;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      _p.fromBufferAttribute(p, i);
      _n.fromBufferAttribute(nrm, i);
      skinColor(L, _p, _n, hairAt(L, _p, _n), base, _c).toArray(col, i * 3);
    }
    skin.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }

  // Long hair drawn back smooth: the skin, lifted as deep as the hair is
  // where there's any, over the triangles that have some.
  let sleek = null;
  if (L.hair.scalp.sleek) {
    const p = skin.attributes.position;
    const nrm = skin.attributes.normal;
    const S = L.hair.scalp;
    const pos = new Float32Array(p.count * 3);
    const col = new Float32Array(p.count * 3);
    const edge = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      _p.fromBufferAttribute(p, i);
      _n.fromBufferAttribute(nrm, i);
      const h = hairAt(L, _p, _n);
      edge[i] = h.edge;
      S.colour.toArray(col, i * 3);
      const depth = lerp(SLEEK_LIFT, S.len, smoothstep(0, SLEEK_THIN, h.edge));
      _p.addScaledVector(_n, depth).toArray(pos, i * 3);
    }
    const si = skin.index.array;
    const index = [];
    for (let t = 0; t < si.length; t += 3) {
      if (edge[si[t]] > 0 || edge[si[t + 1]] > 0 || edge[si[t + 2]] > 0) index.push(si[t], si[t + 1], si[t + 2]);
    }
    sleek = { pos, col, edge, index };
  }

  // The hair: the triangles of a coarser grid that have any, in layers. The
  // layers go in an order where every first few spread through the whole
  // depth (Van der Corput's), so drawing only the first few, from far off,
  // still fills it.
  const grid = skinGrid(L, HAIR_GRID);
  const gp = grid.attributes.position;
  const gn = grid.attributes.normal;
  const len = new Float32Array(gp.count);
  const flow = new Float32Array(gp.count * 3);
  const col = new Float32Array(gp.count * 3);
  for (let i = 0; i < gp.count; i++) {
    _p.fromBufferAttribute(gp, i);
    _n.fromBufferAttribute(gn, i);
    const h = hairAt(L, _p, _n);
    len[i] = h.sleek ? 0 : h.len;
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
  const shapes = { skinHex, skin, hair: { hp, hn, hf, hc, hl, hs, hi, perShell: keep.length }, sleek };
  shapesOf.set(L, shapes);
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
function earGeometry(E, base, rosy) {
  const RINGS = 14;
  const SECTORS = 44;
  const pos = [];
  const index = [];
  const outline = (th) => {
    const up = Math.sin(th);
    const wide = E.w * (1 + 0.12 * up - 0.28 * smoothstep(-0.2, -1, up) * smoothstep(-0.6, 0.3, -Math.cos(th)));
    return [Math.cos(th) * wide, up * E.h];
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
    _c.copy(base).lerp(rosy, 0.2 + 0.25 * smoothstep(0.6, 1, r)).multiplyScalar(lerp(1, 0.55, smoothstep(0, -0.004, w)));
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

const cast = (m) => {
  m.castShadow = true;
  return m;
};

// The face, its hair and its ears, to look L, built onto `head`. Returns
// the skin's material, for anything else of skin that goes on the head.
export function buildHead(head, skin, L) {
  const { skin: skinGeo, hair, sleek } = headShapes(L, skin.color.getHex());

  // ── Skin ──
  const skinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52, metalness: 0 });
  skinMat.onBeforeCompile = skinLight;
  skinMat.customProgramCacheKey = () => 'hiker-skin-v1';
  const face = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) face.setAttribute(name, skinGeo.attributes[name]);
  face.setIndex(skinGeo.index);
  head.add(cast(new THREE.Mesh(face, skinMat)));

  // ── Hair ──
  // Fewer layers from further off: no more than one every couple of pixels
  // through the hair's depth.
  const hairMesh = new THREE.Mesh(hairGeometry(hair), hairMaterial());
  hairMesh.onBeforeRender = (renderer, scene, camera) => {
    hairMesh.getWorldPosition(_q);
    const dist = Math.max(0.05, _q.distanceTo(camera.getWorldPosition(_p)));
    const px = (L.hair.deepest * SHARED.uLines.value * 0.5 * camera.projectionMatrix.elements[5]) / dist;
    const layers = clamp(Math.ceil(px / 2), 3, SHELLS);
    hairMesh.geometry.setDrawRange(0, layers * hair.perShell);
  };
  head.add(hairMesh);
  if (sleek) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(sleek.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(sleek.col, 3));
    g.setAttribute('aEdge', new THREE.BufferAttribute(sleek.edge, 1));
    g.setIndex(sleek.index);
    g.computeVertexNormals();
    head.add(cast(new THREE.Mesh(g, sleekMaterial(SLEEK_CENTRE, L.hair.scalp.toward))));
  }

  // ── Ears ──
  const E = L.ear;
  const earGeo = earGeometry(E, skin.color, L.colour.rosy);
  for (const sx of [-1, 1]) {
    const ear = cast(new THREE.Mesh(earGeo, skinMat));
    ear.position.set(sx * E.x, E.y, E.z);
    ear.rotation.set(-E.lean, -sx * E.flare, 0, 'YXZ');
    ear.scale.x = sx;
    head.add(ear);
  }
  return skinMat;
}

// ── Sunglasses ──────────────────────────────────────────────────────────────

// Bend a flat piece round the face: x runs along it, z is outward, and the
// piece is wrapped round a vertical cylinder of radius r whose front is at
// z = front.
export function wrapRound(geo, r, frontZ) {
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
export const fine = (geo) => new TessellateModifier(0.005, 8).modify(geo);

// A pair of sunglasses on the face, from one side of it drawn flat (u along
// the face from the bridge, v up from the lens centres, z out of the face)
// and the other its mirror. Its owner draws their frames and lenses:
//   y, z, r   the lens centres' height, the front of the frame at the
//             bridge, and the radius it's bent round to wrap the face
//   frame     the frame's side, flat (wrapped here, as is the lens)
//   lens      ...and the lens's, set back in it
//   hinge     [u, v]: where the frame ends at the temple, for the arm
//   temple    where the arm rests on the ear (from eye level)
//   arm       [thick, deep]: the arm's section
//   frameMat, lensMat
export function buildGlasses(head, { y, z, r, frame, lens, hinge, temple, arm: [thick, deep], frameMat, lensMat }) {
  const frameGeo = wrapRound(fine(frame), r, z);
  frameGeo.computeVertexNormals();
  const lensGeo = wrapRound(fine(lens), r, z);
  const glasses = new THREE.Group();
  glasses.position.y = y;
  head.add(glasses);
  const a = hinge[0] / r;
  _p.set(Math.sin(a) * (r - 0.003), hinge[1], z - r + Math.cos(a) * (r - 0.003));
  for (const sx of [-1, 1]) {
    const side = new THREE.Group();
    side.scale.x = sx;
    side.add(cast(new THREE.Mesh(frameGeo, frameMat)));
    side.add(new THREE.Mesh(lensGeo, lensMat));
    // the arm, straight back to the ear, then down behind it
    _q.copy(temple);
    _q.y -= y;
    const len = _p.distanceTo(_q);
    const bar = cast(new THREE.Mesh(new THREE.BoxGeometry(thick, deep, len), frameMat));
    bar.position.copy(_p).add(_q).multiplyScalar(0.5);
    bar.lookAt(_q);
    side.add(bar);
    const tip = cast(new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.004, 0.026), frameMat));
    tip.position.copy(_q).add(new THREE.Vector3(-0.002, -0.009, -0.009));
    tip.rotation.x = -0.9;
    side.add(tip);
    glasses.add(side);
  }
  return glasses;
}

// ── A cap ───────────────────────────────────────────────────────────────────
// Six panels sewn into a crown, a band round its foot, a button on top and a
// brim sewn to the front, put on the head. The crown is a superellipse in
// profile: flat-topped with steep sides the squarer it is (2 is a dome),
// taller at the front panel than at the back.
//   rx, rz, z   half-width and half-depth at the band, and its middle
//   front, back crown height over the band at the front panel and the back
//   square      how square
//   y, tilt     the band, above eye level, and how far it's tipped
//               (radians; negative tips the brim up)
//   colour, seam   the cloth, and its stitching
//   brim        { w, l, attach, colour, curve, rows }: half its width, how
//               far it reaches past the front of the crown, how far round the
//               band from the front (radians) it's sewn to, its colour, how
//               much it bends down at the sides (1/m), and the rows of
//               stitching round its edge
//   segments    [round, up] the crown is cut into
//   opening     (or none) { across, up }: a gap at the back over the band,
//               radians either side of the middle and as high as `up` of the
//               crown, for a ponytail to come out of
//   eyelets     a little stitched hole high on each panel, in this colour
// -> { hat, at(dx, dz, h, out) }: the hat's frame (on the head), and the
// point of the crown out towards (dx, dz) from the middle, h of the way up.
export function buildCap(head, C) {
  const crownMat = M(C.colour, 0.95, { side: THREE.DoubleSide, ...textile('twill') });
  const hat = new THREE.Group();
  hat.position.y = C.y;
  hat.rotation.x = C.tilt;
  head.add(hat);
  const e = 2 / C.square;
  const at = (dx, dz, h, out) => {
    const H = lerp(C.back, C.front, (dz + 1) / 2);
    const r = Math.pow(Math.max(0, 1 - h * h), e / 2);
    return out.set(dx * r * C.rx, Math.pow(h, e) * H, dz * r * C.rz + C.z);
  };
  const [round, up] = C.segments ?? [36, 12];
  let crownGeo = new THREE.SphereGeometry(1, round, up, -Math.PI / 2, TAU, 0, Math.PI / 2);
  {
    const p = crownGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const r = Math.hypot(x, z);
      at(r > 1e-6 ? x / r : 0, r > 1e-6 ? z / r : 0, y, _p);
      p.setXYZ(i, _p.x, _p.y, _p.z);
    }
    crownGeo.computeVertexNormals();
  }
  const O = C.opening;
  if (O) {
    // leave out the triangles in the gap at the back
    const unit = new THREE.SphereGeometry(1, round, up, -Math.PI / 2, TAU, 0, Math.PI / 2).attributes.position;
    const index = crownGeo.index.array;
    const keep = [];
    const gap = (v) => {
      const x = unit.getX(v);
      const z = unit.getZ(v);
      return unit.getY(v) < O.up && z < 0 && Math.abs(Math.atan2(x, -z)) < O.across;
    };
    for (let t = 0; t < index.length; t += 3) {
      if (!(gap(index[t]) && gap(index[t + 1]) && gap(index[t + 2]))) keep.push(index[t], index[t + 1], index[t + 2]);
    }
    crownGeo.setIndex(keep);
  }
  hat.add(cast(new THREE.Mesh(crownGeo, crownMat)));
  const seam = M(C.seam, 0.94);
  const seams = [];
  for (let panel = 0; panel < 6; panel++) {
    const a = (panel + 0.5) * TAU / 6;
    const path = [];
    for (let i = 0; i <= 10; i++) {
      const h = Math.sin(i * Math.PI / 20) * 0.998;
      path.push(at(Math.sin(a), Math.cos(a), h, new THREE.Vector3()));
    }
    seams.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 14, 0.001, 4));
  }
  // and a stitched band round the bottom
  const bandPath = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * TAU;
    bandPath.push(at(Math.sin(a), Math.cos(a), 0.0015, new THREE.Vector3()));
  }
  seams.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bandPath, true), 60, 0.0009, 4, true));
  hat.add(cast(new THREE.Mesh(mergeGeometries(seams), seam)));
  // The brim: sewn to the front of the band, out to a rounded front.
  const B = C.brim;
  {
    const s = new THREE.Shape();
    const zA = C.z + C.rz * Math.cos(B.attach);
    const reach = C.z + C.rz + B.l;
    // the outer edge at t (-1 at one side, 1 at the other)
    const edge = (t, inset, out) => {
      const ang = t * Math.PI / 2;
      return out.set(Math.sin(ang) * (B.w - inset), 0, zA - 0.004 + Math.cos(ang) * (reach - zA + 0.004 - inset));
    };
    // outer edge, from one side round the front to the other
    const N = 28;
    for (let i = 0; i <= N; i++) {
      edge((i / N) * 2 - 1, 0, _p);
      if (i === 0) s.moveTo(_p.x, _p.z);
      else s.lineTo(_p.x, _p.z);
    }
    // back along the band, a little inside it
    for (let i = 0; i <= N; i++) {
      const ang = B.attach * (1 - (i / N) * 2);
      s.lineTo(Math.sin(ang) * C.rx * 0.96, C.z + Math.cos(ang) * C.rz * 0.96);
    }
    const brimGeo = new THREE.ExtrudeGeometry(s, { depth: 0.0045, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.0012, bevelSegments: 2, curveSegments: 4 });
    brimGeo.rotateX(Math.PI / 2); // shape y -> z, extruded downward
    brimGeo.translate(0, 0.003, 0);
    // rows of stitching round its edge, on top
    const rows = [];
    for (let k = 0; k < (B.rows ?? 0); k++) {
      const path = [];
      for (let i = 0; i <= N; i++) path.push(edge(((i / N) * 2 - 1) * 0.96, 0.006 + k * 0.0055, new THREE.Vector3()).setY(0.0042));
      rows.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 48, 0.0006, 3));
    }
    // bent down at the sides
    const bend = (g) => {
      if (!B.curve) return g;
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) - B.curve * p.getX(i) ** 2);
      g.computeVertexNormals();
      return g;
    };
    hat.add(cast(new THREE.Mesh(bend(brimGeo), M(B.colour, 0.88))));
    if (rows.length) hat.add(new THREE.Mesh(bend(mergeGeometries(rows)), seam));
  }
  // a stitched hole high on each panel
  if (C.eyelets !== undefined) {
    const eyelets = [];
    for (let panel = 0; panel < 6; panel++) {
      const a = panel * TAU / 6;
      if (O && Math.cos(a) < -0.9) continue; // over the gap
      at(Math.sin(a), Math.cos(a), 0.78, _p);
      const ring = new THREE.TorusGeometry(0.0022, 0.0009, 4, 10);
      ring.lookAt(_q.set(Math.sin(a), 0.9, Math.cos(a)));
      ring.translate(_p.x, _p.y + 0.0005, _p.z);
      eyelets.push(ring);
    }
    hat.add(new THREE.Mesh(mergeGeometries(eyelets), M(C.eyelets, 0.6)));
  }
  // the button on top
  const button = cast(new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 5), crownMat));
  button.scale.y = 0.5;
  at(0, 0, 1, button.position);
  hat.add(button);
  return { hat, at };
}
