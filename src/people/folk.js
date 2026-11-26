// Someone who isn't one of the hikers, made as well as they are: a town's
// people, on the hikers' own body (player/character.js).
//
// What they look like comes from the same look a town grows for each of its
// people (body.js lookOf: who they are, their size and build, the colours
// they're dressed in, the hat they wear). The rest is grown from a seed:
//   - a face of their own: the grown-up head (player/head.js), its skull,
//     nose, mouth, ears and brows each a little different, with eyes in it
//     that turn to look at you; hair cut short and combed back, or drawn
//     back smooth into a bun; a beard, a moustache, or a day's stubble.
//     Children have the hiker children's heads (hikers/child.js).
//   - what they wear, cut the way the hikers' clothes are (clothing.js): a
//     shirt with its collar and buttons, a waistcoat or braces, trousers and
//     boots; a long dress with a fitted bodice and a full skirt that moves
//     with the legs under it, an apron over it; a frock coat; a felt hat, a
//     bowler, a top hat, a cap, a straw hat or a bonnet. Woven cloth, worn
//     darker at the knees and dusty at the hem.
// And they walk and stand as the hikers do: feet that plant and roll, a
// glance round now and then, breathing.
//
//   const folk = new Folk(look, seed, { ground })   // ground(x, z): to plant the feet on
//   ...or yield* growFolk(look, seed, { ground })   // the same, a millisecond or so at a time
//   folk.mesh                                      // to put in the scene, and stand where they are
//   folk.pose(dt, speed, lookAt)                   // walking (m/s), and turning to look:
//                                                  //   lookAt is a yaw from the way they face, or null
//   folk.waving = 1.8                              // s of a wave of the right hand
//   folk.dispose()
//
// As a Body does (body.js), so whoever stood one of those up can stand one
// of these up instead.

import * as THREE from 'three';
import { Character } from '../player/character.js';
import { buildHead, bareSkin, shapeHead } from '../player/head.js';
import { childHead, takeIn } from '../player/hikers/child.js';
import { tailored, sleeve, trouserLeg, bootUpper, outsole, handShape, textile, foldAt, material as M, piece, cord, group, limb } from '../player/clothing.js';
import { mulberry32, smoothstep, lerp, clamp } from '../noise.js';
import { wrapAngle } from '../core/geom.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (hex) => new THREE.Color(hex);
const range = (rnd, a, b) => a + (b - a) * rnd();

// ── Their faces ─────────────────────────────────────────────────────────────
// A man's and a woman's face, as player/head.js takes a look; each person's
// is one of these with every part of it moved a little.
const HIS = {
  skull: [
    [[0, 0.024, -0.008], [0.0755, 0.097, 0.099]],
    [[0, -0.02, 0.013], [0.066, 0.056, 0.077]],
    [[0, -0.058, 0.004], [0.0555, 0.062, 0.083]],
    [[0, -0.097, 0.054], [0.029, 0.026, 0.032]],
  ],
  round: 0.016,
  eyeX: 0.032,
  brow: 0.024,
  nose: {
    nasion: { y: 0.014, z: 0.0905 }, slope: 0.6, hump: 0.0006,
    tip: { y: -0.036, round: 0.006 }, under: { z: 0.095, slope: 1.8 },
    bridgeRound: 0.0042, tipRound: 0.0078, steep: [1.45, 2.3], sideCurve: 30,
    ala: { x: 0.0115, y: -0.041, rx: 0.0062, ry: 0.0056, lift: 0.0082 },
    nostril: 0.0066, base: -0.0495,
  },
  mouth: { y: -0.0695, w: 0.0235, smile: 0.0008, parted: 0.0004, teeth: [0.75, 0.35] },
  relief: {
    socket: 0.0062, browRidge: 0.0035, cheekbones: [0.0042, 0.047, -0.021], cheeks: [0.0025, 0.035, -0.026],
    teeth: 0.0045, lips: [0.002, 0.0026], lipW: [0.02, 0.018], chin: [0.0028, -0.1],
  },
  ear: { x: 0.0735, y: -0.006, z: -0.012, h: 0.031, w: 0.0168, flare: 0.36, lean: 0.2 },
  brows: { inner: 0.009, span: 0.044, drop: 0.002, arch: 0.005, tail: 0.004, half: [0.005, 0.002], len: 0.0032 },
};
const HERS = {
  skull: [
    [[0, 0.02, -0.01], [0.073, 0.092, 0.095]],
    [[0, -0.02, 0.012], [0.067, 0.052, 0.075]],
    [[0, -0.05, 0.006], [0.052, 0.056, 0.078]],
    [[0, -0.088, 0.047], [0.026, 0.024, 0.03]],
  ],
  round: 0.016,
  eyeX: 0.031,
  brow: 0.026,
  nose: {
    nasion: { y: 0.011, z: 0.088 }, slope: 0.52, hump: 0,
    tip: { y: -0.032, round: 0.0065 }, under: { z: 0.093, slope: 1.45 },
    bridgeRound: 0.0045, tipRound: 0.0075, steep: [1.35, 2.2], sideCurve: 28,
    ala: { x: 0.0118, y: -0.0365, rx: 0.006, ry: 0.0052, lift: 0.0072 },
    nostril: 0.0066, base: -0.044,
  },
  mouth: { y: -0.062, w: 0.025, smile: 0.0014, parted: 0.0004, teeth: [0.92, 0.6] },
  relief: {
    socket: 0.004, browRidge: 0.0012, cheekbones: [0.0032, 0.045, -0.018], cheeks: [0.0032, 0.034, -0.03],
    teeth: 0.004, lips: [0.0026, 0.0034], lipW: [0.022, 0.02], chin: [0.0014, -0.088],
  },
  ear: { x: 0.0715, y: -0.004, z: -0.012, h: 0.0275, w: 0.0155, flare: 0.3, lean: 0.18 },
  brows: { inner: 0.01, span: 0.042, drop: 0, arch: 0.0065, tail: 0.0035, half: [0.0034, 0.0014], len: 0.0024 },
};
// Eyes: how far the lids open above and below the middle, half the
// opening's width, the ball's radius (m), and the colours irises come in,
// for fair skin and for dark.
const EYES = { open: [0.0047, 0.0052], wide: 0.0124, r: 0.0119, iris: 0.0058, set: 0.0016 };
const IRIS_FAIR = [0x4a2c18, 0x3a2414, 0x5a3a20, 0x6a5428, 0x4c6a52, 0x4a6a8c, 0x6a7a86];
const IRIS_DARK = [0x2a180e, 0x3a2214, 0x22140c];
// How finely their faces are cut (player/head.js `detail`): someone met in
// the street, not the hiker you are.
const DETAIL = 0.85;
// Where a hat's band sits on the head (above eye level, m) and how far it's
// tipped back at the front (radians); the hair stops just under it.
const HAT_BAND = { y: 0.058, tilt: -0.05 };

