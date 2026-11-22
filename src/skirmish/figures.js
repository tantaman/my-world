// The fighters and what they carry, as things to draw.
//
//   a figure   a fighter seen from outside: jacket and trousers in their
//              side's colours (Raiders rust red, Wardens slate blue), a cap
//              or a helmet, arms out to the gun, legs that run, knees that
//              bend to crouch; lying where they fell when they're down
//   a gun      each of the guns, the knife, the grenades and the charge, as
//              a little model built along −z from its grip: the same one in
//              a figure's hands and, bigger on the screen, in yours
//
// Everything is boxes and cylinders in flat colours: made in code, like the
// rest of the world.

import * as THREE from 'three';
import { MOVE } from './mover.js';

export const SIDE_COLOURS = {
  attack: { jacket: 0xa8452e, trousers: 0xb8a078, head: 0x7a2f1f, css: '#e2674a' },
  defend: { jacket: 0x47607e, trousers: 0x6d7480, head: 0x39485c, css: '#6aa2e0' },
};
const SKIN = 0xc79a72;
const STEEL = 0x3d4248;
const WOOD = 0x7a5232;

const mat = (color, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 });
const SHARED = { skin: mat(SKIN), steel: mat(STEEL, 0.45), wood: mat(WOOD, 0.7), dark: mat(0x1c1d20, 0.6), olive: mat(0x58603a), grey: mat(0x8a8d90, 0.5), white: mat(0xd8d8d0, 0.6), stick: mat(0x8c3a2a), red: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.25, 0.15) }) };

function part(parent, geo, material, x, y, z) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const tube = (r, len, r2 = r) => new THREE.CylinderGeometry(r2, r, len, 8).rotateX(Math.PI / 2);

