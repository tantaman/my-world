// What you ski on, made from boxes and cylinders like the hiker: a pair of
// skis with their tips turned up, a pole for each hand, and a snowboard. Each
// is made once and put on and taken off (Character.stance).

import * as THREE from 'three';
import { SOLE } from '../player/character.js';

// Skis: long, narrow, tips turned up, and a binding round the boot.
const SKI = { length: 1.62, width: 0.085, thick: 0.022, tip: 0.16, ahead: 0.07 };
// Poles: from the grip down to the basket and the point.
const POLE = { length: 1.02, r: 0.009 };
// The board: long, wide, round at both ends, bindings this far either side of its middle.
export const BOARD = { length: 1.5, width: 0.27, thick: 0.022, stance: 0.25 };

const M = (hex, rough = 0.5) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0 });
const shadowed = (m) => {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

// One ski, in the ankle's frame: under the sole, a little ahead of the ankle.
function ski(top, base, binding) {
  const g = new THREE.Group();
  const flat = SKI.length - SKI.tip;
  const body = shadowed(new THREE.Mesh(new THREE.BoxGeometry(SKI.width, SKI.thick, flat), top));
  body.position.z = SKI.ahead - SKI.tip / 2;
  g.add(body);
  const under = new THREE.Mesh(new THREE.BoxGeometry(SKI.width * 0.98, SKI.thick * 0.35, flat), base);
  under.position.set(0, -SKI.thick * 0.6, body.position.z);
  g.add(under);
  // the tip, turned up
  const tip = shadowed(new THREE.Mesh(new THREE.BoxGeometry(SKI.width, SKI.thick, SKI.tip), top));
  tip.geometry.translate(0, 0, SKI.tip / 2);
  tip.position.z = body.position.z + flat / 2;
  tip.rotation.x = -0.45;
  g.add(tip);
  // the binding, round the boot
  const b = shadowed(new THREE.Mesh(new THREE.BoxGeometry(SKI.width * 1.15, 0.05, 0.3), binding));
  b.position.set(0, SKI.thick / 2 + 0.01, 0.045);
  g.add(b);
  g.position.y = -SOLE - SKI.thick / 2;
  return g;
}

// One pole, gripped at its origin, pointing along -y.
function pole(shaft, grip, basket) {
  const g = new THREE.Group();
  const s = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(POLE.r, POLE.r * 0.8, POLE.length, 5), shaft));
  s.position.y = -POLE.length / 2 + 0.06;
  g.add(s);
  const h = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.13, 6), grip));
  h.position.y = 0.0;
  g.add(h);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.008, 8), basket);
  disc.position.y = -POLE.length + 0.14;
  g.add(disc);
  return g;
}

// The board, in the body's frame: its length along x, under both feet, its
// top at the soles.
function board(top, base, binding) {
  const outer = new THREE.Group();
  const g = new THREE.Group();
  g.position.y = -BOARD.thick / 2;
  outer.add(g);
  const mid = BOARD.length - BOARD.width;
  const deck = shadowed(new THREE.Mesh(new THREE.BoxGeometry(mid, BOARD.thick, BOARD.width), top));
  g.add(deck);
  for (const s of [-1, 1]) {
    // round at nose and tail, and turned up a little
    const end = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(BOARD.width / 2, BOARD.width / 2, BOARD.thick, 12, 1, false, s > 0 ? 0 : Math.PI, Math.PI), top));
    end.position.x = (s * mid) / 2;
    end.rotation.z = -s * 0.18;
    end.position.y = 0.012;
    g.add(end);
    // a binding: a heel cup and two straps
    const cup = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.26), binding));
    cup.position.set(s * BOARD.stance, BOARD.thick / 2 + 0.04, -0.01);
    g.add(cup);
  }
  const under = new THREE.Mesh(new THREE.BoxGeometry(mid, BOARD.thick * 0.35, BOARD.width * 0.98), base);
  under.position.y = -BOARD.thick * 0.6;
  g.add(under);
  return outer;
}

// -> { skis: [left, right], poles: [left, right], board }
export function makeGear() {
  const top = M(0xd23a2a, 0.45); // red skis
  const stripe = M(0x1c1c22, 0.6);
  const bind = M(0x26262c, 0.55);
  const shaft = M(0xb8bcc2, 0.35);
  const grip = M(0x1a1a1e, 0.8);
  const deck = M(0x2a7fc4, 0.45); // a blue board
  return {
    skis: [ski(top, stripe, bind), ski(top, stripe, bind)],
    poles: [pole(shaft, grip, grip), pole(shaft, grip, grip)],
    board: board(deck, stripe, bind),
  };
}
