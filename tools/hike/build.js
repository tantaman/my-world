// From a photo's position, the real land around it and OpenStreetMap's trails,
// lakes and coast, to a hike the game can set into the forest (see
// src/world/landform.js for what a hike holds).
//
// Pure: elevation comes in as a function and OpenStreetMap as parsed data, so
// this can be tested without the network.

import { localFrame } from './geo.js';
import { Landform, packHeights2, packShore, packCover, COVER } from '../../src/world/landform.js';
import { countryOf } from '../../src/world/country.js';

export const DEFAULTS = {
  scale: 1, // game metres per real metre: life size, as the Earth is
  radius: 4000, // real metres of real land around the photo
  fade: 1000, // real metres over which it gives way to the forest
  cell: 30, // real metres between heights
  trees: { cover: 0.85, species: 0.6 },
  // a finer grid along the walk: { cell, margin }, real metres between its
  // heights and round the walk; null for none
  fine: null,
  fineMargin: 400, // real metres, when only the cell is said
};
// Points along each side of a tile of the finer grid: 32 at 5 real metres
// apart is 32 m in the game, more than the FINE_EDGE over which it gives way
// to the coarse grid (landform.js), so a tile need only ask its neighbours.
const FINE_TILE = 32;

// How near (real m) the photo has to be to a trail for that trail to be the
// walk to it: a phone's position, and a map's line, are each off by a few
// tens of metres. These are real metres, made game metres at the place's
// own scale (the walk's helpers take it as `m`, game metres to a real one).
const ON_TRAIL = 150;
// How near (real m) a trail has to come to a road or a car park for the
// walk to start there.
const AT_ROAD = 20;
// A walk that starts this far (real m) over the middle of the land's edge
// starts on top of the mountain.
const SUMMIT = 200;
// Points of two paths nearer than this (real m) are the same point.
const SAME = 0.25;
// A walk said to start or end somewhere (from, to) crosses where the map's
// paths stop short of one another by up to this much (real m): a scramble
// it didn't draw, as down the cliff beside a fall. A crossing steeper than
// STEEP (rise over run) has chains to hold on to.
const GAP = 60;
const STEEP = 0.5;
// Lakes stop this far (game m) inside the real land, so they never reach
// the forest's edge.
const LAKE_INSET = 25;
// The sea is a lake like any other to the game (landform.js), at this real
// height (m), and this is what it's called. Where the real sea runs on past
// the land that was imported, the ground is brought up to just over it: the
// game's sea stops there, at a low shore, and the forest begins.
const SEA_LEVEL = 0;
const SEA_NAME = 'the sea';
// real m: how far over the water a lake's, or the sea's, banks are kept
const BANK = 0.5;
// real m: water said to lie at a level (the tide's, a city's survey: see
// hike/dcgis.js) is water only where the land under it is no more than this
// above that
const RAPIDS = 2;
// In a country where the tide sets the level (country.js, `tidal`: a delta's
// bayous and canals), the water is all one, still, at the level of the sea,
// whatever the map says runs: the areas it draws water over, lakes, rivers and
// canals alike, and its rivers and canals as wide as they are. Its shore is
// kept on a grid of its own this fine (game m), so that a canal a few metres
// across is one.
const TIDE_CELL = 2;
// real m: a channel the map doesn't draw, but whose bed the elevation data
// has deeper than this under the sea (it has the beds of the bayous), is
// water too where it joins water the map does draw
const TIDE_DEEP = -0.4;
// real m: the least the land stands over the water. (The marsh is at its
// level, and wet; the game's ground is either land or water.)
const TIDE_LAND = 0.2;
// game m: the narrowest a river or a canal line is kept, either side of it
const TIDE_HALF = 1.5;
// real m: how wide a stream, and a river, is where the map doesn't say and
// draws no banks (Havasu Creek: a creek you could throw a stone across)
const STREAM_WIDTH = 3;
const RIVER_WIDTH = 10;
// game m: how often a river's width is read between its banks, and the
// share of it that must lie between them for that to be its width
const BANK_STEP = 5;
const BANKED = 0.3;
// game m: the spacing of a pool's own grid (a lake too small for the
// ground's), and how far round it that reaches; and the most points that
// grid has: a long narrow water (a tidal creek winding through a marsh) is
// on one as fine as that many points over it can be
const POOL_CELL = 0.5;
const POOL_MARGIN = 6;
const POOL_MOST = 40000;
// A lake narrower than this many of the ground's cells across (its
// thickness: twice its area over its shoreline, which for a ring of water is
// how wide the ring is) is a pool on a grid of its own as well.
const NARROW = 3;
// game m: the spacing of a beach's own grid, and how far round it that reaches
const BEACH_CELL = 1.5;
const BEACH_MARGIN = 6;
// and trails this far
const TRAIL_INSET = 12;
// what is kept of a trail's line: no point off it by more than this (game m)
const SIMPLIFY = 0.25;
// game m: the sea's shore is worked out this far past the water and the land
// that is kept. More than a packed shore distance can say (landform.js).
const SEA_MARGIN = 70;
// game m: the spacing of the grid the sea's shore is kept on
const SEA_CELL = 3;

