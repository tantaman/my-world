// What a blueprint looks like on the ground before it's built: a
// translucent stand-in for every piece still to go up, at the level the
// footings will come up to, with any footing the ground won't allow in red.
//
// One Ghost is the plan following the crosshair while you choose where to
// put it (hidden every frame unless the tool shows it, like any preview); the
// other is the site you staked out, there whatever is in your hands.

import * as THREE from 'three';
import { HALF, LOG_D, TIMBER_W, ROOF, height } from '../build/constants.js';
import { Mesher, addRoof } from '../build/geometry.js';
import { remaining, eaveOf } from './plan.js';

const FOOTING_W = 0.46; // m, as the footing tool's own ghost
const LOG_ENDS = 0.15; // m a log's ghost runs past its end nodes
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _white = new THREE.Color(1, 1, 1);
const white = () => _white;

function box(m, x, y, z, w, h, d) {
  m.add(new THREE.BoxGeometry(w, h, d), _m.compose(_p.set(x, y, z), _q, _s), white);
}

// The geometry of what's left of a placed plan.
//   y0       the level the footings come up to
//   ground   (x, z) -> height
//   built    the building already standing on the site, or null
//   trouble  'x,z' of footings the ground won't take
// -> { pieces, trouble }: BufferGeometry each (empty if there is nothing)
export function ghostGeometry(placed, { y0, ground, built = null, trouble = new Set() }) {
  const left = remaining(placed, built);
  const ok = new Mesher();
  const bad = new Mesher();
  for (const { x, z } of left.footings) {
    const g = ground(x, z);
    const h = Math.max(0.05, y0 - g + 0.1);
    box(trouble.has(`${x},${z}`) ? bad : ok, x, g - 0.1 + h / 2, z, FOOTING_W, h, FOOTING_W);
  }
  for (const L of left.logs) {
    const h = height(L.kind);
    const w = L.kind === 'log' ? LOG_D : TIMBER_W;
    const len = L.s1 - L.s0 + 2 * LOG_ENDS;
    const y = y0 + L.k * HALF + h / 2;
    const c = (L.s0 + L.s1) / 2;
    if (L.axis === 'x') box(ok, c, y, L.line, len, h, w);
    else box(ok, L.line, y, c, w, h, len);
  }
  for (const r of left.roofs) {
    const roof = { ...r, eave: y0 + eaveOf(placed, r), axis: r.x1 - r.x0 >= r.z1 - r.z0 ? 'x' : 'z' };
    addRoof(ok, roof, ROOF.pitch, ROOF.overhang, 1);
  }
  const out = (m) => (m.empty ? new THREE.BufferGeometry() : m.build());
  return { pieces: out(ok), trouble: out(bad) };
}

export class Ghost {
  // add(object): puts a mesh where it's drawn — scene.add, or previews.add
  // for one that is hidden each frame unless shown again
  constructor(add, pieces, trouble) {
    this.pieces = new THREE.Mesh(new THREE.BufferGeometry(), pieces);
    this.trouble = new THREE.Mesh(new THREE.BufferGeometry(), trouble);
    for (const m of [this.pieces, this.trouble]) {
      m.renderOrder = 10;
      add(m);
    }
    this.key = null;
  }

  // Draw what's left of `placed` (see ghostGeometry), unless what is drawn
  // already has the same key.
  draw(key, placed, opts) {
    if (key === this.key) return;
    this.key = key;
    const g = ghostGeometry(placed, opts);
    this.pieces.geometry.dispose();
    this.trouble.geometry.dispose();
    this.pieces.geometry = g.pieces;
    this.trouble.geometry = g.trouble;
  }

  set visible(on) {
    this.pieces.visible = on;
    this.trouble.visible = on;
  }
}
