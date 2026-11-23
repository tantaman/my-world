// The hiker: an orange rain shell with the grey hood rolled at the collar,
// tan hiking trousers and brown boots, a black daypack with a hydration hose
// over the left shoulder, a brown snapback with a maroon flat brim, white
// sunglasses and a full dark beard.
//
// Grown-up sized: the body's measurements (character.js) are his.
//
// His head is drawn from a photo of the man himself on a snowfield: a lean,
// long face with a straight, prominent nose, a full dark beard kept short on
// the cheeks and fuller at the chin, short dark hair under a brown snapback
// with a flat maroon brim, and white square-framed sunglasses with dark
// lenses that catch the sky. ../head.js builds it to his look (LOOK, what
// each of it is, is at the top of head.js), from eye level, +z the way he
// looks, the size a real head is.

import * as THREE from 'three';
import { smoothstep } from '../../noise.js';
import { tailored, sleeve, trouserLeg, bootUpper, outsole, handShape, textile, foldAt, material as M, piece, cord, group, limb } from '../clothing.js';
import { buildHead, buildGlasses, buildCap, lensMaterial } from '../head.js';

const BACK_OF_PACK = 0.182; // m from the middle of the daypack to the back of it

// ── His head ────────────────────────────────────────────────────────────────
// The snapback: a high, boxy six-panel crown, worn level and a touch back,
// with a flat maroon brim (what each of these is, is at buildCap in head.js).
const SNAPBACK = {
  rx: 0.086, rz: 0.107, z: -0.008, // the band centred a touch behind the face, over the hair
  front: 0.104, back: 0.09,
  square: 4.5,
  y: 0.029, tilt: -0.08,
  colour: 0x6c5932, seam: 0x56452f,
  brim: { w: 0.094, l: 0.072, attach: 1.2, colour: 0x6e1f2c },
};
const HAIR_COLOR = new THREE.Color(0x37261a);
const BEARD_CHIN = 0.0155; // m, the longest of the beard

const LOOK = {
  // the cranium, the cheekbones and upper jaw, the jaw, the chin
  skull: [
    [[0, 0.024, -0.008], [0.0755, 0.097, 0.099]],
    [[0, -0.02, 0.013], [0.066, 0.056, 0.077]],
    [[0, -0.058, 0.004], [0.0555, 0.062, 0.083]],
    [[0, -0.097, 0.054], [0.029, 0.026, 0.032]],
  ],
  round: 0.016,
  eyeX: 0.032,
  brow: 0.024,
  // a long, strong nose and not a pinched one: straight down its back with
  // a hint of a hump, fuller and rounder toward the tip
  nose: {
    nasion: { y: 0.014, z: 0.0912 },
    slope: 0.62,
    hump: 0.0007,
    tip: { y: -0.0362, round: 0.006 },
    under: { z: 0.096, slope: 1.8 },
    bridgeRound: 0.0042,
    tipRound: 0.0078,
    steep: [1.45, 2.3],
    sideCurve: 30,
    ala: { x: 0.0115, y: -0.0412, rx: 0.0062, ry: 0.0056, lift: 0.0085 },
    nostril: 0.0066,
    base: -0.0498,
  },
  // smiling, the upper teeth showing
  mouth: { y: -0.0695, w: 0.0235, smile: 0.0035, parted: 0.0026, teeth: [0.75, 0.35] },
  relief: {
    socket: 0.0075,
    browRidge: 0.0035,
    cheekbones: [0.0042, 0.047, -0.021],
    cheeks: [0.0035, 0.035, -0.026],
    teeth: 0.0055,
    lips: [0.0022, 0.0024],
    lipW: [0.02, 0.018],
    chin: [0.0028, -0.1],
  },
  ear: { x: 0.0735, y: -0.006, z: -0.012, h: 0.031, w: 0.0168, flare: 0.36, lean: 0.2 },
  colour: {
    rosy: new THREE.Color(0xb8664f),
    lip: new THREE.Color(0x8e5a4d),
    brow: new THREE.Color(0xdcae90),
    root: new THREE.Color(0x3a281e), // skin seen through a thick beard
    nostril: new THREE.Color(0x24130e),
    socket: new THREE.Color(0x6b4a3c),
    teeth: new THREE.Color(0xcfc4b2),
    mouth: new THREE.Color(0x2a1410),
  },
  hair: {
    beard: { cheek: 0.008, jaw: 0.0145, chin: BEARD_CHIN, moustache: 0.0075, colour: new THREE.Color(0x3a2517), auburn: new THREE.Color(0x553420) },
    // short at the sides, under the cap
    scalp: {
      line: [0.075, 0.026, -0.07], from: [1.3, 1.45], band: { y: SNAPBACK.y, tilt: SNAPBACK.tilt },
      len: 0.0055, thin: 0.6, flow: new THREE.Vector3(0, -0.8, -0.6), colour: HAIR_COLOR,
    },
    brows: { inner: 0.009, span: 0.044, drop: 0.002, arch: 0.006, tail: 0.004, half: [0.0055, 0.0022], len: 0.0035, colour: HAIR_COLOR },
    deepest: BEARD_CHIN,
  },
};

