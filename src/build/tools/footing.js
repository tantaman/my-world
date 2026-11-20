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
    const ground = b.chunks.heightAt(x, z);
    const c = b.buildings.footingCandidate(x, z, ground);
    const node = { x, z, ground, y0: c.y0 ?? (c.b ? c.b.y0 : ground + PIER.first) };
    let bad = c.ok ? null : c.reason;
    if (!bad && b.chunks.waterAt(x, z, _wet) && _wet.depth > -0.05) bad = "that's under water: fill it in first (shovel, right-click)";
    if (!bad) {
      const o = b.obstacles.near(x, z, 3).find((q) => q.footing && Math.hypot(q.x - x, q.z - z) < q.footing);
      if (o) bad = `${o.what} is in the way`;
    }
    if (!bad && !b.have('stone', STONES)) bad = `you need ${STONES} stones (hands: pick some up)`;
    if (bad) return { type: 'footing', node, bad: true, prompt: bad };
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
    const done = b.holding(`${t.node.x},${t.node.z}`, SET_TIME, io.dt);
    b.face(t.node.x, t.node.z);
    b.player.character.play('dig', 0.85, true);
    b.digNoise(io.dt, 'dig', t.node, EARTH);
    if (done) {
      const { x, z, ground } = t.node;
      b.terrain.clear(x, z, 0.75);
      const fresh = !t.c.b;
      if (b.buildings.addFooting(x, z, ground)) {
        b.spend('stone', STONES);
        b.sound.sfx('stone');
        b.regrow(x, z, 1.5);
        if (fresh) {
          if (!b.stake.datum) b.stake.set(x, ground, z);
          b.flash('a new building: its other footings must match this level');
        }
      }
    }
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
