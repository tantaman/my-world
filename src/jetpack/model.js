// What the jetpack looks like, made in code like everything else: two white
// tanks with red bands on a dark back plate, a nozzle under each, a control
// box between them with a red light, and a fin on each side; the flames out
// of the nozzles; the vapour the jets leave behind; and the rack it hangs on
// at the launch site, in the launch site's colours.
//
// The jetpack is built in the frame of the hiker's back (Character.addOnBack):
// its origin on the back of the daypack, +z into it, y up the spine. Hung on
// the rack, the same model is turned round to show its tanks. Each is built
// round its own origin and the group is what's placed (render/origin.js).
//
//   makeJetpack() -> { object, nozzles, burn(thrust 0..1) }
//                    nozzles: where the flames come out, to find in the world
//   makeRack()    -> { object, hook }   hook: where the jetpack hangs on it
//   makePuffs()   -> an InstancedMesh of PUFFS puffs, for index.js to fill

import * as THREE from 'three';
import { Mesher } from '../build/geometry.js';
import { lerp } from '../noise.js';

const col = (hex) => new THREE.Color(hex);
const PAL = {
  white: col(0xe9e7e1),
  red: col(0xb8432d),
  plate: col(0x2b2d31),
  steel: col(0x8a8d92),
  metal: col(0x55575c),
  black: col(0x1d1c1b),
  light: col(0xff5a3a),
  yellow: col(0xe2b13a),
  sign: col(0xb8432d),
};
// The jetpack (m, the back's frame): the tanks' radius, how far out to each
// side and behind the back their middles are, how far up and down they run
// from the middle of the pack, and where the nozzles end.
const TANK = { r: 0.075, x: 0.095, z: -0.11, top: 0.225, bottom: -0.24 };
const NOZZLE = { long: 0.075, wide: 0.064 };
// A flame: how long (m) at the least and the most thrust, how wide (times
// the nozzle) likewise, and how much it flickers (0..1).
const FLAME = { long: [0.22, 1.15], wide: [0.75, 1.15], flicker: 0.3 };
// Puffs of vapour at once, at the most.
export const PUFFS = 90;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);

// A box w × h × d with its middle at (x, y, z), turned yaw about y.
function box(m, w, h, d, x, y, z, color, yaw = 0) {
  _q.setFromAxisAngle(_Y, yaw);
  _m.compose(_p.set(x, y, z), _q, _s);
  m.add(new THREE.BoxGeometry(w, h, d), _m, () => color);
}

// A solid of revolution round y from [radius, height] pairs, at (x, y, z),
// coloured by height (paint(y) -> colour).
function lathe(m, profile, segments, x, y, z, paint) {
  const geo = new THREE.LatheGeometry(
    profile.map(([r, h]) => new THREE.Vector2(r, h)),
    segments,
  );
  _m.compose(_p.set(x, y, z), _q.identity(), _s);
  m.add(geo, _m, (p) => paint(p.y));
}

// The jetpack's own geometry and material, made once and shared by every
// jetpack: yours, the one on the rack, and anyone else's.
let packGeo = null;
const packMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25, side: THREE.DoubleSide });
function jetpackGeometry() {
  if (packGeo) return packGeo;
  const m = new Mesher();
  const { r, x, z, top, bottom } = TANK;
  // the back plate, against the pack
  box(m, 0.3, 0.42, 0.03, 0, 0, -0.015, PAL.plate);
  box(m, 0.22, 0.05, 0.035, 0, 0.17, -0.02, PAL.metal);
  for (const s of [-1, 1]) {
    // a tank: white, domed at the top, red bands round it, narrowing to the nozzle
    lathe(
      m,
      [
        [0.001, bottom],
        [0.03, bottom + 0.005],
        [0.05, bottom + 0.02],
        [r * 0.93, bottom + 0.05],
        [r, bottom + 0.07],
        [r, top - 0.075],
        [r * 0.93, top - 0.045],
        [r * 0.73, top - 0.02],
        [r * 0.4, top - 0.004],
        [0.001, top],
      ],
      14,
      s * x,
      0,
      z,
      (y) => (y < bottom + 0.05 ? PAL.steel : (y > 0.06 && y < 0.1) || (y > -0.14 && y < -0.1) ? PAL.red : PAL.white),
    );
    // its nozzle, a bell, open at the bottom
    lathe(
      m,
      [
        [0.028, 0],
        [0.034, -0.02],
        [0.048, -0.05],
        [NOZZLE.wide, -NOZZLE.long],
      ],
      12,
      s * x,
      bottom,
      z,
      () => PAL.metal,
    );
    // a fin on the outside
    box(m, 0.012, 0.15, 0.09, s * (x + r + 0.004), bottom + 0.1, z, PAL.red);
    // and a strut from the plate to the tank
    box(m, 0.02, 0.02, 0.05, s * x, 0.12, -0.045, PAL.metal);
    box(m, 0.02, 0.02, 0.05, s * x, -0.12, -0.045, PAL.metal);
  }
  // the control box between the tanks, and its light
  box(m, 0.05, 0.11, 0.07, 0, 0.13, -0.08, PAL.black);
  box(m, 0.022, 0.022, 0.012, 0, 0.16, -0.118, PAL.light);
  packGeo = m.build();
  return packGeo;
}

