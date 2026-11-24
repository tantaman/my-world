// The plan of a zoo, from OpenStreetMap and a city's survey of its roofs.
// Pure: hand it what was fetched (tools/zoo.mjs fetches it), and it hands
// back the plan the game builds the zoo from (src/zoo/).
//
// The buildings are the city's: Washington, DC flew its whole area with
// lidar and traced every roof in it, each slope and flat of it as a polygon
// with its real height at every corner (Open Data DC's "Buildings (Detailed
// Roof)"). So a building is as big as it is, as tall as it is, with the roof
// it really has: the Reptile Discovery Center's pitched roofs, the vaults of
// the Elephant Community Center. Its walls are the edges of its roof (those
// that only one roof face has) dropped to the ground, and the steps between
// one roof and a lower one beside it. What each is called is from
// OpenStreetMap, whose footprint the roof stands over; one the city hasn't
// surveyed (newer than its flight) is OpenStreetMap's footprint, raised as
// high as it says or as a building of its kind is.
//
// The rest is OpenStreetMap's: the zoo's outline, its exhibits and the
// animals in them, the walls and fences, the paths and plazas, and the
// cafés, statues and signs along them.
//
// Everything is in game metres round the zoo's real place (its card in
// src/world/hikes.js): x east and z south of its middle, at its scale. A
// height (y) is a real height above the card's `base` at its scale: the
// game stands it on the land as it stands the land (y + the land's offset).
//
// The plan:
//   outline    [[x, z], ...]: the zoo's boundary
//   buildings  [{ name, kind, roof, faces, walls, h? }]: faces, each
//              [outer, ...holes], a ring of [x, z, y] each; walls, each
//              [ax, az, aTop, bx, bz, bTop, aBottom, bBottom] (a bottom of
//              null is the ground). A building OpenStreetMap alone has (`h`
//              set: its height over the ground) has one flat face at y 0,
//              stood on the ground under it by the game
//   exhibits   [{ id, name, species, area, at, barrier, view }]: area, a
//              ring of [x, z], or null where the map has only a point (at);
//              view, [x, z, yaw]: the nearest spot on a path out of doors,
//              and the way to look from there
//   barriers   [{ kind, pts: [x, z, ...], h }]
//   paths      [{ kind, name, width, surface, pts: [x, z, ...], bridge }]
//   areas      [{ kind, surface, rings }]: paved plazas, rings of [x, z]
//   points     [{ kind, name, x, z }]

import { joinRings } from '../hike/osm.js';
import { area, inside, centroid, edgeDistance } from '../../src/zoo/shapes.js';

export { area, inside, centroid, edgeDistance };

const r2 = (v) => Math.round(v * 100) / 100;

// ── The roofs ───────────────────────────────────────────────────────────────
// Esri's multipatch, as its REST API hands it over compressed
// ("binaryPatches"): a little header (its type, how big it is whole and
// packed), then zlib, then the shape: its type, its box, how many parts and
// points, where each part starts and what kind it is, the points (x, y), the
// range of z and every z. Parts are rings (an outer one, then the holes in
// it), or triangles in a strip, a fan or a list.
//   b64: the text; inflate: zlib's (node:zlib's inflateSync)
// → { box: [x0, y0, x1, y1], parts: [{ type, pts: [[lon, lat, z], ...] }] }
export const PART = { strip: 0, fan: 1, outer: 2, inner: 3, first: 4, ring: 5, triangles: 6 };
export function decodePatches(b64, inflate) {
  const raw = Buffer.from(b64, 'base64');
  const packed = raw.readUInt32LE(8);
  const buf = inflate(raw.subarray(12, 12 + packed));
  let o = 0;
  const i32 = () => ((o += 4), buf.readInt32LE(o - 4));
  const f64 = () => ((o += 8), buf.readDoubleLE(o - 8));
  i32(); // the shape's type
  const box = [f64(), f64(), f64(), f64()];
  const nParts = i32();
  const nPts = i32();
  const starts = Array.from({ length: nParts }, i32);
  const types = Array.from({ length: nParts }, i32);
  const xy = Array.from({ length: nPts }, () => [f64(), f64()]);
  f64(); // z range
  f64();
  const z = Array.from({ length: nPts }, f64);
  const parts = starts.map((s, k) => {
    const e = k + 1 < nParts ? starts[k + 1] : nPts;
    const pts = [];
    for (let i = s; i < e; i++) pts.push([xy[i][0], xy[i][1], z[i]]);
    return { type: types[k], pts };
  });
  return { box, parts };
}

