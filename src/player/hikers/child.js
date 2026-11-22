// What the children have in common: a head built round its eyes, bigger for
// the body than a grown-up's the way a child's is, with the face low on it;
// the grown-up's patterns taken in to fit a child's arms and legs; and a
// pair of trainers.
//
// Who each child is (oliver.js, elliott.js) is a `look` handed to childHead:
// how big the skull is and where its middle is, where the face sits on it,
// where the hair stops and how it lies, and their colours. Everything is in
// metres of the grown-up body, like the bones it hangs from (the whole figure
// is made smaller afterwards), and on the head it is placed from eye level,
// +z the way they look.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { smoothstep, lerp } from '../../noise.js';
import { material as M, group } from '../clothing.js';

// A look:
//   skull    half-sizes of the skull (a Vector3)
//   at       ...and its middle: higher than the eyes and a little behind them
//   chin     the chin this much narrower than the cheeks
//   jaw      how far the lower face comes forward of the skull
//   cheeks   { wide, forward }: how much fuller the cheeks are, out and forward
//   eyes     { x, w, h, iris }: either side of the middle; the half-width and
//            height of each; the iris's radius
//   brow, nose, mouth   heights of the eyebrows, the nose and the mouth
//   noseSize the nose's radius
//   hair     { fringe, side, nape, top, sides, long, tuck, ragged, forward,
//            down, fade }: where it stops on the forehead, down the side and
//            behind; how thick it is on top and at the sides, and where the
//            long hair on top starts and is full ([from, to], as how far
//            towards straight up); how far under the skin it goes where
//            there's none; how uneven the fringe's edge is; how far the
//            fringe is brushed forward and down; and how much the skin shows
//            through at the sides
//   tufts    { count, seed, length: [least, more], width: [least, more],
//            lean: [on top, more at the front], flat }: locks stood on the
//            hair, leaning the way it's brushed (a little lean stands them up
//            into spikes, a lot lays them down), flattened by `flat` if given
//   wisps    { count, seed, length } (or none): strands sticking up at the crown
//   fringeLocks  { count, seed, across, from, length, width } (or none):
//            locks hanging down the forehead from under the hair, `across`
//            either side of the middle, their roots `from` above where it stops
//   ears     { size, y, z, out }: their half-height, where they are, and how
//            far they stand out (radians)
//   band     a strap round the head (a headlamp's) goes this high
//   colour   { skin, lips, rosy, hair, iris }

const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _v = new THREE.Vector3();
const _r = new THREE.Quaternion();
const _c = new THREE.Color();

// A unit sphere with its seam at the back. Skin and hair share one, vertex
// for vertex, so the hairline is clean.
const sphere = () => new THREE.SphereGeometry(1, 80, 56, -Math.PI / 2);

const hash3 = (x, y, z) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