// Every number in a face moved a little, the same way for a whole skull.
function faceOf(her, rnd, colours) {
  const T = her ? HERS : HIS;
  const wide = range(rnd, 0.95, 1.05);
  const long = range(rnd, 0.96, 1.05);
  const jaw = range(rnd, 0.9, 1.1);
  const deep = range(rnd, 0.97, 1.03);
  const skull = T.skull.map(([c, r], i) => {
    const jw = i >= 2 ? jaw : 1;
    const ly = i === 0 ? 1 : long;
    return [[c[0], c[1] * ly, c[2] * deep], [r[0] * wide * jw, r[1] * ly, r[2] * deep]];
  });
  const N = T.nose;
  const nose = {
    ...N,
    nasion: { y: N.nasion.y, z: N.nasion.z + range(rnd, -0.002, 0.002) },
    slope: N.slope * range(rnd, 0.85, 1.18),
    hump: her ? 0 : range(rnd, 0, 0.0016),
    tip: { y: N.tip.y * range(rnd, 0.94, 1.08), round: N.tip.round * range(rnd, 0.9, 1.2) },
    tipRound: N.tipRound * range(rnd, 0.85, 1.25),
    ala: { ...N.ala, x: N.ala.x * range(rnd, 0.92, 1.12), lift: N.ala.lift * range(rnd, 0.85, 1.2) },
  };
  const R = T.relief;
  const mouth = { ...T.mouth, y: T.mouth.y * long, w: T.mouth.w * range(rnd, 0.92, 1.08), smile: T.mouth.smile + range(rnd, -0.0012, 0.0012) };
  const relief = {
    ...R,
    socket: R.socket * range(rnd, 0.8, 1.2),
    browRidge: R.browRidge * range(rnd, 0.7, 1.3),
    cheekbones: [R.cheekbones[0] * range(rnd, 0.75, 1.25), R.cheekbones[1], R.cheekbones[2]],
    cheeks: [R.cheeks[0] * range(rnd, 0.7, 1.3), R.cheeks[1], R.cheeks[2]],
    lips: R.lips.map((v) => v * range(rnd, 0.8, 1.2)),
    chin: [R.chin[0] * range(rnd, 0.6, 1.4), R.chin[1] * long],
  };
  const ear = { ...T.ear, h: T.ear.h * range(rnd, 0.92, 1.1), flare: T.ear.flare * range(rnd, 0.75, 1.3) };
  const skin = colours.skin;
  const tint = (hex, k) => skin.clone().lerp(C(hex), k);
  return {
    skull, round: T.round, eyeX: T.eyeX * range(rnd, 0.97, 1.04), brow: T.brow * range(rnd, 0.92, 1.1),
    nose, mouth, relief, ear,
    colour: {
      rosy: tint(0xb8564a, her ? 0.3 : 0.22),
      lip: tint(her ? 0xa84f55 : 0x8e5048, 0.45),
      brow: skin.clone().multiplyScalar(1.04),
      root: colours.hair.clone().multiplyScalar(0.8).lerp(skin, 0.06),
      nostril: skin.clone().multiplyScalar(0.22),
      socket: skin.clone().multiplyScalar(0.74),
      teeth: C(0xcfc4b2),
      mouth: C(0x2a1410),
    },
    eyes: {
      y: 0, set: EYES.set, r: EYES.r, lid: 0.0016,
      open: [EYES.open[0] * range(rnd, 0.88, 1.12), EYES.open[1] * range(rnd, 0.9, 1.1)],
      wide: EYES.wide * range(rnd, 0.95, 1.05),
      tilt: range(rnd, -0.04, 0.12),
      iris: { r: EYES.iris, colour: colours.iris },
      sclera: 0xd2cabe,
    },
    detail: DETAIL,
  };
}

// Hair: how it's cut, the brows, and a beard, as player/head.js takes them.
function hairOf(L, her, rnd, { hair, beard, hat }) {
  const T = her ? HERS : HIS;
  const band = hat ? { y: HAT_BAND.y - 0.004, tilt: HAT_BAND.tilt } : { y: 1, tilt: 0 };
  const grey = hair.r > 0.25 && Math.abs(hair.r - hair.b) < 0.03;
  const scalp = her
    ? {
        // parted in the middle and drawn back smooth into a bun at the back
        line: [0.066 + range(rnd, -0.004, 0.004), 0.0, -0.078], from: [-1, -0.9], band,
        len: 0.0038, thin: 1, colour: hair, sleek: true, toward: BUN.clone(),
      }
    : {
        // short, combed back; higher at the temples on some, and on the grey
        line: [range(rnd, 0.064, grey ? 0.092 : 0.08), range(rnd, 0.018, 0.03), -0.07], from: [-1, -0.5], band,
        len: range(rnd, 0.006, 0.013), thin: 0.6, colour: hair, flow: V(range(rnd, -0.15, 0.15), -0.45, -0.85),
      };
  let B = null;
  if (beard) {
    const kind = rnd();
    const auburn = hair.clone().lerp(C(0x6a3418), 0.3);
    B = kind < 0.55
      ? { cheek: range(rnd, 0.004, 0.008), jaw: range(rnd, 0.009, 0.014), chin: range(rnd, 0.012, 0.02), moustache: range(rnd, 0.006, 0.009), colour: hair, auburn }
      : { cheek: 0, jaw: 0, chin: 0, moustache: range(rnd, 0.007, 0.011), colour: hair, auburn: hair };
  }
  // a day or two since the razor, on some
  const stubble = !her && !beard && rnd() < 0.5 ? { colour: hair.clone().lerp(C(0x3a4048), 0.35), amount: range(rnd, 0.18, 0.42) } : null;
  const brows = { ...T.brows, colour: hair.clone().multiplyScalar(grey ? 0.8 : 0.9), arch: T.brows.arch * range(rnd, 0.7, 1.3), drawn: true };
  L.hair = { beard: B, stubble, scalp, brows, deepest: Math.max(scalp.len, B ? Math.max(B.chin, B.moustache) : 0) };
  return L;
}
// Where a woman's hair is gathered at the back of her head (from eye level).
const BUN = V(0, 0.045, -0.098);
// The heights (from eye level) a bonnet is cut at, from the nape to the top.
const BONNET = [-0.085, -0.06, -0.03, 0.0, 0.03, 0.06, 0.085, 0.105, 0.122, 0.134, 0.14];

