#!/usr/bin/env node
// Brings the Washington Metro into the game, under and over the city as it
// really runs, life size (src/metro/README.md): all six lines, both tracks of
// each, where each runs in a tunnel, on a viaduct or on the ground, every
// station on them that's in life-size Washington, its platforms, and the
// District's own survey of their entrances.
//
//   npm run metro
//   npm run metro -- --wells   only turn the entrances' wells clear of the city (metro/wells.js), in the metro.js there is: nothing fetched
//
// Writes src/metro/metro.js (the lines and the stations: what the map and
// your pack know of it from anywhere) and src/metro/system.js (fetched when
// you come near: the tracks, their heights, the platforms, the services and
// where each stops). Run it again to bring them up to date.
//
// Where the trains run is OpenStreetMap's (ODbL): each service is a route
// relation of the track it runs on, one for each way it goes, and the map
// says of each stretch whether it's in a tunnel (and how deep, by its layer),
// on a bridge, or neither. The entrances are the District's (Open Data DC,
// "Metro Station Entrances (Regional)", CC BY 4.0).
//
// How high the rail runs isn't on any map. It's worked out here
// (metro/profile.js) from the ground the city stands on: as deep as the map's
// layer says in a tunnel, with earth over the tube; up on a viaduct; on its
// ballast on the ground; never climbing more than 4 %; level along every
// platform. The game adds the land's own height (its offset) to it.
//
// Downloads are kept in node_modules/.cache/metro.

import fs from 'node:fs';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseOsm, mergeOsm } from './hike/osm.js';
import { localFrame } from './hike/geo.js';
import { solveProfile, smooth, fall, GRADE } from './metro/profile.js';
import { HIKES } from '../src/world/hikes.js';
import { loadHike } from '../src/world/landforms.js';
import { growWorld } from '../src/world/lands.js';
import { PLATFORM_HALF, EDGE, TUBE } from '../src/metro/network.js';
import { cityPlan, placeWell } from './metro/wells.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'node_modules/.cache/metro');
const OUT = path.join(ROOT, 'src/metro');
const AGENT = 'my-world metro importer (a three.js game; occasional one-off imports)';
const PLACE = 'washington-dc';
const OSM = 'https://api.openstreetmap.org/api/0.6';
const GIS = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_Rail_Bus_WebMercator/MapServer';

// Each line's route master: every service it runs, each way.
const LINES = [
  { id: 'red', name: 'Red Line', master: 7919630 },
  { id: 'orange', name: 'Orange Line', master: 7919601 },
  { id: 'blue', name: 'Blue Line', master: 7919758 },
  { id: 'silver', name: 'Silver Line', master: 7919737 },
  { id: 'green', name: 'Green Line', master: 7919786 },
  { id: 'yellow', name: 'Yellow Line', master: 7572167 },
];

// m: points of track no further apart than this
const DENSE = 12;
// m from the middle of the city that the track is kept to: the life-size
// land, and a little into where it fades into the 1 : 5 world (past it,
// the ground isn't the city's alone)
const REACH = 11700;
// m: a station is kept if its stop is within this: on the life-size land
const STATION_REACH = 11600;
// m the rail runs under the ground in a tunnel, by the map's layer there
const DEPTH = { '-1': 12, '-2': 17, '-3': 25 };
const DEPTH_DEFAULT = 14;
// m of earth over a tunnel's tube, at the most, and how quickly it's had in
// from a portal (m of cover for each m in)
const COVER = { most: 3, per: 0.08 };
// m: the rail over the ground on its ballast; a viaduct's rail over what's
// under it, at the least, and as it would like to be
const BALLAST = 0.45;
const DECK_CLEAR = 1.6;
const AERIAL = 7.5;
const OVER_WATER = 5;
// m across the track the ground is looked at, either side
const SIDE = 2.4;
// m between rails, a level's above another's where they cross
const BETWEEN_LEVELS = 10;
// m: an entrance is a station's if it's this near it (else it's matched by name)
const ENTRANCE_NEAR = 450;

const card = HIKES.find((h) => h.id === PLACE);
if (!card) {
  console.error(`There's no real place called ${PLACE} for the Metro to run under: import Washington's ground first (see src/washington/README.md).`);
  process.exit(1);
}
const frame = localFrame(card.middle.lat, card.middle.lon);
const toGame = (lat, lon) => {
  const [e, n] = frame.toEN(lat, lon);
  return [e * card.scale, -n * card.scale];
};
const fromMiddle = (x, z) => Math.hypot(x, z);

// src/metro/metro.js: the lines and the stations, what the map and your pack know of it from anywhere.
function writeMetro(metro) {
  fs.writeFileSync(
    path.join(OUT, 'metro.js'),
    `// The Washington Metro: its lines, and its stations in life-size Washington, each with its entrances (game m from the middle of its real place, ${PLACE} in src/world/hikes.js), what the map and your pack know of it from anywhere. Written by \`npm run metro\` (tools/metro.mjs).\n// The entrances: Open Data DC (DC GIS), CC BY 4.0. The rest: © OpenStreetMap contributors, ODbL.\n\nexport const METRO = ${JSON.stringify(metro)};\n`,
  );
}
// An entrance as metro.js keeps it: [x, z, yaw, the street it comes up on].
function entranceOut(e) {
  return [Math.round(e.x * 10) / 10 + 0, Math.round(e.z * 10) / 10 + 0, Math.round(e.yaw * 1000) / 1000 + 0, e.street];
}
// Each entrance of a station under the street turned (and moved, if it must
// be) so its well lies clear of the city's buildings, streets and trees. In
// place: { x, z, yaw } each.
async function turnWells(stations) {
  const city = await cityPlan(path.join(ROOT, 'src/washington/tiles'));
  let moved = 0;
  for (const st of stations) {
    if (!st.under) continue;
    const taken = [];
    for (const e of st.entrances) {
      const w = placeWell(e, city, taken);
      taken.push(w);
      if (Math.hypot(w.x - e.x, w.z - e.z) > 0.05 || Math.abs(w.yaw - e.yaw) > 0.01) moved++;
      Object.assign(e, { x: w.x, z: w.z, yaw: w.yaw });
    }
    process.stdout.write('.');
  }
  return moved;
}
if (process.argv.includes('--wells')) {
  const { METRO } = await import('../src/metro/metro.js');
  const stations = METRO.stations.map((st) => ({ under: st.kind === 'underground', entrances: st.entrances.map(([x, z, yaw, street]) => ({ x, z, yaw, street })) }));
  const moved = await turnWells(stations);
  writeMetro({ ...METRO, stations: METRO.stations.map((st, k) => ({ ...st, entrances: stations[k].entrances.map(entranceOut) })) });
  console.log(`\n${moved} entrances turned clear of the city → src/metro/metro.js`);
  process.exit(0);
}

