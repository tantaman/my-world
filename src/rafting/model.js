// What the whitewater raft looks like, made in code like everything else:
// a fat tube of yellow fabric right round it, swept up at the bow and the
// stern, two cross-tubes to brace your feet against, a grey floor laced in
// between, and a grab line slung round the outside on D-rings. And the
// paddle a rafter holds: a black shaft, a T-grip, and a broad yellow blade.
//
// Built round its own middle, level, the bow along +z and its left along +x:
// the mesh is put in the world, not the geometry (render/origin.js).
//
//   makeRaft(colour?)   -> a Group: the raft
//   makeRaftPaddle()    -> a Group, gripped at its origin, blade along -y,
//                          with an Object3D named 'blade' at the blade's tip

import * as THREE from 'three';
import { RAFT } from './raft.js';

// The colours rafts come in; the first is yours, unless you've another.
export const COLOURS = [0xf2c230, 0xd6402e, 0x2f6fc4, 0x2f9e6a];
const PAL = {
  floor: 0x5a5d61,
  rope: 0x1d2a3a,
  ring: 0x9aa0a6,
  shaft: 0x1b1c1e,
  blade: 0xf2c230,
};
// How the tube goes round: half its length and beam to the middle of the
// tube (m), how square its ends are (a superellipse's power: 2 is an
// ellipse), and how high its bow and stern sweep up (m).
const HULL = { a: RAFT.beam / 2 - RAFT.tube, b: RAFT.len / 2 - RAFT.tube, square: 3.2, rise: 0.32 };
// How finely: round the hull, and round the tube.
const ALONG = 72;
const ROUND = 10;
// The cross-tubes: how far forward of the middle (m), and how fat.
const THWARTS = { at: [-0.45, 0.75], r: 0.15 };
// The floor's top, under the middle of the tube (m), and how thick it is.
const FLOOR = { y: -0.17, thick: 0.1 };
// The grab line: how far out of the tube (m), and the D-rings it's slung
// from, this many round the hull.
const LINE = { out: 0.04, r: 0.012, rings: 14, sag: 0.05 };

// How far (m) the tube's middle sweeps up at f m along from the raft's middle.
export function tubeRise(f) {
  return HULL.rise * Math.min(1, Math.abs(f) / HULL.b) ** 4;
}

// The middle of the tube, t = 0..1 round from the bow, anticlockwise from
// above (to the left first): { x, y, z }.
function hullAt(t, out = new THREE.Vector3()) {
  const a = t * Math.PI * 2;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const e = 2 / HULL.square;
  const z = HULL.b * Math.sign(c) * Math.abs(c) ** e;
  const x = HULL.a * Math.sign(s) * Math.abs(s) ** e;
  return out.set(x, tubeRise(z), z);
}

class HullCurve extends THREE.Curve {
  constructor(off = 0, dy = 0, sag = 0) {
    super();
    this.off = off;
    this.dy = dy;
    this.sag = sag;
  }
  getPoint(t, out = new THREE.Vector3()) {
    hullAt(t, out);
    if (this.off) {
      // outward, across the hull's own line
      const n = hullAt((t + 0.001) % 1, new THREE.Vector3()).sub(hullAt(t, new THREE.Vector3()));
      const ox = n.z;
      const oz = -n.x;
      const l = Math.hypot(ox, oz) || 1;
      out.x -= (ox / l) * this.off;
      out.z -= (oz / l) * this.off;
    }
    out.y += this.dy - (this.sag ? this.sag * Math.abs(Math.sin(t * Math.PI * LINE.rings)) : 0);
    return out;
  }
}

export function makeRaft(colour = COLOURS[0]) {
  const g = new THREE.Group();
  const fabric = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.55 });
  const grey = new THREE.MeshStandardMaterial({ color: PAL.floor, roughness: 0.85 });
  // the tube right round
  const tube = new THREE.Mesh(new THREE.TubeGeometry(new HullCurve(), ALONG, RAFT.tube, ROUND, true), fabric);
  g.add(tube);
  // the cross-tubes, from side to side
  for (const z of THWARTS.at) {
    const w = HULL.a * 2;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(THWARTS.r, THWARTS.r, w, ROUND), fabric);
    t.rotation.z = Math.PI / 2;
    t.position.set(0, -0.02, z);
    g.add(t);
  }
  // the floor, laced in under the tube
  const shape = new THREE.Shape();
  const p = new THREE.Vector3();
  for (let i = 0; i <= 48; i++) {
    hullAt(i / 48, p);
    const k = 0.96;
    if (i === 0) shape.moveTo(p.x * k, -p.z * k);
    else shape.lineTo(p.x * k, -p.z * k);
  }
  const floorGeo = new THREE.ExtrudeGeometry(shape, { depth: FLOOR.thick, bevelEnabled: false });
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, grey);
  floor.position.y = FLOOR.y - FLOOR.thick;
  g.add(floor);
  // the grab line, slung between D-rings round the outside
  const rope = new THREE.MeshStandardMaterial({ color: PAL.rope, roughness: 0.9 });
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new HullCurve(RAFT.tube + LINE.out, 0.02, LINE.sag), ALONG * 2, LINE.r, 4, true), rope));
  const steel = new THREE.MeshStandardMaterial({ color: PAL.ring, roughness: 0.4, metalness: 0.6 });
  const ringGeo = new THREE.TorusGeometry(0.035, 0.008, 4, 8);
  const curve = new HullCurve(RAFT.tube + 0.01, 0.03);
  for (let i = 0; i < LINE.rings; i++) {
    const r = new THREE.Mesh(ringGeo, steel);
    curve.getPoint(i / LINE.rings, r.position);
    r.lookAt(r.position.x * 2, r.position.y, r.position.z * 2);
    g.add(r);
  }
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  g.userData.fabric = fabric;
  return g;
}

// The whitewater paddle: gripped at its origin by the T-grip, blade down -y.
export const RAFT_PADDLE = { len: 1.5 };
export function makeRaftPaddle() {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: PAL.shaft, roughness: 0.5 });
  const yellow = new THREE.MeshStandardMaterial({ color: PAL.blade, roughness: 0.6 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.12, 6), black);
  shaft.position.y = -0.52;
  g.add(shaft);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.035), black);
  grip.position.y = 0.035;
  g.add(grip);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.46, 0.018), yellow);
  blade.position.y = -RAFT_PADDLE.len + 0.25;
  g.add(blade);
  const tip = new THREE.Object3D();
  tip.name = 'blade';
  tip.position.y = -RAFT_PADDLE.len + 0.06;
  g.add(tip);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}
