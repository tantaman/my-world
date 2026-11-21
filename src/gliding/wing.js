// What a hang glider looks like, made from triangles and tubes like
// everything else here (no textures): a delta of bright sail, billowing up
// between its tubes, on an aluminium frame. The keel runs down the middle,
// the leading edges out to the tips, the crossbar under the sail; the king
// post stands on top with its wires, and below hangs the A-frame you fly it
// by, with the bar across its foot.
//
// It is built round the hang point, where the strap off the keel holds the
// harness (pilot.js): +z ahead, +x to the pilot's left, +y up. Each half of
// the sail hinges at the nose, so it can open out from folded along the keel.
// Seen from below, a sail glows with the daylight coming through it rather
// than going dark, so its underside is lit as if it faced up, a little dimmer.
//
//   mesh                     add it to the scene
//   pose(x, y, z, heading, bank, pitch, open)
//                            the hang point in the world, which way it flies,
//                            rolled right, nose down (radians), and how far
//                            open the sail is (0..1)
//   dispose()

import * as THREE from 'three';
import { clamp, lerp } from '../noise.js';

// Its size (m), from the hang point. A real one is about this: ten metres
// tip to tip, with the nose a little over a metre ahead of you.
export const WING = {
  span: 10,
  nose: 1.75, // the nose, ahead
  tip: -0.5, // the leading edge's end at each tip, ahead (+) or behind
  chordTip: 0.55, // how deep the sail is at the tip
  tail: -1.6, // the end of the keel
  keel: 1.2, // the keel, over the hang point
  dihedral: 0.12, // the tips, higher than the keel
  camber: 0.24, // how far the sail billows up between the tubes
  apex: 0.5, // the A-frame meets the keel this far ahead
  bar: { y: -0.33, z: 0.87, half: 0.72 }, // the bar: how low, how far ahead, half its width (your hands on it)
  king: 0.95, // the king post, over the keel
  cross: 0.55, // the crossbar meets each leading edge this far out (0..1)
};
const TUBE = 0.024; // radius (m) of the frame's tubes
const WIRE = 0.005;
// Folded, each half lies back along the keel: this far round from open (radians).
const FOLD = Math.atan2(WING.span / 2, WING.nose - WING.tip);
// How finely the sail is cut: along the span, and from front to back.
const CUT = { u: 7, v: 4 };
// Its colours: the leading edge, then panels from the keel out to the tips.
const COLOURS = { edge: 0x1f2d52, panels: [[0.32, 0xf1ece0], [0.7, 0x2a9d8f], [1, 0xf0b93a]] };
// How much of the daylight on top comes through to the underside.
const THROUGH = 0.8;
// The underside, this far (m) under the top, so the two don't flicker.
const UNDER = 0.012;

const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

// A tube from a to b.
function tube(a, b, r, material) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, r > WIRE ? 6 : 3), material);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(_up, d.normalize());
  m.castShadow = r > WIRE;
  return m;
}

