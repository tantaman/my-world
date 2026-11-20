// Footings: dig a hole on a grid node and set a stone pier in it. The first
// one starts a building; every other must come up to the same level.

import * as THREE from 'three';
import { PIER, REACH } from '../constants.js';
import { waterSample } from '../../core/geom.js';

const STONES = 2; // per footing
const SET_TIME = 1.3; // seconds to dig one and set the stones
const EARTH = 0x4a3524;
const _wet = waterSample();

export const footing = {
  id: 'footing',
  label: 'footing',
  short: 'pier',
  kit: 'earth',
  stake: true,
  grid: true,

  setup(b) {
    this.ghost = b.previews.ghost(new THREE.BoxGeometry(0.46, 1, 0.46));
  },

  target(b) {
    const g = b.ground;
    if (!g) return null;
    const x = Math.round(g.p.x);
    const z = Math.round(g.p.z);
    if (b.dist(x, z) > REACH.build) return { prompt: 'too far away', far: true, node: { x, z } };
    // one to lift?
    if (b.piece && b.piece.type === 'footing') {
      const f = b.piece.piece;
      const why = b.buildings.canRemoveFooting(b.piece.b, f);
      return { type: 'footing', node: { x, z }, existing: f, b: b.piece.b, why, prompt: why ? `can't lift this footing: ${why}` : `<b>right-click</b> lift this footing (+${STONES} stones)` };
    }
    const { node, c, reason } = footingCheck(b, x, z);
    if (reason) return { type: 'footing', node, bad: true, prompt: reason };
    const note = c.b ? `pier ${Math.round(c.pier * 100)} cm` : 'starts a new building at this level';
    return { type: 'footing', ok: true, node, c, prompt: `<b>hold click</b> dig a footing and set the stones <i>(${note})</i>` };
  },

  work(b, t, io) {
    if (io.altTap && t && t.existing) {
      if (t.why) b.deny(t);
      else {
        b.buildings.removeFooting(t.b, t.existing);
        if (!b.creative) b.gain('stone', STONES);
        b.sound.sfx('stone');
      }
      return false;
    }
    if (!io.use || !t || !t.ok) {
      if (io.use && io.useTap) b.deny(t);
      b.dropHold();
      return false;
    }
    digFooting(b, t.node, t.c, io.dt);
    return true;
  },

  preview(b, t) {
    if (!t || !t.node || t.existing || t.far) return;
    const { x, z } = t.node;
    const ground = t.node.ground ?? b.chunks.heightAt(x, z);
    const top = t.node.y0 ?? ground + PIER.first;
    const h = Math.max(0.05, top - ground + 0.1);
    this.ghost.scale.set(1, h, 1);
    this.ghost.position.set(x, ground - 0.1 + h / 2, z);
    b.previews.show(this.ghost, t.ok);
  },
};

// Can a footing go in at node (x, z), here and now? What the prompt says, and
// what the blueprint foreman asks before it digs.
// -> { node: { x, z, ground, y0 }, c: footingCandidate, reason: why not, or
//      null, short: it's stones that are lacking }
export function footingCheck(b, x, z) {
  const ground = b.chunks.heightAt(x, z);
  const c = b.buildings.footingCandidate(x, z, ground);
  const node = { x, z, ground, y0: c.y0 ?? (c.b ? c.b.y0 : ground + PIER.first) };
  const reason = c.ok ? footingSpot(b, x, z) : c.reason;
  if (reason) return { node, c, reason };
  if (!b.have('stone', STONES)) return { node, c, short: true, reason: `you need ${STONES} stones (hands: pick some up)` };
  return { node, c, reason: null };
}

// Whatever but the lie of the land stops a footing at (x, z): water (unless
// `water` is false), or something standing too close (but what `ignore`
// says will be gone by then). -> why, or null
export function footingSpot(b, x, z, { water = true, ignore = null } = {}) {
  if (water && b.chunks.waterAt(x, z, _wet) && _wet.depth > -0.05) return "that's under water: fill it in first (shovel, right-click)";
  const o = b.obstacles.near(x, z, 3).find((q) => q.footing && Math.hypot(q.x - x, q.z - z) < q.footing && !(ignore && ignore(q)));
  return o ? `${o.what} is in the way` : null;
}

// One frame of digging the footing at `node` (from footingCheck); the stones
// go in once the hole is dug. Call it every frame the work goes on.
// -> true on the frame the footing is set.
export function digFooting(b, node, c, dt) {
  const done = b.holding(`${node.x},${node.z}`, SET_TIME, dt);
  b.face(node.x, node.z);
  b.player.character.play('dig', 0.85, true);
  b.digNoise(dt, 'dig', node, EARTH);
  if (!done) return false;
  const { x, z, ground } = node;
  b.terrain.clear(x, z, 0.75);
  const fresh = !c.b;
  if (b.buildings.addFooting(x, z, ground)) {
    b.spend('stone', STONES);
    b.sound.sfx('stone');
    b.regrow(x, z, 1.5);
    if (fresh) {
      if (!b.stake.datum) b.stake.set(x, ground, z);
      b.flash('a new building: its other footings must match this level');
    }
  }
  return true;
}
