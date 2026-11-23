// The skeet field at work: the round you're shooting, the throw you've
// called for, the targets in the air, breaking or coming down whole, and what
// each shot does to them. The rules are skeet.js's; this is them happening.
//
//   const range = new Range({ scene, site, lay, ground, chips, sound });
//   range.status(x, y, z)   what a click would do from there (for the shotgun)
//   range.pull()            "pull!": the next throw, a moment later
//   range.fired(o, d, from) a shot: -> { broke, lost, said } or null
//   range.update(dt, x, z)  every frame: the targets fly
//   range.clear()           put everything away (the club is out of sight)
//
// Emits:
//   'call'    ({ x, y, z })                      you called for a throw
//   'throw'   ({ houses })                       it was thrown
//   'scored'  ({ dead, station, option, next, score, shot, said })
//             every target of a throw broken or lost: dead { H, L } for the
//             houses it came from, and said, where the shot went if it missed
//   'round'   ({ score, of })                    the round is over
//   'abandon' ()                                 you walked off and left a round
//
// The targets are in the world, small meshes placed where they are; the bits
// of a broken one are the builder's chips.

import { Emitter } from '../core/events.js';
import { toLocal, toWorld } from '../world/frame.js';
import { Round, housesOf, launch, fly, pattern, meeting, missedBy, FIELD, HOUSE_NAME, TARGETS } from './skeet.js';
import { PLAN } from './site.js';
import { makeClay } from './models.js';

const PULL_DELAY = [0.2, 0.75]; // s from the call to the throw (how quick the puller is)
const ON_PAD = FIELD.pad + 0.2; // m from a station's middle (each way) that's standing on it
const PAD_HEIGHT = 1.2; // m over or under a pad's top that's still on it
const LIE = 0.013; // m a target that came down whole lies over the ground
const LANDED_KEEP = 30; // whole targets lying on the field at most; the oldest go
const AWAY = 150; // m from station 8: walk further than this and a round is given up
const LONGEST = 9; // s a target can be in the air, at the most
const SMOKED = 0.35; // share of the pattern's radius: hit nearer its middle than this, and a target turns to dust
const BITS = { orange: 0xf2621c, black: 0x262220 };

const _m = {};
const _l = {};

export class Range extends Emitter {
  // site, lay: where the club is and how high everything stands (site.js);
  // ground(x, z): the height of the ground; scene: where the targets go;
  // chips: the builder's (bits of a broken target); sound: for the trap and
  // the break; rnd: () -> 0..1, for the throws and the pattern.
  constructor({ scene, site, lay, ground, chips, sound, rnd = Math.random }) {
    super();
    this.scene = scene;
    this.site = site;
    this.lay = lay;
    this.ground = ground;
    this.chips = chips;
    this.sound = sound;
    this.rnd = rnd;
    this.round = null; // the Round under way
    this.finished = null; // the last one shot to the end, for the card
    this.throwing = null; // { station, kind, option, at, launched, shots, clays }
    this.air = []; // targets in the air: { x, y, z, vx, vy, vz, house, dead, breakAt, mesh, t }
    this.landed = []; // meshes of targets lying whole on the field
    this.pool = [];
    this.clock = 0;
  }

  // The station (1–8) whose pad (x, y, z) is on, or 0.
  stationAt(x, y, z) {
    for (const p of this.lay.pads) {
      toLocal({ x: p.x, z: p.z, yaw: this.site.yaw }, x, z, _l);
      if (Math.abs(_l.x) < ON_PAD && Math.abs(_l.z) < ON_PAD && Math.abs(y - p.top) < PAD_HEIGHT) return p.n;
    }
    return 0;
  }

  // Whether (x, z) is on the field (or the clubhouse's porch).
  onField(x, z) {
    toLocal(this.site, x, z, _l);
    return _l.x > PLAN[0] && _l.x < PLAN[2] && _l.z > PLAN[1] && _l.z < PLAN[3];
  }

  // What's thrown next: the round's next, or the first of a new one.
  get next() {
    return this.round ? this.round.next : { station: 1, kind: 'H', option: false };
  }

  // Where the next targets are shot from, in the world: { n, x, z, top }.
  get nextPad() {
    return this.lay.pads[this.next.station - 1];
  }

