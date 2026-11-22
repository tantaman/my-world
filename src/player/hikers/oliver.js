// Oliver: five, nearly six. A dark green henley with three buttons at the
// neck, navy joggers gathered at the ankle over grey socks, royal blue
// trainers with white soles and a red-orange flash at the heel. Dark brown
// hair, faded short at the sides and longer and spiky on top, brown eyes,
// ears that stand out a little, and no hat.
//
// He is the grown-up body made smaller (SIZE), so everything here is in
// metres of the grown-up body, like the bones it hangs from; his head is
// bigger than that would make it, the way a child's is, and his face sits
// low on it (child.js builds it, to his look). Everything on the head is
// placed from eye level, +z the way he looks.

import * as THREE from 'three';
import { lerp } from '../../noise.js';
import { tailored, sleeve, trouserLeg, handShape, textile, foldAt, material as M, piece, cord, group, limb } from '../clothing.js';
import { childHead, takeIn, TRAINER_SOLE, TRAINER_UPPER } from './child.js';

// How tall he is beside the grown-up: about 1.16 m to 1.8.
const SIZE = 0.63;

// His head (grown-up metres, from eye level): what each of these is, is at
// the top of child.js.
const LOOK = {
  skull: new THREE.Vector3(0.117, 0.158, 0.137),
  at: new THREE.Vector3(0, 0.03, -0.012),
  chin: 0.14,
  jaw: 0.05,
  cheeks: { wide: 0.07, forward: 0.011 },
  eyes: { x: 0.043, w: 0.019, h: 0.0085, iris: 0.0086 },
  brow: 0.03,
  nose: -0.045,
  noseSize: 0.013,
  mouth: -0.085,
  // down to the fringe high on his forehead, faded short at the sides,
  // level with the tops of his ears
  hair: { fringe: 0.104, side: 0.02, nape: -0.085, top: 0.024, sides: 0.0035, long: [0.35, 0.75], tuck: 0.005, ragged: 0.003, forward: 0.012, down: 0.004, fade: 0.28 },
  // spiky on top
  tufts: { count: 80, seed: 7, length: [0.012, 0.012], width: [0.0045, 0.003], lean: [0.4, 1.1] },
  ears: { size: 0.031, y: -0.008, z: -0.022, out: 0.42 }, // standing out a little
  band: 0.07,
  colour: { skin: 0xc4957a, lips: 0xb2705e, rosy: 0xd8a08c, hair: 0x1c130f, iris: 0x3b2214 },
};

// ── Colours (as in the photograph) ──────────────────────────────────────────
const SKIN = LOOK.colour.skin;
const SHIRT = 0x203c30;
const BUTTON = 0x3a5446;
const JOGGERS = 0x1b1f38;
const SOCK = 0x6e6e76;
const TRAINER = 0x2346b8;
const FLASH = 0xe2482c;
const SOLE_WHITE = 0xeeeeea;
const TREAD = 0x3a3a3e;
const LINING = 0x1a2040;

const _d = new THREE.Color();

// ── His shirt (the chest's frame) ───────────────────────────────────────────
// A henley: long sleeves, a round ribbed neck and a short placket with three
// buttons. Hem to neck, it hangs loose over the joggers' waist, round over
// his tummy.
const HENLEY = [
  [-0.105, 0.204, 0.142, 0.004], [-0.092, 0.206, 0.145, 0.005],
  [-0.075, 0.2, 0.146, 0.008, 0.004], [-0.02, 0.19, 0.148, 0.012, 0.007],
  [0.05, 0.178, 0.142, 0.01, 0.006], [0.13, 0.168, 0.132, 0.004],
  [0.22, 0.17, 0.126], [0.31, 0.18, 0.125, 0, -0.004],
  [0.37, 0.186, 0.121], [0.41, 0.184, 0.112], [0.44, 0.17, 0.1],
  [0.465, 0.138, 0.088], [0.485, 0.105, 0.076], [0.5, 0.074, 0.066],
];
// How far forward the middle of the shirt's front is at height y.
function shirtFront(y) {
  for (let i = 1; i < HENLEY.length; i++) {
    const [y1, , d1, z1 = 0] = HENLEY[i];
    const [y0, , d0, z0 = 0] = HENLEY[i - 1];
    if (y <= y1) return lerp(z0 + d0, z1 + d1, (y - y0) / (y1 - y0));
  }
  const [, , d, z = 0] = HENLEY[HENLEY.length - 1];
  return z + d;
}
const BUTTONS = [0.39, 0.425, 0.457];

// His joggers, cuff to waist, in the hip's frame (the knee is at -0.42 and
// the ankle at -0.85): roomy, gathered into a cuff above the socks.
const JOGGER_ROWS = [
  [-0.775, 0.049, 0.052], [-0.76, 0.052, 0.055],
  [-0.748, 0.06, 0.064, 0, 0.006], [-0.72, 0.067, 0.072, -0.003, 0.01],
  [-0.69, 0.064, 0.07, 0, 0.012], [-0.63, 0.068, 0.077, -0.006],
  [-0.54, 0.071, 0.08, -0.008], [-0.48, 0.067, 0.075, -0.003, -0.01],
  [-0.45, 0.072, 0.078, 0.002, -0.01], [-0.42, 0.073, 0.082, 0.006],
  [-0.38, 0.076, 0.086, 0.006], [-0.31, 0.081, 0.095, 0.003],
  [-0.17, 0.093, 0.108], [-0.065, 0.1, 0.116, -0.004], [0.025, 0.104, 0.13],
  [0.07, 0.102, 0.12], [0.12, 0.098, 0.113],
];

