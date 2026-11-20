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
// It also relays where everyone is standing, and anything else people here
// say to each other (`say`: setting up a call, who is talking), none of which
// is ever stored.
//
// And it knows who is who. Everything but `meta` needs a sign-in (see
// members.js): the first time, someone picks a name and a password; after
// that a cookie says who they are. What is yours alone in a world — where
// you stood, what you carried — is kept against your name, so whoever comes
// back finds their own, not whatever the last person left.

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
const MAX_PEOPLE = 500; // names in one world
const MAX_TRIES = 8; // wrong passwords in a row before a name is rested
const REST = 5 * 60 * 1000; // ms a name is rested for after that
const KEEP_SIGN_INS = 20; // per person: browsers they are signed in on
const MAX_SIGN_IN = 4096; // bytes: a name and a password, as JSON
const MAX_SAY = 16384; // bytes: one thing said, as JSON (a call's offer is a few kB)
const CHANNEL_RE = /^[a-z][a-z0-9-]{0,23}$/; // what a channel is called

import { encodeFrame } from '../src/save/frame.js';
import { cleanName, nameKey, nameProblem, passwordProblem, NOT_SIGNED_IN } from '../src/save/who.js';
import { hashPassword, checkPassword, newToken, tokenId, readCookie, sessionCookie, clearCookie, SESSION_LIFE } from './members.js';
import { iceServers } from './ice.js';

