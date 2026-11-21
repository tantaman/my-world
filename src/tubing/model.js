// What the inner tube looks like, made in code like everything else: a fat
// ring of black rubber, sun-faded to grey on top and wet and dark below,
// with its valve standing in towards the hole and a patch where it's been
// mended.
//
// Built round its own middle, flat on the water with the hole up the y axis
// and the valve at the back (-z): the mesh is put in the world, not the
// geometry (render/origin.js).
//
//   tubeGeometry()  -> BufferGeometry, vertex coloured
//   makeTube()      -> a Mesh of it, in wet rubber

import * as THREE from 'three';
import { Mesher } from '../build/geometry.js';
import { TUBE } from './tube.js';

const PAL = {
  rubber: new THREE.Color(0x1c1c1e),
  faded: new THREE.Color(0x3a3a3c), // on top, where the sun gets at it
  wet: new THREE.Color(0x121213), // underneath, in the water
  patch: new THREE.Color(0x4a2a24), // a mended patch, of redder rubber
  seam: new THREE.Color(0x2c2c2e), // the moulding line round the outside
  valve: new THREE.Color(0x9a958a),
  cap: new THREE.Color(0x141414),
};
// How finely it's made: round the ring, and round the tube.
const ALONG = 28;
const ROUND = 12;
// The mended patch: where round the ring (radians from the front) and how
// big (radians round the ring, and of the tube's own round).
const PATCH = { at: 2.2, wide: 0.22, tall: 0.9 };

const _m = new THREE.Matrix4();

export function tubeGeometry() {
  const m = new Mesher();
  const R = TUBE.r - TUBE.ring; // to the middle of the tube itself
  const torus = new THREE.TorusGeometry(R, TUBE.ring, ROUND, ALONG);
  // (a torus is made round z: lay it flat, the hole up)
  _m.makeRotationX(-Math.PI / 2);
  m.add(torus, _m, (p, n, c) => {
    // p is still in the torus's own frame here: z is up out of the water
    const around = Math.atan2(p.x, -p.y); // 0 at the front (+z once laid flat)
    const up = n.z;
    c.copy(PAL.rubber).lerp(up > 0 ? PAL.faded : PAL.wet, Math.abs(up) * 0.7);
    const out = Math.hypot(p.x, p.y) > R + TUBE.ring * 0.96;
    if (out && Math.abs(up) < 0.12) c.copy(PAL.seam);
    const da = Math.atan2(Math.sin(around - PATCH.at), Math.cos(around - PATCH.at));
    if (Math.abs(da) < PATCH.wide && up > 1 - PATCH.tall) c.copy(PAL.patch);
    return c;
  });
  // the valve: a stem standing in from the inside of the ring at the back,
  // tipped up, with its cap
  const stem = new THREE.CylinderGeometry(0.011, 0.013, 0.07, 6);
  _m.makeRotationX(Math.PI / 2 - 0.5).setPosition(0, 0.03, -(R - TUBE.ring) + 0.02);
  m.add(stem, _m, (p, n, c) => c.copy(PAL.valve));
  const cap = new THREE.CylinderGeometry(0.014, 0.014, 0.02, 6);
  _m.makeRotationX(Math.PI / 2 - 0.5).setPosition(0, 0.045, -(R - TUBE.ring) + 0.05);
  m.add(cap, _m, (p, n, c) => c.copy(PAL.cap));
  return m.build();
}

// One shared material: rubber, glossy where it's wet.
let material = null;
export function tubeMaterial() {
  return (material ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0 }));
}

export function makeTube(geometry = tubeGeometry()) {
  const mesh = new THREE.Mesh(geometry, tubeMaterial());
  mesh.castShadow = true;
  mesh.rotation.order = 'YXZ';
  return mesh;
}