// What `kind` looks like (a gun's id, 'knife', a grenade, 'charge'): a group
// built along −z from the grip, with `muzzle` where its shots leave it.
export function gunModel(kind) {
  const g = new THREE.Group();
  const { steel, wood, dark, olive, grey, white } = SHARED;
  let muzzle = -0.3;
  if (kind === 'sidearm' || kind === 'magnum') {
    const long = kind === 'magnum' ? 0.26 : 0.2;
    part(g, box(0.034, 0.045, long), kind === 'magnum' ? grey : steel, 0, 0.03, -long / 2);
    part(g, box(0.032, 0.11, 0.045), kind === 'magnum' ? wood : dark, 0, -0.035, -0.01).rotation.x = 0.25;
    if (kind === 'magnum') part(g, tube(0.024, 0.05), grey, 0, 0.02, -0.07);
    muzzle = -long;
  } else if (kind === 'smg') {
    part(g, box(0.05, 0.07, 0.34), steel, 0, 0.02, -0.17);
    part(g, tube(0.014, 0.14), dark, 0, 0.025, -0.4);
    part(g, box(0.034, 0.16, 0.045), dark, 0, -0.09, -0.16).rotation.x = 0.1;
    part(g, box(0.034, 0.1, 0.04), dark, 0, -0.05, 0.0).rotation.x = 0.3;
    part(g, box(0.03, 0.05, 0.16), dark, 0, 0.0, 0.09);
    muzzle = -0.47;
  } else if (kind === 'shotgun') {
    part(g, tube(0.02, 0.62), steel, 0, 0.035, -0.4);
    part(g, tube(0.018, 0.4), steel, 0, 0.0, -0.3);
    part(g, box(0.05, 0.05, 0.2), wood, 0, 0.0, -0.36);
    part(g, box(0.05, 0.075, 0.2), steel, 0, 0.015, -0.02);
    part(g, box(0.045, 0.09, 0.3), wood, 0, -0.02, 0.2).rotation.x = -0.12;
    muzzle = -0.71;
  } else if (kind === 'rifle') {
    part(g, box(0.05, 0.075, 0.42), steel, 0, 0.02, -0.14);
    part(g, tube(0.013, 0.34), steel, 0, 0.03, -0.5);
    part(g, box(0.045, 0.05, 0.24), wood, 0, 0.005, -0.42);
    part(g, box(0.036, 0.2, 0.06), steel, 0, -0.1, -0.16).rotation.x = 0.28;
    part(g, box(0.036, 0.1, 0.045), wood, 0, -0.05, 0.04).rotation.x = 0.3;
    part(g, box(0.04, 0.08, 0.26), wood, 0, -0.005, 0.2).rotation.x = -0.08;
    part(g, box(0.012, 0.03, 0.012), steel, 0, 0.06, -0.62);
    muzzle = -0.67;
  } else if (kind === 'longrifle') {
    part(g, box(0.05, 0.07, 0.5), olive, 0, 0.015, -0.12);
    part(g, tube(0.014, 0.6), steel, 0, 0.03, -0.62);
    part(g, tube(0.028, 0.3), dark, 0, 0.085, -0.14);
    part(g, tube(0.034, 0.05), dark, 0, 0.085, -0.3);
    part(g, box(0.036, 0.1, 0.045), olive, 0, -0.05, 0.06).rotation.x = 0.3;
    part(g, box(0.045, 0.09, 0.3), olive, 0, -0.01, 0.26).rotation.x = -0.06;
    part(g, box(0.03, 0.07, 0.05), dark, 0, -0.05, -0.2);
    muzzle = -0.92;
  } else if (kind === 'knife') {
    part(g, box(0.008, 0.035, 0.2), grey, 0, 0.01, -0.16);
    part(g, box(0.026, 0.03, 0.11), dark, 0, 0, 0);
    part(g, box(0.05, 0.012, 0.015), steel, 0, 0, -0.06);
    muzzle = -0.26;
  } else if (kind === 'charge') {
    // sticks bound together, a clock on the front, a light on top
    for (const x of [-0.07, 0, 0.07]) part(g, tube(0.032, 0.26), SHARED.stick, x, 0, -0.02);
    part(g, box(0.24, 0.02, 0.05), dark, 0, 0.035, -0.02);
    part(g, box(0.1, 0.05, 0.08), dark, 0, 0.05, -0.02);
    const light = part(g, new THREE.SphereGeometry(0.018, 8, 6), SHARED.red, 0.06, 0.085, -0.02);
    light.castShadow = false;
    g.userData.light = light;
    muzzle = 0;
  } else {
    // a grenade: a can for the smoke, a ball for the others
    const body = kind === 'smoke' ? grey : kind === 'flash' ? white : olive;
    if (kind === 'frag') part(g, new THREE.SphereGeometry(0.045, 10, 8), body, 0, 0, -0.03);
    else part(g, new THREE.CylinderGeometry(0.034, 0.034, 0.12, 10), body, 0, 0, -0.03);
    part(g, box(0.02, 0.03, 0.02), steel, 0, 0.07, -0.03);
    muzzle = -0.05;
  }
  g.userData.muzzle = muzzle;
  return g;
}

// A fighter, feet at 0, facing −z. Its colours are its side's (setSide).
export function makeFigure() {
  const group = new THREE.Group();
  const cloth = { jacket: mat(0xffffff), trousers: mat(0xffffff), head: mat(0xffffff, 0.6) };
  const { skin, dark } = SHARED;
  // everything above the hips leans and sinks as one when they crouch
  const upper = new THREE.Group();
  upper.position.y = 0.92;
  group.add(upper);
  part(upper, box(0.5, 0.56, 0.28), cloth.jacket, 0, 0.3, 0);
  part(upper, box(0.44, 0.14, 0.26), dark, 0, 0.0, 0);
  part(upper, box(0.36, 0.3, 0.1), dark, 0, 0.3, 0.17); // a pack
  const head = new THREE.Group();
  head.position.set(0, 0.64, 0);
  upper.add(head);
  part(head, box(0.22, 0.24, 0.24), skin, 0, 0.12, 0);
  const cap = part(head, box(0.26, 0.12, 0.28), cloth.head, 0, 0.24, 0);
  const brim = part(head, box(0.24, 0.03, 0.12), cloth.head, 0, 0.2, -0.18);
  const helmet = part(head, new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), cloth.head, 0, 0.16, 0);
  part(head, box(0.2, 0.05, 0.03), dark, 0, 0.14, -0.125); // goggles
  const arms = new THREE.Group();
  arms.position.set(0, 0.46, 0);
  upper.add(arms);
  part(arms, box(0.12, 0.12, 0.46), cloth.jacket, 0.27, -0.06, -0.16).rotation.y = 0.25;
  part(arms, box(0.12, 0.12, 0.5), cloth.jacket, -0.25, -0.06, -0.2).rotation.y = -0.45;
  const hand = new THREE.Group();
  hand.position.set(0.14, -0.06, -0.4);
  arms.add(hand);
  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group();
    hip.position.set(s * 0.13, 0.9, 0);
    group.add(hip);
    part(hip, box(0.19, 0.46, 0.2), cloth.trousers, 0, -0.23, 0);
    const knee = new THREE.Group();
    knee.position.y = -0.46;
    hip.add(knee);
    part(knee, box(0.17, 0.44, 0.18), cloth.trousers, 0, -0.2, 0);
    part(knee, box(0.18, 0.1, 0.28), dark, 0, -0.41, -0.04);
    return { hip, knee };
  });
  // the charge on the back of whoever carries it
  const carried = gunModel('charge');
  carried.position.set(0, 0.3, 0.26);
  carried.rotation.x = Math.PI / 2;
  carried.visible = false;
  upper.add(carried);
  return { group, upper, head, arms, hand, legs, cloth, cap, brim, helmet, carried, held: null, heldKind: '', side: '', stride: 0, down: 0, fallYaw: 0 };
}