export class World {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.live = new Map(); // ws -> { id, member, name, x, z, yaw, colour }
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
      CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, key TEXT NOT NULL UNIQUE, password TEXT NOT NULL,
        visitor TEXT, tries INTEGER NOT NULL DEFAULT 0, rested_until INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, member INTEGER NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS packed (one INTEGER PRIMARY KEY CHECK (one = 1), part BLOB, gen INTEGER);
      DROP TABLE IF EXISTS cache;
    `);
    // (cache held whole frames, which carried one visitor's state for
    // everyone; packed holds only the world, and each person's goes on top.)
  }

  // ── HTTP ──────────────────────────────────────────────────────────────────
  async fetch(request) {
    const url = new URL(request.url);
    const what = url.pathname.replace(/^\/+/, '');
    // what the cookie needs: which world's path it is for, and whether the
    // site is on https
    const door = { id: request.headers.get('x-world-id') || '', secure: request.headers.get('x-world-https') === '1' };

    if (what === 'create') return this.#create(request, url, door);

    // Who is asking, if anyone. Before the world is read: this waits on a
    // hash, and the world may move on meanwhile.
    const you = await this.#you(request);
    const world = this.#world();
    if (!world) return fail(404, 'no world lives at that address');

    if (what === 'meta') return json(200, this.#meta(world));
    if (what === 'members') return this.#newMember(request, door);
    if (what === 'session') return request.method === 'DELETE' ? this.#signOut(request, door) : this.#signIn(request, door);

    // Everything else is for people the world knows.
    if (what === 'live') return this.#arrive(request, url, world, you);
    if (!you) return json(401, { error: 'say who you are to come in', world: world.name });
    if (what === 'open') return frameResponse(await this.#frame(world, you), world);
    if (what === 'ops') return this.#take(request, world, you);
    // how to reach each other, to talk (see ice.js)
    if (what === 'voice') return json(200, { iceServers: await iceServers(this.env) });
    if (what === 'history') return json(200, { id: world.id, copies: this.#rows('SELECT gen, bytes, created_at FROM copies ORDER BY gen DESC') });
    if (what.startsWith('copy/')) {
      const gen = Number(what.slice(5));
      const row = this.#row('SELECT frame, created_at FROM copies WHERE gen = ?', gen);
      if (!row) return fail(404, 'that copy is no longer kept');
      return frameResponse(toBytes(row.frame), world);
    }
    return fail(404, 'no such endpoint');
  }

  // Whoever makes a world is its first person: `you` in the body is the name
  // and password they picked, and they come away signed in.
  async #create(request, url, door) {
    if (this.#world()) return fail(409, 'that world already exists');
    const seed = int(url.searchParams.get('seed'));
    if (seed === null) return fail(400, 'a world needs a ?seed');
    const body = await this.#body(request);
    if (body.error) return fail(body.status, body.error);
    const who = credentials(body.data.you);
    const problem = nameProblem(who.name) || passwordProblem(who.password);
    if (problem) return fail(400, problem);
    const password = await hashPassword(who.password);
    // hashing takes a moment, and other requests run meanwhile
    if (this.#world()) return fail(409, 'that world already exists');
    const now = Date.now();
    this.sql.exec(
      'INSERT INTO world (one, id, seed, name, gen, created_at, updated_at) VALUES (1, ?, ?, ?, 0, ?, ?)',
      door.id,
      seed,
      clean(body.data.name),
      now,
      now,
    );
    const member = this.#addMember(who.name, password, null, now);
    const world = this.#world();
    const taken = this.#apply(world, body.data, null, now, member.id);
    if (taken.error) return fail(400, taken.error);
    return json(201, { id: door.id, seed, name: world.name, you: member.name, ...taken }, { 'set-cookie': await this.#remember(member, door) });
  }

  // Ops over HTTP: the way a big first save goes out, and the way any save
  // goes out when the socket is down.
  async #take(request, world, you) {
    if (request.method !== 'POST') return fail(405, 'only POST here');
    const body = await this.#body(request);
    if (body.error) return fail(body.status, body.error);
    const taken = this.#apply(this.#world() || world, body.data, null, Date.now(), you.id);
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

  // ── Who is who ────────────────────────────────────────────────────────────
  // Someone new picks a name and a password.
  async #newMember(request, door) {
    const who = await this.#signInBody(request);
    if (who.error) return fail(who.status, who.error);
    const problem = nameProblem(who.name) || passwordProblem(who.password);
    if (problem) return fail(400, problem);
    const taken = `someone here already goes by ${who.name} — if that's you, sign in`;
    if (this.#member(who.name)) return fail(409, taken);
    if (this.#count('members') >= MAX_PEOPLE) return fail(403, 'this world has as many people in it as it can hold');
    const password = await hashPassword(who.password);
    if (this.#member(who.name)) return fail(409, taken); // in the moment hashing took
    // A world saved before there were names kept one note of "your own
    // state" for everybody. The first person to give a name gets it: almost
    // always whoever made the world, coming back to it.
    const old = this.#count('members') === 0 ? this.#world().visitor : null;
    const member = this.#addMember(who.name, password, old, Date.now());
    if (old) this.sql.exec('UPDATE world SET visitor = NULL WHERE one = 1');
    return json(201, { name: member.name }, { 'set-cookie': await this.#remember(member, door) });
  }

  // Someone coming back from another browser, or after signing out.
  async #signIn(request, door) {
    const who = await this.#signInBody(request);
    if (who.error) return fail(who.status, who.error);
    const member = this.#member(who.name);
    if (!member) return fail(403, `nobody here goes by ${who.name || 'that name'} — new here? pick a name`);
    const now = Date.now();
    if (member.rested_until > now) {
      const minutes = Math.ceil((member.rested_until - now) / 60000);
      return fail(429, `too many wrong passwords for ${member.name} — try again in ${minutes} minute${minutes === 1 ? '' : 's'}`);
    }
    if (!(await checkPassword(who.password, member.password))) {
      const tries = (this.#member(who.name)?.tries || 0) + 1;
      const rest = tries >= MAX_TRIES;
      this.sql.exec('UPDATE members SET tries = ?, rested_until = ? WHERE id = ?', rest ? 0 : tries, rest ? now + REST : 0, member.id);
      return fail(403, `that isn't ${member.name}'s password`);
    }
    this.sql.exec('UPDATE members SET tries = 0, rested_until = 0 WHERE id = ?', member.id);
    return json(200, { name: member.name }, { 'set-cookie': await this.#remember(member, door) });
  }

  async #signOut(request, door) {
    const token = readCookie(request.headers.get('cookie'));
    if (token) this.sql.exec('DELETE FROM sessions WHERE token = ?', await tokenId(token));
    return json(200, { signedOut: true }, { 'set-cookie': clearCookie(door.id, door) });
  }

  // The person a request's cookie says it is, or null.
  async #you(request) {
    const token = readCookie(request.headers.get('cookie'));
    if (!token) return null;
    const row = this.#row(
      'SELECT m.id, m.name, m.visitor, s.created_at AS since FROM sessions s JOIN members m ON m.id = s.member WHERE s.token = ?',
      await tokenId(token),
    );
    return row && Date.now() - row.since < SESSION_LIFE ? row : null;
  }

  // Sign this browser in as `member`. -> the Set-Cookie header.
  async #remember(member, door) {
    const token = newToken();
    const now = Date.now();
    this.sql.exec('INSERT INTO sessions (token, member, created_at) VALUES (?, ?, ?)', await tokenId(token), member.id, now);
    // the long-gone, and all but someone's most recent browsers
    this.sql.exec('DELETE FROM sessions WHERE created_at < ?', now - SESSION_LIFE);
    this.sql.exec(
      'DELETE FROM sessions WHERE member = ? AND token NOT IN (SELECT token FROM sessions WHERE member = ? ORDER BY created_at DESC LIMIT ?)',
      member.id,
      member.id,
      KEEP_SIGN_INS,
    );
    return sessionCookie(door.id, token, door);
  }

  #addMember(name, password, visitor, now) {
    this.sql.exec('INSERT INTO members (name, key, password, visitor, created_at) VALUES (?, ?, ?, ?, ?)', name, nameKey(name), password, visitor, now);
    return this.#member(name);
  }

  #member(name) {
    return name ? this.#row('SELECT id, name, password, tries, rested_until FROM members WHERE key = ?', nameKey(name)) : null;
  }