//   photo      { lat, lon, bearing, hour } (readPhoto())
//   elevation  (lat, lon) -> metres above sea level
//   trails     [{ name, points: [[lat, lon], ...], rope?, closed? }]   (osm.js)
//   waters     [{ name, rings: [[[lat, lon], ...]], holes?, level? }]: level,
//              the real height it lies at, where that's known (the tide's)
//   coast      [[[lat, lon], ...], ...]: the shoreline of the sea, the land
//              on the left of each line as you go along it (osm.js)
//   roads      [[[lat, lon], ...], ...]: roads and car parks, where a walk
//              can begin
//   beaches    [[[lat, lon], ...], ...]: the outline of each beach
//   streams    [{ name, river, points: [[lat, lon], ...], width? }]: running
//              water, each the way it flows, and how wide (real m) if the map says
//   riverbanks [[[lat, lon], ...], ...]: the areas rivers cover, bank to bank
//   covers     [{ kind, rings: [[[lat, lon], ...], ...] }]: what covers the
//              land, one of COVER (landform.js), holes and all (osm.js)
//   falls      [{ name, lat, lon, height? }]: waterfalls, each a point on its
//              stream, with its real height where the map says
//   photos     [{ name, lat, lon, bearing, hour }]: more photos taken on the
//              walk, each a place of its own to stand where it was taken
//   middle     { lat, lon } to centre the land on, if not the photo: to take
//              in the whole of a long trail, the photo part way along it
//   from, to   { lat, lon }: where the walk starts, if not at the nearest
//              road, and where it ends, if it goes on past the photo (each
//              the point of a path nearest it)
//   datum      the heights to stand on, shared with a hike this one overlaps
//              (place.js), or null to set its own
//   fineElevation  (lat, lon) -> metres, for the finer grid along the walk
//              (opt.fine), where finer heights are to be had; elevation if not
// → { def, preview: { width, height, rgb }, walk: [[x, z], ...] or null }
export function buildHike({ id, name, photo, elevation, fineElevation = elevation, trails = [], waters = [], coast = [], roads = [], beaches = [], streams = [], riverbanks = [], canals = [], waterAreas = [], covers = [], falls = [], photos = [], middle = null, from = null, to = null, at = [0, 0], datum = null, ...opt }) {
  const o = { ...DEFAULTS, ...opt, trees: { ...DEFAULTS.trees, ...opt.trees } };
  // (where the tide sets the level, all the water is one: see TIDE_CELL)
  const tidal = countryOf(o.country).tidal;
  const s = o.scale;
  const mid = middle || photo;
  const frame = localFrame(mid.lat, mid.lon);
  const toGame = ([lat, lon]) => {
    const [e, n] = frame.toEN(lat, lon);
    return [e * s, -n * s];
  };
  const fromGame = (x, z) => frame.toLatLon(x / s, -z / s);

  // ── The ground ─────────────────────────────────────────────────────────────
  const half = Math.ceil((o.radius + o.fade) / o.cell);
  const n = half * 2 + 1;
  const cell = o.cell * s;
  const gx = (i) => (i - half) * cell;
  const E = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      // the average over the cell, not one point of it
      let sum = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) sum += elevation(...fromGame(gx(i) + (a * cell) / 3, gx(j) + (b * cell) / 3));
      E[j * n + i] = sum / 9;
    }
  }

  const R = o.radius * s;
  const inside = (x, z, inset) => Math.hypot(x, z) < R - inset;
  // a line's stretches on the land, kept `inset` in from its edge
  const within = (pts, inset) => {
    const out = [];
    let cur = [];
    for (const p of pts) {
      if (inside(p[0], p[1], inset)) cur.push(p);
      else {
        if (cur.length > 1) out.push(cur);
        cur = [];
      }
    }
    if (cur.length > 1) out.push(cur);
    return out;
  };

  // ── Lakes ──────────────────────────────────────────────────────────────────
  const lakes = [];
  const lakeCells = new Int8Array(n * n);
  if (tidal) {
    const t = tidalWater({ areas: waterAreas, canals, streams, toGame, fromGame, elevation, R: o.radius * s, s, near: toGame([photo.lat, photo.lon]) });
    if (t) {
      lakes.push(t);
      // the land just over it, wherever it is land: the water is carved
      // out of it by its shore (landform.js)
      for (let k = 0; k < n * n; k++) E[k] = Math.max(E[k], t.levelReal + TIDE_LAND);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (shoreOf(t, gx(i), gx(j)) < 0) lakeCells[j * n + i] = 1;
    }
  }
  for (const w of tidal ? [] : waters) {
    // (an island is a hole in it: inside an odd number of rings is in the
    // water, as signedDistance has it)
    const holes = (w.holes || []).map((r) => r.map(toGame));
    const rings = [...w.rings.map((r) => r.map(toGame)), ...holes];
    let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of rings) {
      for (const [x, z] of r) {
        x0 = Math.min(x0, x);
        z0 = Math.min(z0, z);
        x1 = Math.max(x1, x);
        z1 = Math.max(z1, z);
      }
    }
    const Rl = R - LAKE_INSET;
    x0 = Math.max(x0, -Rl);
    z0 = Math.max(z0, -Rl);
    x1 = Math.min(x1, Rl);
    z1 = Math.min(z1, Rl);
    if (x0 >= x1 || z0 >= z1) continue;
    const margin = Math.ceil(14 / cell) + 1;
    const i0 = Math.max(0, Math.floor(x0 / cell) + half - margin);
    const j0 = Math.max(0, Math.floor(z0 / cell) + half - margin);
    const i1 = Math.min(n - 1, Math.ceil(x1 / cell) + half + margin);
    const j1 = Math.min(n - 1, Math.ceil(z1 / cell) + half + margin);
    const bw = i1 - i0 + 1;
    const bh = j1 - j0 + 1;
    const d = new Float32Array(bw * bh);
    const wet = [];
    for (let j = 0; j < bh; j++) {
      for (let i = 0; i < bw; i++) {
        const x = gx(i0 + i);
        const z = gx(j0 + j);
        // in the lake, and in the disc it is kept to
        const v = Math.max(signedDistance(rings, x, z), Math.hypot(x, z) - Rl);
        d[j * bw + i] = v;
        if (v < 0) wet.push((j0 + j) * n + i0 + i);
      }
    }
    if (wet.length < 4 || thickness(rings.slice(0, rings.length - holes.length), holes) < NARROW * cell) {
      // A pool too small for the ground's grid (the one at the foot of a
      // fall), or too narrow for it (a moat round an island): its shore on a
      // grid of its own, and its level from the finer heights where there
      // are any.
      const pool = poolOf(rings, [x0, z0, x1, z1], Rl, (x, z) => {
        const e = fineElevation(...fromGame(x, z));
        return Number.isFinite(e) ? e : elevation(...fromGame(x, z));
      });
      if (pool) lakes.push({ name: w.name, ...pool });
      continue;
    }
    // Elevation data lays a lake out flat at its surface: the level is the
    // height most of it agrees on, unless the water says (the tide's).
    const levels = wet.map((k) => E[k]).sort((a, b) => a - b);
    const level = w.level ?? levels[Math.floor(levels.length * 0.3)];
    // (water said to be at a level stops where the land under it rises
    // above that, a river's rapids: it runs on from there as a stream)
    if (w.level !== undefined) {
      for (let j = 0; j < bh; j++) {
        for (let i = 0; i < bw; i++) {
          const over = E[(j0 + j) * n + i0 + i] - (level + RAPIDS);
          if (over > 0) d[j * bw + i] = Math.max(d[j * bw + i], over);
        }
      }
    }
    for (let j = 0; j < bh; j++) {
      for (let i = 0; i < bw; i++) {
        const k = (j0 + j) * n + i0 + i;
        const v = d[j * bw + i];
        if (v < 0) {
          E[k] = level;
          lakeCells[k] = 1;
        } else if (v < 3) E[k] = Math.max(E[k], level + BANK);
      }
    }
    lakes.push({ name: w.name, levelReal: level, box: [i0, j0, bw, bh], d });
  }

  // ── The sea ────────────────────────────────────────────────────────────────
  // Elevation data gives the sea floor, roughly, and where the shore is only
  // to the nearest cell. The coastline says where it is properly.
  // (A coastline can run on for hundreds of kilometres: only the stretches
  // by this land are kept, each with a point to spare at either end.)
  const reach = R + SEA_MARGIN * 2;
  const shores = [];
  for (const line of coast) {
    const pts = line.map(toGame);
    const by = pts.map(([x, z]) => Math.hypot(x, z) < reach);
    let run = [];
    for (let k = 0; k < pts.length; k++) {
      // a point is kept if it, or the one before or after it, is by the land
      if (by[k] || by[k - 1] || by[k + 1]) run.push(pts[k]);
      else if (run.length) {
        if (run.length > 1) shores.push(run);
        run = [];
      }
    }
    if (run.length > 1) shores.push(run);
  }
  if (shores.length) {
    const Rl = R - LAKE_INSET;
    const D = new Float32Array(n * n);
    let [i0, j0, i1, j1] = [n, n, -1, -1];
    let wet = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = gx(i);
        const z = gx(j);
        const off = Math.hypot(x, z) - Rl;
        // far outside the land that's kept, nobody asks
        const v = off > SEA_MARGIN ? off : Math.max(coastDistance(shores, x, z), off);
        D[j * n + i] = v;
        if (v < 0) wet++;
        // the part of the grid a point near the water could ask about
        if (v < SEA_MARGIN) {
          i0 = Math.min(i0, i);
          j0 = Math.min(j0, j);
          i1 = Math.max(i1, i);
          j1 = Math.max(j1, j);
        }
      }
    }
    if (wet >= 4) {
      i0 = Math.max(0, i0 - 1);
      j0 = Math.max(0, j0 - 1);
      i1 = Math.min(n - 1, i1 + 1);
      j1 = Math.min(n - 1, j1 + 1);
      // The shore is kept on a finer grid than the ground's, so a cove a few
      // metres across comes out a cove. Only near the coast is it worth
      // working out again; elsewhere the coarse answer says the same.
      const k = Math.max(1, Math.round(cell / SEA_CELL));
      const fine = cell / k;
      const bw = (i1 - i0) * k + 1;
      const bh = (j1 - j0) * k + 1;
      const d = new Float32Array(bw * bh);
      for (let j = 0; j < bh; j++) {
        for (let i = 0; i < bw; i++) {
          const [ci, cj] = [Math.min(i1 - 1, i0 + Math.floor(i / k)), Math.min(j1 - 1, j0 + Math.floor(j / k))];
          const near = Math.min(Math.abs(D[cj * n + ci]), Math.abs(D[cj * n + ci + 1]), Math.abs(D[(cj + 1) * n + ci]), Math.abs(D[(cj + 1) * n + ci + 1]));
          const x = gx(i0) + i * fine;
          const z = gx(j0) + j * fine;
          if (near > SEA_MARGIN) {
            const [u, v] = [(i % k) / k, (j % k) / k];
            const a = D[cj * n + ci] * (1 - u) + D[cj * n + ci + 1] * u;
            const b = D[(cj + 1) * n + ci] * (1 - u) + D[(cj + 1) * n + ci + 1] * u;
            d[j * bw + i] = a * (1 - v) + b * v;
          } else d[j * bw + i] = Math.max(coastDistance(shores, x, z), Math.hypot(x, z) - Rl);
        }
      }
      const own = { x: round(gx(i0), 100), z: round(gx(j0), 100), w: bw, h: bh, cell: fine };
      for (let k = 0; k < n * n; k++) {
        if (lakeCells[k]) continue; // a pond by the shore keeps its own level
        if (D[k] < 0) {
          E[k] = SEA_LEVEL;
          lakeCells[k] = 1;
        } else E[k] = Math.max(E[k], SEA_LEVEL + BANK);
      }
      lakes.push({ name: SEA_NAME, sea: true, levelReal: SEA_LEVEL, own, d });
    }
  }

  // ── Beaches ────────────────────────────────────────────────────────────────
  // A beach can be a few metres across at this scale, far finer than the
  // ground's grid: each is kept as distances to its edge on a grid of its own.
  const strands = [];
  for (const ring of beaches) {
    const pts = ring.map(toGame);
    let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, z] of pts) {
      x0 = Math.min(x0, x);
      z0 = Math.min(z0, z);
      x1 = Math.max(x1, x);
      z1 = Math.max(z1, z);
    }
    if (!pts.every(([x, z]) => inside(x, z, LAKE_INSET))) continue;
    const m = BEACH_MARGIN;
    const bw = Math.ceil((x1 - x0 + 2 * m) / BEACH_CELL) + 1;
    const bh = Math.ceil((z1 - z0 + 2 * m) / BEACH_CELL) + 1;
    if (bw * bh > 40000) continue; // a strand for miles: the country's own shore will do
    const d = new Float32Array(bw * bh);
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) d[j * bw + i] = signedDistance([pts], x0 - m + i * BEACH_CELL, z0 - m + j * BEACH_CELL);
    strands.push({ x: round(x0 - m, 100), z: round(z0 - m, 100), w: bw, h: bh, cell: BEACH_CELL, shore: packShore(d) });
  }

  // ── What covers the land ───────────────────────────────────────────────────
  // Each area filled in on the ground's grid, the biggest first, so that what
  // lies in another (a scree in the woods, willows in a meadow) is drawn over
  // it. Where none says, nothing is said (0).
  const cover = new Uint8Array(n * n);
  const areas = covers
    .filter((c) => COVER.includes(c.kind))
    .map((c) => {
      const rings = c.rings.map((r) => r.map(toGame));
      // (how big: its biggest ring, which is its outside)
      return { kind: COVER.indexOf(c.kind) + 1, rings, area: Math.max(...rings.map((r) => Math.abs(ringArea(r)))) };
    })
    .sort((a, b) => b.area - a.area);
  for (const a of areas) fillRings(a.rings, (i, j) => (cover[j * n + i] = a.kind), n, cell, half);

  // (in a loop: a big land has too many heights to spread into Math.min)
  let base = Infinity;
  for (let k = 0; k < n * n; k++) if (E[k] < base) base = E[k];
  const H = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) H[k] = (E[k] - base) * s;
  let fine = null; // the finer grid along the walk, once there is one
  const heightAt = (x, z) => {
    if (fine) {
      const g = fineAt(fine, x, z);
      if (g !== null) return g;
    }
    const fi = Math.min(n - 1.001, Math.max(0, x / cell + half));
    const fj = Math.min(n - 1.001, Math.max(0, z / cell + half));
    const i = Math.floor(fi);
    const j = Math.floor(fj);
    const u = fi - i;
    const v = fj - j;
    const k = j * n + i;
    return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + n] * (1 - u) + H[k + n + 1] * u) * v;
  };

  // ── Trails ─────────────────────────────────────────────────────────────────
  const lines = [];
  const whole = []; // the same, with every point: where paths meet is a point of each
  for (const t of trails) {
    let cur = [];
    const flush = () => {
      if (cur.length > 1) {
        lines.push({ name: t.name, pts: simplify(cur, SIMPLIFY), rope: !!t.rope, closed: !!t.closed });
        whole.push({ name: t.name, pts: cur, closed: !!t.closed });
      }
      cur = [];
    };
    for (const p of t.points.map(toGame)) {
      if (inside(p[0], p[1], TRAIL_INSET)) cur.push(p);
      else flush();
    }
    flush();
  }

  // ── Streams ────────────────────────────────────────────────────────────────
  // The stretches that are on the land, each the way it flows. How high the
  // water stands along them is worked out from the ground when the land is
  // set into the world (Landform.settled).
  // Each as wide as it really is: as the map says, or from bank to bank of
  // the area the map draws the river over, or else as wide as a stream or a
  // river usually is.
  const banks = riverbanks.map((r) => r.map(toGame));
  const runs = [];
  for (const st of tidal ? [] : streams) {
    let cur = [];
    const flush = () => {
      if (cur.length > 1) {
        const width = (st.width || widthBetweenBanks(cur, banks) / s || (st.river ? RIVER_WIDTH : STREAM_WIDTH)) * s;
        runs.push({ name: st.name, big: st.river ? 1 : 0, pts: simplify(cur, SIMPLIFY).flatMap(([x, z]) => [round(x, 10), round(z, 10)]), width: round(width, 10) });
      }
      cur = [];
    };
    for (const p of st.points.map(toGame)) {
      if (inside(p[0], p[1], LAKE_INSET)) cur.push(p);
      else flush();
    }
    flush();
  }

  // ── Waterfalls ─────────────────────────────────────────────────────────────
  // Where each is, by name: the ground and the stream make the drop (it is
  // the ground's to be a cliff), and the game puts the falling water on it.
  const drops = [];
  for (const f of falls) {
    const [x, z] = toGame([f.lat, f.lon]);
    if (inside(x, z, LAKE_INSET)) drops.push({ name: f.name, x: round(x, 10), z: round(z, 10), ...(f.height ? { height: f.height } : {}) });
  }

  // ── More photos ────────────────────────────────────────────────────────────
  // Each a spot of its own on the walk, as the view is: where it was taken
  // from, which way it looked, and when.
  const shots = [];
  for (const p of photos) {
    const [x, z] = toGame([p.lat, p.lon]);
    if (inside(x, z, TRAIL_INSET)) shots.push({ name: p.name, x: round(x, 10), z: round(z, 10), bearing: round(p.bearing, 10), hour: round(p.hour, 100) });
  }

  // The walk: from where you'd leave the car, by whatever paths lead to where
  // the photo was taken. Failing a road, up the trail it was taken on. Or
  // from where it's said to start (`from`), and on past the photo to where
  // it's said to end (`to`), by the paths between.
  const [vx, vz] = toGame([photo.lat, photo.lon]).map((v) => round(v, 10));
  const view = { x: vx, z: vz, bearing: round(photo.bearing, 10), hour: round(photo.hour, 100) };
  const drive = roads.map((r) => r.map(toGame));
  const walkable = { roads: drive.flatMap((r) => within(r, TRAIL_INSET)), gap: GAP * s, m: s };
  let found = from ? walkBetween(whole, [toGame([from.lat, from.lon]), [vx, vz]], walkable) : walkFromRoad(whole, drive, [vx, vz], s);
  if (found && to) found = walkBetween(whole, [found.pts[0], [vx, vz], toGame([to.lat, to.lon])], walkable);
  if (!found && (from || to)) throw new Error(`no paths lead ${from ? 'from where the walk is to start ' : ''}to the photo${to ? ' and on to where it is to end' : ''}`);
  // The stretches of it off the map's paths (along a village's lanes, across
  // a gap the map left) are paths on the ground too; a steep gap, with
  // chains to hold on to.
  for (const a of (found && found.added) || []) {
    const steep = a.gap && a.pts.some((p, k) => k > 0 && Math.abs(fineElevation(...fromGame(...p)) - fineElevation(...fromGame(...a.pts[k - 1]))) > (STEEP * dist(p, a.pts[k - 1])) / s);
    lines.push({ name: '', pts: simplify(a.pts, SIMPLIFY), rope: steep, closed: false });
  }
  const route = found ? { ...found, pts: simplify(found.pts, SIMPLIFY) } : walkTo(lines, heightAt, [vx, vz], s);
  const trailhead = route ? { x: route.pts[0][0], z: route.pts[0][1], yaw: route.yaw } : { x: vx, z: vz, yaw: Math.PI - ((photo.bearing || 0) * Math.PI) / 180 };
  // where it ends, if that's past the photo
  const last = route && route.pts[route.pts.length - 1];
  const end = to && last ? { x: round(last[0], 10), z: round(last[1], 10) } : null;

  // ── A finer grid along the walk ────────────────────────────────────────────
  // The ground's grid is coarse for land kilometres across, and seen close a
  // narrow ridge on it is a broad hump. Where the walk goes, a finer grid
  // keeps it narrow: heights `fine.cell` real metres apart, as far round the
  // walk (and the falls) as `fine.margin`, with the lakes and the sea as the
  // coarse grid has them. It is kept as tiles, only those near the walk, so
  // a walk of many kilometres costs what its own strip of land does. It
  // gives way to the coarse grid at its edge (landform.js).
  const fo = o.fine && { margin: o.fineMargin, ...o.fine };
  if (fo) {
    const fc = fo.cell * s;
    const S = FINE_TILE;
    const tiles = new Map();
    for (const [ti, tj] of fineTiles(route ? route.pts : null, fo, s, R, [[vx, vz], ...drops.map((f) => [f.x, f.z]), ...shots.map((p) => [p.x, p.z])])) {
      const F = new Float32Array(S * S);
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
          const x = (ti * S + i) * fc;
          const z = (tj * S + j) * fc;
          let sum = 0;
          for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) sum += fineElevation(...fromGame(x + (a * fc) / 3, z + (b * fc) / 3));
          F[j * S + i] = (watered(lakes, gx(0), cell, x, z, sum / 9) - base) * s;
        }
      }
      tiles.set(`${ti},${tj}`, { ti, tj, H: F });
    }
    fine = { cell: fc, size: S, tiles };
  }

  const def = {
    id,
    name,
    at,
    scale: s,
    radius: R,
    fade: o.fade * s,
    photo: { lat: round(photo.lat, 1e6), lon: round(photo.lon, 1e6) },
    // where the land is centred, if not on the photo
    ...(middle ? { middle: { lat: round(middle.lat, 1e6), lon: round(middle.lon, 1e6) } } : {}),
    // the real height (m) its heights are measured from
    base: round(base, 100),
    datum,
    view,
    trailhead: { x: round(trailhead.x, 10), z: round(trailhead.z, 10), yaw: round(trailhead.yaw, 1000) },
    // where the walk ends, when it goes on past the photo
    ...(end ? { end } : {}),
    trail: route ? { name: route.name, length: Math.round(route.length), climb: Math.round(heightAt(...(end ? [end.x, end.z] : [vx, vz])) - heightAt(trailhead.x, trailhead.z)) } : null,
    trees: o.trees,
    // what kind of country it is (src/world/country.js); unsaid, forest
    ...(o.country ? { country: o.country } : {}),
    // where snow lies on it ([from, to], real m), if not where its country has it: null for none
    ...(o.snowline !== undefined ? { snowline: o.snowline } : {}),
    lakes: lakes.map((l) => ({ name: l.name, ...(l.sea ? { sea: true } : {}), level: round((l.levelReal - base) * s, 100), ...(l.own || { box: l.box }), shore: packShore(l.d) })),
    ...(strands.length ? { beaches: strands } : {}),
    ...(runs.length ? { streams: runs } : {}),
    // waterfalls, by name: where each is (relative to `at`), and its real height if the map says
    ...(drops.length ? { falls: drops } : {}),
    // more photos taken on the walk, each a spot to stand where it was taken
    ...(shots.length ? { photos: shots } : {}),
    paths: lines.map((l) => l.pts.flatMap(([x, z]) => [round(x, 10), round(z, 10)])),
    // the stretches of them with chains to hold on to
    ...(lines.some((l) => l.rope) ? { ropes: lines.filter((l) => l.rope).map((l) => l.pts.flatMap(([x, z]) => [round(x, 10), round(z, 10)])) } : {}),
    // (packed small: nobody asks about the corners outside its circle)
    ground: {
      n,
      cell,
      pack: 2,
      heights: packHeights2(H, n, n, (i, j) => Math.hypot(gx(i), gx(j)) < R + o.fade * s + cell * 3),
      ...(fine ? { fine: { cell: fine.cell, size: fine.size, tiles: [...fine.tiles.values()].map((t) => [t.ti, t.tj, packHeights2(t.H, fine.size, fine.size)]) } } : {}),
    },
    ...(areas.length ? { cover: { kinds: COVER, cells: packCover(cover) } } : {}),
  };
  // First in its part of the world: its own trailhead sets the heights, at
  // the level of the forest round it (see WorldGen._settle). Unless the walk
  // starts on top of the mountain (a summit you drive to): the forest stood
  // level with that would have the mountain in a pit. Then it is the land's
  // edge, half way up it, that stands level with the forest, and the
  // mountain stands over it.
  if (!def.datum) {
    const L = new Landform(def);
    let anchor = L.raw(at[0] + def.trailhead.x, at[1] + def.trailhead.z);
    const rim = [];
    for (let k = 0; k < 96; k++) rim.push(L.raw(at[0] + Math.cos((k / 96) * Math.PI * 2) * R, at[1] + Math.sin((k / 96) * Math.PI * 2) * R));
    rim.sort((a, b) => a - b);
    const edge = rim[rim.length >> 1];
    if (anchor > edge + SUMMIT * s) anchor = edge;
    def.datum = { at: [...at], outer: def.radius + def.fade, anchor: round(anchor, 1000), base: def.base };
  }
  return { def, preview: preview(H, n, cell, lakeCells, lines, route, runs, fine, cover, [vx, vz]), walk: route ? route.pts : null };
}

