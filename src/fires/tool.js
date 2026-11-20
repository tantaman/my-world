// The campfire tool: ring a pit with stones, lay wood in it, light it, feed
// it. The second button kicks earth over a fire, or takes an empty ring apart
// for its stones and whatever wood is left in it.
//
// It is an ordinary tool (the contract is at the top of build/builder.js),
// registered by the fires feature rather than the builder.

import * as THREE from 'three';
import { FIRE } from './fires.js';
import { SPECIES } from '../build/forestry.js';
import { REACH, ROOF, LIFTABLE, stonesIn } from '../build/constants.js';
import { tenths } from '../build/inventory.js';
import { waterSample } from '../core/geom.js';

const TEND = 2.8; // metres from the ring you can tend a fire from
const DIG_TIME = 1.6; // seconds to scrape a pit and set the stones
const STEEP = 0.3; // metres the ground may rise and fall across a pit
const EARTH = 0x4a3524;
const NAMES = { ring: 'a fire ring', laid: 'a fire laid ready', burning: 'a fire', embers: 'embers', cold: 'a cold fire ring' };
const _wet = waterSample();

// solids: built things you bump into, to keep a fire off a building
export function campfireTool(fires, solids) {
  let ghost = null;

  return {
    id: 'fire',
    label: 'campfire',
    short: 'fire',

    setup(b) {
      ghost = b.previews.ghost(new THREE.TorusGeometry(FIRE.ring, 0.08, 5, 18).rotateX(Math.PI / 2));
    },

    // A fire you're looking at, or somewhere to make one.
    target(b) {
      const g = b.ground;
      const p = b.aimPoint || (g && g.p);
      if (!p) return null;
      const near = fires.near(p.x, p.z, FIRE.ring + 0.5);
      if (near) return tend(b, near);
      if (!g) return null;
      const x = Math.round(g.p.x);
      const z = Math.round(g.p.z);
      const node = { x, z, y: b.chunks.heightAt(x, z) };
      if (b.dist(x, z) > REACH.shovel) return { prompt: 'too far away', far: true, node };
      const why = blocked(b, x, z);
      if (why) return { type: 'pit', node, bad: true, prompt: why };
      if (!b.have('stone', FIRE.stones)) return { type: 'pit', node, bad: true, prompt: `a fire ring takes ${FIRE.stones} stones (have ${b.inv.stone}) · <i>hands: pick some up</i>` };
      return { type: 'pit', ok: true, node, prompt: `<b>hold click</b> clear a fire pit and ring it with stones <i>(${FIRE.stones} stones)</i>` };
    },

    work(b, t, io) {
      const f = t && t.fire;
      if (io.altTap && f && t.type) {
        b.dropHold();
        putOutOrTakeApart(b, f);
        return false;
      }
      if (t && t.type === 'pit') {
        if (!io.use || !t.ok) {
          if (io.use && io.useTap) b.deny(t);
          b.dropHold();
          return false;
        }
        const done = b.holding(`fire:${t.node.x},${t.node.z}`, DIG_TIME, io.dt);
        b.face(t.node.x, t.node.z);
        b.player.character.play('dig', 0.85, true);
        b.digNoise(io.dt, 'dig', t.node, EARTH);
        if (done) makePit(b, t.node.x, t.node.z);
        return true;
      }
      b.dropHold();
      if (!io.useTap) return false;
      if (!f || !t.ok) {
        if (t && t.full) b.flash('it has all the wood it can take: let it burn down a little');
        b.deny(t);
        return false;
      }
      b.face(f.x, f.z);
      if (t.type === 'lay') {
        b.swing('bend', 0.8, 0.6, () => {
          const live = fires.at(f.x, f.z);
          if (!live || !fires.lay(live, FIRE.lay)) return;
          b.spend('log', FIRE.lay);
          b.sound.sfx('thud', { size: 0.1 });
          b.flash('the fire is laid: click to light it');
        });
      } else if (t.type === 'light') {
        b.sound.sfx('strike');
        b.swing('bend', 1.1, 0.62, () => {
          const live = fires.at(f.x, f.z);
          if (!live || !fires.light(live)) return;
          b.sound.sfx('ignite');
          b.flash('it caught');
        });
      } else if (t.type === 'feed') {
        const embers = fires.state(f).state === 'embers';
        b.swing('bend', 0.7, 0.6, () => {
          const live = fires.at(f.x, f.z);
          if (!live || !fires.feed(live, FIRE.feed)) return;
          b.spend('log', FIRE.feed);
          b.sound.sfx('thud', { size: 0.1 });
          if (embers) {
            b.sound.sfx('ignite');
            b.flash('the embers took it');
          }
        });
      }
      return true;
    },

    preview(b, t) {
      if (!t || t.type !== 'pit') return;
      ghost.position.set(t.node.x, t.node.y + 0.06, t.node.z);
      b.previews.show(ghost, t.ok);
    },
  };

  // ── What a click would do to a fire that's there ──────────────────────────
  function tend(b, f) {
    const st = fires.state(f);
    const name = NAMES[st.state];
    if (b.dist(f.x, f.z) > TEND + FIRE.ring) return { fire: f, prompt: `${name}: <i>come closer</i>` };
    const mins = (m) => `${Math.max(1, Math.round((m * FIRE.burn) / 60))} min`;
    switch (st.state) {
      case 'ring':
      case 'cold': {
        const take = `<b>right-click</b> take the ring apart <i>(+${FIRE.stones} stones)</i>`;
        if (!b.have('log', FIRE.lay)) return { type: 'lay', fire: f, bad: true, prompt: `laying a fire takes ${FIRE.lay} m of log (have ${tenths(b.inv.log)}) · ${take}` };
        return { type: 'lay', ok: true, fire: f, prompt: `<b>click</b> split ${FIRE.lay} m of log and lay a fire · ${take}` };
      }
      case 'laid':
        return { type: 'light', ok: true, fire: f, prompt: `<b>click</b> light it <i>(${tenths(f.wood)} m of wood, about ${mins(f.wood)})</i> · <b>right-click</b> take it apart` };
      case 'burning': {
        const out = '<b>right-click</b> put it out';
        const left = st.age < FIRE.catch ? 'catching…' : `about ${mins(st.fuel)} of wood left`;
        if (st.fuel + FIRE.feed > FIRE.max + 1e-6) return { type: 'feed', fire: f, full: true, prompt: `burning well <i>(${left})</i> · ${out}` };
        if (!b.have('log', FIRE.feed)) return { type: 'feed', fire: f, bad: true, prompt: `<i>${left}</i> · more wood takes ${FIRE.feed} m of log · ${out}` };
        return { type: 'feed', ok: true, fire: f, prompt: `<b>click</b> put on more wood <i>(${FIRE.feed} m · ${left})</i> · ${out}` };
      }
      case 'embers': {
        const out = '<b>right-click</b> put them out';
        if (!b.have('log', FIRE.feed)) return { type: 'feed', fire: f, bad: true, prompt: `glowing embers · rekindling takes ${FIRE.feed} m of log · ${out}` };
        return { type: 'feed', ok: true, fire: f, prompt: `<b>click</b> rekindle the embers <i>(${FIRE.feed} m of log)</i> · ${out}` };
      }
    }
    return null;
  }

  // ── Why a fire can't go on grid node (x, z), or null if it can ────────────
  function blocked(b, x, z) {
    const H = (dx, dz) => b.chunks.heightAt(x + dx, z + dz);
    const hs = [H(0, 0), H(0.7, 0), H(-0.7, 0), H(0, 0.7), H(0, -0.7)];
    if (Math.max(...hs) - Math.min(...hs) > STEEP) return 'too steep for a fire: level a spot with the shovel';
    const r = FIRE.ring;
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      if (b.chunks.waterAt(x + dx, z + dz, _wet) && _wet.depth > -0.05) return 'too wet for a fire: fill it in first (shovel, right-click)';
    }
    if (fires.near(x, z, FIRE.apart)) return 'too close to the other fire';
    const tree = b.forest.treeNear(x, z, FIRE.trees + 1);
    if (tree && Math.hypot(tree.x - x, tree.z - z) - SPECIES[tree.kind].r * tree.s < FIRE.trees) {
      return `too close to ${SPECIES[tree.kind].a}: its branches would catch`;
    }
    if (b.forest.stumpNear(x, z, r + 0.3)) return 'a stump is in the way: grub it out with the shovel';
    if (b.forest.felledNear(x, z, r + 0.3)) return 'a felled tree is in the way';
    let boulder = false;
    b.chunks.forEachPlant(x, z, 1.6, ['rock'], (ch, kind, k, rx, ry, rz, s) => {
      if (s > LIFTABLE && Math.hypot(rx - x, rz - z) < s * 0.9 + r) boulder = true;
    });
    if (boulder) return 'a boulder is in the way';
    const o = ROOF.overhang + 0.5;
    for (const bld of b.buildings.list) {
      for (const roof of bld.roofs) {
        if (x > roof.x0 - o && x < roof.x1 + o && z > roof.z0 - o && z < roof.z1 + o) return 'under a roof: a fire needs open sky';
      }
    }
    let built = false;
    solids.forEachNear(x, z, 2, (s) => {
      if (built) return;
      const ex = s.bx - s.ax;
      const ez = s.bz - s.az;
      const l2 = ex * ex + ez * ez;
      const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((x - s.ax) * ex + (z - s.az) * ez) / l2)) : 0;
      if (Math.hypot(x - (s.ax + ex * t), z - (s.az + ez * t)) < s.r + r + 0.15) built = true;
    });
    if (built) return 'too close to the building';
    // and anything else a footing would have to go round, whoever put it there
    const thing = b.obstacles.near(x, z, 3).find((q) => q.footing && Math.hypot(q.x - x, q.z - z) < q.footing);
    if (thing) return `${thing.what} is in the way`;
    return null;
  }

  // ── Right-click: kick earth over it, or take the ring apart ───────────────
  function putOutOrTakeApart(b, f) {
    const st = fires.state(f).state;
    b.face(f.x, f.z);
    if (st === 'burning' || st === 'embers') {
      b.swing('bend', 0.9, 0.5, () => {
        const live = fires.at(f.x, f.z);
        const was = live && fires.douse(live);
        if (!was) return;
        b.sound.sfx('fill');
        b.sound.sfx('douse');
        b.chips.burst(new THREE.Vector3(f.x, f.y + 0.1, f.z), 10, EARTH, 1.6, 0.5);
        b.flash(was === 'burning' && live.wood ? `put out · ${tenths(live.wood)} m of charred wood left to light again` : 'put out');
      });
      return;
    }
    b.swing('bend', 0.8, 0.6, () => {
      const live = fires.at(f.x, f.z);
      if (!live) return;
      const wood = fires.remove(live);
      b.sound.sfx('stone');
      b.regrow(f.x, f.z, 1.5);
      if (b.creative) return b.flash('the ring is taken apart');
      const back = Math.floor(wood * 2) / 2;
      b.gain('stone', FIRE.stones);
      if (back > 0) b.gain('log', back);
      b.flash(`+${FIRE.stones} stones${back > 0 ? ` · +${tenths(back)} m of log` : ''}`);
    });
  }

  // Scrape the turf off, pick the undergrowth and loose stones out of the
  // way, dish the floor a little and set the stones round it.
  function makePit(b, x, z) {
    b.chunks.forEachPlant(x, z, FIRE.ring + 0.6, ['bush', 'fern', 'log', 'rock'], (c, kind, k, px, py, pz, s) => {
      if (kind === 'rock') {
        if (s > LIFTABLE) return;
        b.gain('stone', stonesIn(s));
      }
      b.forest.removePlant(c, kind, k);
    });
    b.terrain.clear(x, z, 1.05, -0.1);
    fires.add(x, z, b.chunks.heightAt(x, z));
    b.spend('stone', FIRE.stones);
    b.sound.sfx('stone');
    b.regrow(x, z, 2);
    b.flash(`a fire ring: now lay a fire in it (${FIRE.lay} m of log)`);
  }
}
