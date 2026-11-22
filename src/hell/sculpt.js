// Making shapes out of simple ones: boxes, drums, balls and limbs, each
// placed, turned and coloured, all run together into one geometry with a
// colour at every vertex (and how hot it is: aHot, for stone that glows).
// The gate, the walls and towers, the tombs and the creatures are all made
// with it.
//
//   const s = new Sculpt();
//   s.box(0, 1, 0, 2, 2, 1, STONE);                 // centre, size, colour
//   s.drum(0, 2, 0, 0.5, 0.6, 3, STONE, { sides: 8 }); // base centre, top and bottom radius, height
//   s.limb([0, 1, 0], [1, 2, 0], 0.2, 0.15, SKIN);  // a tapered bone from a to b
//   s.tube([[0, 0, 0], [0, 1, 0.5], [0, 1, 2]], [0.3, 0.2, 0.05], SKIN); // a tail
//   s.quad(a, b, c, d, SKIN);                       // a flat panel, both sides
//   mesh = new THREE.Mesh(s.build(), material);
//
// Colours are [r, g, b] in linear light. `hot` is 0..1.

import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _n = new THREE.Matrix3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const shapes = new Map();
function shape(key, make) {
  let g = shapes.get(key);
  if (!g) shapes.set(key, (g = make()));
  return g;
}

