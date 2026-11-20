// Other people on their mounts. Each of you finds and tames your own, but
// when someone rides past you see what they're riding, and when they fly
// over, how high. They say so to everyone here (save.say on the 'mount'
// channel) as they get on and off, and a few times a second while they're
// in the air; nothing about it is kept.
//
//   { kind: 'horse' | 'turtle' | 'eagle' | null, y?: m }   y only while flying

import * as THREE from 'three';
import { BODIES } from './bodies.js';
import { MOUNTS } from './kinds.js';
import { SEAT_HIPS } from '../player/character.js';

const EASE = 6; // how hard a flier is pulled toward the height they said (1/s)
const FLAG = 1.35; // m from the rider's hips up to the pennant over their head
const _v = new THREE.Vector3();
const _o = new THREE.Vector3();

export class Riders {
  // peers: everyone else here (player/peers.js); stand(x, z, depth): where feet
  // rest there (ground, or afloat); water(x, z): how deep it is
  constructor({ scene, peers, stand, water }) {
    this.scene = scene;
    this.peers = peers;
    this.stand = stand;
    this.water = water;
    this.all = new Map(); // peer id -> { kind, body, y, said }
  }

  // What someone said about what they're riding.
  hear(id, body) {
    const kind = body && MOUNTS[body.kind] ? body.kind : null;
    let r = this.all.get(id);
    if (r && r.kind !== kind) {
      this.#drop(id, r);
      r = null;
    }
    if (!kind) return;
    if (!r) {
      r = { kind, body: new BODIES[kind](), y: NaN, said: null, placed: false };
      this.scene.add(r.body.mesh);
      this.all.set(id, r);
    }
    r.said = Number.isFinite(body.y) ? body.y : null;
  }

  update(dt) {
    for (const [id, r] of this.all) {
      const p = this.peers.get(id);
      if (!p) {
        this.#drop(id, r);
        continue;
      }
      const depth = MOUNTS[r.kind].carrier.depth;
      const x = p.pos.x;
      const z = p.pos.z;
      const floor = this.stand(x, z, depth);
      const flying = r.said !== null;
      const want = flying ? Math.max(floor, r.said) : floor;
      const was = r.y;
      r.y = Number.isNaN(r.y) ? want : r.y + (want - r.y) * Math.min(1, dt * EASE);
      if (!r.placed) {
        r.body.place(x, r.y, z, p.yaw);
        r.placed = true;
      }
      const vy = Number.isNaN(was) ? 0 : (r.y - was) / Math.max(dt, 1e-4);
      r.body.pose(dt, {
        x,
        y: r.y,
        z,
        yaw: p.yaw,
        speed: p.speed,
        turn: 0,
        vy,
        grounded: !flying,
        flying,
        climbing: vy > 0.5,
        swimming: !flying && this.water(x, z) > depth,
        graze: 0,
        alert: 0,
        look: 0,
        shy: false,
        ridden: true,
        ground: (gx, gz) => this.stand(gx, gz, depth),
      });
      // sit them on its back, their pennant over their head
      const ch = p.character;
      if (ch.seated !== r.body.seat) ch.seat(r.body.seat);
      ch.root.rotation.x = r.body.tilt * 0.8;
      r.body.saddle(_v);
      _o.set(0, SEAT_HIPS, 0).applyEuler(ch.root.rotation);
      ch.root.position.copy(_v).sub(_o);
      p.flag.position.set(_v.x, _v.y + FLAG, _v.z);
    }
  }

  #drop(id, r) {
    this.scene.remove(r.body.mesh);
    r.body.dispose();
    this.all.delete(id);
    const p = this.peers.get(id);
    if (p) {
      p.character.seat(null);
      p.character.root.rotation.x = 0;
    }
  }

  clear() {
    for (const [id, r] of this.all) this.#drop(id, r);
  }
}
