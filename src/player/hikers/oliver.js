// Oliver: five, nearly six. A dark green henley with three buttons at the
// neck, navy joggers gathered at the ankle over grey socks, royal blue
// trainers with white soles and a red-orange flash at the heel. Dark brown
// hair, faded short at the sides and longer and spiky on top, brown eyes,
// ears that stand out a little, and no hat.
//
// He is the grown-up body made smaller (SIZE), so everything here is in
// metres of the grown-up body, like the bones it hangs from; his head is
// bigger than that would make it, the way a child's is, and his face sits
// low on it. Everything on the head is placed from eye level, +z the way he
// looks.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { smoothstep, lerp } from '../../noise.js';
import { tailored, sleeve, trouserLeg, handShape, textile, foldAt, material as M, piece, cord, group, limb } from '../clothing.js';

// How tall he is beside the grown-up: about 1.16 m to 1.8.
const SIZE = 0.63;

// ── His head (grown-up metres, from eye level) ──────────────────────────────
// Half-sizes of the skull, and its middle: higher than the eyes and a little
// behind them, so the face is the lower part of a big round head.
const SKULL = new THREE.Vector3(0.117, 0.158, 0.137);
const SKULL_AT = new THREE.Vector3(0, 0.03, -0.012);
const CHIN_TAPER = 0.14; // the chin this much narrower than the cheeks
const JAW_FILL = 0.05; // how far the lower face comes forward of the skull
const EYE_X = 0.043; // eyes either side of the middle
const EYE = { w: 0.019, h: 0.0085, iris: 0.0086 }; // half-width and height of each, the iris's radius
const BROW_Y = 0.03; // eyebrows above the eyes
const NOSE_Y = -0.045;
const MOUTH_Y = -0.085;
// Hair: where it stops on the forehead and down the side, and how thick it
// is on top, where it is long, and on the faded sides.
const FRINGE_Y = 0.104;
const SIDE_Y = 0.02; // level with the tops of the ears
const NAPE_Y = -0.085;
const HAIR_TOP = 0.024;
const HAIR_SIDE = 0.0035;
const HAIR_TUCK = 0.005; // how far under the skin it goes where there's none
const TUFTS = 80; // spikes over the top and the front
// A strap round his head (a headlamp's) goes this high, over the forehead.
const BAND_Y = 0.07;

// ── Colours (as in the photograph) ──────────────────────────────────────────
const SKIN = 0xc4957a;
const LIPS = 0xb2705e;
const ROSY = 0xd8a08c; // a little colour in his cheeks
const HAIR = 0x1c130f;
const IRIS = 0x3b2214;
const SHIRT = 0x203c30;
const BUTTON = 0x3a5446;
const JOGGERS = 0x1b1f38;
const SOCK = 0x6e6e76;
const TRAINER = 0x2346b8;
const FLASH = 0xe2482c;
const SOLE_WHITE = 0xeeeeea;
const TREAD = 0x3a3a3e;
const LINING = 0x1a2040;

const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _v = new THREE.Vector3();
const _r = new THREE.Quaternion();
const _c = new THREE.Color();
const _d = new THREE.Color();

// The point on his skin in unit direction n (from SKULL_AT). Round all over,
// the cheeks full, the chin small, the face a little flatter than the skull.
function skin(n, out) {
  const ax = Math.abs(n.x);
  const chin = 1 - CHIN_TAPER * smoothstep(-0.25, -0.95, n.y);
  const front = smoothstep(0.35, 0.8, n.z);
  const cheek = Math.exp(-(((ax - 0.45) / 0.26) ** 2) - (((n.y + 0.42) / 0.2) ** 2));
  const chinTip = Math.exp(-((ax / 0.22) ** 2) - (((n.y + 0.86) / 0.12) ** 2));
  const socket = Math.exp(-(((ax - 0.37) / 0.12) ** 2) - (((n.y + 0.19) / 0.07) ** 2));
  out.set(n.x * SKULL.x * chin * (1 + 0.07 * cheek), n.y * SKULL.y, n.z * SKULL.z * (1 - 0.06 * front));
  out.z += front * (0.011 * cheek + 0.003 * chinTip - 0.004 * socket);
  // A skull's ellipsoid would take the chin far back under it: bring the
  // lower face forward, so the mouth and chin are under the nose.
  const lower = smoothstep(-0.12, -0.8, n.y) * (1 - smoothstep(-0.88, -1, n.y));
  out.z += JAW_FILL * lower * smoothstep(-0.3, 0.55, n.z) * (1 - 0.45 * smoothstep(0.25, 0.85, ax));
  return out.add(SKULL_AT);
}

