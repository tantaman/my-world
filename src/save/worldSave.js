// Keeping a world, and sharing it with whoever else is in it.
//
// Two modes, and the game plays the same in both:
//
//   no ?w=   nothing is sent anywhere. The world lives in this browser only,
//            exactly as it did before there was a save server.
//   ?w=id    the world lives in its own Durable Object. Everyone in it holds a
//            socket open; changes go up as ops and come back down from
//            everyone else, and you can see each other walking around.
//
// Changes are found by *diffing*, not by instrumenting every swing of the axe:
// a few times a second the world is reduced to its elements and compared with
// what the server is known to hold. Nothing can be forgotten that way, and a
// change someone else made arrives as an op, is folded into both the world and
// that baseline, and so never bounces back out again.
//
// Nothing here predicts or rolls back. Your own edits are already on the
// screen the instant you make them; the object is the only writer, so its
// order is the order; and a change that loses a race loses it on one element.

import { collectSnapshot, validateSnapshot } from './snapshot.js';
import { toElements, fromElements, diffElements, applyOps, cloneElements } from './regions.js';
import { applyRemote } from './apply.js';
import { Live } from './live.js';
import { createWorld, openWorld, sendOps, WorldError } from './remote.js';

const CACHE_KEY = (id) => `my-world:world:${id}`;
// Wall-clock, not frame time: the render loop clamps its dt to 50 ms, so below
// 20 fps accumulated frame time runs behind the clock.
const LIVE_LULL = 250; // ms of quiet before changes go out over the socket
const SLOW_LULL = 3000; // and when there is no socket to send them over
const AT_EVERY = 150; // ms between telling everyone where you are
const BIG_BATCH = 400; // ops; more than this goes over HTTP instead
const BACKOFF = [1000, 2000, 5000, 10000, 30000];

export class WorldSave {
  constructor() {
    this.id = null;
    this.seed = 0;
    this.gen = 0;
    this.name = '';
    this.status = 'local'; // local | live | saved | saving | offline | full | gone
    this.detail = '';
    this.dirty = false;
    this.changedAt = 0;
    this.holdUntil = 0;
    this.attempt = 0;
    this.pushing = null;
    this.adopting = false; // folding in someone else's change
    this.onStatus = null;
    this.parts = null;
    this.peers = null;
    this.live = null;
    this.elements = new Map(); // what the server is known to hold
    this.pending = new Map(); // ops we have made but not got through yet
    this.visitor = null;
    this.visitorSent = '';
    this.visitorDirty = false;
    this.toldAt = 0;
    this.diffCost = 0; // ms the last look over the world took
  }

  get online() {
    return !!this.id;
  }

  get connected() {
    return !!this.live && this.live.connected;
  }

  get here() {
    return this.peers ? this.peers.count : 0;
  }

  // ── Opening ───────────────────────────────────────────────────────────────
  // Resolves before the world is built, because the seed lives in the save.
  // Never throws: a world that won't open leaves the game to start a fresh one.
  async open() {
    const id = (new URLSearchParams(location.search).get('w') || '').trim().toLowerCase();
    if (!id) return null;
    if (!/^[0-9a-z]{4,32}$/.test(id)) {
      this._set('local', 'that is not a world address');
      return null;
    }
    const cached = readCache(id);

    let remote = null;
    try {
      remote = await openWorld(id);
    } catch (err) {
      if (err.status === 404) {
        dropParam('w');
        this._set('local', 'there is no world at that address any more');
        return null;
      }
      if (err.status >= 400 && err.status < 500) {
        this._set('local', err.message);
        return null;
      }
      // Couldn't reach it. Carry on from this browser's copy if we have one,
      // and let the socket push what we do once it comes back.
      if (cached && cached.elements) {
        const snapshot = this._adopt(id, cached, cached.seed, cached.visitor);
        this._set('offline', err.message);
        return { id, name: this.name, snapshot, offline: true };
      }
      this._set('offline', err.message);
      return null;
    }

    // Anything we made last time and never got through is still ours: it goes
    // on top of whatever the world has become, and out again as ops.
    const held = cached && cached.pending && cached.pending.length ? cached.pending : [];
    const snapshot = this._adopt(id, { ...remote, pending: held }, remote.seed, held.length && cached.visitor ? cached.visitor : remote.visitor);
    this._set('saved', held.length ? 'picking up where you left off' : '');
    return { id, name: this.name, snapshot, recovered: held.length > 0 };
  }

  _adopt(id, from, seed, visitor) {
    this.id = id;
    this.seed = seed;
    this.gen = from.gen || 0;
    this.elements = from.elements instanceof Map ? from.elements : plainToElements(from.elements);
    this.pending = new Map();
    for (const op of from.pending || []) this.pending.set(opKey(op), op);
    this.visitor = visitor || {};
    // What we can see is the world plus whatever of ours hasn't got through.
    const seen = cloneElements(this.elements);
    applyOps(seen, [...this.pending.values()]);
    const snapshot = validateSnapshot(fromElements(seed, seen, this.visitor)) || fromElements(seed, seen, this.visitor);
    this.name = snapshot.name || '';
    if (this.pending.size) this.dirty = true;
    tidyUrl();
    return snapshot;
  }

