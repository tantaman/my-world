// The hiker: an orange rain shell with the grey hood rolled at the collar,
// tan hiking trousers and brown boots, a black daypack with a hydration hose
// over the left shoulder, a brown snapback with a maroon flat brim, white
// sunglasses and a full dark beard (his head is ../head.js).
//
// Grown-up sized: the body's measurements (character.js) are his.

import * as THREE from 'three';
import { smoothstep } from '../../noise.js';
import { tailored, sleeve, trouserLeg, bootUpper, outsole, handShape, textile, foldAt, material as M, piece, cord, group, limb } from '../clothing.js';
import { buildHead } from '../head.js';

const BACK_OF_PACK = 0.182; // m from the middle of the daypack to the back of it

export const HIKER = {
  id: 'hiker',
  name: 'the hiker',
  size: 1,
  // Dressed onto the body's bones (see Character.dress).
  dress(body) {
    const skin = M(0xc68c6c, 0.7);
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
    const { brow, crown } = buildHead(body.head, skin);

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