// Which tiles of the finer grid to keep: those that come within `margin`
// real metres of the walk, or of any of `also` (the spot the photo was taken
// from, the falls), and reach onto the real land (radius R, game m). Tile
// (ti, tj) holds the FINE_TILE × FINE_TILE points from (ti, tj) · FINE_TILE
// cells of `cell` real metres from the land's middle.
// → [[ti, tj], ...], row by row
export function fineTiles(walk, { cell, margin }, scale, R, also = []) {
  const c = cell * scale;
  const T = c * FINE_TILE;
  const m = margin * scale;
  const keep = new Map();
  // the tiles within m of (x, z): measured to the tile's own points, the
  // first to the last
  const near = (x, z) => {
    for (let tj = Math.floor((z - m) / T); tj <= Math.floor((z + m) / T); tj++) {
      for (let ti = Math.floor((x - m) / T); ti <= Math.floor((x + m) / T); ti++) {
        const dx = Math.max(ti * T - x, 0, x - (ti * T + T - c));
        const dz = Math.max(tj * T - z, 0, z - (tj * T + T - c));
        const r = Math.hypot(Math.max(Math.abs(ti * T + T / 2) - T / 2, 0), Math.max(Math.abs(tj * T + T / 2) - T / 2, 0));
        if (dx * dx + dz * dz <= m * m && r < R) keep.set(`${ti},${tj}`, [ti, tj]);
      }
    }
  };
  // along the walk, every cell of it
  const pts = walk && walk.length ? walk : [];
  for (let k = 0; k < pts.length; k++) {
    if (k === 0) near(...pts[0]);
    else {
      const [ax, az] = pts[k - 1];
      const [bx, bz] = pts[k];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / c));
      for (let i = 1; i <= steps; i++) near(ax + ((bx - ax) * i) / steps, az + ((bz - az) * i) / steps);
    }
  }
  for (const p of also) near(...p);
  return [...keep.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

// A pool too small for the ground's grid: the signed distance to its shore
// on a grid of its own, POOL_CELL apart (or as fine as POOL_MOST points over
// it can be, half a metre at a time, for a long one), kept inside the disc of
// radius Rl; and its level, the height most of it agrees on (elevation data
// lays water out flat at its surface), from height(x, z) in real metres.
// → { levelReal, own: { x, z, w, h, cell }, d }, or null if it's nothing
export function poolOf(rings, [x0, z0, x1, z1], Rl, height) {
  const m = POOL_MARGIN;
  const span = (x1 - x0 + 2 * m) * (z1 - z0 + 2 * m);
  const cell = Math.max(POOL_CELL, Math.ceil(Math.sqrt(span / POOL_MOST) / POOL_CELL) * POOL_CELL);
  const w = Math.ceil((x1 - x0 + 2 * m) / cell) + 1;
  const h = Math.ceil((z1 - z0 + 2 * m) / cell) + 1;
  const d = new Float32Array(w * h);
  const wet = [];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = x0 - m + i * cell;
      const z = z0 - m + j * cell;
      const v = Math.max(signedDistance(rings, x, z), Math.hypot(x, z) - Rl);
      d[j * w + i] = v;
      if (v < 0) wet.push(height(x, z));
    }
  }
  if (wet.length < 4) return null;
  wet.sort((a, b) => a - b);
  return { levelReal: wet[Math.floor(wet.length * 0.3)], own: { x: round(x0 - m, 100), z: round(z0 - m, 100), w, h, cell }, d };
}