  // ── Wiring ────────────────────────────────────────────────────────────────
  attach(parts) {
    this.parts = parts;
    this.seed = this.seed || parts.gen.seed;
    parts.builder.onChange = () => this.touch();
    parts.marks.subscribe(() => this.touch());
    this.peers = parts.peers;
    if (this.peers) this.peers.onChange = () => this.onStatus && this.onStatus(this);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.flush();
    });
    addEventListener('pagehide', () => this.flush({ keepalive: true }));
    if (this.id) this._goLive();
  }

  touch() {
    if (this.adopting) return; // that change came from somebody else
    this.dirty = true;
    this.changedAt = performance.now();
  }

  rename(name) {
    this.name = name.slice(0, 80);
    this.touch();
  }

  url() {
    if (!this.id) return '';
    const u = new URL(location.href);
    u.search = `?w=${this.id}`;
    u.hash = '';
    return u.toString();
  }

  // ── Every frame ───────────────────────────────────────────────────────────
  tick() {
    if (!this.id || !this.parts) return;
    const now = performance.now();

    if (this.connected && now - this.toldAt > AT_EVERY) {
      this.toldAt = now;
      const p = this.parts.player;
      this.live.at(round(p.pos.x), round(p.pos.z), round(p.yaw, 100), this.parts.me || '');
    }

    // Finding changes means looking over the whole world, which on a world
    // that has been dug over for hours is not free. Let how long it took set
    // how often it happens, so a big world sends less often rather than
    // stuttering.
    const lull = Math.max(this.connected ? LIVE_LULL : SLOW_LULL, this.diffCost * 6);
    if (this.dirty && now - this.changedAt >= lull) this._collect();
    if (this.pending.size && !this.pushing && now >= this.holdUntil && this.status !== 'full' && this.status !== 'gone') this._send();
  }

  // Reduce the world to its elements and see what differs from what the
  // server holds. That difference *is* what is waiting to go out, so it is
  // worked out afresh each time rather than accumulated: a change you made and
  // then undid simply stops being a difference.
  _collect() {
    this.dirty = false;
    if (!this.parts || this.pushing) return; // a batch in flight is based on this
    const started = performance.now();
    const snapshot = this._snapshot();
    const ops = diffElements(this.elements, toElements(snapshot));
    this.pending = new Map(ops.map((op) => [opKey(op), op]));
    this.visitor = visitorOf(snapshot);
    // Where you are standing and the hour are yours, not the world's: they
    // ride along with the next change rather than going out on their own.
    this.visitorDirty = JSON.stringify(this.visitor) !== this.visitorSent;
    this.diffCost = performance.now() - started;
    if (ops.length) this._cache();
  }

  _send({ keepalive = false } = {}) {
    if (this.pushing || (!this.pending.size && !this.visitorDirty)) return this.pushing || Promise.resolve();
    const sent = [...this.pending.entries()];
    const ops = sent.map(([, op]) => op);
    const extra = { visitor: this.visitor, name: this.name };
    if (this.status !== 'offline') this._set('saving');

    const over =
      this.connected && ops.length <= BIG_BATCH && !keepalive
        ? this.live.send(ops, extra)
        : sendOps(this.id, { ops, ...extra }, { keepalive });

    this.pushing = over
      .then((res) => {
        if (res && res.error) throw new WorldError(res.error, 400);
        this.gen = res && res.gen ? res.gen : this.gen;
        this.visitorSent = JSON.stringify(this.visitor);
        this.visitorDirty = false;
        applyOps(this.elements, ops);
        for (const [key, op] of sent) if (this.pending.get(key) === op) this.pending.delete(key);
        this.attempt = 0;
        this.holdUntil = 0;
        this._cache();
        this._set(this.connected ? 'live' : 'saved', `${ops.length} ${ops.length === 1 ? 'change' : 'changes'} · gen ${this.gen}`);
      })
      .catch((err) => this._failed(err))
      .finally(() => {
        this.pushing = null;
      });
    return this.pushing;
  }

  // Leaving the tab is the moment to make sure everything is out, including
  // where you stopped walking.
  flush(opts = {}) {
    if (!this.id || !this.parts) return Promise.resolve();
    this._collect();
    if (!this.pending.size && !this.visitorDirty) return Promise.resolve();
    return this._send(opts);
  }

  // Put this world on the server for the first time. -> the world's URL.
  async publish(name = '') {
    if (this.id) return this.url();
    if (!this.parts) throw new WorldError('the world is not ready yet', 0);
    this._set('saving');
    const snapshot = this._snapshot(name);
    const elements = toElements(snapshot);
    const ops = diffElements(new Map(), elements);
    const visitor = visitorOf(snapshot);
    let made;
    try {
      made = await createWorld({ seed: snapshot.seed, name, ops, visitor });
    } catch (err) {
      this._set('local', err.message);
      throw err;
    }
    this.id = made.id;
    this.seed = snapshot.seed;
    this.gen = made.gen || 0;
    this.name = name;
    this.elements = elements;
    this.visitor = visitor;
    this.pending.clear();
    // From here on the world lives on the server; the per-seed local saves
    // would only drift, so hand persistence over to the cache for this id.
    this.parts.builder.storeKey = null;
    this.parts.marks.key = null;
    this._cache();
    setParam('w', this.id);
    this._goLive();
    this._set('saved', `${(made.sentBytes / 1024).toFixed(1)} kB · ${ops.length} things`);
    return this.url();
  }

  // ── The socket ────────────────────────────────────────────────────────────
  _goLive() {
    if (this.live) return;
    this.live = new Live({
      id: this.id,
      handlers: {
        ops: (ops, gen) => this._heard(ops, gen),
        at: (m) => this.peers && this.peers.at(m),
        gone: (id) => this.peers && this.peers.remove(id),
        here: (list) => {
          if (!this.peers) return;
          this.peers.clear();
          for (const m of list) this.peers.at(m);
        },
        reopen: () => this._reopen(),
        state: (how) => {
          if (how === 'open') this._set(this.pending.size ? 'saving' : 'live');
          else if (how === 'closed') {
            if (this.peers) this.peers.clear();
            if (this.status === 'live' || this.status === 'saved') this._set('offline', 'the connection dropped');
          }
        },
      },
    });
    this.live.open(this.gen);
  }

  // Somebody else changed something.
  _heard(ops, gen) {
    if (!ops.length || !this.parts) return;
    this.gen = gen || this.gen;
    this.adopting = true;
    try {
      applyOps(this.elements, ops);
      const what = applyRemote(ops, this.elements, this.parts, this.seed);
      if (what.name !== null) this.name = what.name;
    } finally {
      this.adopting = false;
    }
    this._cache();
    if (this.onStatus) this.onStatus(this);
  }

  // We fell so far behind that the object no longer holds the changes we
  // missed. Everything of ours is in the cache, so starting again is safe.
  _reopen() {
    this._set('offline', 'this world has moved on a long way — opening it again');
    this._cache();
    setTimeout(() => location.reload(), 600);
  }

  _failed(err) {
    const status = err instanceof WorldError ? err.status : 0;
    if (status === 413) return this._set('full', err.message);
    if (status === 404) return this._set('gone', 'this world is no longer on the server');
    this.holdUntil = performance.now() + BACKOFF[Math.min(this.attempt++, BACKOFF.length - 1)];
    this._set(status >= 400 && status < 500 ? 'local' : 'offline', err.message);
  }

  _snapshot(name = this.name) {
    const { gen, builder, marks, player, sky } = this.parts;
    return collectSnapshot({ seed: gen.seed, name, builder, marks, player, sky });
  }

  _cache() {
    if (!this.id) return;
    try {
      localStorage.setItem(
        CACHE_KEY(this.id),
        JSON.stringify({ gen: this.gen, seed: this.seed, visitor: this.visitor, elements: elementsToPlain(this.elements), pending: [...this.pending.values()] }),
      );
    } catch {
      /* storage full or unavailable: the server copy is the one that matters */
    }
  }

  _set(status, detail = '') {
    this.status = status;
    this.detail = detail;
    if (this.onStatus) this.onStatus(this);
  }
}

