// The boat tool: build a canoe or a raft at the water's edge, get into one,
// or break one up again for its logs.
//
//   hold click         hollow a dugout canoe out of a log
//   hold right-click   lash a raft together out of logs
//   ...and aimed at a boat: click gets in, hold right-click breaks it up
//
// It is an ordinary tool (the contract is at the top of build/builder.js),
// registered by the boats feature. The hiker carries the axe for it: that's
// what a dugout is hollowed out with.

import * as THREE from 'three';
import { makeAxe } from '../build/geometry.js';
import { tenths } from '../build/inventory.js';
import { segDist } from '../core/geom.js';
import { BOATS, KINDS } from './kinds.js';
import { boatGeometry } from './models.js';
import { hullOf, hullDistance } from './boats.js';
import { site, rest } from './shore.js';

const BUILD_REACH = 4.5; // m from where you stand to where you can build one
const BOARD_REACH = 2.4; // m from a boat's hull you can climb in from
const BREAK = 3; // seconds to knock one apart
const SNAP = 0.5; // m: where a boat is built goes to the nearest of these
const CLEAR = 0.15; // m between a new boat's hull and anything in its way
const CHIPS = 0xc39a63;
const BARK = 0x5a4330;
const _seg = { d: 0, nx: 0, nz: 0, t: 0 };

