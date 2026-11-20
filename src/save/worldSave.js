// Keeping a world on the server.
//
// Two modes, and the game plays the same in both:
//
//   no ?w=   nothing is sent anywhere. The world lives in this browser only,
//            exactly as it did before there was a save server.
//   ?w=id    the world lives on the server. A local copy is still kept, as a
//            cache for reopening offline and as a net for a save that didn't
//            make it out before the tab closed.
//
// A world is stored in pieces (regions.js), and so is a save: only the 64 m
// squares you actually touched go out, each carrying the revision it was based
// on. Anyone with the link can build, so if someone else got to a square
// first, that square is refused and reported back — while the rest of the save
// still lands. Two people working a few hundred metres apart never collide at
// all, which is the whole point of storing a world in pieces.

import { collectSnapshot, validateSnapshot } from './snapshot.js';
import { splitSnapshot, keyOf, parseKey } from './regions.js';
import { createWorld, openWorld, saveWorld, WorldError } from './remote.js';

const CACHE_KEY = (id) => `my-world:world:${id}`;
// Saving is wall-clock business, not frame business: the render loop clamps
// its dt to 50 ms, so on anything slower than 20 fps accumulated frame time
// runs behind the clock — and a save you asked for seconds ago is still owed.
const DEBOUNCE = 4000; // ms of quiet before a save goes out
const MIN_GAP = 3000; // and never more often than this
const BACKOFF = [5000, 10000, 20000, 40000, 60000]; // after a failed save

export class WorldSave {
  constructor() {
    this.id = null; // the ?w= of the world we're saving to
    this.gen = 0; // the world's generation, as of our last word with the server
    this.name = '';
    this.status = 'local'; // local | saved | saving | offline | conflict | full | gone
    this.detail = '';
    this.dirty = false;
    this.changes = 0; // bumped on every change, to spot ones made mid-save
    this.changedAt = 0; // when the world last changed
    this.sentAt = -MIN_GAP; // when a save last went out
    this.holdUntil = 0; // don't try again before this
    this.attempt = 0;
    this.pushing = null;
    this.onStatus = null;
    this.parts = null; // { gen, builder, marks, player, sky }
    this.revs = { meta: 0, patches: new Map() }; // what each piece was based on
    this.sent = { meta: null, visitor: null, patches: new Map() }; // last sent, as JSON
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
      // Gone for good: forget it and start fresh, rather than saving a new
      // world over an address that someone may have deliberately removed.
      if (err.status === 404) {
        dropParam('w');
        this._set('local', 'there is no world at that address any more');
        return null;
      }
      // Couldn't reach the server. If we have been here before, carry on from
      // the local copy and push once the network comes back.
      const local = cached && validateSnapshot(cached.snapshot);
      if (local) {
        this._adopt(id, cached.gen, cachedRevs(cached), local, !!cached.dirty);
        this._set('offline', err.message);
        return { id, gen: cached.gen, name: local.name, snapshot: local, offline: true };
      }
      // Nothing to open and nowhere to save: the game starts a fresh local
      // world, and with no id nothing is ever written to that address.
      this._set('offline', err.message);
      return null;
    }

    const server = validateSnapshot(remote.snapshot);
    if (!server) {
      this._set('local', 'that save was written by a different version of my-world');
      return null;
    }

    // A local copy that was never pushed, and that the server hasn't moved
    // past, is the newer of the two: pick up where we left off.
    let use = server;
    let recovered = false;
    if (cached && cached.dirty && cached.gen === remote.gen) {
      const local = validateSnapshot(cached.snapshot);
      if (local) {
        use = local;
        recovered = true;
      }
    } else if (cached && cached.dirty && cached.gen < remote.gen) {
      this.detail = 'someone else saved this world while you were away, so their version opened';
    }