// ── Odds and ends ───────────────────────────────────────────────────────────

const opKey = (op) => `${op.r}\u0000${op.k}`;
const round = (v, f = 10) => Math.round(v * f) / f;

const visitorOf = (s) => ({
  saved: s.saved,
  inv: s.world.inv,
  datum: s.world.datum,
  player: s.player,
  hours: s.hours,
  tracked: s.marks.tracked,
});

const elementsToPlain = (elements) => {
  const out = {};
  for (const [r, m] of elements) out[r] = Object.fromEntries(m);
  return out;
};

function plainToElements(plain) {
  const out = new Map();
  for (const r in plain || {}) out.set(r, new Map(Object.entries(plain[r])));
  return out;
}

function readCache(id) {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY(id)) || 'null');
    if (raw && raw.elements) return raw;
  } catch {
    /* unreadable or blocked storage */
  }
  return null;
}

// ── The address bar ─────────────────────────────────────────────────────────

function setParam(key, value) {
  const u = new URL(location.href);
  u.searchParams.set(key, value);
  history.replaceState(null, '', u);
}

function dropParam(key) {
  const u = new URL(location.href);
  u.searchParams.delete(key);
  history.replaceState(null, '', u);
}

// A saved world carries its own seed, and starting it fresh is not something
// you want a reload to do by accident, so those params go once a world is open.
function tidyUrl() {
  const u = new URL(location.href);
  let changed = false;
  for (const key of ['seed', 'reset', 'clearbuild']) {
    if (u.searchParams.has(key)) {
      u.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed) history.replaceState(null, '', u);
}
