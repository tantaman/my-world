// The roof: aim into a finished rectangular room and raise a gable roof over
// it, in hewn timber. The second button takes one down.

import * as THREE from 'three';
import { ROOF } from '../constants.js';
import { Mesher, addRoof } from '../geometry.js';
import { tenths } from '../inventory.js';

export const roof = {
  id: 'roof',
  label: 'roof',
  short: 'roof',
  roofs: true,

  setup(b) {
    this.ghost = b.previews.ghost(new THREE.BufferGeometry());
    this.ghostKey = '';
  },

  target(b) {
    const p = b.aimPoint;
    if (!p) return null;
    if (b.piece && b.piece.type === 'roof') {
      return { type: 'roof', existing: b.piece.piece, b: b.piece.b, prompt: '<b>right-click</b> take the roof down' };
    }
    const q = p.clone().addScaledVector(b.aimD, 0.35);
    const at = b.buildings.buildingFor(q.x, q.z);
    if (!at) return { prompt: 'aim inside a room of a building', bad: true };
    let chk = roofCheck(b, at, q.x, q.z);
    if (!chk.c.room) chk = roofCheck(b, at, p.x, p.z);
    const { c, reason } = chk;
    if (!c.ok) return { prompt: c.reason, bad: true, room: c.room };
    if (reason) return { prompt: reason, bad: true, room: c.room, ghostRoof: c.roof };
    const r = c.room;
    return { type: 'roof', ok: true, b: at, c, ghostRoof: c.roof, prompt: `<b>click</b> raise the roof over this ${r.x1 - r.x0} × ${r.z1 - r.z0} m room <i>(${c.cost} m timber)</i>` };
  },

  work(b, t, io) {
    if (io.useTap && t && t.ok) raiseRoof(b, t.b, t.c);
    else if (io.useTap) b.deny(t);
    if (io.altTap && t && t.existing) {
      const r = t.existing;
      b.buildings.removeRoof(t.b, r);
      if (!b.creative) b.gain('timber', Math.ceil((r.x1 - r.x0) * (r.z1 - r.z0) * ROOF.cost));
      b.sound.sfx('thud', { size: 1 });
    }
    return false;
  },

  preview(b, t) {
    if (!t || !t.ghostRoof) return;
    const r = t.ghostRoof;
    const key = `${r.x0},${r.z0},${r.x1},${r.z1},${r.eave.toFixed(3)},${r.axis}`;
    if (key !== this.ghostKey) {
      const m = new Mesher();
      addRoof(m, r, ROOF.pitch, ROOF.overhang, 1);
      this.ghost.geometry.dispose();
      this.ghost.geometry = m.build();
      this.ghostKey = key;
    }
    b.previews.show(this.ghost, t.ok);
  },
};

// Can the room of building `at` around (x, z) take its roof, here and now?
// -> { c: roofCandidate, reason: why not (the rules, something under it that
//      a roof can't go over, or not enough timber) or null, short: it's the
//      timber that's lacking }
export function roofCheck(b, at, x, z) {
  const c = b.buildings.roofCandidate(at, x, z);
  if (!c.ok) return { c, reason: c.reason };
  const under = underRoof(b, c.room);
  if (under) return { c, reason: `there is ${under.what} in this room${under.roofWhy ? ` and ${under.roofWhy}` : ''}: take it out first` };
  if (!b.have('timber', c.cost)) return { c, short: true, reason: `a roof here takes ${c.cost} m of hewn timber (have ${tenths(b.inv.timber)})` };
  return { c, reason: null };
}

// Something in the room that a roof can't go over (a fire ring), or null.
function underRoof(b, r) {
  const R = Math.hypot(r.x1 - r.x0, r.z1 - r.z0) / 2 + 1;
  return b.obstacles.near((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, R).find((o) => o.roof && o.x > r.x0 - o.roof && o.x < r.x1 + o.roof && o.z > r.z0 - o.roof && o.z < r.z1 + o.roof) || null;
}

// Raise the roof roofCheck found room for, and pay for it.
export function raiseRoof(b, at, c) {
  b.buildings.addRoof(at, c.roof);
  b.spend('timber', c.cost);
  b.player.character.play('bend', 0.6);
  b.sound.sfx('thud', { size: 1 });
  b.flash('the roof is on');
}