// A roof's faces, each [outer, ...holes] (rings of [x, z, y], unclosed), from
// its parts. toGame: [lon, lat, z] → [x, z, y].
export function roofFaces(parts, toGame) {
  const faces = [];
  const ring = (pts) => {
    const r = pts.map(toGame);
    const [a, b] = [r[0], r[r.length - 1]];
    if (r.length > 1 && Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) r.pop();
    return r;
  };
  for (const p of parts) {
    if (p.type === PART.inner && faces.length) faces[faces.length - 1].push(ring(p.pts));
    else if (p.type === PART.outer || p.type === PART.first || p.type === PART.ring) faces.push([ring(p.pts)]);
    else {
      const t = p.pts.map(toGame);
      if (p.type === PART.triangles) for (let i = 0; i + 2 < t.length; i += 3) faces.push([[t[i], t[i + 1], t[i + 2]]]);
      else if (p.type === PART.strip) for (let i = 0; i + 2 < t.length; i++) faces.push([[t[i], t[i + 1], t[i + 2]]]);
      else if (p.type === PART.fan) for (let i = 1; i + 1 < t.length; i++) faces.push([[t[0], t[i], t[i + 1]]]);
    }
  }
  // (a face seen edge on, as a wall is, covers nothing in plan: walls are
  // made from the edges of the roof)
  return faces.filter((f) => Math.abs(area(f[0])) > 0.05);
}

// The walls under a roof: each edge that only one of its faces has, from the
// roof down to the ground, and where two faces meet at different heights (a
// roof over a lower one), the step between them. → [ax, az, aTop, bx, bz,
// bTop, aBottom, bBottom], a bottom of null being the ground.
export function roofWalls(faces) {
  const Q = 0.15; // m: corners nearer than this are the same corner
  const key = (p) => `${Math.round(p[0] / Q)},${Math.round(p[1] / Q)}`;
  const edges = new Map();
  for (const face of faces) {
    for (const r of face) {
      for (let i = 0; i < r.length; i++) {
        const a = r[i];
        const b = r[(i + 1) % r.length];
        const [ka, kb] = [key(a), key(b)];
        if (ka === kb) continue;
        const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        // each kept running the same way, so their ends line up
        const e = ka < kb ? [a, b] : [b, a];
        if (!edges.has(k)) edges.set(k, []);
        edges.get(k).push(e);
      }
    }
  }
  const walls = [];
  const STEP = 0.3; // m: a smaller step between two faces is no wall
  for (const list of edges.values()) {
    if (list.length === 1) {
      const [a, b] = list[0];
      walls.push([r2(a[0]), r2(a[1]), r2(a[2]), r2(b[0]), r2(b[1]), r2(b[2]), null, null]);
      continue;
    }
    const tops = [Math.max(...list.map((e) => e[0][2])), Math.max(...list.map((e) => e[1][2]))];
    const lows = [Math.min(...list.map((e) => e[0][2])), Math.min(...list.map((e) => e[1][2]))];
    if (tops[0] - lows[0] < STEP && tops[1] - lows[1] < STEP) continue;
    const [a, b] = list[0];
    walls.push([r2(a[0]), r2(a[1]), r2(tops[0]), r2(b[0]), r2(b[1]), r2(tops[1]), r2(lows[0]), r2(lows[1])]);
  }
  return walls;
}