export function setSide(v, side) {
  if (v.side === side) return;
  v.side = side;
  const c = SIDE_COLOURS[side];
  v.cloth.jacket.color.set(c.jacket);
  v.cloth.trousers.color.set(c.trousers);
  v.cloth.head.color.set(c.head);
  // Wardens wear helmets, Raiders caps
  v.helmet.visible = side === 'defend';
  v.cap.visible = v.brim.visible = side !== 'defend';
}

// Put what a fighter holds in the figure's hands.
export function setHeld(v, kind) {
  if (v.heldKind === kind) return;
  v.heldKind = kind;
  if (v.held) v.hand.remove(v.held);
  v.held = gunModel(kind);
  v.hand.add(v.held);
}

// Stand a figure where its fighter is, as it is: running, crouched, aiming,
// or down. kind: what's in its hands.
export function poseFigure(v, f, kind, dt) {
  const b = f.body;
  const g = v.group;
  setHeld(v, kind);
  v.carried.visible = f.charge && f.held !== 'charge';
  if (!f.alive) {
    // down: over backwards, the way they were facing, and still
    v.down = Math.min(1, v.down + dt * 3);
    const k = v.down * v.down * (3 - 2 * v.down);
    g.position.set(b.pos.x, b.pos.y + 0.12 * k, b.pos.z);
    g.rotation.set(0, v.fallYaw, 0);
    g.rotateX((Math.PI / 2 - 0.08) * k);
    v.upper.position.y = 0.92;
    v.upper.rotation.x = 0;
    v.arms.rotation.x = -0.5 * k;
    for (const l of v.legs) {
      l.hip.rotation.x = 0.1 * k;
      l.knee.rotation.x = 0.25 * k;
    }
    return;
  }
  v.down = 0;
  v.fallYaw = f.yaw;
  g.position.set(b.pos.x, b.pos.y, b.pos.z);
  g.rotation.set(0, f.yaw, 0);
  const duck = b.crouch;
  const speed = Math.hypot(b.vel.x, b.vel.z);
  v.stride += dt * speed * 2.1;
  const swing = b.grounded ? Math.sin(v.stride) * Math.min(0.75, speed * 0.14) : 0.4;
  // crouched: the hips come down, the knees fold
  const sink = duck * (MOVE.height - MOVE.low) * 0.85;
  v.upper.position.y = 0.92 - sink;
  v.upper.rotation.x = -duck * 0.18 - Math.min(0.12, speed * 0.015);
  v.legs.forEach((l, i) => {
    const s = i ? -swing : swing;
    l.hip.position.y = 0.9 - sink;
    l.hip.rotation.x = s - duck * 1.0;
    l.knee.rotation.x = Math.max(0, -s) * 0.9 + duck * 1.7 + (b.grounded ? 0 : 0.5);
  });
  v.head.rotation.x = f.pitch * 0.6;
  v.arms.rotation.x = f.pitch + (f.reloading > 0 ? -0.5 : 0);
}
