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
// Anyone with the link can save over the world, so every save carries the
// revision it was based on. If someone else saved in between, the server says
// no and we stop and ask rather than flattening their afternoon.

import { collectSnapshot, validateSnapshot } from './snapshot.js';
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
    this.rev = 0; // the revision our snapshot is based on
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
        this._adopt(id, cached.rev, local, !!cached.dirty);
        this._set('offline', err.message);
        return { id, rev: cached.rev, name: local.name, snapshot: local, offline: true };
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
    if (cached && cached.dirty && cached.rev === remote.rev) {
      const local = validateSnapshot(cached.snapshot);
      if (local) {
        use = local;
        recovered = true;
      }
    } else if (cached && cached.dirty && cached.rev < remote.rev) {
      this.detail = 'someone else saved this world while you were away, so their version opened';
    }

    this._adopt(id, remote.rev, use, recovered);
    writeCache(id, { rev: remote.rev, dirty: recovered, snapshot: use });
    this._set(recovered ? 'local' : 'saved', this.detail);
    return { id, rev: remote.rev, name: use.name || remote.name, snapshot: use, recovered };
  }

  _adopt(id, rev, snapshot, dirty) {
    this.id = id;
    this.rev = rev;
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
    // unreliable one, so try both and let the server dedupe by revision.
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
    const parts = this.parts;
    if (!parts) throw new WorldError('the world is not ready yet', 0);
    this._set('saving');
    const snapshot = this._snapshot(name);
    let made;
    try {
      made = await createWorld({ snapshot, name });
    } catch (err) {
      this._set('local', err.message);
      throw err;
    }
    this.id = made.id;
    this.rev = made.rev;
    this.name = name;
    this.dirty = false;
    this.sinceSave = 0;
    // From here on the server copy is the world; the per-seed local saves
    // would only drift, so hand persistence over to the cache for this id.
    parts.builder.storeKey = null;
    parts.marks.key = null;
    this.sentAt = performance.now();
    writeCache(this.id, { rev: this.rev, dirty: false, snapshot });
    setParam('w', this.id);
    this._set('saved');
    return this.url();
  }

  flush(opts = {}) {
    if (!this.id || !this.dirty) return Promise.resolve();
    if (this.status === 'conflict' || this.status === 'full' || this.status === 'gone') return Promise.resolve();
    return this._push(opts);
  }

  // Win a conflict: keep what's in front of us and save over theirs.
  async takeOver() {
    if (!this.id) return;
    this.dirty = true;
    await this._push({ force: true });
  }

  // Lose a conflict on purpose: open the world as it now stands on the server.
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

  _push({ keepalive = false, force = false } = {}) {
    if (this.pushing) return this.pushing;
    const at = this.changes;
    const snapshot = this._snapshot();
    // Cache first: if the save fails, or the tab dies mid-flight, this is what
    // brings the world back.
    writeCache(this.id, { rev: this.rev, dirty: true, snapshot });
    if (this.status !== 'offline') this._set('saving');
    this.sentAt = performance.now();

    this.pushing = saveWorld({ id: this.id, rev: this.rev, snapshot, name: this.name, force, keepalive })
      .then((res) => {
        this.rev = res.rev;
        this.attempt = 0;
        this.holdUntil = 0;
        // Something changed while that was in flight: keep the flag up.
        this.dirty = this.changes !== at;
        writeCache(this.id, { rev: this.rev, dirty: this.dirty, snapshot });
        this._set(this.dirty ? 'local' : 'saved', `${(res.bytes / 1024).toFixed(1)} kB · rev ${res.rev}`);
      })
      .catch((err) => this._failed(err))
      .finally(() => {
        this.pushing = null;
      });
    return this.pushing;
  }

  _failed(err) {
    const status = err instanceof WorldError ? err.status : 0;
    if (status === 409) {
      this.rev = (err.body && err.body.rev) || this.rev;
      return this._set('conflict', 'someone else saved this world while you were building');
    }
    if (status === 413) return this._set('full', err.message);
    if (status === 404) return this._set('gone', 'this world is no longer on the server');
    this.holdUntil = performance.now() + BACKOFF[Math.min(this.attempt++, BACKOFF.length - 1)];
    this._set('offline', err.message);
  }

  _set(status, detail = '') {
    this.status = status;
    this.detail = detail;
    if (this.onStatus) this.onStatus(this);
  }
}

// ── The local copy ──────────────────────────────────────────────────────────

function readCache(id) {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY(id)) || 'null');
    if (raw && raw.snapshot && Number.isFinite(raw.rev)) return raw;
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
