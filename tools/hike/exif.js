// Where and when a photo was taken, read from its EXIF: the GPS position and
// altitude, which way the camera was pointing, and the hour on the clock.
//
// Phones write this into JPEGs (an APP1 segment) and into HEIC/HEIF files (an
// "Exif" item in the ISO base media file's meta box). Both hold the same TIFF
// structure, so the two only differ in how the TIFF is found.
//
// Pure: hand it the file's bytes. No Node, so the game could read a dropped
// photo with it too.

const td = new TextDecoder('latin1');

// → { lat, lon, alt, bearing, taken, hour } — any of which may be missing
// (null) if the photo doesn't say. Throws if there is no EXIF at all.
export function readPhoto(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const tiff = isJpeg(b) ? jpegTiff(b) : heifTiff(b);
  if (!tiff) throw new Error('no EXIF found in this photo');
  return describe(readTiff(tiff));
}

// ── JPEG ─────────────────────────────────────────────────────────────────────
const isJpeg = (b) => b[0] === 0xff && b[1] === 0xd8;

function jpegTiff(b) {
  let p = 2;
  while (p + 4 <= b.length && b[p] === 0xff) {
    const marker = b[p + 1];
    const len = (b[p + 2] << 8) | b[p + 3];
    if (marker === 0xda) break; // start of scan: no more metadata
    if (marker === 0xe1 && td.decode(b.subarray(p + 4, p + 10)) === 'Exif\0\0') return b.subarray(p + 10, p + 2 + len);
    p += 2 + len;
  }
  return null;
}

// ── HEIF (ISO base media file format) ─────────────────────────────────────────
const u16 = (b, p) => (b[p] << 8) | b[p + 1];
const u32 = (b, p) => ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
const uN = (b, p, n) => {
  let v = 0;
  for (let i = 0; i < n; i++) v = v * 256 + b[p + i];
  return v;
};

// The boxes between start and end: [{ type, start (of the body), end }]
function boxes(b, start, end) {
  const out = [];
  let p = start;
  while (p + 8 <= end) {
    let size = u32(b, p);
    const type = td.decode(b.subarray(p + 4, p + 8));
    let body = p + 8;
    if (size === 1) {
      size = uN(b, p + 8, 8);
      body = p + 16;
    } else if (size === 0) size = end - p;
    if (size < 8 || p + size > end) break;
    out.push({ type, start: body, end: p + size });
    p += size;
  }
  return out;
}

function heifTiff(b) {
  const meta = boxes(b, 0, b.length).find((x) => x.type === 'meta');
  if (!meta) return null;
  const kids = boxes(b, meta.start + 4, meta.end); // meta is a full box
  const iinf = kids.find((x) => x.type === 'iinf');
  const iloc = kids.find((x) => x.type === 'iloc');
  if (!iinf || !iloc) return null;

  // which item is the EXIF
  let exifId = null;
  const v = b[iinf.start];
  for (const e of boxes(b, iinf.start + 4 + (v === 0 ? 2 : 4), iinf.end)) {
    if (e.type !== 'infe') continue;
    const ev = b[e.start];
    if (ev < 2) continue;
    const id = ev === 2 ? u16(b, e.start + 4) : u32(b, e.start + 4);
    const at = e.start + 4 + (ev === 2 ? 2 : 4) + 2;
    if (td.decode(b.subarray(at, at + 4)) === 'Exif') exifId = id;
  }
  if (exifId === null) return null;

  // where it is
  let p = iloc.start;
  const lv = b[p];
  p += 4;
  const offSize = b[p] >> 4;
  const lenSize = b[p] & 15;
  const baseSize = b[p + 1] >> 4;
  const idxSize = lv === 1 || lv === 2 ? b[p + 1] & 15 : 0;
  p += 2;
  const count = lv < 2 ? u16(b, p) : u32(b, p);
  p += lv < 2 ? 2 : 4;
  for (let i = 0; i < count; i++) {
    const id = lv < 2 ? u16(b, p) : u32(b, p);
    p += lv < 2 ? 2 : 4;
    let method = 0;
    if (lv === 1 || lv === 2) {
      method = u16(b, p) & 15;
      p += 2;
    }
    p += 2; // data reference index
    const base = uN(b, p, baseSize);
    p += baseSize;
    const extents = u16(b, p);
    p += 2;
    const parts = [];
    for (let k = 0; k < extents; k++) {
      p += idxSize;
      const off = uN(b, p, offSize);
      p += offSize;
      const len = uN(b, p, lenSize);
      p += lenSize;
      parts.push([base + off, len]);
    }
    if (id !== exifId) continue;
    if (method !== 0) return null; // only data stored in the file itself
    const total = parts.reduce((s, [, len]) => s + len, 0);
    const item = new Uint8Array(total);
    let w = 0;
    for (const [off, len] of parts) {
      item.set(b.subarray(off, off + len), w);
      w += len;
    }
    // the item opens with how far into it the TIFF header is
    return item.subarray(4 + u32(item, 0));
  }
  return null;
}

