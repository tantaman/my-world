// What stands on a hike: a cairn of stones where the photo was taken, and a
// signpost at the trailhead pointing up the trail. Made of primitives, like
// everything else; seeded, so each hike's cairn is its own.

import * as THREE from 'three';
import { mulberry32 } from '../noise.js';

const STONE = new THREE.MeshStandardMaterial({ color: 0x7a766c, roughness: 1, flatShading: true });
const WOOD = new THREE.MeshStandardMaterial({ color: 0x6b4f35, roughness: 0.95 });
const WOOD_DARK = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.95 });

// About a metre of stones, each a little smaller than the one under it.
export function makeCairn(seed) {
  const rng = mulberry32(seed >>> 0);
  const g = new THREE.Group();
  g.name = 'cairn';
  let y = -0.05;
  const COUNT = 7;
  for (let k = 0; k < COUNT; k++) {
    const r = 0.34 * (1 - k / (COUNT + 2)) * (0.85 + rng() * 0.3);
    const flat = 0.5 + rng() * 0.2;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), STONE);
    stone.scale.set(1 + rng() * 0.25, flat, 1 + rng() * 0.25);
    stone.rotation.set((rng() - 0.5) * 0.25, rng() * Math.PI * 2, (rng() - 0.5) * 0.25);
    stone.position.set((rng() - 0.5) * 0.08, y + r * flat * 0.8, (rng() - 0.5) * 0.08);
    y += r * flat * 1.45;
    stone.castShadow = true;
    stone.receiveShadow = true;
    g.add(stone);
  }
  return g;
}

// A post with a board pointing the way (along +z; turn it with rotation.y).
export function makeSignpost() {
  const g = new THREE.Group();
  g.name = 'signpost';
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.75, 0.13), WOOD);
  post.position.y = 0.8;
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.85), WOOD);
  board.position.set(0, 1.45, 0.3);
  // the arrow's point
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 0.17, 0.2, 4, 1), WOOD);
  tip.rotation.x = Math.PI / 2;
  tip.scale.set(0.3, 1, 0.71);
  tip.position.set(0, 1.45, 0.82);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.2), WOOD_DARK);
  cap.position.y = 1.68;
  for (const m of [post, board, tip, cap]) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}
