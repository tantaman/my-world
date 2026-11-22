// The keepers and monsters of Hell, as shapes: each made of simple ones
// (sculpt.js), standing with its feet at the origin and facing +z, in metres.
//
//   makeCreature(name, material) -> THREE.Group
//     .userData.height   how tall it stands (m)
//     .userData.parts    { name: Object3D } for whatever of it moves (a
//                        wing, a jaw, a tail): each turns about its own origin
//
// `material` is what it is drawn with (render/skin.js: createSkinMaterial({
// hot: true, baked: true })): colours are per vertex, aHot makes a part glow
// (eyes like coals), and what each part is made of (a hide, horn, iron,
// wood, cloth, a wing) is said vertex by vertex from its colour (MADE_OF).
//
// Their bodies are melted (sculpt.js, render/implicit.js): what is round
// and alive runs together into one skin, with the muscles of a man under
// it where the frame of one is used. That takes a moment, so a creature is
// built from its pieces at first, as it always was, and meltSome(ms) melts
// what's waiting, a little at a time; every copy then takes the melted
// shape.
//
// Some have more in userData: the boat its `deck` (m above the water, where a
// rider stands), Geryon his `seat` ([x, y, z], where a rider's feet go).
//
// A creature's left is +x and its right is -x, as for anything facing +z: so
// `armR` is on the -x side. How its parts turn:
//   wings        open, and lift, as rotation.z grows: left and right alike
//   legs, paws, an arm that hangs   swing forward as rotation.x falls, back
//                as it grows (the scourger's arm is raised: it comes down
//                forward, to strike, as rotation.x grows)
//   jaws         drop open as rotation.x grows, shut as it falls
//   heads        nod down as rotation.x grows, turn to their left with rotation.y
//   a tail       lifts as rotation.x grows
//   the banner's flag   swings round the pole with rotation.y
//
// The file runs: sums on points; colours; lines and frames; the shapes
// living things need on top of Sculpt's (a skin over a spine, sheets,
// spikes, a bat's wing); how a creature and its parts are put together; the
// frame of a man, and the hands, faces and muzzles to put on it; then the
// creatures, one maker each.

import * as THREE from 'three';
import { Sculpt } from './sculpt.js';
import { SURF } from '../render/skin.js';

const TAU = Math.PI * 2;

// ── Sums on places and directions, each [x, y, z] ───────────────────────────
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const along = (a, d, k) => [a[0] + d[0] * k, a[1] + d[1] * k, a[2] + d[2] * k];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
// a colour, darker or lighter by k
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
// a number 0..1 that is always the same for the same i: nothing here is left
// to chance, so a creature is the same shape each time it is made
const rnd = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
// some direction square to d
const square = (d) => unit(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));

// ── Colours (linear light: all of it is dim) ────────────────────────────────
const FLESH = [0.2, 0.17, 0.15];
const PALE = [0.21, 0.19, 0.17]; // old, bloodless skin
const HOARY = [0.3, 0.3, 0.28]; // white hair
const DARK = [0.012, 0.01, 0.01]; // a mouth, a socket
const EMBER = [0.3, 0.08, 0.03]; // an eye like a coal
const TOOTH = [0.28, 0.26, 0.2];
const HORN = [0.1, 0.085, 0.065];
const WOOD = [0.07, 0.05, 0.035];
const OLDWOOD = [0.045, 0.036, 0.03];
const RAG = [0.05, 0.045, 0.04];
const IRON = [0.035, 0.035, 0.04];
const BRUTE = [0.21, 0.125, 0.09]; // a demon's hide, red-brown
const CLOTH = [0.22, 0.2, 0.16]; // old undyed cloth
const GIANT = [0.19, 0.16, 0.135]; // a giant's hide, like weathered stone
const SHAGGY = [0.04, 0.032, 0.026]; // coarse dark hair

// What each of those is (render/skin.js); anything else is a hide.
const MADE_OF = new Map([
  [TOOTH, SURF.horn],
  [HORN, SURF.horn],
  [WOOD, SURF.wood],
  [OLDWOOD, SURF.wood],
  [RAG, SURF.cloth],
  [CLOTH, SURF.cloth],
  [HOARY, SURF.cloth],
  [SHAGGY, SURF.cloth],
  [IRON, SURF.iron],
]);
const madeOf = (c) => MADE_OF.get(c);

// Melted (sculpt.js): how many cells tall a creature is meshed in, and how
// wide the fillet is where one part of it runs into another (of its height).
const MELT_CELLS = 120;
const MELT_BLEND = 0.012;
const MELT_BUDGET = 32000; // triangles, about, in the melted parts of a creature: past that it's meshed coarser

// ── Lines, turns and frames ──────────────────────────────────────────────────
// n points along a smooth line through a few.
function curve(through, n) {
  const m = through.length - 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1)) * m;
    const k = Math.min(m - 1, Math.floor(f));
    const t = f - k;
    const p0 = through[Math.max(0, k - 1)];
    const p1 = through[k];
    const p2 = through[k + 1];
    const p3 = through[Math.min(m, k + 2)];
    out.push([0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t * t * t)));
  }
  return out;
}

// n thicknesses spread evenly along a short list of them (numbers, or
// [across, deep] pairs).
function spread(list, n) {
  const m = list.length - 1;
  const pair = (r) => (Array.isArray(r) ? r : [r, r]);
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1)) * m;
    const k = Math.min(m - 1, Math.floor(f));
    const a = pair(list[k]);
    const b = pair(list[k + 1]);
    out.push([a[0] + (b[0] - a[0]) * (f - k), a[1] + (b[1] - a[1]) * (f - k)]);
  }
  return out;
}

// A turn and a place as one matrix: its +z looks along `fwd`, its +y is as
// near `up` as that allows, and everything is `scale` times its size.
function facing(at, fwd, up = [0, 1, 0], scale = 1) {
  const z = unit(fwd);
  let x = cross(up, z);
  if (len(x) < 1e-5) x = cross([0, 0, 1], z);
  x = unit(x);
  const y = cross(z, x);
  return new THREE.Matrix4().set(x[0] * scale, y[0] * scale, z[0] * scale, at[0], x[1] * scale, y[1] * scale, z[1] * scale, at[1], x[2] * scale, y[2] * scale, z[2] * scale, at[2], 0, 0, 0, 1);
}

// A wing's own axes, as a matrix: x out along `span`, y as near `up` as that
// allows, z square to both (so that turning about z lifts the wing).
function spanning(span, up = [0, 1, 0]) {
  const x = unit(span);
  const z = unit(cross(x, up));
  const y = cross(z, x);
  return new THREE.Matrix4().set(x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, 0, 0, 0, 1);
}

// The axes of the part on the other side of the body from one whose axes
// are `basis`: mirrored left for right, and with its own z turned about, so
// that it is still a turn and not a reflection. What is built in it must be
// built with its z the other way (`flip` -1), and then the two parts are
// mirror images that answer alike to the same rotation.
function mirrored(basis) {
  const e = basis.elements;
  return new THREE.Matrix4().set(-e[0], -e[4], e[8], 0, e[1], e[5], -e[9], 0, e[2], e[6], -e[10], 0, 0, 0, 0, 1);
}

// ── Shapes ───────────────────────────────────────────────────────────────────
// The rings of a skin: at each point of its spine which way it runs (t),
// which way is across (u) and which deep (w), and how thick it is each way
// (a, b). Across starts as near `side` as it can (x, unless the spine sets
// out along x) and is carried along from there, so the skin never twists.
function ringsOf(points, radii, side) {
  const n = points.length;
  const out = [];
  let u = null;
  for (let i = 0; i < n; i++) {
    const t = unit(sub(points[Math.min(n - 1, i + 1)], points[Math.max(0, i - 1)]));
    const ref = u || side || (Math.abs(t[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]);
    let v = sub(ref, mul(t, dot(ref, t)));
    if (len(v) < 1e-5) v = square(t);
    u = unit(v);
    const r = Array.isArray(radii) ? radii[Math.min(i, radii.length - 1)] : radii;
    out.push({ c: points[i], t, u, w: cross(t, u), a: Array.isArray(r) ? r[0] : r, b: Array.isArray(r) ? r[1] : r, i });
  }
  return out;
}

// A place on a skin's surface and the way out from it: f is how far along
// the spine (0..1), ang how far round (0 is across, a quarter turn is deep).
// For what grows on a hide: hair, scales, paint.
function onSkin(points, radii, side) {
  const rings = ringsOf(points, radii, side);
  return (f, ang) => {
    const x = Math.min(0.9999, Math.max(0, f)) * (rings.length - 1);
    const k = Math.floor(x);
    const a = rings[k];
    const b = rings[k + 1];
    const t = x - k;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const pa = along(along(a.c, a.u, a.a * c), a.w, a.b * s);
    const pb = along(along(b.c, b.u, b.a * c), b.w, b.b * s);
    const n = unit(mix(along(mul(a.u, c * a.b), a.w, s * a.a), along(mul(b.u, c * b.b), b.w, s * b.a), t));
    return { p: mix(pa, pb, t), n, t: unit(mix(a.t, b.t, t)) };
  };
}

const _v = new THREE.Vector3();

// Sculpt, and what bodies want besides: none of these may be put through a
// frame that mirrors (they would turn inside out); mirror by the numbers.
class Flesh extends Sculpt {
  // Whatever fn adds is put through `matrix` on its way in.
  within(matrix, fn) {
    const was = this.frame;
    this.frame = was ? was.clone().multiply(matrix) : matrix;
    fn();
    this.frame = was;
    return this;
  }

  _put(p) {
    _v.set(p[0], p[1], p[2]);
    if (this.frame) _v.applyMatrix4(this.frame);
    return [_v.x, _v.y, _v.z];
  }

  _turn(d) {
    _v.set(d[0], d[1], d[2]);
    if (this.frame) _v.transformDirection(this.frame);
    return [_v.x, _v.y, _v.z];
  }

  // A muscle, under the skin of a melted body (sculpt.js), swelling from a
  // to b, r thick, flattened to `flat` of that along `face` (the way its
  // flat side looks: a breast's forward). Unmelted, there is none: the
  // pieces are only a sketch of the body anyway.
  muscle(a, b, r, color, o = {}) {
    if (!this.melt) return this;
    const k = this._scale();
    const pa = this._put(a);
    const pb = this._put(b);
    const half = len(sub(pb, pa)) / 2;
    if (half < 1e-6) return this;
    const axis = unit(sub(pb, pa));
    let face = this._turn(o.face || square(sub(b, a)));
    face = sub(face, mul(axis, dot(face, axis)));
    face = len(face) > 1e-6 ? unit(face) : square(axis);
    const across = cross(axis, face);
    const rr = r * k;
    this.melt.ball(mix(pa, pb, 0.5), [half, rr * (o.flat ?? 1), rr], [...axis, ...face, ...across], { ...this._look(color, 0), blend: this.melt.blend * 0.35 });
    return this;
  }

  // A skin over a spine: a body, a limb, a neck, a tail, a horn. It runs
  // through `points`; `radii` is how thick it is at each, a number or
  // [across, deep] (one for all, or one for each point). Its ends are
  // rounded off ({ caps: 'flat' | 'none' } otherwise, or [first, last]).
  // `color` may be a function (i, k) -> colour, for the point of the spine
  // and how far round (k of `sides`: 0 is across, a quarter of them deep).
  skin(points, radii, color, o = {}) {
    if (points.length < 2) return this;
    const rings = ringsOf(points, radii, o.side);
    // melted: the rings as they are, run into the rest of the body
    const k = this._scale();
    let thick = 0;
    for (const r of rings) thick += Math.min(r.a, r.b) * k;
    if (this._melts(typeof color === 'function' ? color(rings[0].i, 0) : color, o.hot, thick / rings.length)) {
      const look = this._look(color, 0, o.sides || 8);
      if (typeof color === 'function') look.surf = this.surf;
      this.melt.rings(
        rings.map((r) => ({ c: this._put(r.c), u: this._turn(r.u), w: this._turn(r.w), a: r.a * k, b: r.b * k, i: r.i })),
        look,
      );
      this._roughly((rough) => rough.skin(points, radii, color, o));
      return this;
    }
    const sides = this.melt ? Math.round((o.sides || 8) * 1.6) : o.sides || 8;
    const caps = Array.isArray(o.caps) ? o.caps : [o.caps || 'round', o.caps || 'round'];
    const dome = o.dome ?? 0.8;
    for (const end of [0, 1]) {
      const kind = caps[end];
      if (kind === 'none') continue;
      const dir = end ? 1 : -1;
      const r = rings[end ? rings.length - 1 : 0];
      const d = kind === 'round' ? Math.min(r.a, r.b) * dome * dir : 0;
      const more = [];
      if (kind === 'round') more.push({ ...r, c: along(r.c, r.t, d * 0.62), a: r.a * 0.78, b: r.b * 0.78 });
      more.push({ ...r, c: along(r.c, r.t, d), a: 0, b: 0, pole: dir });
      if (end) rings.push(...more);
      else rings.unshift(...more.reverse());
    }
    const m = rings.length;
    const P = rings.map((r) => {
      const row = [];
      for (let k = 0; k < sides; k++) {
        const ang = (k / sides) * TAU;
        row.push(this._put(along(along(r.c, r.u, r.a * Math.cos(ang)), r.w, r.b * Math.sin(ang))));
      }
      return row;
    });
    const base = this.pos.length / 3;
    const hot = o.hot || 0;
    for (let i = 0; i < m; i++) {
      const r = rings[i];
      for (let k = 0; k < sides; k++) {
        const p = P[i][k];
        let nor;
        if (r.pole) nor = this._turn(mul(r.t, r.pole));
        else {
          const round = sub(P[i][(k + 1) % sides], P[i][(k + sides - 1) % sides]);
          const on = sub(P[Math.min(m - 1, i + 1)][k], P[Math.max(0, i - 1)][k]);
          nor = cross(round, on);
          if (len(nor) < 1e-12) {
            const ang = (k / sides) * TAU;
            nor = this._turn(along(mul(r.u, Math.cos(ang)), r.w, Math.sin(ang)));
          } else nor = unit(nor);
        }
        const c = typeof color === 'function' ? color(r.i, k) : color;
        this.pos.push(p[0], p[1], p[2]);
        this.nor.push(nor[0], nor[1], nor[2]);
        this.col.push(c[0], c[1], c[2]);
        this.hot.push(hot);
        this.tags.push(this.tag);
      }
    }
    this._more(m * sides, typeof color === 'function' ? null : color);
    for (let i = 0; i < m - 1; i++) {
      for (let k = 0; k < sides; k++) {
        const a = base + i * sides + k;
        const b = base + i * sides + ((k + 1) % sides);
        if (!rings[i].pole) this.idx.push(a, b, a + sides);
        if (!rings[i + 1].pole) this.idx.push(b, b + sides, a + sides);
      }
    }
    return this;
  }

  // A sheet through rows of points, seen from both sides: a sail, a hull, a
  // cloak. `color` may be a function (row, column) -> colour.
  sheet(grid, color, o = {}) {
    const rows = grid.length;
    const cols = grid[0].length;
    const P = grid.map((row) => row.map((p) => this._put(p)));
    const N = [];
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const du = sub(P[i][Math.min(cols - 1, j + 1)], P[i][Math.max(0, j - 1)]);
        const dv = sub(P[Math.min(rows - 1, i + 1)][j], P[Math.max(0, i - 1)][j]);
        const n = cross(du, dv);
        N.push(len(n) < 1e-12 ? null : unit(n));
      }
    }
    // (where rows run together into a point, it faces as its neighbours do)
    for (let q = 0; q < N.length; q++) if (!N[q]) N[q] = N[q + cols] || N[q - cols] || N[q + 1] || N[q - 1] || [0, 1, 0];
    const hot = o.hot || 0;
    for (const face of [1, -1]) {
      const base = this.pos.length / 3;
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const p = P[i][j];
          const n = N[i * cols + j];
          const c = typeof color === 'function' ? color(i, j) : color;
          this.pos.push(p[0], p[1], p[2]);
          this.nor.push(n[0] * face, n[1] * face, n[2] * face);
          this.col.push(c[0], c[1], c[2]);
          this.hot.push(hot);
          this.tags.push(this.tag);
        }
      }
      const was = this.thin;
      this.thin = o.thin ?? 0.004;
      this._more(rows * cols, typeof color === 'function' ? null : color);
      this.thin = was;
      for (let i = 0; i < rows - 1; i++) {
        for (let j = 0; j < cols - 1; j++) {
          const a = base + i * cols + j;
          const b = a + 1;
          const c = a + cols;
          const d = c + 1;
          if (face > 0) this.idx.push(a, b, c, b, d, c);
          else this.idx.push(a, c, b, b, c, d);
        }
      }
    }
    return this;
  }

  // A membrane stretched from `root` between two tips, its free edge drawn in
  // toward the root as a bat's is (`sag`, 0..1), in `n` pieces.
  web(root, a, b, color, sag = 0.25, n = 4) {
    const near = [];
    const far = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      near.push(root);
      far.push(mix(mix(a, b, t), root, sag * 4 * t * (1 - t)));
    }
    return this.sheet([near, far], color);
  }

  // A spike from `base` to `tip`, r thick at the base: a claw, a tooth, a
  // tuft of hair. (No end to it: it is meant to stand on something.)
  spike(base, tip, r, color, o = {}) {
    const sides = o.sides || 3;
    const t = unit(sub(tip, base));
    const u = square(t);
    const w = cross(t, u);
    const at = this.pos.length / 3;
    const hot = o.hot || 0;
    for (let k = 0; k <= sides; k++) {
      const ang = (k / sides) * TAU;
      const d = k < sides ? along(mul(u, Math.cos(ang)), w, Math.sin(ang)) : t;
      const p = this._put(k < sides ? along(base, d, r) : tip);
      const n = this._turn(d);
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(color[0], color[1], color[2]);
      this.hot.push(hot);
      this.tags.push(this.tag);
    }
    this._more(sides + 1, color);
    for (let k = 0; k < sides; k++) this.idx.push(at + k, at + ((k + 1) % sides), at + sides);
    return this;
  }

  // A flat blade from a to b, `wide` at its widest: a feather, an ear, a fin.
  // `face` is roughly the way its flat looks; `at` how far along it is widest.
  leaf(a, b, wide, face, color, at = 0.4) {
    const t = sub(b, a);
    let sd = cross(t, face);
    if (len(sd) < 1e-6) sd = square(t);
    sd = unit(sd);
    const mid = along(a, t, at);
    return this.quad(a, along(mid, sd, wide / 2), b, along(mid, sd, -wide / 2), color);
  }

  // A small faceted bead: an eye, a stud, a knuckle.
  bead(p, r, color, hot = 0) {
    return this.skin([along(p, [0, 0, 1], -r * 0.5), along(p, [0, 0, 1], r * 0.5)], r * 0.8, color, { sides: 5, hot, dome: 0.7 });
  }
}

