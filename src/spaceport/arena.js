// A match in the arena: the fighters, their railguns, who fragged whom.
//
// Railguns only. A rail goes straight through everyone in its way until it
// meets something solid, and one is enough: anybody it touches is fragged.
// There's no ammunition to run out of; after each shot the gun takes
// RELOAD seconds to charge again. Fall off into the void and you lose a
// frag. The fragged come back in after a moment at whichever way in is
// furthest from everyone else.
//
// You are a fighter like the bots: each frame the arena is told what you'd
// do (which way to go, jump, fire, where you look), and works out what came
// of it for everyone alike.
//
// No three.js in here: the look (arenaLook.js) draws what this says.
//
// Emits:
//   'rail'   ({ shooter, from, to, hits })   a shot: where from and to, and
//            the fighters it went through
//   'frag'   ({ killer, victim, how })       (from the match: see match.js)
//   'lead'   (how)                            (likewise)
//   'end'    ({ winner, standings })          (likewise)
//   'spawn'  (fighter)
//   'moved'  (fighter, { what, speed?, pad? })   a jump, a landing, a pad

import { Emitter } from '../core/events.js';
import { BOXES, PADS, SPAWNS, FLOOR, floorAt } from './orrery.js';
import { MOVE, makeBody, moveBody, rayBoxes, rayBox } from './mover.js';
import { Match, RULES } from './match.js';
import { Bot, ROSTER } from './bots.js';
import { mulberry32 } from '../noise.js';

export const RELOAD = 1.5; // s for the railgun to charge again
const REACH = 4000; // m a rail carries, if nothing stops it
const HIT_HALF = 0.5; // m either side of a fighter's middle a rail hits them (a touch more than they are wide)
const BACK_IN = 1.8; // s before a fragged bot comes back in...
const YOU_BACK = 1.2; // ...and before you can (fire, or wait AUTO_BACK more)
const AUTO_BACK = 3;
const PITCH_MOST = 1.55; // rad, up and down
const START = 3; // s of countdown before anyone can move

const MAP = { boxes: BOXES, pads: PADS };
const _d = { x: 0, y: 0, z: 0 };
const _o = { x: 0, y: 0, z: 0 };
const _n = { x: 0, y: 0, z: 0 };

export class Arena extends Emitter {
  // bots: how many (up to the roster's length). seed: for the bots' chances.
  constructor({ bots = 4, rules = RULES, seed = 1 } = {}) {
    super();
    this.rng = mulberry32(seed);
    this.fighters = [];
    this.me = this._fighter({ id: 'you', name: 'You', me: true, color: 0xf2f2f2 });
    for (const r of ROSTER.slice(0, bots)) {
      const f = this._fighter({ id: r.name.toLowerCase(), name: r.name, color: r.color });
      f.bot = new Bot(r.skill, mulberry32(Math.floor(this.rng() * 2 ** 31)));
    }
    this.match = new Match(this.fighters, rules);
    for (const kind of ['frag', 'lead', 'end']) this.match.on(kind, (e) => this.emit(kind, e));
    this.countdown = START;
    this._lastSpawn = -1;
    for (const f of this.fighters) this._spawn(f);
  }

  _fighter({ id, name, me = false, color }) {
    const f = { id, name, me, color, body: makeBody(), yaw: 0, pitch: 0, alive: true, reload: 0, backIn: 0, fragged: 0, bot: null, wish: { x: 0, z: 0 }, jump: false, fire: false };
    this.fighters.push(f);
    return f;
  }

  get over() {
    return this.match.over;
  }

