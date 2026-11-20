// Talking to the save server.
//
// Snapshots are gzipped in the browser and stored as-is, so the server never
// parses a world and never spends a cycle compressing one. The `codec` travels
// with the bytes, which leaves a plain-JSON fallback for browsers without
// CompressionStream.

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

export async function encodeSnapshot(snapshot) {
  const raw = new TextEncoder().encode(JSON.stringify(snapshot));
  if (typeof CompressionStream !== 'function') return { codec: 'json', bytes: raw };
  try {
    return { codec: 'gzip', bytes: await pipe(raw, new CompressionStream('gzip')) };
  } catch {
    return { codec: 'json', bytes: raw };
  }
}

export async function decodeSnapshot(bytes, codec) {
  const raw = codec === 'gzip' ? await pipe(bytes, new DecompressionStream('gzip')) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}

async function pipe(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ── Requests ────────────────────────────────────────────────────────────────

export async function createWorld({ snapshot, name = '' }) {
  const { codec, bytes } = await encodeSnapshot(snapshot);
  const url = `${API}?seed=${snapshot.seed}&codec=${codec}&name=${encodeURIComponent(name)}`;
  const body = await send(url, { method: 'POST', body: bytes });
  return { id: body.id, rev: body.rev, bytes: bytes.byteLength };
}

export async function saveWorld({ id, rev, snapshot, name = '', force = false, keepalive = false }) {
  const { codec, bytes } = await encodeSnapshot(snapshot);
  const query = force ? 'force=1' : `rev=${rev}`;
  const url = `${API}/${encodeURIComponent(id)}?${query}&seed=${snapshot.seed}&codec=${codec}&name=${encodeURIComponent(name)}`;
  // keepalive requests are capped at around 64 kB by browsers, so only use it
  // for the last-gasp flush when the snapshot is small enough to fit.
  const body = await send(url, { method: 'PUT', body: bytes, keepalive: keepalive && bytes.byteLength < 60_000 });
  return { rev: body.rev, bytes: bytes.byteLength };
}

export async function openWorld(id) {
  let res;
  try {
    res = await fetch(`${API}/${encodeURIComponent(id)}`, { headers: { accept: 'application/octet-stream' } });
  } catch (err) {
    throw new WorldError(`could not reach the save server: ${err.message}`, 0);
  }
  if (!res.ok) throw new WorldError(await errorMessage(res), res.status);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return {
    id: res.headers.get('x-world-id') || id,
    rev: Number(res.headers.get('x-world-rev')) || 1,
    seed: Number(res.headers.get('x-world-seed')),
    name: decodeName(res.headers.get('x-world-name')),
    snapshot: await decodeSnapshot(bytes, res.headers.get('x-world-codec') || 'gzip'),
  };
}

async function send(url, init) {
  let res;
  try {
    res = await fetch(url, { ...init, headers: { 'content-type': 'application/octet-stream' } });
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

function decodeName(raw) {
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return '';
  }
}