  // What a click would do from (x, y, z), for the shotgun (see shotgun.js):
  // -> null away from the field, or { state, prompt, need }.
  status(x, y, z) {
    const on = this.stationAt(x, y, z);
    const t = this.throwing;
    if (t && !t.launched) return { state: 'wait', prompt: '<i>pull!</i>' };
    if (t && t.clays.some((c) => c.dead === null)) return { state: 'flying', prompt: on ? `station ${on}` : '' };
    if (t) return { state: 'wait', prompt: on ? '<i>the next when these are down</i>' : '' };
    const next = this.next;
    const what = describe(next);
    if (on && on === next.station) {
      const start = this.round ? '' : ': a round of skeet, 25 targets';
      return { state: 'pull', need: housesOf(next.kind).length, prompt: `station ${on} · ${what} · <b>click</b> call pull${start}` };
    }
    if (on) return { state: 'wait', prompt: this.round ? `this is station ${on} · next: station ${next.station}, ${what}` : `this is station ${on} · a round starts at station 1` };
    if (this.round && this.onField(x, z)) return { state: 'field', prompt: `next: station ${next.station}, ${what}` };
    return null;
  }

  // "Pull!": the next throw, a moment from now. -> whether it was called.
  pull() {
    if (this.throwing) return false;
    if (!this.round) {
      this.round = new Round();
      this.finished = null;
    }
    const next = this.round.next;
    if (!next) return false;
    const delay = PULL_DELAY[0] + this.rnd() * (PULL_DELAY[1] - PULL_DELAY[0]);
    this.throwing = { ...next, at: this.clock + delay, launched: false, shots: housesOf(next.kind).length, clays: [] };
    const pad = this.lay.pads[next.station - 1];
    this.emit('call', { x: pad.x, y: pad.top + 1.6, z: pad.z });
    return true;
  }

  // A shot from `from` along the ray from o in direction d (unit), fired now.
  // -> null if there's no throw in the air, or { broke: [houses], lost:
  // [houses], said }: the targets this shot broke, those now lost, and where
  // the shot went if it broke nothing ('behind it').
  fired(o, d, from) {
    const t = this.throwing;
    if (!t || !t.launched || t.shots <= 0 || !t.clays.some((c) => c.dead === null)) return null;
    t.shots--;
    const broke = [];
    let nearest = null;
    for (const c of t.clays) {
      if (c.dead !== null) continue;
      const m = meeting(c, from, _m);
      const p = pattern(o, d, m.p, from);
      if (this.rnd() < p.chance) {
        c.dead = true;
        c.breakAt = this.clock + m.t;
        c.smoked = p.off < p.radius * SMOKED;
        broke.push(c.house);
      } else if (!nearest || p.off / p.radius < nearest.miss) {
        nearest = { miss: p.off / p.radius, at: { ...m.p }, said: missedBy(o, d, m.p, m.p) };
      }
    }
    const lost = [];
    if (t.shots <= 0) {
      for (const c of t.clays) {
        if (c.dead === null) {
          c.dead = false;
          lost.push(c.house);
        }
      }
    }
    const said = broke.length ? null : nearest ? nearest.said : null;
    this._settle(said);
    return { broke: broke.length, lost, said };
  }

  // Every frame: the throw goes out when it's due, the targets fly, break
  // and come down; and a round left behind is given up.
  update(dt, x, z) {
    this.clock += dt;
    const t = this.throwing;
    if (t && !t.launched && this.clock >= t.at) this._launch(t);
    for (let i = this.air.length - 1; i >= 0; i--) {
      const c = this.air[i];
      c.t += dt;
      if (c.breakAt && this.clock >= c.breakAt) {
        this._break(c);
        this.air.splice(i, 1);
        continue;
      }
      fly(c, dt);
      const g = this.ground(c.x, c.z);
      if (c.y <= g + LIE || c.t > LONGEST) {
        if (c.dead === null) {
          c.dead = false;
          this._settle(null);
        }
        this._land(c, g);
        this.air.splice(i, 1);
        continue;
      }
      // tipped up a little the way it's going, nose up
      const across = Math.hypot(c.vx, c.vz);
      c.mesh.position.set(c.x, c.y, c.z);
      c.mesh.rotation.set(0.12 - Math.atan2(c.vy, across) * 0.5, Math.atan2(c.vx, c.vz), 0, 'YXZ');
    }
    if (t && t.launched && t.clays.every((c) => !this.air.includes(c))) this.throwing = null;
    if (this.round && Math.hypot(x - this.site.x, z - this.site.z) > AWAY) {
      this.round = null;
      this.throwing = null;
      this.emit('abandon');
    }
  }