// One half of the sail (side 1: the left, -1: the right), relative to the
// nose, as flat-shaded triangles coloured panel by panel: its top, and its
// underside facing down but lit as the top is (THROUGH).
function sailHalf(side) {
  const W = WING;
  const nose = new THREE.Vector3(0, W.keel, W.nose);
  const tip = new THREE.Vector3((side * W.span) / 2, W.keel + W.dihedral, W.tip);
  const tipBack = new THREE.Vector3((side * W.span) / 2 - side * 0.06, W.keel + W.dihedral, W.tip - W.chordTip);
  const tail = new THREE.Vector3(0, W.keel, W.tail);
  const lead = (u, out) => out.lerpVectors(nose, tip, u);
  // the trailing edge bows forward a little between the battens
  const trail = (u, out) => {
    out.lerpVectors(tail, tipBack, u);
    out.z += 0.12 * Math.sin(Math.PI * u);
    return out;
  };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const at = (u, v) => {
    lead(u, a);
    trail(u, b);
    const p = new THREE.Vector3().lerpVectors(a, b, v);
    // billowing up between the leading edge and the trailing edge, most
    // inboard, just ahead of the middle
    p.y += W.camber * Math.sin(Math.PI * Math.pow(v, 0.75)) * (1 - 0.65 * u);
    return p.sub(nose);
  };
  const pos = [];
  const col = [];
  const colour = (u, v) => {
    if (v < 0.22) return _c.setHex(COLOURS.edge);
    for (const [upTo, hex] of COLOURS.panels) if (u <= upTo) return _c.setHex(hex);
    return _c.setHex(COLOURS.panels.at(-1)[1]);
  };
  const grid = [];
  for (let i = 0; i <= CUT.u; i++) {
    const row = [];
    for (let j = 0; j <= CUT.v; j++) row.push(at(i / CUT.u, j / CUT.v));
    grid.push(row);
  }
  for (let i = 0; i < CUT.u; i++) {
    for (let j = 0; j < CUT.v; j++) {
      const p00 = grid[i][j];
      const p10 = grid[i + 1][j];
      const p01 = grid[i][j + 1];
      const p11 = grid[i + 1][j + 1];
      // (wound to face up)
      const tris = side > 0 ? [p00, p10, p01, p10, p11, p01] : [p00, p01, p10, p10, p01, p11];
      colour((i + 0.5) / CUT.u, (j + 0.5) / CUT.v);
      for (const p of tris) {
        pos.push(p.x, p.y, p.z);
        col.push(_c.r, _c.g, _c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // the underside: each triangle turned over, a hair lower, keeping the top's normals
  const n = g.getAttribute('normal').array;
  const uPos = [];
  const uNorm = [];
  const uCol = [];
  for (let t = 0; t < pos.length; t += 9) {
    for (const k of [0, 6, 3]) {
      const i = t + k;
      uPos.push(pos[i], pos[i + 1] - UNDER, pos[i + 2]);
      uNorm.push(n[i], n[i + 1], n[i + 2]);
      uCol.push(col[i] * THROUGH, col[i + 1] * THROUGH, col[i + 2] * THROUGH);
    }
  }
  const under = new THREE.BufferGeometry();
  under.setAttribute('position', new THREE.Float32BufferAttribute(uPos, 3));
  under.setAttribute('normal', new THREE.Float32BufferAttribute(uNorm, 3));
  under.setAttribute('color', new THREE.Float32BufferAttribute(uCol, 3));
  return { geometry: g, under, nose, tip, cross: new THREE.Vector3().lerpVectors(nose, tip, WING.cross) };
}

export class Wing {
  constructor() {
    const W = WING;
    this.materials = {
      sail: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 }),
      tube: new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.35, metalness: 0.4 }),
      bar: new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.6, metalness: 0.1 }),
      wire: new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.4, metalness: 0.5 }),
      strap: new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.9, metalness: 0 }),
    };
    const M = this.materials;
    const mesh = new THREE.Group();
    mesh.rotation.order = 'YZX'; // yaw, then roll about the way it flies, then pitch
    this.mesh = mesh;

    const nose = new THREE.Vector3(0, W.keel, W.nose);
    const tail = new THREE.Vector3(0, W.keel, W.tail);
    const apex = new THREE.Vector3(0, W.keel, W.apex);
    const top = new THREE.Vector3(0, W.keel + W.king, W.apex);
    const barL = new THREE.Vector3(W.bar.half, W.bar.y, W.bar.z);
    const barR = new THREE.Vector3(-W.bar.half, W.bar.y, W.bar.z);
    const hub = new THREE.Vector3(0, W.keel - 0.03, 0.15); // where the crossbar halves meet the keel

    // the frame that doesn't fold: the keel, the king post, the A-frame and
    // the strap down to the harness
    mesh.add(tube(nose, tail, TUBE, M.tube));
    mesh.add(tube(apex, top, TUBE * 0.8, M.tube));
    mesh.add(tube(apex, barL, TUBE, M.tube));
    mesh.add(tube(apex, barR, TUBE, M.tube));
    mesh.add(tube(barL, barR, TUBE * 1.3, M.bar));
    mesh.add(tube(new THREE.Vector3(0, W.keel, 0), new THREE.Vector3(0, 0, 0), 0.018, M.strap));

    // each half: its sail, its leading edge and half the crossbar, hinged at the nose
    this.halves = [];
    this.wires = new THREE.Group(); // the wires out to the leading edges, there once it's open
    for (const side of [1, -1]) {
      const h = sailHalf(side);
      const half = new THREE.Group();
      half.position.copy(nose);
      const sail = new THREE.Mesh(h.geometry, M.sail);
      sail.castShadow = true;
      half.add(sail);
      half.add(new THREE.Mesh(h.under, M.sail)); // (in the top's shadow it would go dark again)
      const rel = (p) => p.clone().sub(nose);
      half.add(tube(rel(nose), rel(h.tip), TUBE, M.tube));
      half.add(tube(rel(hub), rel(h.cross), TUBE, M.tube));
      half.userData.side = side;
      mesh.add(half);
      this.halves.push(half);
      // the wires: from the king post and from the bar to the crossbar's end
      this.wires.add(tube(top, h.cross, WIRE, M.wire));
      this.wires.add(tube(side > 0 ? barL : barR, h.cross, WIRE, M.wire));
    }
    // and fore and aft
    for (const end of [nose, tail]) {
      mesh.add(tube(top, end, WIRE, M.wire));
      mesh.add(tube(barL, end, WIRE, M.wire));
      mesh.add(tube(barR, end, WIRE, M.wire));
    }
    mesh.add(this.wires);
    this.open = -1;
  }

  pose(x, y, z, heading, bank, pitch, open) {
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.set(pitch, heading, bank);
    if (open === this.open) return;
    this.open = open;
    // opening out, with a little overshoot as the sail fills and snaps taut
    const t = clamp(open, 0, 1);
    const e = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
    for (const half of this.halves) {
      half.rotation.y = half.userData.side * FOLD * (1 - e);
      half.scale.x = lerp(0.3, 1, Math.min(1, e));
    }
    this.wires.visible = t > 0.97;
  }

  dispose() {
    this.mesh.traverse((o) => o.geometry && o.geometry.dispose());
    for (const m of Object.values(this.materials)) m.dispose();
  }
}