// A flame: wide at the nozzle (its origin), its tip 1 m below, so scaling it
// in y sets how long it is.
const flameGeo = new THREE.ConeGeometry(NOZZLE.wide * 0.9, 1, 10, 1, true);
flameGeo.rotateX(Math.PI);
flameGeo.translate(0, -0.5, 0);
const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa64a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff2d0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });

export function makeJetpack() {
  const object = new THREE.Group();
  const body = new THREE.Mesh(jetpackGeometry(), packMat);
  body.castShadow = true;
  body.receiveShadow = true;
  object.add(body);
  const nozzles = [];
  const flames = [];
  for (const s of [-1, 1]) {
    const nozzle = new THREE.Group();
    nozzle.position.set(s * TANK.x, TANK.bottom - NOZZLE.long, TANK.z);
    object.add(nozzle);
    const flame = new THREE.Mesh(flameGeo, flameMat);
    const core = new THREE.Mesh(flameGeo, coreMat);
    core.scale.set(0.5, 0.6, 0.5);
    flame.add(core);
    flame.visible = false;
    nozzle.add(flame);
    nozzles.push(nozzle);
    flames.push(flame);
  }
  return {
    object,
    nozzles,
    // how hard the jets are going, 0..1 (0: out)
    burn(thrust) {
      for (const f of flames) {
        f.visible = thrust > 0.02;
        if (!f.visible) continue;
        const flicker = 1 + FLAME.flicker * (Math.random() - 0.5);
        const w = lerp(FLAME.wide[0], FLAME.wide[1], thrust);
        f.scale.set(w, lerp(FLAME.long[0], FLAME.long[1], thrust) * flicker, w);
      }
    },
  };
}

// The rack: a striped base, two steel posts and a bar across, a red board on
// top, and a hook on the bar the jetpack hangs from, its tanks out to the
// front (+z, the way the rack faces).
export function makeRack() {
  const m = new Mesher();
  box(m, 0.9, 0.06, 0.55, 0, 0.03, 0, PAL.yellow);
  for (const x of [-0.3, 0, 0.3]) box(m, 0.1, 0.062, 0.56, x, 0.031, 0, PAL.black);
  for (const s of [-1, 1]) box(m, 0.06, 1.6, 0.06, s * 0.3, 0.86, -0.12, PAL.steel);
  box(m, 0.66, 0.06, 0.06, 0, 1.5, -0.12, PAL.steel);
  box(m, 0.03, 0.1, 0.05, 0, 1.43, -0.1, PAL.metal);
  box(m, 0.64, 0.18, 0.03, 0, 1.68, -0.12, PAL.sign);
  box(m, 0.5, 0.035, 0.032, 0, 1.69, -0.12, PAL.white);
  box(m, 0.08, 0.06, 0.08, 0, 1.8, -0.12, PAL.yellow);
  const object = new THREE.Group();
  const body = new THREE.Mesh(m.build(), packMat);
  body.castShadow = true;
  body.receiveShadow = true;
  object.add(body);
  const hook = new THREE.Group();
  hook.position.set(0, 1.25, -0.09);
  hook.rotation.y = Math.PI;
  object.add(hook);
  return { object, hook };
}

// Vapour out of the jets: pale puffs that grow as they drift and thin out.
export function makePuffs() {
  const puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xe8e6e1, emissive: 0x5a5856, transparent: true, opacity: 0.45, depthWrite: false }), PUFFS);
  puffs.count = 0;
  puffs.frustumCulled = false;
  puffs.castShadow = false;
  return puffs;
}
