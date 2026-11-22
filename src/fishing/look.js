// The float and the line, drawn from the rod's tip to wherever the line
// (line.js) says the float is: arcing out over the water as it's cast,
// riding the ripples, twitching at a nibble, pulled under by a bite, and once
// a fish is on, the line cutting tight into the water where it is.
//
// The line's points are measured from the rod's tip, and the line is put
// there in the world: nothing big goes to the graphics card
// (render/origin.js).

import * as THREE from 'three';
import { LINE } from './line.js';
import { OVER } from '../render/pipeline.js';

const N = 24; // points along the line
const ARC = 0.28; // how high the float goes as it's cast, per metre out
const SAG = 0.06; // how much a slack line hangs, per metre out
const FLOAT = 0.11; // the float's radius (m): a good deal bigger than life, to be seen

export class LineLook {
  constructor(scene) {
    this.scene = scene;
    this.float = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0xd8402a, roughness: 0.5 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.5 });
    const top = new THREE.Mesh(new THREE.SphereGeometry(FLOAT, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), red);
    const bottom = new THREE.Mesh(new THREE.SphereGeometry(FLOAT, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), white);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, FLOAT * 1.6, 4), red);
    stick.position.y = FLOAT * 1.2;
    this.float.add(top, bottom, stick);
    this.float.visible = false;
    scene.add(this.float);

    this.points = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.points, 3));
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xe8e2d0, transparent: true, opacity: 0.85 }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    this.line.layers.set(OVER); // see-through, over the water: drawn after it (render/pipeline.js)
    scene.add(this.line);

    this.from = new THREE.Vector3(); // where the rod's tip was when it was cast
    this.time = 0;
  }

  // Draw it as it is.
  //   line     the Line (line.js)
  //   tip      the rod's tip, in the world
  //   level(x, z) -> the water's surface there, or null
  update(dt, line, tip, level) {
    this.time += dt;
    const s = line.state;
    const show = s !== 'idle';
    this.line.visible = this.float.visible = show;
    if (!show) {
      this.from.copy(tip);
      return;
    }
    const { x, z } = line.float;
    const surface = level(x, z) ?? tip.y - 1.5;
    let y = surface;
    let slack = 1;
    this.float.rotation.set(0, 0, 0);
    if (s === 'flying') {
      // out from where the tip was, in an arc
      const k = Math.min(1, line.t / LINE.flight);
      const d = Math.hypot(x - this.from.x, z - this.from.z);
      this.float.position.set(this.from.x + (x - this.from.x) * k, this.from.y + (surface - this.from.y) * k + ARC * d * 4 * k * (1 - k), this.from.z + (z - this.from.z) * k);
      slack = 1.4;
    } else {
      if (s === 'waiting') y = surface + Math.sin(this.time * 2.1) * 0.012 - line.twitch * 0.05 * Math.abs(Math.sin(this.time * 30));
      else if (s === 'biting') y = surface - 0.12 - Math.min(1, line.t * 6) * 0.1; // under it goes
      else if (s === 'hooked') {
        // dragged along by the fish, tipped over, now and then under
        y = surface - (line.run > 0 ? 0.2 : 0.03);
        this.float.rotation.z = 1.1;
        slack = 1 - line.tension;
      } else if (s === 'in') slack = 0.3;
      this.float.position.set(x, y, z);
    }
    // the line, from the tip to the float, hanging as slack as it is
    this.line.position.copy(tip);
    const end = this.float.position;
    const dx = end.x - tip.x;
    const dy = end.y + FLOAT * 0.4 - tip.y;
    const dz = end.z - tip.z;
    const sag = SAG * Math.hypot(dx, dz) * slack;
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1);
      this.points[i * 3] = dx * k;
      this.points[i * 3 + 1] = dy * k - sag * 4 * k * (1 - k);
      this.points[i * 3 + 2] = dz * k;
    }
    this.line.geometry.attributes.position.needsUpdate = true;
  }
}
