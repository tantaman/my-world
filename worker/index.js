// The save server: a Cloudflare Worker over a D1 (SQLite) database.
//
// A world is a seed plus the changes you made to it, which the client has
// already serialised and compressed. This Worker never looks inside the
// snapshot — it stores the bytes, hands them back, and keeps a short tail of
// previous saves. Everything the game knows how to do with a world happens in
// the browser.
//
//   POST   /api/worlds?seed=N[&name=][&codec=]      create      -> { id, rev }
//   GET    /api/worlds/:id                          open        -> snapshot bytes
//   PUT    /api/worlds/:id?rev=N[&seed=][&name=]    save        -> { id, rev }
//   GET    /api/worlds/:id/meta                     is it there? no blob
//   GET    /api/worlds/:id/history                  the saves we still hold
//   GET    /api/worlds/:id/revisions/:rev           one older save's bytes
//
// Anyone with a world's id can read it and write to it — that is the whole
// point of passing the URL to someone — so `rev` is the only safety net: a
// save that was based on an older revision is refused with 409 rather than
// quietly flattening whatever arrived in between. `?force=1` overrides it.

const MAX_BYTES = 1_000_000; // per snapshot, compressed
const KEEP_REVISIONS = 20; // older saves to hold on to, per world
const MAX_NAME = 80;
const ID_LENGTH = 10;
// No vowels, and no 0/1/l/o/i/u, so ids don't spell things and survive being
// read aloud or copied by hand.
const ID_ALPHABET = '23456789bcdfghjkmnpqrstvwxyz';
const CODECS = new Set(['gzip', 'json']);
const ID_RE = /^[0-9a-z]{4,32}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return text(404, 'not found');
    try {
      return await route(request, env, url);
    } catch (err) {
      console.error('world api', err && err.stack ? err.stack : err);
      return fail(500, 'the save server broke');
    }
  },
};

async function route(request, env, url) {
  if (!env.DB) return fail(503, 'no database is bound to this Worker');
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method === 'HEAD' ? 'GET' : request.method;

  if (path === '/api/worlds') {
    if (method !== 'POST') return notAllowed('POST');
    return create(request, env, url);
  }

  const m = path.match(/^\/api\/worlds\/([^/]+)(?:\/(meta|history|revisions\/\d+))?$/);
  if (!m) return fail(404, 'no such endpoint');
  const id = decodeURIComponent(m[1]).toLowerCase();
  if (!ID_RE.test(id)) return fail(400, 'that is not a world id');
  const tail = m[2];

  if (!tail) {
    if (method === 'GET') return read(env, id);
    if (method === 'PUT') return update(request, env, url, id);
    return notAllowed('GET, PUT');
  }
  if (method !== 'GET') return notAllowed('GET');
  if (tail === 'meta') return meta(env, id);
  if (tail === 'history') return history(env, id);
  return readRevision(env, id, Number(tail.slice('revisions/'.length)));
}

// ── Handlers ────────────────────────────────────────────────────────────────

