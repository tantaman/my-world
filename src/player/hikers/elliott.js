// Elliott: nearly three. A dark forest-green puffer jacket quilted in
// channels, unzipped at the top so its stand collar falls open on the navy
// lining, over an oatmeal henley with a button at the neck; sage-green
// joggers rolled up once at the ankle; charcoal trainers with a strap across
// and a red band round the collar. Dark brown hair, long on top and falling
// forward into a straight fringe, clipped short at the sides, with a few
// strands standing up at the crown; brown eyes, full cheeks, and no hat.
//
// He is the grown-up body made smaller (SIZE), like Oliver, with a toddler's
// head: bigger again for his body, the face lower on it (child.js builds it
// to his look). Everything here is in metres of the grown-up body, like the
// bones it hangs from.

import * as THREE from 'three';
import { smoothstep, lerp } from '../../noise.js';
import { tailored, sleeve, trouserLeg, handShape, textile, material as M, piece, cord, group, limb } from '../clothing.js';
import { childHead, TRAINER_SOLE, TRAINER_UPPER } from './child.js';

// How tall he is beside the grown-up: about 0.95 m to 1.8.
const SIZE = 0.51;

// His head (grown-up metres, from eye level): what each of these is, is at
// the top of child.js. Round and big for him, the cheeks full, the eyes
// wider apart than Oliver's for his size; the fringe comes down almost to
// his eyebrows.
const LOOK = {
  skull: new THREE.Vector3(0.136, 0.178, 0.17),
  at: new THREE.Vector3(0, 0.03, -0.018),
  chin: 0.12,
  jaw: 0.05,
  cheeks: { wide: 0.1, forward: 0.014 },
  eyes: { x: 0.047, w: 0.023, h: 0.0105, iris: 0.0105 },
  brow: 0.034,
  nose: -0.046,
  noseSize: 0.012,
  mouth: -0.088,
  hair: { fringe: 0.05, side: 0, nape: -0.1, top: 0.024, sides: 0.006, long: [0.25, 0.7], tuck: 0.005, ragged: 0.004, forward: 0.004, down: 0.014, fade: 0.14 },
  // long on top, lying forward
  tufts: { count: 40, seed: 11, length: [0.018, 0.014], width: [0.011, 0.005], lean: [3, 2], flat: 0.35 },
  wisps: { count: 5, seed: 5, length: 0.028 },
  fringeLocks: { count: 15, seed: 3, across: 0.078, from: 0.024, length: 0.04, width: 0.011 },
  ears: { size: 0.038, y: -0.012, z: -0.03, out: 0.22 },
  // a strap round his head goes over the fringe, just above his eyebrows
  band: 0.05,
  colour: { skin: 0xdfb39b, lips: 0xc07868, rosy: 0xe4a08c, hair: 0x2b1d16, iris: 0x3a2414 },
};

// ── Colours (as in the photographs) ─────────────────────────────────────────
const SKIN = LOOK.colour.skin;
const JACKET = 0x2b4034;
const LINING = 0x1c2858;
const ZIP = 0x5a5838;
const BADGE = 0xe4e4dc;
const HENLEY_GREY = 0xc4bcae;
const BUTTON = 0xeeebe4;
const JOGGERS = 0x6e8a80;
const SOCK = 0x3a3d3a;
const TRAINER = 0x2c2c2e;
const BAND = 0xc23a3a;
const TOE = 0x8c8a84;
const SOLE = 0x9a968c;
const TREAD = 0x2e2e30;

const _d = new THREE.Color();