// A rag hung round a body: it falls over the skin that `points` and `radii`
// would make (from the top of it down), and its hem is torn: `ragged` (0..1)
// is how much of its length some of it has lost.
function drape(s, points, radii, color, o = {}) {
  const was = s.surf;
  s.surf = SURF.cloth;
  drape_(s, points, radii, color, o);
  s.surf = was;
}
function drape_(s, points, radii, color, o) {
  const on = onSkin(points, radii);
  const n = o.n || 14;
  const down = 4;
  const grid = [];
  for (let i = 0; i <= n; i++) {
    const q = i % n;
    const ang = (q / n) * TAU;
    const reach = 1 - (o.ragged ?? 0.35) * rnd(q * 3 + (o.seed || 0));
    const row = [];
    for (let j = 0; j <= down; j++) {
      const at = on((j / down) * reach, ang);
      // (the last of it hangs free of what is under it, and comes to a point)
      row.push(j === down ? add(at.p, [at.n[0] * 0.03, 0, at.n[2] * 0.03]) : at.p);
    }
    grid.push(row);
  }
  s.sheet(grid, typeof color === 'function' ? color : (i) => shade(color, 0.75 + 0.45 * rnd((i % n) + 31)));
}

// A bat's wing in its own frame: its root at the origin, the arm running out
// along +x and up to the wrist, the fingers fanning from the wrist out and
// down, the membrane between them and back to the flank. L is its length,
// root to tip; c: { bone, web, claw }; `flip` is -1 for a right wing (see
// `mirrored`); n, how many pieces each scallop of its edge is cut in;
// hang, how deep the membrane hangs under the arm (1 for a bat's).
function batWing(s, L, c, flip = 1, n = 4, hang = 1) {
  const P = (x, y, z = 0) => [x * L, y * (y < 0 ? hang : 1) * L, z * L * flip];
  const root = P(0, 0);
  const elbow = P(0.2, 0.17, -0.04);
  const wrist = P(0.4, 0.3, 0.03);
  const tips = [P(1.0, 0.17, -0.06), P(0.93, -0.27, -0.13), P(0.67, -0.54, -0.12), P(0.36, -0.58, -0.05)];
  const flank = P(0.02, -0.44, 0);
  const web = (i) => shade(c.web, 0.8 + 0.4 * rnd(i + 3));
  const was = s.surf;
  s.surf = SURF.membrane;
  for (let i = 0; i < 3; i++) s.web(wrist, tips[i], tips[i + 1], web(i), 0.24, n);
  s.web(elbow, wrist, tips[3], web(3), 0, 1);
  s.web(elbow, tips[3], flank, web(4), 0.22, n);
  s.web(elbow, flank, root, web(5), 0, 1);
  s.surf = was;
  s.skin([root, elbow, wrist], [0.03 * L, 0.024 * L, 0.017 * L], c.bone, { sides: 5 });
  tips.forEach((tip, i) => {
    // (each finger a little bowed)
    const bow = along(mix(wrist, tip, 0.5), unit(sub(tips[Math.max(0, i - 1)], tips[Math.min(3, i + 1)])), 0.03 * L);
    s.skin(curve([wrist, bow, tip], 5), spread([0.013 * L, 0.009 * L, 0.003 * L], 5), c.bone, { sides: 4, caps: 'flat' });
  });
  s.spike(wrist, add(wrist, P(0.02, 0.12, 0.04)), 0.014 * L, c.claw || c.bone, { sides: 4 });
}

// ── Putting a creature together ──────────────────────────────────────────────
// build(body, part) adds what stays still to `body`, and makes each thing
// that moves with part(name, pivot, make): make(sculpt) builds it where it
// sits on the creature, and it is then hung on its pivot to be turned about
// it. { basis } (a turn, as a Matrix4) sets the part's own axes round first:
// a wing's so that rotation.z lifts it, and a right wing's `mirrored` from
// the left's, so that the two answer alike; with { own } the part is built
// in those axes, about its pivot, and not where it sits. What build returns
// is added to userData.
function creature(material, height, build) {
  const g = new THREE.Group();
  const parts = {};
  // melted into one, as finely as its size asks; and its pores a man's, or a giant's
  const made = { melt: { cell: height / MELT_CELLS, blend: height * MELT_BLEND }, body: height / 1.8 };
  const flesh = () => {
    const f = new Flesh(made);
    f.surfOf = madeOf;
    return f;
  };
  const body = flesh();
  const melts = []; // [sculpt, mesh] for each piece to be melted
  const part = (name, pivot, make, o = {}) => {
    const s = flesh();
    const hold = o.basis ? o.basis.clone() : new THREE.Matrix4();
    hold.setPosition(pivot[0], pivot[1], pivot[2]);
    if (!o.own) s.frame = hold.clone().invert();
    make(s);
    const mesh = new THREE.Mesh(s.build({ later: true }), material);
    if (s.pending) melts.push([s, mesh]);
    mesh.name = name;
    if (o.basis) {
      // (its axes are the holder's: the part itself is left unturned, for whoever moves it)
      const holder = new THREE.Group();
      holder.applyMatrix4(hold);
      holder.add(mesh);
      g.add(holder);
    } else {
      mesh.position.set(pivot[0], pivot[1], pivot[2]);
      g.add(mesh);
    }
    parts[name] = mesh;
    return mesh;
  };
  const more = build(body, part) || {};
  if (body.idx.length || (body.melt && !body.melt.empty)) {
    const mesh = new THREE.Mesh(body.build({ later: true }), material);
    if (body.pending) melts.push([body, mesh]);
    g.add(mesh);
  }
  // the whole creature meshed as finely as its budget allows, its parts alike
  let area = 0;
  for (const [s] of melts) for (const p of s.melt.prims) area += p.area || 0;
  const cell = Math.max(height / MELT_CELLS, Math.sqrt((area * 1.6) / MELT_BUDGET));
  for (const [s] of melts) {
    s.melt.cell = cell;
    s.melt.budget = Infinity;
  }
  g.userData = { height, parts, ...more };
  return { g, melts };
}

// ── The frame of a man ───────────────────────────────────────────────────────
// Where the joints of a man (a giant, a devil) are, `h` tall, standing on
// y = 0 and facing +z, and the means of putting flesh on them.
//   bulk      how heavy he is (1 is a strong man)
//   lean      how far his back tips forward from the hips (rad); hunch, how
//             far it curls further by the shoulders; crane, the neck beyond
//             that; nod, the head on top
//   turn      which way the head is turned (rad, to his left)
//   hips      where the middle of his hips is, if he is not standing straight
//   shoulders, chest, waist, hipsWide, neck, head   his build, each 1 for a
//             man's; belly, how far it stands out (of his height)
// The hand or foot of a limb goes where it is told and the elbow or knee
// bends toward `pole`.
function man(o) {
  const h = o.h;
  const k = o.bulk ?? 1;
  const lean = o.lean || 0;
  const hunch = o.hunch || 0;
  const chestK = (o.chest ?? 1) * k;
  const neckK = (o.neck ?? 1) * k;
  const up = (a) => [0, Math.cos(a), Math.sin(a)];
  const hips = o.hips || [0, 0.5 * h, 0];
  const waist = along(hips, up(lean), 0.105 * h);
  const chest = along(waist, up(lean + hunch * 0.5), 0.125 * h);
  const collar = along(chest, up(lean + hunch), 0.095 * h);
  const neck = along(collar, up(lean + hunch * 0.7 + (o.crane || 0)), 0.045 * h);
  const pitch = lean * 0.5 + hunch * 0.3 + (o.nod || 0);
  const hh = 0.13 * h * (o.head ?? 1);
  const head = along(neck, up(pitch), hh * 0.45);
  const sw = 0.128 * h * (o.shoulders ?? 1) * Math.sqrt(k);
  const upper = 0.17 * h;
  const fore = 0.15 * h;
  const thigh = 0.235 * h;
  const shin = 0.205 * h;
  const m = {
    h,
    hips,
    waist,
    chest,
    collar,
    neck,
    head,
    hh,
    shoulder: (side) => add(collar, [side * sw, -0.022 * h, 0]),
    hip: (side) => add(hips, [side * 0.052 * h * Math.sqrt(k), -0.02 * h, 0]),
    // the head's own frame: 1 is from chin to crown, its middle at the origin
    headFrame: () => new THREE.Matrix4().compose(new THREE.Vector3(...head), new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, o.turn || 0, 0, 'YXZ')), new THREE.Vector3(hh, hh, hh)),

    torso(s, color, t = {}) {
      const belly = (t.belly ?? o.belly ?? 0) * h;
      const fwd = (p, d) => [p[0], p[1], p[2] + d];
      const pts = [along(hips, up(lean), -0.05 * h), hips, fwd(waist, belly * 0.5), fwd(mix(waist, chest, 0.55), belly * 0.35), chest, collar, mix(collar, neck, 0.28), mix(collar, neck, 0.62), along(neck, up(pitch), 0.01 * h)];
      const hipW = (o.hipsWide ?? 1) * Math.sqrt(k);
      const rad = [
        [0.066 * h * hipW, 0.058 * h * k],
        [0.098 * h * hipW, 0.08 * h * k],
        [0.08 * h * (o.waist ?? 1) * k + belly * 0.5, 0.064 * h * k + belly * 0.5],
        [0.1 * h * chestK + belly * 0.3, 0.08 * h * chestK + belly * 0.3],
        [0.122 * h * chestK, 0.09 * h * chestK],
        [0.1 * h * chestK, 0.068 * h * chestK],
        [0.078 * h * Math.sqrt(neckK * chestK), 0.058 * h * neckK],
        [0.048 * h * neckK, 0.05 * h * neckK],
        [0.038 * h * neckK, 0.042 * h * neckK],
      ];
      s.skin(pts, rad, color, { sides: t.sides || 10, caps: ['round', 'flat'] });
      // (kept, for what is to lie on it: onSkin(...m.trunk); a quarter turn
      // before the full one is his front, f = 0.5 his breast)
      m.trunk = [pts, rad];
      const flat = typeof color === 'function' ? color(4, 0) : color;
      const tilt = { rx: lean + hunch * 0.5 };
      // the breast, and the seat (melted, the muscles under the skin, below)
      if (t.pecs !== false && !s.melt) s.ball(chest[0], chest[1] - 0.004 * h, chest[2] + 0.05 * h * chestK, 0.06 * h * chestK, flat, { sx: 1.7, sy: 0.78, sz: 0.64, ...tilt });
      if (t.seat !== false) for (const side of [-1, 1]) s.ball(hips[0] + side * 0.046 * h * hipW, hips[1] - 0.025 * h, hips[2] - 0.045 * h * k, 0.066 * h * k, flat, { rx: lean });
      if (s.melt && t.muscles !== false) m.muscles(s, flat, t);
      return m;
    },

    // The muscles of his trunk, under a melted skin: breast, belly, flanks,
    // back, the slope of the shoulders. (How much they stand out goes with
    // his bulk; a belly hides the ones over it.)
    muscles(s, color, t = {}) {
      const belly = (t.belly ?? o.belly ?? 0) * h;
      const fwdOf = (a) => [0, -Math.sin(a), Math.cos(a)];
      const fChest = fwdOf(lean + hunch * 0.5);
      const fWaist = fwdOf(lean);
      const cut = Math.max(0, 1 - belly / (0.03 * h)); // a belly hides them
      const deep = 0.09 * h * chestK; // how far the front of his chest is from its middle
      for (const side of [-1, 1]) {
        const x = (v) => [side * v[0], v[1], v[2]];
        // the breast: from the breastbone out to the shoulder, flat to the front
        const pecIn = along(add(chest, [side * 0.02 * h, 0.008 * h, 0]), fChest, deep * 0.86);
        const pecOut = along(add(chest, [side * 0.1 * h * chestK, 0.028 * h, 0]), fChest, deep * 0.5);
        s.muscle(pecIn, pecOut, 0.052 * h * chestK, color, { face: fChest, flat: 0.62 });
        // the belly: three pairs down from the breast, a groove between
        if (cut > 0.2) {
          for (let r = 0; r < 3; r++) {
            const at = mix(chest, waist, 0.42 + r * 0.24);
            const c = along(add(at, [side * 0.026 * h, -0.012 * h, 0]), fWaist, 0.068 * h * k * (1 - r * 0.06));
            s.muscle(add(c, [0, 0.015 * h, 0]), add(c, [0, -0.015 * h, 0]), 0.022 * h * Math.sqrt(k) * cut, color, { face: fWaist, flat: 0.6 });
          }
        }
        // the flank, from under the breast down to the hip
        const ob = add(mix(chest, hips, 0.55), x([0.085 * h * k, 0, 0.01 * h]));
        s.muscle(add(ob, [0, 0.04 * h, 0.01 * h]), add(ob, [0, -0.045 * h, -0.005 * h]), 0.032 * h * k, color, { face: [side, 0, 0.3], flat: 0.6 });
        // the wing of the back, from the armpit to the small of the back
        const lat = add(mix(chest, collar, 0.3), x([0.09 * h * chestK, 0, -0.04 * h]));
        s.muscle(lat, add(mix(waist, chest, 0.2), x([0.045 * h, 0, -0.05 * h])), 0.04 * h * chestK, color, { face: [side, 0, -1], flat: 0.55 });
        // the long muscles either side of the spine
        s.muscle(add(mix(chest, collar, 0.2), x([0.025 * h, 0, -0.07 * h * k])), add(hips, x([0.022 * h, 0.03 * h, -0.05 * h * k])), 0.022 * h * k, color, { face: [0, 0, -1], flat: 0.6 });
        // the slope from the neck to the shoulder
        s.muscle(add(neck, x([0.012 * h, -0.012 * h, -0.012 * h])), add(m.shoulder(side), [-side * 0.03 * h, 0.01 * h, -0.015 * h]), 0.03 * h * neckK, color, { face: [0, 1, -0.3], flat: 0.55 });
      }
      return m;
    },

    // An arm, from the shoulder to where the hand is told to be. -> { elbow, wrist, dir, tip }
    arm(s, side, hand, pole, color, a = {}) {
      const sh = m.shoulder(side);
      const to = hand || add(sh, [side * 0.03 * h, -(upper + fore) * 0.985, 0.02 * h]);
      const { mid: el, end: wr } = reach(sh, to, upper, fore, pole || [side * 0.3, 0, -1]);
      const r = h * k * (a.thick ?? 1);
      s.ball(sh[0], sh[1], sh[2], 0.05 * r, color);
      s.skin([sh, mix(sh, el, 0.16), mix(sh, el, 0.52), el, mix(el, wr, 0.24), mix(el, wr, 0.62), wr], [0.047 * r, 0.052 * r, 0.043 * r, 0.031 * r, 0.038 * r, 0.03 * r, 0.021 * r], color, { sides: a.sides || 7 });
      if (s.melt && a.muscles !== false) {
        // the shoulder's cap; and on the upper arm the one that bends it
        // (on the inside of the bend) and the one that straightens it; and
        // the forearm's, thick by the elbow
        const up = unit(sub(el, sh));
        const bend = unit(sub(mix(sh, wr, 0.5), el)); // toward the inside of the elbow
        const back = mul(bend, -1);
        const outward = unit(sub(sh, m.collar));
        s.muscle(along(sh, outward, 0.018 * r), along(along(sh, up, 0.45 * upper), outward, 0.03 * r), 0.046 * r, color, { face: outward, flat: 0.8 });
        s.muscle(along(along(sh, up, 0.3 * upper), bend, 0.03 * r), along(along(sh, up, 0.86 * upper), bend, 0.022 * r), 0.033 * r, color, { face: bend, flat: 0.85 });
        s.muscle(along(along(sh, up, 0.2 * upper), back, 0.028 * r), along(along(sh, up, 0.8 * upper), back, 0.02 * r), 0.032 * r, color, { face: back, flat: 0.8 });
        const fdir = unit(sub(wr, el));
        s.muscle(along(along(el, fdir, 0.06 * fore), back, 0.012 * r), along(along(el, fdir, 0.55 * fore), back, 0.006 * r), 0.031 * r, color, { face: cross(fdir, bend), flat: 0.85 });
      }
      const dir = unit(sub(wr, el));
      const size = 0.1 * h * (a.handSize ?? 1) * Math.sqrt(k);
      if (a.hand !== 'none') handOn(s, wr, dir, size, a.handColor || color, { pose: a.hand, palm: a.palm, claws: a.claws, side });
      return { shoulder: sh, elbow: el, wrist: wr, dir, tip: along(wr, dir, size * 0.5) };
    },

    // A leg, from the hip to where the sole is told to be. -> { knee, ankle }
    leg(s, side, foot, pole, color, a = {}) {
      const hp = m.hip(side);
      const sole = foot || [side * 0.062 * h, 0, 0];
      const an = add(sole, [0, 0.045 * h, 0]);
      const { mid: kn, end: ank } = reach(hp, an, thigh, shin, pole || [side * 0.15, 0, 1]);
      const r = h * k * (a.thick ?? 1);
      // (the calf stands out behind the shin)
      const back = unit(sub(mix(hp, ank, 0.5), kn));
      s.skin([hp, mix(hp, kn, 0.35), kn, along(mix(kn, ank, 0.26), back, 0.012 * r), mix(kn, ank, 0.62), ank], [0.066 * r, 0.062 * r, 0.041 * r, 0.046 * r, 0.033 * r, 0.025 * r], color, { sides: a.sides || 7 });
      if (s.melt && a.muscles !== false) {
        // the front of the thigh, its teardrop over the inside of the knee,
        // the back of it, the knee cap, the calf's two heads
        const td = unit(sub(kn, hp));
        const front = mul(back, -1);
        const inner = [-side, 0, 0];
        s.muscle(along(along(hp, td, 0.18 * thigh), front, 0.038 * r), along(along(hp, td, 0.82 * thigh), front, 0.026 * r), 0.048 * r, color, { face: front, flat: 0.8 });
        s.muscle(along(along(along(hp, td, 0.62 * thigh), front, 0.012 * r), inner, 0.022 * r), along(along(kn, td, -0.08 * thigh), inner, 0.018 * r), 0.03 * r, color, { face: inner, flat: 0.8 });
        s.muscle(along(along(hp, td, 0.15 * thigh), back, 0.036 * r), along(along(hp, td, 0.8 * thigh), back, 0.026 * r), 0.042 * r, color, { face: back, flat: 0.8 });
        s.muscle(along(kn, front, 0.03 * r), along(along(kn, front, 0.03 * r), td, 0.05 * thigh), 0.018 * r, color, { face: front, flat: 0.7 });
        const sd = unit(sub(ank, kn));
        for (const t of [-1, 1]) s.muscle(along(along(along(kn, sd, 0.1 * shin), back, 0.025 * r), inner, t * 0.01 * r), along(along(along(kn, sd, 0.5 * shin), back, 0.012 * r), inner, t * 0.008 * r), 0.026 * r, color, { face: back, flat: 0.75 });
      }
      if (a.foot !== 'none') {
        const toe = unit(a.toe || [side * 0.25, 0, 1]);
        const fl = 0.15 * h * Math.sqrt(k);
        const fc = a.footColor || color;
        const flat = (d, y) => [ank[0] + toe[0] * d * fl, sole[1] + y * h, ank[2] + toe[2] * d * fl];
        s.skin([flat(-0.22, 0.024), flat(0.2, 0.026), flat(0.6, 0.02), flat(0.84, 0.013)], [[0.024 * r, 0.024 * h], [0.032 * r, 0.026 * h], [0.04 * r, 0.02 * h], [0.04 * r, 0.013 * h]], fc, { sides: 6, dome: 0.5 });
        if (a.claws) {
          const sd = cross([0, 1, 0], toe);
          for (const t of [-1, 0, 1]) {
            const b = along(flat(0.86, 0.016), sd, t * 0.026 * r);
            s.spike(b, add(along(b, toe, 0.04 * h), [sd[0] * t * 0.008 * h, -0.014 * h, sd[2] * t * 0.008 * h]), 0.012 * r, a.claws, { sides: 4 });
          }
        }
      }
      return { hip: hp, knee: kn, ankle: ank };
    },
  };
  return m;
}