// ── From OpenStreetMap ──────────────────────────────────────────────────────
const unclosed = (r) => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r);
// The outer rings of a way or a multipolygon, as [lat, lon] (unclosed), or [].
function ringsOf(osm, it) {
  const at = (refs) => unclosed(refs.map((r) => osm.nodes.get(r)).filter(Boolean));
  if (it.refs) return it.refs.length > 3 && it.refs[0] === it.refs[it.refs.length - 1] ? [at(it.refs)] : [];
  const parts = it.members.filter((m) => m.type === 'way' && m.role !== 'inner').map((m) => osm.ways.get(m.ref));
  if (!parts.length || parts.some((p) => !p)) return [];
  return joinRings(parts.map((p) => p.refs)).map(at);
}

// What makes something an exhibit of animals, and the names of what lives in it.
const isExhibit = (t) => t.attraction === 'animal' || t.zoo === 'enclosure' || (t.tourism === 'attraction' && (t['species:en'] || t.species || t['species:wikidata']));
const speciesOf = (t) => t['species:en'] || t.species || t['taxon:en'] || t.name || '';
// Paths and how wide each kind is (m), where the map doesn't say.
const PATHS = { footway: 3, path: 2, pedestrian: 5, steps: 2.4, cycleway: 3, service: 4.5, track: 3, bridleway: 3, living_street: 5, unclassified: 6, corridor: 2 };
// …and the paths whose names say how wide they are
const NAMED_WIDTH = { 'Olmsted Walk': 6 };
// Barriers, and how high each kind stands (m), where the map doesn't say.
const BARRIERS = { wall: 1.2, fence: 1.8, retaining_wall: 1, hedge: 1.4, guard_rail: 0.9, handrail: 1, city_wall: 3 };
// The kinds of point kept, by the tag that says so.
const POINTS = {
  amenity: ['cafe', 'fast_food', 'restaurant', 'ice_cream', 'toilets', 'drinking_water', 'bench', 'vending_machine', 'atm', 'shelter', 'theatre', 'cinema', 'police', 'first_aid', 'bus_station', 'waste_basket'],
  tourism: ['artwork', 'information', 'viewpoint', 'picnic_site'],
  leisure: ['playground', 'picnic_table'],
};
// How high a building OpenStreetMap alone has stands (m): a storey of a zoo's
// building, and what's over it, where the map says nothing of its levels.
const STOREY = 3.4;
const SHELTER = 3.6; // m: a roof on posts (building=roof)

