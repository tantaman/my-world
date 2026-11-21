// Adventures: something to get through, started whenever you like, in a
// forest that is otherwise there to wander and build in. A twister touching
// down upwind, a fire coming through the trees, a bear that has decided you
// are its business. One at a time, and nothing of it is kept in the world:
// when it's over the sky clears, the flames go out, the camp is gone. Only
// your record of them stays (index.js saves it).
//
// This is the part that knows nothing of any one adventure: which there are,
// the one you're on, how it's going for you, and how it ends. Each adventure
// is a kind, defined once:
//
//   adventures.define({
//     id: 'tornado',                 // for good: it is how your record is kept
//     title: 'Tornado',
//     blurb: 'A twister touches down upwind…',   // for the board
//     // optional: somewhere you have to go first (a cave, a mountainside).
//     // -> { x, z, label, near? } to be sent there, null to start where you
//     // are, or { none: 'why not' } if there's nowhere near enough
//     where(kit, from) {},
//     // it begins: make it happen. at is where you were sent, if anywhere.
//     start(kit, { at, from }) -> run,
//   });
//
// A run is the adventure under way:
//
//   {
//     objective        what to do, a few words (or a function for them)
//     left()           seconds to go, if it's against the clock, or null
//     guide()          somewhere to head for or keep clear of:
//                      { x, z, label } or null
//     note()           a word under the objective, if any ('sheltered')
//     update(dt)       every frame: -> null while it goes on, or
//                      { won: 'how' } or { lost: 'how' }
//     linger           seconds it may stay once won (a camp to look round),
//                      updated with after(dt) -> false once it's done with
//     dispose()        clear every trace of it away
//   }
//
// `kit` is whatever the adventures need of the world, handed in by index.js;
// this class only passes it on. `body` is you, as far as an adventure goes:
//
//   where() -> { x, z, yaw }   where you are
//   back(home)                 set you down at home again (after a loss)
//
// Emits:
//   'state'   (state)                   'idle' | 'travel' | 'on' | 'over'
//   'start'   (kind)                    it has begun
//   'hurt'    (amount, why)
//   'end'     (kind, outcome, line)     outcome: 'won' | 'lost' | 'left'
//   'back'    (home)                    you've been set down where it began
//   'record'  ()                        your record changed

import { Emitter } from '../core/events.js';

export const HEALTH = 100;
const MEND_AFTER = 7; // s without harm before you start to mend
const MEND = 4; // health a second, mending
export const CARD = 5; // s the word on how it ended stays up
const BLACKOUT = 0.9; // s into a loss you're set down again (under the blackout)
const ARRIVE = 30; // m from where you were sent: you're there

export class Adventures extends Emitter {
  constructor({ body, kit = {} }) {
    super();
    this.body = body;
    this.kit = kit;
    this.kinds = [];
    this.byId = new Map();
    this.state = 'idle';
    this.kind = null; // the one you're on, or heading for
    this.run = null;
    this.dest = null; // where you were sent: { x, z, label, near }
    this.health = HEALTH;
    this.sinceHurt = Infinity;
    this.time = 0; // s since it began
    this.outcome = null; // 'won' | 'lost', once over
    this.line = '';
    this.overFor = 0;
    this.home = null; // where it began, to be set down at after a loss
    this.lingering = null; // a run won and still about: { run, left }
    this.record = {}; // id -> { tries, won, best (s) }
  }

  define(kind) {
    if (!kind.id || !kind.title || typeof kind.start !== 'function') throw new Error('an adventure needs an id, a title and start()');
    if (this.byId.has(kind.id)) throw new Error(`adventure "${kind.id}" is already defined`);
    this.kinds.push(kind);
    this.byId.set(kind.id, kind);
    return kind;
  }

  get active() {
    return this.state !== 'idle';
  }

  // ── Beginning ─────────────────────────────────────────────────────────────
  // Set off on one. -> null if it has begun (or you've been sent somewhere
  // first), or why it can't.
  begin(id) {
    const kind = this.byId.get(id);
    if (!kind) return `no such adventure: ${id}`;
    if (this.active) return `you're on one already · ${this.kind.title}`;
    this._clearLingering();
    const from = this.body.where();
    const at = kind.where ? kind.where(this.kit, from) : null;
    if (at && at.none) return at.none;
    this.kind = kind;
    if (at) {
      this.dest = { near: ARRIVE, ...at };
      this._set('travel');
      return null;
    }
    this._start(null);
    return null;
  }

  _start(at) {
    const kind = this.kind;
    const from = this.body.where();
    this.home = { ...from };
    this.health = HEALTH;
    this.sinceHurt = Infinity;
    this.time = 0;
    this.outcome = null;
    this.line = '';
    this._tally(kind.id).tries++;
    this.run = kind.start(this.kit, { at, from });
    this._set('on');
    this.emit('start', kind);
    this.emit('record');
  }

  // Give it up: whatever it was is cleared away, there and then.
  abandon() {
    if (!this.active) return false;
    const kind = this.kind;
    const was = this.state;
    this._dispose();
    this._set('idle');
    if (was !== 'over') this.emit('end', kind, 'left', '');
    return true;
  }

