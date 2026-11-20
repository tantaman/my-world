// The save server: a Cloudflare Worker over a D1 (SQLite) database.
//
// A world is a seed plus the changes you made to it, stored in pieces: one row
// per 64 m region for the things that have a place in the world, one blob for
// the marks, one for the visitor's own state. The Worker never looks inside
// any of them — it stores the bytes the browser compressed, hands them back,
// and keeps a whole copy now and then.
//
//   POST   /api/worlds?seed=N[&name=]        create          -> { id, gen, ... }
//   GET    /api/worlds/:id                   open            -> a world frame
//   PUT    /api/worlds/:id                   save            -> what landed
//   GET    /api/worlds/:id/meta              is it there?     no blobs
//   GET    /api/worlds/:id/history           the copies kept
//   GET    /api/worlds/:id/revisions/:gen    one whole copy  -> a world frame
//
// Bodies and world responses are frames (src/save/frame.js): a JSON header
// naming the parts, then the parts.
//
// Anyone with a world's id can read it and write to it — that is the point of
// passing the URL to someone — so each part carries the revision it was based
// on. A part whose revision has moved on is refused and reported back; the
// rest of the save still lands, because regions are independent. That is the
// whole reason for splitting a world up: two people building a few hundred
// metres apart never touch the same row.

import { encodeFrame, decodeFrame, FrameError } from '../src/save/frame.js';

const MAX_BODY = 1_000_000; // one save, compressed
const MAX_PART = 262_144; // any single region, or the marks
const MAX_VISITOR = 65_536;
const MAX_WORLD = 8_000_000; // everything one world may hold
const MAX_PATCHES = 4096; // regions touched in one save
const KEEP_COPIES = 20; // whole-world copies per world
const COPY_EVERY = 10 * 60 * 1000; // and at most one this often
const MAX_NAME = 80;
const ID_LENGTH = 10;
// No vowels, and no 0/1/l/o/i/u, so ids don't spell things and survive being
// read aloud or copied by hand.
const ID_ALPHABET = '23456789bcdfghjkmnpqrstvwxyz';
const CODECS = new Set(['gzip', 'json']);
const ID_RE = /^[0-9a-z]{4,32}$/;
const LIMIT = 1 << 24; // region coordinates live well inside this

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return new Response('not found', { status: 404 });
    try {
      return await route(request, env, ctx, url);
    } catch (err) {
      if (err instanceof FrameError) return fail(400, err.message);
      console.error('world api', err && err.stack ? err.stack : err);
      return fail(500, 'the save server broke');
    }
  },
};

async function route(request, env, ctx, url) {
  if (!env.DB) return fail(503, 'no database is bound to this Worker');
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method === 'HEAD' ? 'GET' : request.method;

  if (path === '/api/worlds') {
    if (method !== 'POST') return notAllowed('POST');
    return create(request, env, ctx, url);
  }

  const m = path.match(/^\/api\/worlds\/([^/]+)(?:\/(meta|history|revisions\/\d+))?$/);
  if (!m) return fail(404, 'no such endpoint');
  const id = decodeURIComponent(m[1]).toLowerCase();
  if (!ID_RE.test(id)) return fail(400, 'that is not a world id');
  const tail = m[2];

  if (!tail) {
    if (method === 'GET') return read(env, id);
    if (method === 'PUT') return save(request, env, ctx, url, id);
    return notAllowed('GET, PUT');
  }
  if (method !== 'GET') return notAllowed('GET');
  if (tail === 'meta') return describe(env, id);
  if (tail === 'history') return history(env, id);
  return readCopy(env, id, Number(tail.slice('revisions/'.length)));
}

// ── Reading ─────────────────────────────────────────────────────────────────

async function read(env, id) {
  const world = await loadWorld(env, id);
  if (!world) return fail(404, 'no world lives at that address');
  const frame = await assemble(env, world);
  return frameResponse(frame, { 'x-world-id': id, 'x-world-gen': String(world.gen) });
}