// A two-boned limb reaching from a toward c: where its middle joint goes,
// bending toward `pole`, and where its end comes to (c, if it is in reach).
function reach(a, c, l1, l2, pole) {
  const d = sub(c, a);
  const dir = len(d) > 1e-6 ? unit(d) : [0, -1, 0];
  const L = Math.max(Math.abs(l1 - l2) * 1.001, Math.min(len(d), (l1 + l2) * 0.999));
  const x = (l1 * l1 - l2 * l2 + L * L) / (2 * L);
  const y = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  let p = sub(pole, mul(dir, dot(pole, dir)));
  p = len(p) > 1e-6 ? unit(p) : square(dir);
  return { mid: along(along(a, dir, x), p, y), end: along(a, dir, L) };
}

// A hand on the end of a wrist, running on the way the forearm does.
//   pose: 'fist' (the default: closed, or closed on something), 'open'
//         (fingers spread), 'claw' (fingers hooked)
//   palm: the way the palm looks; claws: their colour, if it has them;
//   side: 1 for a left hand, -1 for a right
function handOn(s, wrist, dir, size, color, o = {}) {
  const pose = o.pose || 'fist';
  if (pose === 'fist') {
    s.skin([wrist, along(wrist, dir, size * 0.45), along(wrist, dir, size * 0.8)], [[size * 0.24, size * 0.2], [size * 0.42, size * 0.34], [size * 0.34, size * 0.3]], color, { sides: 6 });
    return;
  }
  let palm = o.palm || square(dir);
  palm = unit(sub(palm, mul(dir, dot(palm, dir))));
  const wide = cross(dir, palm);
  const knuckle = along(wrist, dir, size * 0.5);
  s.skin([wrist, along(wrist, dir, size * 0.28), knuckle], [[size * 0.2, size * 0.12], [size * 0.33, size * 0.12], [size * 0.36, size * 0.1]], color, { sides: 6, side: wide });
  const curl = pose === 'claw' ? 0.75 : 0.18;
  // (the thumb is on the side of the hand toward the body, palm down)
  const inner = -(o.side || 1);
  for (let f = 0; f < 5; f++) {
    // four fingers, then the thumb out at the side
    const thumb = f === 4;
    const across = thumb ? inner * 0.24 : (f - 1.5) * 0.2;
    const from = thumb ? along(along(wrist, dir, size * 0.22), wide, across * size) : along(knuckle, wide, across * size);
    const out = thumb ? unit(along(along(mul(dir, 0.7), wide, inner), palm, 0.35)) : unit(along(dir, wide, across * 0.9));
    const l = size * (thumb ? 0.36 : 0.52 - Math.abs(f - 1.6) * 0.06);
    const mid = along(along(from, out, l * 0.55), palm, l * curl * 0.25);
    const tip = along(along(mid, out, l * 0.45 * (1 - curl * 0.6)), palm, l * curl * 0.6);
    s.skin([from, mid, tip], [size * 0.075, size * 0.065, size * 0.045], color, { sides: 4, caps: ['none', 'flat'] });
    if (o.claws) s.spike(tip, along(along(tip, unit(sub(tip, mid)), size * 0.2), palm, size * 0.08), size * 0.05, o.claws);
  }
}

// A face, in a head's own frame (1 is from chin to crown, the middle of the
// head at the origin, looking along +z).
//   c: { skin, dark (the mouth and the sockets), eye, tooth }
//   o: jaw, brow, nose (each 1 for a man's), open (how far the mouth gapes,
//      0..1), eyes (how hot they are), fangs (how long its teeth)
function face(s, c, o = {}) {
  const jaw = o.jaw ?? 1;
  const brow = o.brow ?? 1;
  const nose = o.nose ?? 1;
  const open = o.open ?? 0;
  const drop = open * 0.17;
  const long = o.long ?? 0; // a longer, heavier lower face
  s.skin(
    [[0, -0.44 - drop - long, 0.17], [0, -0.3 - drop * 0.8 - long * 0.7, 0.1], [0, -0.08, 0.02], [0, 0.14, -0.03], [0, 0.32, -0.06], [0, 0.43, -0.07]],
    [[0.13 * jaw, 0.11], [0.25 * jaw, 0.24], [0.31, 0.36], [0.33, 0.4], [0.29, 0.35], [0.18, 0.23]],
    c.skin,
    { sides: 10, dome: 0.5 },
  );
  // the brow, and the eyes under it in their sockets
  s.skin([[-0.28, 0.1, 0.25], [-0.13, 0.15, 0.37], [0.13, 0.15, 0.37], [0.28, 0.1, 0.25]], 0.058 * brow, c.brow || shade(c.skin, 0.62), { sides: 5 });
  for (const side of [-1, 1]) {
    s.ball(side * 0.14, 0.03, 0.3, 0.09, c.dark);
    s.bead([side * 0.14, 0.03, 0.375], 0.042, c.eye || c.dark, o.eyes || 0);
    if (o.ears !== false) s.ball(side * 0.33, -0.02, -0.04, 0.1, c.skin, { sx: 0.4, sz: 0.7 });
  }
  s.skin([[0, 0.12, 0.35], [0, -0.02, 0.43], [0, -0.13, 0.46]], [0.035 * nose, 0.05 * nose, [0.08 * nose, 0.05 * nose]], c.skin, { sides: 5 });
  // the mouth: a line, or a hole
  const my = -0.27 - drop * 0.55 - long * 0.4;
  const mh = 0.022 + drop * 0.62;
  const mw = 0.115 + 0.035 * open + 0.03 * (jaw - 1);
  s.ball(0, my, 0.265, 1, c.dark, { sx: mw, sy: mh, sz: 0.1, hot: o.maw || 0 });
  if (o.fangs) {
    const tooth = c.tooth || [0.3, 0.28, 0.22];
    for (const x of [-0.75, -0.3, 0.3, 0.75]) {
      const big = Math.abs(x) > 0.5 ? 1 : 0.6;
      s.spike([x * mw, my + mh * 0.85, 0.34], [x * mw, my + mh * 0.85 - 0.09 * o.fangs * big, 0.36], 0.022, tooth);
      s.spike([x * mw * 0.9, my - mh * 0.85, 0.335], [x * mw * 0.9, my - mh * 0.85 + 0.1 * o.fangs * big, 0.365], 0.022, tooth);
    }
  }
}

// The head of a beast, in its own frame: the skull about 0.8 across with its
// middle at the origin, the muzzle running out along +z.
//   c: { skin, dark, eye, tooth, tongue }
//   o: snout (how long it is), wide (how broad), open (how far the jaws
//      gape, rad), eyes (how hot they are), teeth (how long), maw (how hot
//      the gullet), ears: 'up' | 'out' | 'none'
// -> { under(t) }: a point t (0..1) along the underside of the lower jaw
function muzzle(s, c, o = {}) {
  const L = o.snout ?? 0.75;
  const W = o.wide ?? 1;
  const open = o.open ?? 0.5;
  const teeth = o.teeth ?? 1;
  const tooth = c.tooth || TOOTH;
  s.skin([[0, -0.02, -0.46], [0, 0.03, -0.22], [0, 0.06, 0.04], [0, 0.0, 0.26]], [[0.2, 0.2], [0.36, 0.33], [0.39, 0.35], [0.3 * W, 0.24]], c.skin, { sides: 8 });
  // the upper jaw, and the nose on the end of it
  const top = [[0, -0.04, 0.18], [0, -0.07, 0.2 + L * 0.5], [0, -0.1, 0.2 + L]];
  const topR = [[0.27 * W, 0.2], [0.2 * W, 0.14], [0.16 * W, 0.11]];
  s.skin(top, topR, c.skin, { sides: 8, dome: 0.6 });
  s.ball(0, -0.03, 0.26 + L, 0.075 * W, c.dark, { sz: 0.7 });
  // the lower, dropped open on its hinge
  const hinge = [0, -0.2, 0.0];
  const jd = [0, -Math.sin(open), Math.cos(open)];
  const ju = [0, Math.cos(open), Math.sin(open)];
  const jl = 0.2 + L * 0.95;
  const low = [hinge, along(hinge, jd, jl * 0.5), along(hinge, jd, jl)];
  const lowR = [[0.25 * W, 0.11], [0.18 * W, 0.08], [0.13 * W, 0.06]];
  s.skin(low, lowR, c.skin, { sides: 6, dome: 0.6 });
  // the gullet behind, and the tongue lolling
  s.ball(0, -0.15, 0.12, 0.2, c.dark, { sx: 1.1 * W, hot: o.maw || 0 });
  const lick = c.tongue || [0.1, 0.028, 0.026];
  s.skin([along(low[0], ju, 0.09), along(low[1], ju, 0.1), along(low[2], ju, 0.08), add(along(low[2], jd, 0.14), [0.03, -0.1, 0])], [[0.1 * W, 0.03], [0.1 * W, 0.03], [0.08 * W, 0.025], [0.04 * W, 0.015]], lick, { sides: 5 });
  for (const side of [-1, 1]) {
    // teeth down each side of both jaws, the fangs at the front
    for (let i = 0; i < 5; i++) {
      const t = 0.32 + i * 0.16;
      const fang = i === 4 ? 2.4 : 1;
      const cu = mix(top[0], top[2], t);
      const au = (topR[0][0] + (topR[2][0] - topR[0][0]) * t) * 0.8;
      const du = (topR[0][1] + (topR[2][1] - topR[0][1]) * t) * 0.85;
      s.spike([side * au, cu[1] - du, cu[2]], [side * au, cu[1] - du - 0.085 * teeth * fang, cu[2] + 0.015], 0.03, tooth);
      const cl = mix(low[0], low[2], t * 0.97);
      const al = (lowR[0][0] + (lowR[2][0] - lowR[0][0]) * t) * 0.8;
      const dl = (lowR[0][1] + (lowR[2][1] - lowR[0][1]) * t) * 0.8;
      const b = add(along(cl, ju, dl), [side * al, 0, 0]);
      s.spike(b, along(b, ju, 0.075 * teeth * fang), 0.028, tooth);
    }
    // eyes under their brows
    s.bead([side * 0.2 * W, 0.11, 0.24], 0.055, c.eye || c.dark, o.eyes || 0);
    s.skin([[side * 0.07, 0.18, 0.3], [side * 0.2 * W, 0.22, 0.24], [side * 0.33 * W, 0.17, 0.12]], 0.06, c.skin, { sides: 5 });
    if (o.ears === 'up') s.spike([side * 0.26, 0.24, -0.2], [side * 0.36, 0.78, -0.3], 0.14, c.skin, { sides: 4 });
    else if (o.ears === 'out') s.leaf([side * 0.34, 0.1, -0.24], [side * 0.82, 0.02, -0.34], 0.26, [0, 0.4, 1], c.skin);
  }
  // (where the lower jaw hangs, for a beard: a point t along its underside)
  return { under: (t) => along(along(hinge, jd, jl * t), ju, -lowR[0][1] * (1 - 0.4 * t)) };
}

// One of the giants who stand round the well: 26 m of him, a man's shape,
// shaggy, a hide about his loins. `pose` is how he stands (see man);
// dress(s, m, part, legs) gives him his arms and whatever he bears, and says
// what his face is like (see face).
function giant(material, pose, dress) {
  const H = 26;
  return creature(material, H, (s, part) => {
    const stoop = (pose.lean || 0) > 0.3;
    const m = man({ h: H, bulk: 1.2, shoulders: 1.1, chest: 1.1, neck: 1.2, ...pose });
    m.torso(s, GIANT, { sides: 14, seat: false });
    const legs = { L: m.leg(s, 1, [2.6, 0, stoop ? 1.0 : 0.6], [0.3, 0, 1], GIANT, { toe: [0.3, 0, 1] }), R: m.leg(s, -1, [-2.6, 0, stoop ? -3.4 : -0.5], [-0.3, 0, 1], GIANT, { toe: [-0.3, 0, 1] }) };
    drape(s, [add(m.hips, [0, 2.3, 0.3]), m.hips, add(m.hips, [0, -3.2, 0]), add(m.hips, [0, -6.8, 0])], [[2.9, 2.5], [3.6, 3.2], [3.8, 3.5], [4.0, 3.8]], SHAGGY, { ragged: 0.45, n: 18 });
    const looks = dress(s, m, part, legs) || {};
    s.within(m.headFrame(), () => {
      face(s, { skin: GIANT, dark: DARK, eye: [0.05, 0.04, 0.03], tooth: TOOTH }, looks);
      // a shock of hair, and a beard under the mouth
      for (let i = 0; i < 44; i++) {
        const a = (i / 44) * TAU;
        const high = rnd(i + 3);
        const from = [Math.cos(a) * 0.31 * (1 - high * 0.6), 0.16 + 0.3 * high, -0.05 + Math.sin(a) * 0.37 * (1 - high * 0.6)];
        if (from[2] > 0.18 && high < 0.55) continue;
        s.spike(from, add(from, [Math.cos(a) * 0.25, -0.5 * rnd(i) + 0.3 * high - 0.2, Math.sin(a) * 0.25 - 0.12]), 0.14, shade(SHAGGY, 0.7 + 0.7 * rnd(i + 9)));
      }
      const drop = (looks.open || 0) * 0.17 + (looks.long || 0);
      for (let i = 0; i < 11; i++) {
        const x = (i / 10 - 0.5) * 0.46;
        s.spike([x, -0.36 - drop, 0.22 - Math.abs(x) * 0.3], [x * 1.5, -0.8 - drop - 0.35 * rnd(i + 60), 0.2], 0.1, shade(SHAGGY, 0.7 + 0.6 * rnd(i + 70)));
      }
    });
  });
}