export const OLIVER = {
  id: 'oliver',
  name: 'Oliver',
  size: SIZE,
  dress(body) {
    const skinMat = M(SKIN, 0.68);
    const shirt = M(SHIRT, 0.9, { vertexColors: true, ...textile('canvas') });
    const joggers = M(JOGGERS, 0.95, { vertexColors: true, ...textile('twill') });
    const rgb = (hex) => _d.set(hex).toArray([]);

    // ── Head and neck ──
    piece(body.neck, new THREE.CylinderGeometry(0.061, 0.066, 0.12, 16), skinMat, 0, 0.05);
    const { brow, crown } = childHead(body.head, skinMat, LOOK);

    // ── Shirt ──
    piece(body.chest, tailored(HENLEY, {
      segments: 40,
      squareness: 0.92,
      crease: (y) => 0.004 * foldAt(y - 0.02, 0.016) + 0.003 * foldAt(y - 0.1, 0.014),
      surface: (x, y) => {
        const hem = y < -0.088 ? 0.8 : 1; // the hem, turned up and stitched
        return [hem, hem, hem];
      },
    }), shirt);
    // the ribbed neck
    piece(body.chest, tailored([[0.49, 0.086, 0.075], [0.506, 0.081, 0.071], [0.522, 0.077, 0.068]],
      { segments: 24 }), M(SHIRT, 0.95));
    // the placket: two lines of stitching and three buttons down from the neck
    const seam = M(0x16291f, 0.95);
    for (const sx of [-1, 1]) {
      cord(body.chest, seam, 0.0016, [0.37, 0.41, 0.45, 0.49].map((y) => [sx * 0.017, y, shirtFront(y) + 0.0005]));
    }
    cord(body.chest, seam, 0.0016, [[-0.017, 0.37, shirtFront(0.37) + 0.0005], [0, 0.366, shirtFront(0.366) + 0.0005], [0.017, 0.37, shirtFront(0.37) + 0.0005]]);
    const button = new THREE.CylinderGeometry(0.0065, 0.0065, 0.003, 10);
    for (const y of BUTTONS) {
      const b = piece(body.chest, button, M(BUTTON, 0.5), 0, y, shirtFront(y) + 0.0015);
      // facing out of the shirt, which leans back towards the neck
      b.rotation.x = Math.PI / 2 + Math.atan2(shirtFront(y + 0.01) - shirtFront(y - 0.01), 0.02);
    }

    // ── Arms ──
    for (const [A, side] of [[body.armL, 1], [body.armR, -1]]) {
      const cloth = takeIn(sleeve(side, (x, y) => {
        const cuff = y < -0.49 ? 0.82 : 1;
        return [cuff, cuff, cuff];
      }), 0.76, 0.1);
      limb(A.shoulder, A.elbow, cloth, shirt, 0.062, -0.035);
      piece(A.elbow, handShape(side), skinMat, 0, -0.229);
    }

    // ── Legs ──
    const trainer = M(0xffffff, 0.6, { vertexColors: true });
    for (const L of [body.legL, body.legR]) {
      const cloth = takeIn(trouserLeg(L.side, (x, y) => {
        const cuff = y < -0.758 ? 0.78 : 1; // the ribbed cuff
        return [cuff, cuff, cuff];
      }, 0.095, JOGGER_ROWS), 0.9, -0.2);
      limb(L.hip, L.knee, cloth, joggers, 0.087, -0.18);
      piece(L.ankle, new THREE.CylinderGeometry(0.041, 0.043, 0.075, 12), M(SOCK, 0.95), 0, 0.065, 0.002);
      // white soles with a darker tread; the blue upper with a red-orange
      // heel and a line of it along the sole, and a dark lining at the collar
      piece(L.ankle, tailored(TRAINER_SOLE, { squareness: 0.75, segments: 20,
        surface: (x, y) => rgb(y < -0.066 ? TREAD : SOLE_WHITE) }), trainer);
      piece(L.ankle, tailored(TRAINER_UPPER, { squareness: 0.8, segments: 24,
        surface: (x, y, front) => {
          if (y > 0.046) return rgb(LINING);
          if (y < -0.04 || (front < -0.6 && y < 0.03)) return rgb(FLASH);
          return rgb(TRAINER);
        } }), trainer);
      // a strap across the top
      cord(L.ankle, M(TRAINER, 0.7), 0.0045, [[-0.05, 0.004, 0.072], [0, 0.03, 0.074], [0.05, 0.004, 0.072]]);
    }

    // What's worn on his back sits on his shirt.
    const back = group(body.chest, 0, 0.258, -shirtBack(0.258) - 0.004);
    return { brow, crown, back };
  },
};

// How far back the middle of the shirt's back is at height y.
function shirtBack(y) {
  for (let i = 1; i < HENLEY.length; i++) {
    const [y1, , d1, z1 = 0] = HENLEY[i];
    const [y0, , d0, z0 = 0] = HENLEY[i - 1];
    if (y <= y1) return lerp(d0 - z0, d1 - z1, (y - y0) / (y1 - y0));
  }
  return HENLEY[HENLEY.length - 1][2];
}