async function readCopy(env, id, gen) {
  if (!Number.isInteger(gen) || gen < 1) return fail(400, 'that is not a generation');
  const row = await env.DB.prepare('SELECT snapshot, created_at FROM revisions WHERE world_id = ?1 AND gen = ?2').bind(id, gen).first();
  if (!row) return fail(404, 'that copy is no longer kept');
  return frameResponse(toBytes(row.snapshot), { 'x-world-id': id, 'x-world-gen': String(gen), 'x-world-updated': String(row.created_at) });
}

// Build the frame for a world: its header, then every part's bytes.
async function assemble(env, world) {
  const base = { id: world.id, seed: world.seed, name: world.name, gen: world.gen };
  if (world.format === 1) {
    // Not yet rewritten in the new layout: hand back the single blob it has.
    const whole = toBytes(world.legacy);
    return encodeFrame({ v: 1, ...base, whole: { codec: world.legacy_codec || 'gzip', len: whole.byteLength } }, [whole]);
  }
  const { results } = await env.DB.prepare(
    'SELECT rx, rz, rev, codec, snapshot, bytes FROM patches WHERE world_id = ?1 ORDER BY rx, rz',
  )
    .bind(world.id)
    .all();

  const header = { v: 2, ...base, meta: null, visitor: null, patches: [] };
  const parts = [];
  if (world.meta) {
    const bytes = toBytes(world.meta);
    header.meta = { rev: world.meta_rev, codec: world.meta_codec || 'gzip', len: bytes.byteLength };
    parts.push(bytes);
  }
  if (world.visitor) {
    const bytes = toBytes(world.visitor);
    header.visitor = { codec: world.visitor_codec || 'gzip', len: bytes.byteLength };
    parts.push(bytes);
  }
  for (const row of results) {
    const bytes = toBytes(row.snapshot);
    header.patches.push({ rx: row.rx, rz: row.rz, rev: row.rev, codec: row.codec, len: bytes.byteLength });
    parts.push(bytes);
  }
  return encodeFrame(header, parts);
}

async function describe(env, id) {
  const world = await loadWorld(env, id, false);
  if (!world) return fail(404, 'no world lives at that address');
  const sums = await env.DB.prepare('SELECT count(*) AS regions, coalesce(sum(bytes), 0) AS bytes FROM patches WHERE world_id = ?1').bind(id).first();
  return json(200, {
    id: world.id,
    seed: world.seed,
    name: world.name,
    format: world.format,
    gen: world.gen,
    meta_rev: world.meta_rev,
    regions: sums.regions,
    bytes: sums.bytes + world.meta_bytes + world.visitor_bytes,
    created_at: world.created_at,
    updated_at: world.updated_at,
  });
}

async function history(env, id) {
  const { results } = await env.DB.prepare('SELECT gen, bytes, created_at FROM revisions WHERE world_id = ?1 ORDER BY gen DESC LIMIT ?2')
    .bind(id, KEEP_COPIES)
    .all();
  if (!results.length && !(await env.DB.prepare('SELECT 1 AS ok FROM worlds WHERE id = ?1').bind(id).first())) {
    return fail(404, 'no world lives at that address');
  }
  return json(200, { id, copies: results });
}

// ── Writing ─────────────────────────────────────────────────────────────────

async function create(request, env, ctx, url) {
  const seed = intParam(url, 'seed');
  if (seed === null) return fail(400, 'a world needs a ?seed');
  const body = await readBody(request);
  if (body.error) return fail(body.status, body.error);
  const parsed = readFrame(body.bytes);
  if (parsed.error) return fail(400, parsed.error);
  const name = cleanName(url.searchParams.get('name'));
  const now = Date.now();

  // Ids are random, so a clash is vanishingly unlikely — but cheap to retry.
  let id = null;
  for (let attempt = 0; attempt < 5 && !id; attempt++) {
    const candidate = newId();
    const made = await env.DB.prepare(
      `INSERT INTO worlds (id, seed, name, format, gen, created_at, updated_at)
       VALUES (?1, ?2, ?3, 2, 1, ?4, ?4) ON CONFLICT (id) DO NOTHING RETURNING id`,
    )
      .bind(candidate, seed, name, now)
      .first();
    if (made) id = candidate;
  }
  if (!id) return fail(503, 'could not mint a world id');

  const world = await loadWorld(env, id, false);
  const result = await apply(env, ctx, world, parsed, now);
  if (result.error) return fail(result.status || 400, result.error);
  return json(201, { id, seed, ...result });
}

