// Other people's jetpacks. Each of you takes your own off the rack, but you
// see the one on someone's back, and when they fly, how high they are and
// the jets burning under them. They say so to everyone here (save.say on the
// 'jetpack' channel) as they strap it on and hang it up, as the jets fire and
// cut out, and a few times a second while they're flying; nothing about it
// is kept.
//
//   { have: bool, y?: m, burn?: 0..1 }   y and burn only while the jets burn

import { FLYING } from './jets.js';
import { clamp } from '../noise.js';

const EASE = 6; // how hard a flier is pulled toward the height they said (1/s)
const FLAG = 2.25; // m from their feet up to their pennant (player/peers.js)
const HEARD = 90; // m away that someone's jets can no longer be heard

export class Jetpackers {
  // peers: everyone else here (player/peers.js); make(): a jetpack to put on
  // someone's back (model.js makeJetpack)
  constructor({ peers, make }) {
    this.peers = peers;
    this.make = make;
    this.all = new Map(); // peer id -> { pack, character, y, said, burn }
  }

  // What someone said about their jetpack.
  hear(id, body) {
    const have = !!body && body.have === true;
    const p = this.peers.get(id);
    let r = this.all.get(id);
    if (r && (!have || !p || p.character !== r.character)) {
      this.#drop(id, r);
      r = null;
    }
    if (!have || !p) return;
    if (!r) {
      r = { pack: this.make(), character: p.character, y: NaN, said: null, burn: 0 };
      p.character.addOnBack(r.pack.object);
      this.all.set(id, r);
    }
    r.said = Number.isFinite(body.y) ? body.y : null;
    r.burn = Number.isFinite(body.burn) ? clamp(body.burn, 0, 1) : 0;
  }

  // After everyone else has been put where they are. near: where you are
  // ({ x, z }). -> how loud the loudest of their jets is there, 0..1.
  update(dt, near) {
    let loud = 0;
    for (const [id, r] of this.all) {
      const p = this.peers.get(id);
      if (!p || p.character !== r.character) {
        this.#drop(id, r);
        continue;
      }
      const flying = r.said !== null;
      const ground = p.pos.y;
      const want = flying ? Math.max(ground, r.said) : ground;
      r.y = Number.isNaN(r.y) ? want : r.y + (want - r.y) * Math.min(1, dt * EASE);
      const ch = p.character;
      if (flying && ch.stood !== FLYING) ch.stance(FLYING);
      else if (!flying && ch.stood === FLYING) ch.stance(null);
      // (down again, they're where everyone else puts them)
      if (!flying && r.y - ground < 0.05) r.y = ground;
      else {
        ch.root.position.y = r.y;
        p.flag.position.y = r.y + FLAG;
      }
      r.pack.burn(flying ? r.burn : 0);
      if (flying && near) loud = Math.max(loud, r.burn * Math.max(0, 1 - Math.hypot(p.pos.x - near.x, p.pos.z - near.z) / HEARD));
    }
    return loud;
  }

  #drop(id, r) {
    r.pack.object.removeFromParent();
    if (r.character.stood === FLYING) r.character.stance(null);
    this.all.delete(id);
  }

  clear() {
    for (const [id, r] of this.all) this.#drop(id, r);
  }
}