// What hangs out of a mouth that is chewing a sinner, from `from` down:
// his legs (the rest of him is inside), or else his body, arms and head,
// hanging head downward. `size` is about how long he is.
function dangling(s, from, size, color, legs) {
  if (legs) {
    for (const side of [-1, 1]) {
      const hip = add(from, [side * 0.09 * size, 0, 0]);
      const knee = add(hip, [side * 0.05 * size, -0.34 * size, 0.2 * size]);
      const foot = add(knee, [side * 0.03 * size, -0.4 * size, -0.12 * size]);
      s.skin([hip, knee, foot], [0.09 * size, 0.062 * size, 0.04 * size], color, { sides: 6 });
      s.skin([foot, add(foot, [0, -0.07 * size, 0.14 * size])], [0.045 * size, 0.03 * size], color, { sides: 5 });
    }
    s.ball(from[0], from[1] + 0.03 * size, from[2] - 0.05 * size, 0.17 * size, color, { sy: 0.8 });
    return;
  }
  const neck = add(from, [0, -0.5 * size, 0.1 * size]);
  s.skin([from, mix(from, neck, 0.55), neck], [[0.15 * size, 0.1 * size], [0.17 * size, 0.11 * size], [0.07 * size, 0.07 * size]], color, { sides: 7 });
  s.ball(neck[0], neck[1] - 0.12 * size, neck[2] + 0.02 * size, 0.11 * size, color);
  for (const side of [-1, 1]) {
    const sh = add(neck, [side * 0.17 * size, 0.06 * size, 0]);
    s.skin([sh, add(sh, [side * 0.07 * size, -0.3 * size, 0.04 * size]), add(sh, [side * 0.03 * size, -0.6 * size, 0.1 * size])], [0.055 * size, 0.04 * size, 0.03 * size], color, { sides: 5 });
  }
}