// The outward normal of the skull at direction n (near enough for hair).
const skullNormal = (n, out) => out.set(n.x / SKULL.x, n.y / SKULL.y, n.z / SKULL.z).normalize();

// The direction from SKULL_AT to the front of the face at height y, x across.
function toward(x, y, out) {
  const ny = (y - SKULL_AT.y) / SKULL.y;
  const nx = x / SKULL.x;
  return out.set(nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))).normalize();
}

// How much hair at direction n: 0 bare, 1 full. Down to the fringe at the
// front, the tops of the ears at the side, the nape behind.
function hairAt(n) {
  _p.copy(n).multiply(SKULL).add(SKULL_AT); // where that is on the skull
  const back = smoothstep(0.2, -0.6, n.z);
  const side = 1 - smoothstep(0.3, 0.9, n.z);
  // the edge: the fringe in front, round the temples, down behind the ears
  const edge = lerp(lerp(FRINGE_Y, SIDE_Y, side), NAPE_Y, back) + 0.003 * Math.sin(70 * n.x) * (1 - side);
  return smoothstep(edge - 0.012, edge + 0.012, _p.y);
}

// Long and spiky on top, faded short at the sides.
const topness = (n) => smoothstep(0.35, 0.75, n.y) * (1 - 0.6 * smoothstep(0.2, -0.7, n.z));

// A unit sphere with its seam at the back. Skin and hair share one, vertex
// for vertex, so the hairline is clean.
const sphere = () => new THREE.SphereGeometry(1, 80, 56, -Math.PI / 2);

const hash3 = (x, y, z) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