  async #signInBody(request) {
    if (request.method !== 'POST') return { status: 405, error: 'only POST here' };
    const text = await request.text();
    if (text.length > MAX_SIGN_IN) return { status: 413, error: 'that is too long for a name and a password' };
    try {
      return credentials(JSON.parse(text));
    } catch {
      return { status: 400, error: 'that sign-in is not readable' };
    }
  }

  #count(table) {
    return this.#row(`SELECT count(*) AS n FROM ${table}`).n;
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
  // `from` is the socket they came in on, which doesn't need them back;
  // `member` is who sent them, whose own state (data.visitor) rides along.
  #apply(world, data, from, now, member) {
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
      this.sql.exec('DELETE FROM packed WHERE one = 1');
    }

    const name = typeof data.name === 'string' ? clampName(data.name) : world.name;
    this.sql.exec('UPDATE world SET gen = ?, name = ?, updated_at = ? WHERE one = 1', gen, name, now);
    if (member && data.visitor !== undefined) this.sql.exec('UPDATE members SET visitor = ? WHERE id = ?', JSON.stringify(data.visitor), member);

    if (clean.length) {
      this.#tell({ t: 'ops', gen, ops: clean }, from);
      if (now - world.copied_at > COPY_EVERY) this.ctx.waitUntil(this.#keepCopy(gen, now).catch(() => {}));
    }
    return { gen, took: clean.length };
  }

  // Everything, as one frame: a small header — with your own state in it, if
  // it is for you — and the whole element map gzipped.
  async #frame(world, you = null) {
    const part = await this.#packed(world);
    return encodeFrame(
      {
        v: 3,
        id: world.id,
        seed: world.seed,
        name: world.name,
        gen: world.gen,
        you: you ? you.name : '',
        visitor: you && you.visitor ? JSON.parse(you.visitor) : null,
        codec: 'gzip',
        len: part.byteLength,
      },
      [part],
    );
  }

  // The element map, gzipped, kept until the world next changes.
  async #packed(world) {
    const cached = this.#row('SELECT part, gen FROM packed WHERE one = 1');
    if (cached && cached.gen === world.gen) return toBytes(cached.part);
    const regions = {};
    for (const row of this.#rows('SELECT r, k, v FROM elements ORDER BY r')) {
      (regions[row.r] || (regions[row.r] = {}))[row.k] = JSON.parse(row.v);
    }
    const part = await gzip(JSON.stringify(regions));
    this.sql.exec('INSERT INTO packed (one, part, gen) VALUES (1, ?, ?) ON CONFLICT (one) DO UPDATE SET part = excluded.part, gen = excluded.gen', part, world.gen);
    return part;
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
  #arrive(request, url, world, you) {
    if (request.headers.get('upgrade') !== 'websocket') return fail(426, 'open this one as a websocket');
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    if (!you) {
      // Not a hibernating socket: it is never one of the people here.
      server.accept();
      server.close(NOT_SIGNED_IN, 'say who you are to come in');
      return new Response(null, { status: 101, webSocket: client });
    }
    // Hibernation: the socket survives this object going to sleep.
    this.ctx.acceptWebSocket(server);
    const id = this.#newPeerId();
    // the same colour for the same person, whichever browser they come in on
    server.serializeAttachment({ id, member: you.id, name: you.name, colour: PEER_COLOURS[(you.id - 1) % PEER_COLOURS.length] });
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
    if (!me) return;
    if (msg.t === 'at') {
      // Where someone is standing. Never stored, just passed on, under the
      // name they signed in with.
      Object.assign(me, standing(msg));
      this.#tell({ t: 'at', id: me.id, x: me.x, z: me.z, yaw: me.yaw, ms: me.ms, name: me.name, colour: me.colour }, ws);
      return;
    }
    if (msg.t === 'say') {
      // Something said to everyone else here, or to one of them: passed on,
      // never stored, under the name it was said in. Voice sets its calls up
      // this way, and says who is talking (src/voice/).
      const said = sayable(msg);
      if (!said) return;
      const out = { t: 'say', ch: said.ch, from: me.id, name: me.name, body: said.body };
      if (said.to === null) return this.#tell(out, ws);
      const them = this.#socketOf(said.to);
      if (them && them !== ws) send(them, JSON.stringify(out));
      return;
    }
    if (msg.t === 'ops') {
      const world = this.#world();
      if (!world) return;
      const took = this.#apply(world, msg, ws, Date.now(), me.member);
      ws.send(JSON.stringify({ t: 'ack', for: msg.id ?? null, ...took }));
      return;
    }
    if (msg.t === 'resync') {
      const world = this.#world();
      if (world) ws.send(JSON.stringify({ t: 'reopen', gen: world.gen }));
    }
  }

  webSocketClose(ws) {
    // (read from the attachment if it hasn't spoken since this object woke)
    const me = this.#peer(ws);
    this.live.delete(ws);
    if (me) this.#tell({ t: 'gone', id: me.id }, ws);
  }

  webSocketError(ws) {
    this.webSocketClose(ws);
  }

  // Who a socket is survives hibernation in its attachment; where someone is
  // standing does not, and doesn't need to — they say again within a moment.
  // -> null for a socket nobody signed in on.
  #peer(ws) {
    let me = this.live.get(ws);
    if (!me) {
      const kept = ws.deserializeAttachment() || {};
      if (!kept.member) return null;
      this.live.set(ws, (me = { id: kept.id || `p${this.nextPeer++}`, member: kept.member, name: kept.name || '', colour: kept.colour || PEER_COLOURS[0], x: 0, z: 0, yaw: 0 }));
    }
    return me;
  }

  // Ids are only for while someone is here, but they outlive this object
  // going to sleep, in each socket's attachment: a new one must not take an
  // id that a socket from before the nap still answers to.
  #newPeerId() {
    let n = this.nextPeer;
    for (const ws of this.ctx.getWebSockets()) {
      const k = Number(String((ws.deserializeAttachment() || {}).id || '').slice(1));
      if (Number.isInteger(k) && k >= n) n = k + 1;
    }
    this.nextPeer = n + 1;
    return `p${n}`;
  }

  #socketOf(id) {
    for (const ws of this.ctx.getWebSockets()) if (this.#peer(ws)?.id === id) return ws;
    return null;
  }

  #here(except) {
    const out = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const me = this.live.get(ws);
      if (me && Number.isFinite(me.x)) out.push({ id: me.id, x: me.x, z: me.z, yaw: me.yaw, ms: me.ms, name: me.name, colour: me.colour });
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
    for (const ws of this.ctx.getWebSockets()) if (ws !== except) send(ws, text);
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