// The box round some tiles of the finer grid, [x0, z0, x1, z1] game metres
// from the land's middle: what the heights for them are fetched over.
export function tileBox([ti, tj], { cell }, scale) {
  const c = cell * scale;
  return [ti * FINE_TILE * c, tj * FINE_TILE * c, (ti * FINE_TILE + FINE_TILE - 1) * c, (tj * FINE_TILE + FINE_TILE - 1) * c];
}

// The finer grid's height at (x, z), bilinear, or null where it has none.
function fineAt(f, x, z) {
  const S = f.size;
  const fi = x / f.cell;
  const fj = z / f.cell;
  const [I, J] = [Math.floor(fi), Math.floor(fj)];
  const at = (i, j) => {
    const t = f.tiles.get(`${Math.floor(i / S)},${Math.floor(j / S)}`);
    return t ? t.H[(j - t.tj * S) * S + i - t.ti * S] : null;
  };
  const [a, b, c, d] = [at(I, J), at(I + 1, J), at(I, J + 1), at(I + 1, J + 1)];
  if (a === null || b === null || c === null || d === null) return null;
  const [u, v] = [fi - I, fj - J];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

// What the lakes and the sea make of real height e at (x, z), as they made of
// the coarse grid: their level in the water, and just over it at the edge.
// first: x and z of the coarse grid's first point; cell: its spacing.
function watered(lakes, first, cell, x, z, e) {
  for (const l of lakes) {
    const f = l.own || { x: first + l.box[0] * cell, z: first + l.box[1] * cell, w: l.box[2], h: l.box[3], cell };
    const fi = (x - f.x) / f.cell;
    const fj = (z - f.z) / f.cell;
    let d = Infinity;
    if (fi >= 0 && fj >= 0 && fi <= f.w - 1 && fj <= f.h - 1) {
      const i = Math.min(f.w - 2, Math.floor(fi));
      const j = Math.min(f.h - 2, Math.floor(fj));
      const [u, v] = [fi - i, fj - j];
      const k = j * f.w + i;
      d = (l.d[k] * (1 - u) + l.d[k + 1] * u) * (1 - v) + (l.d[k + f.w] * (1 - u) + l.d[k + f.w + 1] * u) * v;
    }
    if (d < 0) return l.levelReal;
    // the sea keeps all the land over it; a lake, its banks
    if (l.sea || d < 3) e = Math.max(e, l.levelReal + BANK);
  }
  return e;
}

// How wide some water is (game m): twice its area over the length of its
// shore. A round lake's is its radius; a ring of water's, how wide the ring
// is. outer: its shores; holes: its islands'.
function thickness(outer, holes) {
  const area = (r) => {
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
    return Math.abs(a / 2);
  };
  const length = (r) => r.reduce((t, p, i) => t + Math.hypot(p[0] - r[(i + 1) % r.length][0], p[1] - r[(i + 1) % r.length][1]), 0);
  const wet = outer.reduce((t, r) => t + area(r), 0) - holes.reduce((t, r) => t + area(r), 0);
  const shore = [...outer, ...holes].reduce((t, r) => t + length(r), 0);
  return shore > 0 ? (2 * Math.max(wet, 0)) / shore : 0;
}

// The signed distance to a lake's shore at (x, z), from a grid of its own
// (`own`); Infinity off it.
function shoreOf(l, x, z) {
  const f = l.own;
  const fi = (x - f.x) / f.cell;
  const fj = (z - f.z) / f.cell;
  if (fi < 0 || fj < 0 || fi > f.w - 1 || fj > f.h - 1) return Infinity;
  const i = Math.min(f.w - 2, Math.floor(fi));
  const j = Math.min(f.h - 2, Math.floor(fj));
  const [u, v] = [fi - i, fj - j];
  const k = j * f.w + i;
  return (l.d[k] * (1 - u) + l.d[k + 1] * u) * (1 - v) + (l.d[k + f.w] * (1 - u) + l.d[k + f.w + 1] * u) * v;
}

// The water of a tidal country, as one lake at the level of the sea, on a
// grid of its own TIDE_CELL apart over the land (see TIDE_CELL): wherever the
// map draws water (lakes, river and canal areas, their islands left out:
// osm.js, waterAreas), along every river, stream
// and canal it draws as a line, as wide as that is, and down the channels the
// elevation data has under the sea that join those. Named for the named water
// nearest `near` ([x, z]: where the photo was taken), the water you're by.
// → { name, levelReal, own: { x, z, w, h, cell }, d } or null if there's none
export function tidalWater({ areas, canals, streams, toGame, fromGame, elevation, R, s, near = [0, 0] }) {
  const Rl = R - LAKE_INSET;
  const c = TIDE_CELL;
  const half = Math.ceil(Rl / c) + 1;
  const n = half * 2 + 1;
  const g = (i) => (i - half) * c;
  const wet = new Uint8Array(n * n);
  let named = { d: Infinity, name: '' }; // the named water nearest `near`
  const mark = (k, name) => {
    if (name) {
      const d = Math.hypot(g(k % n) - near[0], g(Math.floor(k / n)) - near[1]);
      if (d < named.d) named = { d, name };
    }
    wet[k] = 1;
  };
  const on = (i, j) => Math.hypot(g(i), g(j)) < Rl;
  // the areas, each on its own, holes and all (a river's area over a lake's
  // is water still)
  for (const a of areas) fillRings(a.rings.map((r) => r.map(toGame)), (i, j) => on(i, j) && mark(j * n + i, a.name), n, c, half);
  // the lines, as wide as each is
  const lines = [...streams.map((st) => ({ ...st, width: st.width || (st.river ? RIVER_WIDTH : STREAM_WIDTH) })), ...canals.map((l) => ({ ...l, width: l.width || RIVER_WIDTH }))];
  for (const l of lines) {
    const r = Math.max(TIDE_HALF, (l.width * s) / 2);
    const pts = l.points.map(toGame);
    for (let k = 1; k < pts.length; k++) {
      const [ax, az] = pts[k - 1];
      const [bx, bz] = pts[k];
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - r) / c) + half);
      const i1 = Math.min(n - 1, Math.ceil((Math.max(ax, bx) + r) / c) + half);
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - r) / c) + half);
      const j1 = Math.min(n - 1, Math.ceil((Math.max(az, bz) + r) / c) + half);
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const [x, z] = [g(i), g(j)];
          const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
          if (Math.hypot(x - ax - dx * t, z - az - dz * t) <= r && on(i, j)) mark(j * n + i, l.name);
        }
      }
    }
  }
  // the channels under the sea that join them
  const queue = [];
  for (let k = 0; k < n * n; k++) if (wet[k]) queue.push(k);
  if (!queue.length) return null;
  const deep = new Int8Array(n * n); // 0 not asked yet, 1 deep, -1 not
  const isDeep = (k) => {
    if (!deep[k]) {
      const [i, j] = [k % n, Math.floor(k / n)];
      deep[k] = on(i, j) && elevation(...fromGame(g(i), g(j))) < TIDE_DEEP ? 1 : -1;
    }
    return deep[k] > 0;
  };
  while (queue.length) {
    const k = queue.pop();
    const [i, j] = [k % n, Math.floor(k / n)];
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      if (a < 0 || b < 0 || a >= n || b >= n) continue;
      const q = b * n + a;
      if (wet[q] || !isDeep(q)) continue;
      wet[q] = 1;
      queue.push(q);
    }
  }
  // the signed distance to the shore, negative in the water
  const out = distanceTransform(wet, n, 0);
  const inn = distanceTransform(wet, n, 1);
  const d = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) d[k] = wet[k] ? -(Math.sqrt(inn[k]) - 0.5) * c : (Math.sqrt(out[k]) - 0.5) * c;
  return { name: named.name, levelReal: SEA_LEVEL, own: { x: round(g(0), 100), z: round(g(0), 100), w: n, h: n, cell: c }, d };
}

