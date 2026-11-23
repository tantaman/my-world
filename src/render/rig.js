// Animals are built the way the rest of the world is: from primitives, with
// colour baked into the vertices, no textures and no model files.
//
// Each animal is ONE SkinnedMesh. Its parts (a torso, a thigh, an ear, an
// antler tine) are welded into a single geometry and each vertex is bound to
// the bone it belongs to, so a whole deer is a single draw call however many
// pieces it has. Animation is then just rotating bones, procedurally, the same
// way the explorer's gait is a lot of sines.
//
//   const r = new RigBuilder(seed);
//   const body = r.bone(null, 0, 0.9, 0);
//   r.part(body, ellipsoid(0.3, 0.25, 0.6), { color: (p, n, w) => ... });
//   const mesh = r.build();

import * as THREE from 'three';
import { mulberry32 } from '../noise.js';

// Every animal shares this material, so they share one shader program.
export const animalMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });

const IDENT = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _w = new THREE.Vector3();
const _wn = new THREE.Vector3();
const _raw = new THREE.Vector3();
const _c = new THREE.Color();
const _nm = new THREE.Matrix3();
const _nmw = new THREE.Matrix3();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export const lin = (hex) => new THREE.Color(hex);

// Position + Euler rotation + scale as a matrix (for placing a part on a bone).
export function at(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// A matrix that takes +y onto the direction (dx, dy, dz) from (x, y, z): for
// limbs and horns modelled hanging along y.
export function along(x, y, z, dx, dy, dz, sx = 1, sz = sx) {
  _v.set(dx, dy, dz);
  const len = _v.length();
  _v.multiplyScalar(1 / len);
  _q.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, _v);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, len, sz));
}

// ── Shapes ─────────────────────────────────────────────────────────────────
// Few segments: these are drawn a few dozen art pixels tall at most.
export const ellipsoid = (rx, ry, rz, ws = 9, hs = 7) => new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz);
// A limb hanging from the origin down -y, rounded at the joint.
export function limb(r0, r1, len, segs = 6) {
  const g = new THREE.CylinderGeometry(r0, r1, len, segs, 1, false);
  g.translate(0, -len / 2, 0);
  return g;
}
// A unit-length segment along +y (scale it with `along`).
export function stick(r0, r1, segs = 5) {
  const g = new THREE.CylinderGeometry(r1, r0, 1, segs, 1, false);
  g.translate(0, 0.5, 0);
  return g;
}
export function cone(r, h, segs = 6) {
  const g = new THREE.ConeGeometry(r, h, segs, 1, false);
  g.translate(0, h / 2, 0);
  return g;
}
export const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);

// Deterministic per-vertex speckle so fur and feathers don't read as plastic.
function grain(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

export class RigBuilder {
  constructor(seed = 1) {
    this.rng = mulberry32(seed);
    this.root = new THREE.Bone();
    this.root.name = 'root';
    this.bones = [this.root];
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.si = [];
    this.sw = [];
    this.idx = [];
    this.count = 0;
    this.grain = 0.16; // how much each vertex's brightness wanders
  }

  bone(parent, x, y, z, name = '') {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    (parent || this.root).add(b);
    this.bones.push(b);
    return b;
  }

  // Add a geometry to a bone. `matrix` places it in the bone's space.
  //   color: THREE.Color, or (pPart, nModel, pModel) -> THREE.Color, where
  //     pPart is the vertex in the geometry's own coordinates (a stick runs
  //     0..1 up y), and nModel / pModel are in the animal's space
  //   deform(p, n): tweak the raw geometry before it's placed
  //   weights(pModel) -> [boneA, wA, boneB, wB] for a blended skin (spines)
  part(bone, geo, { matrix = IDENT, color, deform, weights, grain: g = this.grain } = {}) {
    this.root.updateMatrixWorld(true);
    const bi = this.bones.indexOf(bone);
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    _nm.getNormalMatrix(matrix);
    _nmw.getNormalMatrix(bone.matrixWorld);
    const base = this.count;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i);
      _n.fromBufferAttribute(nor, i);
      if (deform) deform(_v, _n);
      _raw.copy(_v);
      _v.applyMatrix4(matrix);
      _n.applyMatrix3(_nm).normalize();
      _w.copy(_v).applyMatrix4(bone.matrixWorld);
      _wn.copy(_n).applyMatrix3(_nmw).normalize();
      const c = typeof color === 'function' ? color(_raw, _wn, _w) : color;
      const j = 1 + (grain(_w.x, _w.y, _w.z) - 0.5) * g;
      this.pos.push(_w.x, _w.y, _w.z);
      this.nor.push(_wn.x, _wn.y, _wn.z);
      this.col.push(c.r * j, c.g * j, c.b * j);
      if (weights) {
        const [a, wa, b, wb] = weights(_w);
        this.si.push(this.bones.indexOf(a), this.bones.indexOf(b), 0, 0);
        this.sw.push(wa, wb, 0, 0);
      } else {
        this.si.push(bi, 0, 0, 0);
        this.sw.push(1, 0, 0, 0);
      }
      this.count++;
    }
    // A mirrored placement turns triangles inside out; wind them back.
    const flip = matrix.determinant() * bone.matrixWorld.determinant() < 0;
    const n = geo.index ? geo.index.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const a = geo.index ? geo.index.getX(i) : i;
      const b = geo.index ? geo.index.getX(i + 1) : i + 1;
      const c = geo.index ? geo.index.getX(i + 2) : i + 2;
      if (flip) this.idx.push(base + a, base + c, base + b);
      else this.idx.push(base + a, base + b, base + c);
    }
    geo.dispose();
  }

  // The same part on the left and right, mirrored in x. `make(side)` returns
  // [bone, geo, opts] for side = 1 (left, +x) and -1.
  mirror(make) {
    for (const side of [1, -1]) {
      const [bone, geo, opts] = make(side);
      this.part(bone, geo, opts);
    }
  }

  build({ shadow = true } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    const mesh = new THREE.SkinnedMesh(g, animalMaterial);
    mesh.add(this.root);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(this.bones));
    // Culling uses this sphere in the mesh's own space. Limbs swing and heads
    // dip, so give it room rather than recomputing it from the bones.
    mesh.boundingSphere = g.boundingSphere.clone();
    mesh.boundingSphere.radius *= 1.6;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    for (const b of this.bones) b.userData.rest = b.position.clone();
    return mesh;
  }
}

export function disposeAnimal(mesh) {
  mesh.geometry.dispose();
  if (mesh.skeleton) mesh.skeleton.dispose();
}
