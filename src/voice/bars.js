// Over the head of whoever is talking: three little bars that jump with their
// voice, in their colour, so you can tell who it is across a clearing.

import * as THREE from 'three';

const ABOVE = 2.55; // m over their feet: just above the pennant
const GAP = 0.15; // m between bars
const LOW = 0.07; // m: a bar with nothing in it
const TALL = 0.5; // m: a bar at full voice
const WIDTH = 0.1; // m

const _box = new THREE.BoxGeometry(WIDTH, 1, WIDTH);
_box.translate(0, 0.5, 0); // grows up from its foot

export class TalkBars {
  constructor(scene) {
    this.scene = scene;
    this.shown = new Map(); // id -> { group, bars, material }
    this.time = 0;
  }

  // talking: [{ id, x, y, z, level, colour }], everyone talking now.
  // yaw: which way the camera faces, so the bars are seen face on.
  update(talking, yaw, dt) {
    this.time += dt;
    const seen = new Set();
    for (const who of talking) {
      seen.add(who.id);
      let m = this.shown.get(who.id);
      if (!m) this.shown.set(who.id, (m = this.#make()));
      m.material.color.set(who.colour || '#eef0e2');
      m.group.position.set(who.x, who.y + ABOVE, who.z);
      m.group.rotation.y = yaw;
      m.bars.forEach((bar, i) => {
        const wobble = 0.55 + 0.45 * Math.sin(this.time * (11 + i * 3) + i * 2.1);
        bar.scale.y = LOW + who.level * TALL * (i === 1 ? 1 : 0.7) * wobble;
      });
    }
    for (const [id, m] of this.shown) {
      if (seen.has(id)) continue;
      this.scene.remove(m.group);
      m.material.dispose();
      this.shown.delete(id);
    }
  }

  #make() {
    const material = new THREE.MeshBasicMaterial({ color: '#eef0e2', toneMapped: false });
    const group = new THREE.Group();
    const bars = [-1, 0, 1].map((i) => {
      const bar = new THREE.Mesh(_box, material);
      bar.position.x = i * GAP;
      bar.scale.y = LOW;
      group.add(bar);
      return bar;
    });
    this.scene.add(group);
    return { group, bars, material };
  }
}
