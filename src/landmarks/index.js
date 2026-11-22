// Old places in the forest: cabins, a ruined homestead, hunting cabins, a
// tent someone left, wells, docks with a boat tied up, canoes on the bank.
// They're few and far between, and every one is on the map, named, so you
// can go and find it.
//
// Where they are is grown from the seed like the trees (sites.js), so
// everyone in a world finds the same ones and nothing about them is saved —
// except, for each of you, which ones you've been to. What they look like is
// in models.js. This file stands them up as you come near and takes them
// down as you go, and tells the rest of the game about them:
//
//   - the plants under one are hidden as its chunk grows, and the grass kept
//     off its floor (the forest itself isn't changed: see sites.js)
//   - its walls, floors and deck are solids, to bump into and stand on, and
//     the camera stays inside its walls
//   - building goes round it, and a blueprint can't be staked over it
//   - it's a place on the map, with a name, that you can track
//
// A site that would stand where someone has already built something is left
// out (so an old save never wakes up with a cabin through its own), and so
// is one that would stand on a real place brought in from a photo (see
// src/hikes/): what is there is what is really there.

import * as THREE from 'three';
import { Sites, onPlan, planDiscs } from './sites.js';
import { KINDS } from './kinds.js';
import { buildSite } from './models.js';
import { VEG_STRIDE } from '../world/flora.js';
import { rayBox } from '../core/geom.js';
import { createBuildingMaterial } from '../build/surfaces.js';
import { GridNearest } from '../core/nearest.js';

