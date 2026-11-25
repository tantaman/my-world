// What was made on the mountain, and what stands too big or too few to
// strew: the mouth of the hidden road in its knoll; the gate's door in the
// crevice of the great cliff, its jambs and lintel and the threshold of
// diamond; the carvings in the marble bank of the first terrace (Canto X:
// the Annunciation, David dancing before the Ark, Trajan and the widow);
// and the two trees of the sixth terrace, "as a fir-tree tapers upward from
// bough to bough, so downwardly did that", with a limpid water falling on
// their leaves from the rock above.
//
// Nothing here stops you: what can't be walked through is the land's to say
// (land.barrier, the door), or the space's solids (a tree's trunk).

import * as THREE from 'three';
import { Sculpt, vary } from '../render/sculpt.js';
import { SHARED } from '../render/uniforms.js';
import { NOISE_GLSL } from '../render/glsl.js';
import { createMountStone } from './look.js';
import { createFigureMaterial } from './models.js';
import { R, AT, BURROW, TERRACES, WIDE, WAYS, GATE } from './plan.js';
import { DOOR } from './land.js';

const MARBLE = [0.64, 0.62, 0.58];
const BRONZE = [0.11, 0.08, 0.05];
const OPEN_IN = 3.2; // s the door takes to swing open
const CARVINGS = [16, 38, 60]; // m on round from where you come up onto the first terrace that each carving stands
const TREES = [0.14, 0.3]; // how far (rad) on round from where you come up onto the sixth terrace each tree stands

const _p = { x: 0, z: 0 };
const _q = { x: 0, z: 0 };

export class Built {
  // land, space: Purgatory's · group: where it all goes
  constructor({ land, space, group }) {
    this.land = land;
    this.space = space;
    this.group = group;
    this.stone = createMountStone();
    this.figure = createFigureMaterial([0.6, 0.75, 0.9]);
    this.door = null;
    this.open = 0; // 0 shut .. 1 open
    this.trees = [];
    this._burrow();
    this._gate();
    this._carvings();
    this._trees();
  }

