// How a split world travels.
//
// A world is no longer one blob, so it moves as a frame: a short JSON header
// naming the parts and their sizes, then the parts' bytes end to end. The
// header is the only thing anyone in the middle reads — the parts are the
// exact bytes the browser compressed, stored and handed back untouched.
//
//   'MWLD' | u32 header length | header JSON | part | part | …
//
// Shared by the game and the Worker, so there is one definition of the wire.

const MAGIC = [0x4d, 0x57, 0x4c, 0x44]; // 'MWLD'
const HEAD = 8; // magic + header length

export function encodeFrame(header, parts) {
  const head = new TextEncoder().encode(JSON.stringify(header));
  let total = HEAD + head.byteLength;
  for (const p of parts) total += p.byteLength;
  const out = new Uint8Array(total);
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint32(4, head.byteLength, false);
  out.set(head, HEAD);
  let at = HEAD + head.byteLength;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

// -> { header, take(len) } where take() walks the parts in header order.
export function decodeFrame(bytes) {
  if (bytes.byteLength < HEAD) throw new FrameError('that is not a world');
  for (let i = 0; i < 4; i++) if (bytes[i] !== MAGIC[i]) throw new FrameError('that is not a world');
  const headLen = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, false);
  if (HEAD + headLen > bytes.byteLength) throw new FrameError('that world arrived cut short');
  let header;
  try {
    header = JSON.parse(new TextDecoder().decode(bytes.subarray(HEAD, HEAD + headLen)));
  } catch {
    throw new FrameError('that world has an unreadable header');
  }
  let at = HEAD + headLen;
  const take = (len) => {
    if (!Number.isInteger(len) || len < 0 || at + len > bytes.byteLength) throw new FrameError('that world arrived cut short');
    const part = bytes.subarray(at, at + len);
    at += len;
    return part;
  };
  return { header, take };
}

export class FrameError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FrameError';
  }
}
