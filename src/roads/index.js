// The roads: two-lane country roads from town to town, where the land takes
// one, so you can drive on from one to the next across the forest (see
// cars/ for the dealerships, and the car).
//
//   roads.js      where they run, grown from the seed: the survey, the height
//   clear.js      what they keep clear of: everything there before them
//   pavement.js   what they look like: tarmac or gravel, banks and bridges,
//                 the paint, crossbucks, and the round where they meet at a town
//   onMap.js      the roads on the map
//   sound.js      gravel underfoot
//
// Like the railway, nothing about a road is saved and nothing about the land
// changes for it: everyone in a world finds the same roads, and the plants
// in the way are hidden as their chunk grows. A road that would run where
// someone had already built something isn't there.
//
// This file tells the rest of the game about them:
//   - plants are kept off them, grass off the road, and building away
//   - the road, its banks and bridges are solids, to walk on
//   - the roads are on the map
//   - what's underfoot on one (under(x, z)), for anything that drives on them
//
// From the console:
//   world.roads.list()          the roads near you, nearest first
//   await world.roads.go()      onto the nearest road, looking along it
//   world.roads.under(x, z)     the road at a spot, and the top of it

import { Roads, gateOf, nearest, topAt, samplesNear, pointAt, OUT, WIDE, HALF, CELL } from './roads.js';
import { firstThere } from './clear.js';
import { buildPiece, buildGate, roundTop, pieceCount, pieceRange, footprint, PIECE } from './pavement.js';
import { roadLayer } from './onMap.js';
import './sound.js';
import { HOME_REACH as BERTH_REACH } from '../cruise/site.js';
import { KINDS } from '../towns/kinds.js';
import { VEG_STRIDE } from '../world/flora.js';
import { createBuildingMaterial } from '../build/surfaces.js';
import { segDist } from '../core/geom.js';
import { formatDistance } from '../core/format.js';

const SHOW = 320; // m: road this close is stood up...
const HIDE = 400; // ...and taken down again past this
const LOOK_EVERY = 0.5; // s between looks round for road to stand up
const BUILD_MS = 4; // ms a frame spent standing road up, when there's some to do
const REACH = 3000; // m round you whose roads are surveyed, nearest first
const PUMP_MS = [1.6, 6]; // ms a frame surveying roads: usually, and with the map open
const PREFETCH_EVERY = 2; // s between asking for the roads round you
const MAP_MOST = 16000; // m across the map, past which only roads already known are drawn
const JUNCTION = WIDE + 1.6; // m across the round where a town's roads meet (pavement.js)
// How far (m) plants of each kind are kept back from what the road takes up
// (a rock and a fallen log by their size).
const KEEP = { pine: 3.2, broad: 3.6, birch: 2.8, bush: 1.8, fern: 0.9, rock: 1.4, log: 2.2 };
const SCALED = { rock: true, log: true };

const _n = { d: 0, s: 0, i: 0, t: 0, side: 0 };
const _seg = { d: 0, t: 0, nx: 0, nz: 0 };
const lived = (t) => !KINDS[t.kind].abandoned && KINDS[t.kind].style !== 'creepy';