// The shape of a head with this look: its skin, and where the hair is.
function shape(L) {
  const S = L.skull;
  const H = L.hair;
  return {
    // The point on the skin in unit direction n (from L.at). Round all over,
    // the cheeks full, the chin small, the face a little flatter than the skull.
    skin(n, out) {
      const ax = Math.abs(n.x);
      const chin = 1 - L.chin * smoothstep(-0.25, -0.95, n.y);
      const front = smoothstep(0.35, 0.8, n.z);
      const cheek = Math.exp(-(((ax - 0.45) / 0.26) ** 2) - (((n.y + 0.42) / 0.2) ** 2));
      const chinTip = Math.exp(-((ax / 0.22) ** 2) - (((n.y + 0.86) / 0.12) ** 2));
      const socket = Math.exp(-(((ax - 0.37) / 0.12) ** 2) - (((n.y + 0.19) / 0.07) ** 2));
      out.set(n.x * S.x * chin * (1 + L.cheeks.wide * cheek), n.y * S.y, n.z * S.z * (1 - 0.06 * front));
      out.z += front * (L.cheeks.forward * cheek + 0.003 * chinTip - 0.004 * socket);
      // A skull's ellipsoid would take the chin far back under it: bring the
      // lower face forward, so the mouth and chin are under the nose.
      const lower = smoothstep(-0.12, -0.8, n.y) * (1 - smoothstep(-0.88, -1, n.y));
      out.z += L.jaw * lower * smoothstep(-0.3, 0.55, n.z) * (1 - 0.45 * smoothstep(0.25, 0.85, ax));
      return out.add(L.at);
    },
    // The outward normal of the skull at direction n (near enough for hair).
    normal: (n, out) => out.set(n.x / S.x, n.y / S.y, n.z / S.z).normalize(),
    // The direction from L.at to the front of the face at height y, x across.
    toward(x, y, out) {
      const ny = (y - L.at.y) / S.y;
      const nx = x / S.x;
      return out.set(nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))).normalize();
    },
    // How much hair at direction n: 0 bare, 1 full. Down to the fringe at the
    // front, the tops of the ears at the side, the nape behind.
    hairAt(n) {
      _p.copy(n).multiply(S).add(L.at); // where that is on the skull
      const back = smoothstep(0.2, -0.6, n.z);
      const side = 1 - smoothstep(0.3, 0.9, n.z);
      // the edge: the fringe in front, round the temples, down behind the ears
      const edge = lerp(lerp(H.fringe, H.side, side), H.nape, back) + H.ragged * Math.sin(70 * n.x) * (1 - side);
      return smoothstep(edge - 0.012, edge + 0.012, _p.y);
    },
    // Long on top, short at the sides.
    topness: (n) => smoothstep(H.long[0], H.long[1], n.y) * (1 - 0.6 * smoothstep(0.2, -0.7, n.z)),
  };
}

