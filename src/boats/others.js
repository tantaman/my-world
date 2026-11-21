// Other people out in boats. When someone takes a boat out, they say so to
// everyone here (save.say on the 'boat' channel), and say again when they get
// out: the boat isn't drawn where it was left while they're in it, but under
// them, wherever they paddle it. Nothing about it is kept; where they leave
// it is, as a change to the world (boats.js).
//
//   { id, kind }   the boat they're in, or null once they're out of it

import * as THREE from 'three';
import { SEAT_HIPS } from '../player/character.js';
import { BOATS } from './kinds.js';
import { boatGeometry } from './models.js';

const _v = new THREE.Vector3();

export class Paddlers {
  // peers: everyone else here (player/peers.js); boats: the boats (boats.js)
  // stand(x, z, draft): where a keel rests there, afloat or on the bottom
  constructor({ scene, peers, boats, stand }) {
    this.scene = scene;
    this.peers = peers;
    this.boats = boats;
    this.stand = stand;
    this.all = new Map(); // peer id -> { id, kind, mesh }
  }

  // What someone said about the boat they're in.
  hear(who, body) {
    const kind = body && BOATS[body.kind] && typeof body.id === 'string' ? body.kind : null;
    const was = this.all.get(who);
    if (was && (!kind || was.id !== body.id)) this.#drop(who, was);
    if (!kind || (was && was.id === body.id)) return;
    const mesh = new THREE.Mesh(boatGeometry(kind, 1), this.boats.material);
    mesh.castShadow = true;
    mesh.rotation.order = 'YXZ';
    this.scene.add(mesh);
    this.all.set(who, { id: body.id, kind, mesh });
    const left = this.boats.get(body.id);
    if (left) this.boats.setOut(left, who);
  }

  // Each frame: their boat under them, and them sat in it.
  update() {
    for (const [who, r] of this.all) {
      const p = this.peers.get(who);
      if (!p) {
        this.#drop(who, r);
        continue;
      }
      const def = BOATS[r.kind];
      // (the boat may have been put up again since: keep it out of sight)
      const left = this.boats.get(r.id);
      if (left && left.out !== who) this.boats.setOut(left, who);
      const y = this.stand(p.pos.x, p.pos.z, def.draft);
      const b = { x: p.pos.x, z: p.pos.z, yaw: p.yaw, phase: 0 };
      this.boats.pose(b, r.mesh, y, 0, true);
      const ch = p.character;
      if (ch.seated !== def.pose) ch.seat(def.pose);
      ch.root.rotation.x = 0;
      _v.set(0, def.seat.y, def.seat.z).applyEuler(r.mesh.rotation).add(r.mesh.position);
      ch.root.position.set(_v.x, _v.y - SEAT_HIPS, _v.z);
      p.flag.position.set(_v.x, _v.y + 1.3, _v.z);
    }
  }

  #drop(who, r) {
    this.scene.remove(r.mesh);
    r.mesh.geometry.dispose();
    this.all.delete(who);
    const left = this.boats.get(r.id);
    if (left && left.out === who) this.boats.setOut(left, null);
    const p = this.peers.get(who);
    if (p) p.character.seat(null);
  }

  clear() {
    for (const [who, r] of this.all) this.#drop(who, r);
  }
}