// ── Fetching, kept ───────────────────────────────────────────────────────────
fs.mkdirSync(CACHE, { recursive: true });
async function cached(name, url) {
  const file = path.join(CACHE, name);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': AGENT } });
      if (res.status !== 200) throw Object.assign(new Error(`${res.status} from ${url}`), { status: res.status });
      const text = await res.text();
      fs.writeFileSync(file, text);
      return text;
    } catch (err) {
      const busy = !err.status || err.status === 429 || err.status >= 500;
      if (!busy || attempt >= 6) throw err;
      await new Promise((r) => setTimeout(r, 3000 * 2 ** attempt));
    }
  }
}

// Every service of every line: its route relation, whole.
const services = [];
const parts = [];
for (const line of LINES) {
  const master = parseOsm(await cached(`master-${line.master}.xml`, `${OSM}/relation/${line.master}`));
  const m = master.relations.find((r) => r.id === String(line.master));
  for (const member of m.members.filter((x) => x.type === 'relation')) {
    const osm = parseOsm(await cached(`route-${member.ref}.xml`, `${OSM}/relation/${member.ref}/full`));
    parts.push(osm);
    services.push({ line, id: member.ref, rel: osm.relations.find((r) => r.id === member.ref) });
  }
  process.stdout.write('.');
}
const osm = mergeOsm(parts);
const gisQuery = (layer, fields) => `${GIS}/${layer}/query?${new URLSearchParams({ where: '1=1', outFields: fields, returnGeometry: 'true', outSR: '4326', f: 'json' })}`;
const gisStations = JSON.parse(await cached('stations.json', gisQuery(51, 'NAME,LINE,GIS_ID'))).features;
const gisEntrances = JSON.parse(await cached('entrances.json', gisQuery(111, 'NAME,LINE,EXIT_TO_ST,GIS_ID'))).features;
console.log(` ${services.length} services, ${osm.ways.size} ways, ${gisStations.length} stations and ${gisEntrances.length} entrances in the District's survey`);

// ── The ground ───────────────────────────────────────────────────────────────
// Grown as a world grows it, the zoo laid over the city: the ground (the
// bed, under water) and the top of whatever's there (the water's surface,
// over a river), both over the land's own base, as the game's heights are.
const zooCard = HIKES.find((h) => h.id === 'national-zoo');
const defs = await Promise.all([loadHike(card), ...(zooCard ? [loadHike(zooCard)] : [])]);
const gen = growWorld(20261119, [], 1, defs);
const land = gen.landforms.find((L) => L.id === PLACE);
const bed = (x, z) => gen.height(card.at[0] + x, card.at[1] + z) - land.offset;
const top = (x, z) => Math.max(bed(x, z), land.raw(card.at[0] + x, card.at[1] + z));
const wet = (x, z) => top(x, z) - bed(x, z) > 0.5;

// ── Each service's track, in order ───────────────────────────────────────────
// The ways a route relation runs on, joined end to end, as the nodes it
// passes; and the kind of each stretch between two of them.
function kindOf(tags) {
  if (tags.tunnel && tags.tunnel !== 'no') return { kind: 'tunnel', layer: Number(tags.layer) || -1 };
  if (tags.bridge && tags.bridge !== 'no') return { kind: 'bridge', layer: Number(tags.layer) || 1 };
  return { kind: 'ground', layer: 0 };
}
function joinWays(rel) {
  const ways = rel.members.filter((m) => m.type === 'way' && m.role === '').map((m) => osm.ways.get(m.ref)).filter(Boolean);
  const nodes = [];
  const kinds = []; // of the stretch after each node
  let gaps = 0;
  for (let k = 0; k < ways.length; k++) {
    let refs = ways[k].refs;
    if (!nodes.length) {
      // the first goes whichever way meets the second
      const next = ways[k + 1]?.refs;
      if (next && (refs[0] === next[0] || refs[0] === next[next.length - 1])) refs = [...refs].reverse();
    } else {
      const last = nodes[nodes.length - 1];
      if (refs[refs.length - 1] === last) refs = [...refs].reverse();
      else if (refs[0] !== last) {
        // not joined on the map: whichever end is nearer
        const p = osm.nodes.get(last);
        const d = (r) => Math.hypot(osm.nodes.get(r)[0] - p[0], osm.nodes.get(r)[1] - p[1]);
        if (d(refs[refs.length - 1]) < d(refs[0])) refs = [...refs].reverse();
        gaps++;
      }
    }
    const kind = kindOf(ways[k].tags);
    for (let i = 0; i < refs.length; i++) {
      if (nodes.length && refs[i] === nodes[nodes.length - 1]) continue;
      if (nodes.length) kinds[nodes.length - 1] = kind;
      nodes.push(refs[i]);
    }
  }
  kinds[nodes.length - 1] = kinds[nodes.length - 2];
  return { nodes, kinds, gaps };
}

