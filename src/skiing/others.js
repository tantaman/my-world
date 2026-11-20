// Other people on their skis or boards. Each of you skis your own way down,
// but when someone goes by you see what they're on. They say so to everyone
// here (save.say on the 'ski' channel) as theirs go on, are swapped and come
// off; nothing about it is kept.
//
//   { kind: 'skis' | 'board' | null }

import { Pose } from './pose.js';
import { makeGear } from './gear.js';

export class Skiers {
  // peers: everyone else here (player/peers.js)
  constructor(peers) {
    this.peers = peers;
    this.all = new Map(); // peer id -> { pose, character }
  }

  // What someone said about what they're on.
  hear(id, body) {
    const kind = body && (body.kind === 'skis' || body.kind === 'board') ? body.kind : null;
    const p = this.peers.get(id);
    let r = this.all.get(id);
    if (!kind || !p) {
      if (r) r.character.stance(null);
      this.all.delete(id);
      return;
    }
    if (!r) this.all.set(id, (r = { pose: new Pose(makeGear()), character: p.character }));
    r.character.stance(r.pose.use(kind));
  }

  // Forget whoever has gone.
  update() {
    for (const id of this.all.keys()) if (!this.peers.get(id)) this.all.delete(id);
  }
}