// The features this uses, so it is installed after them (game/features.js):
// the towns it runs between, and everything there before it that it keeps
// clear of (the old places, the caves, the railway, which it crosses on the
// level, the launch sites, the video stores, the airfields, the abandoned
// buildings, the hunt clubs, the race tracks, the cruise ship's pier).
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'map', 'save', 'landmarks', 'towns', 'caves', 'railway', 'spaceport', 'videostore', 'airports', 'abandoned', 'huntclub', 'racetrack', 'cruise'];
export function installRoads(game) {
  const { scene, gen, landforms, chunks, grass, solids, player, builder, map, landmarks, towns, caves, railway, spaceport, videostore, airports, abandoned, huntclub, racetrack, cruise } = game;
  const T = towns.towns;
  const there = firstThere({
    sites: landmarks.sites,
    caves,
    towns: T,
    pads: spaceport.sites,
    store: videostore.home,
    branches: videostore.branches,
    airports: airports.airports,
    abandoned: (x0, z0, x1, z1) => abandoned.within(x0, z0, x1, z1),
    clubs: huntclub,
    tracks: racetrack.tracks,
    berth: (wait) => cruise.berth(0, wait),
    berthReach: BERTH_REACH,
    lines: railway.lines,
    start: player.start,
  });
  const roads = new Roads(gen, {
    towns: T,
    start: player.start,
    keepOff: (x0, z0, x1, z1) => !!landforms.reaches(x0, z0, x1, z1),
    lines: (x0, z0, x1, z1) => railway.lines.within(x0, z0, x1, z1),
    clear: there.clear,
    ready: there.ready,
  });
  // The road's material, drawn a little in front of the ground it lies on,
  // and the rounds' at the towns' gates, in front of the roads' ends under
  // them (pavement.js buildGate).
  const material = createBuildingMaterial(); // (build/surfaces.js)
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -2;
  const roundMaterial = createBuildingMaterial();
  roundMaterial.polygonOffset = true;
  roundMaterial.polygonOffsetFactor = -1;
  roundMaterial.polygonOffsetUnits = -8;
  const ground = (x, z) => gen.height(x, z) + (chunks.heightOffset ? chunks.heightOffset(x, z) : 0);

  // ── Whether a road is there at all ────────────────────────────────────────
  // Not where something has been built, or a fire laid, on it: anything not
  // grown from the seed. Asked once per road, after the save is in.
  const standing = new Map();
  let asking = false; // (its own obstacles keep out of it)
  function stands(road) {
    let yes = standing.get(road.id);
    if (yes !== undefined) return yes;
    yes = true;
    asking = true;
    try {
      for (let i = 0; i < road.n && yes; i += 2) {
        for (const o of builder.obstacles.near(road.x[i], road.z[i], footprint(road, i) + 1)) {
          if (!o.grown && !o.clear) {
            yes = false;
            break;
          }
        }
      }
    } finally {
      asking = false;
    }
    standing.set(road.id, yes);
    return yes;
  }
  const near = (x0, z0, x1, z1, wait = false) => roads.within(x0, z0, x1, z1, wait).filter(stands);

  // ── The towns' gates: where their roads meet ──────────────────────────────
  // A town has one once a road to it is known (and there).
  const gates = new Map(); // town id -> { town, gate, paved, box }
  function gateFor(id) {
    let g = gates.get(id);
    if (g) return g;
    const t = T.byId(id);
    if (!t) return null;
    const gate = gateOf(gen, t);
    const r = JUNCTION + 12;
    const box = [Math.min(gate.x, gate.ex) - r, Math.min(gate.z, gate.ez) - r, Math.max(gate.x, gate.ex) + r, Math.max(gate.z, gate.ez) + r];
    g = { id, town: t, gate, paved: lived(t), box };
    gates.set(id, g);
    return g;
  }
  const gatesIn = (x0, z0, x1, z1) => [...gates.values()].filter((g) => g.box[0] <= x1 && g.box[2] >= x0 && g.box[1] <= z1 && g.box[3] >= z0);
  // whether (x, z) is within `margin` of a gate's round or the road from it to the street
  function onGate(g, x, z, margin) {
    const { gate } = g;
    if (Math.hypot(x - gate.x, z - gate.z) < JUNCTION + margin) return true;
    segDist(x, z, gate.ex, gate.ez, gate.x, gate.z, _seg);
    return _seg.d < WIDE + margin;
  }

  // ── Keeping the forest off them ───────────────────────────────────────────
  function clearChunk(ch, list, gs) {
    if (!ch.vegLists || (!list.length && !gs.length)) return;
    for (const kind in ch.vegLists) {
      const veg = ch.vegLists[kind];
      const keep0 = KEEP[kind] ?? 1.4;
      for (let o = 0, k = 0; o < veg.length; o += VEG_STRIDE, k++) {
        const scale = veg[o + 4];
        if (scale <= 0) continue;
        const px = veg[o];
        const pz = veg[o + 2];
        const keep = keep0 * (SCALED[kind] ? scale : 1);
        let hit = gs.some((g) => onGate(g, px, pz, keep));
        for (let r = 0; !hit && r < list.length; r++) hit = nearest(list[r], px, pz, _n) && _n.d < keep + footprint(list[r], _n.i, false, _n.side);
        if (hit) chunks.hideInstance(ch, kind, k);
      }
    }
  }
  const chunkBox = (ch) => {
    const S = chunks.size;
    return [ch.cx * S - 16, ch.cz * S - 16, ch.cx * S + S + 16, ch.cz * S + S + 16];
  };
  chunks.on('vegetation', (ch) => {
    const b = chunkBox(ch);
    clearChunk(ch, near(...b), gatesIn(...b));
  });
  // a road found after its chunks have grown: the plants on it go now
  roads.onRoad((road) => {
    if (!stands(road)) return;
    const gs = [gateFor(road.from), gateFor(road.to)].filter(Boolean);
    for (const ch of chunks.chunks.values()) {
      const b = chunkBox(ch);
      if (b[0] > road.box[2] || b[2] < road.box[0] || b[1] > road.box[3] || b[3] < road.box[1]) continue;
      clearChunk(ch, [road], gs);
    }
    grass.invalidate(...road.box);
    for (const g of gs) grass.invalidate(...g.box);
    lookIn = 0;
  });
  // no grass on the road or its shoulders (it grows on the banks, and under a bridge)
  grass.addClearing((x0, z0, x1, z1) => {
    const list = near(x0 - 12, z0 - 12, x1 + 12, z1 + 12);
    const gs = gatesIn(x0, z0, x1, z1);
    if (!list.length && !gs.length) return null;
    return (x, z) => gs.some((g) => onGate(g, x, z, 0.3)) || list.some((road) => nearest(road, x, z, _n) && _n.d < footprint(road, _n.i, true) && road.h[_n.i] - road.g[_n.i] < 2.6);
  });
  // building goes round them
  builder.obstacles.addSource((x, z, R, out) => {
    if (asking) return;
    for (const road of near(x - R - 12, z - R - 12, x + R + 12, z + R + 12)) {
      samplesNear(road, x, z, R + 10, (i) => {
        const r = footprint(road, i);
        out.push({ x: road.x[i], z: road.z[i], what: 'the road', dig: r + 0.6, wall: r + 0.4, footing: r + 0.8, roof: r + 0.2, grown: true });
      });
    }
    for (const g of gatesIn(x - R, z - R, x + R, z + R)) {
      const { gate } = g;
      out.push({ x: gate.x, z: gate.z, what: 'the road', dig: JUNCTION + 0.6, wall: JUNCTION + 0.4, footing: JUNCTION + 0.8, roof: JUNCTION, grown: true });
      for (let k = 0; k <= 4; k++) out.push({ x: gate.ex + (gate.x - gate.ex) * (k / 4), z: gate.ez + (gate.z - gate.ez) * (k / 4), what: 'the road', dig: WIDE + 0.6, wall: WIDE + 0.4, footing: WIDE + 0.8, roof: WIDE, grown: true });
    }
  });

  // ── Standing the road up and taking it down ───────────────────────────────
  const shown = new Map(); // key -> { key, x, z, r, object }
  let queue = [];
  function wanted(at) {
    const out = [];
    for (const road of near(at.x - SHOW, at.z - SHOW, at.x + SHOW, at.z + SHOW)) {
      const count = pieceCount(road);
      for (let p = 0; p < count; p++) {
        const [i0, i1] = pieceRange(road, p);
        const mid = Math.floor((i0 + i1) / 2);
        const d = Math.hypot(road.x[mid] - at.x, road.z[mid] - at.z) - PIECE / 2;
        if (d < SHOW) out.push({ key: `${road.id}#${p}`, x: road.x[mid], z: road.z[mid], r: PIECE / 2, d, build: () => buildPiece(road, p, ground, material) });
      }
      for (const id of [road.from, road.to]) gateFor(id);
    }
    for (const g of gatesIn(at.x - SHOW, at.z - SHOW, at.x + SHOW, at.z + SHOW)) {
      const d = Math.hypot(g.gate.x - at.x, g.gate.z - at.z);
      if (d < SHOW) out.push({ key: `gate:${g.id}`, x: g.gate.x, z: g.gate.z, r: 30, d, build: () => buildGate(g.gate, g.paved, ground, material, roundMaterial) });
    }
    return out;
  }
  function show(entry) {
    if (shown.has(entry.key)) return;
    const built = entry.build();
    const e = { key: entry.key, x: entry.x, z: entry.z, r: entry.r, object: built.object };
    scene.add(e.object);
    solids.set(e, built.solids);
    shown.set(e.key, e);
  }
  function hide(e) {
    scene.remove(e.object);
    e.object.traverse((o) => o.isMesh && o.geometry.dispose());
    solids.clear(e);
    shown.delete(e.key);
  }

  // ── On the map ────────────────────────────────────────────────────────────
  map.addLayer(
    roadLayer((pen) => {
      // the part of the world the map shows
      const o = pen.toScreen(0, 0);
      const x0 = -o.sx / pen.scale;
      const z0 = -o.sy / pen.scale;
      const x1 = (pen.W - o.sx) / pen.scale;
      const z1 = (pen.H - o.sy) / pen.scale;
      if (x1 - x0 > MAP_MOST || z1 - z0 > MAP_MOST) return [...roads.links.values()].filter((r) => r && r.box[0] <= x1 && r.box[2] >= x0 && r.box[1] <= z1 && r.box[3] >= z0 && stands(r));
      return near(x0, z0, x1, z1);
    }),
  );

  // ── What's underfoot ──────────────────────────────────────────────────────
  // The roads and gates within r of (x, z), to ask under() about again and
  // again (something driving, a frame at a time): { roads, gates }.
  const around = (x, z, r) => ({ roads: near(x - r, z - r, x + r, z + r), gates: gatesIn(x - r, z - r, x + r, z + r) });
  // The road at (x, z), if there's one there now: { road (null on a town's
  // gate), top (the height of its top), surface ('paved', 'gravel'), on (on
  // the road itself, not its shoulder), s (how far along), dx, dz (the way
  // along) }, or null. here: around()'s, to look only among those.
  const _p = { x: 0, y: 0, z: 0, dx: 0, dz: 0, grade: 0 };
  function under(x, z, here = around(x, z, 1)) {
    for (const road of here.roads) {
      if (!nearest(road, x, z, _n) || _n.d > WIDE + 0.2) continue;
      pointAt(road, _n.s, _p);
      let top = topAt(road, _n);
      // where it comes onto a town's round, which may rise over the ground there
      for (const g of here.gates) if (Math.hypot(x - g.gate.x, z - g.gate.z) < JUNCTION) top = Math.max(top, roundTop(g.gate, x, z, ground));
      return { road, top, surface: road.surface, on: _n.d < HALF, s: _n.s, dx: _p.dx, dz: _p.dz };
    }
    for (const g of here.gates) {
      if (!onGate(g, x, z, 0.2)) continue;
      const { gate } = g;
      segDist(x, z, gate.ex, gate.ez, gate.x, gate.z, _seg);
      const round = Math.hypot(x - gate.x, z - gate.z) < JUNCTION;
      const n = gate.approach.n;
      const k = Math.min(n - 1, Math.max(0, _seg.t * (n - 1)));
      const k0 = Math.floor(k);
      const k1 = Math.min(n - 1, k0 + 1);
      const top = round ? roundTop(gate, x, z, ground) : gate.approach.h[k0] + (gate.approach.h[k1] - gate.approach.h[k0]) * (k - k0);
      return { road: null, top, surface: g.paved ? 'paved' : 'gravel', on: true, s: 0, dx: gate.ax, dz: gate.az };
    }
    return null;
  }

  // ── Every frame ───────────────────────────────────────────────────────────
  let lookIn = 0;
  let prefetchIn = 0;
  game.addSystem({
    name: 'roads',
    phase: 'world',
    update({ dt }) {
      const at = game.focus;
      lookIn -= dt;
      if (lookIn <= 0) {
        lookIn = LOOK_EVERY;
        const want = wanted(at);
        const keys = new Set(want.map((w) => w.key));
        queue = want.filter((w) => !shown.has(w.key)).sort((a, b) => a.d - b.d);
        for (const e of shown.values()) if (!keys.has(e.key) && Math.hypot(e.x - at.x, e.z - at.z) - e.r > HIDE) hide(e);
      }
      const t0 = performance.now();
      while (queue.length && performance.now() - t0 < BUILD_MS) show(queue.shift());
      prefetchIn -= dt;
      if (prefetchIn <= 0) {
        prefetchIn = PREFETCH_EVERY;
        roads.prefetch(at.x, at.z, REACH);
      }
      if (roads.queue.size) roads.pump(map.isOpen ? PUMP_MS[1] : PUMP_MS[0]);
    },
  });

  // A road near (x, z), within r: the links that could come there, nearest
  // first, each surveyed outright (a frame apart) until one is there.
  async function nearby(x = player.pos.x, z = player.pos.z, r = REACH) {
    const list = roads
      ._candidates(x - r, z - r, x + r, z + r)
      .map(([ci, cj, dir]) => ({ ci, cj, dir, d: Math.hypot((ci + 0.5 + (dir === 'e' ? 0.75 : 0)) * CELL - x, (cj + 0.5 + (dir === 's' ? 0.75 : 0)) * CELL - z) }))
      .filter((c) => c.d < r + CELL)
      .sort((a, b) => a.d - b.d);
    for (const c of list) {
      const road = roads.link(c.ci, c.cj, c.dir);
      if (road && stands(road)) return road;
      await new Promise((ok) => setTimeout(ok, 0));
    }
    return null;
  }

  // ── From the console ──────────────────────────────────────────────────────
  game.provide('roads', {
    roads,
    // what the roads keep clear of (clear.js): what's beside them does too
    there,
    shown,
    gates,
    stands,
    under,
    around,
    // the roads known within r of you, nearest first
    list(r = REACH) {
      const p = player.pos;
      const out = [];
      for (const road of near(p.x - r, p.z - r, p.x + r, p.z + r)) {
        let d = Infinity;
        for (let i = 0; i < road.n; i += 4) d = Math.min(d, Math.hypot(road.x[i] - p.x, road.z[i] - p.z));
        out.push({ id: road.id, from: road.fromName, to: road.toName, surface: road.surface, length: Math.round(road.length), dist: Math.round(d), far: formatDistance(d) });
      }
      return out.sort((a, b) => a.dist - b.dist);
    },
    // onto the nearest road (or the one with this id), `along` m along it
    // (its middle, if not said), looking along it.
    async go(id, along = null) {
      let road = id ? roads.byId(id) : null;
      if (!road && !id) road = await nearby();
      if (!road || !stands(road)) return null;
      pointAt(road, along ?? road.length / 2, _p);
      await game.api.teleport(_p.x, _p.z, Math.atan2(_p.dx, _p.dz));
      return { id: road.id, x: _p.x, z: _p.z };
    },
    nearby,
    // roads that might come within a rectangle of the world (for those that keep clear of them)
    OUT,
  });
}