async function save(request, env, ctx, url, id) {
  const body = await readBody(request);
  if (body.error) return fail(body.status, body.error);
  const parsed = readFrame(body.bytes);
  if (parsed.error) return fail(400, parsed.error);

  const world = await loadWorld(env, id, false);
  if (!world) return fail(404, 'no world lives at that address');

  const sums = await env.DB.prepare('SELECT coalesce(sum(bytes), 0) AS bytes FROM patches WHERE world_id = ?1').bind(id).first();
  if (sums.bytes >= MAX_WORLD && parsed.patches.length) {
    return fail(413, `this world has reached ${Math.round(MAX_WORLD / 1e6)} MB and cannot hold more`);
  }

  const now = Date.now();
  const result = await apply(env, ctx, world, parsed, now);
  if (result.error) return fail(result.status || 400, result.error);
  return json(200, { id, seed: parsed.header.seed ?? world.seed, ...result });
}

// Apply a frame to a world. Each rev-checked part stands or falls on its own,
// so a clash over one region doesn't hold up the rest of the save.
async function apply(env, ctx, world, parsed, now) {
  const { header, visitor, patches, drops } = parsed;
  let meta = parsed.meta;
  const force = header.force === true ? 1 : 0;
  const name = typeof header.name === 'string' ? cleanName(header.name) : world.name;
  const seed = Number.isInteger(header.seed) ? header.seed : world.seed;

  // A world still holding one whole blob has to be rewritten in the new
  // layout before any region row means anything — otherwise reads would keep
  // serving the old blob while patches piled up behind it. Do that first, on
  // its own, so it can't half-happen.
  let landedMeta = null;
  if (world.format === 1) {
    if (!meta) return { error: 'the first save of this world must carry its marks', status: 400 };
    const converted = await env.DB
      .prepare(
        `UPDATE worlds
            SET format = 2, legacy = NULL, legacy_codec = NULL, name = ?2, seed = ?3,
                meta = ?4, meta_codec = ?5, meta_bytes = ?6, meta_rev = 1, updated_at = ?7
          WHERE id = ?1 AND format = 1
         RETURNING meta_rev`,
      )
      .bind(world.id, name, seed, meta.bytes, meta.codec, meta.bytes.byteLength, now)
      .first();
    if (converted) {
      landedMeta = { rev: converted.meta_rev };
      meta = null; // already written; don't write it twice below
    } else {
      // Somebody converted it a moment ago: carry on as an ordinary save, and
      // let this client's stale meta revision clash rather than overwrite.
      world = await loadWorld(env, world.id, false);
      if (!world) return { error: 'no world lives at that address', status: 404 };
    }
  }

  const stmts = [];
  const plan = [];
  for (const p of patches) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO patches (world_id, rx, rz, rev, codec, snapshot, bytes, updated_at)
         VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6, ?7)
         ON CONFLICT (world_id, rx, rz) DO UPDATE
            SET rev = patches.rev + 1, codec = ?4, snapshot = ?5, bytes = ?6, updated_at = ?7
          WHERE ?9 = 1 OR patches.rev = ?8
         RETURNING rev`,
      ).bind(world.id, p.rx, p.rz, p.codec, p.bytes, p.bytes.byteLength, now, p.rev, force),
    );
    plan.push({ kind: 'patch', rx: p.rx, rz: p.rz, bytes: p.bytes.byteLength });
  }
  for (const d of drops) {
    stmts.push(
      env.DB.prepare('DELETE FROM patches WHERE world_id = ?1 AND rx = ?2 AND rz = ?3 AND (?5 = 1 OR rev = ?4) RETURNING rev').bind(
        world.id,
        d.rx,
        d.rz,
        d.rev,
        force,
      ),
    );
    plan.push({ kind: 'drop', rx: d.rx, rz: d.rz });
  }
  if (meta) {
    stmts.push(
      env.DB.prepare(
        `UPDATE worlds
            SET name = ?2, seed = ?3, meta = ?4, meta_codec = ?5, meta_bytes = ?6, meta_rev = meta_rev + 1,
                format = 2, legacy = NULL, legacy_codec = NULL, updated_at = ?7
          WHERE id = ?1 AND (?9 = 1 OR meta_rev = ?8)
         RETURNING meta_rev`,
      ).bind(world.id, name, seed, meta.bytes, meta.codec, meta.bytes.byteLength, now, meta.rev, force),
    );
    plan.push({ kind: 'meta' });
  }
  if (visitor) {
    stmts.push(
      env.DB.prepare('UPDATE worlds SET visitor = ?2, visitor_codec = ?3, visitor_bytes = ?4, updated_at = ?5 WHERE id = ?1 RETURNING id').bind(
        world.id,
        visitor.bytes,
        visitor.codec,
        visitor.bytes.byteLength,
        now,
      ),
    );
    plan.push({ kind: 'visitor' });
  }
  stmts.push(env.DB.prepare('UPDATE worlds SET gen = gen + 1, updated_at = ?2 WHERE id = ?1 RETURNING gen').bind(world.id, now));
  plan.push({ kind: 'gen' });

  const batch = await env.DB.batch(stmts);
  const landed = { patches: [], dropped: [], meta: landedMeta, gen: world.gen };
  const refused = [];
  let bytes = landedMeta ? parsed.meta.bytes.byteLength : 0;

  batch.forEach((res, i) => {
    const step = plan[i];
    const rows = res.results || [];
    const won = rows.length > 0;
    if (step.kind === 'gen') landed.gen = won ? rows[0].gen : world.gen;
    else if (step.kind === 'visitor') bytes += visitor.bytes.byteLength;
    else if (step.kind === 'meta') {
      if (won) {
        landed.meta = { rev: rows[0].meta_rev };
        bytes += meta.bytes.byteLength;
      } else refused.push(step);
    } else if (won) {
      if (step.kind === 'patch') {
        landed.patches.push({ rx: step.rx, rz: step.rz, rev: rows[0].rev });
        bytes += step.bytes;
      } else landed.dropped.push({ rx: step.rx, rz: step.rz });
    } else refused.push(step);
  });

  let clashed = refused.length ? await explain(env, world, refused, landed) : null;
  // A delete of something already gone is no clash at all.
  if (clashed && !clashed.regions.length && clashed.meta === null) clashed = null;
  if (landed.gen > world.gen) ctx.waitUntil(keepCopy(env, world.id, landed.gen, now).catch(() => {}));
  return { gen: landed.gen, bytes, patches: landed.patches, dropped: landed.dropped, meta: landed.meta, clashed };
}

// Work out what a refusal actually means: a region whose revision moved on, or
// a delete of something that was already gone (which is no clash at all).
async function explain(env, world, refused, landed) {
  const { results } = await env.DB.prepare('SELECT rx, rz, rev FROM patches WHERE world_id = ?1').bind(world.id).all();
  const here = new Map(results.map((r) => [`${r.rx},${r.rz}`, r.rev]));
  const regions = [];
  let meta = null;
  for (const step of refused) {
    if (step.kind === 'meta') {
      const row = await env.DB.prepare('SELECT meta_rev FROM worlds WHERE id = ?1').bind(world.id).first();
      meta = row ? row.meta_rev : null;
      continue;
    }
    const key = `${step.rx},${step.rz}`;
    if (step.kind === 'drop' && !here.has(key)) {
      landed.dropped.push({ rx: step.rx, rz: step.rz });
      continue;
    }
    regions.push({ rx: step.rx, rz: step.rz, rev: here.get(key) ?? 0 });
  }
  return { meta, regions };
}

// Keep a whole copy of the world now and then, so a flattened cabin can be
// fished back out. Runs after the save has already been answered.
async function keepCopy(env, id, gen, now) {
  const world = await loadWorld(env, id);
  if (!world || now - world.snapshot_at < COPY_EVERY) return;
  const frame = await assemble(env, world);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO revisions (world_id, gen, snapshot, bytes, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (world_id, gen) DO NOTHING`,
    ).bind(id, gen, frame, frame.byteLength, now),
    env.DB.prepare('UPDATE worlds SET snapshot_at = ?2 WHERE id = ?1').bind(id, now),
    env.DB.prepare(
      'DELETE FROM revisions WHERE world_id = ?1 AND gen NOT IN (SELECT gen FROM revisions WHERE world_id = ?1 ORDER BY gen DESC LIMIT ?2)',
    ).bind(id, KEEP_COPIES),
  ]);
}

