// Making shapes out of simple ones: boxes, drums, balls and limbs, each
// placed, turned and coloured, all run together into one geometry with a
// colour at every vertex (and how hot it is: aHot, for stone that glows).
// Whatever is built or alive in a place made in code is made with it: Hell's
// gate, walls, tombs and creatures, Purgatory's angels and its carved stone.
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
//
// Melted (new Sculpt({ melt: { cell, blend }, body })): what is round and
// alive — balls, bones, skins over spines — is not put together from
// pieces but run into one surface, each piece filleted into what it touches
// (render/implicit.js), and meshed as finely as `cell` (m). What is too thin
// for that, or hard, or hot (a claw, a horn, an iron hook, an eye like a
// coal, a wing's membrane) is built from pieces as before, only rounder.
// Every vertex then also says what it's made of and how big the thing is
// (aSurf), how open it is to the light round it (aOcc) and how thick it is
// there (aThin): for skin (render/skin.js). So does any Sculpt made with
// { surfaces: true }.
//
// What a piece is made of is s.surf (render/skin.js: SURF), for everything
// added from then on; or s.surfOf(color), if set, says it by colour.

import * as THREE from 'three';
import { Melt } from './implicit.js';
import { SURF } from './skin.js';

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
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _r = new THREE.Matrix4();
const MELTS = new Set([SURF.flesh, SURF.scales]); // what is run together, when melting
const MELT_LEAST = 1.3; // cells: anything thinner than this is built from pieces
const THICK = 0.3; // m through a piece, as far as the light is concerned, unless it's a sheet
const SHEET = 0.004; // m through a sheet: a wing, a sail

const shapes = new Map();
function shape(key, make) {
  let g = shapes.get(key);
  if (!g) shapes.set(key, (g = make()));
  return g;
}

export class Sculpt {
  // melt: { cell, blend } to run what's round and alive together (above)
  // body: how big the thing is, as so many men (for the size of its pores)
  // surfaces: say what each vertex is made of even without melting
  constructor({ melt = null, body = 1, surfaces = false } = {}) {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.hot = [];
    this.tags = [];
    this.idx = [];
    this.surfs = [];
    this.thins = [];
    this.melt = melt ? new Melt(melt) : null;
    this.least = melt ? melt.cell * MELT_LEAST : 0;
    // what is melted, also built from pieces, for until it has been
    // (build({ later: true }))
    this.rough = null;
    this.body = body;
    this.surfaces = surfaces || !!melt;
    // what pieces added from now on are made of (or, by colour, surfOf)
    this.surf = SURF.flesh;
    this.surfOf = null;
    this.thin = THICK;
    // what every vertex added from now on is marked with (aTag): a number
    // the material can read, to tell a leg from an arm from the trunk
    this.tag = 0;
    // everything added is put through this first, if it is set (a Matrix4)
    this.frame = null;
  }

  // What a piece in `color` is made of.
  _surf(color) {
    const said = this.surfOf && Array.isArray(color) ? this.surfOf(color) : undefined;
    return said ?? this.surf;
  }

  // Whether a piece in `color`, `hot`, at least `r` thick, is run together
  // with the rest (when melting).
  _melts(color, hot, r) {
    return !!this.melt && !hot && r >= this.least && MELTS.has(this._surf(color));
  }

  // How much bigger the frame makes things (it is never stretched one way).
  _scale() {
    return this.frame ? Math.cbrt(Math.abs(this.frame.determinant())) : 1;
  }

  // A place, put through the frame.
  _p(x, y, z) {
    _v.set(x, y, z);
    if (this.frame) _v.applyMatrix4(this.frame);
    return [_v.x, _v.y, _v.z];
  }

  // What a melted piece is.
  _look(color, hot, sides) {
    return { color, hot, tag: this.tag, surf: this._surf(color), sides };
  }

  // The same piece built from pieces, into the rough copy: fn(rough).
  _roughly(fn) {
    if (!this.rough) this.rough = new this.constructor({ surfaces: true, body: this.body });
    const r = this.rough;
    r.frame = this.frame;
    r.tag = this.tag;
    r.surf = this.surf;
    r.surfOf = this.surfOf;
    r.thin = this.thin;
    fn(r);
  }

  // The rest of a vertex's say, for a piece built from pieces: n of them.
  _more(n, color) {
    const surf = this._surf(color);
    for (let i = 0; i < n; i++) {
      this.surfs.push(surf);
      this.thins.push(this.thin);
    }
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
    this._more(p.count, color);
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
    const r0 = r;
    const k = this._scale();
    const rx = r * (o.sx || 1) * k;
    const ry = r * (o.sy || 1) * k;
    const rz = r * (o.sz || 1) * k;
    if (this._melts(color, o.hot, Math.min(rx, ry, rz))) {
      _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ');
      _r.makeRotationFromEuler(_e);
      if (this.frame) _r.premultiply(_m.extractRotation(this.frame));
      _r.extractBasis(_x, _y, _z);
      this.melt.ball(this._p(x, y, z), [rx, ry, rz], [_x.x, _x.y, _x.z, _y.x, _y.y, _y.z, _z.x, _z.y, _z.z], this._look(color, 0));
      this._roughly((rough) => rough.ball(x, y, z, r0, color, o));
      return this;
    }
    // (coarse: a knuckle, a pebble; fine: a head seen close, or anything, melting)
    if (this.melt && !o.coarse) o = { ...o, fine: true };
    const g = shape(`ball:${o.fine ? 2 : o.coarse ? 0 : 1}`, () => (o.fine ? new THREE.SphereGeometry(1, 14, 10) : o.coarse ? new THREE.SphereGeometry(1, 5, 3) : new THREE.SphereGeometry(1, 8, 6)));
    return this.add(g, this._at(x, y, z, r * (o.sx || 1), r * (o.sy || 1), r * (o.sz || 1), o), color, o.hot || 0);
  }