// For each point of an n × n grid, the squared distance (in points) to the
// nearest one that isn't `from` (Felzenszwalb and Huttenlocher's exact
// transform, a row and then a column at a time).
function distanceTransform(grid, n, from) {
  const BIG = 1e12;
  const D = new Float64Array(n * n);
  for (let k = 0; k < n * n; k++) D[k] = grid[k] === from ? BIG : 0;
  const f = new Float64Array(n);
  const v = new Int32Array(n);
  const zz = new Float64Array(n + 1);
  const line = (get, set) => {
    for (let q = 0; q < n; q++) f[q] = get(q);
    let k = 0;
    v[0] = 0;
    zz[0] = -Infinity;
    zz[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let sx = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (sx <= zz[k]) {
        k--;
        sx = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      zz[k] = sx;
      zz[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (zz[k + 1] < q) k++;
      set(q, (q - v[k]) ** 2 + f[v[k]]);
    }
  };
  for (let j = 0; j < n; j++) line((q) => D[j * n + q], (q, val) => (D[j * n + q] = val));
  for (let i = 0; i < n; i++) line((q) => D[q * n + i], (q, val) => (D[q * n + i] = val));
  return D;
}

// A hike as it's kept (see src/world/landforms.js): its card, small, listed in
// src/world/hikes.js and always loaded; and its land, in a file of its own,
// fetched the first time it's needed. { ...card, ...land } is the hike again.
export const LAND_PARTS = ['ground', 'lakes', 'beaches', 'streams', 'paths', 'ropes', 'cover'];
export function splitHike(def) {
  const card = {};
  const land = {};
  for (const [k, v] of Object.entries(def)) (LAND_PARTS.includes(k) ? land : card)[k] = v;
  // The card keeps the names of its lakes and streams, for the list of hikes,
  // each as { name }: so a card split again (the importer does that to the
  // cards already there) comes out as it went in.
  card.lakes = (def.lakes || []).map((l) => ({ name: l.name, ...(l.sea ? { sea: true } : {}) }));
  const named = [...new Set((def.streams || []).map((s) => s.name).filter(Boolean))];
  if (named.length) card.streams = named.map((name) => ({ name }));
  return { card, land };
}

const round = (v, f) => (v === null || v === undefined ? null : Math.round(v * f) / f + 0); // + 0: no -0

// ── Geometry ─────────────────────────────────────────────────────────────────
// Twice the signed area of a ring (shoelace).
function ringArea(r) {
  let a = 0;
  for (let k = 0, l = r.length - 1; k < r.length; l = k++) a += (r[l][0] - r[k][0]) * (r[l][1] + r[k][1]);
  return a / 2;
}

// Calls put(i, j) for every point of an n × n grid `cell` apart, centred on
// the origin (point (half, half) is (0, 0)), that is inside the rings, even-odd:
// row by row, between where the row crosses their edges.
export function fillRings(rings, put, n, cell, half) {
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const r of rings) {
    for (const [, z] of r) {
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
  }
  const j0 = Math.max(0, Math.ceil(z0 / cell + half));
  const j1 = Math.min(n - 1, Math.floor(z1 / cell + half));
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    const z = (j - half) * cell;
    xs.length = 0;
    for (const r of rings) {
      for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
        const [ax, az] = r[b];
        const [bx, bz] = r[a];
        if (az > z !== bz > z) xs.push(ax + ((z - az) * (bx - ax)) / (bz - az));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(xs[k] / cell + half));
      const i1 = Math.min(n - 1, Math.floor(xs[k + 1] / cell + half));
      for (let i = i0; i <= i1; i++) put(i, j);
    }
  }
}

