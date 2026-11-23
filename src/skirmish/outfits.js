// Who the fighters are: the Raiders and the Wardens, dressed onto the same
// body the hikers have (player/character.js), in clothes cut the way theirs
// are (player/clothing.js).
//
//   a Raider   a faded red field shirt and sand trousers, brown boots, a
//              canvas rig of magazine pouches, a checked scarf wound round
//              the head and across the face, dark glasses
//   a Warden   a slate blue shirt, grey trousers bloused over black boots,
//              knee pads and gloves, dark webbing, a hood and goggles, a
//              peaked cap
//
// Whoever has bought a vest wears it (the object named 'armour', in place of
// the 'rig'), and whoever has bought a helmet wears that (heads.js). No two
// on a side are quite alike: there are a few of each, a little taller or
// shorter, in other shades.
//
//   outfit(side, n) -> who (as Character.dress takes: { id, name, size, dress })
//       side: 'attack' (the Raiders) | 'defend' (the Wardens); n: which of them
//   SIDE_COLOURS   each side's colour, for what is drawn about them
//   armOn(bones, side, sleeveOf(side, n))   a sleeve and a hand of theirs on
//       an arm's two bones: for your own arms in front of you (hands.js)

import * as THREE from 'three';
import { tailored, sleeve, trouserLeg, bootUpper, outsole, handShape, textile, foldAt, material as M, piece, cord, group, limb } from '../player/clothing.js';
import { raiderHead, wardenHead } from './heads.js';

export const SIDE_COLOURS = {
  attack: { css: '#e2674a' },
  defend: { css: '#6aa2e0' },
};

// A field shirt, tucked in at the belt, up to the collar, in the chest's
// frame: rows as tailored() takes them. Closer cut than a rain shell.
const SHIRT = [
  // (inside the trousers' waistband, which comes up to 0.06, and bloused out over it)
  [-0.05, 0.156, 0.1, -0.004],
  [-0.01, 0.162, 0.106, -0.003],
  [0.04, 0.166, 0.116, -0.001],
  [0.078, 0.174, 0.131, 0, 0.006],
  [0.12, 0.166, 0.126, 0, -0.006],
  [0.2, 0.176, 0.132, 0.001, -0.005],
  [0.28, 0.19, 0.14, 0.002],
  [0.35, 0.204, 0.144, 0.003],
  [0.395, 0.218, 0.14],
  [0.43, 0.218, 0.128],
  [0.46, 0.18, 0.114],
  [0.487, 0.124, 0.098],
  [0.502, 0.09, 0.082],
];
// A vest over it, open at the arms: a plate before and behind.
const VEST = [
  [0.015, 0.182, 0.142, -0.002],
  [0.03, 0.19, 0.15, -0.002],
  [0.13, 0.186, 0.148, 0],
  [0.22, 0.19, 0.152, 0.001],
  [0.3, 0.188, 0.158, 0.002],
  [0.36, 0.172, 0.16, 0.003],
  [0.41, 0.15, 0.152, 0.002],
  [0.445, 0.132, 0.13, 0],
  [0.47, 0.118, 0.11, 0],
];
// A band of webbing round the middle, that pouches hang on.
const BAND = [
  [0.04, 0.178, 0.137, 0],
  [0.05, 0.181, 0.14, 0],
  [0.19, 0.186, 0.144, 0.001],
  [0.2, 0.183, 0.141, 0.001],
];
// A belt, on the hips (in the hips' frame), over the trousers.
const BELT = [
  [0.012, 0.184, 0.136, -0.002],
  [0.018, 0.188, 0.14, -0.002],
  [0.052, 0.186, 0.138, -0.002],
  [0.058, 0.182, 0.134, -0.002],
];
// A pouch for one magazine, and for odds and ends.
const POUCH = [
  [-0.056, 0.027, 0.012],
  [-0.05, 0.032, 0.017],
  [0.044, 0.033, 0.018],
  [0.05, 0.03, 0.015],
];
const SATCHEL = [
  [-0.05, 0.036, 0.016],
  [-0.042, 0.044, 0.024],
  [0.03, 0.044, 0.026],
  [0.04, 0.04, 0.02],
];