// ── The graph of every track ─────────────────────────────────────────────────
// A point for each node of the map's that's in reach, and more between them
// where they're far apart (named by the stretch they're on, whichever way
// it's gone, so every service on it finds the same ones), and where a track
// leaves the life-size land.
const points = []; // { key, x, z, kind, layer }
const byKey = new Map();
function point(key, x, z) {
  let i = byKey.get(key);
  if (i === undefined) {
    i = points.length;
    byKey.set(key, i);
    points.push({ key, x, z, kind: null, layer: 0 });
  }
  return i;
}
const at = (ref) => toGame(...osm.nodes.get(ref));
// A service's points, in order, within reach: the longest run of them, cut
// where it leaves. Also how far the service runs before and after it (m).
function trackOf(s) {
  const { nodes, kinds, gaps } = joinWays(s.rel);
  const pos = nodes.map(at);
  const run = []; // [{ i: point, kind }]
  const runs = [];
  let total = 0;
  const lens = [0];
  for (let k = 1; k < nodes.length; k++) {
    total += Math.hypot(pos[k][0] - pos[k - 1][0], pos[k][1] - pos[k - 1][1]);
    lens.push(total);
  }
  let cur = null;
  for (let k = 0; k < nodes.length; k++) {
    const inside = fromMiddle(...pos[k]) < REACH;
    const prevInside = k > 0 && fromMiddle(...pos[k - 1]) < REACH;
    if (k > 0 && inside !== prevInside) {
      // where it crosses the edge
      const [a, b] = [pos[k - 1], pos[k]];
      let lo = 0;
      let hi = 1;
      for (let it = 0; it < 30; it++) {
        const m = (lo + hi) / 2;
        const inM = fromMiddle(a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m) < REACH;
        if (inM === prevInside) lo = m;
        else hi = m;
      }
      const t = (lo + hi) / 2;
      const [na, nb] = [nodes[k - 1], nodes[k]];
      const key = na < nb ? `${na}~${nb}@edge` : `${nb}~${na}@edge`;
      const e = point(key, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      const s0 = lens[k - 1] + (lens[k] - lens[k - 1]) * t;
      if (prevInside) {
        cur.push({ i: e, kind: kinds[k - 1], s: s0 });
        runs.push(cur);
        cur = null;
      } else cur = [{ i: e, kind: kinds[k - 1], s: s0 }];
    }
    if (inside) {
      if (!cur) cur = [];
      cur.push({ i: point(nodes[k], ...pos[k]), kind: kinds[k], s: lens[k], ref: nodes[k] });
    }
  }
  if (cur) runs.push(cur);
  if (!runs.length) return null;
  const best = runs.reduce((a, b) => (b[b.length - 1].s - b[0].s > a[a.length - 1].s - a[0].s ? b : a));
  const along = best[0].s;
  // densified between, the same points whichever way it's gone
  const out = [];
  for (let k = 0; k < best.length; k++) {
    out.push(best[k]);
    if (k + 1 === best.length) break;
    const [a, b] = [points[best[k].i], points[best[k + 1].i]];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.ceil(d / DENSE);
    const forward = a.key < b.key;
    for (let j = 1; j < n; j++) {
      const t = j / n;
      const jj = forward ? j : n - j;
      const key = forward ? `${a.key}~${b.key}#${jj}/${n}` : `${b.key}~${a.key}#${jj}/${n}`;
      out.push({ i: point(key, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t), kind: best[k].kind });
    }
  }
  for (const o of out) {
    const p = points[o.i];
    // (a point between a tunnel and a bridge is the tunnel's: it has to be under)
    if (!p.kind || o.kind.kind === 'tunnel') {
      p.kind = o.kind.kind;
      p.layer = o.kind.layer;
    }
  }
  return { list: out, before: along, after: total - best[best.length - 1].s, gaps, nodes };
}
for (const s of services) {
  s.track = trackOf(s);
  if (s.track?.gaps) console.log(`  note: ${s.rel.tags.name}: ${s.track.gaps} ways not joined on the map`);
}
const running = services.filter((s) => s.track && s.track.list.length > 1);
// A service that starts or ends at a station here (Mount Vernon Square) has
// its train stand along the whole of the platform, so its track goes on past
// its stop, as far as another service that runs on through shares it.
const EXTEND = 240; // m
for (const s of running) {
  for (const end of ['start', 'end']) {
    const L = s.track.list;
    if ((end === 'start' ? s.track.before : s.track.after) > 50) continue;
    const at = end === 'start' ? L[0].i : L[L.length - 1].i;
    const next = end === 'start' ? L[1].i : L[L.length - 2].i;
    for (const t of running) {
      if (t === s) continue;
      const T = t.track.list;
      const m = T.findIndex((o) => o.i === at);
      if (m < 0) continue;
      // (which way along t is away from s's track)
      const step = T[m + 1]?.i === next ? -1 : T[m - 1]?.i === next ? 1 : 0;
      if (!step) continue;
      const more = [];
      let len = 0;
      for (let k = m + step; k >= 0 && k < T.length && len < EXTEND; k += step) {
        const a = points[T[k - step].i];
        const b = points[T[k].i];
        len += Math.hypot(b.x - a.x, b.z - a.z);
        more.push(T[k]);
      }
      if (!more.length) continue;
      s.track.list = end === 'start' ? [...more.reverse(), ...L] : [...L, ...more];
      break;
    }
  }
}

// neighbours along the track
const adj = points.map(() => []);
const edges = new Set();
for (const s of running) {
  const L = s.track.list;
  for (let k = 1; k < L.length; k++) {
    const [a, b] = [L[k - 1].i, L[k].i];
    if (a === b) continue;
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (edges.has(key)) continue;
    edges.add(key);
    const d = Math.hypot(points[a].x - points[b].x, points[a].z - points[b].z);
    adj[a].push([b, d]);
    adj[b].push([a, d]);
  }
}
console.log(`track: ${points.length} points, ${(([...edges].reduce((s, e) => { const [a, b] = e.split(',').map(Number); return s + Math.hypot(points[a].x - points[b].x, points[a].z - points[b].z); }, 0)) / 1000).toFixed(1)} km`);

// ── Room between the tracks ──────────────────────────────────────────────────
// The map often draws two tracks side by side nearer than they can be: a car
// is 3.1 m wide, and from one track's middle to the next is never less than
// TRACKS_APART, or two trains passing would run into each other. Where
// they're nearer, each is moved off the other by half of what's wanting,
// held for a little way along and eased off past that, so that a track
// bends out to its place as smoothly as the map's own curves. (Two tracks
// coming together at a switch are each other's near along the track, and
// are left to meet.)
const TRACKS_APART = 4.1; // m, middle to middle
const SAME_TRACK = 90; // m: points this near along the track are on one track, or either side of a switch
const PUSH_HOLD = 25; // m a push is held for along the track, either way
const PUSH_EASE = 70; // m it's eased off over, past that
{
  // the points within r m along the track of point i: Map(point -> m)
  const along = (i, r) => {
    const got = new Map([[i, 0]]);
    const queue = [i];
    while (queue.length) {
      const a = queue.shift();
      const da = got.get(a);
      for (const [b, d] of adj[a]) {
        const db = da + d;
        if (db > r || (got.has(b) && got.get(b) <= db)) continue;
        got.set(b, db);
        queue.push(b);
      }
    }
    return got;
  };
  // the way each point's track runs
  const dir = points.map((p, i) => {
    const nb = adj[i];
    if (!nb.length) return null;
    const a = points[nb[0][0]];
    const b = nb.length > 1 ? points[nb[1][0]] : p;
    const [dx, dz] = nb.length > 1 ? [b.x - a.x, b.z - a.z] : [p.x - a.x, p.z - a.z];
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  });
  const CELL = 8;
  const grid = new Map();
  points.forEach((p, i) => {
    const k = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  // what each point wants: off the nearest track beside it, by half the shortfall
  const push = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const d = dir[i];
    if (!d || !p.kind) continue;
    const [nx, nz] = [-d[1], d[0]];
    let same = null;
    let want = 0;
    let way = 0;
    for (let gi = -1; gi <= 1; gi++) {
      for (let gj = -1; gj <= 1; gj++) {
        for (const j of grid.get(`${Math.floor(p.x / CELL) + gi},${Math.floor(p.z / CELL) + gj}`) || []) {
          const q = points[j];
          const e = dir[j];
          if (j === i || !e || q.layer !== p.layer || Math.abs(d[0] * e[0] + d[1] * e[1]) < 0.97) continue;
          const c = (q.x - p.x) * nx + (q.z - p.z) * nz;
          if (Math.abs(c) >= TRACKS_APART || Math.abs((q.x - p.x) * d[0] + (q.z - p.z) * d[1]) > 8) continue;
          if (!same) same = along(i, SAME_TRACK);
          if (same.has(j)) continue;
          const short = (TRACKS_APART - Math.abs(c)) / 2;
          if (short > want) [want, way] = [short, c > 0 ? -1 : 1];
        }
      }
    }
    if (want > 0) push.push({ i, x: nx * way * want, z: nz * way * want, m: want });
  }
  // held and eased along the track: each point moved as the strongest push near it says
  const moved = new Map(); // point -> [x, z, how much]
  for (const { i, x, z, m } of push) {
    for (const [j, g] of along(i, PUSH_HOLD + PUSH_EASE)) {
      const u = Math.max(0, (g - PUSH_HOLD) / PUSH_EASE);
      const k = 1 - u * u * (3 - 2 * u);
      const was = moved.get(j);
      if (!was || m * k > was[2]) moved.set(j, [x * k, z * k, m * k]);
    }
  }
  for (const [j, [x, z]] of moved) {
    points[j].x += x;
    points[j].z += z;
  }
  for (let a = 0; a < points.length; a++) for (const e of adj[a]) e[1] = Math.hypot(points[a].x - points[e[0]].x, points[a].z - points[e[0]].z);
  console.log(`tracks set apart: ${push.length} points nearer than ${TRACKS_APART} m to the track beside them, ${moved.size} moved`);
}

// ── The stations ─────────────────────────────────────────────────────────────
// Each service's stops, onto its own track, gathered into levels: one
// station's tracks that run alongside each other (where lines cross, a level
// for each; where a station's two tracks are one over the other, as at
// Rosslyn, a level for each of those too). A level's platforms are the
// map's, set beside its tracks.
const gisName = (f) => f.attributes.NAME;
const gisAt = (f) => toGame(f.geometry.y, f.geometry.x);
// the District's survey shortens some: WMATA's own names
const STATION_NAMES = {
  'Gallery Pl-Chinatown': 'Gallery Place–Chinatown',
  'Mt Vernon Sq 7th St-Convention Center': 'Mt Vernon Sq/7th St–Convention Center',
  'U Street/African-Amer Civil War Memorial/Cardozo': 'U Street/African-Amer Civil War Memorial/Cardozo',
  'McPherson Sq': 'McPherson Square',
  'Federal Center SW': 'Federal Center SW',
  'Potomac Ave': 'Potomac Avenue',
  'Minnesota Ave': 'Minnesota Avenue',
  'Eisenhower Ave': 'Eisenhower Avenue',
  'Rhode Island Ave-Brentwood': 'Rhode Island Avenue',
  'Georgia Ave-Petworth': 'Georgia Avenue–Petworth',
  'King St-Old Town': 'King Street–Old Town',
};
const nameOf = (f) => STATION_NAMES[gisName(f)] || gisName(f).replace(/-/g, '–');
const slug = (s) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const gisNear = (x, z, r = 500) => {
  let best = null;
  let bd = Infinity;
  for (const f of gisStations) {
    const [gx, gz] = gisAt(f);
    const d = Math.hypot(gx - x, gz - z);
    if (d < bd) [best, bd] = [f, d];
  }
  return bd < r ? best : null;
};
// Where (x, z) is along a service's track, nearest: m from its start, the way
// it runs there, and which of its stretches.
function onTrack(list, x, z) {
  let best = null;
  let s = 0;
  for (let k = 1; k < list.length; k++) {
    const a = points[list[k - 1].i];
    const b = points[list[k].i];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const l2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2));
    const d = Math.hypot(a.x + ex * t - x, a.z + ez * t - z);
    const len = Math.sqrt(l2);
    if (!best || d < best.d) best = { d, s: s + len * t, dx: ex / len, dz: ez / len, x: a.x + ex * t, z: a.z + ez * t, k: k - 1, t };
    s += len;
  }
  return best;
}
// across: m out from a level's middle line (+ to the right, going along it);
// along: m along it from its middle
const across = (L, x, z) => (x - L.x) * -L.dz + (z - L.z) * L.dx;
const alongOf = (L, x, z) => (x - L.x) * L.dx + (z - L.z) * L.dz;
// Where a track crosses the level's line through its middle, square across it.
function crossing(L, list) {
  for (let k = 1; k < list.length; k++) {
    const a = points[list[k - 1].i];
    const b = points[list[k].i];
    const ua = alongOf(L, a.x, a.z);
    const ub = alongOf(L, b.x, b.z);
    if ((ua <= 0 && ub > 0) || (ua >= 0 && ub < 0)) {
      const t = ua / (ua - ub);
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      if (Math.abs(across(L, x, z)) > 17 || Math.abs(((b.x - a.x) * L.dx + (b.z - a.z) * L.dz) / len) < 0.8) continue;
      return { off: across(L, x, z), kind: t < 0.5 ? a.kind : b.kind, layer: t < 0.5 ? a.layer : b.layer };
    }
  }
  // (or it ends along the platform: a service that ends here, short of the middle)
  for (const k of [0, list.length - 1]) {
    const p = points[list[k].i];
    const q = points[list[k === 0 ? 1 : k - 1].i];
    const len = Math.hypot(p.x - q.x, p.z - q.z) || 1;
    if (Math.abs(alongOf(L, p.x, p.z)) < PLATFORM_HALF && Math.abs(across(L, p.x, p.z)) < 17 && Math.abs(((p.x - q.x) * L.dx + (p.z - q.z) * L.dz) / len) > 0.8) {
      return { off: across(L, p.x, p.z), kind: p.kind, layer: p.layer };
    }
  }
  return null;
}