export class Sculpt {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.hot = [];
    this.tags = [];
    this.idx = [];
    // what every vertex added from now on is marked with (aTag): a number
    // the material can read, to tell a leg from an arm from the trunk
    this.tag = 0;
    // everything added is put through this first, if it is set (a Matrix4)
    this.frame = null;
  }

  // Add a geometry, put through matrix, in one colour.
  add(geo, matrix, color, hot = 0) {
    const m = this.frame ? _m.multiplyMatrices(this.frame, matrix) : matrix;
    _n.getNormalMatrix(m);
    const base = this.pos.length / 3;
    const p = geo.attributes.position;
    const n = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(m);
      this.pos.push(_v.x, _v.y, _v.z);
      _v.fromBufferAttribute(n, i).applyMatrix3(_n).normalize();
      this.nor.push(_v.x, _v.y, _v.z);
      this.col.push(color[0], color[1], color[2]);
      this.hot.push(hot);
      this.tags.push(this.tag);
    }
    const ix = geo.index;
    if (ix) for (let i = 0; i < ix.count; i++) this.idx.push(base + ix.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    return this;
  }

  _at(x, y, z, sx, sy, sz, o) {
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ');
    return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz));
  }

  // A box, by its middle and its size.
  box(x, y, z, sx, sy, sz, color, o = {}) {
    return this.add(shape('box', () => new THREE.BoxGeometry(1, 1, 1)), this._at(x, y, z, sx, sy, sz, o), color, o.hot || 0);
  }

  // A drum or a cone standing on (x, y, z): top and bottom radius, height.
  drum(x, y, z, rTop, rBot, h, color, o = {}) {
    const sides = o.sides || 8;
    const k = rTop / Math.max(rBot, 1e-6);
    const g = shape(`drum:${sides}:${k.toFixed(3)}:${o.open ? 1 : 0}`, () => new THREE.CylinderGeometry(k, 1, 1, sides, 1, !!o.open).translate(0, 0.5, 0));
    return this.add(g, this._at(x, y, z, rBot, h, rBot, o), color, o.hot || 0);
  }

  // A ball (or, squashed, a boulder) about (x, y, z).
  ball(x, y, z, r, color, o = {}) {
    // (coarse: a knuckle, a pebble; fine: a head seen close)
    const g = shape(`ball:${o.fine ? 2 : o.coarse ? 0 : 1}`, () => (o.fine ? new THREE.SphereGeometry(1, 14, 10) : o.coarse ? new THREE.SphereGeometry(1, 5, 3) : new THREE.SphereGeometry(1, 8, 6)));
    return this.add(g, this._at(x, y, z, r * (o.sx || 1), r * (o.sy || 1), r * (o.sz || 1), o), color, o.hot || 0);
  }

  // A tapered bone from a to b ([x, y, z] each), ra and rb thick at its ends,
  // rounded off at both.
  limb(a, b, ra, rb, color, o = {}) {
    const sides = o.sides || 6;
    _a.fromArray(a);
    _b.fromArray(b);
    const len = _a.distanceTo(_b);
    if (len < 1e-6) return this;
    const k = rb / Math.max(ra, 1e-6);
    const open = o.joints !== false && !o.capped;
    const g = shape(`drum:${sides}:${k.toFixed(3)}:${open ? 1 : 0}`, () => new THREE.CylinderGeometry(k, 1, 1, sides, 1, open).translate(0, 0.5, 0));
    _v.subVectors(_b, _a).normalize();
    _q.setFromUnitVectors(UP, _v);
    this.add(g, new THREE.Matrix4().compose(_a, _q, _s.set(ra, len, ra)), color, o.hot || 0);
    // rounded off at both ends, unless told not to (joints: false), or only
    // at the far one ('end': the next bone's start will do for this one's)
    if (o.joints !== false) {
      if (o.joints !== 'end') this.ball(a[0], a[1], a[2], ra, color, o);
      this.ball(b[0], b[1], b[2], rb, color, o);
    }
    return this;
  }

  // A round thing that bends: a tail, a neck, a serpent, a root. It runs
  // through points ([x, y, z] each), radii[i] thick at each (or one radius
  // for all), and is closed off at both ends.
  tube(points, radii, color, o = {}) {
    const sides = o.sides || 7;
    const n = points.length;
    if (n < 2) return this;
    const r = (i) => (Array.isArray(radii) ? radii[Math.min(i, radii.length - 1)] : radii);
    const base = this.pos.length / 3;
    const hot = o.hot || 0;
    const t = new THREE.Vector3();
    const u = new THREE.Vector3();
    const w = new THREE.Vector3();
    const c = new THREE.Vector3();
    // a first side-to-side that isn't along the tube, then carried along it
    _a.fromArray(points[1]).sub(_v.fromArray(points[0])).normalize();
    u.set(Math.abs(_a.y) < 0.9 ? 0 : 1, Math.abs(_a.y) < 0.9 ? 1 : 0, 0).cross(_a).normalize();
    for (let i = 0; i < n; i++) {
      const a = points[Math.max(0, i - 1)];
      const b = points[Math.min(n - 1, i + 1)];
      t.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      u.addScaledVector(t, -u.dot(t)).normalize();
      w.crossVectors(t, u);
      for (let k = 0; k < sides; k++) {
        const ang = (k / sides) * Math.PI * 2;
        _b.copy(u).multiplyScalar(Math.cos(ang)).addScaledVector(w, Math.sin(ang));
        c.fromArray(points[i]).addScaledVector(_b, r(i));
        if (this.frame) {
          c.applyMatrix4(this.frame);
          _b.transformDirection(this.frame);
        }
        this.pos.push(c.x, c.y, c.z);
        this.nor.push(_b.x, _b.y, _b.z);
        this.col.push(color[0], color[1], color[2]);
        this.hot.push(hot);
        this.tags.push(this.tag);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < sides; k++) {
        const a = base + i * sides + k;
        const b = base + i * sides + ((k + 1) % sides);
        this.idx.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
    if (o.caps !== false) {
      this.ball(points[0][0], points[0][1], points[0][2], r(0), color, o);
      this.ball(points[n - 1][0], points[n - 1][1], points[n - 1][2], r(n - 1), color, o);
    }
    return this;
  }

  // A flat panel with corners a, b, c, d (a wing's membrane, a banner), both
  // sides.
  quad(a, b, c, d, color, hot = 0) {
    const base = this.pos.length / 3;
    _a.fromArray(b).sub(_v.fromArray(a));
    _b.fromArray(d).sub(_v);
    _a.cross(_b).normalize();
    for (const side of [1, -1]) {
      for (const p of [a, b, c, d]) {
        _v.fromArray(p);
        if (this.frame) _v.applyMatrix4(this.frame);
        this.pos.push(_v.x, _v.y, _v.z);
        _b.copy(_a).multiplyScalar(side);
        if (this.frame) _b.transformDirection(this.frame);
        this.nor.push(_b.x, _b.y, _b.z);
        this.col.push(color[0], color[1], color[2]);
        this.hot.push(hot);
        this.tags.push(this.tag);
      }
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3, base + 4, base + 6, base + 5, base + 4, base + 7, base + 6);
    return this;
  }

  // Everything so far, as one geometry.
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aHot', new THREE.Float32BufferAttribute(this.hot, 1));
    g.setAttribute('aTag', new THREE.Float32BufferAttribute(this.tags, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// A colour a little off `c`, by t (0..1): no two stones the same.
export const vary = (c, t, by = 0.18) => {
  const k = 1 + (t - 0.5) * 2 * by;
  return [c[0] * k, c[1] * k, c[2] * k];
};
