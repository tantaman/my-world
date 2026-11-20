// Talking to the save server.
//
// A world travels as a frame (frame.js): a JSON header naming the parts, then
// the parts. Each part is gzipped here in the browser and stored as those
// exact bytes, so the server never parses a world and never spends a cycle
// compressing one. The `codec` travels with the bytes, which leaves a plain
// JSON fallback for browsers without CompressionStream.

import { encodeFrame, decodeFrame } from './frame.js';
import { mergeSnapshot, keyOf } from './regions.js';

const API = '/api/worlds';

export class WorldError extends Error {
  constructor(message, status = 0, body = null) {
    super(message);
    this.name = 'WorldError';
    this.status = status; // 0 = never reached the server
    this.body = body;
  }
}

// ── Codec ───────────────────────────────────────────────────────────────────

export async function encodePart(part) {
  const raw = new TextEncoder().encode(JSON.stringify(part));
  if (typeof CompressionStream !== 'function') return { codec: 'json', bytes: raw };
  try {
    return { codec: 'gzip', bytes: await pipe(raw, new CompressionStream('gzip')) };
  } catch {
    return { codec: 'json', bytes: raw };
  }
}

export async function decodePart(bytes, codec) {
  const raw = codec === 'gzip' ? await pipe(bytes, new DecompressionStream('gzip')) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}

async function pipe(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ── Frames ──────────────────────────────────────────────────────────────────

// `send` is { seed, name, force, meta, visitor, patches, drops } where meta is
// { rev, body }, visitor is { body } and each patch is { rx, rz, rev, body }.
async function buildFrame(send) {
  const header = {
    v: 2,
    seed: send.seed,
    name: send.name || '',
    force: !!send.force,
    meta: null,
    visitor: null,
    patches: [],
    drop: (send.drops || []).map((d) => ({ rx: d.rx, rz: d.rz, rev: d.rev })),
  };
  const parts = [];
  if (send.meta) {
    const { codec, bytes } = await encodePart(send.meta.body);
    header.meta = { rev: send.meta.rev, codec, len: bytes.byteLength };
    parts.push(bytes);
  }
  if (send.visitor) {
    const { codec, bytes } = await encodePart(send.visitor.body);
    header.visitor = { codec, len: bytes.byteLength };
    parts.push(bytes);
  }
  for (const p of send.patches || []) {
    const { codec, bytes } = await encodePart(p.body);
    header.patches.push({ rx: p.rx, rz: p.rz, rev: p.rev, codec, len: bytes.byteLength });
    parts.push(bytes);
  }
  return encodeFrame(header, parts);
}

// Pull a world out of a frame. Also reads the old one-blob format, which the
// next save rewrites in the new layout.
async function readWorldFrame(bytes, fallbackId) {
  const { header, take } = decodeFrame(bytes);
  const world = {
    id: header.id || fallbackId,
    seed: header.seed,
    name: header.name || '',
    gen: header.gen || 1,
    legacy: header.v === 1,
    revs: { meta: 0, patches: new Map() },
  };
  if (header.v === 1) {
    world.snapshot = await decodePart(take(header.whole.len), header.whole.codec);
    return world;
  }
  // Parts come in header order: meta, visitor, then the regions.
  const meta = header.meta ? await decodePart(take(header.meta.len), header.meta.codec) : null;
  const visitor = header.visitor ? await decodePart(take(header.visitor.len), header.visitor.codec) : null;
  const patches = [];
  for (const spec of header.patches || []) {
    patches.push(await decodePart(take(spec.len), spec.codec));
    world.revs.patches.set(keyOf(spec.rx, spec.rz), spec.rev);
  }
  world.revs.meta = header.meta ? header.meta.rev : 0;
  world.snapshot = mergeSnapshot({ seed: header.seed, meta, visitor, patches });
  return world;
}

// ── Requests ────────────────────────────────────────────────────────────────

export async function createWorld(send) {
  const frame = await buildFrame(send);
  const body = await sendFrame(`${API}?seed=${send.seed}&name=${encodeURIComponent(send.name || '')}`, 'POST', frame);
  return { ...body, sentBytes: frame.byteLength };
}

export async function saveWorld({ id, send, keepalive = false }) {
  const frame = await buildFrame(send);
  // keepalive requests are capped at around 64 kB by browsers, so only use it
  // for the last-gasp flush when what we're sending is small enough to fit.
  const body = await sendFrame(`${API}/${encodeURIComponent(id)}`, 'PUT', frame, keepalive && frame.byteLength < 60_000);
  return { ...body, sentBytes: frame.byteLength };
}

export async function openWorld(id) {
  let res;
  try {
    res = await fetch(`${API}/${encodeURIComponent(id)}`, { headers: { accept: 'application/octet-stream' } });
  } catch (err) {
    throw new WorldError(`could not reach the save server: ${err.message}`, 0);
  }
  if (!res.ok) throw new WorldError(await errorMessage(res), res.status);
  return readWorldFrame(new Uint8Array(await res.arrayBuffer()), id);
}

async function sendFrame(url, method, frame, keepalive = false) {
  let res;
  try {
    res = await fetch(url, { method, body: frame, keepalive, headers: { 'content-type': 'application/octet-stream' } });
  } catch (err) {
    throw new WorldError(`could not reach the save server: ${err.message}`, 0);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new WorldError((body && body.error) || `the save server said ${res.status}`, res.status, body);
  return body || {};
}

async function errorMessage(res) {
  const body = await res.json().catch(() => null);
  return (body && body.error) || `the save server said ${res.status}`;
}