// ── TIFF ─────────────────────────────────────────────────────────────────────
const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

function readTiff(t) {
  const le = t[0] === 0x49; // 'II' little-endian, 'MM' big-endian
  const dv = new DataView(t.buffer, t.byteOffset, t.byteLength);
  const r16 = (p) => dv.getUint16(p, le);
  const r32 = (p) => dv.getUint32(p, le);
  if (r16(2) !== 42) throw new Error('EXIF is not a TIFF structure');

  const ifd = (at) => {
    const out = new Map();
    if (!at || at + 2 > t.length) return out;
    const n = r16(at);
    for (let i = 0; i < n; i++) {
      const e = at + 2 + i * 12;
      const tag = r16(e);
      const type = r16(e + 2);
      const count = r32(e + 4);
      const size = (TYPE_SIZE[type] || 1) * count;
      const p = size <= 4 ? e + 8 : r32(e + 8);
      if (p + size > t.length) continue;
      out.set(tag, value(type, count, p));
    }
    return out;
  };
  const value = (type, count, p) => {
    if (type === 2) return td.decode(t.subarray(p, p + count)).replace(/\0+$/, '');
    const vals = [];
    for (let i = 0; i < count; i++) {
      if (type === 1 || type === 7) vals.push(t[p + i]);
      else if (type === 3) vals.push(r16(p + i * 2));
      else if (type === 4) vals.push(r32(p + i * 4));
      else if (type === 9) vals.push(dv.getInt32(p + i * 4, le));
      else if (type === 5 || type === 10) {
        const num = type === 5 ? r32(p + i * 8) : dv.getInt32(p + i * 8, le);
        const den = type === 5 ? r32(p + i * 8 + 4) : dv.getInt32(p + i * 8 + 4, le);
        vals.push(den ? num / den : NaN);
      }
    }
    return count === 1 ? vals[0] : vals;
  };

  const ifd0 = ifd(r32(4));
  return { ifd0, gps: ifd(ifd0.get(0x8825)), exif: ifd(ifd0.get(0x8769)) };
}

const dms = (v) => (Array.isArray(v) ? v[0] + (v[1] || 0) / 60 + (v[2] || 0) / 3600 : Number.isFinite(v) ? v : null);

function describe({ ifd0, gps, exif }) {
  let lat = dms(gps.get(2));
  let lon = dms(gps.get(4));
  if (lat !== null && gps.get(1) === 'S') lat = -lat;
  if (lon !== null && gps.get(3) === 'W') lon = -lon;
  let alt = gps.has(6) ? gps.get(6) : null;
  if (alt !== null && gps.get(5) === 1) alt = -alt; // below sea level
  // which way the camera pointed (degrees clockwise from north)
  const bearing = gps.has(17) ? gps.get(17) : null;
  // the photographer's local clock, which is what the light looked like
  const taken = exif.get(0x9003) || ifd0.get(0x0132) || null;
  const m = taken && /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d)/.exec(taken);
  const hour = m ? Number(m[4]) + Number(m[5]) / 60 : null;
  return { lat, lon, alt, bearing, taken, hour };
}