// ── His jacket (the chest's frame) ──────────────────────────────────────────
// A puffer: boxy, round over his tummy and down to the tops of his legs, with
// elastic at the hem. Hem to neck, as tailored() takes them.
const JACKET_ROWS = [
  [-0.118, 0.2, 0.152, 0.006], [-0.1, 0.206, 0.158, 0.007],
  [-0.06, 0.209, 0.166, 0.01], [0.02, 0.212, 0.171, 0.012],
  [0.1, 0.211, 0.168, 0.01], [0.2, 0.209, 0.162, 0.006],
  [0.3, 0.21, 0.157, 0.002], [0.37, 0.214, 0.152],
  [0.41, 0.21, 0.141], [0.44, 0.192, 0.126],
  [0.465, 0.155, 0.11], [0.485, 0.118, 0.097], [0.5, 0.1, 0.09],
];
const NECK_TOP = 0.5; // the top of the jacket, where the collar stands
const SQUARE = 0.9; // how square its sections are (tailored's squareness)
// It is zipped up to V_FOOT; above that the front falls open into a V,
// V_HALF either side of the zip at the neck, down to V_OPEN of the way.
const V_FOOT = 0.4;
const V_HALF = 0.062;
const V_OPEN = 0.88;
// The down puffs it out into channels between lines of stitching CHANNEL
// apart, from the top of the hem's elastic up; LOFT out from the stitching.
const CHANNEL = 0.088;
const STITCH_FROM = -0.095;
const LOFT = 0.013;
// The stand collar: this tall, falling open at the front this far (radians).
const COLLAR_H = 0.07;
const COLLAR_FALL = 1.05;
// Where his sleeves' channels are, from the top of the cuff up.
const SLEEVE_CHANNEL = 0.085;
const SLEEVE_STITCH_FROM = -0.475;
const SLEEVE_LOFT = 0.011;

// His sleeves, cuff to shoulder (the shoulder's frame: the elbow at -0.28,
// the wrist at -0.55): fat with down, gathered into elastic at the wrist.
const SLEEVE_ROWS = [
  [-0.505, 0.048, 0.05], [-0.49, 0.05, 0.052],
  [-0.475, 0.07, 0.074], [-0.4, 0.08, 0.084],
  [-0.33, 0.083, 0.087], [-0.28, 0.081, 0.086, -0.005], [-0.22, 0.085, 0.089],
  [-0.12, 0.091, 0.094], [-0.03, 0.095, 0.097],
  [0.028, 0.08, 0.082], [0.056, 0.045, 0.05], [0.063, 0.015, 0.02],
];

// ── His shirt, under it (only the neck shows, in the V) ─────────────────────
const HENLEY = [[0.36, 0.175, 0.135], [0.42, 0.158, 0.118], [0.455, 0.125, 0.1],
  [0.482, 0.094, 0.084], [0.5, 0.082, 0.076]];
const RIB = [[0.488, 0.085, 0.079], [0.505, 0.081, 0.075], [0.52, 0.078, 0.072]];

// His joggers, cuff to waist, in the hip's frame (the knee is at -0.42 and
// the ankle at -0.85): roomy, rolled up once at the bottom.
const JOGGER_ROWS = [
  [-0.8, 0.054, 0.057], [-0.79, 0.062, 0.065], [-0.765, 0.064, 0.067], [-0.752, 0.058, 0.061],
  [-0.745, 0.062, 0.066, 0, 0.006], [-0.71, 0.068, 0.073, -0.003, 0.01],
  [-0.67, 0.067, 0.073, 0, 0.012], [-0.6, 0.071, 0.08, -0.006],
  [-0.54, 0.074, 0.083, -0.008], [-0.48, 0.07, 0.078, -0.003, -0.01],
  [-0.45, 0.075, 0.081, 0.002, -0.01], [-0.42, 0.076, 0.085, 0.006],
  [-0.38, 0.079, 0.089, 0.006], [-0.31, 0.085, 0.098, 0.003],
  [-0.17, 0.096, 0.111], [-0.065, 0.102, 0.119, -0.004], [0.025, 0.105, 0.132],
  [0.07, 0.102, 0.12], [0.12, 0.097, 0.113],
];
const ROLL = -0.75; // the top of the rolled cuff

