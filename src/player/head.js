// The hiker's head: a face with a full dark beard, white wraparound
// sunglasses and a brown snapback with a maroon flat brim and a leather patch.
//
// Everything is placed from the centre of the head (the group handed in),
// with +z the way the face looks and +y up. The face is an ellipsoid. The
// beard is a second skin grown over it, standing off the face where there is
// beard and dipping just under it where there isn't, so its edge is a clean
// line rather than a painted smudge. The glasses are flat outlines bent round
// a cylinder, so they wrap the face the way sport glasses do.

import * as THREE from 'three';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { smoothstep, lerp } from '../noise.js';

const TAU = Math.PI * 2;

// ── Measurements (metres, from the centre of the head) ──────────────────────
// Half-sizes of the face ellipsoid: width, height, depth. The eyes are at
// about the middle of a head, so y = 0 is eye level.
const FACE = new THREE.Vector3(0.11, 0.126, 0.114);
const JAW_TAPER = 0.08; // the jaw this much narrower than the brow

// The beard, in directions from the centre (unit vector components):
// its upper edge runs from the sideburns, level with the top of the ear,
// down across the cheek to just under the nose.
const BEARD_SIDEBURN = 0.13; // edge height at the side of the face
const BEARD_UNDER_NOSE = -0.26; // edge height at the front
const MOUTH_Y = -0.5; // the lower lip, bare of beard under the moustache
const BEARD_THICK = 0.007; // how far it stands off the cheeks
const BEARD_JAW = 0.007; // fuller along the jaw
const MOUSTACHE = 0.006; // extra over the upper lip
const BEARD_HANG = 0.022; // how far it hangs below and ahead of the chin
const BEARD_DIP = 0.006; // how far under the skin it tucks where there's none

// Sunglasses
const GLASSES_Y = 0.008; // lens centres, a hair above eye level
const GLASSES_R = 0.123; // radius they're bent round, so they sit ~1 cm off the face
const TEMPLE_END = new THREE.Vector3(0.119, GLASSES_Y + 0.014, -0.045); // arm tucks behind the ear

// Snapback: a high, boxy six-panel crown, worn level and a little back.
const CROWN_RX = 0.12; // half-width at the band
const CROWN_RZ = 0.13; // half-depth at the band
const CROWN_Z = -0.008; // band centred a touch behind the face, over the hair
const CROWN_H_FRONT = 0.118; // crown height over the band at the front panel
const CROWN_H_BACK = 0.098;
const CROWN_SQUARE = 2.7; // 2 is a dome; more is boxier
const HAT_Y = 0.03; // the band, above eye level
const HAT_TILT = -0.12; // radians; negative tips the brim up
const BRIM_W = 0.098; // half-width
const BRIM_L = 0.09; // how far it reaches past the front of the crown

const M = (hex, rough = 0.85, extra) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0, ...extra });

const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _c = new THREE.Color();

// The point on the face in unit direction n.
function facePoint(n, out) {
  const jaw = 1 - JAW_TAPER * smoothstep(0, -0.9, n.y);
  return out.set(n.x * FACE.x * jaw, n.y * FACE.y, n.z * FACE.z);
}

// The face's outward normal at direction n (near enough: the taper is gentle).
function faceNormal(n, out) {
  return out.set(n.x / FACE.x, n.y / FACE.y, n.z / FACE.z).normalize();
}

// How much beard grows at direction n: 0 bare, 1 full. Below the line from
// sideburn to nose, not back past the ear (but further back under the jaw),
// and not over the lips.
function beardAt(n) {
  const line = lerp(BEARD_SIDEBURN, BEARD_UNDER_NOSE, smoothstep(0, 0.9, n.z));
  let m = smoothstep(line + 0.09, line - 0.09, n.y);
  m *= smoothstep(-0.12, 0.12, n.z - 0.6 * Math.min(0, n.y + 0.2));
  const lip = (n.x / 0.2) ** 2 + ((n.y - MOUTH_Y) / 0.04) ** 2;
  m *= 1 - smoothstep(1, 0.6, lip) * smoothstep(0.6, 0.8, n.z);
  return m;
}