// ── Their clothes ───────────────────────────────────────────────────────────
// A shirt, a bodice, a waistcoat and a coat are all cut from one pattern
// (the chest's frame, waist to collar: rows as tailored() takes them), let
// out for whatever goes over what. Hers is narrower at the waist and fuller
// at the bust.
const TORSO = [
  [-0.015, 0.16, 0.112, 0.004], [0.0, 0.166, 0.118, 0.005],
  [0.02, 0.171, 0.131, 0.006], [0.1, 0.168, 0.13, 0.004],
  [0.2, 0.176, 0.128, 0.002], [0.29, 0.188, 0.128], [0.36, 0.2, 0.124],
  [0.4, 0.204, 0.118], [0.432, 0.19, 0.106], [0.458, 0.152, 0.092],
  [0.48, 0.112, 0.08], [0.497, 0.078, 0.07],
];
const BODICE = [
  [-0.07, 0.15, 0.118, 0.008], [-0.03, 0.146, 0.116, 0.008],
  [0.04, 0.14, 0.114, 0.008], [0.12, 0.152, 0.124, 0.012],
  [0.2, 0.168, 0.136, 0.014], [0.27, 0.172, 0.136, 0.01], [0.34, 0.178, 0.124],
  [0.39, 0.182, 0.114], [0.425, 0.17, 0.102], [0.452, 0.136, 0.088],
  [0.476, 0.1, 0.076], [0.495, 0.07, 0.066],
];
// A pattern let out by `by` (m) all round, widened by `build`.
const letOut = (rows, by, build = 1) => rows.map(([y, w, d, z = 0, f = 0]) => [y, w * build + by, d + by, z, f]);
// How far forward of the chest joint the middle of a pattern's front is at
// height y (to put buttons and straps on it).
function frontOf(rows, y) {
  for (let i = 1; i < rows.length; i++) {
    const [y1, , d1, z1 = 0] = rows[i];
    const [y0, , d0, z0 = 0] = rows[i - 1];
    if (y <= y1) return lerp(z0 + d0, z1 + d1, clamp((y - y0) / (y1 - y0), 0, 1));
  }
  const [, , d, z = 0] = rows[rows.length - 1];
  return z + d;
}
function backOf(rows, y) {
  for (let i = 1; i < rows.length; i++) {
    const [y1, , d1, z1 = 0] = rows[i];
    const [y0, , d0, z0 = 0] = rows[i - 1];
    if (y <= y1) return lerp(d0 - z0, d1 - z1, clamp((y - y0) / (y1 - y0), 0, 1));
  }
  return rows[rows.length - 1][2];
}
// A skirt, from the waist (hips' frame: the hips are 0.94 m up) to the hem:
// [y, half width, half depth, how far forward its middle is].
const SKIRT = { waist: 0.1, hem: -0.86, flare: [0.305, 0.27] };
const COAT_SKIRT = { waist: 0.08, hem: -0.48, flare: [0.235, 0.2] };
// m an apron stands off the skirt under it (clear of the skirt's pleats)
const APRON = 0.03;
// Stockings under a skirt, the knee down (the hip's frame: the knee is at
// -0.42): as trouserLeg() takes its rows.
const STOCKING = [[-0.8, 0.05, 0.052], [-0.7, 0.054, 0.058], [-0.55, 0.06, 0.068], [-0.45, 0.062, 0.071], [-0.38, 0.066, 0.076], [-0.3, 0.07, 0.08]];
// The waistband of a pair of trousers, over where the shirt is tucked in
// (the hips' frame), and a belt over it.
const WAISTBAND = [[0.02, 0.186, 0.13], [0.026, 0.188, 0.132], [0.085, 0.184, 0.128], [0.09, 0.18, 0.124]];

// Folds that fall from the waist and die out towards the hem, and a hem
// turned up.
function skirtRows({ waist, hem, flare: [w, d] }, waistW, waistD) {
  const L = waist - hem;
  return [
    [hem, w, d, 0.012], [hem + 0.018, w * 0.995, d * 0.995, 0.012],
    [hem + L * 0.35, lerp(w, waistW, 0.3), lerp(d, waistD, 0.3), 0.012],
    [hem + L * 0.62, lerp(w, waistW, 0.62), lerp(d, waistD, 0.62), 0.012],
    [hem + L * 0.82, lerp(w, waistW, 0.86), lerp(d, waistD, 0.86), 0.01],
    [waist - 0.045, waistW + 0.004, waistD + 0.004, 0.008],
    [waist - 0.015, waistW, waistD, 0.008], [waist, waistW - 0.004, waistD - 0.004, 0.008],
  ];
}

// Cloth that hangs from the hips and moves with the legs under it: its
// lower part goes a little way with each thigh, both in the middle, so
// stepping out swings the hem rather than poking through it.
function hangFromHips(body, geometry, mat, { reach = 0.55, waist }) {
  const p = geometry.attributes.position;
  const weights = new Float32Array(p.count * 4);
  const indices = new Uint16Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const w = reach * smoothstep(waist - 0.12, waist - 0.75, y);
    const left = smoothstep(-0.09, 0.09, p.getX(i));
    weights.set([1 - w, w * left, w * (1 - left), 0], i * 4);
    indices.set([0, 1, 2, 0], i * 4);
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const cloth = new THREE.SkinnedMesh(geometry, mat);
  body.hips.add(cloth);
  body.hips.updateWorldMatrix(true, true);
  cloth.bind(new THREE.Skeleton([body.hips, body.legL.hip, body.legR.hip]));
  geometry.computeBoundingSphere();
  cloth.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -0.4, 0), 1);
  cloth.castShadow = true;
  return cloth;
}

// A skirt (or a coat's): full, pleated, folds from the waist dying out
// towards the hem, dusty there.
function skirtGeometry(spec, waistW, waistD, { pleats = 12, depth = 0.045, dust, span }) {
  const surface = (x, y) => {
    const t = dust ? 1 - 0.22 * smoothstep(spec.hem + 0.12, spec.hem, y) : 1;
    const band = y > spec.waist - 0.03 ? 0.8 : 1;
    return [t * band, t * band * 0.98, t * band * 0.95];
  };
  const rows = skirtRows(spec, waistW, waistD);
  const geo = span ? shell(rows, { segments: 56, surface, span }).geometry : tailored(rows, { segments: 56, surface });
  const p = geo.attributes.position;
  const L = spec.waist - spec.hem;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i) - 0.012;
    const fall = smoothstep(spec.waist - 0.02, spec.waist - L * 0.5, p.getY(i));
    const fold = 1 + depth * fall * Math.cos(pleats * Math.atan2(x, z));
    p.setXYZ(i, x * fold, p.getY(i), z * fold + 0.012);
  }
  geo.computeVertexNormals();
  return geo;
}

