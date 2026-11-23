// The Earth, flattened. Two ways:
//
// For a few kilometres of it, a local east/north grid in metres around a
// point. A real place brought in from a photo (tools/hike.mjs) is laid out on
// one round its middle, and anything in the game that knows where something
// real is (a tour's landing, by its latitude and longitude) finds it on the
// same.
//
// And the whole of it, as the game world lays it out: the real world at the
// hikes' own scale, 1 : 5, by an azimuthal equidistant projection about the
// middle of the world, in the Hoh rain forest. Distance and direction from the
// middle are true everywhere; the further out, the wider than life the map is
// across that line (stretch()): a tenth at 5,000 km, half as much again at
// 10,000, without limit towards the far side. Where each hike goes
// (tools/hike/place.js) and what the Earth is like under the whole world
// (world/earth.js) are both found by it.

const D = Math.PI / 180;

// Metres per degree of latitude and of longitude at latitude lat (WGS84,
// good to a few centimetres per kilometre).
export function metresPerDegree(lat) {
  const p = lat * D;
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p),
    lon: 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p),
  };
}

// A flat east/north frame around (lat0, lon0). Over the ten kilometres or so
// of a hike, the error is well under a metre.
export function localFrame(lat0, lon0) {
  const m = metresPerDegree(lat0);
  return {
    lat0,
    lon0,
    toEN: (lat, lon) => [(lon - lon0) * m.lon, (lat - lat0) * m.lat],
    toLatLon: (e, n) => [lat0 + n / m.lat, lon0 + e / m.lon],
  };
}

// The real place at the middle of the game world: the Hoh rain forest, a
// little down the valley from the visitor centre.
export const ORIGIN = { lat: 47.85, lon: -123.95 };
// m, the Earth's mean radius (it is taken as a sphere: the projection is
// true to a few parts in a thousand, and everything on it is placed by it)
export const EARTH_RADIUS = 6371008.8;

// The angle (rad) between the middle of the world and (lat, lon), seen from
// the centre of the Earth.
function arcFromMiddle(lat, lon) {
  const [p0, p] = [ORIGIN.lat * D, lat * D];
  const dl = (lon - ORIGIN.lon) * D;
  const cosc = Math.max(-1, Math.min(1, Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(dl)));
  return Math.acos(cosc);
}

// How many times wider than life the map is at (lat, lon), across the line
// from the middle. Along that line it is always true.
export function stretch(lat, lon) {
  const c = arcFromMiddle(lat, lon);
  return c < 1e-6 ? 1 : c / Math.max(Math.sin(c), 1e-9);
}

// Real (lat, lon) → game [x, z] (x east, z south) at `scale` game metres per
// real metre.
export function project(lat, lon, scale) {
  const [p0, p] = [ORIGIN.lat * D, lat * D];
  const dl = (lon - ORIGIN.lon) * D;
  const k = stretch(lat, lon);
  const east = EARTH_RADIUS * k * Math.cos(p) * Math.sin(dl);
  const north = EARTH_RADIUS * k * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(dl));
  return [east * scale, -north * scale];
}

// And back: game (x, z) at `scale` → [lat, lon] (degrees, lon in
// -180..180). Fills and returns `out` if given (two numbers), so a caller
// asking at every point needn't make an array each time.
const SIN_P0 = Math.sin(ORIGIN.lat * D);
const COS_P0 = Math.cos(ORIGIN.lat * D);
export function unproject(x, z, scale, out = [0, 0]) {
  const east = x / scale;
  const north = -z / scale;
  const rho = Math.hypot(east, north);
  if (rho < 1e-6) {
    out[0] = ORIGIN.lat;
    out[1] = ORIGIN.lon;
    return out;
  }
  const c = rho / EARTH_RADIUS;
  const sc = Math.sin(c);
  const cc = Math.cos(c);
  out[0] = Math.asin(Math.max(-1, Math.min(1, cc * SIN_P0 + (north * sc * COS_P0) / rho))) / D;
  let lon = ORIGIN.lon + Math.atan2(east * sc, rho * COS_P0 * cc - north * SIN_P0 * sc) / D;
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  out[1] = lon;
  return out;
}