// His sunglasses: thick white square frames, a gentle wrap; the lenses sit
// in them, set back a little, so the frame shows as a rim.
const GLASSES_Y = 0.002; // lens centres, a hair above eye level
const GLASSES_Z = 0.099; // the front of the frame at the bridge
const GLASSES_R = 0.1; // radius the front is bent round (m)
const TEMPLE_END = new THREE.Vector3(0.084, 0.022, -0.02); // the arm rests on the ear

// A rounded rectangle as a path: [x0, x1] by [y0, y1], corner radius r,
// with the bottom corner at x0 (by the nose) rounder still (rIn).
function roundRect(path, x0, y0, x1, y1, r, rIn) {
  return path.moveTo(x0 + r, y1)
    .lineTo(x1 - r, y1).quadraticCurveTo(x1, y1, x1, y1 - r)
    .lineTo(x1, y0 + r).quadraticCurveTo(x1, y0, x1 - r, y0)
    .lineTo(x0 + rIn, y0).quadraticCurveTo(x0, y0, x0, y0 + rIn)
    .lineTo(x0, y1 - r).quadraticCurveTo(x0, y1, x0 + r, y1);
}

// His face, beard, sunglasses and snapback, on the head bone. -> { brow,
// crown } (as Character.dress asks).
function hisHead(head, skin) {
  buildHead(head, skin, LOOK);

  // ── Sunglasses ──
  // One side is drawn (u along the face from the bridge, v up from the lens
  // centres) and the other is its mirror.
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
  const frame = new THREE.ExtrudeGeometry(outer, { depth: 0.0048, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 2, curveSegments: 8 });
  frame.translate(0, 0, -0.0048);
  const lens = new THREE.ShapeGeometry(roundRect(new THREE.Shape(), LX0 - 0.001, LY0 - 0.001, LX1 + 0.001, LY1 + 0.001, 0.007, 0.0115), 8);
  lens.translate(0, 0, -0.0022);
  buildGlasses(head, {
    y: GLASSES_Y, z: GLASSES_Z, r: GLASSES_R, frame, lens,
    hinge: [LX1 + 0.0055, LY1 - 0.003], temple: TEMPLE_END, arm: [0.0034, 0.0075],
    frameMat: M(0xf2f1ec, 0.28), lensMat: lensMaterial(),
  });

  // ── Snapback ──
  const { hat, at } = buildCap(head, SNAPBACK);
  const _p = new THREE.Vector3();
  const _q = new THREE.Vector3();
  // leather patch, flat on the front panel
  const ph = 0.42; // how far up the front panel, 0..1
  at(0, 1, ph, _p);
  at(0, 1, ph + 0.01, _q).sub(_p); // up the panel
  const patch = piece(hat, new THREE.BoxGeometry(0.044, 0.028, 0.003), M(0xa8784f, 0.8));
  patch.rotation.x = -Math.atan2(-_q.z, _q.y);
  patch.position.copy(_p);
  patch.translateZ(0.0012);
  // a small white woven label low on the right front panel
  {
    const la = -0.62; // radians round the band from the front (the wearer's right)
    at(Math.sin(la), Math.cos(la), 0.2, _p);
    const label = piece(hat, new THREE.BoxGeometry(0.016, 0.009, 0.0015), M(0xe9e6dc, 0.7));
    label.position.copy(_p);
    label.rotation.y = la;
    label.translateZ(0.0009);
  }

  // Where something strapped round the cap sits (a headlamp): the middle of
  // the front panel, facing out of it, a little above the patch.
  const brow = new THREE.Group();
  at(0, 1, ph + 0.22, brow.position);
  brow.rotation.x = patch.rotation.x;
  hat.add(brow);
  return { brow, crown: { rx: SNAPBACK.rx, rz: SNAPBACK.rz, z: SNAPBACK.z, y: at(1, 0, ph + 0.22, new THREE.Vector3()).y } };
}

