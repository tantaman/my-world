// What a blueprint looks like on the ground before it's built: a
// translucent stand-in for every piece still to go up, at the level the
// footings will come up to, with any footing the ground won't allow in red.
// A site still to be levelled shows its grade as a sheet: ground poking
// through it is to be cut, and where it floats, filled.
//
// One Ghost is the plan following the crosshair while you choose where to
// put it (hidden every frame unless the tool shows it, like any preview); the
// other is the site you staked out, there whatever is in your hands.
//
// The pieces are worked out where they'll stand in the world, but the
// geometry is measured from a corner of the plan, where the ghost is then
// put: a vertex is a 32-bit float, and can't hold a place far from the
// middle of the world (render/origin.js).

import * as THREE from 'three';
import { HALF, LOG_D, TIMBER_W, ROOF, height } from '../build/constants.js';
import { Mesher, addRoof } from '../build/geometry.js';
import { remaining, eaveOf, grow } from './plan.js';
import { PAD } from './grade.js';

const FOOTING_W = 0.46; // m, as the footing tool's own ghost
const LOG_ENDS = 0.15; // m a log's ghost runs past its end nodes
const PAD_THICK = 0.03; // m, the sheet that shows the grade a site will be levelled to
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
//   pad      the grade the site will be levelled to, or null
// -> { pieces, trouble, at }: a BufferGeometry each (empty if there is
//    nothing), measured from `at`, which is where their meshes must be put
export function ghostGeometry(placed, { y0, ground, built = null, trouble = new Set(), pad = null }) {
  const left = remaining(placed, built);
  const ok = new Mesher();
  const bad = new Mesher();
  for (const { x, z } of left.footings) {
    const g = pad !== null ? pad : ground(x, z);
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
  if (pad !== null) {
    const R = grow(placed.rect, PAD);
    box(ok, (R.x0 + R.x1) / 2, pad, (R.z0 + R.z1) / 2, R.x1 - R.x0, PAD_THICK, R.z1 - R.z0);
  }
  const at = new THREE.Vector3(placed.rect.x0, 0, placed.rect.z0);
  const out = (m) => (m.empty ? new THREE.BufferGeometry() : m.build(at));
  return { pieces: out(ok), trouble: out(bad), at };
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
    this.pieces.position.copy(g.at);
    this.trouble.position.copy(g.at);
  }

  set visible(on) {
    this.pieces.visible = on;
    this.trouble.visible = on;
  }
}
