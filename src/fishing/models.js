// What fishing looks like, from primitives like everything else: the rod
// the hiker holds, and a fish held up once it's caught.

import * as THREE from 'three';
import { FISH } from '../underwater/fish.js';
import { fishShape } from '../underwater/shapes.js';

const mat = (hex, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal });

// From the grip to the tip (m).
export const ROD = { len: 2.3, joint: 1.15 };

// A two-piece rod, gripped at the cork. As held tools are (see
// build/geometry.js), it runs along -y from the hand. The top piece is the
// child named 'top', turned at the joint to bend the rod under a fish; the
// tip, where the line leaves it, is the child of that named 'tip'.
export function makeRod() {
  const g = new THREE.Group();
  const cork = mat(0xb08a5a, 0.9);
  const blank = mat(0x2f3a26, 0.5);
  const steel = mat(0x8a8d90, 0.45, 0.6);
  const rod = (r0, r1, len, m, y, parent = g) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 6), m);
    c.position.y = y - len / 2;
    parent.add(c);
    return c;
  };
  rod(0.02, 0.017, 0.34, cork, 0.14); // the handle
  // the reel, under the handle, and its crank
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), steel);
  reel.rotation.z = Math.PI / 2;
  reel.position.set(0, 0.05, -0.05);
  g.add(reel);
  const crank = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.05), steel);
  crank.position.set(0.025, 0.05, -0.06);
  g.add(crank);
  rod(0.013, 0.009, ROD.joint - 0.2, blank, -0.2);
  const top = new THREE.Group();
  top.name = 'top';
  top.position.y = -ROD.joint;
  g.add(top);
  rod(0.009, 0.004, ROD.len - ROD.joint, blank, 0, top);
  const tip = new THREE.Object3D();
  tip.name = 'tip';
  tip.position.y = -(ROD.len - ROD.joint);
  top.add(tip);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}

// A fish held up by the tail, head down, for the hiker to look at: one of
// each kind, made as they're first caught, and sized to the one in hand.
// As things raised to the face are (Character.addRaised), its top is along -y.
export class Caught {
  constructor() {
    this.object = new THREE.Group();
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    // nose (+z in its shape) along +y, which hangs down once it's raised:
    // the tail, at the top, is in the hand
    this.mesh.rotation.x = -Math.PI / 2;
    this.object.add(this.mesh);
    this.geos = {};
  }

  // Show `fish` ({ kind, len }).
  show(fish) {
    const kind = fish.kind;
    if (!this.geos[kind]) this.geos[kind] = fishShape(FISH[kind].look);
    this.mesh.geometry = this.geos[kind];
    this.mesh.scale.setScalar(fish.len);
    this.mesh.position.y = fish.len * 0.65;
  }
}