// A garment cut from rows as tailored() takes them, but open: each section
// only from `span(y, w)[0]` round the back to `[1]` (radians from the front,
// towards the wearer's left; w its half width), so its edges run smooth
// rather than along the triangles of a closed one. `edge(y, w)` gives a
// span that leaves the front open `e` m either side of the middle.
//   -> { geometry, edges: [[x, y, z]...] for each side }
const SHELL_STEP = 0.012; // m between sections where a garment folds
function shell(rows, { segments = 48, squareness = 1, crease, span, surface }) {
  if (crease) {
    const fine = [rows[0]];
    for (let r = 1; r < rows.length; r++) {
      const a = rows[r - 1];
      const b = rows[r];
      const steps = Math.ceil((b[0] - a[0]) / SHELL_STEP);
      for (let j = 1; j <= steps; j++) fine.push(Array.from({ length: 5 }, (_, k) => lerp(a[k] ?? 0, b[k] ?? 0, j / steps)));
    }
    rows = fine;
  }
  const round = (v) => Math.sign(v) * Math.pow(Math.abs(v), squareness);
  const pos = [];
  const uv = [];
  const col = [];
  const index = [];
  const edges = [[], []];
  const stride = segments + 1;
  rows.forEach(([h, w, d, z = 0, fold = 0], row) => {
    const [a, b] = span(h, w);
    for (let i = 0; i <= segments; i++) {
      const phi = a + ((b - a) * i) / segments;
      const across = Math.sin(phi);
      const front = Math.cos(phi);
      const inset = crease ? crease(h, across, front) : 0;
      const x = (w + inset) * round(across);
      const y = h + fold * (0.72 * across + 0.28 * Math.sin(2 * phi + 5 * h));
      const zz = z + (d + inset) * round(front);
      pos.push(x, y, zz);
      uv.push(i / segments, y);
      if (surface) col.push(...surface(x, h, front, phi));
      if (i === 0) edges[0].push([x, y, zz]);
      if (i === segments) edges[1].push([x, y, zz]);
      if (row && i < segments) {
        const p = (row - 1) * stride + i;
        index.push(p, p + 1, p + stride, p + 1, p + stride + 1, p + stride);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (surface) geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return { geometry, edges };
}
// The span of a section left open `e` m either side of the middle at the
// front, for a garment as square as `squareness`.
const openFront = (e, squareness = 1) => (y, w) => {
  const a = Math.asin(Math.pow(clamp(e(y) / w, 0, 1), 1 / squareness));
  return [a, Math.PI * 2 - a];
};
// A binding along an edge of an open garment, a little proud of it.
function binding(parent, mat, points, r = 0.0032) {
  return cord(parent, mat, r, points.filter((_, i) => i % 3 === 0 || i === points.length - 1));
}

// A sleeve's cap brought down under the line of the shoulder: the hikers'
// stands up round the shoulder joint, as a jacket's would.
const CAP = 0.4; // of its height above the shoulder joint kept
function flattenCap(geo) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, p.getY(i) * CAP);
  geo.computeVertexNormals();
  return geo;
}

// ── Hats ────────────────────────────────────────────────────────────────────
// Built on a frame at the band, where the crown meets the head: +y up out
// of the crown, +z ahead. Its brim is a ring out from the band, curled up at
// the sides and dipping at the front and back; its crown, rows up from the
// band.
// width, and how far up the sides curl and the front and back dip, at its
// edge (m)
function brim(width, curl, dip, { rx = 0.086, rz = 0.106, thick = 0.004 } = {}) {
  const rings = [];
  const out = (k) => k / 5;
  for (let i = 0; i <= 5; i++) rings.push(new THREE.Vector2(1 + out(i) * width / rx, -thick / 2));
  for (let i = 5; i >= 0; i--) rings.push(new THREE.Vector2(1 + out(i) * width / rx, thick / 2));
  const geo = new THREE.LatheGeometry(rings, 48);
  const v = geo.attributes.position;
  for (let i = 0; i < v.count; i++) {
    const x = v.getX(i), z = v.getZ(i);
    const r = Math.hypot(x, z);
    const a = Math.atan2(x, z);
    const reach = (r - 1) * rx; // m out from the band
    const side = Math.sin(a) ** 2;
    const y = v.getY(i) + ((reach * reach) / (width * width)) * (curl * side - dip * (1 - side));
    v.setXYZ(i, (x / r) * (rx + reach), y, (z / r) * (rz + reach * (rz / rx)));
  }
  geo.computeVertexNormals();
  return geo;
}

function crownOf(rows, opts) {
  return tailored(rows, { segments: 40, squareness: 0.9, ...opts });
}

// A hat, on the head's band frame. -> its group (a strap round it would go at
// `crown`, Character.dress asks for one).
function hat(kind, head, colour, rnd) {
  const frame = group(head, 0, HAT_BAND.y, -0.008);
  frame.rotation.x = HAT_BAND.tilt;
  const felt = M(colour, 0.92, textile('twill'));
  const ribbon = M(colour.clone().multiplyScalar(0.25), 0.6);
  const put = (geo, mat) => piece(frame, geo, mat);
  switch (kind) {
    case 'cowboy': {
      put(brim(range(rnd, 0.085, 0.1), 0.035, 0.012), felt);
      // a tall crown, pinched at the front and dented down the top
      put(crownOf([[-0.002, 0.087, 0.107], [0.03, 0.086, 0.104], [0.07, 0.082, 0.097], [0.1, 0.075, 0.089], [0.116, 0.064, 0.08], [0.122, 0.04, 0.06]], {
        crease: (y, across, front) => -0.012 * smoothstep(0.06, 0.12, y) * Math.max(0, front) * Math.abs(across) * 2 - 0.01 * smoothstep(0.1, 0.122, y) * (1 - Math.abs(across)),
      }), felt);
      put(crownOf([[0.0, 0.0885, 0.1085], [0.022, 0.0875, 0.1065]]), ribbon);
      break;
    }
    case 'bowler': {
      put(brim(0.04, 0.014, 0.0), felt);
      put(crownOf([[-0.002, 0.087, 0.107], [0.03, 0.088, 0.106], [0.06, 0.084, 0.1], [0.085, 0.07, 0.085], [0.1, 0.045, 0.058], [0.106, 0.012, 0.016]]), felt);
      put(crownOf([[0.0, 0.0885, 0.1085], [0.016, 0.0885, 0.1075]]), ribbon);
      break;
    }
    case 'top': {
      put(brim(0.045, 0.012, 0.004), felt);
      put(crownOf([[-0.002, 0.087, 0.105], [0.06, 0.084, 0.1], [0.14, 0.086, 0.103], [0.176, 0.09, 0.107], [0.18, 0.07, 0.085], [0.182, 0.0, 0.0]]), felt);
      put(crownOf([[0.0, 0.0885, 0.1065], [0.03, 0.0875, 0.1045]]), ribbon);
      break;
    }
    case 'cap': {
      // a flat cap: a soft crown pulled forward over a short peak
      const cap = M(colour, 0.95, textile('twill'));
      put(crownOf([[-0.002, 0.088, 0.108], [0.02, 0.094, 0.118, 0.006], [0.04, 0.092, 0.122, 0.012], [0.055, 0.074, 0.106, 0.014], [0.064, 0.035, 0.06, 0.012], [0.066, 0.0, 0.0, 0.01]]), cap);
      const peak = new THREE.CylinderGeometry(0.09, 0.09, 0.006, 24, 1, false, -0.9, 1.8);
      peak.scale(1, 1, 0.55);
      const m = put(peak, cap);
      m.position.set(0, 0.004, 0.068);
      m.rotation.x = 0.2;
      break;
    }
    case 'straw': {
      const straw = M(C(0xc8ad6e), 0.86, textile('canvas'));
      put(brim(range(rnd, 0.075, 0.09), 0.008, 0.015), straw);
      put(crownOf([[-0.002, 0.087, 0.107], [0.04, 0.086, 0.104], [0.07, 0.08, 0.098], [0.08, 0.06, 0.075], [0.082, 0.0, 0.0]]), straw);
      put(crownOf([[0.0, 0.0885, 0.1085], [0.022, 0.0875, 0.1065]]), M(colour, 0.7));
      break;
    }
    case 'bonnet': {
      // a cloth hood round the back and top of her head and over her ears,
      // open round her face, a padded brim along the opening, tied under
      // her chin with a bow
      head.remove(frame);
      const cloth = M(colour, 0.9, { vertexColors: true, ...textile('canvas'), side: THREE.DoubleSide });
      const rows = BONNET.map((y) => {
        const k = Math.sqrt(Math.max(0, 1 - ((y - 0.022) / 0.118) ** 2));
        return [y, 0.094 * k + 0.004, 0.116 * k + 0.004, -0.014];
      });
      const { geometry, edges } = shell(rows, {
        segments: 48,
        span: (y) => {
          const a = 1.12 * smoothstep(0.112, 0.078, y);
          return [a, Math.PI * 2 - a];
        },
        surface: () => [1, 1, 1],
      });
      piece(head, geometry, cloth);
      const open = (q) => q[1] < 0.1;
      const rim = edges[0].filter(open).reverse().concat(edges[1].filter(open));
      binding(head, M(colour.clone().multiplyScalar(0.85), 0.9), rim, 0.009);
      const tie = M(colour.clone().lerp(C(0xf0ece0), 0.3), 0.8);
      const [lx, ly, lz] = edges[0][0];
      for (const sx of [-1, 1]) cord(head, tie, 0.0035, [[sx * Math.abs(lx), ly, lz], [sx * 0.06, -0.1, 0.03], [sx * 0.012, -0.128, 0.058]]);
      return { bonnet: true };
    }
    default:
      head.remove(frame);
      return null;
  }
  return frame;
}

// ── Who they are ────────────────────────────────────────────────────────────
// A look (body.js lookOf) and a seed -> who they are (as Character takes it).
export function whoOf(look, seed) {
  const rnd = mulberry32((seed * 2654435761) >>> 0);
  const her = look.her;
  const build = look.build;
  const colours = {
    skin: look.skin.clone(),
    hair: look.hair.clone().lerp(C(0x5a4232), 0.16), // the darkest have some sheen
    iris: pick(look.skin.r < 0.25 ? IRIS_DARK : IRIS_FAIR, rnd),
  };
  // a grown-up's face (player/head.js): its skin and hair can be shaped a
  // little at a time before they're dressed (growFolk)
  const face = look.child ? null : hairOf(faceOf(her, rnd, colours), her, rnd, { hair: colours.hair, beard: look.beard, hat: look.hat !== 'none' && look.hat !== 'bonnet' });
  return {
    id: `folk-${seed}`,
    name: '',
    size: look.child ? look.height : her ? look.height * 0.94 : look.height,
    shoulders: (her || look.child ? 0.182 : 0.199) * Math.sqrt(build),
    legs: her && !look.child ? 1.05 : 1,
    face,
    skinHex: colours.skin.getHex(),
    dress(body) {
      return look.child ? dressChild(body, look, rnd, colours) : dressGrownUp(body, look, rnd, colours, { her, build, face });
    },
  };
}

// Someone stood up a little at a time: a generator for a Searches
// (core/searches.ts) that yields every millisecond or so while their face is
// shaped, and returns them, dressed.
export function* growFolk(look, seed, opts) {
  const who = whoOf(look, seed);
  if (who.face) yield* shapeHead(who.face, who.skinHex);
  yield;
  return new Folk(look, seed, opts, who);
}
const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];

function dressGrownUp(body, look, rnd, colours, { her, build, face: L }) {
  const skinHex = colours.skin.getHex();
  const skin = bareSkin(skinHex, 0.62);
  const shirtColour = look.coat ? look.shirt : look.dress || look.shirt;
  const cloth = (colour, weave = 'canvas', rough = 0.9, extra = {}) => M(colour, rough, { vertexColors: true, ...textile(weave), ...extra });
  const leather = M(C(0x2c1e14).lerp(C(0x4a3424), rnd()), 0.62);
  const sole = M(C(0x1e1a16), 0.9);

  // ── Head and neck ──
  piece(body.neck, new THREE.CylinderGeometry(her ? 0.05 : 0.056, her ? 0.058 : 0.066, 0.13, 16), skin, 0, 0.055);
  const headFrame = group(body.head);
  headFrame.scale.setScalar(range(rnd, 0.96, 1.03));
  buildHead(headFrame, skin, L);
  if (her && look.hat !== 'bonnet') {
    // the bun, a coil of hair at the back of her head
    const turns = [];
    for (let k = 0; k <= 40; k++) {
      const a = (k / 40) * Math.PI * 5;
      const r = 0.026 * (1 - k / 52);
      turns.push(V(Math.cos(a) * r, Math.sin(a) * r * 0.9, -0.004 * k / 40));
    }
    const coil = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(turns), 80, 0.0105, 8);
    const bun = piece(headFrame, coil, M(colours.hair, 0.55));
    bun.position.copy(BUN).add(V(0, 0, -0.004));
    bun.lookAt(V(0, 0.1, -1).add(bun.position));
  }
  const worn = hat(look.hat, headFrame, look.hatColor, rnd);
  const top = worn && worn.isObject3D ? worn : null;
  const brow = group(top || headFrame, 0, top ? 0.03 : 0.07, top ? 0.1 : 0.088);
  const crown = worn ? { rx: 0.1, rz: 0.12, z: -0.008, y: HAT_BAND.y + 0.03 } : { rx: 0.085, rz: 0.106, z: -0.008, y: 0.06 };

  // ── Body ──
  const pattern = her ? BODICE : TORSO;
  const B = her ? 1 : build;
  const shirt = cloth(shirtColour, 'canvas', 0.92);
  piece(body.chest, tailored(letOut(pattern, 0, B), {
    segments: 48, squareness: 0.9,
    crease: (y, x) => 0.004 * foldAt(y - 0.06 - 0.05 * x, 0.016) + 0.003 * foldAt(y - 0.0 + 0.03 * x, 0.012) + 0.003 * foldAt(y - 0.34 + 0.08 * Math.abs(x), 0.013),
  }), shirt);
  // the collar: a band round the neck, stood up higher on hers
  const collarCloth = cloth(shirtColour.clone().lerp(C(0xf0ece0), her ? 0.1 : 0.2), 'canvas', 0.85);
  if (her) {
    piece(body.chest, tailored([[0.47, 0.082, 0.074], [0.5, 0.071, 0.066], [0.54, 0.062, 0.06], [0.548, 0.06, 0.058]], { segments: 28 }), collarCloth);
    // a brooch at her throat
    const brooch = piece(body.chest, new THREE.CylinderGeometry(0.009, 0.009, 0.004, 14), M(C(0xc9a75a), 0.3, { metalness: 0.8 }), 0, 0.5, frontOf(BODICE, 0.5) + 0.003);
    brooch.rotation.x = Math.PI / 2 - 0.4;
  } else {
    piece(body.chest, tailored([[0.47, 0.086, 0.078], [0.5, 0.074, 0.068], [0.524, 0.068, 0.062]], { segments: 28 }), collarCloth);
  }
  // buttons down the front
  const placket = M(shirtColour.clone().multiplyScalar(0.7), 0.9);
  cord(body.chest, placket, 0.0035, [0.02, 0.15, 0.3, 0.44].map((y) => [0, y, frontOf(pattern, y) + 0.001]));
  const button = new THREE.SphereGeometry(0.0045, 8, 6).scale(1, 1, 0.45);
  const buttonMat = M(her ? C(0x1a1414) : C(0xd8d0c0), 0.4);
  for (let y = 0.05; y < 0.46; y += her ? 0.045 : 0.075) {
    if (!her && look.vest && y < 0.32) continue;
    piece(body.chest, button, buttonMat, 0, y, frontOf(pattern, y) + 0.004);
  }

  // a waistcoat over the shirt, open in a V at the front, a watch chain
  // across it on some
  if (look.vest && !her && !look.coat) {
    const vest = cloth(look.vest, 'twill', 0.85, { side: THREE.DoubleSide });
    const rows = letOut(TORSO.filter(([y]) => y < 0.45), 0.007, B);
    const { geometry, edges } = shell(rows, {
      segments: 64, squareness: 0.9,
      crease: (y, x) => 0.003 * foldAt(y - 0.12 - 0.04 * x, 0.014),
      span: openFront((y) => 0.004 + Math.max(0, y - 0.17) * 0.34, 0.9),
    });
    piece(body.chest, geometry, vest);
    const edging = M(look.vest.clone().multiplyScalar(0.6), 0.8);
    for (const e of edges) binding(body.chest, edging, e);
    for (let y = 0.0; y < 0.2; y += 0.05) piece(body.chest, button, M(C(0x8a7a5a), 0.35, { metalness: 0.6 }), 0.012, y, frontOf(rows, y) + 0.003);
    if (rnd() < 0.5) {
      const gold = M(C(0xd4b062), 0.25, { metalness: 0.9 });
      const f = (y) => frontOf(rows, y) + 0.004;
      cord(body.chest, gold, 0.0012, [[0.013, 0.08, f(0.08)], [0.05, 0.06, f(0.06)], [0.09, 0.055, f(0.055) - 0.01], [0.12, 0.07, f(0.07) - 0.03]]);
    }
  }
  // braces over the shirt, or a belt
  const braces = !her && !look.vest && !look.coat && rnd() < 0.55;
  if (braces) {
    const strap = M(C(0x3a2a20).lerp(look.legs, 0.4), 0.8);
    for (const sx of [-1, 1]) {
      const at = (x, y) => [sx * x, y, frontOf(TORSO, y) + 0.004];
      const back = (x, y) => [sx * x, y, -backOf(TORSO, y) - 0.004];
      cord(body.chest, strap, 0.008, [at(0.085, 0.0), at(0.095, 0.2), at(0.1, 0.38), [sx * 0.105, 0.47, 0.03], [sx * 0.1, 0.47, -0.06], back(0.08, 0.36), back(0.03, 0.16), back(0.06, 0.0)]);
    }
  }

  // ── Arms ──
  const sleeveCloth = look.coat ? cloth(look.coat === true ? C(0x141416) : look.coat, 'twill', 0.9) : shirt;
  for (const [A, side] of [[body.armL, 1], [body.armR, -1]]) {
    let geo = sleeve(side, (x, y) => {
      const cuff = y < -0.49 ? 0.82 : 1;
      return [cuff, cuff, cuff];
    });
    geo = takeIn(geo, her ? 0.8 : 0.86 * Math.sqrt(B), 0.07);
    flattenCap(geo);
    limb(A.shoulder, A.elbow, geo, sleeveCloth, 0.062, -0.035);
    piece(A.elbow, handShape(side), skin, 0, -0.229);
  }

  // ── A frock coat (the dark town's) ──
  if (look.coat) {
    const coat = cloth(C(0x141416).lerp(look.legs, 0.2), 'twill', 0.88, { side: THREE.DoubleSide });
    const rows = letOut(TORSO.filter(([y]) => y < 0.49), 0.01, B);
    const { geometry } = shell(rows, {
      segments: 56, squareness: 0.9,
      crease: (y, x) => 0.004 * foldAt(y - 0.15 - 0.05 * x, 0.016),
      span: openFront((y) => 0.002 + Math.max(0, y - 0.26) * 0.5, 0.9),
    });
    piece(body.chest, geometry, coat);
    const w = 0.186 * B;
    const d = 0.136;
    const skirt = skirtGeometry(COAT_SKIRT, w, d, { pleats: 6, span: openFront((y) => 0.004 + (COAT_SKIRT.waist - y) * 0.07) });
    hangFromHips(body, skirt, coat, { reach: 0.65, waist: COAT_SKIRT.waist });
  }

  // ── Legs ──
  if (her) {
    // a long full skirt from the waist, an apron over it on some; stockings
    // and buttoned boots under it
    const w = BODICE[1][1] + 0.016;
    const d = BODICE[1][2] + 0.016;
    const dress = cloth(look.dress, 'canvas', 0.92);
    hangFromHips(body, skirtGeometry(SKIRT, w, d, { pleats: 14, dust: true }), dress, { reach: 0.55, waist: SKIRT.waist });
    if (look.apron) {
      const apron = cloth(C(0xe8e2d4), 'canvas', 0.85, { side: THREE.DoubleSide });
      const spec = { waist: SKIRT.waist - 0.01, hem: SKIRT.hem + 0.16, flare: [SKIRT.flare[0] * 0.92 + APRON, SKIRT.flare[1] * 0.92 + APRON] };
      const geo = skirtGeometry(spec, w + APRON * 0.5, d + APRON * 0.5, { pleats: 5, depth: 0.012, dust: true, span: () => [-0.95, 0.95] });
      hangFromHips(body, geo, apron, { reach: 0.55, waist: spec.waist });
      cord(body.hips, apron, 0.006, [[-0.15, SKIRT.waist - 0.02, 0.02], [-0.1, SKIRT.waist - 0.02, 0.125], [0, SKIRT.waist - 0.02, 0.14], [0.1, SKIRT.waist - 0.02, 0.125], [0.15, SKIRT.waist - 0.02, 0.02]]);
    }
    const stocking = M(C(0x26201e), 0.8);
    for (const Lg of [body.legL, body.legR]) {
      limb(Lg.hip, Lg.knee, trouserLeg(Lg.side, null, 0.095, STOCKING), stocking, 0.087, -0.18);
      boots(Lg, leather, sole, false);
    }
  } else {
    const trousers = cloth(look.legs, 'twill', 0.95);
    for (const Lg of [body.legL, body.legR]) {
      limb(Lg.hip, Lg.knee, trouserLeg(Lg.side, (x, y, front) => {
        const knee = y >= -0.5 && y <= -0.34 && front > 0.2 ? 0.84 : 1; // worn at the knee
        const hem = 1 - 0.25 * smoothstep(-0.7, -0.8, y); // dust
        const t = knee * hem;
        return [t, t * 0.98, t * 0.95];
      }), trousers, 0.087, -0.18);
      boots(Lg, leather, sole, look.hat === 'cowboy' && rnd() < 0.7);
    }
    const band = (by) => tailored(WAISTBAND.map(([y, w, d]) => [y, w * Math.max(1, B) + by, d + by]), { segments: 40 });
    piece(body.hips, band(0), trousers);
    if (!braces && !look.coat) {
      // a belt, and its buckle
      piece(body.hips, tailored([[0.046, 0.192 * Math.max(1, B), 0.136], [0.05, 0.193 * Math.max(1, B), 0.137], [0.076, 0.193 * Math.max(1, B), 0.137], [0.08, 0.192 * Math.max(1, B), 0.136]], { segments: 40 }), leather);
      piece(body.hips, new THREE.BoxGeometry(0.042, 0.032, 0.006), M(C(0xb09a6a), 0.3, { metalness: 0.8 }), 0, 0.063, 0.139);
    }
  }

  const back = group(body.chest, 0, 0.258, -backOf(pattern, 0.258) - 0.006);
  return { brow, crown, back };
}

