// Trails and water out of OpenStreetMap's XML (the /api/0.6/map answer for a
// bounding box). Pure: hand it the text.
//
// Trails are ways tagged as footpaths. Waterfalls are the points on streams
// the map marks as falls. Water is closed ways and multipolygon
// relations tagged natural=water (lakes, ponds, reservoirs); an outer ring
// made of several ways is joined end to end. The coast is ways tagged
// natural=coastline, which OpenStreetMap always draws with the land on their
// left and the sea on their right. What covers the land (woods, scrub, scree,
// bare rock, alpine tundra, glaciers) is closed ways and multipolygons too,
// holes and all.

const attr = (s, name) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(s);
  return m ? m[1].replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : null;
};
const tagsOf = (body) => {
  const t = {};
  for (const m of body.matchAll(/<tag\b([^>]*)\/>/g)) t[attr(m[1], 'k')] = attr(m[1], 'v');
  return t;
};

export function parseOsm(xml) {
  const nodes = new Map();
  const tagged = new Map(); // id -> tags, for nodes that have any
  for (const m of xml.matchAll(/<node\b([^>]*?)(\/>|>([\s\S]*?)<\/node>)/g)) {
    const id = attr(m[1], 'id');
    nodes.set(id, [Number(attr(m[1], 'lat')), Number(attr(m[1], 'lon'))]);
    if (m[3]) tagged.set(id, tagsOf(m[3]));
  }
  const ways = new Map();
  for (const m of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
    const refs = [...m[2].matchAll(/<nd ref="(\d+)"/g)].map((r) => r[1]);
    ways.set(attr(m[1], 'id'), { id: attr(m[1], 'id'), refs, tags: tagsOf(m[2]) });
  }
  const relations = [];
  for (const m of xml.matchAll(/<relation\b([^>]*)>([\s\S]*?)<\/relation>/g)) {
    const members = [...m[2].matchAll(/<member\b([^>]*)\/>/g)].map((x) => ({ type: attr(x[1], 'type'), ref: attr(x[1], 'ref'), role: attr(x[1], 'role') }));
    relations.push({ id: attr(m[1], 'id'), members, tags: tagsOf(m[2]) });
  }
  return { nodes, tagged, ways, relations };
}

// Several answers (neighbouring boxes, a relation fetched whole) as one.
export function mergeOsm(parts) {
  const out = { nodes: new Map(), tagged: new Map(), ways: new Map(), relations: [] };
  const seen = new Set();
  for (const p of parts) {
    for (const [k, v] of p.nodes) out.nodes.set(k, v);
    for (const [k, v] of p.tagged) out.tagged.set(k, v);
    for (const [k, v] of p.ways) out.ways.set(k, v);
    for (const r of p.relations) if (!seen.has(r.id) && seen.add(r.id)) out.relations.push(r);
  }
  return out;
}

// Named peaks: [{ name, lat, lon, ele }]
export function peaks(osm) {
  const out = [];
  for (const [id, t] of osm.tagged) {
    if (t.natural !== 'peak' || !t.name) continue;
    const [lat, lon] = osm.nodes.get(id);
    out.push({ name: t.name, lat, lon, ele: Number(t.ele) || null });
  }
  return out;
}

// Water and land cover relations some of whose ways weren't in the box: they
// need fetching whole.
export function incompleteWaters(osm) {
  return osm.relations.filter((r) => r.tags.type === 'multipolygon' && (isWater(r.tags) || coverOf(r.tags)) && r.members.some((m) => m.type === 'way' && !osm.ways.has(m.ref))).map((r) => r.id);
}

const FOOT = new Set(['path', 'footway', 'track', 'steps', 'bridleway']);
const coords = (osm, refs) => refs.map((r) => osm.nodes.get(r)).filter(Boolean);

// [{ name, points: [[lat, lon], ...], rope?, closed? }]: rope where the path
// has chains or a fixed rope to hold on to; closed where it isn't open to
// walkers (private, or no entry), so the walk keeps off it, though it's
// there on the ground
const CLOSED = new Set(['no', 'private']);
export function trails(osm) {
  const out = [];
  for (const w of osm.ways.values()) {
    if (!FOOT.has(w.tags.highway)) continue;
    const points = coords(osm, w.refs);
    const rope = w.tags.safety_rope === 'yes';
    const closed = CLOSED.has(w.tags.access) || CLOSED.has(w.tags.foot);
    if (points.length > 1) out.push({ name: w.tags.name || '', points, ...(rope ? { rope } : {}), ...(closed ? { closed } : {}) });
  }
  return out;
}

// Where you could leave a car: roads you can drive ([[lat, lon], ...] each),
// and the outlines of car parks.
const DRIVE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service', 'road']);
export function roads(osm) {
  const out = [];
  for (const w of osm.ways.values()) {
    if (!DRIVE.has(w.tags.highway) && w.tags.amenity !== 'parking') continue;
    const points = coords(osm, w.refs);
    if (points.length > 1) out.push(points);
  }
  return out;
}

const isWater = (t) => t.natural === 'water' && !['river', 'stream', 'canal', 'riverbank'].includes(t.water);