// the stops, gathered by station and the way they run
const groups = [];
for (const s of running) {
  s.stops = [];
  for (const m of s.rel.members.filter((m) => m.type === 'node' && m.role.startsWith('stop'))) {
    const ll = osm.nodes.get(m.ref);
    if (!ll) continue;
    const [x, z] = toGame(...ll);
    if (fromMiddle(x, z) > STATION_REACH) continue;
    const g = gisNear(x, z);
    if (!g) {
      console.log(`  note: no station in the District's survey near the stop at ${ll}`);
      continue;
    }
    const o = onTrack(s.track.list, x, z);
    if (!o || o.d > 25) {
      console.log(`  note: ${s.rel.tags.name}: the stop at ${nameOf(g)} isn't on its track (${o ? o.d.toFixed(0) : '?'} m off)`);
      continue;
    }
    let grp = groups.find((G) => G.gis === g && Math.abs(G.dx * o.dx + G.dz * o.dz) > 0.8);
    if (!grp) groups.push((grp = { gis: g, dx: o.dx, dz: o.dz, stops: [] }));
    grp.stops.push({ service: s, x: o.x, z: o.z, dx: o.dx, dz: o.dz });
  }
}
// what the map says of the platforms near a group: how far along and across each runs
function platformsNear(L, services) {
  const seen = new Set();
  const out = [];
  for (const s of services) {
    for (const m of s.rel.members.filter((m) => m.type === 'way' && m.role.startsWith('platform'))) {
      if (seen.has(m.ref)) continue;
      seen.add(m.ref);
      const w = osm.ways.get(m.ref);
      if (!w) continue;
      const pts = w.refs.map(at);
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
      const cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      if (Math.hypot(cx - L.x, cz - L.z) > 170) continue;
      const acr = pts.map((p) => across(L, p[0], p[1]));
      const alo = pts.map((p) => alongOf(L, p[0], p[1]));
      const [a0, a1] = [Math.min(...alo), Math.max(...alo)];
      if (a1 - a0 < 60) continue; // (not one that runs this way)
      out.push({ a0, a1, c0: Math.min(...acr), c1: Math.max(...acr), mid: across(L, cx, cz), layer: Number(w.tags.layer) || 0 });
    }
  }
  return out;
}
const levels = [];
for (const grp of groups) {
  // its line: the way its stops run, through where they are
  let [x, z, dx, dz] = [0, 0, 0, 0];
  for (const st of grp.stops) {
    x += st.x / grp.stops.length;
    z += st.z / grp.stops.length;
    const sign = st.dx * grp.dx + st.dz * grp.dz < 0 ? -1 : 1;
    dx += st.dx * sign;
    dz += st.dz * sign;
  }
  const l = Math.hypot(dx, dz);
  const L0 = { x, z, dx: dx / l, dz: dz / l };
  const services = [...new Set(grp.stops.map((st) => st.service))];
  // its middle: the middle of its platforms (a stop is often where a train's front stands)
  const plats = platformsNear(L0, services);
  if (plats.length) {
    const a = (Math.min(...plats.map((p) => p.a0)) + Math.max(...plats.map((p) => p.a1))) / 2;
    L0.x += L0.dx * a;
    L0.z += L0.dz * a;
  }
  // the tracks through it: where each service's crosses its middle (any of
  // the lines that stop here: a stop the map leaves out is still a stop)
  const tracks = [];
  const lines = new Set(services.map((s) => s.line));
  for (const s of running.filter((s) => lines.has(s.line))) {
    const c = crossing(L0, s.track.list);
    if (!c) continue;
    let t = tracks.find((t) => Math.abs(t.off - c.off) < 1 && t.layer === c.layer);
    if (!t) tracks.push((t = { ...c, services: [] }));
    t.services.push(s);
  }
  if (!tracks.length) continue;
  // one over another: a level each
  const stacked = tracks.some((a) => tracks.some((b) => a !== b && a.layer !== b.layer && Math.abs(a.off - b.off) < 2.5));
  const sets = stacked ? [...new Set(tracks.map((t) => t.layer))].map((layer) => tracks.filter((t) => t.layer === layer)) : [tracks];
  for (const set of sets) {
    const L = { gis: grp.gis, name: nameOf(grp.gis), ...L0, stacked };
    set.sort((a, b) => a.off - b.off);
    L.tracks = set.map((t) => t.off);
    L.services = set.flatMap((t) => t.services);
    L.lines = [...new Set(L.services.map((s) => s.line.id))];
    // what it's in: what most of its tracks are in at its middle; how deep: the shallowest of their layers
    const kinds = set.map((t) => t.kind);
    L.kind = kinds.includes('tunnel') ? 'tunnel' : kinds.includes('bridge') ? 'bridge' : 'ground';
    L.layer = Math.max(...set.map((t) => t.layer));
    // its platforms: each of the map's, beside or between its tracks
    const mine = platformsNear(L, L.services).filter((p) => !stacked || !p.layer || p.layer === L.layer);
    const tr = L.tracks;
    const sides = [];
    const put = (c0, c1, a0, a1) => {
      if (c1 - c0 < 1.5) return;
      if (!sides.some((p) => Math.abs(p.c0 - c0) < 1 && Math.abs(p.c1 - c1) < 1)) sides.push({ c0, c1, a0, a1 });
    };
    const span = (p) => [Math.max(p.a0, -PLATFORM_HALF - 12), Math.min(p.a1, PLATFORM_HALF + 12)];
    for (const p of mine) {
      const wide = Math.max(3.5, Math.min(7, p.c1 - p.c0));
      const left = tr.filter((t) => t < p.mid);
      const right = tr.filter((t) => t > p.mid);
      if (left.length && right.length) put(Math.max(...left) + EDGE, Math.min(...right) - EDGE, ...span(p));
      else if (right.length) put(Math.min(...right) - EDGE - wide, Math.min(...right) - EDGE, ...span(p));
      else put(Math.max(...left) + EDGE, Math.max(...left) + EDGE + wide, ...span(p));
    }
    if (!sides.length) {
      const [a0, a1] = [-PLATFORM_HALF, PLATFORM_HALF];
      if (tr.length === 2 && tr[1] - tr[0] > 7.5) put(tr[0] + EDGE, tr[1] - EDGE, a0, a1);
      else {
        put(tr[0] - EDGE - 4.5, tr[0] - EDGE, a0, a1);
        if (tr.length > 1 || !stacked) put(tr[tr.length - 1] + EDGE, tr[tr.length - 1] + EDGE + 4.5, a0, a1);
      }
    }
    L.platforms = sides.sort((a, b) => a.c0 - b.c0);
    L.a0 = Math.min(...sides.map((p) => p.a0));
    L.a1 = Math.max(...sides.map((p) => p.a1));
    levels.push(L);
  }
}
// A platform is straight, and the track beside it runs straight along it, at
// the same distance from its edge all the way (the map's track wanders by a
// metre or two): each point of a level's tracks along its platforms is put
// on its track's line, and those a little way past either end eased onto it.
const STRAIGHT_EASE = 35; // m past a platform's end
for (const L of levels) {
  const moved = new Set();
  for (const s of L.services) {
    for (const o of s.track.list) {
      if (moved.has(o.i)) continue;
      const p = points[o.i];
      const a = alongOf(L, p.x, p.z);
      const past = Math.max(L.a0 - a, a - L.a1, 0);
      if (past > STRAIGHT_EASE) continue;
      const c = across(L, p.x, p.z);
      const t = L.tracks.reduce((m, v) => (Math.abs(v - c) < Math.abs(m - c) ? v : m));
      if (Math.abs(t - c) > 4) continue;
      const k = 1 - (past / STRAIGHT_EASE) ** 2 * (3 - 2 * (past / STRAIGHT_EASE));
      const shift = (t - c) * k;
      p.x += -L.dz * shift;
      p.z += L.dx * shift;
      moved.add(o.i);
    }
  }
}
// the points of the track along each level's platforms: level
for (const L of levels) {
  L.points = new Set();
  for (const s of L.services) {
    for (const o of s.track.list) {
      const p = points[o.i];
      const a = alongOf(L, p.x, p.z);
      const c = across(L, p.x, p.z);
      if (a > L.a0 - 4 && a < L.a1 + 4 && L.tracks.some((t) => Math.abs(c - t) < 2.5)) L.points.add(o.i);
    }
  }
}
// and each service's stops: the levels it stands at, in order
for (const s of running) {
  s.stops = [];
  for (const L of levels) {
    if (!L.services.includes(s)) continue;
    const mid = onTrack(s.track.list, L.x, L.z);
    s.stops.push({ level: L, s: mid.s });
  }
  s.stops.sort((a, b) => a.s - b.s);
}
console.log(`${levels.length} station levels at ${new Set(levels.map((L) => L.gis)).size} stations`);