// How wide (game m) a river is, read between the banks of the areas drawn
// over it (rings, game m) along its line `pts`: where enough of it lies
// between them, the width most of it has (it needn't run down the middle);
// else 0, for not known.
function widthBetweenBanks(pts, rings) {
  if (!rings.length) return 0;
  const widths = [];
  let count = 0;
  for (let k = 1; k < pts.length; k++) {
    const [a, b] = [pts[k - 1], pts[k]];
    const steps = Math.max(1, Math.ceil(dist(a, b) / BANK_STEP));
    for (let i = k > 1 ? 1 : 0; i <= steps; i++) {
      const [x, z] = [a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps];
      count++;
      const d = signedDistance(rings, x, z);
      if (d < 0) widths.push(-2 * d);
    }
  }
  if (widths.length < count * BANKED) return 0;
  widths.sort((p, q) => p - q);
  return widths[Math.floor(widths.length * 0.75)];
}

// Signed distance from (x, z) to a set of rings (negative inside: even-odd).
export function signedDistance(rings, x, z) {
  let best = Infinity;
  let inside = false;
  for (const r of rings) {
    for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
      const [ax, az] = r[b];
      const [bx, bz] = r[a];
      if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < best) best = d;
    }
  }
  return inside ? -best : best;
}

// Signed distance from (x, z) to the coast (negative at sea). `lines` are in
// game coordinates, drawn as OpenStreetMap draws a coast: with the land on the
// left as you go along, which here, with z running south, is on the right.
// At a corner both the stretches that meet there have a say, or a headland's
// point would be judged by whichever stretch came first.
export function coastDistance(lines, x, z) {
  let best = Infinity;
  let landward = 1;
  for (const c of lines) {
    const closed = c.length > 2 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1];
    const last = c.length - 1;
    for (let k = 1; k <= last; k++) {
      const [ax, az] = c[k - 1];
      const dx = c[k][0] - ax;
      const dz = c[k][1] - az;
      const l2 = dx * dx + dz * dz;
      if (!l2) continue;
      const t = ((x - ax) * dx + (z - az) * dz) / l2;
      const l = Math.sqrt(l2);
      // (nx, nz): the way to the land from this stretch
      let nx = dz / l;
      let nz = -dx / l;
      let [px, pz] = [ax + dx * t, az + dz * t];
      // nearest an end: the corner there, if the coast goes on round it
      const corner = t <= 0 ? (k > 1 ? [k - 2, k - 1] : closed ? [last - 1, 0] : null) : t >= 1 ? (k < last ? [k, k + 1] : closed ? [0, 1] : null) : null;
      if (t <= 0) [px, pz] = [ax, az];
      else if (t >= 1) [px, pz] = c[k];
      if (corner) {
        const [qx, qz] = [c[corner[1]][0] - c[corner[0]][0], c[corner[1]][1] - c[corner[0]][1]];
        const ql = Math.hypot(qx, qz);
        if (ql) {
          nx += qz / ql;
          nz += -qx / ql;
        }
      }
      const d = Math.hypot(x - px, z - pz);
      if (d < best) {
        best = d;
        landward = (x - px) * nx + (z - pz) * nz;
      }
    }
  }
  return landward < 0 ? -best : best;
}