// name -> (material) -> THREE.Group
const MAKERS = {
  // A plain figure of a man, for whatever has no shape of its own.
  figure(material) {
    const s = new Sculpt();
    s.limb([0, 0.9, 0], [0, 1.5, 0], 0.17, 0.15, FLESH);
    s.ball(0, 1.68, 0, 0.12, FLESH);
    for (const side of [-1, 1]) {
      s.limb([side * 0.09, 0.9, 0], [side * 0.1, 0.05, 0], 0.07, 0.05, FLESH);
      s.limb([side * 0.2, 1.45, 0], [side * 0.24, 0.85, 0], 0.05, 0.04, FLESH);
    }
    const g = new THREE.Group();
    g.add(new THREE.Mesh(s.build(), material));
    g.userData = { height: 1.8, parts: {} };
    return { g, melts: [] };
  },

  // Charon, the ferryman of Acheron: "an old man, hoary with the hair of
  // eld", who "round about his eyes had wheels of flame".
  charon(material) {
    return creature(material, 2.6, (s) => {
      const m = man({ h: 2.62, bulk: 0.72, lean: 0.14, hunch: 0.4, nod: -0.16, shoulders: 1.12, chest: 1.1, waist: 0.86, head: 1.12 });
      m.torso(s, PALE, { pecs: false, seat: false });
      // the oar stands on the ground by his right foot; he holds it high
      const oar = [-0.66, 0, 0.5];
      m.arm(s, -1, [oar[0] + 0.02, 1.8, oar[2]], [-1, -0.6, -0.4], PALE);
      // the other hand held out, beckoning the dead aboard
      m.arm(s, 1, [0.5, 1.3, 0.78], [1, -0.8, -0.5], PALE, { hand: 'open', palm: [0, 1, 0.3] });
      m.leg(s, -1, [-0.2, 0, 0.14], [-0.2, 0, 1], PALE);
      m.leg(s, 1, [0.2, 0, -0.16], [0.3, 0, 1], PALE);
      // a rag about his loins, torn at the hem
      drape(s, [add(m.hips, [0, 0.22, 0.03]), m.hips, add(m.hips, [0, -0.4, 0.0]), add(m.hips, [0, -0.95, 0.0])], [[0.2, 0.16], [0.25, 0.21], [0.27, 0.23], [0.3, 0.26]], RAG, { ragged: 0.55, n: 16 });
      s.within(m.headFrame(), () => {
        face(s, { skin: PALE, dark: DARK, eye: EMBER }, { brow: 1.3, nose: 1.25, jaw: 0.85, eyes: 1, open: 0.3 });
        // the wheels of flame about his eyes
        for (const side of [-1, 1]) {
          s.skin([[side * 0.145, 0.03, 0.33], [side * 0.145, 0.03, 0.352]], 0.1, EMBER, { sides: 8, caps: 'flat', hot: 0.6 });
        }
        // white hair, gone from his crown and long behind, and a beard to his breast
        s.skin([[0, 0.22, -0.2], [0, 0.0, -0.36], [0, -0.4, -0.42], [0, -0.9, -0.4]], [[0.3, 0.2], [0.35, 0.16], [0.31, 0.13], [0.16, 0.06]], HOARY, { sides: 8 });
        for (let i = 0; i < 9; i++) {
          const a = (i / 8 - 0.5) * 2.7;
          const from = [Math.sin(a) * 0.31, -0.3 - 0.3 * rnd(i), -0.08 - Math.cos(a) * 0.3];
          s.spike(from, add(from, [Math.sin(a) * 0.1, -0.6 - 0.4 * rnd(i + 20), -0.06]), 0.08, shade(HOARY, 0.8 + 0.3 * rnd(i + 40)));
        }
        s.skin([[0, -0.22, 0.2], [0, -0.55, 0.3], [0, -1.0, 0.3], [0, -1.55, 0.22]], [[0.27, 0.14], [0.3, 0.15], [0.2, 0.11], [0.03, 0.03]], HOARY, { sides: 8 });
        for (let i = 0; i < 9; i++) {
          const x = (i / 8 - 0.5) * 0.56;
          s.spike([x, -0.5 - 0.5 * rnd(i + 60), 0.36], [x * 1.5, -1.15 - 0.6 * rnd(i + 70), 0.3], 0.07, shade(HOARY, 0.78 + 0.3 * rnd(i + 80)));
        }
      });
      // the oar: a long shaft, the blade uppermost
      s.limb(oar, [oar[0], 3.0, oar[2]], 0.035, 0.03, OLDWOOD, { joints: false });
      s.skin([[oar[0], 2.95, oar[2]], [oar[0], 3.25, oar[2]], [oar[0], 3.85, oar[2]]], [[0.035, 0.03], [0.13, 0.022], [0.11, 0.015]], OLDWOOD, { sides: 6, dome: 2 });
    });
  },

  // The skiff Charon ferries the dead in, and Phlegyas after him: long,
  // dark and narrow, with a high stem at either end. Its origin is the
  // middle of its waterline, the bow toward +z.
  boat(material) {
    const LENGTH = 7; // m, stem to stern
    const BEAM = 1.7;
    const DRAUGHT = 0.3; // m of hull under the water
    const DECK = 0.15; // m above the water: the boards a rider stands on
    return creature(material, 2.1, (s) => {
      // stations from stern to bow: each a rib from one gunwale under the
      // keel to the other
      const N = 15;
      const RIB = 9;
      const half = LENGTH / 2;
      const sheer = (t) => 0.42 + 1.05 * Math.pow(Math.abs(t), 2.6) + (t > 0 ? 0.25 * Math.pow(t, 4) : 0); // gunwale height
      const keel = (t) => -DRAUGHT + (DRAUGHT + 0.5) * Math.pow(Math.abs(t), 3.2); // keel height
      const wide = (t) => (BEAM / 2) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 2.4)), 0.7); // half beam
      const grid = [];
      for (let i = 0; i < N; i++) {
        const t = (i / (N - 1)) * 2 - 1;
        const z = t * half * (1 - 0.06 * Math.abs(t));
        const row = [];
        for (let j = 0; j < RIB; j++) {
          const a = (j / (RIB - 1)) * Math.PI; // from the left gunwale round to the right
          const c = Math.cos(a);
          const sn = Math.sin(a);
          // a rib is flat-floored and steep-sided
          const x = wide(t) * Math.sign(c) * Math.pow(Math.abs(c), 0.55);
          const y = sheer(t) + (keel(t) - sheer(t)) * Math.pow(sn, 0.75);
          row.push([x, y, z]);
        }
        grid.push(row);
      }
      s.sheet(grid, (i, j) => shade(OLDWOOD, 0.8 + 0.35 * rnd(j * 7 + (i >> 2))));
      // the gunwales, and the stem and the stern post standing up and curling over
      for (const j of [0, RIB - 1]) s.skin(grid.map((row) => row[j]), 0.045, WOOD, { sides: 5 });
      s.skin(curve([[0, keel(0.86), half * 0.82], [0, 0.75, half * 0.96], [0, 1.6, half * 1.0], [0, 2.0, half * 0.9], [0, 2.02, half * 0.78]], 9), spread([0.07, 0.075, 0.06, 0.05, 0.075], 9), WOOD, { sides: 6 });
      s.skin(curve([[0, keel(-0.86), -half * 0.82], [0, 0.7, -half * 0.95], [0, 1.4, -half * 0.99], [0, 1.72, -half * 0.9]], 8), spread([0.07, 0.075, 0.06, 0.06], 8), WOOD, { sides: 6 });
      // the keel under her
      s.skin(grid.map((row) => add(row[(RIB - 1) / 2], [0, -0.03, 0])), [0.03, 0.05, 0.05, 0.05, 0.03], WOOD, { sides: 4 });
      // boards to stand on, and thwarts from side to side
      const floor = [];
      for (let i = 2; i < N - 2; i++) {
        const t = (i / (N - 1)) * 2 - 1;
        const z = grid[i][0][2];
        const w = wide(t) * 0.72;
        floor.push([[-w, DECK, z], [w, DECK, z]]);
      }
      s.sheet(floor, (i) => shade(OLDWOOD, 1.1 + 0.3 * rnd(i)));
      for (const t of [-0.5, 0, 0.5]) s.box(0, 0.36, t * half, wide(t) * 1.9, 0.045, 0.24, WOOD);
      return { deck: DECK };
    });
  },

  // Minos, who judges at the way in: "Minos stands horribly, and snarls",
  // and "girds himself with his tail as many times as grades he wishes it
  // should be thrust down".
  minos(material) {
    return creature(material, 4.5, (s) => {
      const H = 4.05; // m to his crown; the horns stand over it
      const m = man({ h: H, bulk: 1.28, lean: 0.06, hunch: 0.18, shoulders: 1.12, chest: 1.12, neck: 1.25, belly: 0.012, head: 1.2, nod: 0.06 });
      m.torso(s, BRUTE, { sides: 12 });
      const hide = shade(BRUTE, 0.88);
      // one hand points the way down; the other holds up the end of his tail
      m.arm(s, 1, [1.15, 1.75, 1.2], [1, 0.2, -0.6], BRUTE, { hand: 'open', palm: [0, -1, 0.2], claws: HORN });
      const hold = m.arm(s, -1, [-1.2, 3.75, 0.95], [-1, -0.5, -0.2], BRUTE);
      m.leg(s, -1, [-0.42, 0, -0.1], [-0.3, 0, 1], hide, { claws: HORN, toe: [-0.35, 0, 1] });
      m.leg(s, 1, [0.44, 0, 0.18], [0.3, 0, 1], hide, { claws: HORN, toe: [0.35, 0, 1] });
      // the tail: from the root of his back twice and more round him, by
      // his loins and his breast, and up before his shoulder to the hand
      const TURNS = 2.55;
      const tail = [add(m.hips, [0, -0.3, -0.42])];
      for (let i = 0; i <= 30; i++) {
        const f = i / 30;
        const ang = -Math.PI / 2 + f * TURNS * TAU; // from behind, round by his left
        const at = mix(add(m.hips, [0, -0.12, 0]), add(m.chest, [0, 0.12, 0]), f);
        const rx = 0.52 + 0.1 * Math.sin(f * Math.PI) + 0.16 * f;
        const rz = 0.42 + 0.12 * f;
        tail.push([Math.cos(ang) * (rx + 0.1), at[1], at[2] + Math.sin(ang) * (rz + 0.1)]);
      }
      const end = hold.tip;
      tail.push(mix(tail[tail.length - 1], end, 0.55), end, add(end, [-0.12, 0.45, 0.2]), add(end, [0.1, 0.8, 0.42]));
      const pts = curve(tail, 72);
      s.skin(pts, spread([0.19, 0.18, 0.165, 0.15, 0.13, 0.11, 0.085, 0.05], 72), (i) => shade(hide, 0.62 + 0.28 * ((i >> 1) & 1)), { sides: 7 });
      // (a barb on the end of it)
      const tip = pts[pts.length - 1];
      s.leaf(tip, add(tip, [0.16, 0.42, 0.26]), 0.34, [1, 0, -0.5], shade(hide, 0.55), 0.3);
      s.within(m.headFrame(), () => {
        face(s, { skin: BRUTE, dark: DARK, eye: EMBER, tooth: TOOTH }, { jaw: 1.4, brow: 1.7, nose: 1.35, open: 0.8, eyes: 0.9, fangs: 1.5, maw: 0.04, long: 0.06 });
        for (const side of [-1, 1]) {
          // horns sweeping out and up, and an ass's ears under them
          s.skin(curve([[side * 0.2, 0.3, -0.05], [side * 0.56, 0.4, -0.1], [side * 0.8, 0.75, -0.02], [side * 0.7, 1.18, 0.14]], 9), spread([0.16, 0.14, 0.09, 0.015], 9), HORN, { sides: 6 });
          s.leaf([side * 0.3, 0.0, -0.06], [side * 0.7, 0.12, -0.24], 0.24, [0, 0.3, 1], hide);
        }
        // a beard like a goat's
        s.skin([[0, -0.52, 0.2], [0, -0.8, 0.26], [0, -1.1, 0.2]], [[0.15, 0.1], [0.12, 0.09], [0.02, 0.02]], shade(HORN, 0.4), { sides: 6 });
      });
    });
  },

  // Cerberus, "monster cruel and uncouth", who "with his three gullets like
  // a dog is barking": "red eyes he has, and unctuous beard and black, and
  // belly large, and armed with claws his hands". head1 is on his right,
  // head2 in the middle, head3 on his left; each turns at the root of its neck.
  cerberus(material) {
    const HIDE = [0.1, 0.078, 0.066];
    const UNDER = [0.145, 0.115, 0.095]; // his belly, paler
    const BEARD = [0.012, 0.011, 0.01];
    return creature(material, 4.1, (s, part) => {
      // the trunk, from the rump to the breast: the belly hangs
      const spine = [[0, 2.15, -2.2], [0, 2.12, -1.6], [0, 1.86, -0.6], [0, 1.95, 0.4], [0, 2.1, 1.1], [0, 2.3, 1.6]];
      const girth = [[0.45, 0.5], [0.8, 0.82], [1.0, 1.1], [0.97, 1.02], [0.9, 0.92], [0.62, 0.66]];
      // (round a body that runs along z, three quarters of the way is underneath)
      s.skin(spine, girth, (i, k) => (k >= 7 && k <= 11 ? UNDER : HIDE), { sides: 12 });
      s.ball(0, 2.72, 1.0, 0.6, HIDE, { sx: 1.25, sz: 1.2 });
      for (const side of [-1, 1]) {
        // forelegs, straight under the shoulder; hind legs, crooked at the hock
        s.ball(side * 0.7, 2.2, 1.12, 0.56, HIDE, { sx: 0.75, sy: 1.25 });
        s.skin([[side * 0.74, 2.25, 1.1], [side * 0.84, 1.4, 0.88], [side * 0.82, 0.55, 1.12], [side * 0.84, 0.2, 1.24]], [0.42, 0.3, 0.2, 0.19], HIDE, { sides: 7 });
        s.ball(side * 0.64, 2.15, -1.45, 0.66, HIDE, { sx: 0.7, sy: 1.2 });
        s.skin([[side * 0.66, 2.2, -1.5], [side * 0.84, 1.32, -1.0], [side * 0.8, 0.66, -1.78], [side * 0.82, 0.2, -1.6]], [0.5, 0.33, 0.17, 0.16], HIDE, { sides: 7 });
        for (const [z, big] of [[1.42, 1.15], [-1.42, 1]]) {
          s.ball(side * 0.84, 0.16, z, 0.3 * big, HIDE, { sy: 0.55, sz: 1.3 });
          for (const t of [-1, 0, 1]) s.spike([side * 0.84 + t * 0.15 * big, 0.14, z + 0.3 * big], [side * 0.84 + t * 0.22 * big, 0.0, z + 0.66 * big], 0.07 * big, TOOTH, { sides: 4 });
        }
      }
      // the tail, low and curling
      s.skin(curve([[0, 2.35, -2.45], [0, 2.1, -3.1], [0.15, 1.5, -3.45], [0.35, 1.15, -3.2], [0.3, 1.25, -2.95]], 12), spread([0.2, 0.15, 0.1, 0.06, 0.03], 12), HIDE, { sides: 6 });
      [-1, 0, 1].forEach((side, n) => {
        const yaw = side * 0.66;
        const root = [Math.sin(yaw) * 0.6, 2.5 - Math.abs(side) * 0.12, 1.3 + Math.cos(yaw) * 0.3];
        const out = unit([Math.sin(yaw), side ? 0.42 : 0.72, Math.cos(yaw)]);
        const at = along(root, out, side ? 1.75 : 1.85);
        const look = [Math.sin(yaw * 1.25), side ? -0.2 : -0.32, Math.cos(yaw * 1.25)];
        part(`head${n + 1}`, root, (h) => {
          h.skin(curve([along(root, out, -0.45), along(root, out, 0.5), add(along(root, out, 1.2), [0, 0.12, 0]), along(at, unit(look), -0.2)], 6), spread([0.66, 0.56, 0.47, 0.4], 6), HIDE, { sides: 8 });
          h.within(facing(at, look, [0, 1, 0], 1.08), () => {
            const jaw = muzzle(h, { skin: HIDE, dark: [0.05, 0.008, 0.006], eye: EMBER }, { snout: 0.8, wide: 1.08, open: 0.62 + 0.1 * side, eyes: 1, teeth: 1.25, maw: 0.12, ears: 'up' });
            // the beard, black and greasy, under the jaw and down the throat
            for (let i = 0; i < 16; i++) {
              const from = add(jaw.under(0.85 - (i / 15) * 0.95), [(rnd(i + n * 30) - 0.5) * 0.34, 0, 0]);
              h.spike(from, add(from, [(rnd(i + 7) - 0.5) * 0.25, -0.34 - 0.32 * rnd(i + 3), 0.06]), 0.085, BEARD);
            }
          });
        });
      });
    });
  },

  // Plutus, "the great enemy", with his clucking voice and "inflated
  // visage": a bloated thing with a wolf's face, squatting on his haunches.
  plutus(material) {
    const HIDE = [0.185, 0.13, 0.085];
    const PELT = [0.07, 0.058, 0.048]; // the wolf of him: head, back and hands
    return creature(material, 3.5, (s) => {
      const m = man({ h: 4.5, hips: [0, 1.12, -0.4], bulk: 1.5, lean: 0.2, hunch: 0.42, belly: 0.1, shoulders: 0.95, chest: 0.95, neck: 1.35, head: 1.5, nod: -0.3, crane: -0.2 });
      m.torso(s, (i, k) => (k >= 1 && k <= 5 && i > 2 ? PELT : HIDE), { sides: 12 });
      for (const side of [-1, 1]) {
        // knees wide and high, and a hand hooked over each
        const leg = m.leg(s, side, [side * 1.2, 0, 0.5], [side, 0.5, 0.45], HIDE, { claws: HORN, toe: [side * 0.6, 0, 1] });
        m.arm(s, side, add(leg.knee, [side * 0.06, 0.26, 0.12]), [side, 0.4, -0.5], HIDE, { hand: 'claw', palm: [0, -1, 0.2], claws: HORN, handColor: PELT, handSize: 1.15 });
      }
      s.within(m.headFrame(), () => {
        const jaw = muzzle(s, { skin: PELT, dark: [0.04, 0.008, 0.006], eye: EMBER }, { snout: 0.5, wide: 1.25, open: 0.5, eyes: 0.9, teeth: 1.1, maw: 0.05, ears: 'up' });
        for (const side of [-1, 1]) {
          // the cheeks blown out, and the jowls under them
          s.ball(side * 0.34, -0.12, 0.18, 0.28, HIDE, { sy: 0.95, sz: 0.85, fine: true });
          s.ball(side * 0.24, -0.42, 0.06, 0.24, HIDE);
        }
        const chin = jaw.under(0.2);
        s.ball(0, chin[1] - 0.12, chin[2], 0.3, HIDE, { sx: 1.2 });
        // a ruff of coarse hair round the neck
        for (let i = 0; i < 14; i++) {
          const a = (i / 13 - 0.5) * 4.4;
          const from = [Math.sin(a) * 0.42, 0.0 - 0.1 * rnd(i), -0.2 - Math.cos(a) * 0.3];
          s.spike(from, add(from, [Math.sin(a) * 0.3, -0.45 - 0.25 * rnd(i + 11), -Math.cos(a) * 0.3 - 0.1]), 0.13, shade(PELT, 0.8 + 0.4 * rnd(i + 5)));
        }
      });
      // a wolf's brush behind him, on the ground
      const brush = curve([[0, 0.95, -0.95], [0.1, 0.45, -1.6], [0.5, 0.2, -2.1], [1.15, 0.16, -2.3]], 9);
      s.skin(brush, spread([0.16, 0.2, 0.17, 0.04], 9), PELT, { sides: 6 });
      for (let i = 0; i < 14; i++) {
        const from = brush[2 + (i % 6)];
        s.spike(from, add(from, [0.25 + 0.2 * rnd(i), 0.3 * (rnd(i + 3) - 0.3), -0.25 + 0.5 * rnd(i + 6)]), 0.12, shade(PELT, 0.7 + 0.6 * rnd(i + 9)));
      }
    });
  },

  // Phlegyas, the boatman of Styx, who comes over the marsh crying "Now art
  // thou arrived, fell soul?", and is cheated of his anger: lean, leaning on
  // his pole, his mouth open in a shout.
  phlegyas(material) {
    const SKIN = [0.19, 0.145, 0.115];
    const HAIR = [0.03, 0.022, 0.018];
    return creature(material, 2.8, (s) => {
      const m = man({ h: 2.95, hips: [0, 1.36, -0.3], bulk: 0.8, lean: 0.5, hunch: 0.22, nod: -0.5, shoulders: 1.1, chest: 1.05, waist: 0.9, head: 1.12, turn: 0.25 });
      m.torso(s, SKIN, { seat: false });
      // the pole, planted ahead of him, and both hands on it
      const foot = [-0.5, 0, 1.5];
      const top = [-0.62, 4.3, 0.05];
      const on = (t) => mix(foot, top, t);
      m.arm(s, -1, on(0.6), [-1, -0.2, -0.5], SKIN);
      m.arm(s, 1, on(0.44), [1, -0.6, -0.3], SKIN);
      s.limb(foot, top, 0.045, 0.032, OLDWOOD, { joints: false });
      // one leg under him, the other thrust out behind
      m.leg(s, 1, [0.26, 0, 0.5], [0.2, 0, 1], SKIN);
      m.leg(s, -1, [-0.3, 0, -1.0], [-0.2, 0, 1], SKIN);
      drape(
        s,
        [add(m.hips, [0, 0.24, 0.1]), m.hips, add(m.hips, [0, -0.4, -0.05]), add(m.hips, [0, -0.85, -0.08])],
        [[0.24, 0.2], [0.29, 0.25], [0.33, 0.33], [0.36, 0.4]],
        RAG,
        { ragged: 0.6, n: 16, seed: 4 },
      );
      s.within(m.headFrame(), () => {
        face(s, { skin: SKIN, dark: [0.03, 0.006, 0.005], eye: EMBER, tooth: TOOTH }, { brow: 1.5, nose: 1.15, jaw: 1.05, open: 1, eyes: 0.6, fangs: 0.6, maw: 0.04 });
        // hair and beard flying back from his face, like flames
        for (let i = 0; i < 22; i++) {
          const a = (i / 21 - 0.5) * 3.6;
          const up = 0.1 + 0.42 * rnd(i + 2);
          const from = [Math.sin(a) * 0.3, up, -0.05 - Math.cos(a) * 0.12];
          s.spike(from, add(from, [Math.sin(a) * 0.3, 0.2 + 0.45 * rnd(i), -0.5 - 0.5 * rnd(i + 9)]), 0.11, shade(HAIR, 0.8 + 0.5 * rnd(i + 4)));
        }
        for (let i = 0; i < 7; i++) {
          const x = (i / 6 - 0.5) * 0.4;
          s.spike([x, -0.62, 0.2], [x * 1.6, -0.95 - 0.2 * rnd(i), 0.02], 0.08, HAIR);
        }
      });
    });
  },

  // One of the three Furies on the tower of Dis, "who had the limbs of
  // women and their mien, and with the greenest hydras were begirt; small
  // serpents and cerastes were their tresses". "Each one her breast was
  // rending with her nails."
  fury(material) {
    const SKIN = [0.2, 0.18, 0.17];
    const BLOOD = [0.13, 0.01, 0.008];
    const HYDRA = [0.04, 0.095, 0.03];
    const ROBE = [0.032, 0.028, 0.038];
    return creature(material, 2.4, (s) => {
      const m = man({ h: 2.3, bulk: 0.78, lean: -0.08, hunch: 0.1, nod: -0.4, shoulders: 0.9, chest: 0.92, waist: 0.8, hipsWide: 1.25, head: 1.04 });
      m.torso(s, SKIN, { pecs: false, seat: false });
      const on = onSkin(...m.trunk);
      const FRONT = 0.75 * TAU;
      for (const side of [-1, 1]) {
        const at = on(0.47, FRONT + side * 0.55);
        s.ball(at.p[0], at.p[1], at.p[2] + 0.02, 0.1, SKIN, { sy: 1.1 });
        // her hands at her breast, the elbows high; and the blood she has drawn
        const claw = on(side > 0 ? 0.52 : 0.6, FRONT + side * 0.3);
        m.arm(s, side, along(claw.p, claw.n, 0.07), [side, 0.7, -0.1], SKIN, { hand: 'claw', palm: mul(claw.n, -1), claws: shade(BLOOD, 0.6), handColor: mix(SKIN, BLOOD, 0.7) });
        for (let i = 0; i < 3; i++) {
          const ang = FRONT + side * (0.12 + i * 0.26);
          const reach = 0.2 + 0.14 * rnd(i + side);
          const strip = [];
          for (let j = 0; j <= 4; j++) {
            const f = 0.56 - j * 0.07 * (1 + reach);
            const a = on(f, ang - 0.05);
            const b = on(f, ang + 0.05 * (j < 4 ? 1 : -0.6));
            strip.push([along(a.p, a.n, 0.012), along(b.p, b.n, 0.012)]);
          }
          s.sheet(strip, BLOOD);
        }
      }
      // a dark robe from her hips to the ground, and her feet under the hem of it
      drape(
        s,
        [add(m.hips, [0, 0.14, 0]), add(m.hips, [0, -0.12, 0]), [0, 0.55, 0], [0, 0.02, 0.02]],
        [[0.2, 0.15], [0.27, 0.21], [0.33, 0.3], [0.5, 0.46]],
        (i) => (rnd(i % 16) > 0.8 ? mix(ROBE, BLOOD, 0.22) : shade(ROBE, 0.7 + 0.6 * rnd((i % 16) + 3))),
        { ragged: 0.14, n: 16, seed: 2 },
      );
      for (const side of [-1, 1]) {
        s.skin([[side * 0.13, 0.05, 0.3], [side * 0.15, 0.04, 0.5]], [[0.05, 0.045], [0.06, 0.025]], SKIN, { sides: 6 });
      }
      // the hydras she is girt with: two, wound about her waist, rearing in front
      for (const way of [-1, 1]) {
        const body = [];
        const N = 22;
        const lift = way > 0 ? 0 : 0.03;
        const rear = FRONT + way * 0.75;
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          const at = on(0.135 + lift + 0.1 * t, rear - way * (1 - t) * 1.4 * TAU);
          body.push(along(at.p, at.n, 0.04));
        }
        const end = on(0.24 + lift, rear);
        const neck = add(along(end.p, end.n, 0.13), [0, 0.07, 0]);
        const head = add(along(end.p, end.n, 0.24), [way * 0.04, 0.17, 0]);
        body.push(neck, head);
        s.skin(body, spread([0.015, 0.045, 0.055, 0.055, 0.05, 0.036], body.length), (i) => shade(HYDRA, i % 3 ? 1 : 0.5), { sides: 6 });
        s.within(facing(head, [end.n[0] + way * 0.2, 0.3, end.n[2]], [0, 1, 0], 1), () => {
          s.skin([[0, 0, -0.02], [0, 0, 0.06], [0, -0.005, 0.13]], [[0.04, 0.035], [0.058, 0.036], [0.03, 0.02]], HYDRA, { sides: 6 });
          for (const side of [-1, 1]) s.bead([side * 0.04, 0.028, 0.07], 0.014, EMBER, 0.9);
        });
      }
      s.within(m.headFrame(), () => {
        face(s, { skin: SKIN, dark: [0.03, 0.005, 0.005], eye: EMBER, tooth: TOOTH }, { brow: 1.1, nose: 0.9, jaw: 0.85, open: 0.95, eyes: 0.7, maw: 0.02 });
        // her hair: small serpents, every one alive
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU + rnd(i) * 0.3;
          const high = 0.25 + 0.75 * rnd(i + 7);
          const d = unit([Math.cos(a) * (1.1 - high * 0.6), 0.25 + high, Math.sin(a) * (1.1 - high * 0.6) - 0.35]);
          const from = [d[0] * 0.27, 0.12 + d[1] * 0.3, -0.05 + d[2] * 0.33];
          const sway = [Math.sin(i * 2.4) * 0.26, 0, Math.cos(i * 1.7) * 0.26];
          const sink = -0.5 * (1 - high);
          const out = (far, k, y) => add(along(from, d, far), [sway[0] * k, sink * y, sway[2] * k]);
          const line = curve([from, out(0.28, 0, 0), out(0.5, 1, 0.4), out(0.72, -0.6, 0.9), add(out(0.95, 0.8, 1.2), [0, 0.12, 0])], 8);
          s.skin(line, spread([0.075, 0.065, 0.055, 0.05], 8), shade(HYDRA, 0.55 + 0.6 * rnd(i + 3)), { sides: 5, caps: ['flat', 'flat'] });
          s.bead(line[7], 0.07, shade(HYDRA, 0.9), 0);
        }
      });
    });
  },

  // The Minotaur, "the infamy of Crete", on the broken rocks above the
  // river of blood: a bull's head and horns on a heavy man's body, who "like
  // one whom anger racks within" plunges this way and that.
  minotaur(material) {
    const HIDE = [0.17, 0.11, 0.08];
    const BULL = [0.062, 0.048, 0.04];
    return creature(material, 3.6, (s) => {
      const m = man({ h: 4.45, hips: [0, 1.7, -0.35], bulk: 1.36, lean: 0.6, hunch: 0.25, shoulders: 1.14, chest: 1.16, neck: 1.75, crane: 0.35 });
      m.torso(s, (i) => (i >= 5 ? BULL : HIDE), { sides: 12 });
      // he lunges: one leg bent under him, one driving behind, both arms out to seize
      m.leg(s, 1, [0.48, 0, 0.62], [0.3, 0, 1], HIDE, { toe: [0.25, 0, 1], footColor: BULL });
      m.leg(s, -1, [-0.44, 0, -1.4], [-0.25, 0, 1], HIDE, { toe: [-0.25, 0, 1], footColor: BULL });
      m.arm(s, 1, [1.55, 1.75, 1.75], [1, -0.2, -0.7], HIDE, { hand: 'claw', palm: [-0.5, -0.4, 0.6], claws: HORN, handSize: 1.15 });
      m.arm(s, -1, [-1.35, 2.75, 1.95], [-1, 0.3, -0.5], HIDE, { hand: 'claw', palm: [0.4, -0.6, 0.5], claws: HORN, handSize: 1.15 });
      // the hump of the neck, rough with hair
      const hump = add(m.collar, [0, 0.2, -0.28]);
      s.ball(hump[0], hump[1], hump[2], 0.62, BULL, { sx: 1.25, sy: 0.85, rx: 0.8, fine: true });
      for (let i = 0; i < 26; i++) {
        const a = (i / 25 - 0.5) * 3.0;
        const b = rnd(i) * 1.2 - 0.3;
        const from = add(hump, [Math.sin(a) * 0.7, 0.35 * Math.cos(a) * Math.cos(b), -0.45 * Math.cos(a) + 0.5 * Math.sin(b)]);
        s.spike(from, add(from, [Math.sin(a) * 0.25, -0.2 - 0.25 * rnd(i + 3), -0.3]), 0.12, shade(BULL, 0.7 + 0.5 * rnd(i + 8)));
      }
      // the head, low and thrust out, the horns leading
      const at = add(m.neck, [0, 0.12, 0.42]);
      s.skin([add(m.collar, [0, -0.05, 0.05]), mix(m.collar, at, 0.5), along(at, [0, 0.3, -1], 0.1)], [[0.52, 0.5], [0.46, 0.44], [0.4, 0.38]], BULL, { sides: 8 });
      s.within(facing(at, [0, -0.5, 1], [0, 1, 0], 1.1), () => {
        muzzle(s, { skin: BULL, dark: [0.05, 0.008, 0.006], eye: EMBER }, { snout: 0.62, wide: 1.4, open: 0.4, eyes: 1, teeth: 0.5, maw: 0.06, ears: 'out' });
        for (const side of [-1, 1]) {
          s.skin(curve([[side * 0.3, 0.22, -0.12], [side * 0.72, 0.3, -0.1], [side * 0.98, 0.52, 0.18], [side * 0.86, 0.62, 0.62]], 9), spread([0.15, 0.13, 0.09, 0.012], 9), TOOTH, { sides: 6 });
          // the nostrils, smoking hot
          s.bead([side * 0.09, -0.03, 0.9], 0.035, EMBER, 0.25);
        }
      });
      // a bull's tail, lashing
      const tail = curve([[0, 1.62, -0.85], [-0.1, 1.5, -1.45], [-0.45, 1.9, -1.95], [-0.75, 2.5, -1.9]], 9);
      s.skin(tail, spread([0.1, 0.07, 0.05, 0.04], 9), HIDE, { sides: 5 });
      for (let i = 0; i < 5; i++) s.spike(tail[8], add(tail[8], [-0.2 + 0.25 * rnd(i), 0.3 + 0.2 * rnd(i + 3), 0.2 * rnd(i + 5) - 0.1]), 0.07, BULL);
    });
  },

  // A centaur of the troop that keeps the river of blood, "armed with
  // arrows, as in the world they used the chase to follow": a horse's body
  // and legs, a man's breast and arms and head, the bow in his left hand.
  // The legs swing from the shoulder and the hip, the right arm from its
  // shoulder.
  centaur(material) {
    const SKIN = [0.2, 0.15, 0.115];
    const COAT = [0.115, 0.074, 0.048];
    const BLACK = [0.022, 0.018, 0.016];
    const LEATHER = [0.06, 0.04, 0.025];
    return creature(material, 2.7, (s, part) => {
      // the horse of him: barrel, shoulders and quarters
      s.skin(
        [[0, 1.3, -1.32], [0, 1.27, -1.0], [0, 1.16, -0.25], [0, 1.17, 0.4], [0, 1.27, 0.8], [0, 1.42, 1.0]],
        [[0.2, 0.26], [0.37, 0.45], [0.4, 0.46], [0.38, 0.48], [0.33, 0.46], [0.25, 0.34]],
        COAT,
        { sides: 10 },
      );
      for (const side of [-1, 1]) {
        s.ball(side * 0.24, 1.3, -0.95, 0.42, COAT, { sx: 0.62, sy: 1.1 });
        s.ball(side * 0.22, 1.25, 0.7, 0.34, COAT, { sx: 0.62, sy: 1.15 });
      }
      for (const [name, side, front] of [['legFL', 1, true], ['legFR', -1, true], ['legBL', 1, false], ['legBR', -1, false]]) {
        const x = side * (front ? 0.23 : 0.25);
        const pivot = front ? [x, 1.12, 0.72] : [x, 1.18, -0.95];
        part(name, pivot, (l) => {
          // down to the knee (or the hock, which is crooked), the cannon, the fetlock, the hoof
          if (front) l.skin([pivot, [x, 0.9, 0.74], [x, 0.64, 0.76], [x, 0.56, 0.76], [x, 0.21, 0.74], [x, 0.13, 0.77]], [0.18, 0.13, 0.085, 0.07, 0.055, 0.07], COAT, { sides: 6 });
          else l.skin([pivot, [x, 0.98, -1.1], [x, 0.74, -1.24], [x, 0.64, -1.27], [x, 0.23, -1.14], [x, 0.14, -1.11]], [0.25, 0.16, 0.095, 0.078, 0.058, 0.072], COAT, { sides: 6 });
          const hz = front ? 0.79 : -1.09;
          l.skin([[x, 0.12, hz], [x, 0.0, hz + 0.03]], [[0.075, 0.08], [0.1, 0.105]], BLACK, { sides: 7, caps: ['none', 'flat'] });
        });
      }
      const dock = curve([[0, 1.5, -1.55], [0, 1.5, -1.95], [0, 1.05, -2.25], [0.06, 0.5, -2.15]], 8);
      s.skin(dock, spread([0.08, 0.15, 0.15, 0.04], 8), BLACK, { sides: 6 });
      for (let i = 0; i < 8; i++) s.spike(dock[3 + (i % 4)], add(dock[3 + (i % 4)], [0.3 * (rnd(i) - 0.5), -0.3 - 0.2 * rnd(i + 4), -0.1 - 0.2 * rnd(i + 9)]), 0.09, BLACK);

      // the man of him
      const m = man({ h: 2.08, hips: [0, 1.56, 0.84], bulk: 1.08, lean: -0.05, hunch: 0.08, shoulders: 1.08, chest: 1.08, turn: 0.3, nod: 0.04 });
      m.torso(s, (i) => (i <= 1 ? COAT : SKIN), { seat: false });
      // the bow, held out in the left hand
      const grip = [0.52, 2.24, 1.4];
      m.arm(s, 1, grip, [1, -1, -0.2], SKIN);
      const bow = [add(grip, [0.03, 0.86, -0.3]), add(grip, [0.02, 0.48, 0.0]), add(grip, [0.02, 0, 0.09]), add(grip, [0.02, -0.48, 0.0]), add(grip, [0.03, -0.86, -0.3])];
      s.skin(curve(bow, 11), spread([0.012, 0.024, 0.03, 0.024, 0.012], 11), WOOD, { sides: 5 });
      s.limb(bow[0], bow[4], 0.006, 0.006, HOARY, { joints: false, sides: 3 });
      // the right arm, an arrow in its hand
      const sh = m.shoulder(-1);
      part('armR', sh, (a) => {
        const hand = m.arm(a, -1, [sh[0] - 0.14, sh[1] - 0.42, sh[2] + 0.36], [-1, -0.2, -0.8], SKIN);
        const nock = add(hand.tip, [0.02, 0.05, -0.38]);
        const point = add(hand.tip, [-0.04, -0.1, 0.52]);
        a.limb(nock, point, 0.011, 0.011, WOOD, { joints: false, sides: 4 });
        a.spike(point, along(point, unit(sub(point, nock)), 0.12), 0.03, IRON, { sides: 4 });
        a.leaf(nock, along(nock, unit(sub(point, nock)), 0.2), 0.09, [1, 0, 0], HOARY);
      });
      // the quiver slung on his back, full
      const back = add(m.chest, [0, 0, -0.24]);
      const mouth = add(back, [-0.24, 0.4, -0.03]);
      const foot = add(back, [0.2, -0.3, 0.0]);
      s.skin([foot, mouth], [0.075, 0.09], LEATHER, { sides: 7, caps: ['round', 'flat'] });
      for (let i = 0; i < 5; i++) {
        const from = add(mouth, [0.05 * (rnd(i) - 0.5), 0, 0.05 * (rnd(i + 3) - 0.5)]);
        const to = along(from, unit(sub(mouth, foot)), 0.2 + 0.08 * rnd(i + 6));
        s.limb(from, to, 0.008, 0.008, WOOD, { joints: false, sides: 3 });
        s.leaf(mix(from, to, 0.35), along(to, unit(sub(mouth, foot)), 0.03), 0.08, [rnd(i) - 0.5, 0, 1], HOARY);
      }
      // (and the strap of it across his breast)
      const on = onSkin(...m.trunk);
      const strap = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const at = on(0.26 + 0.36 * t, TAU - (Math.PI + 0.35) * t + 0.2);
        strap.push(along(at.p, at.n, 0.012));
      }
      s.skin(strap, [[0.035, 0.012]], LEATHER, { sides: 4, caps: 'none' });
      s.within(m.headFrame(), () => {
        face(s, { skin: SKIN, dark: DARK, eye: [0.06, 0.04, 0.03] }, { brow: 1.25, nose: 1.1, jaw: 1.1 });
        // a head of dark hair, and a beard
        s.skin([[0, 0.2, 0.2], [0, 0.42, -0.02], [0, 0.3, -0.3], [0, -0.05, -0.42], [0, -0.42, -0.36]], [[0.26, 0.08], [0.32, 0.12], [0.35, 0.16], [0.33, 0.14], [0.2, 0.08]], BLACK, { sides: 8 });
        s.skin([[0, -0.2, 0.22], [0, -0.5, 0.26], [0, -0.78, 0.2]], [[0.26, 0.13], [0.2, 0.13], [0.05, 0.04]], BLACK, { sides: 7 });
      });
    });
  },

  // A harpy of the wood of the suicides: "broad wings have they, and necks
  // and faces human, and feet with claws, and their great bellies
  // fledged with feathers". Perched and hunched. Each wing hangs folded
  // from its shoulder and opens as rotation.z grows.
  harpy(material) {
    const PLUME = [0.1, 0.085, 0.095];
    const DOWN = [0.21, 0.18, 0.15]; // the feathers of her belly, paler
    const SKIN = [0.23, 0.2, 0.18];
    const SHANK = [0.1, 0.08, 0.045];
    const HAIR = [0.022, 0.02, 0.02];
    const CLAW = [0.02, 0.018, 0.016];
    return creature(material, 1.3, (s, part) => {
      // from the root of the tail, under the belly and up the breast to the neck
      const spine = [[0, 0.44, -0.4], [0, 0.48, -0.22], [0, 0.56, 0.04], [0, 0.78, 0.13], [0, 0.94, 0.1], [0, 1.03, 0.14], [0, 1.1, 0.2]];
      const girth = [[0.1, 0.08], [0.24, 0.22], [0.32, 0.31], [0.25, 0.24], [0.17, 0.15], [0.07, 0.07], [0.055, 0.055]];
      s.skin(spine, girth, (i, k) => (i >= 5 ? SKIN : k >= 6 && k <= 9 ? DOWN : PLUME), { sides: 10, caps: ['round', 'flat'] });
      // feathers down the breast and the belly, row under row
      const on = onSkin(spine, girth);
      for (let row = 0; row < 6; row++) {
        const many = 7 + (row % 2);
        for (let i = 0; i < many; i++) {
          const at = on(0.62 - row * 0.085, 0.75 * TAU + ((i + 0.5) / many - 0.5) * 2.7);
          s.leaf(along(at.p, at.n, 0.008), add(along(at.p, at.t, -0.15), mul(at.n, 0.024)), 0.13, at.n, shade(DOWN, 0.82 + 0.3 * rnd(row * 9 + i)), 0.45);
        }
      }
      for (const side of [-1, 1]) {
        // a feathered thigh, a scaly shank, and a foot that grips: three claws before and one behind
        s.skin([[side * 0.15, 0.44, 0.02], [side * 0.16, 0.2, 0.08]], [0.12, 0.05], DOWN, { sides: 6 });
        s.skin([[side * 0.16, 0.22, 0.08], [side * 0.16, 0.05, 0.06]], [0.032, 0.03], SHANK, { sides: 5 });
        for (const [dx, dz] of [[-0.45, 1], [0, 1.1], [0.45, 1], [0, -0.8]]) {
          const knuckle = [side * 0.16 + dx * 0.11, 0.045, 0.06 + dz * 0.13];
          s.skin([[side * 0.16, 0.05, 0.06], knuckle], [0.03, 0.022], SHANK, { sides: 4 });
          s.spike(knuckle, [knuckle[0] + dx * 0.05, 0.0, knuckle[2] + dz * 0.09], 0.02, CLAW, { sides: 4 });
        }
      }
      // the fan of her tail
      for (let i = -3; i <= 3; i++) {
        const from = [i * 0.03, 0.46, -0.42];
        s.leaf(from, [i * 0.17, 0.2 + Math.abs(i) * 0.03, -0.98 + Math.abs(i) * 0.07], 0.2, [0, 1, 0.3], shade(PLUME, 0.8 + 0.5 * rnd(i + 5)), 0.6);
      }
      s.within(new THREE.Matrix4().compose(new THREE.Vector3(0, 1.19, 0.26), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0, 0)), new THREE.Vector3(0.21, 0.21, 0.21)), () => {
        face(s, { skin: SKIN, dark: DARK, eye: EMBER, tooth: TOOTH }, { brow: 1.3, nose: 1.5, jaw: 0.8, open: 0.55, eyes: 0.5, fangs: 0.5 });
        // lank hair hanging by her face
        for (let i = 0; i < 11; i++) {
          const a = (i / 10 - 0.5) * 4.2;
          const from = [Math.sin(a) * 0.3, 0.26 - 0.1 * Math.abs(Math.sin(a)), -0.08 - Math.cos(a) * 0.3];
          s.spike(from, add(from, [Math.sin(a) * 0.14, -0.75 - 0.4 * rnd(i), -0.06 - 0.1 * Math.cos(a)]), 0.12, shade(HAIR, 0.8 + 0.6 * rnd(i + 3)));
        }
        s.skin([[0, 0.2, 0.18], [0, 0.44, -0.04], [0, 0.26, -0.34]], [[0.25, 0.08], [0.31, 0.1], [0.33, 0.14]], HAIR, { sides: 7 });
      });
      for (const side of [-1, 1]) {
        const pivot = [side * 0.22, 0.94, 0.03];
        const TILT = 0.36; // rad the folded wing stands off from the flank
        const down = [side * Math.sin(TILT), -Math.cos(TILT), 0];
        // (the two of them close in behind her, over the tail)
        const back = unit([-side * 0.3, 0, -1]);
        const out = mul(cross(down, back), side);
        // which way a feather points: 0 is down the wing, a quarter turn is back
        const aim = (a) => along(mul(down, Math.cos(a)), back, Math.sin(a));
        part(
          side > 0 ? 'wingL' : 'wingR',
          pivot,
          (w) => {
            const wrist = along(along(pivot, down, 0.4), back, 0.04);
            w.skin([pivot, mix(pivot, wrist, 0.5), wrist], [0.06, 0.045, 0.03], PLUME, { sides: 5 });
            // the long feathers of the hand, then those of the arm, each a little over the last
            for (let i = 0; i < 11; i++) {
              const hand = i < 5;
              const from = along(hand ? wrist : along(pivot, down, 0.4 - (i - 5) * 0.075), out, (i - 5) * 0.004);
              const a = hand ? -0.1 + i * 0.17 : 0.84 + (i - 5) * 0.13;
              const reach = hand ? 0.56 - i * 0.01 : 0.88 - (i - 5) * 0.07;
              w.leaf(from, along(along(from, aim(a), reach), out, (i - 5) * 0.004), 0.23, out, shade(PLUME, 0.75 + 0.5 * rnd(i + 2)), 0.55);
            }
            // and the small ones that cover their roots
            for (let i = 0; i < 7; i++) {
              const from = along(along(pivot, down, 0.02 + i * 0.065), out, 0.03);
              w.leaf(from, along(along(from, aim(0.75 + i * 0.05), 0.3), out, 0.01), 0.14, out, shade(DOWN, 0.6 + 0.3 * rnd(i + 20)), 0.5);
            }
          },
          side > 0 ? {} : { basis: mirrored(new THREE.Matrix4()) },
        );
      }
    });
  },

  // Geryon, "that uncleanly image of deceit": "the face was as the face of
  // a just man", and "of a serpent all the trunk beside"; "two paws it had,
  // hairy unto the armpits; the back, and breast, and both the sides it had
  // depicted o'er with nooses and with shields"; and a tail whose "venomous
  // fork ... in guise of scorpion armed its point". He is posed flying level
  // toward +z, and his origin is the middle of his back, where the second
  // rider sits; userData.seat is on his shoulders, for the first. `height`
  // is how far his tail stands over his back, `length` all of him.
  geryon(material) {
    const HIDE = [0.15, 0.112, 0.058];
    const UNDER = [0.2, 0.165, 0.105];
    const FUR = [0.05, 0.038, 0.028];
    const SKIN = [0.2, 0.16, 0.13];
    const PAINT = [[0.17, 0.03, 0.022], [0.035, 0.08, 0.1], [0.24, 0.17, 0.05], [0.25, 0.23, 0.19]];
    const SEAT = [0, 0.03, 4.3];
    return creature(material, 4.4, (s, part) => {
      // the trunk, from where the tail leaves it to the neck: a serpent's, broadest at the shoulders
      const line = curve([[0.15, -0.72, -5.6], [-0.1, -0.85, -4.6], [-0.35, -0.95, -2.6], [0, -1.0, 0], [0.15, -1.08, 2.6], [0, -1.0, 4.4], [0, -0.7, 5.6], [0, 0.1, 6.75]], 22);
      const girth = spread([[0.72, 0.64], [0.85, 0.75], [1.05, 0.9], [1.25, 1.0], [1.45, 1.08], [1.4, 1.0], [1.02, 0.82], [0.68, 0.64]], 22);
      s.skin(line, girth, (i, k) => (k >= 7 && k <= 11 ? shade(UNDER, i % 2 ? 1 : 0.82) : HIDE), { sides: 12 });
      // what is painted on him: shields on his sides, nooses on his back and his breast
      const on = onSkin(line, girth);
      let n = 0;
      for (let j = 0; j < 7; j++) {
        const f = 0.07 + j * 0.118;
        const size = 0.3 + 0.16 * Math.sin(f * Math.PI);
        for (const ang of [0.2, Math.PI - 0.2]) {
          const at = on(f, ang + (j % 2 ? 0.3 : -0.1));
          const c = PAINT[(n + j) % 4];
          const c2 = PAINT[(n++ + j + 2) % 4];
          s.skin([along(at.p, at.n, -0.12), along(at.p, at.n, 0.03)], size, c, { sides: 9, caps: ['none', 'flat'] });
          s.skin([along(at.p, at.n, 0.0), along(at.p, at.n, 0.06)], size * 0.6, c2, { sides: 9, caps: ['none', 'flat'] });
          s.skin([along(at.p, at.n, 0.05), along(at.p, at.n, 0.11)], size * 0.22, c, { sides: 5, caps: ['none', 'flat'] });
        }
        for (const ang of [Math.PI / 2 + (j % 2 ? 0.5 : -0.5), -Math.PI / 2 + (j % 2 ? -0.4 : 0.4)]) {
          const at = on(f + 0.045, ang);
          const across = cross(at.n, at.t);
          const loop = [];
          for (let q = 0; q <= 9; q++) {
            const a = (q / 9) * TAU;
            const flat = along(mul(at.t, Math.cos(a) * size), across, Math.sin(a) * size * 0.8);
            // (it lies on a round body: its rim sits lower than its middle)
            loop.push(add(along(at.p, at.n, 0.05 - 0.09 * size), flat));
          }
          const c = PAINT[(n++ + 1) % 4];
          s.skin(loop, 0.065, c, { sides: 4, caps: 'none' });
          // the end of the cord, hanging from its knot
          s.skin([loop[0], along(along(loop[0], at.t, size * 0.8), at.n, -0.05), along(along(loop[0], at.t, size * 1.4), across, size * 0.5)], [0.07, 0.055, 0.04], c, { sides: 4 });
        }
      }
      // the face of a just man, mild, bearded, with long hair
      s.within(facing([0, 0.62, 7.62], [0, 0.0, 1], [0, 1, 0], 2.0), () => {
        face(s, { skin: SKIN, dark: DARK, eye: [0.1, 0.085, 0.07] }, { brow: 0.85, nose: 1.0, jaw: 0.95 });
        s.skin([[0, 0.2, 0.24], [0, 0.46, 0.0], [0, 0.3, -0.34], [0, -0.15, -0.46], [0, -0.6, -0.42]], [[0.26, 0.08], [0.33, 0.12], [0.37, 0.17], [0.37, 0.16], [0.3, 0.12]], FUR, { sides: 8 });
        s.skin([[0, -0.22, 0.22], [0, -0.52, 0.28], [0, -0.9, 0.24]], [[0.25, 0.13], [0.2, 0.13], [0.04, 0.04]], FUR, { sides: 7 });
      });
      // the paws: an arm and a forearm rowing the air, shaggy to the armpit, clawed
      for (const side of [-1, 1]) {
        const pivot = [side * 1.15, -1.3, 4.5];
        part(side > 0 ? 'pawL' : 'pawR', pivot, (p) => {
          const elbow = [side * 2.4, -2.5, 4.8];
          const wrist = [side * 2.7, -3.0, 6.3];
          const arm = [pivot, mix(pivot, elbow, 0.5), elbow, mix(elbow, wrist, 0.5), wrist];
          const thick = [0.55, 0.46, 0.36, 0.34, 0.27];
          p.ball(pivot[0], pivot[1], pivot[2], 0.62, HIDE);
          p.skin(arm, thick, FUR, { sides: 7 });
          const fur = onSkin(arm, thick);
          for (let i = 0; i < 44; i++) {
            const at = fur(0.04 + 0.94 * rnd(i + 2), rnd(i + 50) * TAU);
            p.spike(at.p, add(along(at.p, at.n, 0.22), [0, -0.18, -0.36 - 0.2 * rnd(i)]), 0.13, shade(FUR, 0.7 + 0.7 * rnd(i + 9)));
          }
          p.ball(wrist[0], wrist[1] - 0.05, wrist[2] + 0.3, 0.4, FUR, { sx: 1.1, sy: 0.6, sz: 1.2 });
          for (let c = -1.5; c <= 1.5; c++) {
            const from = [wrist[0] + c * 0.2, wrist[1] - 0.08, wrist[2] + 0.66];
            p.skin(curve([from, add(from, [c * 0.08, 0.02, 0.3]), add(from, [c * 0.12, -0.28, 0.5])], 4), spread([0.085, 0.06, 0.01], 4), TOOTH, { sides: 4, caps: 'none' });
          }
        });
      }
      // the tail, carried over his back like a scorpion's, and forked at the sting
      const root = line[0];
      part('tail', root, (t) => {
        const bend = curve([root, [0.5, -0.62, -7.3], [0.25, 0.0, -8.9], [-0.1, 1.8, -9.5], [0, 3.6, -8.7], [0.05, 4.2, -7.3], [0, 3.85, -6.3]], 26);
        t.skin(bend, spread([0.7, 0.58, 0.46, 0.38, 0.32, 0.27, 0.22], 26), (i, k) => (k >= 5 && k <= 7 ? UNDER : shade(HIDE, i % 3 ? 1 : 0.6)), { sides: 8 });
        const tip = bend[25];
        for (const side of [-1, 1]) {
          const prong = curve([tip, add(tip, [side * 0.34, -0.12, 0.42]), add(tip, [side * 0.36, -0.62, 0.86]), add(tip, [side * 0.18, -1.25, 0.86])], 6);
          t.skin(prong, spread([0.2, 0.19, 0.13, 0.012], 6), (i) => (i > 3 ? [0.03, 0.02, 0.02] : shade(HIDE, 0.7)), { sides: 6 });
        }
        t.ball(tip[0], tip[1], tip[2], 0.3, shade(HIDE, 0.7));
      });
      return { seat: SEAT, length: 18 };
    });
  },

  // One of the Malebranche, who keep the boiling pitch: "a devil black",
  // "with open wings and light upon his feet", his "shoulders sharp and
  // high", and in his hands a hook to grapple whoever shows above the pitch.
  // The wings turn at their roots and lift as rotation.z grows.
  devil(material) {
    const BLACK = [0.05, 0.042, 0.044];
    const WEB = [0.06, 0.028, 0.025];
    return creature(material, 2.7, (s, part) => {
      const m = man({ h: 2.55, hips: [0, 1.2, -0.05], bulk: 0.92, lean: 0.24, hunch: 0.34, nod: -0.3, shoulders: 1.22, chest: 1.1, waist: 0.85, head: 1.08, turn: -0.2 });
      m.torso(s, BLACK);
      for (const side of [-1, 1]) {
        const sh = m.shoulder(side);
        s.spike(add(sh, [0, 0, -0.03]), add(sh, [side * 0.2, 0.4, -0.1]), 0.1, BLACK, { sides: 5 });
      }
      // the hook: a long pole held across him, the iron uppermost and forward
      const butt = [-0.8, 0.45, -0.5];
      const iron = [0.8, 3.0, 1.4];
      const on = (t) => mix(butt, iron, t);
      m.arm(s, -1, on(0.34), [-1, -0.4, -0.4], BLACK);
      m.arm(s, 1, on(0.6), [1, -0.6, -0.2], BLACK);
      s.limb(butt, iron, 0.03, 0.028, WOOD, { joints: false });
      const way = unit(sub(iron, butt));
      const u = square(way);
      const w = cross(way, u);
      s.skin([along(iron, way, -0.22), iron, along(iron, way, 0.3)], [0.045, 0.045, 0.008], IRON, { sides: 6, hot: 0.012 });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + 0.5;
        const out = along(mul(u, Math.cos(a)), w, Math.sin(a));
        const hook = curve([along(iron, way, -0.05), along(along(iron, way, 0.12), out, 0.2), along(along(iron, way, 0.02), out, 0.36), along(along(iron, way, -0.2), out, 0.34)], 7);
        s.skin(hook, spread([0.035, 0.03, 0.022, 0.006], 7), IRON, { sides: 5, hot: 0.03 });
      }
      // crouched to spring, on clawed feet
      m.leg(s, 1, [0.3, 0, 0.5], [0.3, 0, 1], BLACK, { claws: HORN, toe: [0.3, 0, 1] });
      m.leg(s, -1, [-0.34, 0, -0.42], [-0.3, 0, 1], BLACK, { claws: HORN, toe: [-0.35, 0, 1] });
      // the tail, with its barb
      const tail = curve([add(m.hips, [0, -0.1, -0.2]), add(m.hips, [0.1, -0.5, -0.75]), add(m.hips, [0.5, -0.75, -1.2]), add(m.hips, [0.95, -0.35, -1.25]), add(m.hips, [1.05, 0.2, -1.0])], 14);
      s.skin(tail, spread([0.09, 0.065, 0.045, 0.03, 0.02], 14), BLACK, { sides: 5 });
      s.leaf(tail[13], add(tail[13], [0.06, 0.34, 0.14]), 0.22, [1, 0, -0.5], BLACK, 0.3);
      s.within(m.headFrame(), () => {
        face(s, { skin: BLACK, dark: [0.05, 0.008, 0.006], eye: EMBER, tooth: TOOTH }, { jaw: 1.1, brow: 1.6, nose: 1.4, open: 0.6, eyes: 1, fangs: 1.6, maw: 0.08 });
        for (const side of [-1, 1]) {
          // horns back over his head, and a bat's ears
          s.skin(curve([[side * 0.17, 0.36, 0.08], [side * 0.3, 0.66, -0.02], [side * 0.36, 0.92, -0.26], [side * 0.3, 1.02, -0.56]], 8), spread([0.1, 0.085, 0.055, 0.01], 8), HORN, { sides: 5 });
          s.leaf([side * 0.3, 0.02, -0.04], [side * 0.72, 0.36, -0.3], 0.26, [0, 0.2, 1], BLACK, 0.35);
        }
        s.spike([0, -0.48, 0.22], [0, -0.82, 0.3], 0.1, BLACK);
      });
      const SPAN = 2.5; // m, root to wingtip
      const axes = spanning([0.78, 0.5, -0.38]);
      for (const side of [-1, 1]) {
        part(side > 0 ? 'wingL' : 'wingR', add(m.collar, [side * 0.17, -0.12, -0.2]), (w) => batWing(w, SPAN, { bone: BLACK, web: WEB, claw: HORN }, side), { basis: side > 0 ? axes : mirrored(axes), own: true });
      }
    });
  },

  // One of the "horned demons with great scourges" who drive the panders
  // and seducers round their ditch, "beating them cruelly from behind".
  // The whip arm, and the whip with it, turns at the shoulder.
  scourger(material) {
    const HIDE = [0.165, 0.068, 0.052];
    const SHAG = [0.035, 0.026, 0.022];
    const LASH = [0.03, 0.022, 0.018];
    return creature(material, 2.4, (s, part) => {
      const m = man({ h: 2.3, hips: [0, 1.13, 0], bulk: 1.08, lean: 0.14, hunch: 0.16, nod: -0.1, shoulders: 1.1, chest: 1.1, head: 1.08, turn: 0.15 });
      m.torso(s, HIDE);
      // the left hand flung out before him, driving them on
      m.arm(s, 1, [0.62, 1.55, 0.8], [1, -0.5, -0.4], HIDE, { hand: 'open', palm: [0, -0.4, 1], claws: HORN });
      // astride, on a goat's shaggy haunches and cloven feet
      for (const side of [-1, 1]) {
        const leg = m.leg(s, side, [side * 0.34, 0, side > 0 ? 0.42 : -0.3], [side * 0.3, 0, 1], HIDE, { footColor: SHAG, toe: [side * 0.3, 0, 1] });
        for (let i = 0; i < 12; i++) {
          const t = rnd(i + side * 5);
          const from = add(mix(leg.hip, leg.knee, t * 0.95), [0.12 * Math.cos(i * 2.1), 0, 0.12 * Math.sin(i * 2.1)]);
          s.spike(from, add(from, [0.1 * Math.cos(i * 2.1), -0.26 - 0.1 * rnd(i), 0.1 * Math.sin(i * 2.1)]), 0.07, shade(SHAG, 0.7 + 0.6 * rnd(i + 3)));
        }
      }
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        const from = add(m.hips, [Math.cos(a) * 0.26, 0.04, Math.sin(a) * 0.2]);
        s.spike(from, add(from, [Math.cos(a) * 0.12, -0.3 - 0.14 * rnd(i), Math.sin(a) * 0.12]), 0.09, shade(SHAG, 0.7 + 0.6 * rnd(i + 30)));
      }
      const tail = curve([add(m.hips, [0, -0.08, -0.2]), add(m.hips, [0, -0.2, -0.55]), add(m.hips, [-0.15, 0.05, -0.8])], 6);
      s.skin(tail, spread([0.06, 0.04, 0.03], 6), HIDE, { sides: 5 });
      for (let i = 0; i < 4; i++) s.spike(tail[5], add(tail[5], [-0.1 + 0.1 * rnd(i), 0.2, -0.14 + 0.1 * rnd(i + 2)]), 0.05, SHAG);
      s.within(m.headFrame(), () => {
        face(s, { skin: HIDE, dark: [0.05, 0.008, 0.006], eye: EMBER, tooth: TOOTH }, { jaw: 1.2, brow: 1.6, nose: 1.2, open: 0.7, eyes: 1, fangs: 1.2, maw: 0.06 });
        for (const side of [-1, 1]) {
          // a ram's horns, curling round by the ears
          s.skin(
            curve([[side * 0.2, 0.34, 0.02], [side * 0.42, 0.5, -0.16], [side * 0.56, 0.3, -0.36], [side * 0.56, -0.02, -0.26], [side * 0.52, -0.14, 0.02], [side * 0.56, 0.0, 0.2]], 12),
            spread([0.13, 0.12, 0.1, 0.075, 0.05, 0.012], 12),
            HORN,
            { sides: 6 },
          );
        }
        s.skin([[0, -0.48, 0.2], [0, -0.72, 0.24], [0, -0.98, 0.18]], [[0.14, 0.1], [0.1, 0.08], [0.02, 0.02]], SHAG, { sides: 6 });
      });
      // the whip arm, flung up and back to strike, and the lash curling behind
      const sh = m.shoulder(-1);
      part('armR', sh, (a) => {
        const arm = m.arm(a, -1, [sh[0] - 0.42, sh[1] + 0.58, sh[2] - 0.12], [-1, -0.3, -0.6], HIDE);
        const stock = along(arm.wrist, [0.1, 0.9, -0.42], 0.34);
        a.limb(along(arm.wrist, [0.1, 0.9, -0.42], -0.16), stock, 0.028, 0.022, WOOD, { joints: false });
        const lash = curve([stock, add(stock, [0.1, 0.5, -0.45]), add(stock, [0.25, 0.55, -1.3]), add(stock, [0.2, -0.1, -1.95]), add(stock, [0.05, -0.85, -2.1]), add(stock, [0.0, -1.3, -1.7]), add(stock, [0.1, -1.25, -1.3])], 22);
        a.skin(lash, spread([0.026, 0.022, 0.018, 0.014, 0.01, 0.006], 22), LASH, { sides: 4 });
        // (it ends in three knotted tails)
        for (let i = 0; i < 3; i++) {
          const end = add(lash[21], [0.12 * (i - 1), 0.06 * (i - 1), 0.3 + 0.06 * i]);
          a.skin([lash[21], mix(lash[21], end, 0.5), end], [0.007, 0.006, 0.005], LASH, { sides: 3, caps: 'none' });
          a.bead(end, 0.022, LASH);
        }
      });
    });
  },

  // The giants who stand round the well, "like towers", their upper halves
  // over its rim. Nimrod, whose "face appeared as long and large as is at
  // Rome the pine-cone of Saint Peter's", babbling, his horn hung across his
  // breast.
  nimrod(material) {
    return giant(material, { lean: 0.04, hunch: 0.14, nod: -0.12, turn: -0.15 }, (s, m) => {
      m.arm(s, 1, add(m.shoulder(1), [3.6, -7.2, -0.4]), [1, 0, -1], GIANT, { hand: 'open', palm: [0, 0.3, 1] });
      // the horn: from his right shoulder down across his breast, the bell by his left hip
      const on = onSkin(...m.trunk);
      const lie = (f, ang, off) => {
        const at = on(f, ang);
        return along(at.p, at.n, off);
      };
      const horn = curve([lie(0.6, 0.75 * TAU - 0.9, 0.7), lie(0.47, 0.75 * TAU - 0.45, 1.3), lie(0.36, 0.75 * TAU + 0.15, 1.8), lie(0.33, 0.75 * TAU + 0.75, 3.0), lie(0.4, 0.75 * TAU + 1.0, 5.2)], 14);
      s.skin(horn, spread([0.2, 0.4, 0.66, 0.95, 1.3], 14), (i) => (i % 4 === 1 ? IRON : TOOTH), { sides: 8, caps: ['round', 'flat'] });
      s.skin([horn[13], along(horn[13], unit(sub(horn[13], horn[12])), 0.7)], [1.3, 2.0], TOOTH, { sides: 8, caps: ['none', 'none'] });
      s.ball(horn[13][0], horn[13][1], horn[13][2], 1.15, DARK);
      // the belt it hangs by, about his neck
      const belt = [horn[1]];
      for (let i = 0; i <= 8; i++) belt.push(lie(0.69, 0.75 * TAU - 0.9 - ((TAU - 1.5) * i) / 8, 0.12));
      belt.push(horn[9]);
      s.skin(curve(belt, 22), [[0.3, 0.07]], [0.05, 0.035, 0.025], { sides: 4, caps: 'none' });
      // his right hand fumbling for it
      m.arm(s, -1, add(horn[4], [-0.3, 0.3, 1.0]), [-1, -0.6, 0.2], GIANT, { hand: 'claw', palm: [0.2, 0, -1] });
      return { open: 1, long: 0.14, jaw: 1.3, brow: 1.5 };
    });
  },

  // Ephialtes, who tried his strength against Jove, and "the arms he
  // wielded never more he moves": "in front the left arm, and the right
  // behind", and a chain wound "as far as the fifth gyre" about what shows
  // of him.
  ephialtes(material) {
    return giant(material, { lean: -0.03, hunch: 0.08, nod: -0.3, turn: 0.3 }, (s, m) => {
      const front = add(m.waist, [0, 0.4, 0]);
      m.arm(s, 1, add(front, [-1.6, 0.3, 3.3]), [1, -1, 0.2], GIANT);
      m.arm(s, -1, add(front, [1.0, -0.4, -3.3]), [-1, -1, -0.2], GIANT);
      // the chain: link after link, each across the last
      const TURNS = 5;
      const LINKS = 21; // to a turn
      const top = m.collar[1] - 1.6;
      const foot = m.hips[1] + 0.6;
      const at = (i) => {
        const f = i / (TURNS * LINKS);
        const ang = f * TURNS * TAU;
        const mid = mix(m.collar, m.hips, f);
        // (wide enough to go round his arms as well)
        return [Math.cos(ang) * (5.6 - 1.0 * f), top + (foot - top) * f + 0.45 * Math.sin(ang * 1.0 + 1), mid[2] + Math.sin(ang) * (3.5 + 0.8 * Math.sin(f * Math.PI))];
      };
      for (let i = 0; i < TURNS * LINKS; i++) {
        const a = at(i);
        const b = at(i + 1);
        const out = [a[0], 0, a[2] - m.chest[2]];
        s.within(facing(mix(a, b, 0.5), sub(b, a), i % 2 ? out : [0, 1, 0]), () => s.box(0, 0, 0, 1.0, 0.4, len(sub(b, a)) * 1.3, i % 2 ? IRON : shade(IRON, 1.5)));
      }
      return { open: 0.7, jaw: 1.2, brow: 1.7, fangs: 0.6 };
    });
  },

  // Antaeus, unbound, who set the poets down on the ice: "as seems the
  // Garisenda, to behold beneath the leaning side", so he stoops, an open
  // hand let down. `arm` is that arm, turning at its shoulder.
  antaeus(material) {
    return giant(material, { lean: 0.5, hunch: 0.2, nod: -0.25, hips: [0, 12.3, -2.2] }, (s, m, part, legs) => {
      // one hand on his knee to bear him up
      m.arm(s, 1, add(legs.L.knee, [0.4, 1.5, 0.9]), [1, 0.2, -1], GIANT, { hand: 'open', palm: [0, -1, 0.3] });
      const sh = m.shoulder(-1);
      part('arm', sh, (a) => m.arm(a, -1, add(sh, [-1.8, -5.2, 6.2]), [-1, -0.4, -0.6], GIANT, { hand: 'open', palm: [0.1, 1, -0.25], handSize: 1.2 }));
      return { open: 0.25, jaw: 1.15, brow: 1.3 };
    });
  },

  // Lucifer, "the Emperor of the kingdom dolorous", who "from his mid-breast
  // forth issued from the ice" (y = 0 is the ice). "Three faces on his
  // head": "the one in front, and that vermilion was", the right "'twixt
  // white and yellow", the left black; "underneath each came forth two
  // mighty wings", "no feathers had they, but as of a bat their fashion
  // was"; "with six eyes did he weep", and "at every mouth he with his teeth
  // was crunching a sinner": in front Judas, "who has his head within, and
  // plies his legs without"; at the sides Brutus and Cassius, head downward.
  //
  // wing1, wing3 and wing5 are on his left, from the highest down; wing2,
  // wing4 and wing6 on his right. Each turns at its root and lifts as its
  // rotation.z grows. The jaws hang open on what they chew, drop further as
  // rotation.x grows, and close as it falls (to about -0.3).
  lucifer(material) {
    const HIDE = [0.06, 0.05, 0.048];
    const SHAG = [0.034, 0.027, 0.024];
    const WEB = [0.05, 0.03, 0.03];
    const ICE = [0.3, 0.36, 0.42]; // tears, frozen as they run
    const GORE = [0.12, 0.01, 0.008];
    const SOUL = [0.25, 0.21, 0.18]; // those he chews
    const VERMILION = [0.2, 0.028, 0.018];
    const SALLOW = [0.33, 0.29, 0.15];
    const BLACK = [0.024, 0.022, 0.025];
    const TALL = 95; // m, from the ice to his crown
    const HH = 42; // m, each face from chin to crown
    const SPAN = 110; // m, each wing
    const OPEN = 0.36; // rad his jaws hang open
    const HEAD = [0, 72, 0];
    return creature(material, TALL, (s, part) => {
      // Shag hanging from a hide: `many` tufts, about `long`, over the part of a skin from f0 to f1.
      const shag = (on, many, seed, f0, f1, long) => {
        for (let i = 0; i < many; i++) {
          const at = on(f0 + (f1 - f0) * rnd(i + seed), rnd(i + seed + 500) * TAU);
          if (at.p[1] < 2) continue;
          const l = long * (0.6 + 0.8 * rnd(i + seed + 900));
          s.spike(at.p, add(along(at.p, at.n, l * 0.4), [0, -l, 0]), long * 0.3, shade(SHAG, 0.6 + 1.0 * rnd(i + seed + 70)));
        }
      };
      // his breast, his shoulders and his neck
      const trunk = [[0, -8, 0], [0, 8, 0], [0, 22, -1], [0, 32, -2], [0, 38, -2], [0, 44, -1], [0, 53, 0]];
      const girth = [[43, 30], [46, 32], [44, 28], [37, 21], [23, 17], [15, 15], [12.5, 13]];
      s.skin(trunk, girth, HIDE, { sides: 16, caps: ['flat', 'flat'] });
      shag(onSkin(trunk, girth), 820, 1, 0.1, 0.62, 7);
      // his arms, out of the ice at the elbow, the forearms along it and the claws in it
      for (const side of [-1, 1]) {
        const sh = [side * 45, 29, -1];
        const el = [side * 68, 5, 26];
        const wr = [side * 38, 4.5, 60];
        const arm = [sh, mix(sh, el, 0.5), el, mix(el, wr, 0.3), mix(el, wr, 0.7), wr];
        const thick = [14, 12.5, 9.5, 10.5, 8.5, 6.5];
        s.ball(sh[0], sh[1], sh[2], 15.5, HIDE, { fine: true });
        s.skin(arm, thick, HIDE, { sides: 10 });
        shag(onSkin(arm, thick), 260, 2000 + side * 300, 0.02, 0.97, 6);
        handOn(s, wr, unit([-side * 0.7, -0.04, 0.7]), 17, HIDE, { pose: 'claw', palm: [0, -1, 0], claws: TOOTH, side });
      }

      // the three faces, each a head's breadth out from where they join
      for (const [name, yaw, colour] of [['Front', 0, VERMILION], ['Left', Math.PI / 2, BLACK], ['Right', -Math.PI / 2, SALLOW]]) {
        const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.14, yaw, 0, 'YXZ'));
        const at = along(HEAD, [Math.sin(yaw), 0, Math.cos(yaw)], 6);
        // (in a face's own frame 1 is from chin to crown, and it looks along +z)
        const frame = new THREE.Matrix4().compose(new THREE.Vector3(...at), turn, new THREE.Vector3(HH, HH, HH));
        s.within(frame, () => {
          const skull = [[0, -0.2, 0.09], [0, -0.08, 0.02], [0, 0.05, -0.01], [0, 0.16, -0.03], [0, 0.3, -0.055], [0, 0.4, -0.07], [0, 0.46, -0.075]];
          const round = [[0.27, 0.29], [0.31, 0.36], [0.325, 0.385], [0.33, 0.4], [0.3, 0.36], [0.22, 0.27], [0.12, 0.15]];
          s.skin(skull, round, colour, { sides: 14, caps: ['flat', 'round'], dome: 0.4 });
          const on = onSkin(skull, round);
          // a heavy brow, drawn down in the middle
          s.skin(curve([[-0.31, 0.16, 0.22], [-0.15, 0.13, 0.385], [0, 0.07, 0.41], [0.15, 0.13, 0.385], [0.31, 0.16, 0.22]], 9), 0.07, shade(colour, 0.7), { sides: 6 });
          for (const side of [-1, 1]) {
            s.ball(side * 0.145, 0.025, 0.3, 0.095, DARK, { fine: true });
            s.bead([side * 0.145, 0.02, 0.385], 0.045, EMBER, 0.7);
            // the tears, frozen down the cheek, and hanging from it in ice
            const tear = [];
            for (let q = 0; q <= 5; q++) {
              const f = 0.26 * (1 - q / 5);
              const ang = 0.75 * TAU + side * (0.46 + 0.14 * (q / 5));
              const a = on(f, ang - 0.05);
              const b = on(f, ang + 0.05);
              tear.push([along(a.p, a.n, 0.008), along(b.p, b.n, 0.008)]);
            }
            s.sheet(tear, ICE);
            const drip = on(0, 0.75 * TAU + side * 0.6).p;
            s.spike(add(drip, [0, 0.02, 0]), add(drip, [0, -0.12, 0.01]), 0.03, ICE, { sides: 4 });
          }
          s.skin([[0, 0.1, 0.36], [0, -0.04, 0.47], [0, -0.13, 0.49]], [0.045, 0.065, [0.1, 0.06]], colour, { sides: 6 });
          // the upper lip and its teeth, and the gullet behind
          const lip = curve([[-0.25, -0.2, 0.19], [-0.13, -0.2, 0.35], [0, -0.2, 0.39], [0.13, -0.2, 0.35], [0.25, -0.2, 0.19]], 11);
          s.skin(lip, 0.036, shade(colour, 0.8), { sides: 5 });
          lip.forEach((p, i) => {
            if (i > 0 && i < 10) s.spike([p[0], p[1] - 0.015, p[2] - 0.012], [p[0], p[1] - (i === 3 || i === 7 ? 0.14 : 0.085), p[2] - 0.005], 0.028, TOOTH, { sides: 4 });
          });
          s.ball(0, -0.26, 0.07, 0.25, [0.04, 0.006, 0.005], { sy: 0.7, hot: 0.05 });
          // whom he chews
          dangling(s, [0, -0.37, 0.37], 0.37, SOUL, name === 'Front');
        });
        // the lower jaw, on its hinge
        const HINGE = [0, -0.15, -0.02];
        const pivot = new THREE.Vector3(...HINGE).applyMatrix4(frame);
        const put = new THREE.Matrix4()
          .makeScale(HH, HH, HH)
          .multiply(new THREE.Matrix4().makeRotationX(OPEN))
          .multiply(new THREE.Matrix4().makeTranslation(-HINGE[0], -HINGE[1], -HINGE[2]));
        part(
          `jaw${name}`,
          [pivot.x, pivot.y, pivot.z],
          (j) =>
            j.within(put, () => {
              const bone = [[0, -0.2, -0.02], [0, -0.3, 0.12], [0, -0.4, 0.26], [0, -0.45, 0.33]];
              const wide = [[0.27, 0.06], [0.26, 0.09], [0.19, 0.1], [0.12, 0.08]];
              j.skin(bone, wide, colour, { sides: 10, dome: 0.6 });
              const rim = onSkin(bone, wide);
              for (let i = 0; i < 9; i++) {
                const a = (i / 8 - 0.5) * 2.5;
                const tooth = rim(0.97 - 0.42 * Math.abs(a), Math.PI / 2 + a).p;
                j.spike(tooth, add(tooth, [0, i === 2 || i === 6 ? 0.13 : 0.085, 0.015]), 0.028, TOOTH, { sides: 4 });
              }
              // the bloody drivel down his chin
              for (let i = 0; i < 5; i++) {
                const x = (i / 4 - 0.5) * 0.2;
                j.spike([x, -0.44, 0.39 - Math.abs(x) * 0.4], [x * 1.2, -0.62 - 0.1 * rnd(i + yaw), 0.37 - Math.abs(x) * 0.4], 0.03, GORE, { sides: 4 });
              }
            }),
          { basis: new THREE.Matrix4().makeRotationFromQuaternion(turn), own: true },
        );
      }
      // a crest of horn where the three heads join
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + 0.3;
        s.spike([Math.cos(a) * 12, HEAD[1] + 13, Math.sin(a) * 12], [Math.cos(a) * 15.5, TALL + 1 + 3 * rnd(i), Math.sin(a) * 15.5], 2.8, HORN, { sides: 5 });
      }

      // the six wings, spread behind him like a fan: a pair raised high, a pair out and up, a pair low over the ice
      [
        // where the left one's root is, which way it reaches, and which way is up for it
        [[12, 44, -14], [0.42, 0.88, -0.2], [-1, 0.3, 0.4]],
        [[20, 40, -12], [0.86, 0.47, -0.2], [-0.5, 0.85, 0.3]],
        [[24, 35, -8], [0.96, 0.14, -0.24], [0, 0.6, 0.8]],
      ].forEach(([root, reach, up], n) => {
        const axes = spanning(reach, up);
        for (const side of [1, -1]) {
          part(`wing${n * 2 + (side > 0 ? 1 : 2)}`, [side * root[0], root[1], root[2]], (w) => batWing(w, SPAN, { bone: shade(HIDE, 0.7), web: WEB, claw: HORN }, side, 7, 0.7), { basis: side > 0 ? axes : mirrored(axes), own: true });
        }
      });
    });
  },

  // A snake: lying in a loose S, its head raised.
  serpent(material) {
    return creature(material, 0.5, (s) => {
      const SCALE = [0.13, 0.15, 0.065];
      const BELLY = [0.24, 0.22, 0.13];
      const line = curve(
        [[0.05, 0.03, -1.0], [-0.22, 0.04, -0.72], [-0.1, 0.05, -0.38], [0.26, 0.055, -0.1], [0.2, 0.06, 0.24], [-0.12, 0.07, 0.4], [-0.16, 0.2, 0.56], [-0.06, 0.4, 0.62], [0.0, 0.46, 0.74]],
        40,
      );
      const thick = spread([0.008, 0.03, 0.045, 0.052, 0.055, 0.052, 0.045, 0.036, 0.034], 40);
      s.skin(line, thick, (i, k) => (k >= 4 && k <= 6 ? BELLY : shade(SCALE, (i % 4 < 2 ? 1 : 0.45) * (0.9 + 0.2 * rnd(i)))), { sides: 8 });
      // the head: a flat wedge, eyes like sparks, the tongue out
      const at = line[line.length - 1];
      s.within(facing(at, [0.25, -0.25, 1], [0, 1, 0], 1), () => {
        s.skin([[0, 0, -0.05], [0, 0.005, 0.06], [0, -0.005, 0.17]], [[0.045, 0.036], [0.075, 0.04], [0.036, 0.02]], SCALE, { sides: 8, dome: 0.6 });
        for (const side of [-1, 1]) {
          s.bead([side * 0.052, 0.03, 0.08], 0.014, EMBER, 0.8);
          s.spike([side * 0.008, -0.012, 0.18], [side * 0.035, -0.02, 0.29], 0.005, [0.2, 0.03, 0.03]);
        }
      });
    });
  },

  // The ensign the uncommitted run after for ever: a pole, and a long ragged
  // pennant streaming back from it.
  banner(material) {
    const POLE = 4; // m
    const FLY = 3.4; // m the pennant streams back
    const HOIST = 0.8; // m of it along the pole
    return creature(material, POLE, (s, part) => {
      s.limb([0, 0, 0], [0, POLE, 0], 0.03, 0.024, OLDWOOD, { joints: false, sides: 6 });
      s.spike([0, POLE, 0], [0, POLE + 0.18, 0], 0.035, IRON, { sides: 4 });
      const top = POLE - 0.08;
      part('flag', [0, top, 0], (f) => {
        // rows from the pole back; columns from its upper edge down. It
        // narrows as it goes, waves, and ends in tatters.
        const ROWS = 16;
        const COLS = 5;
        const grid = [];
        for (let i = 0; i <= ROWS; i++) {
          const t = i / ROWS;
          const z = -t * FLY;
          const wave = Math.sin(t * 7.5) * 0.16 * t;
          const droop = -0.5 * t * t;
          // (its lower edge is torn: here and there a bite out of it)
          const tall = HOIST * (1 - 0.72 * t) * (i % 3 === 2 ? 0.62 + 0.3 * rnd(i) : 1);
          const row = [];
          for (let j = 0; j < COLS; j++) {
            const v = j / (COLS - 1);
            // the fly end is torn: every other tail of it is short
            const torn = i === ROWS ? 0.22 * rnd(j + 3) : 0;
            row.push([wave + Math.sin(t * 5 + v * 2.2) * 0.05 * t, top + droop - v * tall, z + torn + (i === ROWS - 1 && j % 2 ? 0.12 : 0)]);
          }
          grid.push(row);
        }
        f.sheet(grid, (i, j) => shade(CLOTH, 0.75 + 0.3 * rnd(i * 5 + j) - 0.25 * (i / ROWS)));
        // tatters trailing from the end
        const last = grid[ROWS];
        for (let j = 0; j < COLS; j++) f.leaf(last[j], add(last[j], [0.06 * (rnd(j) - 0.5), -0.1 - 0.12 * rnd(j + 9), -0.3 - 0.35 * rnd(j + 5)]), 0.07, [1, 0, 0], shade(CLOTH, 0.6), 0.2);
      });
    });
  },
};

