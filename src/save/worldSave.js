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

//
// What is in a world is not this file's business: every system registers its
// share as a save domain (register(), see domains.js), and this file moves
// domains about — to this browser (local.js), to the server, and back.

import { SaveDomains } from './domains.js';
import { LocalStore } from './local.js';
import { LOOSE, diffElements, applyOps, cloneElements, elementsToPlain, plainToElements } from './regions.js';
import { Live } from './live.js';
import { createWorld, openWorld, sendOps, WorldError } from './remote.js';
import { Emitter } from '../core/events.js';
import { KEYS } from '../core/storage.js';

// Wall-clock, not frame time: the render loop clamps its dt to 50 ms, so below
// 20 fps accumulated frame time runs behind the clock.
const LIVE_LULL = 250; // ms of quiet before changes go out over the socket
const SLOW_LULL = 3000; // and when there is no socket to send them over
const AT_EVERY = 150; // ms between telling everyone where you are
const BIG_BATCH = 400; // ops; more than this goes over HTTP instead
const BACKOFF = [1000, 2000, 5000, 10000, 30000];

// Emits:
//   'status'  (save)   the status, the name or who is here changed
export class WorldSave extends Emitter {
  constructor({ storage }) {
    super();
    this.storage = storage;
    this.domains = new SaveDomains();
    this.local = null; // this browser's copy of a world with no address (see begin)
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
    this.adopting = false; // folding in someone else's change, or what was saved
    this.attached = null; // { peers, where, me }
    this.peers = null;
    this.live = null;
    this.elements = new Map(); // what the server is known to hold
    this.pending = new Map(); // ops we have made but not got through yet
    this.opened = null; // the elements a world opened with, until restore() hands them out
    this.visitor = null;
    this.visitorSent = '';
    this.visitorDirty = false;
    this.toldAt = 0;
    this.diffCost = 0; // ms the last look over the world took

    // The world's name is the one thing in a save that belongs to no system.
    this.domains.register({
      id: 'name',
      scope: 'world',
      local: false,
      kinds: ['name'],
      collect: () => this.name,
      restore: (v) => {
        this.name = typeof v === 'string' ? v.slice(0, 80) : '';
      },
      encode: (name, put) => {
        if (name) put(LOOSE, 'name', name);
      },
      decode() {
        let name = '';
        return { take: (region, kind, rest, v) => void (name = v), done: () => name };
      },
    });
  }

  // A system's share of the save. See domains.js for what a domain is.
  register(domain) {
    return this.domains.register(domain);
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
  // -> { id, seed, name, offline?, recovered? }, or null for a local world.
  // What was saved is handed out later, by restore(), once every system has
  // registered its domain.
  async open(id) {
    if (!id) return null;
    if (!/^[0-9a-z]{4,32}$/.test(id)) {
      this._set('local', 'that is not a world address');
      return null;
    }
    const cached = this._readCache(id);

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
        this._adopt(id, cached, cached.seed, cached.visitor);
        this._set('offline', err.message);
        return { id, seed: this.seed, name: this.name, offline: true };
      }
      this._set('offline', err.message);
      return null;
    }

