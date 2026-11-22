// Other people out on the airboat tour. They say so to everyone here
// (save.say on the 'airboat' channel) as they get in and out; nothing about
// it is kept. While someone's on the tour their airboat is drawn under them
// wherever it goes, with the guide up at the stick behind them, and they sit
// in the front row as you do.
//
//   { tour: id }   on the tour; null once they're off
//
// Where someone is says where their boat is: they sit in its front row
// (FRONT), so the boat is that far from them, turned their way.

import * as THREE from 'three';
import { buildAirboat } from './airboat.js';
import { makeGuide, sitDriving } from './guide.js';
import { SEAT_HIPS } from '../player/character.js';

const _v = new THREE.Vector3();

export class Riders {
  // peers: everyone else here (player/peers.js); materials: the boat's
  // (airboat.js); seat: how a passenger sits (Character.seat); front: which
  // of the boat's seats is theirs; guide: who drives, by tour id
  constructor({ scene, peers, materials, seat, front, guides }) {
    this.scene = scene;
    this.peers = peers;
    this.materials = materials;
    this.seat = seat;
    this.front = front;
    this.guides = guides;
    this.all = new Map(); // peer id -> { boat, guide, spin }
  }

  // What someone said about whether they're on the tour.
  hear(id, body) {
    const on = !!(body && typeof body.tour === 'string') && !!this.peers.get(id);
    const was = this.all.get(id);
    if (!on) {
      if (was) this.#drop(id, was);
      return;
    }
    if (was) return;
    const boat = buildAirboat(this.materials);
    const guide = makeGuide(this.guides(body.tour), id.length * 131);
    const g = boat.seats[boat.seats.length - 1];
    guide.mesh.position.set(g.x, g.y - guide.hips.userData.rest.y, g.z - 0.02);
    boat.object.add(guide.mesh);
    boat.blur.opacity = 0.3;
    this.scene.add(boat.object);
    this.all.set(id, { boat, guide, spin: 0 });
  }

  // Each frame: their boat under them, them sat in its front row, the
  // propeller going round.
  update(dt) {
    for (const [id, b] of this.all) {
      const p = this.peers.get(id);
      if (!p) {
        this.#drop(id, b);
        continue;
      }
      const s = b.boat.seats[this.front];
      const o = b.boat.object;
      const c = Math.cos(p.yaw);
      const n = Math.sin(p.yaw);
      o.position.set(p.pos.x - (s.x * c + s.z * n), p.pos.y + SEAT_HIPS - s.y, p.pos.z - (-s.x * n + s.z * c));
      o.rotation.set(0, p.yaw, 0);
      o.updateMatrixWorld();
      const ch = p.character;
      if (ch.seated !== this.seat) ch.seat(this.seat);
      _v.set(s.x, s.y, s.z).applyMatrix4(o.matrixWorld);
      ch.root.rotation.x = 0;
      ch.root.position.set(_v.x, _v.y - SEAT_HIPS, _v.z);
      p.flag.position.set(_v.x, _v.y + 1.4, _v.z);
      b.spin += dt * 30;
      b.boat.prop.rotation.z = b.spin;
      sitDriving(b.guide, dt);
    }
  }

  #drop(id, b) {
    this.scene.remove(b.boat.object);
    b.guide.dispose();
    this.all.delete(id);
    const p = this.peers.get(id);
    if (p) p.character.seat(null);
  }

  clear() {
    for (const [id, b] of this.all) this.#drop(id, b);
  }
}