// ── How high the rails run ───────────────────────────────────────────────────
const n = points.length;
const G = new Float64Array(n); // the ground (the bed, under water)
const T = new Float64Array(n); // the top of what's there (a river's surface)
const SIDES = new Float64Array(n); // the highest of the ground either side
for (let i = 0; i < n; i++) {
  const p = points[i];
  G[i] = bed(p.x, p.z);
  T[i] = top(p.x, p.z);
  const nb = adj[i];
  let [dx, dz] = [1, 0];
  if (nb.length) {
    const a = points[nb[0][0]];
    const b = nb.length > 1 ? points[nb[1][0]] : p;
    [dx, dz] = [b.x - a.x, b.z - a.z];
  }
  const l = Math.hypot(dx, dz) || 1;
  const [sx, sz] = [-dz / l, dx / l];
  SIDES[i] = Math.max(G[i], bed(p.x + sx * SIDE, p.z + sz * SIDE), bed(p.x - sx * SIDE, p.z - sz * SIDE));
}
// how far each point is from the nearest stretch of tunnel, along the track;
// and inside one, how far in from a portal
const fromTunnel = fall(adj, points.map((p) => (p.kind === 'tunnel' ? 0 : Infinity)), 1);
const intoTunnel = fall(adj, points.map((p) => (p.kind === 'tunnel' ? Infinity : 0)), 1);
const Gs = smooth(adj, G, 30);
const f = new Array(n).fill(-Infinity);
const c = new Array(n).fill(Infinity);
const w = new Array(n).fill(0);
// (what the rail climbs out of a tunnel by: the tube's height, and its ballast)
const OUT_OF = TUBE.top + BALLAST + 0.3;
for (let i = 0; i < n; i++) {
  const p = points[i];
  if (p.kind === 'tunnel') {
    c[i] = G[i] - TUBE.top - Math.min(COVER.most, COVER.per * intoTunnel[i]);
    w[i] = Gs[i] - (DEPTH[p.layer] ?? DEPTH_DEFAULT);
    continue;
  }
  // near a portal, the track comes up out of the ground in a cutting
  const sunk = Math.max(0, OUT_OF - GRADE * 0.92 * fromTunnel[i]);
  if (p.kind === 'bridge') {
    f[i] = (wet(p.x, p.z) ? T[i] + OVER_WATER : Math.max(SIDES[i], T[i]) + DECK_CLEAR) - sunk;
    w[i] = Math.max(f[i], Gs[i] + AERIAL);
  } else {
    f[i] = SIDES[i] + BALLAST - sunk;
    w[i] = f[i];
  }
}
// As high as the tunnels let it be anywhere (the tunnels have to stay under).
const hi0 = fall(adj, c);
// Each level's height, the rail's along its platforms. Under the ground, as
// deep as its layer says under its middle, and under its vault the earth a
// tunnel would have; on a viaduct, up; on the ground, on it.
for (const L of levels) {
  const pts = [...L.points];
  const own = pts.filter((i) => points[i].kind === L.kind);
  const g0 = bed(L.x, L.z);
  const most = (list, of) => Math.max(...list.map((i) => of[i]));
  const least = (list, of) => Math.min(...list.map((i) => of[i]));
  if (L.kind === 'tunnel') L.rail = Math.min(g0 - (DEPTH[L.layer] ?? DEPTH_DEFAULT), least(pts, G) - TUBE.vault - 1);
  else if (L.kind === 'bridge') L.rail = Math.max(g0 + AERIAL, most(own.length ? own : pts, SIDES) + DECK_CLEAR);
  else L.rail = (own.length ? own : pts).reduce((s, i) => s + G[i], 0) / (own.length || pts.length) + BALLAST;
  L.rail = Math.min(L.rail, least(pts, hi0));
}
// Where a station's levels cross, the lower goes down until they're
// BETWEEN_LEVELS apart; which is over which is the map's layer, or, where
// it says the same, as it really is. One over the other along the same way
// (Rosslyn, the Pentagon): a tube's height apart.
const UPPER = { 'Gallery Place–Chinatown': 'red', "L'Enfant Plaza": 'green', 'Metro Center': 'red', 'Fort Totten': 'red' };
for (let pass = 0; pass < 3; pass++) {
  for (const A of levels) {
    for (const B of levels) {
      if (A === B || A.gis !== B.gis || (A.kind !== 'tunnel' && B.kind !== 'tunnel')) continue;
      const up = UPPER[A.name];
      const aUp = up ? A.lines.includes(up) && !B.lines.includes(up) : A.layer > B.layer || (A.layer === B.layer && A.rail > B.rail);
      if (!aUp) continue;
      const gap = A.stacked && B.stacked ? TUBE.top + 2 : BETWEEN_LEVELS;
      if (A.rail - B.rail < gap) B.rail = A.rail - gap;
    }
  }
}
const pinned = new Array(n).fill(false);
for (const L of levels) {
  for (const i of L.points) {
    f[i] = c[i] = w[i] = L.rail;
    pinned[i] = true;
  }
}
const { h, conflicts } = solveProfile(adj, { f, c, w, pinned });
if (conflicts.length) {
  const where = [...new Set(conflicts.map((i) => { const p = points[i]; const g = gisNear(p.x, p.z, 1500); return g ? nameOf(g) : `${Math.round(p.x)}, ${Math.round(p.z)}`; }))];
  console.log(`  note: ${conflicts.length} points where the ground and the grade can't both be had (near ${where.slice(0, 10).join('; ')})`);
}
let steepest = 0;
let buried = 0;
let exposed = 0;
for (const e of edges) {
  const [a, b] = e.split(',').map(Number);
  const d = Math.hypot(points[a].x - points[b].x, points[a].z - points[b].z);
  if (d > 3) steepest = Math.max(steepest, Math.abs(h[a] - h[b]) / d);
}
for (let i = 0; i < n; i++) {
  if (points[i].kind === 'tunnel' && h[i] + TUBE.top > G[i] + 0.05) exposed++;
  if (points[i].kind !== 'tunnel' && h[i] < G[i] - 1 && fromTunnel[i] > 200) buried++;
}
console.log(`rails: the steepest ${(steepest * 100).toFixed(1)} % · ${exposed} points of tunnel out of the ground · ${buried} of track under it, away from a portal`);

