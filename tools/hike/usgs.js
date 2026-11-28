// Heights from the USGS's 3D Elevation Program (3DEP), for a hike in the
// United States (`--dem 3dep`). Where the country has been flown with lidar,
// which is most of it, these are good to a metre or two: a narrow ridge stays
// a ridge, and a cliff stands where it really is. Terrain Tiles, the
// importer's usual heights, are coarser, and in steep country can be tens of
// metres out.
//
// The National Map serves them as an image of any box you ask for. They are
// asked for here in blocks of the same web-mercator tiles Terrain Tiles are
// cut on, so the importer reads both the same way (hike.mjs), and each tile
// is kept as Terrarium-coded PNG, as small as Terrain Tiles' own. Pure: the
// fetching is the importer's.

import { readTiff } from './tiff.js';
import { toTerrarium } from './geo.js';

export const USGS = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage';
// Tiles a side asked for at once: 1024 × 1024 heights, 4 MB.
export const BLOCK = 4;
const TILE = 256;
const HALF = Math.PI * 6378137; // m: half way round the world, in web mercator

// m: the web-mercator box of tile (tx, ty) at zoom z, [west, south, east, north]
function tileBox(z, tx, ty, across = 1) {
  const span = (2 * HALF) / 2 ** z;
  const w = -HALF + tx * span;
  const n = HALF - ty * span;
  return [w, n - across * span, w + across * span, n];
}

// The block of BLOCK × BLOCK tiles at zoom z that tile (tx, ty) is in: its
// first tile, and where to ask for it.
export function blockOf(z, tx, ty) {
  const bx = Math.floor(tx / BLOCK) * BLOCK;
  const by = Math.floor(ty / BLOCK) * BLOCK;
  const size = BLOCK * TILE;
  const q = new URLSearchParams({
    bbox: tileBox(z, bx, by, BLOCK).join(','),
    bboxSR: 3857,
    imageSR: 3857,
    size: `${size},${size}`,
    format: 'tiff',
    pixelType: 'F32',
    compression: 'None',
    interpolation: 'RSP_BilinearInterpolation',
    f: 'image',
  });
  return { bx, by, url: `${USGS}?${q}` };
}

// A block as it came (TIFF bytes), cut into its tiles: [{ tx, ty, rgb }], each
// 256 × 256 Terrarium-coded. Where 3DEP has nothing (out at sea, over the
// border) the pixel is black, which reads as -32768 m: no height
// (see missing()).
export function blockTiles(bytes, z, bx, by) {
  const img = readTiff(bytes);
  const size = BLOCK * TILE;
  if (img.width !== size || img.height !== size) throw new Error(`3DEP sent ${img.width} × ${img.height}, not ${size} × ${size}`);
  const [w, , , n] = tileBox(z, bx, by, BLOCK);
  const px = (2 * HALF) / 2 ** z / TILE;
  if (img.corner && (Math.abs(img.corner[0] - w) > px / 2 || Math.abs(img.corner[1] - n) > px / 2)) throw new Error("3DEP's block isn't where it was asked for");
  const out = [];
  for (let j = 0; j < BLOCK; j++) {
    for (let i = 0; i < BLOCK; i++) {
      const rgb = new Uint8Array(TILE * TILE * 3);
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const h = img.data[(j * TILE + y) * size + i * TILE + x];
          rgb.set(h > NOTHING ? toTerrarium(h) : [0, 0, 0], (y * TILE + x) * 3);
        }
      }
      out.push({ tx: bx + i, ty: by + j, rgb });
    }
  }
  return out;
}

// Below this (m) is no height at all: 3DEP's no-data, and black. Nor is
// anything higher than any mountain: out at sea some of its no-data comes
// through as heights of kilometres.
const NOTHING = -15000;
const HIGHEST = 9000;
export const missing = (h) => !(h > NOTHING && h < HIGHEST);
