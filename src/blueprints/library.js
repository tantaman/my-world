// The blueprints to hand: the ones that come with the game (plans.js) and the
// ones you copied from your own buildings, and which of them you're holding.
//
// Yours are kept in this browser for every world, not in any one world's
// save: like your look settings, they are about you rather than the place.
// The layout, one entry under KEYS.blueprints, is pinned by a test:
//
//   my-world:blueprints   { v: 1, plans: [blueprint, …] }    (see plan.js)
//
// Emits:
//   'change'  ()   the list, or the one in hand, changed

import { Emitter } from '../core/events.js';
import { normalize } from './plan.js';

const copy = (plan) => normalize(plan);

export class Library extends Emitter {
  // storage: get / set (core/storage.js); key: where yours are kept
  constructor({ storage, key, builtIn = [] }) {
    super();
    this.storage = storage;
    this.key = key;
    this.builtIn = builtIn.map(copy).filter(Boolean);
    const raw = storage.get(key);
    this.yours = raw && raw.v === 1 && Array.isArray(raw.plans) ? raw.plans.map(normalize).filter(Boolean) : [];
    this.index = 0;
  }

  get all() {
    return [...this.builtIn, ...this.yours];
  }

  names() {
    return this.all.map((p) => p.name);
  }

  // The one in hand (a copy: yours to change).
  get current() {
    const all = this.all;
    return copy(all[Math.min(this.index, all.length - 1)]);
  }

  next() {
    this.index = (this.index + 1) % this.all.length;
    this.emit('change');
    return this.current;
  }

  select(name) {
    const i = this.names().indexOf(name);
    if (i < 0) return false;
    this.index = i;
    this.emit('change');
    return true;
  }

  // Keep a plan of your own, under a name no other plan has. -> what was kept.
  add(plan) {
    const p = normalize(plan);
    if (!p) return null;
    p.name = this._fresh(p.name);
    this.yours.push(p);
    this.index = this.all.length - 1;
    this._write();
    return copy(p);
  }

  // Only your own can be renamed or thrown away.
  rename(name, to) {
    const p = this.yours.find((q) => q.name === name);
    const fresh = normalize({ ...p, name: to });
    if (!p || !fresh) return false;
    p.name = this._fresh(fresh.name, p);
    this._write();
    return true;
  }

  remove(name) {
    const i = this.yours.findIndex((q) => q.name === name);
    if (i < 0) return false;
    this.yours.splice(i, 1);
    this.index = Math.min(this.index, this.all.length - 1);
    this._write();
    return true;
  }

  _fresh(name, self = null) {
    const taken = new Set(this.all.filter((p) => p !== self).map((p) => p.name));
    if (!taken.has(name)) return name;
    for (let n = 2; ; n++) if (!taken.has(`${name} ${n}`)) return `${name} ${n}`;
  }

  _write() {
    this.storage.set(this.key, { v: 1, plans: this.yours.map(copy) });
    this.emit('change');
  }
}