// ── The tracks, once each ────────────────────────────────────────────────────
// The graph cut into runs between where tracks meet or end: each drawn once,
// whichever services run on it.
const degree = adj.map((a) => a.length);
const chains = [];
const edgeChain = new Map(); // "a,b" (in order) -> [chain, index of a in it, of b]
const ek = (a, b) => `${a},${b}`;
for (let i = 0; i < n; i++) {
  if (degree[i] === 2 || degree[i] === 0) continue;
  for (const [j] of adj[i]) {
    if (edgeChain.has(ek(i, j))) continue;
    const list = [i, j];
    let [prev, cur] = [i, j];
    while (degree[cur] === 2) {
      const next = adj[cur][0][0] === prev ? adj[cur][1][0] : adj[cur][0][0];
      list.push(next);
      [prev, cur] = [cur, next];
    }
    const k = chains.length;
    chains.push(list);
    for (let m = 1; m < list.length; m++) {
      edgeChain.set(ek(list[m - 1], list[m]), [k, m - 1, m]);
      edgeChain.set(ek(list[m], list[m - 1]), [k, m, m - 1]);
    }
  }
}
// each service as the runs it goes along, and which way
for (const s of running) {
  const L = s.track.list;
  s.path = [];
  for (let k = 1; k < L.length; k++) {
    const e = edgeChain.get(ek(L[k - 1].i, L[k].i));
    if (!e) continue;
    const last = s.path[s.path.length - 1];
    if (last && last[0] === e[0] && last[2] === e[1]) last[2] = e[2];
    else s.path.push([...e]);
  }
}