export const CREATURE_NAMES = Object.keys(MAKERS);

// Each is made once and copied after: the copies share its shapes, and have
// parts of their own to move. Its flesh is built from pieces at first, and
// melted into one (sculpt.js) a few milliseconds at a time, when meltSome()
// is called; then it and every copy of it take the melted shapes.
const made = new Map(); // name:material -> the first
const queue = []; // { first, meshes, jobs: [{ sculpt, at, work }], copies: [meshes] }

const meshesOf = (g) => {
  const out = [];
  g.traverse((o) => {
    if (o.isMesh) out.push(o);
  });
  return out;
};

// later: true when it is only being got ready, not wanted just now (it
// waits its turn behind what is). rough: true for its pieces only, never
// melted (a shape taken once, to be strewn by the hundred: furnish.js)
export function makeCreature(name, material, { later = false, rough = false } = {}) {
  const make = MAKERS[name];
  if (!make) throw new Error(`no such creature: ${name} (there are: ${CREATURE_NAMES.join(', ')})`);
  const key = `${name}:${material ? material.uuid : ''}${rough ? ':rough' : ''}`;
  let first = made.get(key);
  if (!first) {
    const { g, melts } = make(material);
    first = g;
    first.name = name;
    first.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    made.set(key, first);
    if (melts.length && !rough) {
      const meshes = meshesOf(first);
      queue.push({ first, meshes, jobs: melts.map(([sculpt, mesh]) => ({ sculpt, at: meshes.indexOf(mesh), work: null })), copies: [] });
    }
  }
  // (three.js copies userData through JSON: not the parts, which are meshes)
  const kept = first.userData;
  first.userData = {};
  const g = first.clone();
  first.userData = kept;
  const parts = {};
  g.traverse((o) => {
    if (o.isMesh && kept.parts[o.name]) parts[o.name] = o;
  });
  g.userData = { ...kept, parts };
  const q = queue.findIndex((e) => e.first === first);
  if (q >= 0) {
    queue[q].copies.push(meshesOf(g));
    // (wanted now: to the front)
    if (!later && q > 0) queue.unshift(...queue.splice(q, 1));
  }
  return g;
}

// Melt what's waiting, for up to ms. -> how many creatures are still waiting.
export function meltSome(ms) {
  const until = performance.now() + ms;
  while (queue.length && performance.now() < until) {
    const e = queue[0];
    const job = e.jobs.find((j) => !j.done);
    if (!job) {
      queue.shift();
      continue;
    }
    job.work ||= job.sculpt.melting();
    if (!job.work.step(until)) break;
    job.done = true;
    const fine = job.work.geometry;
    const rough = e.meshes[job.at].geometry;
    for (const meshes of [e.meshes, ...e.copies]) meshes[job.at].geometry = fine;
    rough.dispose();
    job.sculpt = job.work = null;
  }
  return queue.length;
}
