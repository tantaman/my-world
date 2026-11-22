// What the hunt club's things look like, from primitives like everything
// else: the shotgun you're given, and a clay target.

import * as THREE from 'three';

const mat = (hex, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal });
const shadowed = (g) => {
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
};

// How far from the hand the muzzles are (m), along -y as held tools are.
export const MUZZLE = 0.86;
// The hinge the barrels drop open on, below the front of the action: its
// place in the gun's frame (y, z).
const HINGE = { y: -0.13, z: -0.012 };
// How far (radians) the barrels drop when the gun is broken open to load.
export const OPEN = 0.62;

// An over-and-under shotgun, gripped at the wrist of the stock. As held
// tools are (see build/geometry.js), the muzzles are along -y and the stock
// runs back along +y to the shoulder; shouldered, +z is up (the rib and its
// bead on top) and -x is the right hand's side.
//
// The barrels and the fore-end under them are a group of their own, named
// 'barrels', that turns about the hinge (rotation.x, up to OPEN) to break the
// gun open; and the flash at the muzzles is named 'flash'.
export function makeShotgun() {
  const g = new THREE.Group();
  const wood = mat(0x7a4a26, 0.55);
  const steel = mat(0x26282b, 0.35, 0.8);
  const silver = mat(0xb8b6b0, 0.3, 0.9);
  const box = (parent, x, y, z, m, px, py, pz, rx = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), m);
    b.position.set(px, py, pz);
    b.rotation.x = rx;
    parent.add(b);
    return b;
  };
  const rod = (parent, r, len, m, px, py, pz, segs = 8) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, segs), m);
    c.position.set(px, py, pz);
    parent.add(c);
    return c;
  };
  // the stock: the wrist in the hand, dropping to the butt at the shoulder
  box(g, 0.034, 0.12, 0.046, wood, 0, 0.045, -0.014);
  box(g, 0.04, 0.25, 0.08, wood, 0, 0.21, -0.042, -0.13);
  box(g, 0.042, 0.02, 0.095, mat(0x1c1a18, 0.9), 0, 0.34, -0.06, -0.13); // the recoil pad
  // the action: bright steel, the trigger guard under it, the lever on top
  box(g, 0.04, 0.1, 0.055, silver, 0, -0.075, 0.008);
  box(g, 0.006, 0.05, 0.028, steel, 0, -0.03, -0.032);
  box(g, 0.012, 0.025, 0.008, silver, 0, -0.03, 0.04);
  // the barrels, one over the other, with the rib along the top and the bead
  // at its end; the fore-end of the stock under them
  const barrels = new THREE.Group();
  barrels.name = 'barrels';
  barrels.position.set(0, HINGE.y, HINGE.z);
  g.add(barrels);
  const len = MUZZLE + HINGE.y; // from the hinge to the muzzles (HINGE.y is negative)
  rod(barrels, 0.0105, len, steel, 0, -len / 2, 0.012 - HINGE.z);
  rod(barrels, 0.0105, len, steel, 0, -len / 2, 0.034 - HINGE.z);
  box(barrels, 0.008, len, 0.006, steel, 0, -len / 2, 0.048 - HINGE.z);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 6, 4), mat(0xf4f0e0, 0.4, 0.2));
  bead.position.set(0, -len + 0.004, 0.053 - HINGE.z);
  barrels.add(bead);
  box(barrels, 0.036, 0.25, 0.034, wood, 0, -0.17, -0.004 - HINGE.z);
  shadowed(g);

  // The flash at the muzzle when it fires: shown for an instant by whoever
  // fires it (flash.visible).
  const flash = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 7), new THREE.MeshBasicMaterial({ color: 0xffdc96, transparent: true, opacity: 0.9 }));
  flash.rotation.x = Math.PI;
  flash.position.set(0, -MUZZLE - 0.12, 0.023);
  flash.visible = false;
  flash.name = 'flash';
  g.add(flash);
  return g;
}

// ── A clay target ───────────────────────────────────────────────────────────
// A shallow dome of pitch, 11 cm across, painted orange all over its dome so
// it shows against the trees; its underside black, which shows against the
// sky. Drawn a little bigger than it is (SEEN), so it can be made out at the
// size of a screen: what a shot breaks is reckoned at its true size
// (skeet.js CLAY.r).
const SEEN = 1.25;
const pitch = mat(0x1e1c1a, 0.7);
const paint = mat(0xf2621c, 0.55);
const DOME = new THREE.CylinderGeometry(0.036 * SEEN, 0.055 * SEEN, 0.026 * SEEN, 14);
export function makeClay() {
  // the cylinder's side, its top, its bottom
  const dome = new THREE.Mesh(DOME, [paint, paint, pitch]);
  dome.castShadow = true;
  return dome;
}