// ── The entrances ────────────────────────────────────────────────────────────
// The District's survey of them, each a station's: by its name, or else the
// nearest. Each faces the way down at first: towards the nearest of its platforms.
const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const stationsByGis = new Map();
for (const L of levels) {
  if (!stationsByGis.has(L.gis)) stationsByGis.set(L.gis, { gis: L.gis, name: L.name, id: slug(L.name), levels: [], entrances: [] });
  stationsByGis.get(L.gis).levels.push(L);
}
const stations = [...stationsByGis.values()];
for (const e of gisEntrances) {
  const [x, z] = gisAt(e);
  if (fromMiddle(x, z) > REACH) continue;
  const key = norm(e.attributes.NAME || '');
  let st = stations.find((s) => norm(gisName(s.gis)) === key && Math.hypot(gisAt(s.gis)[0] - x, gisAt(s.gis)[1] - z) < 1500);
  if (!st) {
    let bd = ENTRANCE_NEAR;
    for (const s of stations) {
      const [sx, sz] = gisAt(s.gis);
      const d = Math.hypot(sx - x, sz - z);
      if (d < bd) [bd, st] = [d, s];
    }
  }
  if (!st) continue;
  let to = st.levels[0];
  for (const L of st.levels) if (Math.hypot(L.x - x, L.z - z) < Math.hypot(to.x - x, to.z - z)) to = L;
  const street = (e.attributes.EXIT_TO_ST || '').trim().toLowerCase().replace(/\s+/g, ' ');
  st.entrances.push({ x, z, yaw: Math.atan2(to.x - x, to.z - z), street });
}
for (const st of stations) {
  if (!st.entrances.length) {
    // (none surveyed: one where the District says the station is)
    const [x, z] = gisAt(st.gis);
    const L = st.levels[0];
    st.entrances.push({ x, z, yaw: Math.atan2(L.x - x, L.z - z), street: '' });
    console.log(`  note: no entrance surveyed for ${st.name}: one where the station is`);
  }
}
// …and then turned, under the street, so its well is on the sidewalk and not
// in the building beside it or out in the road
for (const st of stations) st.under = st.levels.some((L) => L.kind === 'tunnel');
console.log(`  ${await turnWells(stations)} entrances turned clear of the city`);

