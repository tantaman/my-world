// Everyone else who is in this world right now.
//
// Their position arrives a few times a second and is never stored — it is not
// part of the world, it is just where somebody happens to be standing. Each
// one is drawn a moment behind, between two things they said (track.js), and
// the walk animation is driven off how fast they turned out to be moving, so
// they walk rather than teleport.

import * as THREE from 'three';
import { Character } from './character.js';
import { Track, LEAP, turn as shortest } from './track.js';
import { Emitter } from '../core/events.js';

const FADE = 25_000; // ms of silence before we assume someone is gone
const SETTLE = 8; // 1/s: how quickly the pace and turn the legs are shown follow what was drawn
const _at = { x: 0, z: 0, yaw: 0 };

// Emits:
//   'change'  (peers)   someone arrived or left
export class Peers extends Emitter {
  constructor(scene, heightAt) {
    super();
    this.scene = scene;
    this.heightAt = heightAt;
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

  // Someone said where they are; `ms` is when, on their own clock.
  at({ id, x, z, yaw, name, colour, ms }) {
    if (!id || !Number.isFinite(x) || !Number.isFinite(z)) return;
    let p = this.all.get(id);
    const arrived = !p;
    if (arrived) {
      p = this.#make(id, colour, x, z);
      if (Number.isFinite(yaw)) p.yaw = yaw;
      this.all.set(id, p);
    }
    if (name !== undefined) p.name = name || '';
    if (colour) p.flag.material.color.set(colour);
    p.colour = colour || p.colour;
    p.heard = performance.now();
    p.track.hear(x, z, Number.isFinite(yaw) ? yaw : p.yaw, ms, p.heard);
    // told once they have a name, so whoever hears can say who arrived
    if (arrived) this.emit('change', this);
  }

  remove(id) {
    const p = this.all.get(id);
    if (!p) return;
    this.scene.remove(p.character.root);
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
      p.track.at(now, _at);
      const step = Math.max(dt, 1e-4);
      const k = Math.min(1, dt * SETTLE);
      const moved = Math.hypot(_at.x - p.pos.x, _at.z - p.pos.z) / step;
      const turn = shortest(p.yaw, _at.yaw);
      p.yaw += turn;
      if (moved < LEAP) {
        // a jump to somewhere else is neither a sprint nor a spin
        p.speed += (moved - p.speed) * k;
        p.turn += (turn / step - p.turn) * k;
      }
      p.pos.set(_at.x, this.heightAt(_at.x, _at.z), _at.z);

      p.character.root.position.copy(p.pos);
      p.character.root.rotation.y = p.yaw;
      p.character.update(dt, p.speed, true, 0, p.turn);
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
    return { id, name: '', colour: colour || '#d9b45a', character, flag, pos, track: new Track(), yaw: 0, turn: 0, speed: 0, heard: performance.now() };
  }
}
