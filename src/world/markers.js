// Your map marks, out in the world: a wooden stake with a cloth pennant in
// the mark's colour and a few stones at its foot, so you can spot the places
// you tagged as you walk up to them.

import * as THREE from 'three';
import { hash2i } from '../noise.js';

const POLE_H = 2.3;
const FLAG_W = 0.62;
const FLAG_H = 0.38;
const FLAG_SEGS = 6;
const ANIMATE_DIST = 70;

export class Markers {
  constructor(scene, heightAt) {
    this.heightAt = heightAt;
    this.group = new THREE.Group();
    this.group.name = 'markers';
    scene.add(this.group);
    this.items = new Map(); // id -> { root, flag, base, color }
    this.flagMats = new Map();

    this.poleGeo = new THREE.CylinderGeometry(0.035, 0.05, POLE_H, 5, 1);
    this.poleGeo.translate(0, POLE_H / 2 - 0.15, 0);
    this.poleMat = new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 0.95 });
    this.stoneGeo = new THREE.DodecahedronGeometry(0.16, 0);
    this.stoneMat = new THREE.MeshStandardMaterial({ color: 0x77736a, roughness: 1, flatShading: true });
    this.knobGeo = new THREE.SphereGeometry(0.06, 6, 4);
  }

  _flagMat(color) {
    let m = this.flagMats.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide });
      this.flagMats.set(color, m);
    }
    return m;
  }

  sync(marks) {
    const seen = new Set();
    for (const mk of marks) {
      seen.add(mk.id);
      let it = this.items.get(mk.id);
      if (!it) {
        it = this._build(mk);
        this.items.set(mk.id, it);
        this.group.add(it.root);
      }
      if (it.color !== mk.color) {
        it.flag.material = this._flagMat(mk.color);
        it.knob.material = it.flag.material;
        it.color = mk.color;
      }
      if (it.x !== mk.x || it.z !== mk.z) {
        it.x = mk.x;
        it.z = mk.z;
        it.root.position.set(mk.x, this.heightAt(mk.x, mk.z), mk.z);
      }
    }
    for (const [id, it] of this.items) {
      if (seen.has(id)) continue;
      this.group.remove(it.root);
      it.flag.geometry.dispose();
      this.items.delete(id);
    }
  }

  _build(mk) {
    const root = new THREE.Group();
    const h = hash2i(Math.round(mk.x * 10), Math.round(mk.z * 10), 77);
    root.rotation.y = (h / 4294967296) * Math.PI * 2;

    const pole = new THREE.Mesh(this.poleGeo, this.poleMat);
    pole.rotation.z = ((h & 255) / 255 - 0.5) * 0.08;
    root.add(pole);

    const geo = new THREE.PlaneGeometry(FLAG_W, FLAG_H, FLAG_SEGS, 1);
    geo.translate(FLAG_W / 2 + 0.03, 0, 0);
    const flag = new THREE.Mesh(geo, this._flagMat(mk.color));
    flag.position.y = POLE_H - 0.15 - FLAG_H / 2 - 0.06;
    flag.userData.rest = Float32Array.from(geo.attributes.position.array);
    pole.add(flag);
    const knob = new THREE.Mesh(this.knobGeo, flag.material);
    knob.position.y = POLE_H - 0.13;
    pole.add(knob);

    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(this.stoneGeo, this.stoneMat);
      const a = i * 2.1 + (h % 7);
      s.position.set(Math.cos(a) * 0.17, 0.02, Math.sin(a) * 0.17);
      s.scale.setScalar(0.8 + ((h >> (i * 4)) & 15) / 30);
      s.rotation.set(a, a * 1.7, 0);
      root.add(s);
    }
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return { root, flag, knob, color: mk.color, x: NaN, z: NaN, phase: (h % 1000) / 159 };
  }

  update(time, wind, playerPos) {
    for (const it of this.items.values()) {
      const dx = it.x - playerPos.x;
      const dz = it.z - playerPos.z;
      if (dx * dx + dz * dz > ANIMATE_DIST * ANIMATE_DIST) continue;
      // keep the stake on the ground as finer terrain streams in
      it.root.position.y = this.heightAt(it.x, it.z);
      const pos = it.flag.geometry.attributes.position;
      const rest = it.flag.userData.rest;
      const t = time * (2.6 + wind) + it.phase;
      for (let i = 0; i < pos.count; i++) {
        const x = rest[i * 3];
        const u = x / FLAG_W;
        pos.array[i * 3 + 2] = Math.sin(u * 5.2 - t * 2.1) * 0.07 * u * (0.6 + wind * 0.5);
        pos.array[i * 3 + 1] = rest[i * 3 + 1] - u * u * 0.05 * (1.3 - wind * 0.5);
      }
      pos.needsUpdate = true;
      it.flag.geometry.computeVertexNormals();
    }
  }
}
