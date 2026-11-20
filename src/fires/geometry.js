// The pieces of a campfire, as vertex-coloured geometry like everything else
// that is built: a ring of stones round a scraped pit, split wood stood up in
// a teepee, and the bed of ash and charred ends a fire leaves.
//
// All three are built around the fire's centre at the origin, y = the floor
// of the pit, which is scraped a little below the ground around it.

import * as THREE from 'three';
import { WOOD, alongMatrix } from '../build/geometry.js';
import { phash } from '../noise.js';

const lin = (hex) => new THREE.Color(hex);
const EARTH = lin(0x4a3524);
const CHAR = lin(0x1c1814);
const ASH = lin(0x77716a);

// A ring of fieldstones half sunk in the ground, round a scraped earth floor.
export function addFireRing(m, seed, r = 0.55) {
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (phash(seed, i, 1) - 0.5) * 0.35;
    const rr = r + (phash(seed, i, 2) - 0.5) * 0.06;
    const s = 0.12 + phash(seed, i, 3) * 0.05;
    const mat = new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(a) * rr, 0.035 + s * 0.2, Math.sin(a) * rr),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(phash(seed, i, 4) * 0.6, phash(seed, i, 5) * 6, 0)),
      new THREE.Vector3(1.25 + phash(seed, i, 6) * 0.3, 0.75, 1),
    );
    m.add(new THREE.IcosahedronGeometry(s, 0), mat, (p, nn, out) => {
      out.copy(WOOD.stoneDark).lerp(WOOD.stone, 0.35 + Math.max(0, nn.y) * 0.45 + phash(p.x * 13, p.y * 13, p.z * 13 + seed) * 0.25);
      // the inner faces are smoked
      if (nn.x * Math.cos(a) + nn.z * Math.sin(a) < -0.3) out.lerp(CHAR, 0.45);
      return out;
    });
  }
  // the floor, dished so its rim tucks under the ground
  const floor = new THREE.CircleGeometry(r - 0.04, 14, 0, Math.PI * 2).rotateX(-Math.PI / 2);
  m.add(
    floor,
    new THREE.Matrix4(),
    (p, nn, out) => out.copy(EARTH).multiplyScalar(0.7 + phash(Math.round(p.x * 20), Math.round(p.z * 20), seed) * 0.35),
    (p) => {
      const rho = Math.hypot(p.x, p.z) / r;
      p.y = 0.012 + 0.06 * rho * rho;
    },
  );
}

// Split firewood stood up in a teepee over a heart of kindling. Its tip is
// about half a metre up.
export function addFirewood(m, seed) {
  const n = 7;
  const top = new THREE.Vector3(0, 0.52, 0);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (phash(seed, i, 7) - 0.5) * 0.5;
    const r = 0.25 + phash(seed, i, 8) * 0.06;
    const foot = new THREE.Vector3(Math.cos(a) * r, 0.02, Math.sin(a) * r);
    const tip = top.clone().add(new THREE.Vector3((phash(seed, i, 9) - 0.5) * 0.08, (phash(seed, i, 10) - 0.5) * 0.08, (phash(seed, i, 11) - 0.5) * 0.08));
    const dir = tip.clone().sub(foot);
    const len = dir.length() + 0.08;
    const mid = foot.clone().addScaledVector(dir, 0.5);
    const w = 0.06 + phash(seed, i, 12) * 0.03;
    // a split quarter: one rounded bark side, two pale split faces
    m.add(new THREE.CylinderGeometry(w, w * 1.15, len, 4, 1), alongMatrix(dir.normalize(), mid.x, mid.y, mid.z, a), (p, nn, out) => {
      if (Math.abs(nn.y) > 0.9) return out.copy(WOOD.endLight).lerp(WOOD.endDark, 0.3);
      const bark = nn.x + nn.z > 0.4;
      out.copy(bark ? WOOD.barkDark : WOOD.hewn).lerp(bark ? WOOD.bark : WOOD.endLight, phash(i, p.y * 7, seed) * 0.6);
      return out;
    });
  }
  // kindling: a tangle of thin sticks inside
  for (let i = 0; i < 6; i++) {
    const a = phash(seed, i, 13) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), 0.35 + phash(seed, i, 14) * 0.6, Math.sin(a)).normalize();
    m.add(new THREE.CylinderGeometry(0.014, 0.018, 0.34, 3, 1), alongMatrix(dir, 0, 0.12, 0), (p, nn, out) => out.copy(WOOD.bark).lerp(WOOD.endLight, phash(i, seed, 15) * 0.5));
  }
}

// What a fire leaves: a bed of ash with charred ends of wood in it. The same
// mesh glows as embers while the fire's alive.
export function addCoals(m, seed) {
  const bed = new THREE.CircleGeometry(0.4, 12, 0, Math.PI * 2).rotateX(-Math.PI / 2);
  m.add(
    bed,
    new THREE.Matrix4(),
    (p, nn, out) => out.copy(CHAR).lerp(ASH, phash(Math.round(p.x * 18), Math.round(p.z * 18), seed) * 0.7),
    (p) => {
      const rho = Math.hypot(p.x, p.z) / 0.4;
      p.y = 0.05 * (1 - rho * rho) + 0.018;
    },
  );
  for (let i = 0; i < 8; i++) {
    const a = phash(seed, i, 16) * Math.PI * 2;
    const r = Math.sqrt(phash(seed, i, 17)) * 0.24;
    const len = 0.12 + phash(seed, i, 18) * 0.16;
    const mat = new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(a) * r, 0.06, Math.sin(a) * r),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, phash(seed, i, 19) * 6, Math.PI / 2 + (phash(seed, i, 20) - 0.5) * 0.4)),
      new THREE.Vector3(1, 1, 1),
    );
    m.add(new THREE.CylinderGeometry(0.035, 0.045, len, 5, 1), mat, (p, nn, out) =>
      out.copy(CHAR).lerp(ASH, Math.max(0, nn.y) * 0.25 + phash(i, p.y * 9, seed) * 0.25),
    );
  }
}