// osm: parseOsm's; roofs: [{ attrs, parts }] (decodePatches' parts, and the
// survey's own fields); toGame: (lat, lon, height?) → [x, z, y].
export function buildPlan({ osm, roofs, toGame }) {
  const g2 = ([lat, lon]) => {
    const [x, z] = toGame(lat, lon, 0);
    return [r2(x), r2(z)];
  };
  // the zoo itself
  const zooIt = osm.relations.find((r) => r.tags.tourism === 'zoo') || [...osm.ways.values()].find((w) => w.tags.tourism === 'zoo');
  if (!zooIt) throw new Error('no zoo (tourism=zoo) in what was fetched');
  const outline = ringsOf(osm, zooIt).map((r) => r.map(g2)).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))[0];
  const MARGIN = 8; // m past the outline that still counts as the zoo's
  const inZoo = (x, z) => inside(outline, x, z) || edgeDistance(outline, x, z) < MARGIN;
  const partIn = (pts) => pts.some(([x, z]) => inZoo(x, z));

  // ── Buildings ────────────────────────────────────────────────────────────
  // OpenStreetMap's, for their names and for those the survey hasn't.
  const named = [];
  for (const it of [...osm.ways.values(), ...osm.relations]) {
    if (!it.tags.building) continue;
    for (const r of ringsOf(osm, it)) {
      const ring = r.map(g2);
      if (ring.length < 3 || !partIn(ring)) continue;
      named.push({ ring, tags: it.tags, area: Math.abs(area(ring)), used: false });
    }
  }
  const buildings = [];
  for (const roof of roofs) {
    const faces = roofFaces(roof.parts, ([lon, lat, h]) => {
      const [x, z, y] = toGame(lat, lon, h);
      return [r2(x), r2(z), r2(y)];
    });
    if (!faces.length) continue;
    const all = faces.flatMap((f) => f[0]);
    const [cx, cz] = centroid(all);
    if (!inZoo(cx, cz)) continue;
    // the building whose footprint it stands over: the smallest that has it
    const over = named.filter((n) => inside(n.ring, cx, cz) || all.filter(([x, z]) => inside(n.ring, x, z)).length > all.length / 2).sort((a, b) => a.area - b.area)[0];
    if (over) over.used = true;
    buildings.push({ name: (over && over.tags.name) || '', kind: (over && over.tags.building) || 'yes', roof: (roof.attrs.ROOF_TYPE || 'Default').toLowerCase(), faces, walls: roofWalls(faces) });
  }
  // and those it hasn't surveyed: the footprint, raised
  for (const n of named) {
    if (n.used) continue;
    const [cx, cz] = centroid(n.ring);
    if (!inZoo(cx, cz)) continue;
    if (buildings.some((b) => b.faces.some((f) => inside(f[0], cx, cz)))) continue;
    const t = n.tags;
    const open = t.building === 'roof';
    const h = Number.parseFloat(t.height) || (Number.parseFloat(t['building:levels']) ? Number.parseFloat(t['building:levels']) * STOREY + 1 : open ? SHELTER : n.area > 400 ? STOREY * 2 : STOREY + 0.6);
    const ring = area(n.ring) < 0 ? n.ring.slice().reverse() : n.ring;
    const face = [ring.map(([x, z]) => [x, z, 0])];
    buildings.push({ name: t.name || '', kind: t.building, roof: 'flat', faces: [face], walls: open ? [] : roofWalls([face]), h: r2(h), ...(open ? { open: true } : {}) });
  }

  // ── Exhibits ─────────────────────────────────────────────────────────────
  const areasOf = [];
  const pointsOf = [];
  for (const it of [...osm.ways.values(), ...osm.relations]) {
    if (!isExhibit(it.tags)) continue;
    for (const r of ringsOf(osm, it)) {
      const ring = r.map(g2);
      if (ring.length >= 3 && partIn(ring)) areasOf.push({ it, ring });
    }
  }
  for (const [id, t] of osm.tagged) {
    if (!isExhibit(t)) continue;
    const [x, z] = g2(osm.nodes.get(id));
    if (inZoo(x, z)) pointsOf.push({ id, t, x, z });
  }
  const exhibits = [];
  const ids = new Set();
  const idFor = (name, fallback) => {
    let base = (name || fallback).toLowerCase().normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-') || fallback;
    let id = base;
    for (let k = 2; ids.has(id); k++) id = `${base}-${k}`;
    ids.add(id);
    return id;
  };
  // an area with a name of its own, or named by a point in it
  const claimed = new Set();
  for (const a of areasOf) {
    const t = a.it.tags;
    let name = t.name || '';
    let species = name ? speciesOf(t) : '';
    if (!name) {
      const p = pointsOf.find((q) => q.t.name && !claimed.has(q) && inside(a.ring, q.x, q.z));
      if (p) {
        claimed.add(p);
        name = p.t.name;
        species = speciesOf(p.t);
      }
    }
    exhibits.push({ id: idFor(name, `enclosure-${a.it.id}`), name, species, area: a.ring, at: centroid(a.ring).map(r2), barrier: t.barrier || null });
  }
  for (const p of pointsOf) {
    if (claimed.has(p) || !p.t.name) continue;
    // (a named area it's in already says what lives there)
    if (exhibits.some((e) => e.area && e.name && inside(e.area, p.x, p.z) && speciesOf(p.t).toLowerCase() === e.species.toLowerCase())) continue;
    exhibits.push({ id: idFor(p.t.name, `exhibit-${p.id}`), name: p.t.name, species: speciesOf(p.t), area: null, at: [p.x, p.z], barrier: null });
  }

  // ── Walls and fences ────────────────────────────────────────────────────
  const barriers = [];
  for (const w of osm.ways.values()) {
    const kind = w.tags.barrier;
    if (!kind || !(kind in BARRIERS)) continue;
    const pts = w.refs.map((r) => osm.nodes.get(r)).filter(Boolean).map(g2);
    if (pts.length < 2 || pts.filter(([x, z]) => inZoo(x, z)).length < pts.length / 2) continue;
    barriers.push({ kind, pts: pts.flat(), h: r2(Number.parseFloat(w.tags.height) || BARRIERS[kind]) });
  }

  // ── Paths and plazas ────────────────────────────────────────────────────
  const paths = [];
  const areas = [];
  for (const it of [...osm.ways.values(), ...osm.relations]) {
    const t = it.tags;
    const kind = t.highway;
    if (!kind || !(kind in PATHS)) continue;
    const surface = t.surface || (kind === 'track' || kind === 'path' ? 'gravel' : 'asphalt');
    if (t.area === 'yes' || it.members) {
      const rings = ringsOf(osm, it).map((r) => r.map(g2)).filter((r) => r.length >= 3 && partIn(r));
      if (rings.length) areas.push({ kind, surface, rings });
      continue;
    }
    const pts = it.refs.map((r) => osm.nodes.get(r)).filter(Boolean).map(g2);
    if (pts.length < 2 || !partIn(pts)) continue;
    const width = Number.parseFloat(t.width) || NAMED_WIDTH[t.name] || PATHS[kind];
    paths.push({ kind, name: t.name || '', width: r2(width), surface, pts: pts.flat(), bridge: t.bridge === 'yes' || t.bridge === 'boardwalk' || (Number(t.layer) > 0 && t.tunnel !== 'yes') });
  }

  // ── Points along them ───────────────────────────────────────────────────
  const points = [];
  for (const [id, t] of osm.tagged) {
    let kind = null;
    for (const [k, vs] of Object.entries(POINTS)) if (vs.includes(t[k])) kind = t[k];
    if (!kind || isExhibit(t)) continue;
    const [x, z] = g2(osm.nodes.get(id));
    if (!inZoo(x, z)) continue;
    // (a waste basket the map numbers isn't named by it)
    const name = kind === 'waste_basket' || kind === 'drinking_water' ? '' : t.name || t.description || '';
    points.push({ kind, name, x, z });
  }

  // ── Where each exhibit is seen from ─────────────────────────────────────
  // The nearest spot on a path out of doors, and the way it looks from there:
  // where the map sets you down to see it.
  const underRoof = (x, z) => buildings.some((b) => b.faces.some((f) => inside(f[0], x, z)));
  const outdoors = paths.filter((p) => {
    const k = Math.floor(p.pts.length / 4) * 2;
    return !underRoof(p.pts[k], p.pts[k + 1]);
  });
  for (const e of exhibits) {
    const ring = e.area || [e.at];
    let best = { d: Infinity };
    for (const p of outdoors) {
      const P = p.pts;
      for (let k = 0; k + 3 < P.length; k += 2) {
        for (const [x, z] of ring) {
          const [ax, az, bx, bz] = [P[k], P[k + 1], P[k + 2], P[k + 3]];
          const dx = bx - ax;
          const dz = bz - az;
          const l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
          const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
          if (d < best.d) best = { d, x: ax + dx * t, z: az + dz * t };
        }
      }
    }
    if (best.d < 80) e.view = [r2(best.x), r2(best.z), r2(Math.atan2(e.at[0] - best.x, e.at[1] - best.z))];
  }

  return { outline, buildings, exhibits, barriers, paths, areas, points };
}
