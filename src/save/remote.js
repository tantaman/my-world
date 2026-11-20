// Talking to the save server over HTTP.
//
// Opening a world is one request: a frame (frame.js) holding a short header
// and the whole element map gzipped. Changes normally go over the socket
// (live.js); they come through here when the batch is large — a world's first
// save — or when the socket is down.

import { decodeFrame } from './frame.js';

const API = '/api/worlds';
// A world's first save is every element it has, which is far more than the
// server will take at once, so big batches go out a slice at a time.
const CHUNK = 4000;

export class WorldError extends Error {
  constructor(message, status = 0, body = null) {
    super(message);
    this.name = 'WorldError';
    this.status = status; // 0 = never reached the server
    this.body = body;
  }
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

export async function readWorldFrame(bytes, fallbackId) {
  const { header, take } = decodeFrame(bytes);
  if (header.v !== 3) throw new WorldError('that save was written by a different version of my-world', 422);
  const raw = take(header.len);
  const text = header.codec === 'gzip' ? await gunzip(raw) : new TextDecoder().decode(raw);
  const regions = JSON.parse(text);
  const elements = new Map();
  for (const region in regions) elements.set(region, new Map(Object.entries(regions[region])));
  return {
    id: header.id || fallbackId,
    seed: header.seed,
    name: header.name || '',
    gen: header.gen || 0,
    visitor: header.visitor || {},
    elements,
  };
}

export async function createWorld({ seed, name, ops, visitor }) {
  const head = ops.slice(0, CHUNK);
  const body = await pack({ name, ops: head, visitor });
  const got = await post(`${API}?seed=${seed}&name=${encodeURIComponent(name || '')}`, body);
  if (ops.length <= CHUNK) return { ...got, sentBytes: body.byteLength };
  const rest = await sendOps(got.id, { ops: ops.slice(CHUNK), visitor, name });
  return { ...got, gen: rest.gen, sentBytes: body.byteLength + rest.sentBytes };
}

export async function sendOps(id, { ops = [], visitor, name }, { keepalive = false } = {}) {
  let last = null;
  let bytes = 0;
  for (let i = 0; i < ops.length || i === 0; i += CHUNK) {
    const slice = ops.slice(i, i + CHUNK);
    const tail = i + CHUNK >= ops.length;
    // The name and your own state only need to go with the last slice.
    const body = await pack({ ops: slice, visitor: tail ? visitor : undefined, name: tail ? name : undefined });
    bytes += body.byteLength;
    // keepalive requests are capped at around 64 kB by browsers, so only use
    // it for the last-gasp flush when what we're sending fits.
    last = await post(`${API}/${encodeURIComponent(id)}/ops`, body, keepalive && body.byteLength < 60_000);
  }
  return { ...(last || {}), sentBytes: bytes };
}

// ── Plumbing ────────────────────────────────────────────────────────────────

async function pack(payload) {
  const raw = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream !== 'function') return raw;
  try {
    return await pipe(raw, new CompressionStream('gzip'));
  } catch {
    return raw;
  }
}

async function post(url, body, keepalive = false) {
  const headers = { 'content-type': 'application/octet-stream' };
  // Not Content-Encoding: nothing in between should try to be helpful.
  if (isGzip(body)) headers['x-world-codec'] = 'gzip';
  let res;
  try {
    res = await fetch(url, { method: 'POST', body, keepalive, headers });
  } catch (err) {
    throw new WorldError(`could not reach the save server: ${err.message}`, 0);
  }
  const got = await res.json().catch(() => null);
  if (!res.ok) throw new WorldError((got && got.error) || `the save server said ${res.status}`, res.status, got);
  if (got && got.error) throw new WorldError(got.error, 400, got);
  return got || {};
}

const isGzip = (b) => b.byteLength > 2 && b[0] === 0x1f && b[1] === 0x8b;

async function pipe(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const gunzip = async (bytes) => new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();

async function errorMessage(res) {
  const body = await res.json().catch(() => null);
  return (body && body.error) || `the save server said ${res.status}`;
}