  // On the island at (r, th), h m over the sea (null: on the ground),
  // facing `yaw`: a mesh of geo in mat, added.
  _put(geo, mat, r, th, h, yaw) {
    const L = this.land;
    L.place(r, th, _p);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(_p.x, h === null ? L.height(_p.x, _p.z) : L.top + h, _p.z);
    m.rotation.y = yaw;
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  // The way from (r, th) toward the axis, as a yaw (facing it), and outward.
  _yawIn(r, th) {
    this.land.place(r, th, _p);
    return Math.atan2(this.land.cx - _p.x, this.land.cz - _p.z);
  }

  // The mouth of the hidden road: the dark at the back of the notch in the knoll.
  _burrow() {
    const s = new Sculpt();
    const rock = [0.13, 0.12, 0.11];
    // a rough frame of rock round the dark
    s.box(-1.75, 1.4, 0, 0.7, 2.8, 1.2, vary(rock, 0.3));
    s.box(1.75, 1.4, 0, 0.7, 2.8, 1.2, vary(rock, 0.7));
    s.box(0, 3.0, 0, 4.2, 0.6, 1.3, vary(rock, 0.5), { rz: 0.04 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const r = BURROW.r + BURROW.back + 0.5;
    const yaw = this._yawIn(r, AT.burrow) + Math.PI; // facing the sea
    const frame = this._put(s.build(), this.stone, r, AT.burrow, null, yaw);
    const hole = this._put(new THREE.PlaneGeometry(2.9, 2.8), dark, r - 0.25, AT.burrow, null, yaw);
    hole.position.y = frame.position.y + 1.4;
    hole.castShadow = false;
  }

  // The gate: two leaves of the door in the crevice, the jambs and lintel
  // round them, and the threshold.
  _gate() {
    const L = this.land;
    const w = WAYS[0];
    // in the crevice at the foot of the great cliff, facing out over the steps
    const a = L.place(R.cliff - DOOR.at, AT.gate, {});
    const yaw = this._yawIn(R.cliff - DOOR.at, AT.gate);
    const floor = L.top + w.h0;
    const half = w.half + 0.15;
    const frame = new Sculpt();
    for (const k of [-1, 1]) frame.box(k * (half + 0.35), GATE.height / 2, 0, 0.7, GATE.height + 0.3, 0.9, vary([0.2, 0.19, 0.18], k > 0 ? 0.3 : 0.7));
    frame.box(0, GATE.height + 0.45, 0, half * 2 + 1.6, 0.9, 1.0, [0.2, 0.19, 0.18]);
    const g = new THREE.Group();
    g.position.set(a.x, floor, a.z);
    g.rotation.y = yaw;
    const fm = new THREE.Mesh(frame.build(), this.stone);
    fm.castShadow = true;
    fm.receiveShadow = true;
    g.add(fm);
    // the threshold, "which seemed to me a stone of diamond"
    const sill = new Sculpt();
    sill.box(0, -0.06, -0.55, half * 2 + 1.2, 0.14, 1.0, [0.62, 0.68, 0.75], { hot: 0.35 });
    g.add(new THREE.Mesh(sill.build(), this.figure));
    // the leaves, of metal, "massive and sonorous", each hung at a jamb
    this.leaves = [];
    for (const k of [-1, 1]) {
      const leaf = new Sculpt();
      leaf.box((-k * half) / 2, GATE.height / 2, 0, half, GATE.height, 0.2, BRONZE);
      for (let i = 1; i < 5; i++) leaf.box((-k * half) / 2, (i * GATE.height) / 5, -0.12, half * 0.92, 0.08, 0.06, vary(BRONZE, 0.8));
      const hinge = new THREE.Group();
      hinge.position.set(k * half, 0, 0);
      const m = new THREE.Mesh(leaf.build(), this.stone);
      m.castShadow = true;
      hinge.add(m);
      hinge.userData.k = k;
      g.add(hinge);
      this.leaves.push(hinge);
    }
    this.group.add(g);
    this.gate = g;
  }

  // Fit each relief to the slope of the bank. Its surround buries its
  // edges in the marble, and the story stands proud of its recessed face.
  _carvings() {
    const T = TERRACES[0];
    const from = WAYS[0].a1;
    const r = T.r - WIDE;
    const inset = 1.4; // m into the bank, to measure its slope at relief height
    const shear = new THREE.Matrix4();
    const stories = [annunciation, david, trajan];
    CARVINGS.forEach((m, i) => {
      const th = from - m / r;
      const at = this.land.place(r - inset, th, _q);
      const dz = -inset / (this.land.height(at.x, at.z) - this.land.top - T.h);
      shear.set(
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, dz, 1, 0,
        0, 0, 0, 1,
      );
      this._put(stories[i]().applyMatrix4(shear), this.stone, r, th, T.h, this._yawIn(r, th) + Math.PI);
    });
  }

  // The two trees of the sixth terrace, and the water falling on them.
  _trees() {
    const T = TERRACES[5];
    const from = WAYS[5].a1;
    const water = waterMaterial();
    for (const da of TREES) {
      const th = from - da;
      const r = T.r - WIDE * 0.5;
      const yaw = this._yawIn(r, th);
      const m = this._put(fir(), this.figure, r, th, T.h, yaw);
      this.land.place(r, th, _q);
      this.trees.push({ x: _q.x, z: _q.z });
      // the trunk, which is in the way
      this.space.solids.set(`tree:${da}`, [{ ax: _q.x, az: _q.z, bx: _q.x, bz: _q.z, r: 0.32, bottom: m.position.y - 1, topA: m.position.y + 7, topB: m.position.y + 7 }]);
      // the water, from the rock above, onto its leaves
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 9.5, 1, 8), water);
      this.land.place(T.r - WIDE - 0.4, th, _p);
      fall.position.set(_p.x, m.position.y + 6.6 + 4.75, _p.z);
      fall.rotation.y = yaw;
      fall.castShadow = false;
      this.group.add(fall);
    }
  }

  // How far (m) the nearest of the trees is from (x, z).
  nearTree(x, z) {
    let d = Infinity;
    for (const t of this.trees) d = Math.min(d, Math.hypot(t.x - x, t.z - z));
    return d;
  }

  update(dt, eye, here) {
    // the door swings open once the angel has marked you, and stays
    const want = this.land.shut ? 0 : 1;
    this.open += Math.sign(want - this.open) * Math.min(Math.abs(want - this.open), dt / OPEN_IN || 1);
    const swing = (this.open * this.open * (3 - 2 * this.open) * Math.PI) / 2.1;
    for (const l of this.leaves) l.rotation.y = l.userData.k * swing;
  }

  lightsNear() {}
}

// ── The carvings ────────────────────────────────────────────────────────────
// A chiseled surround, with the front of the marble facing +z. The figures
// share the face's stone, with enough depth for sunlight to pick out a fold.
function relief(s) {
  const face = (half, bottom, top, z) => [[-half, bottom, z], [half, bottom, z], [half, top, z], [-half, top, z]];
  const wall = face(2.04, -0.09, 3, -0.11);
  const rim = face(1.87, 0.12, 2.84, 0.15);
  const recess = face(1.72, 0.31, 2.69, 0.08);
  s.quad(...recess, vary(MARBLE, 0.22, 0.15), 0.55);
  for (let i = 0; i < rim.length; i++) {
    const j = (i + 1) % rim.length;
    s.quad(wall[i], wall[j], rim[j], rim[i], MARBLE, 0.62);
    s.quad(rim[i], rim[j], recess[j], recess[i], vary(MARBLE, 0.33, 0.14), 0.52);
  }
  s.frame = new THREE.Matrix4().makeScale(1, 1, 0.66).setPosition(0, 0.32, 0.1);
}
function figure(s, x, kneel = false, lean = 0) {
  const c = vary(MARBLE, 0.65, 0.12);
  const h = kneel ? 0.96 : 1.5;
  const shoulder = x - lean * h;
  s.drum(x, 0.04, 0, 0.21, 0.32, h, c, { sides: 10, rz: lean, hot: 0.5 });
  if (kneel) s.limb([x - 0.28, 0.16, 0.08], [x - 0.06, 0.34, 0.16], 0.16, 0.24, c, { sides: 9 });
  s.ball(shoulder, h + 0.18, 0.11, 0.17, c, { sy: 1.15 });
  s.ball(shoulder + 0.045, h + 0.16, 0.26, 0.045, c, { sy: 1.4 });
  s.limb([shoulder - 0.18, h - 0.1, 0.08], [shoulder - 0.4, h - 0.46, 0.18], 0.105, 0.07, c, { sides: 8 });
  s.limb([shoulder + 0.18, h - 0.1, 0.1], [shoulder + 0.3, h - 0.28, 0.28], 0.105, 0.075, c, { sides: 8 });
  s.limb([shoulder + 0.3, h - 0.28, 0.28], [shoulder + 0.44, h - 0.02, 0.24], 0.075, 0.055, c, { sides: 8 });
  for (const off of [-0.13, 0, 0.13]) {
    s.limb([x + off * 1.6, 0.18, 0.19], [shoulder + off, h * 0.7, 0.22], 0.048, 0.028, vary(c, 0.35), { sides: 6 });
  }
}
function wings(s, x) {
  for (let f = 0; f < 5; f++) {
    const c = vary(MARBLE, 0.4 + 0.08 * f);
    s.limb([x - 0.12, 1.38 - f * 0.11, 0.1], [x - 0.68 - f * 0.06, 2.06 - f * 0.22, 0.11], 0.145, 0.043, c, { sides: 8 });
  }
}
// the Angel saying "Ave", and Mary, "Ecce ancilla Dei"
function annunciation() {
  const s = new Sculpt();
  relief(s);
  figure(s, -0.7, false, -0.08);
  wings(s, -0.7);
  figure(s, 0.8, true);
  return s.build();
}
// David dancing before the Ark, and Michal at her window
function david() {
  const s = new Sculpt();
  relief(s);
  const c = vary(MARBLE, 0.6, 0.08);
  s.box(-0.86, 0.79, 0.06, 0.88, 0.54, 0.46, c);
  s.box(-0.86, 1.08, 0.07, 0.99, 0.12, 0.5, MARBLE);
  s.box(-0.86, 0.66, 0.29, 1.42, 0.065, 0.065, MARBLE);
  for (const x of [-1.09, -0.63]) {
    s.limb([x, 1.12, 0.06], [x, 1.32, 0.11], 0.1, 0.045, c);
    s.limb([x, 1.2, 0.1], [x + (x < -0.86 ? 0.19 : -0.19), 1.43, 0.13], 0.07, 0.03, MARBLE);
  }
  figure(s, 0.2, false, 0.18);
  const sill = 1.61;
  s.box(1.13, sill + 0.42, 0.01, 0.54, 0.84, 0.2, vary(MARBLE, 0.05, 0.25));
  for (const x of [0.85, 1.41]) s.box(x, sill + 0.42, 0.13, 0.07, 0.84, 0.16, c);
  for (const y of [sill, sill + 0.84]) s.box(1.13, y, 0.13, 0.63, 0.09, 0.16, c);
  s.drum(1.13, sill + 0.08, 0.14, 0.1, 0.16, 0.3, c, { sides: 8 });
  s.ball(1.13, sill + 0.46, 0.16, 0.105, c);
  return s.build();
}
// Trajan on his horse, and the widow at his bridle
function trajan() {
  const s = new Sculpt();
  relief(s);
  const c = vary(MARBLE, 0.6, 0.08);
  s.ball(-0.23, 1.03, 0.08, 0.43, c, { sx: 1.62, sy: 0.67, sz: 0.69 });
  for (const [hoof, knee, z] of [[-0.8, -0.65, 0.13], [-0.41, -0.52, 0], [0.13, 0.25, 0], [0.59, 0.37, 0.14]]) {
    s.limb([knee, 0.98, z], [knee + 0.04, 0.46, z + 0.015], 0.105, 0.061, c, { sides: 7 });
    s.limb([knee + 0.04, 0.46, z + 0.015], [hoof, 0.12, z + 0.02], 0.063, 0.055, c, { sides: 7 });
  }
  s.limb([0.28, 1.02, 0.1], [0.55, 1.6, 0.12], 0.24, 0.13, c, { sides: 10 });
  s.limb([0.55, 1.6, 0.12], [0.79, 1.5, 0.17], 0.13, 0.09, c, { sides: 8 });
  s.limb([0.52, 1.63, 0.12], [0.51, 1.79, 0.14], 0.07, 0.025, c, { sides: 6 });
  s.limb([-0.82, 1.05, 0.11], [-0.99, 0.42, 0.12], 0.09, 0.051, c, { sides: 7 });
  s.drum(-0.22, 1.15, 0.15, 0.22, 0.25, 0.59, MARBLE, { sides: 9, rz: -0.09 });
  s.ball(-0.15, 1.9, 0.16, 0.15, MARBLE, { sy: 1.17 });
  s.limb([-0.11, 1.27, 0.29], [0.04, 1.02, 0.37], 0.1, 0.09, MARBLE, { sides: 8 });
  s.limb([0.04, 1.02, 0.37], [-0.13, 0.76, 0.38], 0.09, 0.061, MARBLE, { sides: 8 });
  s.limb([0.02, 1.64, 0.23], [0.33, 1.47, 0.29], 0.094, 0.055, MARBLE, { sides: 8 });
  s.limb([0.33, 1.47, 0.29], [0.66, 1.48, 0.26], 0.021, 0.021, vary(c, 0.1), { sides: 5 });
  figure(s, 1.2, true, 0.1);
  return s.build();
}

// ── The tree of the sixth terrace ───────────────────────────────────────────
// Its boughs widen as they go up, so that no one can climb it; apples among
// its leaves, sweet and grateful to the smell.
function fir() {
  const s = new Sculpt();
  const bark = [0.12, 0.09, 0.06];
  const leaf = [0.05, 0.12, 0.035];
  s.limb([0, -0.2, 0], [0, 7.2, 0], 0.24, 0.14, bark, { sides: 7 });
  const tiers = 6;
  for (let i = 0; i < tiers; i++) {
    const u = i / (tiers - 1);
    const y = 2.2 + u * 4.6;
    const rTop = 0.7 + u * 1.9;
    s.drum(0, y, 0, rTop, rTop * 0.35, 0.75, vary(leaf, (i * 0.31) % 1, 0.2), { sides: 10 });
    for (let k = 0; k < 5 + i * 2; k++) {
      const a = (k / (5 + i * 2)) * Math.PI * 2 + i;
      const rr = rTop * (0.7 + 0.2 * Math.sin(k * 3.1));
      s.ball(Math.cos(a) * rr, y + 0.55, Math.sin(a) * rr, 0.09, k % 3 ? [0.6, 0.06, 0.03] : [0.7, 0.55, 0.08], { coarse: true });
    }
  }
  return s.build();
}

// The water falling on its leaves: a thin sheet, streaming down, clear.
function waterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: SHARED.uTime },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        float streak = vnoise(vec2(vUv.x * 14.0, vUv.y * 2.0 + uTime * 3.2)) * 0.6 + vnoise(vec2(vUv.x * 31.0, vUv.y * 5.0 + uTime * 5.0)) * 0.4;
        float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
        float a = smoothstep(0.35, 0.8, streak) * edge * 0.55;
        gl_FragColor = vec4(vec3(0.75, 0.82, 0.86) * (0.8 + 0.4 * streak), a);
      }`,
  });
}
