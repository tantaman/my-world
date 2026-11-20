// Photos made byte by byte, so the photo reader can be tested without
// keeping anyone's real photos (and where they were standing) in the repo.
//
//   tiffExif({ lat, lon, alt, bearing, taken })  → the TIFF a camera writes
//   jpegWith(tiff), heifWith(tiff)               → that, in a JPEG or a HEIC

const ASCII = 2;
const BYTE = 1;
const LONG = 4;
const RATIONAL = 5;
const SIZE = { [ASCII]: 1, [BYTE]: 1, [LONG]: 4, [RATIONAL]: 8 };

const rational = (v, den = 10000) => [Math.round(v * den), den];
const dms = (deg) => {
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const m = Math.floor((a - d) * 60);
  return [[d, 1], [m, 1], rational((a - d - m / 60) * 3600, 100)];
};

// Big-endian TIFF with IFD0 → GPS IFD and Exif IFD.
export function tiffExif({ lat, lon, alt, bearing, taken }) {
  const gps = [
    { tag: 1, type: ASCII, value: lat >= 0 ? 'N' : 'S' },
    { tag: 2, type: RATIONAL, value: dms(lat) },
    { tag: 3, type: ASCII, value: lon >= 0 ? 'E' : 'W' },
    { tag: 4, type: RATIONAL, value: dms(lon) },
    { tag: 5, type: BYTE, value: [alt < 0 ? 1 : 0] },
    { tag: 6, type: RATIONAL, value: [rational(Math.abs(alt))] },
    { tag: 17, type: RATIONAL, value: [rational(bearing)] },
  ];
  const exif = [{ tag: 0x9003, type: ASCII, value: taken }];
  const ifd0 = [
    { tag: 0x8769, type: LONG, value: [0] }, // offsets filled in below
    { tag: 0x8825, type: LONG, value: [0] },
  ];
  const ifdSize = (ifd) => 2 + ifd.length * 12 + 4;
  const count = (e) => (e.type === ASCII ? e.value.length + 1 : e.value.length);
  const dataSize = (ifd) => ifd.reduce((s, e) => s + (SIZE[e.type] * count(e) > 4 ? SIZE[e.type] * count(e) : 0), 0);
  const at0 = 8;
  const atExif = at0 + ifdSize(ifd0);
  const atGps = atExif + ifdSize(exif) + dataSize(exif);
  ifd0[0].value = [atExif];
  ifd0[1].value = [atGps];
  const total = atGps + ifdSize(gps) + dataSize(gps);
  const b = new Uint8Array(total);
  const dv = new DataView(b.buffer);
  b.set([0x4d, 0x4d, 0, 42, 0, 0, 0, 8]);
  const write = (ifd, at) => {
    dv.setUint16(at, ifd.length);
    let data = at + ifdSize(ifd);
    ifd.forEach((e, k) => {
      const p = at + 2 + k * 12;
      dv.setUint16(p, e.tag);
      dv.setUint16(p + 2, e.type);
      dv.setUint32(p + 4, count(e));
      const size = SIZE[e.type] * count(e);
      let w = size > 4 ? data : p + 8;
      if (size > 4) {
        dv.setUint32(p + 8, data);
        data += size;
      }
      if (e.type === ASCII) for (const ch of `${e.value}\0`) b[w++] = ch.charCodeAt(0);
      else if (e.type === BYTE) for (const v of e.value) b[w++] = v;
      else if (e.type === LONG) for (const v of e.value) (dv.setUint32(w, v), (w += 4));
      else for (const [n, d] of e.value) (dv.setUint32(w, n), dv.setUint32(w + 4, d), (w += 8));
    });
  };
  write(ifd0, at0);
  write(exif, atExif);
  write(gps, atGps);
  return b;
}

const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let w = 0;
  for (const p of parts) {
    out.set(p, w);
    w += p.length;
  }
  return out;
};
const u16 = (v) => Uint8Array.of(v >> 8, v & 255);
const u32 = (v) => Uint8Array.of(v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255);
const box = (type, ...body) => {
  const b = concat(...body);
  return concat(u32(8 + b.length), ascii(type), b);
};

export function jpegWith(tiff) {
  const app1 = concat(ascii('Exif\0\0'), tiff);
  return concat(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0), u16(16), ascii('JFIF\0'), new Uint8Array(9), Uint8Array.of(0xff, 0xe1), u16(app1.length + 2), app1, Uint8Array.of(0xff, 0xda, 0, 2, 0xff, 0xd9));
}

// A HEIC as an iPhone lays one out: the picture is item 1, the EXIF item 2,
// and iloc says where in the file each one is.
export function heifWith(tiff) {
  const item = concat(u32(6), ascii('Exif\0\0'), tiff);
  const infe = (id, type) => box('infe', Uint8Array.of(2, 0, 0, 0), u16(id), u16(0), ascii(type));
  const iinf = box('iinf', Uint8Array.of(0, 0, 0, 0), u16(2), infe(1, 'hvc1'), infe(2, 'Exif'));
  const ftyp = box('ftyp', ascii('heic'), u32(0), ascii('mif1heic'));
  const iloc = (offset) =>
    box('iloc', Uint8Array.of(1, 0, 0, 0), Uint8Array.of(0x44, 0x00), u16(2),
      u16(1), u16(0), u16(0), u16(1), u32(0), u32(0), // the picture: nothing here
      u16(2), u16(0), u16(0), u16(1), u32(offset), u32(item.length));
  const meta = (offset) => box('meta', Uint8Array.of(0, 0, 0, 0), iinf, iloc(offset));
  const before = ftyp.length + meta(0).length + 8;
  return concat(ftyp, meta(before), box('mdat', item));
}