// Boots: the hikers' boot cut in leather, and on some a tall shaft up the
// shin over the trousers.
function boots(Lg, leather, sole, tall) {
  piece(Lg.ankle, bootUpper(), leather);
  piece(Lg.ankle, outsole(), sole);
  if (tall) {
    piece(Lg.knee, tailored([[-0.4, 0.056, 0.064, 0.01], [-0.3, 0.054, 0.06, 0.006], [-0.2, 0.06, 0.066, 0.004], [-0.17, 0.064, 0.07, 0.004]], { segments: 20 }), leather);
  }
}

// A child: the hiker children's head, a shirt and trousers with braces, or
// a dress with a pinafore over it, and boots.
const CHILD_TORSO = [
  [-0.105, 0.2, 0.14, 0.004], [-0.075, 0.198, 0.143, 0.008, 0.004],
  [-0.02, 0.19, 0.146, 0.012, 0.006], [0.05, 0.178, 0.142, 0.01, 0.006],
  [0.13, 0.168, 0.132, 0.004], [0.22, 0.17, 0.126], [0.31, 0.18, 0.125],
  [0.37, 0.186, 0.121], [0.41, 0.184, 0.112], [0.44, 0.17, 0.1],
  [0.465, 0.138, 0.088], [0.485, 0.105, 0.076], [0.5, 0.074, 0.066],
];
function dressChild(body, look, rnd, colours) {
  const her = look.her;
  const skinHex = colours.skin.getHex();
  const skin = M(skinHex, 0.68);
  const hairHex = colours.hair.getHex();
  const cloth = (colour, weave = 'canvas') => M(colour, 0.92, { vertexColors: true, ...textile(weave) });
  piece(body.neck, new THREE.CylinderGeometry(0.061, 0.066, 0.12, 16), skin, 0, 0.05);
  const L = {
    skull: V(0.117, 0.158, 0.137).multiplyScalar(range(rnd, 0.96, 1.04)),
    at: V(0, 0.03, -0.012),
    chin: range(rnd, 0.11, 0.16),
    jaw: 0.05,
    cheeks: { wide: range(rnd, 0.05, 0.09), forward: 0.011 },
    eyes: { x: 0.043, w: 0.019, h: 0.0085, iris: 0.0086 },
    brow: 0.03,
    nose: -0.045,
    noseSize: range(rnd, 0.012, 0.014),
    mouth: -0.085,
    hair: her
      ? { fringe: 0.09, side: -0.06, nape: -0.16, top: 0.02, sides: 0.012, long: [0.2, 0.7], tuck: 0.005, ragged: 0.002, forward: 0.004, down: 0.01, fade: 0 }
      : { fringe: range(rnd, 0.075, 0.1), side: 0.02, nape: -0.085, top: 0.018, sides: 0.006, long: [0.35, 0.75], tuck: 0.005, ragged: 0.003, forward: 0.01, down: 0.006, fade: 0.1 },
    tufts: { count: 60, seed: 1 + Math.floor(rnd() * 1e6), length: [0.008, 0.008], width: [0.0045, 0.003], lean: [1.0, 1.2] },
    ears: { size: 0.031, y: -0.008, z: -0.022, out: range(rnd, 0.2, 0.45) },
    band: 0.07,
    colour: { skin: skinHex, lips: colours.skin.clone().lerp(C(0xa85a50), 0.45).getHex(), rosy: colours.skin.clone().lerp(C(0xd87a6a), 0.35).getHex(), hair: hairHex, iris: colours.iris },
  };
  const { brow, crown } = childHead(body.head, skin, L);
  const top = cloth(look.shirt);
  piece(body.chest, tailored(CHILD_TORSO, { segments: 40, squareness: 0.92, crease: (y) => 0.004 * foldAt(y - 0.02, 0.016) }), top);
  piece(body.chest, tailored([[0.49, 0.086, 0.075], [0.506, 0.081, 0.071], [0.522, 0.077, 0.068]], { segments: 24 }), cloth(look.shirt.clone().lerp(C(0xf0ece0), 0.3)));
  for (const [A, side] of [[body.armL, 1], [body.armR, -1]]) {
    limb(A.shoulder, A.elbow, takeIn(sleeve(side, () => [1, 1, 1]), 0.76, 0.1), top, 0.062, -0.035);
    piece(A.elbow, handShape(side), skin, 0, -0.229);
  }
  const leather = M(C(0x2c2018), 0.65);
  const sole = M(C(0x1e1a16), 0.9);
  if (her) {
    const w = CHILD_TORSO[0][1] + 0.016;
    const d = CHILD_TORSO[0][2] + 0.016;
    const spec = { waist: 0.06, hem: -0.6, flare: [0.27, 0.24] };
    hangFromHips(body, skirtGeometry(spec, w, d, { pleats: 10, dust: true }), cloth(look.dress || look.shirt), { reach: 0.6, waist: spec.waist });
    const pin = { waist: 0.055, hem: -0.5, flare: [0.25 + APRON, 0.22 + APRON] };
    const apron = skirtGeometry(pin, w + APRON * 0.5, d + APRON * 0.5, { pleats: 4, depth: 0.012, span: () => [-0.9, 0.9] });
    hangFromHips(body, apron, cloth(C(0xece6d8)), { reach: 0.6, waist: pin.waist });
    const stocking = M(C(0x3a3634), 0.85);
    for (const Lg of [body.legL, body.legR]) {
      limb(Lg.hip, Lg.knee, takeIn(trouserLeg(Lg.side, null, 0.095, STOCKING), 0.9, -0.2), stocking, 0.087, -0.18);
      boots(Lg, leather, sole, false);
    }
  } else {
    const trousers = cloth(look.legs, 'twill');
    for (const Lg of [body.legL, body.legR]) {
      limb(Lg.hip, Lg.knee, takeIn(trouserLeg(Lg.side, (x, y) => {
        const t = 1 - 0.25 * smoothstep(-0.7, -0.8, y);
        return [t, t, t];
      }), 0.9, -0.2), trousers, 0.087, -0.18);
      boots(Lg, leather, sole, false);
    }
    const strap = M(C(0x3a2a20), 0.8);
    for (const sx of [-1, 1]) {
      const at = (x, y) => [sx * x, y, frontOf(CHILD_TORSO, y) + 0.004];
      const back = (x, y) => [sx * x, y, -backOf(CHILD_TORSO, y) - 0.004];
      cord(body.chest, strap, 0.008, [at(0.08, -0.06), at(0.09, 0.2), at(0.1, 0.38), [sx * 0.105, 0.47, 0.03], [sx * 0.1, 0.47, -0.06], back(0.08, 0.36), back(0.06, -0.06)]);
    }
  }
  const back = group(body.chest, 0, 0.258, -backOf(CHILD_TORSO, 0.258) - 0.004);
  return { brow, crown, back };
}

