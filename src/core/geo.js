// The Earth, flattened just enough for a few kilometres of it: a local
// east/north grid in metres around a point. A real place brought in from a
// photo (tools/hike.mjs) is laid out on one round its middle, and anything
// in the game that knows where something real is (a tour's landing, by its
// latitude and longitude) finds it on the same.

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