// boats: the boats (boats.js)   world: the land and water, as shore.js wants it
// solids: built things, to keep a boat off them
// board(boat): climb into one (index.js)
export function boatTool({ boats, world, solids, board }) {
  const ghosts = {};
  const button = { canoe: 'click', raft: 'right-click' };

  const tool = {
    id: 'boat',
    label: 'boat',
    short: 'boat',
    held: { name: 'axe', make: makeAxe, rest: -0.3 },

    setup(b) {
      for (const kind of KINDS) ghosts[kind] = b.previews.ghost(boatGeometry(kind, 1));
    },

    target(b) {
      const p = b.aimPoint || (b.ground && b.ground.p);
      if (!p) return null;
      const boat = boats.near(p.x, p.z, 0.6);
      if (boat) return atBoat(b, boat);
      const g = b.ground;
      if (!g) return null;
      const x = Math.round(g.p.x / SNAP) * SNAP;
      const z = Math.round(g.p.z / SNAP) * SNAP;
      if (b.dist(x, z) > BUILD_REACH) return { prompt: 'too far away', far: true };
      const plans = Object.fromEntries(KINDS.map((kind) => [kind, plan(b, kind, x, z)]));
      const all = Object.values(plans);
      // the same reason for both (no water here): say it once
      if (all.every((q) => !q.ok && q.where)) return { type: 'build', plans, bad: true, prompt: plans.canoe.why };
      const say = KINDS.map((kind) => {
        const q = plans[kind];
        const def = BOATS[kind];
        const cost = b.creative ? '' : ` <i>(${def.log} m of log)</i>`;
        return q.ok ? `<b>hold ${button[kind]}</b> ${def.how}${cost}` : `<i>${def.name}: ${q.why}</i>`;
      });
      return { type: 'build', plans, ok: all.some((q) => q.ok), bad: !all.some((q) => q.ok), prompt: say.join(' · ') };
    },

    work(b, t, io) {
      if (t && t.type === 'boat') {
        if (io.useTap && t.ok) {
          b.dropHold();
          board(t.boat);
          return false;
        }
        if (io.alt && t.ok) {
          const boat = t.boat;
          b.face(boat.x, boat.z);
          b.player.character.play('chopLow', 0.8, true);
          b.digNoise(io.dt, 'chop', boat, CHIPS);
          if (b.holding(`break:${boat.id}`, BREAK, io.dt)) breakUp(b, boat);
          return true;
        }
        if ((io.useTap || io.altTap) && !t.ok) b.deny(t);
        b.dropHold();
        return false;
      }
      if (t && t.type === 'build') {
        const kind = io.use ? 'canoe' : io.alt ? 'raft' : null;
        const q = kind && t.plans[kind];
        if (!q || !q.ok) {
          if (io.useTap || io.altTap) b.deny(t);
          b.dropHold();
          return false;
        }
        b.face(q.x, q.z);
        if (kind === 'canoe') {
          b.player.character.play('chopLow', 0.8, true);
          b.digNoise(io.dt, 'chop', q, CHIPS);
        } else {
          b.player.character.play('bend', 1.1, true);
          b.digNoise(io.dt, 'lash', q, BARK);
        }
        if (b.holding(`${kind}:${q.x}:${q.z}`, BOATS[kind].work, io.dt)) build(b, kind, q);
        return true;
      }
      b.dropHold();
      return false;
    },

    // The boat that would go in: the canoe, unless it's the raft you're
    // making (or only a raft would go here).
    preview(b, t) {
      if (!t || t.type !== 'build') return;
      const { canoe, raft } = t.plans;
      const kind = b.input.holding('alt') || (!canoe.ok && raft.ok) ? 'raft' : 'canoe';
      const q = t.plans[kind];
      if (!q.x && q.x !== 0) return;
      const r = rest(world, BOATS[kind], q.x, q.z, q.yaw);
      const g = ghosts[kind];
      g.position.set(q.x, r.y + 0.02, q.z);
      g.rotation.set(-r.pitch, q.yaw, 0, 'YXZ');
      b.previews.show(g, q.ok);
    },
  };
  return tool;

  // ── A boat you're looking at ──────────────────────────────────────────────
  function atBoat(b, boat) {
    const def = BOATS[boat.kind];
    const name = `the ${def.name}`;
    if (hullDistance(boat, b.player.pos.x, b.player.pos.z) > BOARD_REACH) return { type: 'boat', boat, prompt: `${name}: <i>come closer</i>` };
    const back = b.creative ? '' : ` <i>(+${def.back} m of log)</i>`;
    return { type: 'boat', boat, ok: true, prompt: `<b>click</b> get in ${name} · <b>hold right-click</b> break it up${back}` };
  }

  // ── Whether a boat of `kind` could be built at (x, z), and how it'd lie ──
  // -> { ok, x, z, yaw } or { ok: false, why, where? } (where: it's the place
  // that won't do, whatever the boat)
  function plan(b, kind, x, z) {
    const def = BOATS[kind];
    const s = site(world, def, x, z);
    if (!s.ok) return s;
    const why = inTheWay(b, kind, s);
    if (why) return { ...s, ok: false, why };
    if (!b.have('log', def.log)) return { ...s, ok: false, why: `it takes ${def.log} m of log (have ${tenths(b.inv.log)}) · <i>axe: fell a tree and buck it</i>` };
    return s;
  }

  // What's in the way of a boat lying at s, or null.
  function inTheWay(b, kind, s) {
    const def = BOATS[kind];
    const h = hullOf({ kind, x: s.x, z: s.z, yaw: s.yaw });
    const R = def.len / 2 + 2;
    // how far a point is from the hull, past its side
    const off = (px, pz) => {
      segDist(px, pz, h.ax, h.az, h.bx, h.bz, _seg);
      return _seg.d - h.r;
    };
    for (const other of boats.list.values()) {
      if (other.out) continue;
      const oh = hullOf(other);
      for (let i = 0; i <= 4; i++) {
        const px = oh.ax + ((oh.bx - oh.ax) * i) / 4;
        const pz = oh.az + ((oh.bz - oh.az) * i) / 4;
        if (off(px, pz) < oh.r + CLEAR) return `the ${BOATS[other.kind].name} is in the way`;
      }
    }
    for (const q of b.obstacles.near(s.x, s.z, R)) {
      const room = q.wall ?? (q.dig ? q.dig * 0.8 : 0);
      if (room && off(q.x, q.z) < room + CLEAR) return `${q.what} is in the way`;
    }
    const felled = b.forest.felledNear(s.x, s.z, def.len / 2);
    if (felled) return 'a felled tree is in the way';
    let built = false;
    solids.forEachNear(s.x, s.z, R, (sol) => {
      if (built) return;
      for (let i = 0; i <= 4; i++) {
        const px = sol.ax + ((sol.bx - sol.ax) * i) / 4;
        const pz = sol.az + ((sol.bz - sol.az) * i) / 4;
        if (off(px, pz) < sol.r + CLEAR) built = true;
      }
    });
    if (built) return 'something built is in the way';
    return null;
  }

  // ── Doing it ──────────────────────────────────────────────────────────────
  function build(b, kind, q) {
    const def = BOATS[kind];
    // clear the undergrowth from under it
    const h = hullOf({ kind, x: q.x, z: q.z, yaw: q.yaw });
    b.chunks.forEachPlant(q.x, q.z, def.len / 2 + 0.5, ['bush', 'fern', 'log', 'treefern'], (c, plant, k, px, py, pz) => {
      segDist(px, pz, h.ax, h.az, h.bx, h.bz, _seg);
      if (_seg.d < h.r + 0.4) b.forest.removePlant(c, plant, k);
    });
    boats.add(kind, q.x, q.z, q.yaw);
    b.spend('log', def.log);
    b.sound.sfx(kind === 'canoe' ? 'thud' : 'lash', { size: 0.6 });
    b.regrow(q.x, q.z, def.len / 2 + 1);
    b.flash(`${def.a}, at the water’s edge · F to get in`, 2600);
  }

  function breakUp(b, boat) {
    const def = BOATS[boat.kind];
    const live = boats.get(boat.id);
    if (!live || live.out) return;
    b.chips.burst(new THREE.Vector3(live.x, live.y + 0.3, live.z), 24, CHIPS, 2.5, 1.2);
    boats.remove(live);
    b.sound.sfx('thud', { size: 0.6 });
    if (b.creative) return b.flash(`the ${def.name} is broken up`);
    b.gain('log', def.back);
    b.flash(`the ${def.name} is broken up · +${def.back} m of log`);
  }
}