const SHOW = 330; // m: sites this close are stood up in the world...
const HIDE = 420; // ...and taken down again past this
const LOOK_EVERY = 0.5; // s between looks round for sites to stand up
const KNOWN = 1500; // m round you whose sites the map can list
const ARRIVE = 8; // m from a site's plan where you've reached it
const BOB_NEAR = 90; // m: boats closer than this ride the water
// How far (m) plants of each kind are kept back from a plan: a trunk well
// clear of the eaves, a fallen log by its length (times its scale, like a
// rock).
const KEEP_BACK = { pine: 1.2, broad: 1.4, birch: 1.0, bush: 0.7, fern: 0.25, rock: 1.1, log: 2.4 };
const SCALED = { rock: true, log: true };

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'ui', 'world', 'player', 'build', 'map'];
export function installLandmarks(game) {
  const { scene, gen, landforms, chunks, grass, solids, player, builder, map, hud, save } = game;
  const sites = new Sites(gen, { start: player.start });
  const material = createBuildingMaterial(); // logs, boards, stone and tin, as they are (build/surfaces.js)
  const ground = (x, z) => gen.height(x, z) + (chunks.heightOffset ? chunks.heightOffset(x, z) : 0);
  const shown = new Map(); // id -> { site, object, blockers, bobbing }
  const visited = new Set(); // ids of the sites you've been to
  const reached = new Set(); // ...and the ones you've reached since the page opened

  // ── Whether a site stands at all ──────────────────────────────────────────
  // Not where something has been built, a fire laid or a stump left: anything
  // that isn't grown from the seed. Asked once per site, after the save is in.
  const standing = new Map();
  let asking = false; // (the sites' own obstacles keep out of it)
  function stands(s) {
    let yes = standing.get(s.id);
    if (yes !== undefined) return yes;
    yes = true;
    // nor on a real place, or near enough one that the land there isn't the
    // forest's alone (world/landforms.js): it has what is really there
    if (landforms.reaches(s.box[0], s.box[1], s.box[2], s.box[3])) {
      standing.set(s.id, false);
      return false;
    }
    const cx = (s.box[0] + s.box[2]) / 2;
    const cz = (s.box[1] + s.box[3]) / 2;
    const r = Math.hypot(s.box[2] - s.box[0], s.box[3] - s.box[1]) / 2;
    asking = true;
    try {
      for (const o of builder.obstacles.near(cx, cz, r + 1)) {
        if (!o.grown && onPlan(s, o.x, o.z, 0.5)) {
          yes = false;
          break;
        }
      }
    } finally {
      asking = false;
    }
    standing.set(s.id, yes);
    return yes;
  }
  const near = (x, z, r) => sites.near(x, z, r).filter(stands);

  // ── The forest round it ───────────────────────────────────────────────────
  chunks.on('vegetation', (ch) => {
    const S = chunks.size;
    const x0 = ch.cx * S;
    const z0 = ch.cz * S;
    for (const s of sites.within(x0 - 3, z0 - 3, x0 + S + 3, z0 + S + 3)) {
      if (!stands(s)) continue;
      for (const kind in ch.vegLists) {
        const list = ch.vegLists[kind];
        for (let o = 0, k = 0; o < list.length; o += VEG_STRIDE, k++) {
          const scale = list[o + 4];
          if (scale <= 0) continue;
          const back = (KEEP_BACK[kind] ?? 0.6) * (SCALED[kind] ? scale : 1);
          if (onPlan(s, list[o], list[o + 2], back)) chunks.hideInstance(ch, kind, k);
        }
      }
    }
  });
  grass.addClearing((x0, z0, x1, z1) => {
    const list = sites.within(x0, z0, x1, z1).filter((s) => s.bare.length && stands(s));
    if (!list.length) return null;
    return (x, z) => list.some((s) => onPlan(s, x, z, 0.1, s.bare));
  });

  // ── Building goes round it ────────────────────────────────────────────────
  const discs = new Map();
  builder.obstacles.addSource((x, z, R, out) => {
    if (asking) return;
    for (const s of near(x, z, R + 1)) {
      let list = discs.get(s.id);
      if (!list) discs.set(s.id, (list = planDiscs(s)));
      const what = KINDS[s.kind].a;
      for (const d of list) {
        if (Math.hypot(d.x - x, d.z - z) > R + d.r + 1) continue;
        out.push({ x: d.x, z: d.z, what, dig: d.r + 0.3, wall: d.r + 0.2, footing: d.r + 0.5, roof: d.r, grown: true });
      }
    }
  });

  // ── Standing them up and taking them down ─────────────────────────────────
  function show(s) {
    const built = buildSite(s, ground, material);
    const entry = { site: s, ...built };
    scene.add(built.object);
    solids.set(entry, built.solids);
    shown.set(s.id, entry);
  }
  function hide(entry) {
    scene.remove(entry.object);
    entry.object.traverse((o) => o.isMesh && o.geometry.dispose());
    solids.clear(entry);
    shown.delete(entry.site.id);
  }

  // The camera doesn't look through a wall or a roof from inside.
  player.cameraBlockers.push((origin, dir, max) => {
    let best = Infinity;
    for (const e of shown.values()) {
      if (!e.blockers.length) continue;
      if (Math.hypot(origin.x - e.site.x, origin.z - e.site.z) > max + 10) continue;
      for (const b of e.blockers) {
        const t = rayBox(origin, dir, b);
        if (t < best) best = t;
      }
    }
    return best;
  });

  // ── Being there ───────────────────────────────────────────────────────────
  save.register({
    id: 'visited',
    scope: 'yours',
    local: 'marks',
    collect: () => [...visited],
    validate: (raw) => (Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : []),
    restore(list) {
      visited.clear();
      for (const id of list) visited.add(id);
    },
  });
  function arrive(s) {
    reached.add(s.id);
    // the tracker says so itself when this is where you were heading
    if (game.marks && game.marks.tracked !== s.id) hud.flash(s.name);
    if (!visited.has(s.id)) {
      visited.add(s.id);
      save.touch();
    }
  }

  // ── On the map ────────────────────────────────────────────────────────────
  // (made once each, and again when you've been there)
  const places = new Map();
  function asPlace(s) {
    let p = places.get(s.id);
    if (p && p.visited === visited.has(s.id)) return p;
    const K = KINDS[s.kind];
    p = { id: s.id, x: s.x, z: s.z, name: s.name, kind: K.label, note: K.note, glyph: K.glyph, visited: visited.has(s.id), shape: s.shape.map((r) => corners(s, r)) };
    places.set(s.id, p);
    return p;
  }
  map.places.addSource({
    // the map would rather fill in over a few frames than stall
    within: (x0, z0, x1, z1) => sites.within(x0, z0, x1, z1, false).filter(stands).map(asPlace),
    get(id) {
      const s = sites.byId(id);
      return s && stands(s) ? asPlace(s) : null;
    },
    list: 'old places',
    nearest: (x, z) =>
      new GridNearest(x, z, {
        size: sites.size,
        spill: sites.spill,
        at(i, j) {
          const s = sites.peek(i, j);
          return s === undefined ? undefined : s && stands(s) ? [asPlace(s)] : [];
        },
      }),
  });

  // ── Each frame ────────────────────────────────────────────────────────────
  let lookIn = 0;
  let queue = [];
  game.addSystem({
    name: 'landmarks',
    phase: 'world',
    update({ dt, now }) {
      const at = game.focus;
      lookIn -= dt;
      if (lookIn <= 0) {
        lookIn = LOOK_EVERY;
        queue = near(at.x, at.z, SHOW)
          .filter((s) => !shown.has(s.id))
          .sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z));
        for (const e of shown.values()) if (Math.hypot(e.site.x - at.x, e.site.z - at.z) > HIDE) hide(e);
        sites.prefetch(at.x, at.z, KNOWN);
      }
      // one a frame: a cabin is a good few thousand logs and shakes
      if (queue.length) show(queue.shift());
      // look ahead for the map, more of it while it's open (nothing else is drawn)
      if (sites.queue.size) sites.pump(map.isOpen ? 6 : 0.75);

      const t = now / 1000;
      const p = player.pos;
      for (const e of shown.values()) {
        const s = e.site;
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (!reached.has(s.id) && d < 30 && boxDist(s.box, p.x, p.z) < ARRIVE) arrive(s);
        if (d > BOB_NEAR) continue;
        for (const b of e.bobbing) {
          b.object.position.y = b.y + Math.sin(t * 1.3 + b.phase) * 0.025;
          b.object.rotation.z = Math.sin(t * 0.9 + b.phase) * 0.035;
          b.object.rotation.x = Math.sin(t * 1.1 + b.phase * 2) * 0.015;
        }
      }
    },
  });

  // From the console: world.landmarks.nearest(), world.landmarks.list()
  game.provide('landmarks', {
    sites,
    shown,
    visited,
    // what's within r of you, nearest first
    list(r = 600) {
      const { x, z } = player.pos;
      return near(x, z, r)
        .map((s) => ({ id: s.id, kind: s.kind, name: s.name, x: Math.round(s.x), z: Math.round(s.z), dist: Math.round(Math.hypot(s.x - x, s.z - z)), visited: visited.has(s.id) }))
        .sort((a, b) => a.dist - b.dist);
    },
    nearest(kind = null, r = 3000) {
      return this.list(r).find((s) => !kind || s.kind === kind) || null;
    },
  });
}

// A plan rectangle's corners in the world, for the map to draw.
function corners(s, [x0, z0, x1, z1]) {
  const c = Math.cos(s.yaw);
  const n = Math.sin(s.yaw);
  return [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ].map(([lx, lz]) => [s.x + lx * c + lz * n, s.z - lx * n + lz * c]);
}

function boxDist(b, x, z) {
  return Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - z, 0, z - b[3]));
}
