// Water and woods out of the District of Columbia's own survey (Open Data DC,
// DC GIS: CC BY 4.0), for a real place in Washington brought in with
// `--map dc` in place of OpenStreetMap: one source for the whole city, as fast
// to ask for all of it as for a corner, where OpenStreetMap's API answers
// only a few hundred metres of a city at a time.
//
//   Planimetrics 2023, Waterbodies    the rivers, lakes, ponds and pools, as
//                                     surveyed from the air
//   Planimetrics 2023, Hydrography    the streams, as lines
//   Urban Tree Canopy 2020            how much of each census block is under
//                                     trees: what's woods and what's open
//
// The fetching is the importer's (it hands over a fetch that keeps what it
// got); what's here turns the answers into the shapes osm.js hands back,
// [lat, lon] everywhere, so the rest of the importer can't tell the
// difference.

const PLANIMETRICS = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Planimetrics_2023/MapServer';
const CANOPY = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Urban_Tree_Canopy/MapServer';
export const LAYERS = {
  water: `${PLANIMETRICS}/14`,
  hydro: `${PLANIMETRICS}/6`,
  canopy: `${CANOPY}/1`,
};
const PAGE = 1000;

// What water is kept, by the survey's word for it (m², the least): rivers
// and lakes all; ponds as big as a park's (not a fountain's basin on a
// plaza, which would be given a pond's banks); and pools only as big as the
// Reflecting Pools. (Its wastewater ponds are the tanks at Blue Plains:
// built, not water lying on the land.)
const KEEP = { River: 0, Lake: 0, Pond: 2500, Pool: 12000 };
// Water as low as this (real m) is the tide's: the Potomac, the Anacostia,
// the Washington Channel and the Tidal Basin are one water at one level, as
// they are, and drawn as one, so no bank stands across a river where two of
// the survey's pieces of it meet.
export const TIDE_TOP = 2.5;
// What the one tidal water is called.
export const TIDE_NAME = 'the Potomac';
// Canopy: a census block this much under trees (%) is woods (Rock Creek
// Park, Glover-Archbold, the leafiest streets); the rest of the city is open
// ground, lawns and yards with the odd tree, and its trees are the street
// trees the city planted (src/washington/).
export const WOODS = 45;
// The survey's lines simplified to this (degrees: about 2 m), asked of the
// server, so a census block's edge isn't a point every few centimetres.
const SIMPLE = 0.00002;

