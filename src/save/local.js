// A world that lives only in this browser.
//
// With no ?w= nothing is sent anywhere: what you changed is kept here, per
// seed, and read back next time. Each save domain says which *bundle* keeps
// it (`local: 'build'` unless it says otherwise), and a bundle is one
// localStorage entry:
//
//   build   my-world:build:<seed>   { v: 1, inv, datum, terrain, forest, buildings, … }
//   marks   my-world:marks:<seed>   { v: 1, marks, tracked }      (survives ?clearbuild)
//   state   my-world:state          { seed, x, z, yaw, camYaw, camPitch, hours }
//
// A world grown on a land past the first (world/lands.js) is another world:
// its seed is written <seed>:land<n> in those keys, and state carries `land`.
//
// A new domain lands in `build` under its own id without anything here
// changing. `state` is the odd one out — it predates the rest, is not per
// seed, and keeps the player's fields flat — so it is spelled out below.

import { KEYS, localWorld } from '../core/storage.js';

const CHANGE_LULL = 1500; // ms after a change before it is written
const STATE_EVERY = 2000; // ms between notes of where you are standing

const STATE = {
  pack: (parts, seed, land) => ({ seed, ...(land > 1 && { land }), ...(parts.player || {}), hours: parts.hours }),
  unpack(raw, seed, land) {
    if (!raw || raw.seed !== seed || (raw.land || 1) !== land) return null;
    const { x, z, yaw, camYaw, camPitch } = raw;
    return { player: { x, z, yaw, camYaw, camPitch }, hours: raw.hours };
  },
};

export class LocalStore {
  // fresh: ?reset — don't pick up where you were standing
  // clear: ?clearbuild — forget what was built and changed
  constructor({ domains, storage, seed, land = 1, fresh = false, clear = false }) {
    this.domains = domains;
    this.storage = storage;
    this.seed = seed;
    this.land = land;
    this.fresh = fresh;
    this.clear = clear;
    this.enabled = true;
    this.writeAt = 0;
    this.stateAt = 0;
  }

  bundles() {
    const names = new Set();
    for (const d of this.domains.list) if (d.local) names.add(d.local);
    return [...names];
  }

  keyFor(bundle) {
    if (bundle === 'state') return KEYS.state;
    if (bundle === 'build') return KEYS.build(this.seed, this.land);
    if (bundle === 'marks') return KEYS.marks(this.seed, this.land);
    return `my-world:${bundle}:${localWorld(this.seed, this.land)}`;
  }

  // The land, other than this one, that this browser holds a world of this
  // seed grown on — something built, or marked — or 0. Only asked when this
  // one holds nothing yet.
  elsewhere(lands) {
    if (this.storage.get(KEYS.build(this.seed, this.land)) || this.storage.get(KEYS.marks(this.seed, this.land))) return 0;
    for (const land of lands) {
      if (land === this.land) continue;
      if (this.storage.get(KEYS.build(this.seed, land)) || this.storage.get(KEYS.marks(this.seed, land))) return land;
    }
    return 0;
  }

  // -> a state: everything this browser remembers about this seed's world.
  read() {
    const state = {};
    if (this.clear) this.storage.remove(this.keyFor('build'));
    for (const bundle of this.bundles()) {
      if (bundle === 'state' && this.fresh) continue;
      const raw = this.storage.get(this.keyFor(bundle));
      const parts = bundle === 'state' ? STATE.unpack(raw, this.seed, this.land) : raw && raw.v === 1 ? raw : null;
      if (!parts) continue;
      for (const d of this.domains.list) if (d.local === bundle && parts[d.id] !== undefined) state[d.id] = parts[d.id];
    }
    return state;
  }

  write(only = null) {
    if (!this.enabled) return;
    for (const bundle of this.bundles()) {
      if (only && bundle !== only) continue;
      const parts = this.domains.collect((d) => d.local === bundle);
      this.storage.set(this.keyFor(bundle), bundle === 'state' ? STATE.pack(parts, this.seed, this.land) : { v: 1, ...parts });
    }
  }

  // Something changed: write it down in a moment. Changes that keep coming
  // (a long dig) are written every lull, not held back until they stop.
  touch() {
    if (this.enabled && !this.writeAt) this.writeAt = performance.now() + CHANGE_LULL;
  }

  tick(now) {
    if (!this.enabled) return;
    if (this.writeAt && now > this.writeAt) this.flush();
    if (now > this.stateAt) {
      this.stateAt = now + STATE_EVERY;
      this.write('state');
    }
  }

  flush() {
    this.writeAt = 0;
    this.write();
  }

  // The world has an address now: the save server keeps it, and per-seed
  // copies here would only drift.
  disable() {
    this.enabled = false;
    this.writeAt = 0;
  }
}