// [{ name, rings: [[[lat, lon], ...], ...] }] — outer rings only; islands are
// left to the elevation data, which already stands them out of the lake.
export function waters(osm) {
  const out = [];
  for (const w of osm.ways.values()) {
    if (!isWater(w.tags) || w.refs.length < 4 || w.refs[0] !== w.refs[w.refs.length - 1]) continue;
    out.push({ name: w.tags.name || '', rings: [coords(osm, w.refs)] });
  }
  for (const r of osm.relations) {
    if (r.tags.type !== 'multipolygon' || !isWater(r.tags)) continue;
    const parts = r.members.filter((m) => m.type === 'way' && m.role !== 'inner').map((m) => osm.ways.get(m.ref));
    if (parts.some((p) => !p)) continue; // part of it is outside what we were sent
    const rings = joinRings(parts.map((p) => p.refs)).map((refs) => coords(osm, refs));
    if (rings.length) out.push({ name: r.tags.name || '', rings });
  }
  return out;
}

// Running water: [{ name, river, points: [[lat, lon], ...] }], each drawn the
// way it flows (as OpenStreetMap draws a waterway). Streams and rivers that
// run all year: not ditches or canals, nor gulches that are dry till it rains.
export function streams(osm) {
  const out = [];
  for (const w of osm.ways.values()) {
    const t = w.tags;
    if ((t.waterway !== 'stream' && t.waterway !== 'river') || t.intermittent === 'yes') continue;
    const points = coords(osm, w.refs);
    if (points.length > 1) out.push({ name: t.name || '', river: t.waterway === 'river', points });
  }
  return out;
}

// Waterfalls: [{ name, lat, lon, height? }], each a point on its stream
// (waterway=waterfall), with its real height (m) where the map says.
export function falls(osm) {
  const out = [];
  for (const [id, t] of osm.tagged) {
    if (t.waterway !== 'waterfall') continue;
    const [lat, lon] = osm.nodes.get(id);
    const height = Number.parseFloat(t.height);
    out.push({ name: t.name || '', lat, lon, ...(height > 0 ? { height } : {}) });
  }
  return out;
}

// Beaches: [[[lat, lon], ...], ...], the outline of each.
export function beaches(osm) {
  const out = [];
  for (const w of osm.ways.values()) {
    if (w.tags.natural !== 'beach' || w.refs.length < 4 || w.refs[0] !== w.refs[w.refs.length - 1]) continue;
    out.push(coords(osm, w.refs));
  }
  return out;
}

// The coast: [[[lat, lon], ...], ...], each a line with the land on its left
// as you go along it. Ways that follow on from one another are joined, so a
// corner where two meet is a corner of one line (an islet comes out closed).
export function coastlines(osm) {
  const left = [...osm.ways.values()].filter((w) => w.tags.natural === 'coastline' && w.refs.length > 1).map((w) => w.refs.slice());
  const lines = [];
  while (left.length) {
    let line = left.shift();
    for (let grew = true; grew && line[0] !== line[line.length - 1]; ) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const l = left[i];
        // they all run the same way round, so only ever end to start
        if (l[0] === line[line.length - 1]) line = line.concat(l.slice(1));
        else if (l[l.length - 1] === line[0]) line = l.slice(0, -1).concat(line);
        else continue;
        left.splice(i, 1);
        grew = true;
        break;
      }
    }
    const points = coords(osm, line);
    if (points.length > 1) lines.push(points);
  }
  return lines;
}

// Ways that share end nodes, joined into closed rings.
function joinRings(lines) {
  const left = lines.map((l) => l.slice());
  const rings = [];
  while (left.length) {
    let ring = left.shift();
    let grew = true;
    while (ring[0] !== ring[ring.length - 1] && grew) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const l = left[i];
        const end = ring[ring.length - 1];
        if (l[0] === end) ring = ring.concat(l.slice(1));
        else if (l[l.length - 1] === end) ring = ring.concat(l.slice(0, -1).reverse());
        else continue;
        left.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring[0] === ring[ring.length - 1] && ring.length > 3) rings.push(ring);
  }
  return rings;
}

// ── What covers the land ─────────────────────────────────────────────────────
// The kinds of cover a hike keeps (see COVER in src/world/landform.js), from
// OpenStreetMap's tags for them. Anything else is left to the country's own
// rules (steep ground is rock, the rest wooded).
const COVER_TAGS = [
  ['wood', (t) => t.natural === 'wood' || t.landuse === 'forest'],
  ['scrub', (t) => t.natural === 'scrub' || t.natural === 'wetland'],
  ['meadow', (t) => ['grassland', 'heath'].includes(t.natural) || ['meadow', 'grass'].includes(t.landuse)],
  ['tundra', (t) => t.natural === 'tundra' || t.natural === 'fell'],
  ['scree', (t) => t.natural === 'scree' || t.natural === 'shingle'],
  ['rock', (t) => t.natural === 'bare_rock'],
  ['ice', (t) => t.natural === 'glacier'],
];
const coverOf = (t) => (COVER_TAGS.find(([, is]) => is(t)) || [null])[0];

// [{ kind, rings: [[[lat, lon], ...], ...] }]: every ring of each area, outer
// and inner alike, so that filled even-odd its holes are holes.
export function covers(osm) {
  const out = [];
  for (const w of osm.ways.values()) {
    const kind = coverOf(w.tags);
    if (!kind || w.refs.length < 4 || w.refs[0] !== w.refs[w.refs.length - 1]) continue;
    out.push({ kind, rings: [coords(osm, w.refs)] });
  }
  for (const r of osm.relations) {
    const kind = r.tags.type === 'multipolygon' && coverOf(r.tags);
    if (!kind) continue;
    const parts = r.members.filter((m) => m.type === 'way').map((m) => osm.ways.get(m.ref));
    if (parts.some((p) => !p)) continue; // part of it is outside what we were sent
    const rings = joinRings(parts.map((p) => p.refs)).map((refs) => coords(osm, refs));
    if (rings.length) out.push({ kind, rings });
  }
  return out;
}