async function create(request, env, url) {
  const seed = intParam(url, 'seed');
  if (seed === null) return fail(400, 'a world needs a ?seed');
  const codec = codecParam(url);
  if (!codec) return fail(400, 'unknown ?codec');
  const body = await readBody(request);
  if (body.error) return fail(body.status, body.error);
  const name = cleanName(url.searchParams.get('name'));
  const now = Date.now();

  // Ids are random, so a clash is vanishingly unlikely — but cheap to retry.
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newId();
    const inserted = await env.DB.prepare(
      `INSERT INTO worlds (id, seed, name, codec, rev, snapshot, bytes, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?7, ?7)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
    )
      .bind(id, seed, name, codec, body.bytes, body.bytes.byteLength, now)
      .first();
    if (!inserted) continue;
    await keepRevision(env, id, 1, codec, body.bytes, now);
    return json(201, { id, rev: 1, seed, name, bytes: body.bytes.byteLength });
  }
  return fail(503, 'could not mint a world id');
}

async function read(env, id) {
  const row = await env.DB.prepare('SELECT seed, name, codec, rev, snapshot, updated_at FROM worlds WHERE id = ?1').bind(id).first();
  if (!row) return fail(404, 'no world lives at that address');
  return snapshotResponse(row.snapshot, {
    'x-world-id': id,
    'x-world-rev': String(row.rev),
    'x-world-seed': String(row.seed),
    'x-world-name': encodeURIComponent(row.name || ''),
    'x-world-codec': row.codec,
    'x-world-updated': String(row.updated_at),
  });
}

async function update(request, env, url, id) {
  const force = url.searchParams.get('force') === '1';
  const rev = intParam(url, 'rev');
  if (rev === null && !force) return fail(400, 'a save needs the ?rev it was based on');
  const codec = codecParam(url);
  if (!codec) return fail(400, 'unknown ?codec');
  const body = await readBody(request);
  if (body.error) return fail(body.status, body.error);

  const current = await env.DB.prepare('SELECT seed, name, rev FROM worlds WHERE id = ?1').bind(id).first();
  if (!current) return fail(404, 'no world lives at that address');

  // Unsent fields keep whatever the world already had.
  const seed = intParam(url, 'seed') ?? current.seed;
  const name = url.searchParams.has('name') ? cleanName(url.searchParams.get('name')) : current.name;
  const now = Date.now();

  const saved = await env.DB.prepare(
    `UPDATE worlds
        SET seed = ?2, name = ?3, codec = ?4, snapshot = ?5, bytes = ?6, rev = rev + 1, updated_at = ?7
      WHERE id = ?1 ${force ? '' : 'AND rev = ?8'}
     RETURNING rev`,
  )
    .bind(...[id, seed, name, codec, body.bytes, body.bytes.byteLength, now, ...(force ? [] : [rev])])
    .first();

  if (!saved) {
    // The row is there (we just read it), so the revision must have moved on.
    return json(409, { error: 'someone else saved this world first', rev: current.rev });
  }
  await keepRevision(env, id, saved.rev, codec, body.bytes, now);
  return json(200, { id, rev: saved.rev, seed, name, bytes: body.bytes.byteLength });
}

async function meta(env, id) {
  const row = await env.DB.prepare('SELECT id, seed, name, codec, rev, bytes, created_at, updated_at FROM worlds WHERE id = ?1').bind(id).first();
  if (!row) return fail(404, 'no world lives at that address');
  return json(200, row);
}

async function history(env, id) {
  const { results } = await env.DB.prepare(
    'SELECT rev, bytes, created_at FROM revisions WHERE world_id = ?1 ORDER BY rev DESC LIMIT ?2',
  )
    .bind(id, KEEP_REVISIONS)
    .all();
  if (!results.length) {
    const there = await env.DB.prepare('SELECT 1 AS ok FROM worlds WHERE id = ?1').bind(id).first();
    if (!there) return fail(404, 'no world lives at that address');
  }
  return json(200, { id, revisions: results });
}

async function readRevision(env, id, rev) {
  if (!Number.isInteger(rev) || rev < 1) return fail(400, 'that is not a revision');
  const row = await env.DB.prepare('SELECT codec, snapshot, created_at FROM revisions WHERE world_id = ?1 AND rev = ?2').bind(id, rev).first();
  if (!row) return fail(404, 'that save is no longer kept');
  return snapshotResponse(row.snapshot, {
    'x-world-id': id,
    'x-world-rev': String(rev),
    'x-world-codec': row.codec,
    'x-world-updated': String(row.created_at),
  });
}

// Keep the last KEEP_REVISIONS saves of a world and drop the rest.
function keepRevision(env, id, rev, codec, bytes, now) {
  return env.DB.batch([
    env.DB.prepare(
      `INSERT INTO revisions (world_id, rev, codec, snapshot, bytes, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT (world_id, rev) DO UPDATE SET codec = ?3, snapshot = ?4, bytes = ?5, created_at = ?6`,
    ).bind(id, rev, codec, bytes, bytes.byteLength, now),
    env.DB.prepare('DELETE FROM revisions WHERE world_id = ?1 AND rev <= ?2').bind(id, rev - KEEP_REVISIONS),
  ]);
}

// ── Plumbing ────────────────────────────────────────────────────────────────

async function readBody(request) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) return tooBig();
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) return tooBig();
  if (!bytes.byteLength) return { status: 400, error: 'that save is empty' };
  return { bytes };
}

const tooBig = () => ({
  status: 413,
  error: `a world may not exceed ${Math.round(MAX_BYTES / 1000)} kB compressed`,
});

function newId() {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return out;
}

function intParam(url, key) {
  const raw = url.searchParams.get(key);
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

function codecParam(url) {
  const codec = url.searchParams.get('codec') || 'gzip';
  return CODECS.has(codec) ? codec : null;
}

const cleanName = (raw) =>
  (raw || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, MAX_NAME);

// D1 hands blobs back as an ArrayBuffer, a view, or an array of bytes
// depending on the driver, so normalise before answering.
function toBytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return new Uint8Array(value);
  if (typeof value === 'string') return new TextEncoder().encode(value);
  throw new Error(`cannot read a snapshot stored as ${typeof value}`);
}

function snapshotResponse(blob, headers) {
  const bytes = toBytes(blob);
  return new Response(bytes, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(bytes.byteLength),
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

const json = (status, data, headers) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

const text = (status, body) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
const fail = (status, error) => json(status, { error });
const notAllowed = (allow) => json(405, { error: `only ${allow} here` }, { allow });