// Pouches across the front of something `front` m ahead of the chest's
// middle: a magazine showing at the top of each, a strap down over it.
function pouches(parent, cloth, strap, mag, front, y, xs) {
  for (const x of xs) {
    const lean = -x * 0.9; // round the body with it
    const g = group(parent, x, y, front - Math.abs(x) * 0.09);
    g.rotation.y = -lean;
    piece(g, tailored(POUCH, { segments: 12, squareness: 0.5 }), cloth, 0, 0, 0.014);
    piece(g, new THREE.BoxGeometry(0.046, 0.026, 0.02), mag, 0, 0.056, 0.014);
    cord(g, strap, 0.0032, [[0, 0.05, 0.03], [0, 0.03, 0.034], [0, -0.02, 0.0335], [0, -0.04, 0.03]]);
  }
}

// A sleeve and a hand on an arm's two bones (A: { shoulder, elbow }, side: 1
// the left). pads: the elbow patched.
export function armOn(A, side, { cloth, hand, cuff, pads = false }) {
  limb(
    A.shoulder,
    A.elbow,
    sleeve(side, (x, y, front) => {
      const tone = y < -0.49 ? 0.6 : pads && front < -0.3 && y < -0.22 && y > -0.36 ? 0.7 : 1;
      return [tone, tone, tone];
    }),
    cloth,
    0.062,
    -0.035,
  );
  piece(A.elbow, handShape(side), hand, 0, -0.229);
  // (a strap round the wrist of a glove, or the cuff buttoned)
  piece(A.elbow, tailored([[-0.235, 0.036, 0.04], [-0.215, 0.038, 0.042]], { segments: 14 }), cuff);
}