  // What you'd do this frame:
  //   move   { x: right, y: forward } in -1..1, relative to where you look
  //   jump, fire   held or not
  //   turn   { yaw, pitch }: how far the view turned (rad)
  update(dt, you = null) {
    const me = this.me;
    if (you && me.alive) {
      me.yaw += you.turn.yaw;
      me.pitch = Math.max(-PITCH_MOST, Math.min(PITCH_MOST, me.pitch + you.turn.pitch));
      const s = Math.sin(me.yaw);
      const c = Math.cos(me.yaw);
      // forward is (−sin, −cos), right (cos, −sin)
      me.wish.x = -s * you.move.y + c * you.move.x;
      me.wish.z = -c * you.move.y - s * you.move.x;
      me.jump = you.jump;
      me.fire = you.fire;
    } else {
      me.wish.x = me.wish.z = 0;
      me.jump = me.fire = false;
    }
    if (this.countdown > 0) {
      this.countdown -= dt;
      return;
    }
    if (this.over) {
      for (const f of this.fighters) f.wish.x = f.wish.z = 0;
      this._moveAll(dt, false);
      return;
    }
    this.match.update(dt);
    for (const f of this.fighters) {
      if (!f.alive || !f.bot) continue;
      const o = f.bot.think(f, this.fighters.filter((g) => g !== f), dt);
      f.wish.x = o.wish.x;
      f.wish.z = o.wish.z;
      f.jump = o.jump;
      f.fire = o.fire;
      f.yaw = o.yaw;
      f.pitch = o.pitch;
    }
    this._moveAll(dt, true);
    for (const f of this.fighters) {
      if (!f.alive) continue;
      f.reload = Math.max(0, f.reload - dt);
      if (f.fire && f.reload <= 0) this.fire(f);
    }
    // the fallen, and the fragged coming back in
    for (const f of this.fighters) {
      if (f.alive && f.body.pos.y < FLOOR) this._fall(f);
      if (f.alive) continue;
      f.backIn -= dt;
      if (f.backIn > 0) continue;
      if (!f.me || (you && you.fire) || f.backIn < -AUTO_BACK) this._spawn(f);
    }
  }

  _moveAll(dt, live) {
    for (const f of this.fighters) {
      if (!f.alive) continue;
      const events = [];
      moveBody(f.body, f.wish, live && f.jump, dt, MAP, events);
      for (const e of events) {
        if (e.what === 'pad' && f.bot) f.bot.thrown(e.pad.id);
        this.emit('moved', f, e);
      }
    }
  }

  // Fire f's railgun along where it looks.
  fire(f) {
    f.reload = RELOAD;
    const p = f.body.pos;
    _o.x = p.x;
    _o.y = p.y + MOVE.eye;
    _o.z = p.z;
    aim(f.yaw, f.pitch, _d);
    const wall = rayBoxes(_o, _d, BOXES, REACH, _n);
    const hits = [];
    for (const g of this.fighters) {
      if (g === f || !g.alive) continue;
      const q = g.body.pos;
      const t = rayBox(_o, _d, q.x - HIT_HALF, q.y, q.z - HIT_HALF, q.x + HIT_HALF, q.y + MOVE.height, q.z + HIT_HALF, wall);
      if (t < wall) hits.push({ fighter: g, t });
    }
    hits.sort((a, b) => a.t - b.t);
    const far = Math.min(wall, REACH);
    const to = { x: _o.x + _d.x * far, y: _o.y + _d.y * far, z: _o.z + _d.z * far };
    const shot = { shooter: f, from: { ..._o }, to, wall: wall < REACH ? { ..._n } : null, hits: hits.map((h) => h.fighter) };
    this.emit('rail', shot);
    for (const h of hits) this._frag(f, h.fighter, 'rail');
    if (f.bot) f.bot.rerollAim();
    return shot;
  }

  _frag(killer, victim, how) {
    victim.alive = false;
    victim.backIn = victim.me ? YOU_BACK : BACK_IN;
    victim.fragged = this.match.time;
    victim.killer = killer;
    this.match.frag(killer ? killer.id : null, victim.id, how);
  }

  _fall(f) {
    this._frag(null, f, 'void');
  }

  // In at the way in furthest from everyone still standing (one of the
  // best few, by chance, and never the one last used).
  _spawn(f) {
    const others = this.fighters.filter((g) => g !== f && g.alive);
    const ranked = SPAWNS.map((s, i) => {
      let near = Infinity;
      for (const g of others) near = Math.min(near, Math.hypot(g.body.pos.x - s.x, g.body.pos.z - s.z));
      return { s, i, near };
    })
      .filter((r) => r.i !== this._lastSpawn)
      .sort((a, b) => b.near - a.near);
    const pick = ranked[Math.floor(this.rng() * Math.min(3, ranked.length))];
    this._lastSpawn = pick.i;
    const s = pick.s;
    f.body.pos.x = s.x;
    f.body.pos.z = s.z;
    f.body.pos.y = floorAt(s.x, s.z);
    f.body.vel.x = f.body.vel.y = f.body.vel.z = 0;
    f.body.grounded = true;
    f.yaw = s.yaw;
    f.pitch = 0;
    f.alive = true;
    f.reload = 0;
    f.killer = null;
    if (f.bot) f.bot.respawn(s.yaw);
    this.emit('spawn', f);
  }
}

// Which way a fighter looking at (yaw, pitch) looks: a unit vector.
export function aim(yaw, pitch, out = {}) {
  const c = Math.cos(pitch);
  out.x = -Math.sin(yaw) * c;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * c;
  return out;
}
