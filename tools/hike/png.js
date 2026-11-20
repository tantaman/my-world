// Just enough PNG to read elevation tiles and to write a preview: 8-bit RGB
// and RGBA, no interlacing. Node only (zlib).

import { inflateSync, deflateSync } from 'node:zlib';

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

// → { width, height, channels, data: Uint8Array (width·height·channels) }
export function decodePng(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  for (let i = 0; i < 8; i++) if (b[i] !== SIG[i]) throw new Error('not a PNG');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];
  while (p < b.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
    const body = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = dv.getUint32(p + 8);
      height = dv.getUint32(p + 12);
      const depth = body[8];
      const colour = body[9];
      if (depth !== 8 || (colour !== 2 && colour !== 6) || body[12] !== 0) throw new Error(`unsupported PNG (depth ${depth}, colour ${colour})`);
      channels = colour === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const data = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? data[dst + x - channels] : 0;
      const up = y > 0 ? data[dst - stride + x] : 0;
      const c = y > 0 && x >= channels ? data[dst - stride + x - channels] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += up;
      else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) {
        const pp = a + up - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - up);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      data[dst + x] = v & 255;
    }
  }
  return { width, height, channels, data };
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(bytes) {
  let c = -1;
  for (const v of bytes) c = CRC[(c ^ v) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// RGB pixels → PNG bytes.
export function encodePng(width, height, rgb) {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
  const chunk = (type, body) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, 'latin1');
    out.set(body, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from(SIG), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