  // Everything away: the targets in the air and on the ground. A round under
  // way is kept (you may be back).
  clear() {
    for (const c of this.air) this._recycle(c.mesh);
    this.air.length = 0;
    for (const m of this.landed) this._recycle(m);
    this.landed.length = 0;
    if (this.throwing) {
      // a throw cut short counts for nothing: called again when you're back
      this.throwing = null;
    }
  }

  // The card's view of it: { station, next, results: [bool], score, shot, of, done }.
  card() {
    const r = this.round || this.finished;
    if (!r) return null;
    const next = r.next;
    return {
      next: next && { station: next.station, what: describe(next) },
      results: r.results.map((x) => x.dead),
      score: r.score,
      shot: r.results.length,
      of: TARGETS,
      done: !next,
    };
  }

  // ── Inside ────────────────────────────────────────────────────────────────

  _launch(t) {
    t.launched = true;
    // where this throw crosses: near the stake, never quite the same twice
    const j = FIELD.jitter;
    const over = toWorld(this.site, (this.rnd() * 2 - 1) * j, FIELD.cross + (this.rnd() * 2 - 1) * j);
    over.y = this.lay.cross.y + (this.rnd() * 2 - 1) * 0.25;
    const houses = housesOf(t.kind);
    for (const h of houses) {
      const from = this.lay.mouths[h];
      const v = launch(from, over);
      const mesh = this.pool.pop() || makeClay();
      mesh.position.set(from.x, from.y, from.z);
      this.scene.add(mesh);
      const c = { x: from.x, y: from.y, z: from.z, ...v, house: h, dead: null, breakAt: 0, mesh, t: 0 };
      t.clays.push(c);
      this.air.push(c);
      this.sound.call('trap', from.x, from.y, from.z);
    }
    this.emit('throw', { houses });
  }

  // Once every target of the throw is broken or lost: scored.
  _settle(said) {
    const t = this.throwing;
    if (!t || t.scored || t.clays.some((c) => c.dead === null)) return;
    t.scored = true;
    const dead = {};
    for (const c of t.clays) dead[c.house] = c.dead;
    this.round.record(dead);
    const next = this.round.next;
    this.emit('scored', { dead, station: t.station, option: t.option, next, score: this.round.score, shot: this.round.results.length, said });
    if (!next) {
      this.finished = this.round;
      this.round = null;
      this.emit('round', { score: this.finished.score, of: TARGETS });
    }
  }

  _break(c) {
    const at = c.mesh.position.set(c.x, c.y, c.z);
    this._recycle(c.mesh);
    if (this.chips) {
      // turned to dust in the middle of the pattern; a few big pieces at its edge
      this.chips.burst(at, c.smoked ? 16 : 7, BITS.orange, c.smoked ? 3 : 2, 0.25, c.vx * 0.08, c.vz * 0.08);
      this.chips.burst(at, c.smoked ? 14 : 5, BITS.black, c.smoked ? 3.5 : 2, 0.25, c.vx * 0.08, c.vz * 0.08);
    }
    this.sound.call('clay', c.x, c.y, c.z);
  }

  _land(c, g) {
    const m = c.mesh;
    m.position.set(c.x, g + LIE, c.z);
    m.rotation.set(this.rnd() < 0.3 ? Math.PI : 0, this.rnd() * Math.PI * 2, 0);
    this.landed.push(m);
    if (this.landed.length > LANDED_KEEP) this._recycle(this.landed.shift());
  }

  _recycle(mesh) {
    this.scene.remove(mesh);
    this.pool.push(mesh);
  }
}

// What's thrown, in words: 'high house', 'low house', 'a double', and the
// option said so.
export function describe(next) {
  const what = next.kind === 'D' ? 'a double' : HOUSE_NAME[next.kind];
  return next.option ? `${what} again, your option` : what;
}