    this._adopt(id, remote.gen, remote.revs, use, recovered);
    this.name = use.name || remote.name;
    // After a recovery we don't know which pieces of the last save landed, and
    // a world still holding one whole blob has to be rewritten in full. Either
    // way, leaving `sent` empty makes the next save carry everything once.
    if (!recovered && !remote.legacy) this._remember(use);
    writeCache(id, { gen: remote.gen, dirty: recovered, revs: plainRevs(this.revs), snapshot: use });
    this._set(recovered ? 'local' : 'saved', this.detail);
    return { id, gen: remote.gen, name: this.name, snapshot: use, recovered };
  }

  _adopt(id, gen, revs, snapshot, dirty) {
    this.id = id;
    this.gen = gen;
    this.revs = { meta: revs.meta || 0, patches: new Map(revs.patches || []) };
    this.name = snapshot.name || '';
    this.dirty = !!dirty;
    if (dirty) this.changes++;
    tidyUrl();
  }

  // ── Wiring ────────────────────────────────────────────────────────────────
  attach(parts) {
    this.parts = parts;
    const { builder, marks } = parts;
    builder.onChange = () => this.touch();
    marks.subscribe(() => this.touch());
    // Leaving the tab is the reliable moment to get a save out; unload is the
    // unreliable one, so try both and let the revisions sort it out.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.flush();
    });
    addEventListener('pagehide', () => this.flush({ keepalive: true }));
  }

  get online() {
    return !!this.id;
  }

  touch() {
    this.changes++;
    this.dirty = true;
    this.changedAt = performance.now();
    if (this.status === 'saved') this._set('local');
  }

  // Called every frame. Decides when a save actually goes out.
  tick() {
    if (!this.id || this.pushing || !this.dirty) return;
    if (this.status === 'conflict' || this.status === 'full' || this.status === 'gone') return;
    const now = performance.now();
    if (now < this.holdUntil || now - this.changedAt < DEBOUNCE || now - this.sentAt < MIN_GAP) return;
    this._push();
  }

  // ── Saving ────────────────────────────────────────────────────────────────
  // Put this world on the server for the first time. -> the world's URL.
  async publish(name = '') {
    if (this.id) return this.url();
    if (!this.parts) throw new WorldError('the world is not ready yet', 0);
    this._set('saving');
    const snapshot = this._snapshot(name);
    const { send, json } = this._changesIn(snapshot);
    send.name = name;
    let made;
    try {
      made = await createWorld(send);
    } catch (err) {
      this._set('local', err.message);
      throw err;
    }
    this.id = made.id;
    this.name = name;
    // From here on the server copy is the world; the per-seed local saves
    // would only drift, so hand persistence over to the cache for this id.
    this.parts.builder.storeKey = null;
    this.parts.marks.key = null;
    this.sentAt = performance.now();
    this._landed(made, snapshot, json);
    this.dirty = false;
    writeCache(this.id, { gen: this.gen, dirty: false, revs: plainRevs(this.revs), snapshot });
    setParam('w', this.id);
    this._set('saved', `${(made.sentBytes / 1024).toFixed(1)} kB · ${(made.patches || []).length} places`);
    return this.url();
  }

  flush(opts = {}) {
    if (!this.id || !this.dirty) return Promise.resolve();
    if (this.status === 'conflict' || this.status === 'full' || this.status === 'gone') return Promise.resolve();
    return this._push(opts);
  }

  // Win a clash: save over the squares you both changed. Theirs stand
  // everywhere else, because nothing of ours was ever meant to go there.
  async takeOver() {
    if (!this.id) return;
    this.dirty = true;
    await this._push({ force: true });
  }

  // Lose a clash on purpose: open the world as it now stands on the server.
  theirs() {
    if (!this.id) return;
    forgetCache(this.id);
    location.reload();
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

  _snapshot(name = this.name) {
    const { gen, builder, marks, player, sky } = this.parts;
    return collectSnapshot({ seed: gen.seed, name, builder, marks, player, sky });
  }

  // Work out what has actually moved since the last save: the pieces whose
  // contents differ, and the regions that have emptied out entirely.
  _changesIn(snapshot) {
    const { meta, visitor, patches } = splitSnapshot(snapshot);
    const json = { meta: JSON.stringify(meta), visitor: JSON.stringify(visitor), patches: new Map() };
    const send = { seed: snapshot.seed, name: snapshot.name, meta: null, visitor: null, patches: [], drops: [] };

    if (json.meta !== this.sent.meta) send.meta = { rev: this.revs.meta, body: meta };
    if (json.visitor !== this.sent.visitor) send.visitor = { body: visitor };
    for (const [key, body] of patches) {
      const text = JSON.stringify(body);
      json.patches.set(key, text);
      if (text === this.sent.patches.get(key)) continue;
      const [rx, rz] = parseKey(key);
      send.patches.push({ rx, rz, rev: this.revs.patches.get(key) || 0, body });
    }
    for (const key of this.sent.patches.keys()) {
      if (patches.has(key)) continue;
      const [rx, rz] = parseKey(key);
      send.drops.push({ rx, rz, rev: this.revs.patches.get(key) || 0 });
    }
    return { send, json };
  }

  // Record what the server says it took, so the next save doesn't send it
  // again. Anything it refused is deliberately left looking unsent.
  _landed(result, snapshot, json) {
    if (!json) json = this._changesIn(snapshot).json;
    this.gen = result.gen || this.gen;
    if (result.meta) {
      this.revs.meta = result.meta.rev;
      this.sent.meta = json.meta;
    }
    this.sent.visitor = json.visitor;
    for (const p of result.patches || []) {
      const key = keyOf(p.rx, p.rz);
      this.revs.patches.set(key, p.rev);
      this.sent.patches.set(key, json.patches.get(key));
    }
    for (const d of result.dropped || []) {
      const key = keyOf(d.rx, d.rz);
      this.revs.patches.delete(key);
      this.sent.patches.delete(key);
    }
  }

  _remember(snapshot) {
    const { json } = this._changesIn(snapshot);
    this.sent.meta = json.meta;
    this.sent.visitor = json.visitor;
    this.sent.patches = json.patches;
  }

  _push({ keepalive = false, force = false } = {}) {
    if (this.pushing) return this.pushing;
    const at = this.changes;
    const snapshot = this._snapshot();
    const { send, json } = this._changesIn(snapshot);
    send.force = force;

    // Cache first: if the save fails, or the tab dies mid-flight, this is what
    // brings the world back.
    writeCache(this.id, { gen: this.gen, dirty: true, revs: plainRevs(this.revs), snapshot });

    if (!send.meta && !send.visitor && !send.patches.length && !send.drops.length) {
      this.dirty = this.changes !== at;
      this._set(this.dirty ? 'local' : 'saved');
      return Promise.resolve();
    }
    if (this.status !== 'offline') this._set('saving');
    this.sentAt = performance.now();

    this.pushing = saveWorld({ id: this.id, send, keepalive })
      .then((res) => {
        this._landed(res, snapshot, json);
        this.attempt = 0;
        this.holdUntil = 0;
        if (res.clashed) return this._clashed(res.clashed);
        // Something changed while that was in flight: keep the flag up.
        this.dirty = this.changes !== at;
        writeCache(this.id, { gen: this.gen, dirty: this.dirty, revs: plainRevs(this.revs), snapshot });
        const kb = (res.sentBytes / 1024).toFixed(1);
        const n = (res.patches || []).length;
        this._set(this.dirty ? 'local' : 'saved', `${kb} kB · ${n} ${n === 1 ? 'place' : 'places'} · gen ${this.gen}`);
      })
      .catch((err) => this._failed(err))
      .finally(() => {
        this.pushing = null;
      });
    return this.pushing;
  }

  _clashed(clashed) {
    const n = (clashed.regions || []).length;
    const bits = [];
    if (n) bits.push(`${n} ${n === 1 ? 'place' : 'places'}`);
    if (clashed.meta !== null && clashed.meta !== undefined) bits.push('the marks');
    this._set('conflict', `someone else saved ${bits.join(' and ') || 'this world'} while you were building`);
  }

  _failed(err) {
    const status = err instanceof WorldError ? err.status : 0;
    if (status === 413) return this._set('full', err.message);
    if (status === 404) return this._set('gone', 'this world is no longer on the server');
    this.holdUntil = performance.now() + BACKOFF[Math.min(this.attempt++, BACKOFF.length - 1)];
    // A 4xx that isn't about size or a missing world means the save itself was
    // not acceptable: say so plainly, and back off rather than hammering.
    this._set(status >= 400 && status < 500 ? 'local' : 'offline', err.message);
  }

  _set(status, detail = '') {
    this.status = status;
    this.detail = detail;
    if (this.onStatus) this.onStatus(this);
  }
}

// ── The local copy ──────────────────────────────────────────────────────────

const plainRevs = (revs) => ({ meta: revs.meta, patches: [...revs.patches] });
const cachedRevs = (cached) => (cached.revs ? { meta: cached.revs.meta || 0, patches: cached.revs.patches || [] } : { meta: 0, patches: [] });

function readCache(id) {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY(id)) || 'null');
    if (raw && raw.snapshot && Number.isFinite(raw.gen)) return raw;
  } catch {
    /* unreadable or blocked storage */
  }
  return null;
}

export function writeCache(id, data) {
  if (!id) return;
  try {
    localStorage.setItem(CACHE_KEY(id), JSON.stringify(data));
  } catch {
    /* storage full or unavailable: the server copy is the one that matters */
  }
}

function forgetCache(id) {
  try {
    localStorage.removeItem(CACHE_KEY(id));
  } catch {
    /* ignore */
  }
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