export const HIKER = {
  id: 'hiker',
  name: 'the hiker',
  size: 1,
  // Dressed onto the body's bones (see Character.dress).
  dress(body) {
    const skin = M(0xc8957a, 0.7); // fair, sun-browned
    const shell = M(0xc85a26, 0.63, { vertexColors: true, ...textile('ripstop') });
    const trim = M(0x793c24, 0.72);
    const hood = M(0x787b74, 0.84, textile('ripstop'));
    const pants = M(0xa98b60, 0.96, { vertexColors: true, ...textile('twill') });
    const boot = M(0x654633, 0.69);
    const sole = M(0x302e2a, 0.94);
    const pack = M(0x424844, 0.88, textile('canvas'));
    const webbing = M(0x313530, 0.97, textile('canvas'));
    const binding = M(0x505650, 0.76);
    const hose = M(0x66888d, 0.36);

    const jacket = tailored([
      [-0.065, 0.188, 0.141, -0.005], [-0.052, 0.202, 0.152, -0.005, 0.006],
      [-0.034, 0.209, 0.156, -0.004, 0.01], [0.018, 0.20, 0.15, 0, 0.023],
      [0.043, 0.184, 0.14, 0, 0.025], [0.065, 0.19, 0.147, 0, 0.023],
      [0.13, 0.173, 0.138, 0, -0.018], [0.18, 0.181, 0.141, 0, -0.018],
      [0.25, 0.189, 0.144], [0.34, 0.207, 0.151, 0.003],
      [0.395, 0.221, 0.144], [0.43, 0.221, 0.132], [0.46, 0.183, 0.117],
      [0.487, 0.126, 0.10], [0.502, 0.09, 0.083],
    ], { segments: 48, squareness: 0.88,
      crease: (y, across, front) => {
        const ax = Math.abs(across);
        const pocket = 0.008 * foldAt(y - 0.12 - 0.075 * across, 0.019);
        const shoulder = 0.006 * foldAt(y - 0.41 + 0.12 * ax, 0.013);
        const gather = 0.006 * foldAt(y - 0.056 + 0.045 * across, 0.012);
        const strap = Math.exp(-(((ax - 0.63) / 0.11) ** 2)) * smoothstep(0.16, 0.30, y);
        return pocket + gather + shoulder - Math.max(front, 0) * strap * 0.012;
      },
      surface: (x, y, front) => {
        const panel = Math.abs(x) > 0.15 && y < 0.39 ? 0.79 : 1;
        const tone = y < -0.035 ? 0.75 : panel;
        return [tone, tone * (front < -0.5 ? 0.95 : 1), tone];
      },
    });
    piece(body.chest, jacket, shell);
    const collar = tailored([[0.464, 0.112, 0.105], [0.502, 0.103, 0.094],
      [0.535, 0.094, 0.085], [0.548, 0.085, 0.078]]);
    piece(body.chest, collar, M(0xb44a20, 0.56));
    cord(body.chest, trim, 0.004, [[0, -0.05, 0.149], [0, 0.04, 0.147],
      [0, 0.13, 0.14], [0, 0.255, 0.146], [0, 0.34, 0.156],
      [0, 0.43, 0.134], [0, 0.49, 0.103], [0, 0.545, 0.081]]);
    for (const side of [-1, 1]) {
      cord(body.chest, trim, 0.0035, [[side * 0.126, 0, 0.124],
        [side * 0.14, 0.075, 0.10], [side * 0.149, 0.143, 0.079]]);
    }
    piece(body.chest, tailored([[0.38, 0.035, 0.026, -0.138],
      [0.403, 0.084, 0.043, -0.141], [0.448, 0.128, 0.054, -0.131, 0.01],
      [0.463, 0.125, 0.047, -0.128, 0.012], [0.486, 0.142, 0.061, -0.111, 0.007],
      [0.515, 0.131, 0.063, -0.09], [0.532, 0.095, 0.047, -0.09]], { crease: (y, x, front) =>
        0.009 * foldAt(y - 0.456 - 0.023 * x, 0.01) +
        0.007 * foldAt(y - 0.485 + 0.016 * front, 0.009) }), hood);

    // The back panel rests against the shell. The loaded pack is deepest
    // near its base, with a separately bound shovel pocket on its outer face.
    const bp = group(body.chest, 0, 0.258, -0.158);
    const back = group(bp, 0, 0, -BACK_OF_PACK);
    piece(bp, tailored([[-0.224, 0.099, 0.055, -0.037], [-0.207, 0.145, 0.083, -0.045],
      [-0.159, 0.159, 0.096, -0.054], [-0.065, 0.162, 0.104, -0.055],
      [0.035, 0.15, 0.095, -0.047], [0.143, 0.138, 0.081, -0.034],
      [0.196, 0.105, 0.058, -0.025], [0.209, 0.062, 0.034, -0.025]],
    { squareness: 0.76 }), pack);
    piece(bp, tailored([[-0.195, 0.096, 0.024, -0.127], [-0.162, 0.134, 0.032, -0.137],
      [-0.07, 0.139, 0.036, -0.146], [0.004, 0.117, 0.031, -0.134],
      [0.04, 0.088, 0.021, -0.132]], { squareness: 0.78 }), webbing);
    cord(bp, binding, 0.004, [[-0.124, -0.039, -0.159], [-0.09, 0.019, -0.153],
      [0, 0.04, -0.153], [0.09, 0.019, -0.153], [0.124, -0.039, -0.159]]);
    cord(bp, trim, 0.005, [[0.089, 0.018, -0.157], [0.097, -0.016, -0.167], [0.091, -0.032, -0.173]]);
    cord(bp, webbing, 0.009, [[-0.046, 0.186, -0.024], [-0.026, 0.234, -0.023],
      [0.023, 0.235, -0.023], [0.047, 0.186, -0.024]]);
    // Daisy chains stitched to the pocket, with a reflective bar tack at
    // each end. Two side compression straps draw the shell down over its load.
    const stitch = M(0x8c9185, 0.78);
    for (const side of [-1, 1]) {
      const pocketWeb = cord(bp, binding, 0.0075, [[side * 0.072, -0.154, -0.167],
        [side * 0.081, -0.123, -0.173], [side * 0.086, -0.085, -0.176],
        [side * 0.089, -0.046, -0.171]]);
      for (const t of [0.1, 0.49, 0.89]) {
        const at = pocketWeb.geometry.parameters.path.getPointAt(t);
        piece(bp, new THREE.BoxGeometry(0.015, 0.003, 0.004), stitch, at.x, at.y, at.z - 0.007);
      }
      cord(bp, webbing, 0.009, [[side * 0.116, 0.134, -0.098],
        [side * 0.14, 0.083, -0.082], [side * 0.15, 0.058, -0.039],
        [side * 0.146, 0.075, -0.009]]);
      cord(bp, binding, 0.0035, [[side * 0.143, -0.143, -0.102],
        [side * 0.148, -0.011, -0.095], [side * 0.135, 0.101, -0.085],
        [side * 0.101, 0.165, -0.089], [side * 0.042, 0.184, -0.092], [0, 0.187, -0.088]]);
    }
    for (const side of [-1, 1]) {
      // Sweep a flattened strap over the shoulder and back to the hip belt.
      const strap = cord(body.chest, webbing, 0.011, [[side * 0.098, 0.40, -0.17],
        [side * 0.112, 0.466, -0.089], [side * 0.127, 0.492, -0.008],
        [side * 0.133, 0.461, 0.091], [side * 0.135, 0.37, 0.117],
        [side * 0.124, 0.242, 0.12], [side * 0.164, 0.15, 0.078],
        [side * 0.179, 0.09, -0.012], [side * 0.145, 0.07, -0.159]]);
      // Widen just the cross section, keeping its centre on the path.
      const vertices = strap.geometry.attributes.position;
      const path = strap.geometry.parameters.path;
      for (let ring = 0; ring <= strap.geometry.parameters.tubularSegments; ring++) {
        const centre = path.getPointAt(ring / strap.geometry.parameters.tubularSegments);
        for (let k = 0; k <= 6; k++) {
          const i = ring * 7 + k;
          vertices.setX(i, centre.x + (vertices.getX(i) - centre.x) * 2.3);
        }
      }
      strap.geometry.computeVertexNormals();
    }
    cord(body.chest, hose, 0.006, [[0.087, 0.433, -0.15], [0.117, 0.49, -0.071],
      [0.129, 0.506, -0.002], [0.141, 0.467, 0.10], [0.141, 0.388, 0.132],
      [0.128, 0.305, 0.141]]);
    piece(body.neck, new THREE.CylinderGeometry(0.054, 0.064, 0.13, 16), skin, 0, 0.055);
    // what is worn on the head goes on the cap (Character.addWorn)
    const { brow, crown } = hisHead(body.head, skin);

    // Only the cloth bridges the moving joints, with a short blend through
    // the elbow or kneecap.
    for (const [A, side] of [[body.armL, 1], [body.armR, -1]]) {
      limb(A.shoulder, A.elbow, sleeve(side, (x, y, front) => {
        const tone = y < -0.49 ? 0.44 : front < -0.5 && y < -0.23 && y > -0.40 ? 0.80 : 1;
        return [tone, tone, tone];
      }), shell, 0.062, -0.035);
      piece(A.elbow, handShape(side), skin, 0, -0.229);
    }
    for (const L of [body.legL, body.legR]) {
      limb(L.hip, L.knee, trouserLeg(L.side, (x, y, front) => {
        const kneePanel = y >= -0.48 && y <= -0.31 && front > 0.15;
        const tone = kneePanel ? 0.72 : y < -0.78 ? 0.64 : 1;
        return [tone, tone, tone];
      }), pants, 0.087, -0.18);
      piece(L.ankle, bootUpper(), boot);
      piece(L.ankle, outsole(), sole);
      cord(L.ankle, sole, 0.003, [[-0.033, -0.006, 0.112], [0.032, 0.008, 0.094],
        [-0.031, 0.023, 0.082], [0.029, 0.038, 0.067], [-0.029, 0.05, 0.059]]);
    }
    return { brow, crown, back };
  },
};
