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
// The server only lets in people it knows. The first time a browser opens a
// world, `who` (signIn.js) asks for a name and a password — new ones, or
// ones picked before — and what is yours alone in that world comes back to
// whoever gives them.
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
import { createWorld, openWorld, sendOps, join, signIn, signOut, WorldError } from './remote.js';
import { Emitter } from '../core/events.js';
import { KEYS } from '../core/storage.js';
import { LANDS } from '../world/lands.js';
import { landSave, landIn } from './land.js';

// Wall-clock, not frame time: the render loop clamps its dt to 50 ms, so below
// 20 fps accumulated frame time runs behind the clock.
const LIVE_LULL = 250; // ms of quiet before changes go out over the socket
const SLOW_LULL = 3000; // and when there is no socket to send them over
const AT_EVERY = 150; // ms between telling everyone where you are
const BIG_BATCH = 400; // ops; more than this goes over HTTP instead
const BACKOFF = [1000, 2000, 5000, 10000, 30000];
// Times to ask who you are before giving up on opening a world. More than
// once only if signing in worked and the world still doesn't know you.
const SIGN_IN_TRIES = 2;
const SIGNED_OUT = 'this browser is no longer signed in to this world';

// Emits:
//   'status'   (save)   the status, the name or who is here changed
//   'message'  ({ ch, from, name, body })   someone here said something on a
//              channel (see say())
export class WorldSave extends Emitter {
  // who: asks for a name and a password when the server wants them —
  //      { ask({ world, problem, name, back }) -> { name, password, back }, close() }
  constructor({ storage, who = null }) {
    super();
    this.storage = storage;
    this.who = who;
    this.you = ''; // your name in this world, once the server knows it
    this.domains = new SaveDomains();
    this.local = null; // this browser's copy of a world with no address (see begin)
    this.id = null;
    this.seed = 0;
    this.land = 1; // which land the world is grown on (see world/lands.js)
    this.gen = 0;
    this.name = '';
    this.status = 'local'; // local | live | saved | saving | offline | full | gone | out
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

    // The world's name and its land are the two things in a save that belong
    // to no system.
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

    // Which land the world is grown on goes up with a new world, beside the
    // name (see land.js).
    this.domains.register({ ...landSave, collect: () => this.land, restore: () => {} });
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

  // Who you are on the wire right now (the id others know you by while you
  // are here, not your name), or null with no socket.
  get me() {
    return this.connected ? this.live.me : null;
  }

  // Tell the others here something that is nobody's to keep: on a channel of
  // your own (`ch`), to everyone, or to one of them by id. They hear it as a
  // 'message'. -> whether it went (there is nobody to tell without a socket).
  say(ch, body, to = null) {
    return !!this.live && this.live.say(ch, body, to);
  }

  // ── Opening ───────────────────────────────────────────────────────────────
  // Resolves before the world is built, because the seed and the land live in
  // the save.
  // Never throws: a world that won't open leaves the game to start a fresh one.
  // -> { id, seed, land, name, offline?, recovered? }, or null for a local world.
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
    let greeting = '';
    for (let asked = 0; !remote; asked++) {
      try {
        remote = await openWorld(id);
      } catch (err) {
        if (err.status !== 401 || !this.who || asked >= SIGN_IN_TRIES) return this._unopened(err, id, cached);
        // The world is there, but doesn't know you yet. Signed in and still
        // a stranger means the cookie that says who you are isn't kept.
        const problem = asked ? "that worked, but this browser isn't keeping the sign-in — are cookies blocked for this site?" : '';
        greeting = await this._signIn(id, err.body, cached, problem);
      }
    }

    // Anything we made last time and never got through is still ours: it goes
    // on top of whatever the world has become, and out again as ops. So is
    // what you were carrying then, if it was you this browser was then.
    const held = cached && cached.pending && cached.pending.length ? cached.pending : [];
    const yours = held.length && cached.visitor && cached.you === remote.you ? cached.visitor : remote.visitor;
    this._adopt(id, { ...remote, pending: held }, remote.seed, yours);
    this._set('saved', held.length ? 'picking up where you left off' : greeting);
    return { id, seed: this.seed, land: this.land, name: this.name, recovered: held.length > 0 };
  }

