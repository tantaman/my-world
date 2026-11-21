// Other people on their hang gliders. When someone glides over, you see the
// glider and them hanging under it, as high as they are and banked as they
// bank. They say so to everyone here (save.say on the 'glide' channel) a few
// times a second while they fly, and once more when they're down; nothing
// about it is kept.
//
//   { y: m, bank: radians, open: 0..1, upright: 0..1 }   in the air
//   null                                                 down again

import { Wing } from './wing.js';
import { HANG, harness, pose, unhang } from './pilot.js';

const EASE = 6; // how hard a glider is pulled toward what was said (1/s)
const FLAG = 1.8; // m from the hang point up to the pennant, over the sail
const num = (v, otherwise) => (Number.isFinite(v) ? v : otherwise);

export class Gliders {
  // peers: everyone else here (player/peers.js)
  constructor({ scene, peers }) {
    this.scene = scene;
    this.peers = peers;
    this.all = new Map(); // peer id -> { wing, spec, said, y, bank, open, upright }
  }

  // What someone said about their glider.
  hear(id, body) {
    let g = this.all.get(id);
    if (!body || !Number.isFinite(body.y)) {
      if (g) this.#drop(id, g);
      return;
    }
    if (!g) {
      g = { wing: new Wing(), spec: harness(), said: body, y: body.y, bank: 0, open: 0, upright: 1 };
      this.scene.add(g.wing.mesh);
      this.all.set(id, g);
    }
    g.said = body;
  }

  update(dt) {
    const k = Math.min(1, dt * EASE);
    for (const [id, g] of this.all) {
      const p = this.peers.get(id);
      if (!p) {
        this.#drop(id, g);
        continue;
      }
      const s = g.said;
      g.y += (num(s.y, g.y) - g.y) * k;
      g.bank += (num(s.bank, 0) - g.bank) * k;
      g.open += (num(s.open, 1) - g.open) * k;
      g.upright += (num(s.upright, 0) - g.upright) * k;
      const hx = p.pos.x;
      const hy = g.y + HANG;
      const hz = p.pos.z;
      g.wing.pose(hx, hy, hz, p.yaw, g.bank, 0, g.open);
      const ch = p.character;
      if (ch.hung !== g.spec) ch.hang(g.spec);
      pose(ch.root, g.spec, hx, hy, hz, p.yaw, g.bank, g.upright);
      p.flag.position.set(hx, hy + FLAG, hz);
    }
  }

  #drop(id, g) {
    this.scene.remove(g.wing.mesh);
    g.wing.dispose();
    this.all.delete(id);
    const p = this.peers.get(id);
    if (p) {
      p.character.hang(null);
      unhang(p.character.root);
    }
  }

  clear() {
    for (const [id, g] of this.all) this.#drop(id, g);
  }
}