// Where someone says they are standing, as passed on: { x, z, yaw, ms }.
// `ms` is when, on their own clock; a build that doesn't say leaves it out.
export function standing(msg) {
  return { x: num(msg.x), z: num(msg.z), yaw: num(msg.yaw), ms: Number.isFinite(msg.ms) ? msg.ms : undefined };
}

// What someone said, if it can be passed on: { ch, to, body }, or null.
export function sayable(msg) {
  if (typeof msg.ch !== 'string' || !CHANNEL_RE.test(msg.ch)) return null;
  const to = msg.to === undefined || msg.to === null ? null : msg.to;
  if (to !== null && (typeof to !== 'string' || !to.length || to.length > 16)) return null;
  let text;
  try {
    text = JSON.stringify(msg.body ?? null);
  } catch {
    return null;
  }
  if (text.length > MAX_SAY) return null;
  return { ch: msg.ch, to, body: msg.body ?? null };
}

function send(ws, text) {
  try {
    ws.send(text);
  } catch {
    /* on its way out; close will tidy up */
  }
}

const int = (raw) => (raw === null || raw === '' || !Number.isInteger(Number(raw)) ? null : Number(raw));
const num = (v) => (Number.isFinite(v) ? v : 0);
const clampName = (raw) => (raw || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_NAME);
const clean = clampName;
// A name and a password, as sent: the name tidied, the password as typed.
const credentials = (raw) => ({ name: cleanName(raw && raw.name), password: raw && typeof raw.password === 'string' ? raw.password : '' });

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

const json = (status, data, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

const fail = (status, error) => json(status, { error });