    // Anything we made last time and never got through is still ours: it goes
    // on top of whatever the world has become, and out again as ops.
    const held = cached && cached.pending && cached.pending.length ? cached.pending : [];
    this._adopt(id, { ...remote, pending: held }, remote.seed, held.length && cached.visitor ? cached.visitor : remote.visitor);
    this._set('saved', held.length ? 'picking up where you left off' : '');
    return { id, seed: this.seed, name: this.name, recovered: held.length > 0 };
  }

  _adopt(id, from, seed, visitor) {
    this.id = id;
    this.seed = Math.trunc(seed);
    this.gen = from.gen || 0;
    this.elements = from.elements instanceof Map ? from.elements : plainToElements(from.elements);
    this.pending = new Map();
    for (const op of from.pending || []) this.pending.set(opKey(op), op);
    this.visitor = visitor || {};
    // What we can see is the world plus whatever of ours hasn't got through.
    const seen = cloneElements(this.elements);
    applyOps(seen, [...this.pending.values()]);
    this.opened = seen;
    const name = seen.get(LOOSE) && seen.get(LOOSE).get('name');
    this.name = typeof name === 'string' ? name.slice(0, 80) : '';
    if (this.pending.size) this.dirty = true;
    tidyUrl();
  }

  // The world is about to be built from `seed`. A world without an address is
  // kept in this browser; `fresh` (?reset) and `clear` (?clearbuild) say how
  // much of that to pick up.
  begin({ seed, fresh = false, clear = false }) {
    this.seed = this.seed || seed;
    this.local = new LocalStore({ domains: this.domains, storage: this.storage, seed, fresh, clear });
    if (this.id) this.local.disable();
  }

  // Hand every domain what was saved: from the server's copy of the world, or
  // from this browser's. Call it once everything has registered, and before
  // the world starts streaming in, so changes are there as it loads.
  restore() {
    const state = this.id ? { ...this.domains.fromElements(this.opened || new Map()), ...this.domains.fromYours(this.visitor) } : this.local.read();
    this.opened = null;
    this.adopting = true;
    try {
      this.domains.restore(this.domains.validate(state));
    } finally {
      this.adopting = false;
    }
  }

  // ── Wiring ────────────────────────────────────────────────────────────────
  // peers: everyone else in the world (src/world/peers.js)
  // where: () => { x, z, yaw }, where you are standing, to tell them
  attach({ peers = null, where, me = '' }) {
    this.attached = { where, me };
    this.peers = peers;
    if (peers) peers.on('change', () => this.emit('status', this));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.flush();
    });
    addEventListener('pagehide', () => this.flush({ keepalive: true }));
    addEventListener('beforeunload', () => this.local && this.local.enabled && this.local.flush());
    if (this.id) this._goLive();
  }

  // Something about the world really changed.
  touch() {
    if (this.adopting) return; // that change came from somebody else
    this.dirty = true;
    this.changedAt = performance.now();
    if (this.local) this.local.touch();
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
    if (!this.attached) return;
    const now = performance.now();
    if (!this.id) {
      this.local.tick(now);
      return;
    }

    if (this.connected && now - this.toldAt > AT_EVERY) {
      this.toldAt = now;
      const p = this.attached.where();
      this.live.at(round(p.x), round(p.z), round(p.yaw, 100), this.attached.me || '');
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
    // A batch in flight is based on what was collected last; look again once
    // it has landed (the world stays marked as changed until then).
    if (!this.attached || this.pushing) return;
    this.dirty = false;
    const started = performance.now();
    const state = this.domains.collect();
    // An element whose kind nobody here owns was put there by a newer version
    // of the game; it is not ours to take away.
    const ops = diffElements(this.elements, this.domains.toElements(state), (key) => !!this.domains.owner(key));
    this.pending = new Map(ops.map((op) => [opKey(op), op]));
    this.visitor = this.domains.yours(state);
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
    if (!this.attached) return Promise.resolve();
    if (!this.id) {
      this.local.flush();
      return Promise.resolve();
    }
    this._collect();
    if (!this.pending.size && !this.visitorDirty) return Promise.resolve();
    return this._send(opts);
  }

  // Put this world on the server for the first time. -> the world's URL.
  async publish(name = '') {
    if (this.id) return this.url();
    if (!this.attached) throw new WorldError('the world is not ready yet', 0);
    this._set('saving');
    const state = { ...this.domains.collect(), name };
    const elements = this.domains.toElements(state);
    const ops = diffElements(new Map(), elements);
    const visitor = this.domains.yours(state);
    let made;
    try {
      made = await createWorld({ seed: this.seed, name, ops, visitor });
    } catch (err) {
      this._set('local', err.message);
      throw err;
    }
    this.id = made.id;
    this.gen = made.gen || 0;
    this.name = name;
    // what the server now holds: the ops, not the map they were made from,
    // whose values are still the game's own objects
    this.elements = new Map();
    applyOps(this.elements, ops);
    this.visitor = visitor;
    this.pending.clear();
    // From here on the world lives on the server; the per-seed local saves
    // would only drift, so hand persistence over to the cache for this id.
    this.local.disable();
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
    if (!ops.length || !this.attached) return;
    this.gen = gen || this.gen;
    this.adopting = true;
    try {
      applyOps(this.elements, ops);
      this.domains.adopt(ops, this.elements);
    } finally {
      this.adopting = false;
    }
    this._cache();
    this.emit('status', this);
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

  _cache() {
    if (!this.id) return;
    // If storage is full or unavailable, the server copy is the one that matters.
    this.storage.set(KEYS.world(this.id), {
      gen: this.gen,
      seed: this.seed,
      visitor: this.visitor,
      elements: elementsToPlain(this.elements),
      pending: [...this.pending.values()],
    });
  }

  _readCache(id) {
    const raw = this.storage.get(KEYS.world(id));
    return raw && raw.elements ? raw : null;
  }

  _set(status, detail = '') {
    this.status = status;
    this.detail = detail;
    this.emit('status', this);
  }
}

// ── Odds and ends ───────────────────────────────────────────────────────────

const opKey = (op) => `${op.r}\u0000${op.k}`;
const round = (v, f = 10) => Math.round(v * f) / f;

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
