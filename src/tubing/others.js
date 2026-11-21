// Other people floating down the river in their tubes. They say so to
// everyone here (save.say on the 'tube' channel) as they get in and out;
// nothing about it is kept. While someone is in theirs, it's drawn under
// them on the water wherever they go, and they sit in it.
//
//   { on: true }   in a tube; null once they're out of it

import { makeTube } from './model.js';
import { SEAT_HIPS } from '../player/character.js';

export class Tubers {
  // peers: everyone else here (player/peers.js)
  // surface(x, z): the water's level there, or null where there's none
  // seat: how someone sits in a tube (Character.seat)
  // sit: { sink, back }: how far (m) under the tube's middle the hips sit, and back of it
  constructor({ scene, peers, surface, seat, sit }) {
    this.scene = scene;
    this.peers = peers;
    this.surface = surface;
    this.seat = seat;
    this.sit = sit;
    this.all = new Map(); // peer id -> mesh
  }

  // What someone said about whether they're in a tube.
  hear(id, body) {
    const on = !!(body && body.on === true) && !!this.peers.get(id);
    const was = this.all.get(id);
    if (!on) {
      if (was) this.#drop(id, was);
      return;
    }
    if (was) return;
    const mesh = makeTube();
    this.scene.add(mesh);
    this.all.set(id, mesh);
  }

  // Each frame: their tube under them on the water, and them sat in it.
  update() {
    for (const [id, mesh] of this.all) {
      const p = this.peers.get(id);
      if (!p) {
        this.#drop(id, mesh);
        continue;
      }
      const y = this.surface(p.pos.x, p.pos.z) ?? p.pos.y;
      mesh.position.set(p.pos.x, y, p.pos.z);
      mesh.rotation.set(0, p.yaw, 0);
      const ch = p.character;
      if (ch.seated !== this.seat) ch.seat(this.seat);
      const s = Math.sin(p.yaw);
      const c = Math.cos(p.yaw);
      ch.root.rotation.x = 0;
      ch.root.position.set(p.pos.x - s * this.sit.back, y - this.sit.sink - SEAT_HIPS, p.pos.z - c * this.sit.back);
      p.flag.position.set(p.pos.x, y + 1.3, p.pos.z);
    }
  }

  #drop(id, mesh) {
    this.scene.remove(mesh);
    this.all.delete(id);
    const p = this.peers.get(id);
    if (p) p.character.seat(null);
  }

  clear() {
    for (const [id, mesh] of this.all) this.#drop(id, mesh);
  }
}