// The query for a page of a layer: everything in the box [west, south, east,
// north], in degrees.
export function pageUrl(layer, [w, s, e, n], offset, fields = '*') {
  const q = new URLSearchParams({
    where: '1=1',
    geometry: `${w},${s},${e},${n}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: fields,
    returnGeometry: 'true',
    outSR: '4326',
    maxAllowableOffset: String(SIMPLE),
    resultOffset: String(offset),
    resultRecordCount: String(PAGE),
    orderByFields: 'OBJECTID',
    f: 'json',
  });
  return `${LAYERS[layer]}/query?${q}`;
}

// Every feature of a layer in the box. getJson(name, url) → the answer,
// parsed (the importer's, which keeps it).
export async function features(layer, box, getJson, fields = '*') {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await getJson(`dcgis-${layer}-${box.join(',')}-${offset}.json`, pageUrl(layer, box, offset, fields));
    if (page.error) throw new Error(`DC GIS, ${layer}: ${page.error.message}`);
    out.push(...page.features);
    if (!page.exceededTransferLimit && page.features.length < PAGE) break;
  }
  return out;
}

// Esri's rings: outer ones clockwise, holes anticlockwise ([lon, lat] each).
// → { outers, holes }, [lat, lon] each, unclosed.
const signed = (r) => {
  let a = 0;
  for (let k = 0, l = r.length - 1; k < r.length; l = k++) a += (r[l][0] - r[k][0]) * (r[l][1] + r[k][1]);
  return a / 2;
};
export function ringsOf(geometry) {
  const outers = [];
  const holes = [];
  for (const r of (geometry && geometry.rings) || []) {
    const ring = r.map(([lon, lat]) => [lat, lon]);
    const [a, b] = [ring[0], ring[ring.length - 1]];
    if (ring.length > 1 && a[0] === b[0] && a[1] === b[1]) ring.pop();
    if (ring.length < 3) continue;
    // ([lon, lat] as x, y: clockwise is a negative area by this sum)
    (signed(r) < 0 ? outers : holes).push(ring);
  }
  return { outers, holes };
}

// m² inside rings of [lat, lon] (the server's own areas, asked for in
// degrees, come back 0).
function squareMetres(rings) {
  let sum = 0;
  for (const r of rings) {
    const k = 111320 * Math.cos((r[0][0] * Math.PI) / 180);
    sum += Math.abs(signed(r.map(([lat, lon]) => [lon * k, lat * 111320])));
  }
  return sum;
}

// The water, as osm.js's waters(): [{ name, rings, holes?, level? }], and the
// areas of the rivers above the tide (Rock Creek where it's wide), as its
// riverbanks(), for how wide the stream down each is.
// elevation(lat, lon) → real m: the tidal water is all that lies under
// TIDE_TOP, one water at the level most of it is at (`level`: the importer
// lays it out flat there).
export function watersOf(feats, elevation) {
  const tide = { name: TIDE_NAME, rings: [], holes: [], heights: [] };
  const out = [];
  const banks = [];
  for (const f of feats) {
    const kind = (f.attributes.DESCRIPTION || '').trim();
    if (!(kind in KEEP)) continue;
    const { outers, holes } = ringsOf(f.geometry);
    if (!outers.length || squareMetres(outers) - squareMetres(holes) < KEEP[kind]) continue;
    // how high it lies: the height most of its edge agrees on
    const hs = outers[0].filter((_, k) => k % Math.max(1, Math.floor(outers[0].length / 24)) === 0).map(([lat, lon]) => elevation(lat, lon)).filter(Number.isFinite).sort((a, b) => a - b);
    const at = hs.length ? hs[Math.floor(hs.length * 0.3)] : Infinity;
    if ((kind === 'River' || kind === 'Lake') && at < TIDE_TOP) {
      tide.rings.push(...outers);
      tide.holes.push(...holes);
      tide.heights.push(...hs);
    } else if (kind === 'River') banks.push(...outers);
    else out.push({ name: '', rings: outers, ...(holes.length ? { holes } : {}) });
  }
  if (tide.rings.length) {
    const hs = tide.heights.sort((a, b) => a - b);
    const level = Math.max(0, hs[Math.floor(hs.length * 0.3)]);
    out.unshift({ name: TIDE_NAME, rings: tide.rings, ...(tide.holes.length ? { holes: tide.holes } : {}), level });
  }
  return { waters: out, riverbanks: banks };
}

// The streams, as osm.js's streams(): [{ name, river: false, points }], each
// turned to run downhill (the survey draws them either way).
export function streamsOf(feats, elevation) {
  const out = [];
  for (const f of feats) {
    if ((f.attributes.DESCRIPTION || '').trim() !== 'Stream') continue;
    for (const p of (f.geometry && f.geometry.paths) || []) {
      const points = p.map(([lon, lat]) => [lat, lon]);
      if (points.length < 2) continue;
      const a = elevation(...points[0]);
      const b = elevation(...points[points.length - 1]);
      if (a < b) points.reverse();
      out.push({ name: '', river: false, points });
    }
  }
  return out;
}

// What covers the land, as osm.js's covers(): [{ kind, rings }], woods where
// a census block is mostly under trees and meadow everywhere else.
export function coversOf(feats) {
  const out = [];
  for (const f of feats) {
    const pct = f.attributes.TCAN_PCT ?? f.attributes.UTC_PCT;
    const kind = pct >= WOODS ? 'wood' : 'meadow';
    const { outers, holes } = ringsOf(f.geometry);
    if (outers.length) out.push({ kind, rings: [...outers, ...holes] });
  }
  return out;
}