// Ramer-Douglas-Peucker: drop points that are within tol of the line.
export function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, az] = pts[a];
    const [bx, bz] = pts[b];
    const l = Math.hypot(bx - ax, bz - az) || 1;
    let far = -1;
    let at = -1;
    for (let k = a + 1; k < b; k++) {
      const d = Math.abs((bx - ax) * (az - pts[k][1]) - (ax - pts[k][0]) * (bz - az)) / l;
      if (d > far) {
        far = d;
        at = k;
      }
    }
    if (far > tol) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lengthOf = (pts) => pts.reduce((sum, p, k) => sum + (k ? dist(p, pts[k - 1]) : 0), 0);

// For when no road is to be found (walkFromRoad): the trail nearest the
// photo, joined end to end with the rest of the trail of the same name, from
// its lower end to the point nearest the photo.
// → { name, pts, length, yaw } or null if the photo wasn't taken on a trail.
export function walkTo(lines, heightAt, to = [0, 0], m = 1) {
  let near = null;
  let nearD = ON_TRAIL * m;
  for (const l of lines) {
    for (const p of l.pts) {
      const d = dist(p, to);
      if (d < nearD) {
        nearD = d;
        near = l;
      }
    }
  }
  if (!near) return null;
  // join this line with any of the same name that meet its ends
  let chain = near.pts.slice();
  const left = lines.filter((l) => l !== near && near.name && l.name === near.name);
  for (let grew = true; grew; ) {
    grew = false;
    for (let k = 0; k < left.length; k++) {
      const p = left[k].pts;
      const [a, b] = [chain[0], chain[chain.length - 1]];
      if (dist(p[0], b) < 0.5) chain = chain.concat(p.slice(1));
      else if (dist(p[p.length - 1], b) < 0.5) chain = chain.concat(p.slice(0, -1).reverse());
      else if (dist(p[p.length - 1], a) < 0.5) chain = p.slice(0, -1).concat(chain);
      else if (dist(p[0], a) < 0.5) chain = p.slice(1).reverse().concat(chain);
      else continue;
      left.splice(k, 1);
      grew = true;
      break;
    }
  }
  let at = 0;
  for (let k = 1; k < chain.length; k++) if (dist(chain[k], to) < dist(chain[at], to)) at = k;
  const lowFirst = heightAt(...chain[0]) <= heightAt(...chain[chain.length - 1]);
  const pts = lowFirst ? chain.slice(0, at + 1) : chain.slice(at).reverse();
  if (pts.length < 2) return null;
  // which way the trail sets off: a few metres along it
  let k = 1;
  while (k < pts.length - 1 && dist(pts[k], pts[0]) < 4) k++;
  const yaw = Math.atan2(pts[k][0] - pts[0][0], pts[k][1] - pts[0][1]);
  return { name: near.name, pts, length: lengthOf(pts), yaw };
}

// The paths as a graph: their points, joined where paths meet, and which
// lead to which ([[other, metres, line], ...] for each point). Paths closed
// to walkers are left out of it.
function pathGraph(lines, m = 1) {
  const ids = new Map();
  const pts = [];
  const next = [];
  const same = SAME * m;
  const idOf = (p) => {
    const key = `${Math.round(p[0] / same)},${Math.round(p[1] / same)}`;
    if (!ids.has(key)) {
      ids.set(key, pts.length);
      pts.push(p);
      next.push([]);
    }
    return ids.get(key);
  };
  lines.forEach((l, li) => {
    if (l.closed) return;
    for (let k = 1; k < l.pts.length; k++) {
      const [a, b] = [idOf(l.pts[k - 1]), idOf(l.pts[k])];
      if (a === b) continue;
      const d = dist(pts[a], pts[b]);
      next[a].push([b, d, li]);
      next[b].push([a, d, li]);
    }
  });
  return { pts, next };
}

// The point of the graph nearest p, if one is within ON_TRAIL; else -1.
function nearestPoint({ pts }, p, m = 1) {
  let best = -1;
  let bestD = ON_TRAIL * m;
  pts.forEach((q, k) => {
    const d = dist(q, p);
    if (d < bestD) [best, bestD] = [k, d];
  });
  return best;
}

// How far along the paths every point is from point `from` (Dijkstra; there
// are few enough points to look for the nearest each time), and the way back:
// the point before each, and the line it came by.
function shortestFrom({ pts, next }, from) {
  const far = new Float64Array(pts.length).fill(Infinity);
  const back = new Int32Array(pts.length).fill(-1);
  const via = new Int32Array(pts.length).fill(-1);
  const done = new Uint8Array(pts.length);
  far[from] = 0;
  for (;;) {
    let k = -1;
    for (let i = 0; i < pts.length; i++) if (!done[i] && far[i] < Infinity && (k < 0 || far[i] < far[k])) k = i;
    if (k < 0) break;
    done[k] = 1;
    for (const [o, d, li] of next[k]) {
      if (far[k] + d < far[o]) {
        far[o] = far[k] + d;
        back[o] = k;
        via[o] = li;
      }
    }
  }
  return { far, back, via };
}

// A walk as the game keeps it, from its points and the metres of it on each
// named path: called after the named path most of it is on, and setting off
// the way its first few metres go.
function walkOf(pts, names) {
  const name = [...names].filter(([n]) => n).sort((a, b) => b[1] - a[1])[0];
  let k = 1;
  while (k < pts.length - 1 && dist(pts[k], pts[0]) < 4) k++;
  const yaw = Math.atan2(pts[k][0] - pts[0][0], pts[k][1] - pts[0][1]);
  return { name: name ? name[0] : '', pts, length: lengthOf(pts), yaw };
}

// The way from point `start` to the point the search was made from, with the
// metres of it on each path's name added to `names`, and the line each step
// of it is on pushed to `steps` (-1 for a way across a gap: bridge()).
function wayBack({ pts }, lines, { back, via }, start, names, steps = []) {
  const out = [];
  for (let k = start; k >= 0; k = back[k]) {
    out.push(pts[k]);
    if (back[k] >= 0) {
      const name = via[k] >= 0 ? lines[via[k]].name : '';
      names.set(name, (names.get(name) || 0) + dist(pts[k], pts[back[k]]));
      steps.push(via[k]);
    }
  }
  return out;
}