// How full a channel is at height y: 0 at the stitching, 1 between.
function channel(y, from, apart) {
  if (y < from) return 1;
  const t = ((y - from) / apart) % 1;
  return Math.sqrt(Math.sin(Math.PI * t));
}

// Rows with a section added at each line of stitching, so the pinch is sharp.
function stitched(rows, from, apart, to) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    out.push(rows[i]);
    const next = rows[i + 1];
    if (!next) break;
    for (let y = from; y < to; y += apart) {
      if (y <= rows[i][0] + 1e-4 || y >= next[0] - 1e-4) continue;
      const t = (y - rows[i][0]) / (next[0] - rows[i][0]);
      out.push(Array.from({ length: 5 }, (_, k) => lerp(rows[i][k] ?? 0, next[k] ?? 0, t)));
    }
  }
  return out;
}

// A row of JACKET_ROWS (or another's) at height y: [width, depth, z].
function rowAt(rows, y) {
  for (let i = 1; i < rows.length; i++) {
    if (y <= rows[i][0] || i === rows.length - 1) {
      const a = rows[i - 1];
      const b = rows[i];
      const t = Math.min(1, Math.max(0, (y - a[0]) / (b[0] - a[0])));
      return [lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3] ?? 0, b[3] ?? 0, t)];
    }
  }
  return rows[0].slice(1, 4);
}

// How far the front has fallen open at x (on the front, above V_FOOT): 0
// closed, 1 open right down to the foot of the V.
const open = (x, z) => (z > 0 ? V_OPEN * smoothstep(V_HALF, 0, Math.abs(x)) : 0);
// ...and where the top of the jacket is there, once it has.
const neckAt = (x, z) => V_FOOT + (NECK_TOP - V_FOOT) * (1 - open(x, z));

