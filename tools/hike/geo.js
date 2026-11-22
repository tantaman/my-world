// The Earth, flattened just enough for a few kilometres of it: a local
// east/north grid in metres around a point, and the web-mercator tile maths
// elevation tiles are cut on.

import { metresPerDegree, localFrame } from '../../src/core/geo.js';

// (the game turns a real place into its own coordinates the same way)
export { metresPerDegree, localFrame };

const D = Math.PI / 180;

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

// And back: [r, g, b] for an elevation, to the nearest 256th of a metre.
export function toTerrarium(h) {
  const v = Math.max(0, Math.min(65535.996, h + 32768));
  const q = Math.round(v * 256);
  return [q >> 16, (q >> 8) & 255, q & 255];
}
