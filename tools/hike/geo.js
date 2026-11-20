// The Earth, flattened just enough for a few kilometres of it: a local
// east/north grid in metres around a point, and the web-mercator tile maths
// elevation tiles are cut on.

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

// Web mercator: fractional tile coordinates of a point at zoom z.
export function tileXY(lat, lon, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const s = Math.sin(lat * D);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return [x, y];
}

// Ground metres per pixel of a 256 px tile at zoom z, at latitude lat.
export const tileMetresPerPixel = (lat, z) => (40075016.686 * Math.cos(lat * D)) / (256 * 2 ** z);

// Terrarium-encoded elevation (metres) from a pixel's red, green and blue.
export const terrarium = (r, g, b) => r * 256 + g + b / 256 - 32768;
