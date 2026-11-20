// The radio everyone carries: a little yellow walkie-talkie, clipped to the
// left shoulder strap of the pack, that comes up to the mouth to talk into.
//
// Two copies, because one object can't be in two places: one rides in the
// left hand (gripped at its origin, its top along -y, see
// Character.addRaised), and one stays on the strap (in the chest's frame).

import * as THREE from 'three';

// Where it rides on the strap, in the chest's frame (m): low on the left
// strap, under the end of the hydration hose.
const ON_STRAP = { x: 0.105, y: 0.215, z: 0.168 };

let materials = null;
function parts() {
  if (!materials) {
    const M = (hex, rough = 0.6) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0 });
    materials = { body: M(0xe0b02a, 0.5), black: M(0x1b1c1d, 0.75), grille: M(0x3a3b3a, 0.9) };
  }
  return materials;
}

// The radio, standing upright from its origin along `dir` (+1: up the y axis,
// -1: down it), its face toward +z.
function radio(dir) {
  const m = parts();
  const g = new THREE.Group();
  const add = (geo, mat, y, z = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, y * dir, z);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  // body, a rubber band round its middle, the speaker grille, the antenna
  add(new THREE.BoxGeometry(0.058, 0.12, 0.034), m.body, 0.035);
  add(new THREE.BoxGeometry(0.062, 0.024, 0.038), m.black, 0.0);
  add(new THREE.BoxGeometry(0.04, 0.04, 0.004), m.grille, 0.062, 0.018);
  const antenna = add(new THREE.CylinderGeometry(0.006, 0.009, 0.09, 6), m.black, 0.14);
  antenna.position.x = -0.016;
  return g;
}

// -> { held, stowed }, ready for character.addRaised('radio', held, { stowed })
export function walkie() {
  // in the hand the radio's top points along -y, past the fingers to the mouth
  const held = radio(-1);
  held.position.y = 0.025;
  const stowed = radio(1);
  stowed.position.set(ON_STRAP.x, ON_STRAP.y, ON_STRAP.z);
  stowed.rotation.x = -0.08; // leaning back against the strap
  return { held, stowed };
}
