// Just enough TIFF to read heights from an elevation service (usgs.js): one
// band of 32-bit floats, uncompressed, in strips or in tiles, and where the
// GeoTIFF tags say its corner is and how big its pixels are. Pure: hand it the
// bytes.

const TAG = {
  width: 256,
  height: 257,
  bits: 258,
  compression: 259,
  stripOffsets: 273,
  samples: 277,
  rowsPerStrip: 278,
  tileWidth: 322,
  tileHeight: 323,
  tileOffsets: 324,
  format: 339,
  pixelScale: 33550,
  tiePoint: 33922,
};
const FLOAT = 3; // SampleFormat: IEEE floating point
const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };

// → { width, height, data: Float32Array (row by row, from the top), corner:
//   [x, y] of the top left of the top left pixel, pixel: [dx, dy] } in the
//   image's own coordinates (corner and pixel are null if it doesn't say)
export function readTiff(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const order = String.fromCharCode(b[0], b[1]);
  if (order !== 'II' && order !== 'MM') throw new Error('not a TIFF');
  const le = order === 'II';
  const u16 = (o) => dv.getUint16(o, le);
  const u32 = (o) => dv.getUint32(o, le);
  if (u16(2) !== 42) throw new Error('not a TIFF (BigTIFF?)');

  const ifd = u32(4);
  const tags = {};
  for (let k = 0, n = u16(ifd); k < n; k++) {
    const e = ifd + 2 + k * 12;
    const type = u16(e + 2);
    const count = u32(e + 4);
    const size = SIZE[type] || 1;
    const at = count * size > 4 ? u32(e + 8) : e + 8;
    const read = (i) => {
      const o = at + i * size;
      if (type === 3) return u16(o);
      if (type === 4) return u32(o);
      if (type === 12) return dv.getFloat64(o, le);
      if (type === 11) return dv.getFloat32(o, le);
      return b[o];
    };
    tags[u16(e)] = Array.from({ length: count }, (_, i) => read(i));
  }
  const one = (t, d) => (tags[t] ? tags[t][0] : d);
  const width = one(TAG.width);
  const height = one(TAG.height);
  if (one(TAG.compression, 1) !== 1) throw new Error('compressed TIFF: ask for it uncompressed');
  if (one(TAG.bits) !== 32 || one(TAG.format, 1) !== FLOAT || one(TAG.samples, 1) !== 1) throw new Error('not one band of 32-bit floats');

  const data = new Float32Array(width * height);
  const f32 = (o) => dv.getFloat32(o, le);
  if (tags[TAG.tileOffsets]) {
    const tw = one(TAG.tileWidth);
    const th = one(TAG.tileHeight);
    const across = Math.ceil(width / tw);
    tags[TAG.tileOffsets].forEach((off, t) => {
      const x0 = (t % across) * tw;
      const y0 = Math.floor(t / across) * th;
      // a tile at the edge is stored whole, padding and all
      for (let y = 0; y < th && y0 + y < height; y++) {
        for (let x = 0; x < tw && x0 + x < width; x++) data[(y0 + y) * width + x0 + x] = f32(off + (y * tw + x) * 4);
      }
    });
  } else {
    const rows = one(TAG.rowsPerStrip, height);
    tags[TAG.stripOffsets].forEach((off, s) => {
      const k0 = s * rows * width;
      const k1 = Math.min(width * height, k0 + rows * width);
      for (let k = k0; k < k1; k++) data[k] = f32(off + (k - k0) * 4);
    });
  }
  const scale = tags[TAG.pixelScale];
  const tie = tags[TAG.tiePoint];
  // the tie point pins raster (i, j) to model (x, y): the corner is where (0, 0) is
  const corner = tie ? [tie[3] - tie[0] * scale[0], tie[4] + tie[1] * scale[1]] : null;
  return { width, height, data, corner, pixel: scale ? [scale[0], scale[1]] : null };
}

// A TIFF of one band of floats, uncompressed, in one strip, with its corner
// and pixel size: what readTiff reads (for the tests).
export function writeTiff(width, height, data, corner = [0, 0], pixel = [1, 1]) {
  const entries = [
    [TAG.width, 4, [width]],
    [TAG.height, 4, [height]],
    [TAG.bits, 3, [32]],
    [TAG.compression, 3, [1]],
    [TAG.stripOffsets, 4, [0]], // filled in below
    [TAG.samples, 3, [1]],
    [TAG.rowsPerStrip, 4, [height]],
    [TAG.format, 3, [FLOAT]],
    [TAG.pixelScale, 12, [pixel[0], pixel[1], 0]],
    [TAG.tiePoint, 12, [0, 0, 0, corner[0], corner[1], 0]],
  ];
  const ifd = 8;
  const extra = ifd + 2 + entries.length * 12 + 4;
  let p = extra;
  const where = entries.map(([, type, v]) => {
    const n = v.length * SIZE[type];
    if (n <= 4) return null;
    const at = p;
    p += n;
    return at;
  });
  const pixels = p;
  const buf = new ArrayBuffer(pixels + width * height * 4);
  const dv = new DataView(buf);
  dv.setUint8(0, 0x49);
  dv.setUint8(1, 0x49);
  dv.setUint16(2, 42, true);
  dv.setUint32(4, ifd, true);
  dv.setUint16(ifd, entries.length, true);
  entries.forEach(([tag, type, v], k) => {
    if (tag === TAG.stripOffsets) v = [pixels];
    const e = ifd + 2 + k * 12;
    dv.setUint16(e, tag, true);
    dv.setUint16(e + 2, type, true);
    dv.setUint32(e + 4, v.length, true);
    const at = where[k] ?? e + 8;
    if (where[k] !== null) dv.setUint32(e + 8, at, true);
    v.forEach((x, i) => {
      if (type === 3) dv.setUint16(at + i * 2, x, true);
      else if (type === 4) dv.setUint32(at + i * 4, x, true);
      else dv.setFloat64(at + i * 8, x, true);
    });
  });
  for (let k = 0; k < width * height; k++) dv.setFloat32(pixels + k * 4, data[k], true);
  return new Uint8Array(buf);
}
