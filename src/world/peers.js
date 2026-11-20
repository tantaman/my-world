// Everyone else who is in this world right now.
//
// Their position arrives a few times a second and is never stored — it is not
// part of the world, it is just where somebody happens to be standing. Between
// those messages each one is eased along, and the walk animation is driven off
// how fast they turned out to be moving, so they walk rather than teleport.

import * as THREE from 'three';
import { Character } from '../player/character.js';

const EASE = 9; // how hard a peer is pulled toward where they said they were
const FADE = 25_000; // ms of silence before we assume someone is gone

export class Peers {
  constructor(scene, heightAt) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.all = new Map();
    this.onChange = null;
  }

  get count() {
    return this.all.size;
  }

  list() {
    return [...this.all.values()].map((p) => ({ id: p.id, name: p.name, colour: p.colour, x: p.pos.x, z: p.pos.z }));
  }

  // Someone said where they are.
  at({ id, x, z, yaw, name, colour }) {
    if (!id || !Number.isFinite(x) || !Number.isFinite(z)) return;
    let p = this.all.get(id);
    if (!p) {
      p = this.#make(id, colour, x, z);
      this.all.set(id, p);
      if (this.onChange) this.onChange(this);
    }
    if (name !== undefined) p.name = name || '';
    if (colour) p.flag.material.color.set(colour);
    p.colour = colour || p.colour;
    p.to.set(x, 0, z);
    p.yawTo = Number.isFinite(yaw) ? yaw : p.yawTo;
    p.heard = performance.now();
  }

  remove(id) {
    const p = this.all.get(id);
    if (!p) return;
    this.scene.remove(p.character.root);
    this.scene.remove(p.flag);
    p.flag.geometry.dispose();
    p.flag.material.dispose();
    this.all.delete(id);
    if (this.onChange) this.onChange(this);
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
      p.pos.y = this.heightAt(p.pos.x, p.pos.z);
      const moved = Math.hypot(p.pos.x - was, p.pos.z - wasZ) / Math.max(dt, 1e-4);
      p.speed += (moved - p.speed) * Math.min(1, dt * 8);

      const turn = shortest(p.yaw, p.yawTo) * Math.min(1, dt * 8);
      p.yaw += turn;
      p.character.root.position.copy(p.pos);
      p.character.root.rotation.y = p.yaw;
      p.character.update(dt, p.speed, true, 0, turn / Math.max(dt, 1e-4));
      p.flag.position.set(p.pos.x, p.pos.y + 2.25, p.pos.z);
    }
  }

  #make(id, colour, x, z) {
    const character = new Character();
    character.groundAt = this.heightAt;
    this.scene.add(character.root);
    // A small bright pennant above the head, so you can find each other.
    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.26, 0.26),
      new THREE.MeshBasicMaterial({ color: colour || '#d9b45a', toneMapped: false }),
    );
    flag.castShadow = false;
    this.scene.add(flag);
    const pos = new THREE.Vector3(x, this.heightAt(x, z), z);
    return { id, name: '', colour: colour || '#d9b45a', character, flag, pos, to: pos.clone(), yaw: 0, yawTo: 0, speed: 0, heard: performance.now() };
  }
}

function shortest(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
