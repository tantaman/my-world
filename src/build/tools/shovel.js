// The shovel: dig (first button) and fill (second), to the grade stake if
// one is set; clear undergrowth and pocket small stones as it goes; and grub
// out stumps.

import { DIG, REACH, LIFTABLE, stonesIn } from '../constants.js';
import { makeShovel } from '../geometry.js';
import { GroundRing } from '../previews.js';

const GRUB_TIME = 2.4; // seconds to get a stump out
export const BRUSH = ['bush', 'fern', 'log', 'rock']; // what a spade clears away as it goes (rocks only if small)
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
    const { blocked, roots } = digObstacles(b, g.p.x, g.p.z);
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
    if (t.type === 'stump') {
      if (!io.use) {
        b.dropHold();
        return false;
      }
      grubStump(b, t.stump, io.dt);
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
    spadeWork(b, g.x, g.z, mode, io.dt, b.stake.level, t.blocked);
    return true;
  },

  preview(b, t) {
    if (t && t.type === 'ground') this.ring.place(t.x, t.z, DIG.radius);
  },
};

// What stops a spade near (x, z): the roots of standing trees, stumps,
// boulders, footings — anything that says it needs the ground left alone.
// -> { blocked(ix, iz): that vertex can't be moved, roots: (x, z) itself is among them }
export function digObstacles(b, x, z) {
  const inTheWay = b.obstacles.near(x, z, DIG.radius + 3).filter((o) => o.dig);
  return {
    blocked: (ix, iz) => inTheWay.some((o) => (ix - o.x) ** 2 + (iz - o.z) ** 2 < o.dig * o.dig),
    roots: inTheWay.some((o) => Math.hypot(o.x - x, o.z - z) < o.dig),
  };
}

// One frame of spade work centred on (x, z): clear the undergrowth and pocket
// any small stones, then dig or fill ('dig' | 'fill'), to `datum` if there is
// one, never touching a vertex that's `blocked`. The soil goes into, or comes
// out of, what you carry. The blueprint foreman levels a site with this too.
// -> whether any ground moved
export function spadeWork(b, x, z, mode, dt, datum, blocked) {
  clearBrush(b, x, z, DIG.radius * 0.85);
  const r = b.terrain.stroke({ x, z, mode, dt, datum, soil: b.creative ? Infinity : b.inv.soil, blocked });
  if (r.soil > 0) b.gain('soil', r.soil);
  else if (r.soil < 0) b.spend('soil', -r.soil);
  b.regrow(x, z, DIG.radius + 1);
  b.face(x, z);
  b.player.character.play('dig', 0.9, true);
  if (r.moved) b.digNoise(dt, mode, { x, z }, EARTH);
  return r.moved;
}

// Clear the brush within r of (x, z): bushes, ferns and old fallen logs go,
// and small stones go in your pocket. Boulders stay.
export function clearBrush(b, x, z, r) {
  b.chunks.forEachPlant(x, z, r, BRUSH, (c, kind, k, px, py, pz, s) => {
    if (kind === 'rock') {
      if (s > LIFTABLE) return;
      b.gain('stone', stonesIn(s));
    }
    b.forest.removePlant(c, kind, k);
  });
}

// One frame of grubbing out a stump; call it every frame the work goes on.
// The blueprint foreman clears a site of stumps this way too.
// -> true on the frame it comes out
export function grubStump(b, stump, dt) {
  const done = b.holding(stump, GRUB_TIME, dt);
  b.face(stump.x, stump.z);
  b.player.character.play('dig', 0.85, true);
  b.digNoise(dt, 'grub', stump, 0x5a4330);
  if (!done) return false;
  b.forest.removeStump(stump);
  b.terrain.clear(stump.x, stump.z, stump.r + 0.9, -0.12);
  b.regrow(stump.x, stump.z, 2);
  b.sound.sfx('thud', { size: 0.5 });
  b.flash('stump grubbed out');
  return true;
}
