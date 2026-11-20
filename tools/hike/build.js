// From a photo's position, the real land around it and OpenStreetMap's trails,
// lakes and coast, to a hike the game can set into the forest (see
// src/world/landform.js for what a hike holds).
//
// Pure: elevation comes in as a function and OpenStreetMap as parsed data, so
// this can be tested without the network.

import { localFrame } from './geo.js';
import { Landform, packHeights, packShore } from '../../src/world/landform.js';

export const DEFAULTS = {
  scale: 0.2, // game metres per real metre
  radius: 4000, // real metres of real land around the photo
  fade: 1000, // real metres over which it gives way to the forest
  cell: 30, // real metres between heights
  trees: { cover: 0.85, species: 0.6 },
};

// How near (game m) the photo has to be to a trail for that trail to be the
// walk to it.
const ON_TRAIL = 30;
// How near (game m) a trail has to come to a road or a car park for the walk
// to start there.
const AT_ROAD = 4;
// A walk that starts this far (game m) over the middle of the land's edge
// starts on top of the mountain.
const SUMMIT = 40;
// Points of two paths nearer than this (game m) are the same point.
const SAME = 0.05;
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
//   trails     [{ name, points: [[lat, lon], ...] }]   (osm.js)
//   waters     [{ name, rings: [[[lat, lon], ...]] }]
//   coast      [[[lat, lon], ...], ...]: the shoreline of the sea, the land
//              on the left of each line as you go along it (osm.js)
//   roads      [[[lat, lon], ...], ...]: roads and car parks, where a walk
//              can begin
//   beaches    [[[lat, lon], ...], ...]: the outline of each beach
//   streams    [{ name, river, points: [[lat, lon], ...] }]: running water,
//              each the way it flows
//   datum      the heights to stand on, shared with a hike this one overlaps
//              (place.js), or null to set its own
// → { def, preview: { width, height, rgb } }
export function buildHike({ id, name, photo, elevation, trails = [], waters = [], coast = [], roads = [], beaches = [], streams = [], at = [0, 0], datum = null, ...opt }) {
  const o = { ...DEFAULTS, ...opt, trees: { ...DEFAULTS.trees, ...opt.trees } };
  const s = o.scale;
  const frame = localFrame(photo.lat, photo.lon);
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

  // ── Lakes ──────────────────────────────────────────────────────────────────
  const lakes = [];
  const lakeCells = new Int8Array(n * n);
  for (const w of waters) {
    const rings = w.rings.map((r) => r.map(toGame));
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
    if (wet.length < 4) continue;
    // Elevation data lays a lake out flat at its surface: the level is the
    // height most of it agrees on.
    const levels = wet.map((k) => E[k]).sort((a, b) => a - b);
    const level = levels[Math.floor(levels.length * 0.3)];
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

  const base = Math.min(...E);
  const H = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) H[k] = (E[k] - base) * s;
  const heightAt = (x, z) => {
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
        lines.push({ name: t.name, pts: simplify(cur, SIMPLIFY) });
        whole.push({ name: t.name, pts: cur });
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
  const runs = [];
  for (const st of streams) {
    let cur = [];
    const flush = () => {
      if (cur.length > 1) runs.push({ name: st.name, big: st.river ? 1 : 0, pts: simplify(cur, SIMPLIFY).flatMap(([x, z]) => [round(x, 10), round(z, 10)]) });
      cur = [];
    };
    for (const p of st.points.map(toGame)) {
      if (inside(p[0], p[1], LAKE_INSET)) cur.push(p);
      else flush();
    }
    flush();
  }

  // The walk: from where you'd leave the car, by whatever paths lead to where
  // the photo was taken. Failing a road, up the trail it was taken on.
  const view = { x: 0, z: 0, bearing: round(photo.bearing, 10), hour: round(photo.hour, 100) };
  const fromRoad = walkFromRoad(whole, roads.map((r) => r.map(toGame)));
  const route = fromRoad ? { ...fromRoad, pts: simplify(fromRoad.pts, SIMPLIFY) } : walkTo(lines, heightAt);
  const trailhead = route ? { x: route.pts[0][0], z: route.pts[0][1], yaw: route.yaw } : { x: 0, z: 0, yaw: Math.PI - ((photo.bearing || 0) * Math.PI) / 180 };

  const def = {
    id,
    name,
    at,
    scale: s,
    radius: R,
    fade: o.fade * s,
    photo: { lat: round(photo.lat, 1e6), lon: round(photo.lon, 1e6) },
    // the real height (m) its heights are measured from
    base: round(base, 100),
    datum,
    view,
    trailhead: { x: round(trailhead.x, 10), z: round(trailhead.z, 10), yaw: round(trailhead.yaw, 1000) },
    trail: route ? { name: route.name, length: Math.round(route.length), climb: Math.round(heightAt(0, 0) - heightAt(trailhead.x, trailhead.z)) } : null,
    trees: o.trees,
    // what kind of country it is (src/world/country.js); unsaid, forest
    ...(o.country ? { country: o.country } : {}),
    lakes: lakes.map((l) => ({ name: l.name, ...(l.sea ? { sea: true } : {}), level: round((l.levelReal - base) * s, 100), ...(l.own || { box: l.box }), shore: packShore(l.d) })),
    ...(strands.length ? { beaches: strands } : {}),
    ...(runs.length ? { streams: runs } : {}),
    paths: lines.map((l) => l.pts.flatMap(([x, z]) => [round(x, 10), round(z, 10)])),
    ground: { n, cell, heights: packHeights(H, n) },
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
    if (anchor > edge + SUMMIT) anchor = edge;
    def.datum = { at: [...at], outer: def.radius + def.fade, anchor: round(anchor, 1000), base: def.base };
  }
  return { def, preview: preview(H, n, cell, lakeCells, lines, route, runs) };
}

// A hike as it's kept (see src/world/landforms.js): its card, small, listed in
// src/world/hikes.js and always loaded; and its land, in a file of its own,
// fetched the first time it's needed. { ...card, ...land } is the hike again.
export const LAND_PARTS = ['ground', 'lakes', 'beaches', 'streams', 'paths'];
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
export function walkTo(lines, heightAt, to = [0, 0]) {
  let near = null;
  let nearD = ON_TRAIL;
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

// The walk from the nearest road or car park to the point of a path nearest
// the photo, by the shortest way along the paths: a walk begins where the car
// is left, whether that is below (a mountain) or above (a cove).
//   lines  [{ name, pts }] with every point kept, so paths that meet share one
//   roads  [[[x, z], ...], ...]
// → { name, pts, length, yaw }, or null if the photo wasn't taken on a path,
//   or no path from it comes to a road.
export function walkFromRoad(lines, roads, to = [0, 0]) {
  // the points of the paths, and which lead to which
  const ids = new Map();
  const pts = [];
  const next = []; // [[other, metres, line], ...] for each point
  const idOf = (p) => {
    const key = `${Math.round(p[0] / SAME)},${Math.round(p[1] / SAME)}`;
    if (!ids.has(key)) {
      ids.set(key, pts.length);
      pts.push(p);
      next.push([]);
    }
    return ids.get(key);
  };
  lines.forEach((l, li) => {
    for (let k = 1; k < l.pts.length; k++) {
      const [a, b] = [idOf(l.pts[k - 1]), idOf(l.pts[k])];
      if (a === b) continue;
      const d = dist(pts[a], pts[b]);
      next[a].push([b, d, li]);
      next[b].push([a, d, li]);
    }
  });
  let end = -1;
  let endD = ON_TRAIL;
  pts.forEach((p, k) => {
    const d = dist(p, to);
    if (d < endD) [end, endD] = [k, d];
  });
  if (end < 0) return null;

  // how far along the paths every point is from there (Dijkstra; there are
  // few enough points to look for the nearest each time)
  const far = new Float64Array(pts.length).fill(Infinity);
  const back = new Int32Array(pts.length).fill(-1);
  const via = new Int32Array(pts.length).fill(-1);
  const done = new Uint8Array(pts.length);
  far[end] = 0;
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
  // the nearest point, along the paths, that is at a road
  const atRoad = (p) => roads.some((r) => r.some((q, k) => k > 0 && segDist(p, r[k - 1], q) < AT_ROAD));
  let start = -1;
  for (let k = 0; k < pts.length; k++) if (far[k] < Infinity && (start < 0 || far[k] < far[start]) && atRoad(pts[k])) start = k;
  if (start < 0 || start === end) return null;

  const walk = [];
  const names = new Map(); // name -> metres of the walk on a path of that name
  for (let k = start; k >= 0; k = back[k]) {
    walk.push(pts[k]);
    if (back[k] >= 0) {
      const name = lines[via[k]].name;
      names.set(name, (names.get(name) || 0) + dist(pts[k], pts[back[k]]));
    }
  }
  // called after the named path most of it is on
  const name = [...names].filter(([n]) => n).sort((a, b) => b[1] - a[1])[0];
  let k = 1;
  while (k < walk.length - 1 && dist(walk[k], walk[0]) < 4) k++;
  const yaw = Math.atan2(walk[k][0] - walk[0][0], walk[k][1] - walk[0][1]);
  return { name: name ? name[0] : '', pts: walk, length: lengthOf(walk), yaw };
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
function preview(H, n, cellM, lakeCells, lines, route, runs = []) {
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
      const c = lakeCells[k] ? [50, 90, 150] : [90 + 120 * t, 120 + 70 * t, 70 + 60 * t].map((v) => v * shade);
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
  for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) rgb.set([255, 255, 255], ((half + b) * n + half + a) * 3);
  return { width: n, height: n, rgb };
}
