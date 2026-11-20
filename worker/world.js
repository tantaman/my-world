// One Durable Object per world: the single place a world is agreed on.
//
// It holds the world in its own SQLite, as keyed elements grouped by 64 m
// region (src/save/regions.js decides the keys; nothing here knows what a log
// or a ground vertex is). Everyone building in the world keeps a WebSocket
// open to this object, and every change travels as an op:
//
//     { r: "0,-1", k: "t:120:-40", v: [-0.42, 1] }     // v: null = gone
//
// Ops arrive here, get a generation number, are written, and go straight back
// out to everyone else. Because this object is the only writer, the order it
// takes them in *is* the order — there is nothing to reconcile and nothing to
// roll back. Two people digging the same hole both get their way, element by
// element; the only thing that can be lost is the older of two writes to the
// very same thing, which is the right answer anyway.
//
// It also relays where everyone is standing, which is never stored.

const MAX_OPS = 5000; // in one batch
const MAX_KEY = 160;
const MAX_VALUE = 4096; // a single element, as JSON
const MAX_ELEMENTS = 500_000; // per world
const MAX_BODY = 4_000_000; // one HTTP batch, compressed
const KEEP_OPS = 400; // batches held for catching up after a blip
const MAX_CATCHUP = 2000; // past this many changes it is cheaper to open the world again
const KEEP_COPIES = 20;
const COPY_EVERY = 10 * 60 * 1000;
const MAX_NAME = 80;
const PEER_COLOURS = ['#d9b45a', '#d0563f', '#4f8fd6', '#3fb5a0', '#a46fd1', '#e08a4b', '#78c061'];

import { encodeFrame } from '../src/save/frame.js';

export class World {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.live = new Map(); // ws -> { id, name, x, z, yaw, colour }
    this.nextPeer = 1;
    ctx.blockConcurrencyWhile(async () => this.#schema());
  }