// ── Reading a frame off the wire ────────────────────────────────────────────

function readFrame(bytes) {
  const { header, take } = decodeFrame(bytes);
  if (header.v !== 2) return { error: 'this save server only takes v2 worlds' };
  const patches = [];
  const drops = [];

  const part = (spec, cap, what) => {
    if (!spec || typeof spec !== 'object') return null;
    if (!CODECS.has(spec.codec)) return { error: `unknown codec for ${what}` };
    if (!Number.isInteger(spec.len) || spec.len < 1 || spec.len > cap) return { error: `${what} is too big` };
    return { codec: spec.codec, rev: revOf(spec.rev), bytes: take(spec.len) };
  };

  // Parts come in header order: meta, visitor, then the regions.
  const meta = part(header.meta, MAX_PART, 'the marks');
  if (meta && meta.error) return meta;
  const visitor = part(header.visitor, MAX_VISITOR, 'your own state');
  if (visitor && visitor.error) return visitor;

  const list = Array.isArray(header.patches) ? header.patches : [];
  if (list.length > MAX_PATCHES) return { error: 'too many regions in one save' };
  for (const spec of list) {
    if (!inBounds(spec && spec.rx) || !inBounds(spec && spec.rz)) return { error: 'a region is off the map' };
    const p = part(spec, MAX_PART, `region ${spec.rx},${spec.rz}`);
    if (!p) return { error: 'a region is missing its description' };
    if (p.error) return p;
    patches.push({ ...p, rx: spec.rx, rz: spec.rz });
  }

  const dropList = Array.isArray(header.drop) ? header.drop : [];
  if (dropList.length > MAX_PATCHES) return { error: 'too many regions in one save' };
  for (const d of dropList) {
    if (!inBounds(d && d.rx) || !inBounds(d && d.rz)) return { error: 'a region is off the map' };
    drops.push({ rx: d.rx, rz: d.rz, rev: revOf(d.rev) });
  }
  return { header, meta, visitor, patches, drops };
}

