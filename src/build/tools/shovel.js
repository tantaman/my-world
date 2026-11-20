// The shovel: dig (first button) and fill (second), to the grade stake if
// one is set; clear undergrowth and pocket small stones as it goes; and grub
// out stumps.

import { DIG, REACH, LIFTABLE, stonesIn } from '../constants.js';
import { makeShovel } from '../geometry.js';
import { GroundRing } from '../previews.js';

const GRUB_TIME = 2.4; // seconds to get a stump out
const EARTH = 0x4a3524;

export const shovel = {
  id: 'shovel',
  label: 'shovel',
  short: 'dig',
  held: { name: 'shovel', make: makeShovel, rest: 2.75, elbow: -0.35 },
  stake: true,

  setup(b) {
    this.ring = new GroundRing(b.previews);
  },

  target(b) {
    const g = b.ground;
    if (!g) return null;
    if (b.dist(g.p.x, g.p.z) > REACH.shovel) return { prompt: 'too far to dig', far: true };
    const stump = b.forest.stumpNear(g.p.x, g.p.z, 0.7);
    if (stump) return { type: 'stump', ok: true, stump, x: stump.x, z: stump.z, prompt: '<b>hold click</b> grub out the stump' };
    // vertices the shovel can't move: roots of standing trees, stumps,
    // boulders, footings — anything that says it needs the ground left alone
    const inTheWay = b.obstacles.near(g.p.x, g.p.z, DIG.radius + 3).filter((o) => o.dig);
    const blocked = (ix, iz) => inTheWay.some((o) => (ix - o.x) ** 2 + (iz - o.z) ** 2 < o.dig * o.dig);
    const roots = inTheWay.some((o) => Math.hypot(o.x - g.p.x, o.z - g.p.z) < o.dig);
    let txt;
    if (b.stake.datum) {
      const dh = g.p.y - b.stake.level;
      const rel = Math.abs(dh) < 0.03 ? 'on grade' : `${dh > 0 ? '+' : '−'}${Math.round(Math.abs(dh) * 100)} cm`;
      txt = `<b>hold click</b> cut · <b>right</b> fill to grade <i>(${rel})</i> · <b>G</b> move stake`;
    } else txt = '<b>hold click</b> dig · <b>right</b> fill · <b>G</b> set a grade stake';
    if (roots) txt += ' · <i>roots or stone in the way</i>';
    return { type: 'ground', ok: true, x: g.p.x, z: g.p.z, blocked, prompt: txt };
  },

  work(b, t, io) {
    if (!t || !t.ok) {
      b.dropHold();
      return false;
    }
    const ch = b.player.character;
    if (t.type === 'stump') {
      if (!io.use) {
        b.dropHold();
        return false;
      }
      const done = b.holding(t.stump, GRUB_TIME, io.dt);
      b.face(t.x, t.z);
      ch.play('dig', 0.85, true);
      b.digNoise(io.dt, 'grub', t.stump, 0x5a4330);
      if (done) {
        const s = t.stump;
        b.forest.removeStump(s);
        b.terrain.clear(s.x, s.z, s.r + 0.9, -0.12);
        b.regrow(s.x, s.z, 2);
        b.sound.sfx('thud', { size: 0.5 });
        b.flash('stump grubbed out');
      }
      return true;
    }
    b.dropHold();
    if (!io.use && !io.alt) return false;
    const mode = io.use ? 'dig' : 'fill';
    const g = b.ground.p;
    if (mode === 'fill' && !b.have('soil', 0.001)) {
      if (io.altTap) {
        b.flash('no soil to fill with: dig some first');
        b.sound.sfx('deny');
      }
      return false;
    }
    // clear the undergrowth and pick up any small stones in the way
    b.chunks.forEachPlant(g.x, g.z, DIG.radius * 0.85, ['bush', 'fern', 'log', 'rock'], (c, kind, k, x, y, z, s) => {
      if (kind === 'rock') {
        if (s > LIFTABLE) return;
        b.gain('stone', stonesIn(s));
      }
      b.forest.removePlant(c, kind, k);
    });
    const r = b.terrain.stroke({
      x: g.x,
      z: g.z,
      mode,
      dt: io.dt,
      datum: b.stake.level,
      soil: b.creative ? Infinity : b.inv.soil,
      blocked: t.blocked,
    });
    if (r.soil > 0) b.gain('soil', r.soil);
    else if (r.soil < 0) b.spend('soil', -r.soil);
    b.regrow(g.x, g.z, DIG.radius + 1);
    b.face(g.x, g.z);
    ch.play('dig', 0.9, true);
    if (r.moved) b.digNoise(io.dt, mode, g, EARTH);
    return true;
  },

  preview(b, t) {
    if (t && t.type === 'ground') this.ring.place(t.x, t.z, DIG.radius);
  },
};