// ── How they move ───────────────────────────────────────────────────────────
// The hikers' walk; and over it, turning to look at you (the eyes first,
// then the head, the neck taking a little of it), and a wave.
const LOOK_TURN = { eyes: 0.42, neck: 0.4 }; // radians the eyes turn, at the most; and the neck's share of the head's turn
const WAVE = { sh: [-Math.PI / 2, 0, -1.42], el: -1.55, swing: 0.38, rate: 10 }; // the right arm up, the forearm swinging

export class Folk {
  // (who: theirs, if it's been worked out already: growFolk)
  constructor(look, seed, { ground = null } = {}, who = whoOf(look, seed)) {
    this.look = look;
    this.character = new Character(who);
    this.character.groundAt = ground;
    this.mesh = this.character.root;
    this.waving = 0; // s left of a wave
    this.headYaw = 0;
    this.eyeYaw = 0;
    this.t = Math.random() * 10;
    this.lastYaw = null;
    this.gaze = null;
    this.mesh.traverse((o) => {
      if (o.name === 'eyes') this.gaze = o.userData.gaze;
    });
  }

  // speed: m/s along the ground; lookAt: yaw the head would like to turn
  // to, from the way they face, or null to look about as they will
  pose(dt, speed, lookAt) {
    const c = this.character;
    this.t += dt;
    const yaw = this.mesh.rotation.y;
    const turn = this.lastYaw === null || dt <= 0 ? 0 : wrapAngle(yaw - this.lastYaw) / dt;
    this.lastYaw = yaw;
    c.update(dt, speed, true, 0, turn);

    // the eyes go first, the head follows
    const want = lookAt === null ? 0 : clamp(lookAt, -1.4, 1.4);
    this.headYaw += (want - this.headYaw) * Math.min(1, dt * (lookAt === null ? 1.5 : 3.5));
    const eyeWant = lookAt === null ? 0 : clamp(want - this.headYaw, -LOOK_TURN.eyes, LOOK_TURN.eyes);
    this.eyeYaw += (eyeWant - this.eyeYaw) * Math.min(1, dt * 14);
    c.neck.rotation.y = this.headYaw * LOOK_TURN.neck;
    c.head.rotation.y += this.headYaw * (1 - LOOK_TURN.neck);
    if (this.gaze) this.gaze.set(Math.sin(this.eyeYaw), -0.04, Math.cos(this.eyeYaw)).normalize();

    if (this.waving > 0) {
      // the right hand up, waving
      this.waving -= dt;
      const up = clamp(Math.min(this.waving * 3, (1.8 - this.waving) * 4), 0, 1);
      const S = c.armR.shoulder.rotation;
      S.set(lerp(S.x, WAVE.sh[0], up), lerp(S.y, WAVE.sh[1], up), lerp(S.z, WAVE.sh[2], up));
      const E = c.armR.elbow.rotation;
      E.x = lerp(E.x, WAVE.el + Math.sin(this.t * WAVE.rate) * WAVE.swing, up);
    }
  }

  dispose() {
    this.character.dispose();
  }
}
