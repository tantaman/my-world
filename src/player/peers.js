// Everyone else who is in this world right now.
//
// Their position arrives a few times a second and is never stored — it is not
// part of the world, it is just where somebody happens to be standing. Between
// those messages each one is eased along, and the walk animation is driven off
// how fast they turned out to be moving, so they walk rather than teleport.
//
// Who they are (one of hikers.js, by id) comes with it, so someone playing as
// Oliver is seen as Oliver, and if they change, they're seen to.
//
// Only where they are in plan is sent, not how high. Where that matters —
// over a cave, in it or on the hill above — they are kept on whichever they
// were on, so someone who walks in through the mouth is seen on its floor.

import * as THREE from 'three';
import { Character } from './character.js';
import { hiker } from './hikers.js';
import { Emitter } from '../core/events.js';

const EASE = 9; // how hard a peer is pulled toward where they said they were
const FADE = 25_000; // ms of silence before we assume someone is gone
const TOP = 1.8; // m from a grown-up's feet to the top of their head
const FLAG = 0.45; // m the pennant flies over that, whoever it is

// Emits:
//   'change'  (peers)   someone arrived or left
export class Peers extends Emitter {
  // ground(x, z, y, size): where someone at (x, z) with their feet about y
  // stands, if they are `size` beside the grown-up hiker (deep water floats
  // someone small sooner)
  constructor(scene, ground) {
    super();
    this.scene = scene;
    this.ground = ground;
    this.all = new Map();
  }

  get count() {
    return this.all.size;
  }

  // Someone by id: { id, name, colour, character, pos, ... }, or null.
  get(id) {
    return this.all.get(id) || null;
  }

  list() {
    return [...this.all.values()].map((p) => ({ id: p.id, name: p.name, colour: p.colour, x: p.pos.x, z: p.pos.z }));
  }

  // Someone said where they are, and who they are (a hiker's id).
  at({ id, x, z, yaw, name, colour, who }) {
    if (!id || !Number.isFinite(x) || !Number.isFinite(z)) return;
    let p = this.all.get(id);
    const arrived = !p;
    if (arrived) {
      p = this.#make(id, colour, x, z, hiker(who));
      this.all.set(id, p);
    } else if (who !== undefined) p.character.dress(hiker(who));
    if (name !== undefined) p.name = name || '';
    if (colour) p.flag.material.color.set(colour);
    p.colour = colour || p.colour;
    p.to.set(x, 0, z);
    p.yawTo = Number.isFinite(yaw) ? yaw : p.yawTo;
    p.heard = performance.now();
    // told once they have a name, so whoever hears can say who arrived
    if (arrived) this.emit('change', this);
  }

  remove(id) {
    const p = this.all.get(id);
    if (!p) return;
    this.scene.remove(p.character.root);
    p.character.dispose();
    this.scene.remove(p.flag);
    p.flag.geometry.dispose();
    p.flag.material.dispose();
    this.all.delete(id);
    this.emit('change', this);
  }

  clear() {
    for (const id of [...this.all.keys()]) this.remove(id);
  }

  update(dt) {
    const now = performance.now();
    for (const p of [...this.all.values()]) {
      if (now - p.heard > FADE) {
        this.remove(p.id);
        continue;
      }
      const k = 1 - Math.exp(-EASE * dt);
      const was = p.pos.x;
      const wasZ = p.pos.z;
      p.pos.x += (p.to.x - p.pos.x) * k;
      p.pos.z += (p.to.z - p.pos.z) * k;
      p.pos.y = this.ground(p.pos.x, p.pos.z, p.pos.y + 0.5, p.character.size);
      const moved = Math.hypot(p.pos.x - was, p.pos.z - wasZ) / Math.max(dt, 1e-4);
      p.speed += (moved - p.speed) * Math.min(1, dt * 8);

      const turn = shortest(p.yaw, p.yawTo) * Math.min(1, dt * 8);
      p.yaw += turn;
      p.character.root.position.copy(p.pos);
      p.character.root.rotation.y = p.yaw;
      p.character.update(dt, p.speed, true, 0, turn / Math.max(dt, 1e-4));
      p.flag.position.set(p.pos.x, p.pos.y + TOP * p.character.size + FLAG, p.pos.z);
    }
  }

  #make(id, colour, x, z, who) {
    const character = new Character(who);
    const pos = new THREE.Vector3(x, this.ground(x, z, Infinity, character.size), z);
    character.groundAt = (gx, gz) => this.ground(gx, gz, pos.y + 0.3, character.size);
    this.scene.add(character.root);
    // A small bright pennant above the head, so you can find each other.
    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.26, 0.26),
      new THREE.MeshBasicMaterial({ color: colour || '#d9b45a', toneMapped: false }),
    );
    flag.castShadow = false;
    this.scene.add(flag);
    return { id, name: '', colour: colour || '#d9b45a', character, flag, pos, to: pos.clone(), yaw: 0, yawTo: 0, speed: 0, heard: performance.now() };
  }
}

function shortest(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
