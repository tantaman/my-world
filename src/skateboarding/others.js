// Other people on their skateboards. Each of you rides your own way, but when
// someone rolls by you see them on theirs. They say so to everyone here
// (save.say on the 'skate' channel) as they step on and off, and as the jets
// on their back start and stop pushing them; nothing about it is kept.
//
//   { on: true | false, jets?: true }

import { Pose } from './pose.js';
import { makeBoard } from './board.js';

export class Skaters {
  // peers: everyone else here (player/peers.js)
  constructor(peers) {
    this.peers = peers;
    this.all = new Map(); // peer id -> { pose, character }
    this._made = 0;
  }

  // What someone said about whether they're on a board.
  hear(id, body) {
    const on = !!(body && body.on === true);
    const p = this.peers.get(id);
    let r = this.all.get(id);
    if (!on || !p) {
      if (r) r.character.stance(null);
      this.all.delete(id);
      return;
    }
    // a board of their own, painted differently from yours
    if (!r) this.all.set(id, (r = { pose: new Pose(makeBoard(++this._made)), character: p.character }));
    r.character.stance(r.pose.standing(body.jets === true));
  }

  // Forget whoever has gone.
  update() {
    for (const id of this.all.keys()) if (!this.peers.get(id)) this.all.delete(id);
  }
}