  // A tapered bone from a to b ([x, y, z] each), ra and rb thick at its ends,
  // rounded off at both.
  limb(a, b, ra, rb, color, o = {}) {
    const sc = this._scale();
    if (this._melts(color, o.hot, Math.max(ra, rb) * sc)) {
      this.melt.bone(this._p(...a), this._p(...b), ra * sc, rb * sc, this._look(color, 0));
      this._roughly((r) => r.limb(a, b, ra, rb, color, o));
      return this;
    }
    const sides = this.melt ? Math.round((o.sides || 6) * 1.6) : o.sides || 6;
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
    const n = points.length;
    if (n < 2) return this;
    const r = (i) => (Array.isArray(radii) ? radii[Math.min(i, radii.length - 1)] : radii);
    const sc = this._scale();
    let thick = 0;
    for (let i = 0; i < n; i++) thick = Math.max(thick, r(i) * sc);
    if (this._melts(color, o.hot, thick)) {
      for (let i = 0; i < n - 1; i++) this.melt.bone(this._p(...points[i]), this._p(...points[i + 1]), r(i) * sc, r(i + 1) * sc, this._look(color, 0));
      this._roughly((rough) => rough.tube(points, radii, color, o));
      return this;
    }
    const sides = this.melt ? Math.round((o.sides || 7) * 1.6) : o.sides || 7;
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
    this._more(n * sides, color);
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
    const was = this.thin;
    this.thin = SHEET;
    this._more(8, color);
    this.thin = was;
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3, base + 4, base + 6, base + 5, base + 4, base + 7, base + 6);
    return this;
  }

  // Everything so far, as one geometry. Melted, it takes a moment: with
  // { later: true } what was to be melted is built from pieces for now, and
  // melting() does the rest when asked, a little at a time.
  build({ later = false } = {}) {
    const melts = this.melt && !this.melt.empty;
    if (melts && later) {
      this.pending = true;
      return this._geometry(this.rough);
    }
    return this._geometry(null, melts ? this.melt.mesh() : null);
  }

  // After build({ later: true }): the melted geometry, worked out a little
  // at a time. step(until) works until performance.now() passes `until`
  // and says whether it's done; then `geometry` is it.
  melting() {
    let work = this.melt.steps();
    const job = {
      geometry: null,
      step: (until) => {
        if (job.geometry) return true;
        if (job.mesh) {
          job.geometry = this._geometry(null, job.mesh);
          job.mesh = null;
          return true;
        }
        let r = work.next();
        while (!r.done && performance.now() < until) r = work.next();
        if (!r.done) return false;
        // (putting it together is a step of its own)
        job.mesh = r.value;
        work = null;
        return false;
      },
    };
    return job;
  }

  // The geometry: what was built from pieces, and with it either the rough
  // copy of what is melted (a Sculpt) or the melted mesh (m).
  _geometry(rough, m = null) {
    const pos = this.pos.slice();
    const nor = this.nor.slice();
    const col = this.col.slice();
    const hot = this.hot.slice();
    const tags = this.tags.slice();
    const surfs = this.surfs.slice();
    const thins = this.thins.slice();
    const idx = this.idx.slice();
    const occ = new Array(pos.length / 3).fill(1);
    if (rough && rough.pos.length) {
      const base = pos.length / 3;
      append(pos, rough.pos);
      append(nor, rough.nor);
      append(col, rough.col);
      append(hot, rough.hot);
      append(tags, rough.tags);
      append(surfs, rough.surfs);
      append(thins, rough.thins);
      for (let i = 0; i < rough.pos.length / 3; i++) occ.push(1);
      for (const i of rough.idx) idx.push(base + i);
    }
    if (m) {
      const base = pos.length / 3;
      for (let i = 0; i < m.pos.length; i++) pos.push(m.pos[i]);
      for (let i = 0; i < m.nor.length; i++) nor.push(m.nor[i]);
      for (let i = 0; i < m.col.length; i++) col.push(m.col[i]);
      for (let i = 0; i < m.hot.length; i++) {
        hot.push(m.hot[i]);
        tags.push(m.tag[i]);
        surfs.push(m.surf[i]);
        thins.push(m.thin[i]);
        occ.push(m.occ[i]);
      }
      for (let i = 0; i < m.idx.length; i++) idx.push(base + m.idx[i]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aHot', new THREE.Float32BufferAttribute(hot, 1));
    g.setAttribute('aTag', new THREE.Float32BufferAttribute(tags, 1));
    if (this.surfaces) {
      const surf = new Float32Array(surfs.length * 2);
      for (let i = 0; i < surfs.length; i++) {
        surf[i * 2] = surfs[i];
        surf[i * 2 + 1] = this.body;
      }
      g.setAttribute('aSurf', new THREE.BufferAttribute(surf, 2));
      g.setAttribute('aOcc', new THREE.Float32BufferAttribute(occ, 1));
      g.setAttribute('aThin', new THREE.Float32BufferAttribute(thins, 1));
    }
    g.setIndex(idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// b onto the end of a (spread would run out of arguments for a big one).
function append(a, b) {
  for (let i = 0; i < b.length; i++) a.push(b[i]);
}

// A colour a little off `c`, by t (0..1): no two stones the same.
export const vary = (c, t, by = 0.18) => {
  const k = 1 + (t - 0.5) * 2 * by;
  return [c[0] * k, c[1] * k, c[2] * k];
};