// Puts a child's head with this look on the head bone, and says where
// something worn on it goes: { brow, crown } (as Character.dress asks).
export function childHead(head, skinMat, L) {
  const { skin, normal, toward, hairAt, topness } = shape(L);
  const S = L.skull;
  const H = L.hair;
  const cast = (m) => {
    m.castShadow = true;
    return m;
  };
  const cSkin = new THREE.Color(L.colour.skin);
  const cLips = new THREE.Color(L.colour.lips);
  const cRosy = new THREE.Color(L.colour.rosy);
  const cHair = new THREE.Color(L.colour.hair);

  // ── Skin ──
  const faceGeo = sphere();
  {
    const p = faceGeo.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      _n.fromBufferAttribute(p, i);
      skin(_n, _p);
      p.setXYZ(i, _p.x, _p.y, _p.z);
      // lips, a little colour in the cheeks, and the short hair's shadow
      const lip = (_p.x / 0.02) ** 2 + ((_p.y - L.mouth) / 0.0075) ** 2;
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
  // brushed forward into a fringe.
  const hairGeo = sphere();
  {
    const p = hairGeo.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      _n.fromBufferAttribute(p, i);
      const m = hairAt(_n);
      const top = topness(_n);
      const grain = hash3(_n.x * 9, _n.y * 9, _n.z * 9);
      const t = lerp(H.sides, H.top, top) * (0.75 + 0.5 * grain);
      skin(_n, _p).addScaledVector(normal(_n, _q), lerp(-H.tuck, t, m));
      // the fringe: brushed forward and down over the forehead
      const fringe = m * top * smoothstep(0.3, 0.75, _n.z);
      _p.z += H.forward * fringe;
      _p.y -= H.down * fringe;
      p.setXYZ(i, _p.x, _p.y, _p.z);
      // short at the sides: the skin shows through
      _c.copy(cHair).lerp(cSkin, H.fade * (1 - top)).multiplyScalar(0.8 + 0.4 * grain);
      _c.toArray(col, i * 3);
    }
    hairGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    hairGeo.computeVertexNormals();
  }
  const hairMat = M(0xffffff, 0.9, { vertexColors: true });
  // (casting no shadow: tucked so close under the bare skin, it would darken
  // the face as if they had a beard)
  head.add(new THREE.Mesh(hairGeo, hairMat));

  // Locks over the top and swept forward at the front: little cones stood on
  // the hair, leaning the way it's brushed; and, for whoever has them, a few
  // strands sticking up at the crown and a fringe of locks down the forehead.
  {
    const T = L.tufts;
    const locks = [];
    let seed = T.seed;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const up = new THREE.Vector3(0, 1, 0);
    // a lock `len` long, `width` at the root, pointing `toward` from _p; `flat`
    // flattens it in one direction across it, the way hair lies in a fringe
    const lock = (len, width, toward, flat = 1) => {
      const cone = new THREE.ConeGeometry(width, len, 4);
      cone.translate(0, len / 2, 0);
      if (flat !== 1) cone.scale(1, 1, flat);
      cone.applyQuaternion(_r.setFromUnitVectors(up, toward));
      cone.translate(_p.x, _p.y, _p.z);
      const shade = new Float32Array(cone.attributes.position.count * 3);
      _c.copy(cHair).multiplyScalar(0.85 + 0.35 * rnd());
      for (let i = 0; i < shade.length; i += 3) _c.toArray(shade, i);
      cone.setAttribute('color', new THREE.BufferAttribute(shade, 3));
      locks.push(cone.toNonIndexed());
    };
    for (let k = 0; k < T.count; k++) {
      // spread over the top, more of them towards the front
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 0.8;
      _n.set(Math.sin(a) * r * 0.85, 1, Math.cos(a) * r * 0.7 + 0.35).normalize();
      const top = topness(_n);
      if (top < 0.4) continue;
      skin(_n, _p).addScaledVector(normal(_n, _q), H.top * 0.7);
      const len = (T.length[0] + T.length[1] * rnd()) * top;
      const width = T.width[0] + T.width[1] * rnd();
      // stood along the skull, leaning forward, more so at the front
      _q.copy(normal(_n, _q)).add(_v.set((rnd() - 0.5) * 0.5, 0, T.lean[0] + T.lean[1] * Math.max(0, _n.z))).normalize();
      lock(len, width, _q, T.flat);
    }
    // strands at the crown, standing up and back where it doesn't lie flat
    const W = L.wisps;
    if (W) {
      seed = W.seed;
      for (let k = 0; k < W.count; k++) {
        _n.set((rnd() - 0.5) * 0.6, 1, -0.35 - 0.5 * rnd()).normalize();
        skin(_n, _p).addScaledVector(normal(_n, _q), H.top * 0.8);
        _q.copy(normal(_n, _q)).add(_v.set((rnd() - 0.5) * 0.6, 0.4, -0.3)).normalize();
        lock(W.length * (0.6 + 0.6 * rnd()), 0.002 + 0.001 * rnd(), _q);
      }
    }
    // a fringe of locks lying down the forehead, standing off it a little
    const F = L.fringeLocks;
    if (F) {
      seed = F.seed;
      for (let k = 0; k < F.count; k++) {
        const x = (k / (F.count - 1) - 0.5) * 2 * F.across + (rnd() - 0.5) * 0.008;
        const y = H.fringe + F.from;
        // down the slope of the forehead there
        skin(toward(x, y - 0.02, _n), _v);
        skin(toward(x, y, _n), _p);
        _q.subVectors(_v, _p).normalize().addScaledVector(normal(_n, _v), 0.16).normalize();
        _p.addScaledVector(normal(_n, _v), -0.003); // rooted under the hair, only the tips out
        lock(F.length * (0.75 + 0.5 * rnd()), F.width * (0.8 + 0.4 * rnd()), _q, 0.4);
      }
    }
    locks.forEach((g) => g.deleteAttribute('uv'));
    head.add(cast(new THREE.Mesh(mergeGeometries(locks), hairMat)));
  }

  // ── Eyes ──
  // Almond-shaped, the iris filling them top to bottom, a dark line of
  // lashes along the top, and thin brows over them.
  const E = L.eyes;
  const white = M(0xece6e0, 0.35);
  const iris = M(L.colour.iris, 0.25);
  const dark = M(0x1e1410, 0.8);
  const brows = M(L.colour.hair, 0.9);
  for (const sx of [-1, 1]) {
    toward(sx * E.x, 0, _n);
    skin(_n, _p);
    const eye = new THREE.Group();
    eye.position.copy(_p);
    eye.position.z -= 0.004;
    eye.rotation.y = sx * 0.28; // the face turns away round the side
    head.add(eye);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), white);
    ball.scale.set(E.w, E.h, 0.008);
    eye.add(ball);
    const disc = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), iris);
    disc.scale.set(E.iris, E.iris, 0.004);
    disc.position.set(-sx * 0.002, 0, 0.0062);
    eye.add(disc);
    eye.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-E.w, -0.001, 0.003), new THREE.Vector3(0, E.h * 2.1, 0.009), new THREE.Vector3(E.w, 0.001, 0.003)), 8, 0.0017, 4), dark));
    // the brow, rising a little towards the temple
    const b0 = toward(sx * 0.018, L.brow, new THREE.Vector3());
    const b1 = toward(sx * 0.046, L.brow + 0.006, new THREE.Vector3());
    const b2 = toward(sx * 0.074, L.brow + 0.002, new THREE.Vector3());
    const path = [b0, b1, b2].map((d) => skin(d, new THREE.Vector3()).addScaledVector(d, 0.002));
    head.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 8, 0.0027, 4), brows));
  }

  // ── Nose, mouth and ears ──
  toward(0, L.nose, _n);
  skin(_n, _p);
  const nose = cast(new THREE.Mesh(new THREE.SphereGeometry(L.noseSize, 10, 8), skinMat));
  nose.scale.set(1.15, 0.85, 0.8);
  nose.position.copy(_p).addScaledVector(_n, -0.002);
  head.add(nose);
  {
    const a = skin(toward(-0.016, L.mouth + 0.001, _n), new THREE.Vector3());
    const m = skin(toward(0, L.mouth - 0.0015, _n), new THREE.Vector3());
    const b = skin(toward(0.016, L.mouth + 0.001, _n), new THREE.Vector3());
    head.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, m, b]), 8, 0.0016, 4), M(0x7a4436, 0.6)));
  }
  for (const sx of [-1, 1]) {
    const ear = cast(new THREE.Mesh(new THREE.SphereGeometry(L.ears.size, 10, 8), skinMat));
    ear.scale.set(0.32, 1, 0.66);
    ear.position.set(sx * (S.x - 0.004), L.ears.y, L.ears.z);
    ear.rotation.y = sx * L.ears.out; // standing out from the head
    ear.rotation.z = -sx * 0.08;
    head.add(ear);
  }

  // Where a strap round the head goes: over the forehead, under the fringe,
  // in the head's own frame.
  const frame = group(head);
  toward(0, L.band, _n);
  const brow = group(frame);
  skin(_n, brow.position);
  brow.rotation.x = -Math.atan2(_n.y / S.y, _n.z / S.z) * 0.9;
  const ny = (L.band - L.at.y) / S.y;
  const across = Math.sqrt(1 - ny * ny);
  const crown = { rx: S.x * across + H.sides + 0.002, rz: S.z * across + 0.004, z: L.at.z, y: L.band };
  return { brow, crown };
}

// Sleeves and legs are the grown-up's patterns, taken in: a child's arms and
// legs are slimmer for their length. Squeeze a garment's sections about the
// bone (x = z = 0) below `from` (m up the bone), by k.
export function takeIn(geometry, k, from) {
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = lerp(1, k, smoothstep(from, from - 0.08, p.getY(i)));
    p.setX(i, p.getX(i) * t);
    p.setZ(i, p.getZ(i) * t);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// A child's trainers, in the ankle's frame (+z ahead; the sole is 0.07 under
// it), as rows for tailored(): the sole, and the upper over it.
export const TRAINER_SOLE = [[-0.07, 0.058, 0.121, 0.046], [-0.064, 0.062, 0.123, 0.046],
  [-0.05, 0.062, 0.122, 0.046], [-0.042, 0.06, 0.119, 0.045]];
export const TRAINER_UPPER = [[-0.046, 0.058, 0.117, 0.045], [-0.03, 0.058, 0.115, 0.044],
  [-0.012, 0.055, 0.106, 0.04], [0.006, 0.051, 0.084, 0.024],
  [0.026, 0.048, 0.062, 0.006], [0.042, 0.046, 0.052, -0.002], [0.05, 0.042, 0.046, -0.004]];