// Where a path stops within `gap` of a path it doesn't join, a way across:
// from its end to the nearest point of the other, as a step on no line (-1).
// Roads are joined to, but a road that stops short is just a road that stops.
function bridge(graph, lines, gap) {
  const { pts, next } = graph;
  // which points the paths already join up, as they are
  const group = new Int32Array(pts.length).fill(-1);
  for (let k = 0; k < pts.length; k++) {
    if (group[k] >= 0) continue;
    const todo = [k];
    group[k] = k;
    while (todo.length) for (const [o] of next[todo.pop()]) if (group[o] < 0) todo.push(o), (group[o] = k);
  }
  for (let k = 0; k < pts.length; k++) {
    if (next[k].length !== 1 || lines[next[k][0][2]].road) continue;
    let best = -1;
    let bestD = gap;
    for (let o = 0; o < pts.length; o++) {
      if (group[o] === group[k]) continue;
      const d = dist(pts[k], pts[o]);
      if (d < bestD) [best, bestD] = [o, d];
    }
    if (best >= 0) {
      next[k].push([best, bestD, -1]);
      next[best].push([k, bestD, -1]);
    }
  }
}

// The walk from the nearest road or car park to the point of a path nearest
// the photo, by the shortest way along the paths: a walk begins where the car
// is left, whether that is below (a mountain) or above (a cove).
//   lines  [{ name, pts, closed? }] with every point kept, so paths that meet
//          share one
//   roads  [[[x, z], ...], ...]
// → { name, pts, length, yaw }, or null if the photo wasn't taken on a path,
//   or no path from it comes to a road.
export function walkFromRoad(lines, roads, to = [0, 0], m = 1) {
  const graph = pathGraph(lines, m);
  const end = nearestPoint(graph, to, m);
  if (end < 0) return null;
  const search = shortestFrom(graph, end);
  // the nearest point, along the paths, that is at a road
  const atRoad = (p) => roads.some((r) => r.some((q, k) => k > 0 && segDist(p, r[k - 1], q) < AT_ROAD * m));
  let start = -1;
  for (let k = 0; k < graph.pts.length; k++) if (search.far[k] < Infinity && (start < 0 || search.far[k] < search.far[start]) && atRoad(graph.pts[k])) start = k;
  if (start < 0 || start === end) return null;
  const names = new Map(); // name -> metres of the walk on a path of that name
  return walkOf(wayBack(graph, lines, search, start, names), names);
}

// The walk by way of each of `stops` in turn ([[x, z], ...]: where it starts,
// the photo, where it ends), each the point of a path nearest it, by the
// shortest way between one and the next: for a walk that begins somewhere
// other than the nearest road, or goes on past the photo. A walk like that
// goes where it has to: along `roads` too (a village's lanes), and across
// gaps of up to `gap` where the map's paths stop short of one another.
// → { name, pts, length, yaw, added }, added being the stretches of it that
//   aren't on the map's paths ([{ pts, gap }], gap for a way across a gap);
//   or null if a stop isn't on a path, or nothing leads from one to the next.
export function walkBetween(lines, stops, { roads = [], gap = 0, m = 1 } = {}) {
  const all = [...lines, ...roads.map((pts) => ({ name: '', pts, road: true }))];
  const graph = pathGraph(all, m);
  if (gap > 0) bridge(graph, all, gap);
  const at = stops.map((p) => nearestPoint(graph, p, m));
  if (at.some((k) => k < 0)) return null;
  const names = new Map();
  let pts = [];
  const steps = [];
  for (let s = 1; s < at.length; s++) {
    if (at[s] === at[s - 1]) continue;
    // searched from the far end of the leg, so the way back runs forward
    const search = shortestFrom(graph, at[s]);
    if (search.far[at[s - 1]] === Infinity) return null;
    const leg = wayBack(graph, all, search, at[s - 1], names, steps);
    pts = pts.length ? pts.concat(leg.slice(1)) : leg;
  }
  if (pts.length < 2) return null;
  // the stretches off the paths: along a road, or across a gap
  const added = [];
  steps.forEach((li, k) => {
    const off = li < 0 ? 'gap' : all[li].road ? 'road' : null;
    const last = added[added.length - 1];
    if (!off) return;
    if (last && last.end === k && last.kind === off) last.pts.push(pts[k + 1]);
    else added.push({ kind: off, pts: [pts[k], pts[k + 1]] });
    added[added.length - 1].end = k + 1;
  });
  return { ...walkOf(pts, names), added: added.map((a) => ({ pts: a.pts, gap: a.kind === 'gap' })) };
}

// Metres from p to the segment a→b.
function segDist(p, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
}

// ── A picture of it ──────────────────────────────────────────────────────────
// Hillshade, lakes, streams, trails, the walk (red) and where the photo was
// taken.
// What each kind of cover (COVER, from 1) is drawn as, mixed half and half
// with the relief.
const COVER_SHOWN = [null, [40, 95, 45], [120, 170, 70], [170, 190, 110], [180, 160, 110], [150, 150, 145], [200, 198, 190], [245, 248, 255]];
function preview(H, n, cellM, lakeCells, lines, route, runs = [], fine = null, cover = null, view = [0, 0]) {
  const rgb = new Uint8Array(n * n * 3);
  let lo = Infinity;
  let hi = -Infinity;
  for (const h of H) {
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const dx = H[Math.min(n - 1, i + 1) + j * n] - H[Math.max(0, i - 1) + j * n];
      const dz = H[i + Math.min(n - 1, j + 1) * n] - H[i + Math.max(0, j - 1) * n];
      // lit from the north-west, as on paper maps
      const shade = Math.max(0.35, Math.min(1.25, 0.9 + ((dx + dz) / (2 * cellM)) * -0.45));
      const t = (H[k] - lo) / (hi - lo || 1);
      let c = lakeCells[k] ? [50, 90, 150] : [90 + 120 * t, 120 + 70 * t, 70 + 60 * t].map((v) => v * shade);
      if (!lakeCells[k] && cover && cover[k]) c = c.map((v, q) => (v + COVER_SHOWN[cover[k]][q] * shade) / 2);
      rgb.set(c.map((v) => Math.max(0, Math.min(255, v))), k * 3);
    }
  }
  const half = (n - 1) / 2;
  const plot = (pts, col) => {
    for (let k = 1; k < pts.length; k++) {
      const steps = Math.ceil(dist(pts[k], pts[k - 1]) / (cellM * 0.5)) + 1;
      for (let s = 0; s <= steps; s++) {
        const x = pts[k - 1][0] + ((pts[k][0] - pts[k - 1][0]) * s) / steps;
        const z = pts[k - 1][1] + ((pts[k][1] - pts[k - 1][1]) * s) / steps;
        const i = Math.round(x / cellM + half);
        const j = Math.round(z / cellM + half);
        if (i >= 0 && j >= 0 && i < n && j < n) rgb.set(col, (j * n + i) * 3);
      }
    }
  };
  for (const r of runs) plot(Array.from({ length: r.pts.length / 2 }, (_, k) => [r.pts[k * 2], r.pts[k * 2 + 1]]), r.big ? [70, 130, 215] : [90, 150, 225]);
  for (const l of lines) plot(l.pts, [235, 225, 170]);
  if (route) plot(route.pts, [230, 50, 40]);
  if (fine) {
    // the outline of the tiles kept
    const T = fine.size * fine.cell;
    const has = (ti, tj) => fine.tiles.has(`${ti},${tj}`);
    for (const { ti, tj } of fine.tiles.values()) {
      const [x0, z0, x1, z1] = [ti * T, tj * T, ti * T + T, tj * T + T];
      if (!has(ti, tj - 1)) plot([[x0, z0], [x1, z0]], [255, 255, 255]);
      if (!has(ti, tj + 1)) plot([[x0, z1], [x1, z1]], [255, 255, 255]);
      if (!has(ti - 1, tj)) plot([[x0, z0], [x0, z1]], [255, 255, 255]);
      if (!has(ti + 1, tj)) plot([[x1, z0], [x1, z1]], [255, 255, 255]);
    }
  }

  const [vi, vj] = [Math.round(view[0] / cellM + half), Math.round(view[1] / cellM + half)];
  for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) if (vi + a >= 0 && vj + b >= 0 && vi + a < n && vj + b < n) rgb.set([255, 255, 255], ((vj + b) * n + vi + a) * 3);
  return { width: n, height: n, rgb };
}