  // ── How it goes for you ───────────────────────────────────────────────────
  hurt(amount, why = '') {
    if (this.state !== 'on' || !(amount > 0)) return;
    this.health = Math.max(0, this.health - amount);
    this.sinceHurt = 0;
    this.emit('hurt', amount, why);
    if (this.health <= 0) this._over('lost', why ? `you didn't make it · ${why}` : "you didn't make it");
  }

  // Worn down a little at a time (smoke, cold, heat): no cry or red pulse
  // for it, but no mending while it goes on either.
  wear(amount, why = '') {
    if (this.state !== 'on' || !(amount > 0)) return;
    this.health = Math.max(0, this.health - amount);
    this.sinceHurt = Math.min(this.sinceHurt, MEND_AFTER * 0.5);
    if (this.health <= 0) this._over('lost', why ? `you didn't make it · ${why}` : "you didn't make it");
  }

  // ── Every frame ───────────────────────────────────────────────────────────
  update(dt) {
    if (this.lingering) {
      const l = this.lingering;
      l.left -= dt;
      if (l.left <= 0 || (l.run.after && l.run.after(dt) === false)) this._clearLingering();
    }
    if (this.state === 'travel') {
      const p = this.body.where();
      if (Math.hypot(p.x - this.dest.x, p.z - this.dest.z) < this.dest.near) this._start(this.dest);
      return;
    }
    if (this.state === 'on') {
      this.time += dt;
      this.sinceHurt += dt;
      if (this.sinceHurt > MEND_AFTER) this.health = Math.min(HEALTH, this.health + MEND * dt);
      const r = this.run.update(dt);
      if (this.state !== 'on') return; // hurt to death in it
      if (r && r.won !== undefined) this._over('won', r.won);
      else if (r && r.lost !== undefined) this._over('lost', r.lost);
      return;
    }
    if (this.state === 'over') {
      const before = this.overFor;
      this.overFor += dt;
      if (this.outcome === 'won') {
        if (this.run) this.run.update(dt);
      } else if (before < BLACKOUT && this.overFor >= BLACKOUT) {
        // under the blackout: everything cleared away, and you back where it began
        this._disposeRun();
        this.body.back(this.home);
        this.emit('back', this.home);
      }
      if (this.overFor >= CARD) {
        if (this.outcome === 'won' && this.run && this.run.linger) {
          this.lingering = { run: this.run, left: this.run.linger };
          this.run = null;
        }
        this._dispose();
        this._set('idle');
      }
    }
  }

  _over(outcome, line) {
    const kind = this.kind;
    this.outcome = outcome;
    this.line = line;
    this.overFor = 0;
    if (outcome === 'won') {
      const r = this._tally(kind.id);
      r.won++;
      r.best = r.best ? Math.min(r.best, Math.round(this.time)) : Math.round(this.time);
      this.emit('record');
    }
    this._set('over');
    this.emit('end', kind, outcome, line);
  }

  // ── What the HUD shows ────────────────────────────────────────────────────
  // -> null when there's nothing on, or
  //    { state, title, objective, note, left, guide, health, outcome, line }
  view() {
    if (!this.active) return null;
    const v = { state: this.state, title: this.kind.title, objective: '', note: '', left: null, guide: null, health: this.health / HEALTH, outcome: this.outcome, line: this.line };
    if (this.state === 'travel') {
      v.objective = this.dest.objective || `get to ${this.dest.label}`;
      v.note = 'it begins when you get there';
      v.guide = { x: this.dest.x, z: this.dest.z, label: this.dest.label };
      return v;
    }
    const r = this.run;
    if (!r) return v;
    v.objective = typeof r.objective === 'function' ? r.objective() : r.objective || '';
    v.note = r.note ? r.note() || '' : '';
    v.left = r.left ? r.left() : null;
    v.guide = r.guide ? r.guide() : null;
    return v;
  }

  // ── Your record ───────────────────────────────────────────────────────────
  _tally(id) {
    return (this.record[id] ??= { tries: 0, won: 0, best: 0 });
  }

  serialize() {
    const out = {};
    for (const [id, r] of Object.entries(this.record)) out[id] = [r.tries, r.won, r.best];
    return out;
  }

  load(data) {
    this.record = {};
    for (const [id, r] of Object.entries(data || {})) {
      if (!Array.isArray(r)) continue;
      const [tries, won, best] = r.map((n) => (Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0));
      this.record[id] = { tries, won, best };
    }
  }

  // ── Tidying ───────────────────────────────────────────────────────────────
  _set(state) {
    if (state === this.state) return;
    this.state = state;
    this.emit('state', state);
  }

  _disposeRun() {
    if (this.run) this.run.dispose();
    this.run = null;
  }

  _dispose() {
    this._disposeRun();
    this.dest = null;
    this.kind = null;
  }

  _clearLingering() {
    if (!this.lingering) return;
    this.lingering.run.dispose();
    this.lingering = null;
  }
}

// What to keep of your record in a save: { id: [tries, won, best] }, checked.
export function validateRecord(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, r] of Object.entries(raw)) {
    if (typeof id !== 'string' || !Array.isArray(r) || r.length !== 3) continue;
    if (!r.every((n) => Number.isFinite(n) && n >= 0)) continue;
    out[id] = r.map((n) => Math.floor(n));
  }
  return out;
}