function buildHead(head, skinMat) {
  const cast = (m) => {
    m.castShadow = true;
    return m;
  };
  const cSkin = new THREE.Color(SKIN);
  const cLips = new THREE.Color(LIPS);
  const cRosy = new THREE.Color(ROSY);
  const cHair = new THREE.Color(HAIR);

  // ── Skin ──
  const faceGeo = sphere();
  {
    const p = faceGeo.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      _n.fromBufferAttribute(p, i);
      skin(_n, _p);
      p.setXYZ(i, _p.x, _p.y, _p.z);
      // lips, a little colour in the cheeks, and the faded hair's shadow
      const lip = (_p.x / 0.02) ** 2 + ((_p.y - MOUTH_Y) / 0.0075) ** 2;
      const cheek = Math.exp(-(((Math.abs(_p.x) - 0.06) / 0.025) ** 2) - (((_p.y + 0.045) / 0.025) ** 2));
      _c.copy(cSkin).lerp(cRosy, 0.3 * cheek * smoothstep(0.5, 0.8, _n.z));
      _c.lerp(cLips, smoothstep(1, 0.4, lip) * smoothstep(0.75, 0.9, _n.z));
      _c.lerp(cHair, 0.35 * hairAt(_n));
      _c.toArray(col, i * 3);
    }
    faceGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    faceGeo.computeVertexNormals();
  }
  head.add(cast(new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68 }))));

  // ── Hair ──
  // A second skin grown over the first where there's hair, and tucked just
  // under it where there isn't; long on top, with a ragged surface, and
  // brushed forward into a short fringe.
  const hairGeo = sphere();
  {
    const p = hairGeo.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      _n.fromBufferAttribute(p, i);
      const m = hairAt(_n);
      const top = topness(_n);
      const grain = hash3(_n.x * 9, _n.y * 9, _n.z * 9);
      const t = lerp(HAIR_SIDE, HAIR_TOP, top) * (0.75 + 0.5 * grain);
      skin(_n, _p).addScaledVector(skullNormal(_n, _q), lerp(-HAIR_TUCK, t, m));
      // the fringe: brushed forward and a little down over the forehead
      const fringe = m * top * smoothstep(0.3, 0.75, _n.z);
      _p.z += 0.012 * fringe;
      _p.y -= 0.004 * fringe;
      p.setXYZ(i, _p.x, _p.y, _p.z);
      // faded at the sides: the skin shows through
      _c.copy(cHair).lerp(cSkin, 0.28 * (1 - top)).multiplyScalar(0.8 + 0.4 * grain);
      _c.toArray(col, i * 3);
    }
    hairGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    hairGeo.computeVertexNormals();
  }
  const hairMat = M(0xffffff, 0.9, { vertexColors: true });
  // (casting no shadow: tucked so close under the bare skin, it would darken
  // the face as if he had a beard)
  head.add(new THREE.Mesh(hairGeo, hairMat));

  // Spikes, over the top and swept forward at the front: little cones stood
  // on the hair, leaning the way it's brushed.
  {
    const tufts = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const up = new THREE.Vector3(0, 1, 0);
    for (let k = 0; k < TUFTS; k++) {
      // spread over the top, more of them towards the front
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 0.8;
      _n.set(Math.sin(a) * r * 0.85, 1, Math.cos(a) * r * 0.7 + 0.35).normalize();
      const top = topness(_n);
      if (top < 0.4) continue;
      skin(_n, _p).addScaledVector(skullNormal(_n, _q), HAIR_TOP * 0.7);
      const len = (0.012 + 0.012 * rnd()) * top;
      const cone = new THREE.ConeGeometry(0.0045 + 0.003 * rnd(), len, 4);
      cone.translate(0, len / 2, 0);
      // stood along the skull, leaning forward, more so at the front
      _q.copy(skullNormal(_n, _q)).add(_v.set((rnd() - 0.5) * 0.5, 0, 0.4 + 1.1 * Math.max(0, _n.z))).normalize();
      cone.applyQuaternion(_r.setFromUnitVectors(up, _q));
      cone.translate(_p.x, _p.y, _p.z);
      const shade = new Float32Array(cone.attributes.position.count * 3);
      _c.copy(cHair).multiplyScalar(0.85 + 0.35 * rnd());
      for (let i = 0; i < shade.length; i += 3) _c.toArray(shade, i);
      cone.setAttribute('color', new THREE.BufferAttribute(shade, 3));
      tufts.push(cone.toNonIndexed());
    }
    tufts.forEach((g) => g.deleteAttribute('uv'));
    head.add(cast(new THREE.Mesh(mergeGeometries(tufts), hairMat)));
  }

  // ── Eyes ──
  // Almond-shaped, the brown iris filling them top to bottom, a dark line of
  // lashes along the top, and thin straight brows over them.
  const white = M(0xece6e0, 0.35);
  const iris = M(IRIS, 0.25);
  const dark = M(0x1e1410, 0.8);
  const brows = M(HAIR, 0.9);
  for (const sx of [-1, 1]) {
    toward(sx * EYE_X, 0, _n);
    skin(_n, _p);
    const eye = new THREE.Group();
    eye.position.copy(_p);
    eye.position.z -= 0.004;
    eye.rotation.y = sx * 0.28; // the face turns away round the side
    head.add(eye);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), white);
    ball.scale.set(EYE.w, EYE.h, 0.008);
    eye.add(ball);
    const disc = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), iris);
    disc.scale.set(EYE.iris, EYE.iris, 0.004);
    disc.position.set(-sx * 0.002, 0, 0.0062);
    eye.add(disc);
    eye.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-EYE.w, -0.001, 0.003), new THREE.Vector3(0, EYE.h * 2.1, 0.009), new THREE.Vector3(EYE.w, 0.001, 0.003)), 8, 0.0017, 4), dark));
    // the brow, rising a little towards the temple
    const b0 = toward(sx * 0.018, BROW_Y, new THREE.Vector3());
    const b1 = toward(sx * 0.046, BROW_Y + 0.006, new THREE.Vector3());
    const b2 = toward(sx * 0.074, BROW_Y + 0.002, new THREE.Vector3());
    const path = [b0, b1, b2].map((d) => skin(d, new THREE.Vector3()).addScaledVector(d, 0.002));
    head.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 8, 0.0027, 4), brows));
  }

  // ── Nose, mouth and ears ──
  toward(0, NOSE_Y, _n);
  skin(_n, _p);
  const nose = cast(new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 8), skinMat));
  nose.scale.set(1.15, 0.85, 0.8);
  nose.position.copy(_p).addScaledVector(_n, -0.002);
  head.add(nose);
  {
    const a = skin(toward(-0.016, MOUTH_Y + 0.001, _n), new THREE.Vector3());
    const m = skin(toward(0, MOUTH_Y - 0.0015, _n), new THREE.Vector3());
    const b = skin(toward(0.016, MOUTH_Y + 0.001, _n), new THREE.Vector3());
    head.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, m, b]), 8, 0.0016, 4), M(0x7a4436, 0.6)));
  }
  for (const sx of [-1, 1]) {
    const ear = cast(new THREE.Mesh(new THREE.SphereGeometry(0.031, 10, 8), skinMat));
    ear.scale.set(0.32, 1, 0.66);
    ear.position.set(sx * (SKULL.x - 0.004), -0.008, -0.022);
    ear.rotation.y = sx * 0.42; // standing out from the head
    ear.rotation.z = -sx * 0.08;
    head.add(ear);
  }

  // Where a strap round his head goes: over the forehead, under the fringe,
  // in the head's own frame.
  const frame = group(head);
  toward(0, BAND_Y, _n);
  const brow = group(frame);
  skin(_n, brow.position);
  brow.rotation.x = -Math.atan2(_n.y / SKULL.y, _n.z / SKULL.z) * 0.9;
  const ny = (BAND_Y - SKULL_AT.y) / SKULL.y;
  const across = Math.sqrt(1 - ny * ny);
  const crown = { rx: SKULL.x * across + HAIR_SIDE + 0.002, rz: SKULL.z * across + 0.004, z: SKULL_AT.z, y: BAND_Y };
  return { brow, crown };
}

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