  #schema() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS world (
        one INTEGER PRIMARY KEY CHECK (one = 1),
        id TEXT NOT NULL, seed INTEGER NOT NULL, name TEXT NOT NULL DEFAULT '',
        gen INTEGER NOT NULL DEFAULT 0, visitor TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, copied_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS elements (r TEXT NOT NULL, k TEXT NOT NULL, v TEXT NOT NULL, PRIMARY KEY (r, k));
      CREATE TABLE IF NOT EXISTS ops (seq INTEGER PRIMARY KEY AUTOINCREMENT, gen INTEGER NOT NULL, body TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS copies (gen INTEGER PRIMARY KEY, frame BLOB NOT NULL, bytes INTEGER NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cache (one INTEGER PRIMARY KEY CHECK (one = 1), frame BLOB, gen INTEGER);
    `);
  }

  // ── HTTP ──────────────────────────────────────────────────────────────────
  async fetch(request) {
    const url = new URL(request.url);
    const what = url.pathname.replace(/^\/+/, '');
    const id = request.headers.get('x-world-id') || '';

    if (what === 'live') return this.#join(request, url);
    if (what === 'create') return this.#create(request, url, id);

    const world = this.#world();
    if (!world) return fail(404, 'no world lives at that address');

    if (what === 'open') return frameResponse(await this.#frame(world), world);
    if (what === 'ops') return this.#take(request, world);
    if (what === 'meta') return json(200, this.#meta(world));
    if (what === 'history') return json(200, { id: world.id, copies: this.#rows('SELECT gen, bytes, created_at FROM copies ORDER BY gen DESC') });
    if (what.startsWith('copy/')) {
      const gen = Number(what.slice(5));
      const row = this.#row('SELECT frame, created_at FROM copies WHERE gen = ?', gen);
      if (!row) return fail(404, 'that copy is no longer kept');
      return frameResponse(toBytes(row.frame), world);
    }
    return fail(404, 'no such endpoint');
  }

  async #create(request, url, id) {
    if (this.#world()) return fail(409, 'that world already exists');
    const seed = int(url.searchParams.get('seed'));
    if (seed === null) return fail(400, 'a world needs a ?seed');
    const body = await this.#body(request);
    if (body.error) return fail(body.status, body.error);
    const now = Date.now();
    this.sql.exec(
      'INSERT INTO world (one, id, seed, name, gen, created_at, updated_at) VALUES (1, ?, ?, ?, 0, ?, ?)',
      id,
      seed,
      clean(body.data.name),
      now,
      now,
    );
    const world = this.#world();
    const taken = this.#apply(world, body.data, null, now);
    if (taken.error) return fail(400, taken.error);
    return json(201, { id, seed, name: world.name, ...taken });
  }

  // Ops over HTTP: the way a big first save goes out, and the way any save
  // goes out when the socket is down.
  async #take(request, world) {
    if (request.method !== 'POST') return fail(405, 'only POST here');
    const body = await this.#body(request);
    if (body.error) return fail(body.status, body.error);
    const taken = this.#apply(world, body.data, null, Date.now());
    if (taken.error) return fail(400, taken.error);
    return json(200, { id: world.id, ...taken });
  }

  async #body(request) {
    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BODY) return { status: 413, error: 'that save is too big to send at once' };
    const raw = new Uint8Array(await request.arrayBuffer());
    if (!raw.byteLength) return { status: 400, error: 'that save is empty' };
    if (raw.byteLength > MAX_BODY) return { status: 413, error: 'that save is too big to send at once' };
    try {
      const text = request.headers.get('x-world-codec') === 'gzip' ? await gunzip(raw) : new TextDecoder().decode(raw);
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object') throw new Error('not an object');
      return { data };
    } catch {
      return { status: 400, error: 'that save is not readable' };
    }
  }

  // ── The world ─────────────────────────────────────────────────────────────
  #world() {
    return this.#row('SELECT id, seed, name, gen, visitor, created_at, updated_at, copied_at FROM world WHERE one = 1');
  }

  #meta(world) {
    const sums = this.#row('SELECT count(*) AS elements, count(DISTINCT r) AS regions FROM elements');
    return { id: world.id, seed: world.seed, name: world.name, gen: world.gen, ...sums, created_at: world.created_at, updated_at: world.updated_at };
  }

  // Take a batch of ops: write them, number them, and hand them on.
  // `from` is the socket they came in on, which doesn't need them back.
  #apply(world, data, from, now) {
    const ops = Array.isArray(data.ops) ? data.ops : [];
    if (ops.length > MAX_OPS) return { error: 'too many changes in one go' };

    const clean = [];
    for (const op of ops) {
      const bad = badOp(op);
      if (bad) return { error: bad };
      clean.push(op);
    }
    if (clean.length) {
      const count = this.#row('SELECT count(*) AS n FROM elements').n;
      const adding = clean.filter((o) => o.v !== null && o.v !== undefined).length;
      if (count + adding > MAX_ELEMENTS) return { error: 'this world has as much in it as it can hold' };
    }

    let gen = world.gen;
    if (clean.length) {
      gen += 1;
      for (const op of clean) {
        if (op.v === null || op.v === undefined) this.sql.exec('DELETE FROM elements WHERE r = ? AND k = ?', op.r, op.k);
        else this.sql.exec('INSERT INTO elements (r, k, v) VALUES (?, ?, ?) ON CONFLICT (r, k) DO UPDATE SET v = excluded.v', op.r, op.k, JSON.stringify(op.v));
      }
      this.sql.exec('INSERT INTO ops (gen, body, at) VALUES (?, ?, ?)', gen, JSON.stringify(clean), now);
      this.sql.exec('DELETE FROM ops WHERE seq <= (SELECT max(seq) FROM ops) - ?', KEEP_OPS);
      this.sql.exec('DELETE FROM cache WHERE one = 1');
    }

    const name = typeof data.name === 'string' ? clampName(data.name) : world.name;
    const visitor = data.visitor !== undefined ? JSON.stringify(data.visitor) : world.visitor;
    this.sql.exec('UPDATE world SET gen = ?, name = ?, visitor = ?, updated_at = ? WHERE one = 1', gen, name, visitor, now);

    if (clean.length) {
      this.#tell({ t: 'ops', gen, ops: clean }, from);
      if (now - world.copied_at > COPY_EVERY) this.ctx.waitUntil(this.#keepCopy(gen, now).catch(() => {}));
    }
    return { gen, took: clean.length };
  }

  // Everything, as one frame: a small header and the whole element map gzipped.
  async #frame(world) {
    const cached = this.#row('SELECT frame, gen FROM cache WHERE one = 1');
    if (cached && cached.gen === world.gen) return toBytes(cached.frame);

    const regions = {};
    for (const row of this.#rows('SELECT r, k, v FROM elements ORDER BY r')) {
      (regions[row.r] || (regions[row.r] = {}))[row.k] = JSON.parse(row.v);
    }
    const part = await gzip(JSON.stringify(regions));
    const frame = encodeFrame(
      {
        v: 3,
        id: world.id,
        seed: world.seed,
        name: world.name,
        gen: world.gen,
        visitor: world.visitor ? JSON.parse(world.visitor) : null,
        codec: 'gzip',
        len: part.byteLength,
      },
      [part],
    );
    this.sql.exec('INSERT INTO cache (one, frame, gen) VALUES (1, ?, ?) ON CONFLICT (one) DO UPDATE SET frame = excluded.frame, gen = excluded.gen', frame, world.gen);
    return frame;
  }

  async #keepCopy(gen, now) {
    const world = this.#world();
    if (!world || now - world.copied_at < COPY_EVERY) return;
    const frame = await this.#frame(world);
    this.sql.exec('INSERT INTO copies (gen, frame, bytes, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (gen) DO NOTHING', gen, frame, frame.byteLength, now);
    this.sql.exec('UPDATE world SET copied_at = ? WHERE one = 1', now);
    this.sql.exec('DELETE FROM copies WHERE gen NOT IN (SELECT gen FROM copies ORDER BY gen DESC LIMIT ?)', KEEP_COPIES);
  }

  // ── Everyone who is here ──────────────────────────────────────────────────
  #join(request, url) {
    if (request.headers.get('upgrade') !== 'websocket') return fail(426, 'open this one as a websocket');
    const world = this.#world();
    if (!world) return fail(404, 'no world lives at that address');
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // Hibernation: the socket survives this object going to sleep.
    this.ctx.acceptWebSocket(server);
    const id = `p${this.nextPeer++}`;
    server.serializeAttachment({ id, colour: PEER_COLOURS[(this.nextPeer - 2) % PEER_COLOURS.length] });
    const since = int(url.searchParams.get('since'));
    server.send(JSON.stringify({ t: 'welcome', you: id, gen: world.gen, name: world.name, here: this.#here(server), ...this.#catchUp(world, since) }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string') return;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const me = this.#peer(ws);
    if (msg.t === 'at') {
      // Where someone is standing. Never stored, just passed on.
      me.x = num(msg.x);
      me.z = num(msg.z);
      me.yaw = num(msg.yaw);
      if (typeof msg.name === 'string') me.name = msg.name.slice(0, 40);
      this.#tell({ t: 'at', id: me.id, x: me.x, z: me.z, yaw: me.yaw, name: me.name, colour: me.colour }, ws);
      return;
    }
    if (msg.t === 'ops') {
      const world = this.#world();
      if (!world) return;
      const took = this.#apply(world, msg, ws, Date.now());
      ws.send(JSON.stringify({ t: 'ack', for: msg.id ?? null, ...took }));
      return;
    }
    if (msg.t === 'resync') {
      const world = this.#world();
      if (world) ws.send(JSON.stringify({ t: 'reopen', gen: world.gen }));
    }
  }

  webSocketClose(ws) {
    const me = this.live.get(ws);
    this.live.delete(ws);
    if (me) this.#tell({ t: 'gone', id: me.id }, ws);
  }

  webSocketError(ws) {
    this.webSocketClose(ws);
  }

  // Identity survives hibernation in the socket's attachment; where someone is
  // standing does not, and doesn't need to — they say again within a moment.
  #peer(ws) {
    let me = this.live.get(ws);
    if (!me) {
      const kept = ws.deserializeAttachment() || {};
      this.live.set(ws, (me = { id: kept.id || `p${this.nextPeer++}`, colour: kept.colour || PEER_COLOURS[0], name: '', x: 0, z: 0, yaw: 0 }));
    }
    return me;
  }

  #here(except) {
    const out = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const me = this.live.get(ws);
      if (me && Number.isFinite(me.x)) out.push({ id: me.id, x: me.x, z: me.z, yaw: me.yaw, name: me.name, colour: me.colour });
    }
    return out;
  }

  // Ops since a generation, for a client that blinked. Null if we no longer
  // hold enough history and they should just open the world again.
  #catchUp(world, since) {
    if (since === null || since >= world.gen) return {};
    const oldest = this.#row('SELECT min(gen) AS g FROM ops');
    if (!oldest || oldest.g === null || oldest.g > since + 1) return { reopen: true };
    const ops = [];
    for (const row of this.#rows('SELECT body FROM ops WHERE gen > ? ORDER BY gen', since)) {
      ops.push(...JSON.parse(row.body));
      // Past a point, sending the whole world again is less work than
      // replaying every change that made it.
      if (ops.length > MAX_CATCHUP) return { reopen: true };
    }
    return { missed: ops };
  }

  #tell(message, except) {
    const text = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(text);
      } catch {
        /* on its way out; close will tidy up */
      }
    }
  }

  // ── SQLite ────────────────────────────────────────────────────────────────
  #rows(sql, ...binds) {
    return this.sql.exec(sql, ...binds).toArray();
  }

  #row(sql, ...binds) {
    return this.#rows(sql, ...binds)[0] || null;
  }
}

// ── Plumbing ────────────────────────────────────────────────────────────────

function badOp(op) {
  if (!op || typeof op !== 'object') return 'a change arrived empty';
  if (typeof op.r !== 'string' || !op.r.length || op.r.length > 32) return 'a change has no place';
  if (typeof op.k !== 'string' || !op.k.length || op.k.length > MAX_KEY) return 'a change has no name';
  if (op.v === null || op.v === undefined) return null;
  let text;
  try {
    text = JSON.stringify(op.v);
  } catch {
    return 'a change could not be written down';
  }
  if (text.length > MAX_VALUE) return 'a single thing cannot be that big';
  return null;
}

const int = (raw) => (raw === null || raw === '' || !Number.isInteger(Number(raw)) ? null : Number(raw));
const num = (v) => (Number.isFinite(v) ? v : 0);
const clampName = (raw) => (raw || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_NAME);
const clean = clampName;

async function gzip(text) {
  const bytes = new TextEncoder().encode(text);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function toBytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return new Uint8Array(value);
  throw new Error(`cannot read a frame stored as ${typeof value}`);
}

const frameResponse = (bytes, world) =>
  new Response(bytes, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(bytes.byteLength),
      'cache-control': 'no-store',
      'x-world-id': world.id,
      'x-world-gen': String(world.gen),
    },
  });

const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const fail = (status, error) => json(status, { error });