// The stand collar: a band round the top of the jacket, open at the zip and
// falling open either side of it, the flaps turned out. Outside and lining
// share it: { geometry, top: the points along its upper edge }.
function collar() {
  const [w, d, zc] = rowAt(JACKET_ROWS, NECK_TOP);
  const round = (v) => Math.sign(v) * Math.pow(Math.abs(v), SQUARE);
  const GAP = 0.06; // radians either side of the zip with no collar
  const SEGMENTS = 48;
  const ROWS = 3;
  const positions = [];
  const indices = [];
  const top = [];
  const radial = new THREE.Vector3();
  const base = new THREE.Vector3();
  for (let i = 0; i <= SEGMENTS; i++) {
    // from beside the zip, round the back, to beside it on the other side
    const a = GAP + (i / SEGMENTS) * (Math.PI * 2 - 2 * GAP);
    const fromFront = Math.min(a, Math.PI * 2 - a);
    base.set(w * round(Math.sin(a)), 0, zc + d * round(Math.cos(a)));
    base.y = neckAt(base.x, base.z);
    radial.set(base.x / (w * w), 0, (base.z - zc) / (d * d)).normalize();
    const tall = COLLAR_H * smoothstep(GAP, 0.85, fromFront);
    // stood up round the back, a little in to the neck; turned out at the front
    const fall = lerp(-0.12, COLLAR_FALL, smoothstep(1.5, 0.35, fromFront));
    for (let j = 0; j <= ROWS; j++) {
      const t = j / ROWS;
      const p = base.clone().addScaledVector(radial, tall * t * Math.sin(fall));
      p.y += tall * t * Math.cos(fall);
      positions.push(p.x, p.y, p.z);
      if (j === ROWS) top.push([p.x, p.y, p.z]);
      if (i && j) {
        const c = i * (ROWS + 1) + j;
        const b = c - (ROWS + 1);
        indices.push(b - 1, c - 1, c, b - 1, c, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return { geometry: g, top };
}

// How far forward the front of the jacket is at height y, x across (where
// the stitching doesn't pinch it).
function jacketFront(y, x = 0) {
  const [w, d, zc] = rowAt(JACKET_ROWS, y);
  const across = Math.pow(Math.min(1, Math.abs(x) / w), 1 / SQUARE);
  return zc + d * Math.pow(Math.sqrt(1 - across * across), SQUARE);
}
// ...and how far back its back is.
function jacketBack(y) {
  const [, d, zc] = rowAt(JACKET_ROWS, y);
  return d - zc;
}

export const ELLIOTT = {
  id: 'elliott',
  name: 'Elliott',
  size: SIZE,
  dress(body) {
    const skinMat = M(SKIN, 0.68);
    const shell = M(JACKET, 0.5, { vertexColors: true, ...textile('ripstop') });
    const lining = M(LINING, 0.6, { side: THREE.BackSide });
    const joggers = M(JOGGERS, 0.95, { vertexColors: true, ...textile('twill') });
    const rgb = (hex) => _d.set(hex).toArray([]);

    // ── Head and neck ──
    piece(body.neck, new THREE.CylinderGeometry(0.066, 0.072, 0.12, 16), skinMat, 0, 0.04);
    const { brow, crown } = childHead(body.head, skinMat, LOOK);

    // ── Shirt, at the neck ──
    const shirt = M(HENLEY_GREY, 0.92, textile('canvas'));
    piece(body.chest, tailored(HENLEY, { segments: 24, squareness: 0.92 }), shirt);
    piece(body.chest, tailored(RIB, { segments: 24 }), M(HENLEY_GREY, 0.95));
    // its placket: two lines of stitching, and a button at the foot of the V
    const seam = M(0xa8a094, 0.95);
    const shirtFront = (y) => {
      const [, d, z] = rowAt(HENLEY, y);
      return z + d + 0.0005;
    };
    for (const sx of [-1, 1]) cord(body.chest, seam, 0.0015, [0.41, 0.45, 0.49].map((y) => [sx * 0.016, y, shirtFront(y)]));
    const button = piece(body.chest, new THREE.CylinderGeometry(0.0075, 0.0075, 0.003, 10), M(BUTTON, 0.4), 0, 0.432, shirtFront(0.432) + 0.001);
    button.rotation.x = Math.PI / 2 + 0.5;

    // ── Jacket ──
    const coat = tailored(stitched(JACKET_ROWS, STITCH_FROM, CHANNEL, NECK_TOP), {
      segments: 48,
      squareness: SQUARE,
      // the channels, flat down the middle of the front where the zip is
      crease: (y, across, front) => {
        const placket = front > 0 ? smoothstep(0.05, 0.16, Math.abs(across)) : 1;
        return LOFT * (channel(y, STITCH_FROM, CHANNEL) - 1) * placket;
      },
      // darker along the stitching, and the elastic at the hem
      surface: (x, y) => {
        const tone = y < STITCH_FROM ? 0.72 : 0.8 + 0.2 * channel(y, STITCH_FROM, CHANNEL);
        return [tone, tone, tone];
      },
    });
    // fallen open at the neck
    {
      const p = coat.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y > V_FOOT) p.setY(i, V_FOOT + (y - V_FOOT) * (1 - open(p.getX(i), p.getZ(i))));
      }
      coat.computeVertexNormals();
    }
    piece(body.chest, coat, shell);
    // the inside, seen in the V (the outside casts the shadow)
    piece(body.chest, coat, lining).castShadow = false;
    const { geometry: band, top } = collar();
    piece(body.chest, band, M(JACKET, 0.5));
    piece(body.chest, band, lining).castShadow = false;
    cord(body.chest, M(JACKET, 0.55), 0.005, top); // its edge, rolled
    // the zip, done up to the foot of the V, its pull hanging there
    const zip = M(ZIP, 0.45);
    const zipAt = [];
    for (let y = -0.11; y < V_FOOT; y += 0.05) zipAt.push([0, y, jacketFront(y) + 0.003]);
    zipAt.push([0, V_FOOT, jacketFront(V_FOOT) + 0.003]);
    cord(body.chest, zip, 0.0035, zipAt);
    const pull = piece(body.chest, new THREE.BoxGeometry(0.012, 0.03, 0.004), M(0x23262a, 0.4), 0, V_FOOT - 0.018, jacketFront(V_FOOT - 0.018) + 0.009);
    pull.rotation.x = -0.12;
    // a small white badge on his chest, turned with its curve
    const bx = 0.09;
    const by = STITCH_FROM + 4.5 * CHANNEL;
    const badge = piece(body.chest, new THREE.BoxGeometry(0.034, 0.02, 0.002), M(BADGE, 0.6), bx, by, jacketFront(by, bx) + 0.001);
    badge.rotation.y = 0.5 * Math.asin(Math.min(1, bx / rowAt(JACKET_ROWS, by)[0]));

    // ── Arms ──
    for (const [A, side] of [[body.armL, 1], [body.armR, -1]]) {
      const cloth = sleeve(side, (x, y) => {
        const tone = y < SLEEVE_STITCH_FROM ? 0.7 : 0.8 + 0.2 * channel(y, SLEEVE_STITCH_FROM, SLEEVE_CHANNEL);
        return [tone, tone, tone];
      }, {
        rows: stitched(SLEEVE_ROWS, SLEEVE_STITCH_FROM, SLEEVE_CHANNEL, -0.02),
        // channels round the arm, dying out over the shoulder
        crease: (y) => SLEEVE_LOFT * (channel(y, SLEEVE_STITCH_FROM, SLEEVE_CHANNEL) - 1) * smoothstep(0.01, -0.05, y),
      });
      limb(A.shoulder, A.elbow, cloth, shell, 0.062, -0.035);
      // small, chubby hands
      const hand = handShape(side);
      hand.scale(1.12, 0.9, 1.1);
      piece(A.elbow, hand, skinMat, 0, -0.229);
    }

    // ── Legs ──
    const trainer = M(0xffffff, 0.65, { vertexColors: true });
    for (const L of [body.legL, body.legR]) {
      const cloth = trouserLeg(L.side, (x, y) => {
        const cuff = y < ROLL ? 0.84 : 1; // the roll, the other side of the cloth out
        return [cuff, cuff, cuff];
      }, 0.095, JOGGER_ROWS);
      limb(L.hip, L.knee, cloth, joggers, 0.087, -0.18);
      piece(L.ankle, new THREE.CylinderGeometry(0.041, 0.043, 0.075, 12), M(SOCK, 0.95), 0, 0.065, 0.002);
      // a pale sole with a dark tread; the charcoal upper with a grey toe
      // bumper and a red band round the collar
      piece(L.ankle, tailored(TRAINER_SOLE, { squareness: 0.75, segments: 20,
        surface: (x, y) => rgb(y < -0.066 ? TREAD : SOLE) }), trainer);
      piece(L.ankle, tailored(TRAINER_UPPER, { squareness: 0.8, segments: 24,
        surface: (x, y, front) => {
          if (y > 0.04) return rgb(BAND);
          if (front > 0.7 && y < -0.015) return rgb(TOE);
          return rgb(TRAINER);
        } }), trainer);
      // a strap across the top, edged in red
      cord(L.ankle, M(TRAINER, 0.75), 0.0055, [[-0.05, 0.006, 0.07], [0, 0.031, 0.073], [0.05, 0.006, 0.07]]);
      cord(L.ankle, M(BAND, 0.7), 0.002, [[-0.05, 0.012, 0.068], [0, 0.037, 0.071], [0.05, 0.012, 0.068]]);
    }

    // What's worn on his back sits on his jacket.
    const back = group(body.chest, 0, 0.258, -jacketBack(0.258) - 0.004);
    return { brow, crown, back };
  },
};