  // The world couldn't be opened. -> what open() resolves to.
  _unopened(err, id, cached) {
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
      return { id, seed: this.seed, land: this.land, name: this.name, offline: true };
    }
    this._set('offline', err.message);
    return null;
  }

  // Ask who you are until the server agrees. -> a greeting.
  async _signIn(id, body, cached, problem) {
    const world = (body && body.world) || '';
    // someone this browser has been here before is most likely coming back
    let asking = { world, problem, name: (cached && cached.you) || '', back: !!(cached && cached.you) };
    for (;;) {
      const said = await this.who.ask(asking);
      try {
        const got = said.back ? await signIn(id, said) : await join(id, said);
        this.who.close();
        return said.back ? `welcome back, ${got.name}` : `welcome, ${got.name}`;
      } catch (err) {
        asking = { world, problem: err.message, name: said.name, back: said.back };
      }
    }
  }

  _adopt(id, from, seed, visitor) {
    this.id = id;
    this.you = from.you || '';
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
    this.land = landIn(seen);
    if (this.pending.size) this.dirty = true;
    tidyUrl();
  }

  // The world is about to be built from `seed`, on `land`. A world without
  // an address is kept in this browser; `fresh` (?reset) and `clear`
  // (?clearbuild) say how much of that to pick up. `chosen`: the land was
  // asked for (?land), rather than the newest by default.
  begin({ seed, land = 1, fresh = false, clear = false, chosen = false }) {
    this.seed = this.seed || seed;
    if (!this.id) this.land = land;
    this.local = new LocalStore({ domains: this.domains, storage: this.storage, seed, land: this.land, fresh, clear });
    if (this.id) {
      this.local.disable();
      return;
    }
    // What this browser kept of this seed's world before the land changed is
    // still here, under the land it was grown on: say where.
    const was = chosen || this.detail ? 0 : this.local.elsewhere(LANDS);
    if (was) this.detail = `the forest has grown anew · what you made before is at ?land=${was}`;
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
  // peers: everyone else in the world (src/player/peers.js)
  // where: () => { x, z, yaw, who }, where you are standing and who you are
  //   (a hiker's id, player/hikers.js), to tell them
  attach({ peers = null, where }) {
    this.attached = { where };
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
      this.live.at(round(p.x), round(p.z), round(p.yaw, 100), p.who);
    }

    // Finding changes means looking over the whole world, which on a world
    // that has been dug over for hours is not free. Let how long it took set
    // how often it happens, so a big world sends less often rather than
    // stuttering.
    const lull = Math.max(this.connected ? LIVE_LULL : SLOW_LULL, this.diffCost * 6);
    if (this.dirty && now - this.changedAt >= lull) this._collect();
    if (this.pending.size && !this.pushing && now >= this.holdUntil && !STUCK.has(this.status)) this._send();
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

  // Put this world on the server for the first time, with you as the first
  // person in it. you: { name, password }. -> the world's URL.
  async publish(name = '', you = {}) {
    if (this.id) return this.url();
    if (!this.attached) throw new WorldError('the world is not ready yet', 0);
    this._set('saving');
    const state = { ...this.domains.collect(), name };
    const elements = this.domains.toElements(state);
    const ops = diffElements(new Map(), elements);
    const visitor = this.domains.yours(state);
    let made;
    try {
      made = await createWorld({ seed: this.seed, name, ops, visitor, you });
    } catch (err) {
      this._set('local', err.message);
      throw err;
    }
    this.id = made.id;
    this.gen = made.gen || 0;
    this.name = name;
    this.you = made.you || '';
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

  // Leave this world as yourself. What you did goes out under your name
  // first; then whoever opens it next in this browser is asked who they are.
  // Reload the page after.
  async signOut() {
    if (!this.id) return;
    await this.flush();
    await signOut(this.id);
    if (this.live) this.live.close();
    this.live = null;
    this.you = '';
    this.visitor = {};
    // What was yours goes from this browser. Changes to the world that
    // haven't got through yet stay, for whoever comes in next to send.
    if (this.pending.size) this._cache();
    else this.storage.remove(KEYS.world(this.id));
    this._set('out', 'signed out');
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
        say: (m) => this.emit('message', { ch: m.ch, from: m.from, name: m.name || '', body: m.body }),
        here: (list) => {
          if (!this.peers) return;
          this.peers.clear();
          for (const m of list) this.peers.at(m);
        },
        reopen: () => this._reopen(),
        denied: () => this._set('out', SIGNED_OUT),
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
    if (status === 401) return this._set('out', SIGNED_OUT);
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
      you: this.you, // whose the visitor is
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
// Nothing goes out while the world is in one of these: it would be refused.
const STUCK = new Set(['full', 'gone', 'out']);
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

// A saved world carries its own seed and land, and starting it fresh is not something
// you want a reload to do by accident, so those params go once a world is open.
function tidyUrl() {
  const u = new URL(location.href);
  let changed = false;
  for (const key of ['seed', 'land', 'reset', 'clearbuild']) {
    if (u.searchParams.has(key)) {
      u.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed) history.replaceState(null, '', u);
}