const inBounds = (v) => Number.isInteger(v) && v > -LIMIT && v < LIMIT;
const revOf = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

// ── Plumbing ────────────────────────────────────────────────────────────────

function loadWorld(env, id, withBlobs = true) {
  const columns = withBlobs
    ? 'id, seed, name, format, gen, meta, meta_codec, meta_bytes, meta_rev, visitor, visitor_codec, visitor_bytes, legacy, legacy_codec, snapshot_at, created_at, updated_at'
    : 'id, seed, name, format, gen, meta_bytes, meta_rev, visitor_bytes, snapshot_at, created_at, updated_at';
  return env.DB.prepare(`SELECT ${columns} FROM worlds WHERE id = ?1`).bind(id).first();
}

async function readBody(request) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY) return tooBig();
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BODY) return tooBig();
  if (!bytes.byteLength) return { status: 400, error: 'that save is empty' };
  return { bytes };
}

const tooBig = () => ({ status: 413, error: `a single save may not exceed ${Math.round(MAX_BODY / 1000)} kB compressed` });

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
  throw new Error(`cannot read a part stored as ${typeof value}`);
}

const frameResponse = (bytes, headers) =>
  new Response(bytes, {
    headers: { 'content-type': 'application/octet-stream', 'content-length': String(bytes.byteLength), 'cache-control': 'no-store', ...headers },
  });

const json = (status, data, headers) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

const fail = (status, error) => json(status, { error });
const notAllowed = (allow) => json(405, { error: `only ${allow} here` }, { allow });