// A unit sphere with its seam at the back of the head, where nothing shows.
// Face and beard share one, vertex for vertex, so where the beard crosses
// the skin the edge runs clean through each triangle.
const sphere = () => new THREE.SphereGeometry(1, 48, 36, -Math.PI / 2);

// A little hash in 0..1 from a position, so the beard's tone varies without
// a seam where the sphere's vertices are doubled.
const hash3 = (x, y, z) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

// Bend a flat piece round the head: x runs along the face, z is outward, and
// the piece is wrapped round a vertical cylinder of radius r.
function wrapRound(geo, r) {
  const p = geo.attributes.position;
  const nrm = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const a = p.getX(i) / r;
    const d = r + p.getZ(i);
    const s = Math.sin(a);
    const c = Math.cos(a);
    p.setXYZ(i, s * d, p.getY(i), c * d);
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

export function buildHead(head, skin) {
  const cast = (m) => {
    m.castShadow = true;
    return m;
  };
  const skinHex = skin.color.getHex();
  const BEARD = 0x33251c;
  const cSkin = new THREE.Color(skinHex);
  const cLip = new THREE.Color(0x8a4a3e);
  const cStubble = cSkin.clone().lerp(new THREE.Color(BEARD), 0.55);
  const cBeard = new THREE.Color(BEARD);

  // ── Face ──
  // Skin, the lips, and a dark stubble fringe just outside the beard's edge.
  const faceGeo = sphere();
  {
    const p = faceGeo.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      _n.fromBufferAttribute(p, i);
      facePoint(_n, _p);
      p.setXYZ(i, _p.x, _p.y, _p.z);
      const lip = (_n.x / 0.18) ** 2 + ((_n.y - MOUTH_Y) / 0.035) ** 2;
      _c.copy(cSkin).lerp(cStubble, smoothstep(0.12, 0.42, beardAt(_n)));
      _c.lerp(cLip, smoothstep(1, 0.5, lip) * smoothstep(0.7, 0.85, _n.z));
      _c.toArray(col, i * 3);
    }
    faceGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    faceGeo.computeVertexNormals();
  }
  head.add(cast(new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }))));

  // ── Beard ──
  const beardGeo = sphere();
  {
    const p = beardGeo.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      _n.fromBufferAttribute(p, i);
      const m = beardAt(_n);
      let t = BEARD_THICK + BEARD_JAW * smoothstep(-0.2, -0.8, _n.y);
      t += MOUSTACHE * Math.exp(-((_n.x / 0.3) ** 2) - ((_n.y + 0.33) / 0.09) ** 2) * smoothstep(0.7, 0.9, _n.z);
      facePoint(_n, _p).addScaledVector(faceNormal(_n, _q), lerp(-BEARD_DIP, t, m));
      // the chin hangs down and forward
      const hang = BEARD_HANG * m * smoothstep(-0.45, -0.95, _n.y) * smoothstep(-0.3, 0.6, _n.z);
      _p.y -= hang * 0.6;
      _p.z += hang * 0.8;
      p.setXYZ(i, _p.x, _p.y, _p.z);
      _c.copy(cBeard).multiplyScalar(0.88 + 0.24 * hash3(_n.x * 9, _n.y * 9, _n.z * 9));
      _c.toArray(col, i * 3);
    }
    beardGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    beardGeo.computeVertexNormals();
  }
  head.add(cast(new THREE.Mesh(beardGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }))));

  // ── Nose and ears ──
  const nose = cast(new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 8), skin));
  nose.scale.set(0.8, 1.15, 1);
  nose.position.set(0, -0.012, 0.107);
  nose.rotation.x = -0.25;
  head.add(nose);
  for (const sx of [-1, 1]) {
    const ear = cast(new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), skin));
    ear.scale.set(0.45, 1, 0.75);
    ear.position.set(sx * 0.106, -0.008, -0.012);
    head.add(ear);
  }
  // hair: just what shows below the hat at the back and sides
  const hair = cast(new THREE.Mesh(new THREE.SphereGeometry(0.123, 14, 10), M(0x221913, 0.95)));
  hair.scale.set(0.95, 0.92, 0.96);
  hair.position.set(0, 0.01, -0.02);
  head.add(hair);

  // ── Sunglasses ──
  // One side is drawn (u along the face from the bridge, v up from the lens
  // centres) and the other is its mirror. The white frame runs as a brow bar
  // over both lenses and on round the temples; the lenses sit just proud of
  // it, so the frame shows as a rim.
  const frameMat = M(0xf1f0ec, 0.3);
  const lensMat = M(0x14181d, 0.12, { metalness: 0.4 });
  const frameShape = new THREE.Shape()
    .moveTo(0, 0.025)
    .lineTo(0.07, 0.025)
    .lineTo(0.135, 0.02)
    .lineTo(0.135, 0.01)
    .lineTo(0.08, 0.006)
    .quadraticCurveTo(0.078, -0.019, 0.05, -0.022)
    .quadraticCurveTo(0.022, -0.025, 0.012, -0.01)
    .quadraticCurveTo(0.006, 0.004, 0, 0.007)
    .lineTo(0, 0.025);
  const lensShape = new THREE.Shape()
    .moveTo(0.011, 0.016)
    .lineTo(0.066, 0.017)
    .quadraticCurveTo(0.074, 0.016, 0.073, 0.004)
    .quadraticCurveTo(0.071, -0.015, 0.049, -0.017)
    .quadraticCurveTo(0.026, -0.02, 0.016, -0.008)
    .quadraticCurveTo(0.01, 0.002, 0.011, 0.016);
  const frameFlat = new THREE.ExtrudeGeometry(frameShape, { depth: 0.004, bevelEnabled: false, curveSegments: 6 });
  frameFlat.translate(0, 0, -0.002);
  const frameGeo = wrapRound(fine(frameFlat), GLASSES_R);
  const lensFlat = new THREE.ShapeGeometry(lensShape, 6);
  lensFlat.translate(0, 0, 0.0028);
  const lensGeo = wrapRound(fine(lensFlat), GLASSES_R);
  const glasses = new THREE.Group();
  glasses.position.y = GLASSES_Y;
  head.add(glasses);
  // where the frame ends at the temple, for the arm to carry on from
  const a = 0.13 / GLASSES_R;
  _p.set(Math.sin(a) * GLASSES_R, 0.015, Math.cos(a) * GLASSES_R);
  for (const sx of [-1, 1]) {
    const side = new THREE.Group();
    side.scale.x = sx;
    side.add(cast(new THREE.Mesh(frameGeo, frameMat)));
    side.add(new THREE.Mesh(lensGeo, lensMat));
    // the arm, straight back over the ear
    _q.copy(TEMPLE_END);
    _q.y -= GLASSES_Y;
    const len = _p.distanceTo(_q);
    const arm = cast(new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.008, len), frameMat));
    arm.position.copy(_p).add(_q).multiplyScalar(0.5);
    arm.lookAt(_q);
    side.add(arm);
    glasses.add(side);
  }

  // ── Snapback ──
  const crownMat = M(0x6c5932, 0.95, { side: THREE.DoubleSide });
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
  const crownGeo = new THREE.SphereGeometry(1, 28, 10, -Math.PI / 2, TAU, 0, Math.PI / 2);
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
  // flat brim, the back half tucked inside the crown
  const brim = cast(new THREE.Mesh(new THREE.CylinderGeometry(BRIM_W, BRIM_W, 0.008, 28), M(0x7a2233, 0.9)));
  brim.scale.z = (BRIM_L + 0.012) / BRIM_W;
  brim.position.set(0, 0.002, CROWN_Z + CROWN_RZ - 0.012);
  hat.add(brim);
  // leather patch, flat on the front panel
  const ph = 0.42; // how far up the front panel, 0..1
  crownAt(0, 1, ph, _p);
  crownAt(0, 1, ph + 0.01, _q).sub(_p); // up the panel
  const patch = cast(new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.036, 0.004), M(0xb98863, 0.8)));
  patch.rotation.x = -Math.atan2(-_q.z, _q.y);
  patch.position.copy(_p);
  patch.translateZ(0.0015);
  hat.add(patch);
  // the button on top
  const button = cast(new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 4), crownMat));
  button.scale.y = 0.5;
  crownAt(0, 0, 1, button.position);
  hat.add(button);
}