// What both sides have under whatever marks them out.
//   L: { skin, shirt, shirtWeave, trim, trousers, boots, sole, hands (null:
//        bare), rig, strap, armour, mag, pads (or null), neck (what covers it,
//        or none), patch, tape (a badge on the arm, a name on the vest, or none) }
function dressBody(body, L) {
  const skin = M(L.skin, 0.68);
  const shirt = M(L.shirt, 0.9, { vertexColors: true, ...textile(L.shirtWeave) });
  const trim = M(L.trim, 0.86);
  const pants = M(L.trousers, 0.95, { vertexColors: true, ...textile('twill') });
  const boot = M(L.boots, 0.7);
  const sole = M(L.sole, 0.94);
  const rigCloth = M(L.rig, 0.9, textile('canvas'));
  const strap = M(L.strap, 0.95, textile('canvas'));
  const mag = M(L.mag, 0.5);
  const hands = L.hands === null ? skin : M(L.hands, 0.8);

  // ── The shirt ──
  piece(
    body.chest,
    tailored(SHIRT, {
      segments: 48,
      squareness: 0.9,
      crease: (y, across, front) => {
        const ax = Math.abs(across);
        const pocket = front > 0 ? 0.006 * foldAt(y - 0.3 + 0.02 * ax, 0.012) * THREE.MathUtils.smoothstep(ax, 0.2, 0.3) * (1 - THREE.MathUtils.smoothstep(ax, 0.72, 0.8)) : 0;
        // (smooth where it's tucked in)
        const out = THREE.MathUtils.smoothstep(y, 0.06, 0.1);
        return pocket + out * (0.005 * foldAt(y - 0.1 + 0.05 * across, 0.013) + 0.004 * foldAt(y - 0.41 + 0.11 * ax, 0.012));
      },
      surface: (x, y, front) => {
        // the placket down the front, the yoke across the shoulders
        const placket = front > 0.5 && Math.abs(x) < 0.014 ? 0.82 : 1;
        const tone = (y > 0.4 ? 0.9 : 1) * placket;
        return [tone, tone, tone];
      },
    }),
    shirt,
  );
  piece(body.chest, tailored([[0.464, 0.112, 0.105], [0.502, 0.103, 0.094], [0.535, 0.094, 0.085], [0.546, 0.088, 0.08]]), trim);
  piece(body.neck, new THREE.CylinderGeometry(0.054, 0.064, 0.13, 16), L.neck ? M(L.neck, 0.94) : skin, 0, 0.055);

  // ── A belt, with a buckle; a holster strapped to the right leg ──
  piece(body.hips, tailored(BELT, { segments: 36, squareness: 0.9 }), strap);
  piece(body.hips, new THREE.BoxGeometry(0.04, 0.03, 0.006), M(0x8a7c58, 0.45, { metalness: 0.5 }), 0, 0.035, 0.138);
  {
    const thigh = body.legR.hip;
    const holster = tailored([[-0.1, 0.012, 0.024], [-0.09, 0.017, 0.032], [0.03, 0.02, 0.04], [0.045, 0.018, 0.036]], { segments: 12, squareness: 0.5 });
    const h = piece(thigh, holster, strap, -0.108, -0.2, 0.012);
    h.rotation.z = -0.06;
    piece(thigh, new THREE.BoxGeometry(0.022, 0.04, 0.03), M(0x151617, 0.6), -0.112, -0.14, 0.004).rotation.x = 0.25;
    for (const y of [-0.17, -0.25]) piece(thigh, tailored([[y - 0.011, 0.094, 0.108, 0.002], [y + 0.011, 0.096, 0.11, 0.002]], { segments: 20 }), strap);
    cord(thigh, strap, 0.006, [[-0.1, -0.13, 0.02], [-0.104, -0.06, 0.03], [-0.1, 0.02, 0.05], [-0.09, 0.07, 0.06]]);
  }

  // ── What they carry it all in: a rig of pouches, or a vest with them on it ──
  const rig = group(body.chest);
  rig.name = 'rig';
  piece(rig, tailored(BAND, { segments: 40, squareness: 0.88 }), rigCloth);
  pouches(rig, rigCloth, strap, mag, 0.142, 0.12, [-0.088, 0, 0.088]);
  for (const side of [-1, 1]) {
    // a strap over each shoulder, crossing behind
    cord(rig, strap, 0.008, [[side * 0.1, 0.19, 0.142], [side * 0.112, 0.33, 0.146], [side * 0.12, 0.44, 0.1], [side * 0.11, 0.492, 0.0], [side * 0.07, 0.44, -0.1], [-side * 0.02, 0.3, -0.142], [-side * 0.09, 0.19, -0.142]]);
    const s = piece(rig, tailored(SATCHEL, { segments: 12, squareness: 0.55 }), rigCloth, side * 0.178, 0.1, 0.0);
    s.rotation.y = side * (Math.PI / 2);
  }
  const armour = group(body.chest);
  armour.name = 'armour';
  armour.visible = false;
  const plate = M(L.armour, 0.88, { vertexColors: true, ...textile('canvas') });
  piece(
    armour,
    tailored(VEST, {
      segments: 44,
      squareness: 0.8,
      crease: (y, across, front) => 0.003 * foldAt(y - 0.215, 0.01) * Math.abs(front) + 0.003 * foldAt(y - 0.31, 0.01) * Math.abs(front),
      surface: (x, y, front) => {
        // rows of webbing across the plates, to hang things from
        const web = Math.abs(front) > 0.4 && y > 0.05 && y < 0.34 && Math.floor(y / 0.022) % 2 === 0 ? 0.8 : 1;
        const side = Math.abs(front) < 0.35 ? 0.72 : 1;
        return [web * side, web * side, web * side];
      },
    }),
    plate,
  );
  pouches(armour, plate, strap, mag, 0.156, 0.12, [-0.09, 0, 0.09]);
  if (L.tape) piece(armour, new THREE.BoxGeometry(0.1, 0.022, 0.004), M(L.tape, 0.8), 0, 0.3, 0.161);
  // (a handle to be dragged by, behind the neck)
  cord(armour, strap, 0.006, [[-0.04, 0.44, -0.132], [-0.03, 0.47, -0.142], [0.03, 0.47, -0.142], [0.04, 0.44, -0.132]]);

  // ── Arms and legs ──
  for (const [A, side] of [[body.armL, 1], [body.armR, -1]]) {
    armOn(A, side, { cloth: shirt, hand: hands, cuff: L.hands === null ? trim : strap, pads: !!L.pads });
    if (L.patch) {
      const badge = piece(A.shoulder, new THREE.BoxGeometry(0.004, 0.05, 0.044), M(L.patch, 0.8), side * 0.0745, -0.105, 0.004);
      badge.rotation.z = side * 0.04;
    }
  }
  for (const Lg of [body.legL, body.legR]) {
    limb(
      Lg.hip,
      Lg.knee,
      trouserLeg(Lg.side, (x, y, front) => {
        // a pocket on the thigh, the seat and the knees worn
        const pocket = Math.abs(front) < 0.55 && y < -0.2 && y > -0.36 && x * Lg.side > 0.02;
        const tone = pocket ? 0.84 : y < -0.74 ? 0.7 : front > 0.3 && y < -0.36 && y > -0.5 ? 0.9 : 1;
        return [tone, tone, tone];
      }),
      pants,
      0.087,
      -0.18,
    );
    piece(Lg.ankle, bootUpper(), boot);
    piece(Lg.ankle, outsole(), sole);
    cord(Lg.ankle, sole, 0.003, [[-0.033, -0.006, 0.112], [0.032, 0.008, 0.094], [-0.031, 0.023, 0.082], [0.029, 0.038, 0.067], [-0.029, 0.05, 0.059]]);
    if (L.pads) {
      // a hard cap over the knee, on a pad, strapped behind
      const pad = M(L.pads, 0.6);
      piece(Lg.knee, new THREE.SphereGeometry(1, 14, 10).scale(0.05, 0.066, 0.03), pad, 0, -0.012, 0.064);
      piece(Lg.knee, tailored([[-0.06, 0.07, 0.082, 0.004], [-0.04, 0.071, 0.083, 0.004]], { segments: 18 }), strap);
      piece(Lg.knee, tailored([[0.02, 0.074, 0.088, 0.006], [0.04, 0.076, 0.09, 0.006]], { segments: 18 }), strap);
    }
  }
  // where something carried on the back goes (the charge): +z into the body
  return group(body.chest, 0, 0.25, -0.168);
}

