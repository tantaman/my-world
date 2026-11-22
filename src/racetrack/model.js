// The cars, made in code from boxes and cylinders, like everything else.
//
// On a road circuit, an open-wheeler: a narrow tub with the driver sat low
// in it, a nose with a wing across the front, pods either side, the engine
// cover behind the driver's head and a wing up at the back. On a dirt oval,
// a sprint car: the same, taller, with a big wing on struts over the driver
// and a smaller one over the front wheels. Each in its colours with its
// number on its sides, and the wheels turn and spin.
//
// makeCar({ colour, number, sprint, driver }) -> {
//   object        a Group, the car's middle on the ground at its origin,
//                 facing +z
//   seat          where the driver's hips are, in the car's frame
//   pose(car)     turns the wheels for car.wheel and car.spin (car.js's)
//   dispose()
// }
//   driver   true for someone else's car: a helmet in the cockpit (yours
//            has you in it)

import * as THREE from 'three';
import { Kit } from '../videostore/store.js';

const WHEELS = {
  front: { z: 1.25, x: 0.78, r: 0.3, w: 0.26 },
  rear: { z: -1.25, x: 0.76, r: 0.36, w: 0.36 },
};
export const SEAT = { x: 0, y: 0.2, z: -0.2 }; // the driver's hips, in the car's frame
const TYRE = new THREE.Color(0x1b1b1d);
const RIM = new THREE.Color(0xb8bcc2);
const DARK = new THREE.Color(0x202226);
const WHITE = new THREE.Color(0xf2f2ee);
const VISOR = new THREE.Color(0x15181c);

export function makeCar({ colour = 0xd8302a, number = 1, sprint = false, driver = false, material }) {
  const body = new THREE.Color(colour);
  const trim = body.clone().lerp(WHITE, 0.55);
  const object = new THREE.Group();
  const k = new Kit();
  const up = sprint ? 0.12 : 0; // a sprint car sits higher

  // the tub, the nose and the wing across the front
  k.box(-0.36, 0.1 + up, -1.15, 0.36, 0.52 + up, 1.0, body);
  k.box(-0.24, 0.14 + up, 1.0, 0.24, 0.44 + up, 1.5, body);
  k.box(-0.16, 0.16 + up, 1.5, 0.16, 0.36 + up, 2.0, body);
  if (!sprint) {
    k.box(-0.98, 0.07, 1.72, 0.98, 0.13, 2.06, DARK);
    for (const s of [-1, 1]) k.box(s * 0.98 - 0.03, 0.06, 1.68, s * 0.98 + 0.03, 0.3, 2.08, body);
  } else {
    k.box(-0.5, 0.18, 1.85, 0.5, 0.26, 2.05, DARK); // a nudge bar
  }
  // the pods either side, with a stripe of the lighter colour
  for (const s of [-1, 1]) {
    k.box(s > 0 ? 0.36 : -0.72, 0.1 + up, -0.95, s > 0 ? 0.72 : -0.36, 0.44 + up, 0.45, body);
    k.box(s > 0 ? 0.72 : -0.725, 0.3 + up, -0.95, s > 0 ? 0.725 : -0.72, 0.38 + up, 0.45, trim);
  }
  // the cockpit's rim, and the engine cover rising behind it
  k.box(-0.37, 0.52 + up, -0.55, 0.37, 0.6 + up, 0.55, DARK, 'y-');
  k.box(-0.3, 0.45 + up, -1.55, 0.3, 0.78 + up, -0.55, body);
  k.box(-0.14, 0.78 + up, -0.85, 0.14, 0.98 + up, -0.55, DARK); // the air box
  // its number, on either side of the engine cover
  for (const s of [-1, 1]) {
    k.box(s > 0 ? 0.3 : -0.305, 0.5 + up, -1.38, s > 0 ? 0.305 : -0.3, 0.74 + up, -0.72, WHITE);
    k.words(String(number), s * 0.31, 0.62 + up, -1.05, s, 0, 0.026, DARK);
  }
  // the wings: low at the back, or a sprint car's tall ones on struts
  if (!sprint) {
    k.box(-0.05, 0.6, -1.85, 0.05, 0.9, -1.6, DARK);
    k.box(-0.62, 0.86, -2.0, 0.62, 0.94, -1.62, body);
    for (const s of [-1, 1]) k.box(s * 0.62 - 0.03, 0.62, -2.04, s * 0.62 + 0.03, 1.0, -1.58, DARK);
  } else {
    const top = 1.75;
    for (const [x, z] of [[-0.3, 0.4], [0.3, 0.4], [-0.3, -0.9], [0.3, -0.9]]) k.box(x - 0.025, 0.6, z - 0.025, x + 0.025, top, z + 0.025, DARK);
    k.box(-0.62, top, -1.25, 0.62, top + 0.05, 0.75, body);
    for (const s of [-1, 1]) {
      k.box(s * 0.64 - 0.03, top - 0.35, -1.35, s * 0.64 + 0.03, top + 0.4, 0.8, trim);
      k.words(String(number), s * 0.68, top + 0.02, -0.3, s, 0, 0.05, DARK);
    }
    k.box(-0.42, 0.95, 1.05, 0.42, 0.98, 1.55, body);
    for (const x of [-0.2, 0.2]) k.box(x - 0.02, 0.5, 1.28, x + 0.02, 0.95, 1.32, DARK);
  }
  // someone else's car: a helmet and shoulders in the cockpit
  if (driver) {
    k.box(-0.25, 0.5 + up, -0.5, 0.25, 0.72 + up, -0.22, DARK);
    k.box(-0.15, 0.72 + up, -0.48, 0.15, 1.0 + up, -0.18, trim);
    k.box(-0.13, 0.82 + up, -0.19, 0.13, 0.9 + up, -0.17, VISOR);
  }
  const mesh = new THREE.Mesh(k.build(), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  object.add(mesh);

  // the wheels: each a group that turns (the fronts, to steer) holding a
  // tyre and a rim that spin
  const wheels = [];
  for (const [end, W] of Object.entries(WHEELS)) {
    for (const s of [-1, 1]) {
      const turn = new THREE.Group();
      turn.position.set(s * W.x, W.r, W.z);
      const spin = new THREE.Group();
      const tyre = new THREE.Mesh(painted(new THREE.CylinderGeometry(W.r, W.r, W.w, 18), TYRE), material);
      tyre.rotation.z = Math.PI / 2;
      tyre.castShadow = true;
      const rim = new THREE.Mesh(painted(new THREE.BoxGeometry(W.w + 0.02, W.r * 1.1, 0.12), RIM), material);
      const spoke = rim.clone();
      spoke.rotation.x = Math.PI / 2;
      spin.add(tyre, rim, spoke);
      turn.add(spin);
      object.add(turn);
      wheels.push({ turn, spin, front: end === 'front' });
    }
  }

  return {
    object,
    seat: { x: SEAT.x, y: SEAT.y + up, z: SEAT.z },
    pose(car) {
      for (const w of wheels) {
        w.spin.rotation.x = car.spin;
        w.turn.rotation.y = w.front ? car.wheel : 0;
      }
    },
    dispose() {
      object.traverse((o) => o.isMesh && o.geometry.dispose());
    },
  };
}

// A geometry all of one colour, for a material that takes its colours from
// the vertices.
function painted(geometry, color) {
  const n = geometry.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([color.r, color.g, color.b], i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geometry;
}