// ── Writing it ───────────────────────────────────────────────────────────────
const r1 = (v) => Math.round(v * 10) / 10 + 0;
const r2 = (v) => Math.round(v * 100) / 100 + 0;
const KIND = { tunnel: 0, bridge: 1, ground: 2 };
const lineIds = LINES.map((l) => l.id);
const levelIndex = new Map(levels.map((L, k) => [L, k]));
// which services make up each line's patterns of service: one each way
const patterns = [];
for (const s of running) {
  if (!s.stops.length || s.paired) continue;
  const back = running.find((t) => t !== s && !t.paired && t.line === s.line && t.rel.tags.from === s.rel.tags.to && t.rel.tags.to === s.rel.tags.from);
  if (!back || !back.stops.length) {
    console.log(`  note: ${s.rel.tags.name} has no service back the other way: left out`);
    continue;
  }
  s.paired = back.paired = true;
  patterns.push([s, back]);
}
const serviceOut = (s) => ({
  from: s.rel.tags.from,
  to: s.rel.tags.to,
  path: s.path,
  stops: s.stops.map((st) => [levelIndex.get(st.level), r1(st.s)]),
  before: Math.round(s.track.before),
  after: Math.round(s.track.after),
});
const system = {
  place: PLACE,
  tracks: chains.map((list) => ({
    pts: list.flatMap((i) => [r1(points[i].x), r1(points[i].z), r2(h[i])]),
    kinds: list.slice(0, -1).map((i, k) => {
      const a = points[i].kind;
      const b = points[list[k + 1]].kind;
      return KIND[a === 'tunnel' || b === 'tunnel' ? 'tunnel' : a === 'bridge' && b === 'bridge' ? 'bridge' : a === 'bridge' || b === 'bridge' ? 'bridge' : 'ground'];
    }),
  })),
  patterns: patterns.map(([a, b]) => ({ line: lineIds.indexOf(a.line.id), ways: [serviceOut(a), serviceOut(b)] })),
  levels: levels.map((L) => ({
    station: stations.findIndex((s) => s.levels.includes(L)),
    kind: KIND[L.kind],
    x: r1(L.x),
    z: r1(L.z),
    dx: Math.round(L.dx * 1e5) / 1e5,
    dz: Math.round(L.dz * 1e5) / 1e5,
    rail: r2(L.rail),
    a: [r1(L.a0), r1(L.a1)],
    tracks: L.tracks.map(r1),
    platforms: L.platforms.map((p) => [r1(p.c0), r1(p.c1), r1(p.a0), r1(p.a1)]),
    lines: L.lines.map((id) => lineIds.indexOf(id)),
  })),
};
const text = JSON.stringify(system);
const packed = deflateRawSync(Buffer.from(text), { level: 9 }).toString('base64');
fs.writeFileSync(
  path.join(OUT, 'system.js'),
  `// The Metro's tracks, how high each runs, its stations' levels and platforms, and its services: written by \`npm run metro\` (tools/metro.mjs), read by src/metro/network.js.\n// The track and the stations: © OpenStreetMap contributors, ODbL.\nexport default '${packed}';\n`,
);
const metro = {
  place: PLACE,
  lines: LINES.map((l) => ({ id: l.id, name: l.name, colour: (running.find((s) => s.line === l)?.rel.tags.colour || '#888888').toLowerCase() })),
  stations: stations.map((st) => ({
    id: st.id,
    name: st.name,
    lines: [...new Set(st.levels.flatMap((L) => L.lines))].sort((a, b) => lineIds.indexOf(a) - lineIds.indexOf(b)),
    kind: st.levels.some((L) => L.kind === 'tunnel') ? 'underground' : st.levels.some((L) => L.kind === 'bridge') ? 'elevated' : 'at grade',
    entrances: st.entrances.map(entranceOut),
  })),
};
writeMetro(metro);
console.log(`\nthe Metro → src/metro/system.js (${Math.round(packed.length / 1024)} kB, fetched when you come near) and src/metro/metro.js`);
console.log(`  ${chains.length} runs of track, ${patterns.length} services each way, ${levels.length} levels at ${stations.length} stations, ${stations.reduce((s, st) => s + st.entrances.length, 0)} entrances`);

// ── Diagnostics ──────────────────────────────────────────────────────────────
if (process.argv.includes('--levels')) {
  for (const L of [...levels].sort((a, b) => fromMiddle(a.x, a.z) - fromMiddle(b.x, b.z))) {
    console.log(`  ${L.name.slice(0, 34).padEnd(34)} ${L.kind.padEnd(6)} ${String(L.layer).padStart(2)} rail ${(L.rail - bed(L.x, L.z)).toFixed(1).padStart(6)} · tracks ${L.tracks.map((o) => o.toFixed(1)).join(' ').padEnd(10)} · platforms ${L.platforms.map((p) => `${p.c0.toFixed(1)}..${p.c1.toFixed(1)}`).join(' ').padEnd(22)} ${L.lines.join('/')}`);
  }
}