const SKINS = [0xc8957a, 0xa97753, 0x8b5d40, 0xd3a887, 0xb88563];
const SIZES = [1, 0.97, 1.03, 0.985, 1.015];
const RAIDERS = [
  { shirt: 0xa8452e, scarf: [0xe6dcc4, 0x8a2f20], trousers: 0xb8a078 },
  { shirt: 0x9a4a33, scarf: [0xe2d8c0, 0x1f1d1b], trousers: 0xad9972 },
  { shirt: 0xb04d2b, scarf: [0xd9cfae, 0x55603a], trousers: 0xc0a981 },
  { shirt: 0x984029, scarf: [0xe6dcc4, 0x8a2f20], trousers: 0xa8956c },
  { shirt: 0xa5502f, scarf: [0xe0d6bc, 0x2a2622], trousers: 0xb8a078 },
];
const WARDENS = [
  { shirt: 0x47607e, trousers: 0x565d6c },
  { shirt: 0x435b78, trousers: 0x5b6170 },
  { shirt: 0x4c6583, trousers: 0x525968 },
  { shirt: 0x47607e, trousers: 0x5b6170 },
  { shirt: 0x415873, trousers: 0x565d6c },
];

const made = new Map();
// Who a fighter is: the nth (0..4) of their side.
export function outfit(side, n) {
  const k = ((n % 5) + 5) % 5;
  const key = `${side}:${k}`;
  if (made.has(key)) return made.get(key);
  const raider = side === 'attack';
  const who = {
    id: `skirmish-${key}`,
    name: raider ? 'a Raider' : 'a Warden',
    size: SIZES[k],
    dress(body) {
      if (raider) {
        const R = RAIDERS[k];
        const back = dressBody(body, { skin: SKINS[k], shirt: R.shirt, shirtWeave: 'twill', trim: 0x6e2c1c, trousers: R.trousers, boots: 0x5c4130, sole: 0x2c2620, hands: null, rig: 0x8c7b55, strap: 0x5e5238, armour: 0x5b5c3c, mag: 0x2a2623, pads: null });
        return { ...raiderHead(body.head, { skin: SKINS[k], scarf: R.scarf, helmet: 0x7a7350 }), back };
      }
      const W = WARDENS[k];
      const back = dressBody(body, { skin: SKINS[(k + 2) % 5], shirt: W.shirt, shirtWeave: 'ripstop', trim: 0x2c3c52, trousers: W.trousers, boots: 0x1d1d1f, sole: 0x121212, hands: 0x202226, rig: 0x2f3b4e, strap: 0x222a36, armour: 0x2a3444, mag: 0x15171a, pads: 0x1d2025, patch: 0xc9d4e0, tape: 0xd0d6dc, neck: 0x39424e });
      return { ...wardenHead(body.head, { hood: 0x39424e, cap: 0x2f4160, helmet: 0x2a3a54, strap: 0x46566e }), back };
    },
  };
  made.set(key, who);
  return who;
}

// What your own arms are in: the cloth and the hands of the nth of a side.
export function sleeveOf(side, n) {
  const k = ((n % 5) + 5) % 5;
  const raider = side === 'attack';
  return {
    cloth: M(raider ? RAIDERS[k].shirt : WARDENS[k].shirt, 0.9, { vertexColors: true, ...textile(raider ? 'twill' : 'ripstop') }),
    hand: raider ? M(SKINS[k], 0.68) : M(0x202226, 0.8),
    cuff: M(raider ? 0x6e2c1c : 0x222a36, 0.9),
    pads: !raider,
  };
}
