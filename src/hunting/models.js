// What hunting looks like, from primitives like everything else: the rifle,
// the spit over the fire, and a roast cut to eat.

import * as THREE from 'three';

const mat = (hex, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal });
const shadowed = (g) => {
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
};

// How far from the hand (along -y, which is ahead once it is shouldered) the
// muzzle is, in metres.
export const MUZZLE = 0.8;

// A bolt-action hunting rifle with a scope, gripped at the wrist of the
// stock. As held tools are (see build/geometry.js), the muzzle is along -y;
// the stock runs back along +y to the shoulder. Shouldered, +z is up, so the
// scope is on +z, and -x is the right hand's side, so the bolt is on -x.
export function makeRifle() {
  const g = new THREE.Group();
  const wood = mat(0x6e4426, 0.7);
  const steel = mat(0x2a2c2e, 0.4, 0.7);
  const glass = mat(0x15171a, 0.3, 0.5);
  const box = (x, y, z, m, px, py, pz, rx = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), m);
    b.position.set(px, py, pz);
    b.rotation.x = rx;
    g.add(b);
    return b;
  };
  const rod = (r0, r1, len, m, px, py, pz, segs = 6) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, segs), m);
    c.position.set(px, py, pz);
    g.add(c);
    return c;
  };
  // the stock: the wrist in the hand, dropping to the butt at the shoulder
  box(0.034, 0.12, 0.05, wood, 0, 0.04, -0.012);
  box(0.04, 0.24, 0.085, wood, 0, 0.2, -0.04, -0.12);
  box(0.042, 0.02, 0.1, mat(0x1c1a18, 0.9), 0, 0.325, -0.055, -0.12); // the butt pad
  // the action, the trigger guard and the bolt on its right side
  box(0.036, 0.2, 0.04, steel, 0, -0.1, 0.012);
  box(0.006, 0.05, 0.03, steel, 0, -0.01, -0.035);
  const bolt = rod(0.006, 0.006, 0.05, steel, -0.035, -0.06, 0.02);
  bolt.rotation.z = Math.PI / 2;
  // the fore-end under the barrel, and the barrel
  box(0.036, 0.36, 0.04, wood, 0, -0.36, -0.006);
  rod(0.009, 0.012, 0.6, steel, 0, -MUZZLE + 0.3, 0.016);
  // the scope on its rings
  rod(0.019, 0.019, 0.22, glass, 0, -0.12, 0.072, 8);
  rod(0.024, 0.019, 0.04, glass, 0, -0.25, 0.072, 8);
  rod(0.022, 0.019, 0.035, glass, 0, 0.005, 0.072, 8);
  for (const y of [-0.06, -0.17]) box(0.012, 0.012, 0.04, steel, 0, y, 0.045);
  shadowed(g);

  // The flash at the muzzle when it fires, out ahead of the barrel: shown for
  // an instant by whoever fires it (flash.visible).
  const flash = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.9 }));
  flash.rotation.x = Math.PI; // its point away from the barrel
  flash.position.set(0, -MUZZLE - 0.1, 0.016);
  flash.visible = false;
  flash.name = 'flash';
  g.add(flash);
  return g;
}

// ── The spit ────────────────────────────────────────────────────────────────
// Two forked sticks either side of the fire ring and a green stick across
// them, the cuts threaded on it: how high over the fire's floor (m, clear of
// the top of a teepee of firewood, at about 0.6), how far out either side
// the sticks stand (m, clear of the ring), and where along it the cuts go.
export const SPIT = { height: 0.82, span: 0.78, cuts: [-0.24, 0, 0.24] };

const stick = mat(0x7a5a38, 0.9);
const green = mat(0x8a7a4a, 0.85);

// The frame, in the spit's own frame (+x along the crossbar).
export function makeSpitFrame() {
  const g = new THREE.Group();
  const add = (geo, m, x, y, z, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.z = rz;
    g.add(mesh);
  };
  for (const side of [-1, 1]) {
    const x = side * SPIT.span;
    add(new THREE.CylinderGeometry(0.022, 0.028, SPIT.height + 0.1, 5), stick, x, (SPIT.height + 0.1) / 2 - 0.08, 0);
    // the fork the crossbar rests in
    add(new THREE.CylinderGeometry(0.014, 0.018, 0.14, 4), stick, x + 0.035, SPIT.height + 0.07, 0, -0.5);
    add(new THREE.CylinderGeometry(0.014, 0.018, 0.14, 4), stick, x - 0.035, SPIT.height + 0.07, 0, 0.5);
  }
  add(new THREE.CylinderGeometry(0.014, 0.014, SPIT.span * 2 + 0.3, 5), green, 0, SPIT.height + 0.02, 0, Math.PI / 2);
  return shadowed(g);
}

// One cut of meat, threaded on the crossbar. Its colour is how done it is.
export function makeCut() {
  const geo = new THREE.SphereGeometry(1, 7, 5);
  geo.scale(0.1, 0.075, 0.085);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xa8423c, roughness: 0.55, metalness: 0 }));
  m.castShadow = true;
  return m;
}

// ── A roast cut, to eat ─────────────────────────────────────────────────────
// Held in the left hand and raised to the mouth (Character.addRaised): its
// top along -y.
export function makeRoast() {
  const g = new THREE.Group();
  const meat = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5).scale(0.045, 0.07, 0.04), mat(0x7a4422, 0.55));
  meat.position.y = -0.07;
  g.add(meat);
  const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.08, 5), mat(0xe8dcc0, 0.7));
  bone.position.y = 0.0;
  g.add(bone);
  return shadowed(g);
}