// His trainers, in the ankle's frame (+z ahead; the sole is 0.07 under it).
const MIDSOLE = [[-0.07, 0.058, 0.121, 0.046], [-0.064, 0.062, 0.123, 0.046],
  [-0.05, 0.062, 0.122, 0.046], [-0.042, 0.06, 0.119, 0.045]];
const UPPER = [[-0.046, 0.058, 0.117, 0.045], [-0.03, 0.058, 0.115, 0.044],
  [-0.012, 0.055, 0.106, 0.04], [0.006, 0.051, 0.084, 0.024],
  [0.026, 0.048, 0.062, 0.006], [0.042, 0.046, 0.052, -0.002], [0.05, 0.042, 0.046, -0.004]];

// Sleeves and legs are the grown-up's patterns, taken in: a child's arms and
// legs are slimmer for their length. Squeeze a garment's sections about the
// bone (x = z = 0) below `from` (m up the bone), by k.
function takeIn(geometry, k, from) {
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = lerp(1, k, smoothstep(from, from - 0.08, p.getY(i)));
    p.setX(i, p.getX(i) * t);
    p.setZ(i, p.getZ(i) * t);
  }
  geometry.computeVertexNormals();
  return geometry;
}

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
    const { brow, crown } = buildHead(body.head, skinMat);

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
      piece(L.ankle, tailored(MIDSOLE, { squareness: 0.75, segments: 20,
        surface: (x, y) => rgb(y < -0.066 ? TREAD : SOLE_WHITE) }), trainer);
      piece(L.ankle, tailored(UPPER, { squareness: 0.8, segments: 24,
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
