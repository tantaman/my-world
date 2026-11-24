#!/usr/bin/env node
// Brings a real zoo into the game: its buildings, exhibits, walls, paths and
// what stands along them, from OpenStreetMap and the city's survey of its
// roofs, laid out on the real place it's in (src/world/hikes.js: the zoo's
// ground, imported life size by `npm run hike`).
//
//   npm run zoo
//
// Writes src/zoo/plan.js, what the zoo is built from (fetched in the game
// when you first come near it), and src/zoo/exhibits.js, the few hundred
// bytes the map knows it by from anywhere. Re-run it to bring them up to
// date with the map; the zoo stays where its ground is.
//
// The Smithsonian's National Zoological Park, in Rock Creek Park in
// Washington, DC, is the one there is. Its buildings are Open Data DC's
// "Buildings (Detailed Roof)" (DC GIS, CC BY 4.0): every roof in the city,
// traced from lidar, each slope of it with its real height at each corner.
// The rest is © OpenStreetMap contributors, under the ODbL.
//
// Downloads are kept in node_modules/.cache/zoo.

import fs from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseOsm } from './hike/osm.js';
import { localFrame } from './hike/geo.js';
import { decodePatches, buildPlan } from './zoo/plan.js';
import { HIKES } from '../src/world/hikes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'node_modules/.cache/zoo');
const OUT = path.join(ROOT, 'src/zoo');
const AGENT = 'my-world zoo importer (a three.js game; occasional one-off imports)';

// The zoo, and the real place its ground is (its card in src/world/hikes.js).
const ZOO = {
  hike: 'national-zoo',
  name: 'National Zoo',
  // where to fetch, real degrees: round the zoo, a little past its fence
  box: { west: -77.0575, south: 38.9225, east: -77.0420, north: 38.9345 },
};
// The city's survey of its roofs: an ArcGIS layer, asked a page at a time.
const ROOFS = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Facility_and_Structure/MapServer/13/query';
const PAGE = 1000;

fs.mkdirSync(CACHE, { recursive: true });
async function cached(name, url, text = true) {
  const file = path.join(CACHE, name);
  if (fs.existsSync(file)) return fs.readFileSync(file, text ? 'utf8' : undefined);
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': AGENT } });
      if (res.status !== 200) throw Object.assign(new Error(`${res.status} from ${url}`), { status: res.status });
      const body = text ? await res.text() : Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(file, body);
      return body;
    } catch (err) {
      const busy = !err.status || err.status === 429 || err.status >= 500;
      if (!busy || attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

const card = HIKES.find((h) => h.id === ZOO.hike);
if (!card) {
  console.error(`There's no real place called ${ZOO.hike} for the zoo to stand on: import its ground first (npm run hike; see src/zoo/README.md).`);
  process.exit(1);
}
const mid = card.middle || card.photo;
const frame = localFrame(mid.lat, mid.lon);
const toGame = (lat, lon, h = card.base) => {
  const [e, n] = frame.toEN(lat, lon);
  return [e * card.scale, -n * card.scale, (h - card.base) * card.scale];
};

const { west, south, east, north } = ZOO.box;
process.stdout.write('OpenStreetMap: ');
const osm = parseOsm(await cached(`osm-${west},${south},${east},${north}.xml`, `https://api.openstreetmap.org/api/0.6/map?bbox=${west},${south},${east},${north}`));
console.log(`${osm.ways.size} ways, ${osm.relations.length} relations`);

process.stdout.write('the roofs: ');
const roofs = [];
for (let offset = 0; ; offset += PAGE) {
  const q = new URLSearchParams({ geometry: `${west},${south},${east},${north}`, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'ROOF_TYPE,HOUSE_HEIGHT,ALTITUDE_MAX', returnGeometry: 'true', outSR: '4326', resultOffset: String(offset), resultRecordCount: String(PAGE), orderByFields: 'OBJECTID', f: 'json' });
  const page = JSON.parse(await cached(`roofs-${west},${south},${east},${north}-${offset}.json`, `${ROOFS}?${q}`));
  if (page.error) throw new Error(`the roofs: ${page.error.message}`);
  for (const f of page.features) roofs.push({ attrs: f.attributes, parts: decodePatches(f.geometry.binaryPatches, inflateSync).parts });
  if (!page.exceededTransferLimit) break;
}
console.log(`${roofs.length} buildings round it`);

const plan = buildPlan({ osm, roofs, toGame });
const exhibits = plan.exhibits.filter((e) => e.name && e.view).map((e) => ({ id: e.id, name: e.name, x: e.view[0], z: e.view[1], yaw: e.view[2] }));

fs.mkdirSync(OUT, { recursive: true });
const planText = `// What the ${ZOO.name} is built from, as \`npm run zoo\` (tools/zoo.mjs) brought
// it in: fetched in the game the first time you come near it. Its parts are
// said at the top of tools/zoo/plan.js. Re-import it rather than edit it here.
//
// Buildings: Open Data DC, "Buildings (Detailed Roof)" (DC GIS), CC BY 4.0.
// Everything else: © OpenStreetMap contributors, under the ODbL.

export default ${JSON.stringify({ hike: ZOO.hike, ...plan })};
`;
fs.writeFileSync(path.join(OUT, 'plan.js'), planText);
const exhibitsText = `// The ${ZOO.name}'s exhibits, by name and where each is seen from (game
// metres from the middle of its real place, ${ZOO.hike} in src/world/hikes.js,
// on the nearest path, and which way it is from there): what the map knows
// of it from anywhere. Written by \`npm run zoo\` with plan.js, which
// has the rest. © OpenStreetMap contributors, under the ODbL.

export const ZOO = ${JSON.stringify({ hike: ZOO.hike, name: ZOO.name, exhibits })};
`;
fs.writeFileSync(path.join(OUT, 'exhibits.js'), exhibitsText);

const kb = (s) => `${Math.round(s.length / 1024)} kB`;
console.log(`\n${ZOO.name} → src/zoo/plan.js (${kb(planText)}, fetched when it's needed) and src/zoo/exhibits.js (${kb(exhibitsText)})`);
console.log(`  ${plan.buildings.length} buildings (${plan.buildings.filter((b) => !b.h).length} with their surveyed roofs): ${plan.buildings.filter((b) => b.name).map((b) => b.name).join(', ')}`);
console.log(`  ${plan.exhibits.length} exhibits (${exhibits.length} named), ${plan.barriers.length} walls and fences, ${plan.paths.length} paths, ${plan.areas.length} plazas, ${plan.points.length} things along them`);
