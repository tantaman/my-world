// From a photo's position, the real land around it and OpenStreetMap's trails
// and lakes, to a hike the game can set into the forest (see
// src/world/landform.js for what a hike holds).
//
// Pure: elevation comes in as a function and OpenStreetMap as parsed data, so
// this can be tested without the network.

import { localFrame } from './geo.js';
import { packHeights, packShore } from '../../src/world/landform.js';

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
// Lakes stop this far (game m) inside the real land, so they never reach
// the forest's edge.
const LAKE_INSET = 25;
// and trails this far
const TRAIL_INSET = 12;
// what is kept of a trail's line: no point off it by more than this (game m)
const SIMPLIFY = 0.25;

//   photo      { lat, lon, bearing, hour } (readPhoto())
//   elevation  (lat, lon) -> metres above sea level
//   trails     [{ name, points: [[lat, lon], ...] }]   (osm.js)
//   waters     [{ name, rings: [[[lat, lon], ...]] }]
// → { def, preview: { width, height, rgb } }
export function buildHike({ id, name, photo, elevation, trails = [], waters = [], at = [0, 0], ...opt }) {
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
        } else if (v < 3) E[k] = Math.max(E[k], level + 0.5);
      }
    }
    lakes.push({ name: w.name, levelReal: level, box: [i0, j0, bw, bh], d });
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
  for (const t of trails) {
    let cur = [];
    const flush = () => {
      if (cur.length > 1) lines.push({ name: t.name, pts: simplify(cur, SIMPLIFY) });
      cur = [];
    };
    for (const p of t.points.map(toGame)) {
      if (inside(p[0], p[1], TRAIL_INSET)) cur.push(p);
      else flush();
    }
    flush();
  }

  // The walk: the trail the photo was taken on, from its low end.
  const view = { x: 0, z: 0, bearing: round(photo.bearing, 10), hour: round(photo.hour, 100) };
  const route = walkTo(lines, heightAt);
  const trailhead = route ? { x: route.pts[0][0], z: route.pts[0][1], yaw: route.yaw } : { x: 0, z: 0, yaw: Math.PI - ((photo.bearing || 0) * Math.PI) / 180 };

  const def = {
    id,
    name,
    at,
    scale: s,
    radius: R,
    fade: o.fade * s,
    photo: { lat: round(photo.lat, 1e6), lon: round(photo.lon, 1e6) },
    view,
    trailhead: { x: round(trailhead.x, 10), z: round(trailhead.z, 10), yaw: round(trailhead.yaw, 1000) },
    trail: route ? { name: route.name, length: Math.round(route.length), climb: Math.round(heightAt(0, 0) - heightAt(trailhead.x, trailhead.z)) } : null,
    trees: o.trees,
    lakes: lakes.map((l) => ({ name: l.name, level: round((l.levelReal - base) * s, 100), box: l.box, shore: packShore(l.d) })),
    paths: lines.map((l) => l.pts.flatMap(([x, z]) => [round(x, 10), round(z, 10)])),
    ground: { n, cell, heights: packHeights(H, n) },
  };
  return { def, preview: preview(H, n, cell, lakeCells, lines, route) };
}

// A hike as it's kept (see src/world/landforms.js): its card, small, listed in
// src/world/hikes.js and always loaded; and its land, in a file of its own,
// fetched the first time it's needed. { ...card, ...land } is the hike again.
export const LAND_PARTS = ['ground', 'lakes', 'paths'];
export function splitHike(def) {
  const card = {};
  const land = {};
  for (const [k, v] of Object.entries(def)) (LAND_PARTS.includes(k) ? land : card)[k] = v;
  // the card keeps the lakes' names, for the list of hikes
  card.lakes = (def.lakes || []).map((l) => ({ name: l.name }));
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

// The trail nearest the photo, joined end to end with the rest of the trail
// of the same name, from its lower end to the point nearest the photo.
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

// ── A picture of it ──────────────────────────────────────────────────────────
// Hillshade, lakes, trails, the walk (red) and where the photo was taken.
function preview(H, n, cellM, lakeCells, lines, route) {
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
  for (const l of lines) plot(l.pts, [235, 225, 170]);
  if (route) plot(route.pts, [230, 50, 40]);
  for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) rgb.set([255, 255, 255], ((half + b) * n + half + a) * 3);
  return { width: n, height: n, rgb };
}
