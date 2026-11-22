// A match in the town: ten fighters, their guns, the charge, who shot whom.
//
// Five Raiders and five Wardens. Every one of them is a bot until somebody
// walks in through the gate and takes one over; when they leave, the bot has
// it back. The rules of a round are rounds.js's, the guns arms.js's, the
// town town.js's and the bots' heads bots.js's: this is what happens when
// they all meet.
//
// One browser runs the match (the *host*: the first one in). It moves the
// bots, lands the shots, keeps the clock and the money, and several times a
// second tells everyone else in there how things stand (snapshot()). The
// others (*guests*) move their own fighter themselves, the moment a key goes
// down, and tell the host where they are and what they shot at; everything
// else they're shown is what the host last said (apply()). A match played
// alone is a host with nobody to tell. If the host leaves, a guest takes the
// match on from what it was last told (promote()).
//
// You are a fighter like the bots: each frame the match is told what you'd
// do, and works out what came of it for everyone alike:
//
//   move    { x: right, y: forward } in -1..1, relative to where you look
//   turn    { yaw, pitch }: how far the view turned (rad)
//   jump, crouch, walk, fire, use     held or not
//   fired, alt, reload, drop          pressed this frame
//   pick    'main' | 'side' | 'knife' | 'nade' | 'charge' | 'last' | 'next' |
//           'prev' | null: what to bring up
//   buy     something from the shop (arms.js), or null
//
// No three.js in here: the look (look.js) draws what this says.
//
// Emits, with plain numbers and ids only (a fighter's id is its place in
// `fighters`), so that a guest can be told the same things:
//   'round'    ({ round, attackers, carrier })   a round begins, everyone at home
//   'live'     ()                                 the freeze is over
//   'shot'     ({ by, gun, from, rays: [{ to, hit: [id, part] | null, n }] })
//   'hurt'     ({ id, by, dmg, part, hp, from })  by −1: nobody's doing
//   'kill'     ({ id, by, how, head })
//   'planting' ({ id }) · 'planted' ({ id, site, at }) · 'picked' ({ id }) · 'dropped' ({ id })
//   'defusing' ({ id }) · 'defused' ({ id })
//   'boom'     ({ at })                           the charge went off
//   'thrown'   ({ id, kind }) · 'burst' ({ kind, at })   a grenade
//   'bought'   ({ id, item }) · 'refused' ({ id, item, why })
//   'won'      ({ side, team, why })              a round
//   'half'     () · 'ended' ({ winner }) · 'match' ()
//   'joined'   ({ id, name }) · 'left' ({ id, name })
// and, of your own fighter only, never told to anyone:
//   'moved'    (id, { what: 'jump' | 'land', speed? })
//   'dry'      (id) · 'reload' (id) · 'draw' (id)

import { Emitter } from '../core/events.js';
import { mulberry32 } from '../noise.js';
import { wrapAngle } from '../core/geom.js';
import { BOXES, SPAWNS, siteAt, BUY_REACH } from './town.js';
import { MOVE, makeBody, moveBody, heightOf, eyeOf, aim, rayBoxes, rayBox } from './mover.js';
import { GUNS, GRENADES, freshKit, loaded, quote, take, wound, spreadOf, kickOf, SETTLE, UNKICK, SPRAY_RESETS, DRAW, CASH } from './arms.js';
import { Rounds, RULES, PAY } from './rounds.js';
import { Bot, brief } from './bots.js';

// Who the bots are. skill 0..1.
export const ROSTER = [
  { name: 'Brim', skill: 0.72 },
  { name: 'Okra', skill: 0.58 },
  { name: 'Tully', skill: 0.48 },
  { name: 'Marrow', skill: 0.64 },
  { name: 'Sedge', skill: 0.4 },
  { name: 'Flint', skill: 0.68 },
  { name: 'Harrow', skill: 0.6 },
  { name: 'Quill', skill: 0.44 },
  { name: 'Dace', skill: 0.54 },
  { name: 'Wren', skill: 0.76 },
];
export const TEAM = 5; // fighters a side

const PITCH_MOST = 1.5; // rad, up and down
const REACH = 300; // m a shot carries
const PICK_UP = 1.2; // m from the dropped charge that a Raider picks it up
const DEFUSE_REACH = 1.7; // m from the set charge that a Warden can pull it
const BLAST = { reach: 18, dmg: 500 }; // the charge going off: m, and health at its middle
const THROW = { speed: 17, up: 2.4, gravity: 15, bounce: 0.42, roll: 0.7 }; // a grenade: m/s, m/s², and what's left of its speed off a wall and along one
const HEAD_SIZE = 0.3; // m, the top of a fighter that counts as the head
const ASSIST = 40; // health you must have taken off someone for a share in their kill
const TOLD = 1 / 15; // s between a guest saying where it is
const EASE = 14; // how hard someone else's fighter is pulled to where they said they were (1/s)
const IDLE = { move: { x: 0, y: 0 }, turn: { yaw: 0, pitch: 0 } };
const HELD = ['main', 'side', 'knife', 'frag', 'flash', 'smoke', 'charge'];
const PHASES = ['freeze', 'live', 'planted', 'over', 'ended'];
// What a host tells its guests has happened (see the top of this file).
const TOLD_KINDS = new Set(['round', 'live', 'shot', 'hurt', 'kill', 'planting', 'planted', 'picked', 'dropped', 'defusing', 'defused', 'boom', 'thrown', 'burst', 'bought', 'refused', 'won', 'half', 'ended', 'match', 'joined', 'left']);
const NADES = ['frag', 'flash', 'smoke'];

const _d = { x: 0, y: 0, z: 0 };
const _o = { x: 0, y: 0, z: 0 };
const _n = { x: 0, y: 0, z: 0 };
const _w = { x: 0, z: 0 };
const _how = { jump: false, crouch: false, walk: false, speed: MOVE.speed };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const num = (v, otherwise = 0) => (Number.isFinite(v) ? v : otherwise);

export class Match extends Emitter {
  // me: { id, name }, who is playing here. host: whether this browser runs
  // the match. seed: for everything decided by chance.
  constructor({ me = { id: 'solo', name: 'You' }, host = true, seed = 1, rules = RULES } = {}) {
    super();
    this.me = me;
    this.host = host;
    this.rng = mulberry32(seed);
    this.time = 0;
    this.fighters = [];
    for (let id = 0; id < TEAM * 2; id++) this.fighters.push(this._fighter(id));
    this.rounds = new Rounds(rules);
    this.charge = { state: 'none', by: -1, x: 0, y: 0, z: 0, site: null, planter: -1, dropper: -1, wait: 0 };
    this.nades = []; // { id, kind, by, p, v, fuse, still }
    this.smokes = []; // { x, y, z, r, left }
    this.intel = null; // what each team's bots know between them (bots.js)
    this.out = []; // what a guest has to tell the host
    this._ev = []; // what the host has to tell the guests
    this._n = 0;
    this._nade = 0;
    this._fresh = true;
    this._told = 0;
    const R = this.rounds;
    R.on('round', () => this._muster());
    R.on('live', () => this._tell('live', {}));
    R.on('won', (e) => this._paid(e));
    R.on('half', () => {
      this._fresh = true;
      this._tell('half', {});
    });
    R.on('ended', (e) => this._tell('ended', { winner: e.winner }));
    R.on('match', () => {
      for (const f of this.fighters) f.kills = f.deaths = f.assists = 0;
      this._fresh = true;
      this._tell('match', {});
    });
    if (host) {
      for (const f of this.fighters) f.bot = new Bot(f.skill, mulberry32(Math.floor(this.rng() * 2 ** 31)));
      R.begin();
    }
  }

  _fighter(id) {
    return {
      id,
      team: id < TEAM ? 0 : 1,
      name: ROSTER[id].name,
      skill: ROSTER[id].skill,
      owner: null, // whose it is: null, a bot's
      bot: null,
      body: makeBody(),
      yaw: 0,
      pitch: 0,
      hp: 100,
      alive: true,
      kit: freshKit(),
      charge: false, // carrying it
      held: 'side',
      last: 'knife',
      ammo: { sidearm: loaded('sidearm') },
      cash: CASH.start,
      kills: 0,
      deaths: 0,
      assists: 0,
      next: 0, // s before the next shot
      draw: 0, // s before what's just been brought up can be used
      reloading: 0, // s of a reload to go
      bloom: 0,
      spray: 0,
      quiet: 0, // s since the last shot
      punch: { pitch: 0, yaw: 0 }, // where the kick has thrown the muzzle
      sighted: false,
      planting: 0, // s so far
      defusing: 0,
      wantPlant: false,
      wantDefuse: false,
      blind: 0, // s of a flash still to wear off
      walking: false,
      to: null, // someone else's fighter: where they last said they were
      tp: 0, // goes up each time the match puts them somewhere
      hurtBy: new Map(), // attacker id -> health taken, this round
    };
  }

  // ── Who's who ─────────────────────────────────────────────────────────────

  // Your fighter, or null if every place was taken.
  get mine() {
    return this.fighters.find((f) => f.owner === this.me.id) || null;
  }

  sideOf(f) {
    return this.rounds.sideOf(f.team);
  }

  // The gun in a fighter's hands, or null (a grenade, the charge).
  gunOf(f) {
    if (f.held === 'main') return GUNS[f.kit.main] || null;
    if (f.held === 'side') return GUNS[f.kit.side] || null;
    return f.held === 'knife' ? GUNS.knife : null;
  }

  has(f, what) {
    if (what === 'knife') return true;
    if (what === 'main' || what === 'side') return !!f.kit[what];
    if (what === 'charge') return f.charge;
    return f.kit[what] > 0;
  }

  // (host) Someone has walked in: a bot's place is theirs. The side with
  // fewer people on it, and of its bots one that's still standing, if any.
  join(owner, name) {
    const had = this.fighters.find((f) => f.owner === owner);
    if (had) return had;
    const people = [0, 1].map((t) => this.fighters.filter((f) => f.team === t && f.owner).length);
    const team = people[0] <= people[1] ? 0 : 1;
    const free = (t) => this.fighters.filter((f) => f.team === t && !f.owner).sort((a, b) => b.alive - a.alive || a.skill - b.skill);
    const f = free(team)[0] || free(1 - team)[0];
    if (!f) return null;
    f.owner = owner;
    f.name = String(name || 'Someone').slice(0, 24);
    f.bot = null;
    f.to = null;
    f.wantPlant = f.wantDefuse = false;
    f.tp++;
    this._tell('joined', { id: f.id, name: f.name });
    return f;
  }

  // (host) ...and has left: the bot has it back, as it stands.
  leave(owner) {
    const f = this.fighters.find((g) => g.owner === owner);
    if (!f) return;
    const name = f.name;
    f.owner = null;
    f.name = ROSTER[f.id].name;
    f.to = null;
    f.sighted = false;
    f.bot = new Bot(f.skill, mulberry32(Math.floor(this.rng() * 2 ** 31)));
    for (const slot of ['main', 'side']) if (f.kit[slot] && !f.ammo[f.kit[slot]]) f.ammo[f.kit[slot]] = loaded(f.kit[slot]);
    if (this.intel) brief(this, [f]);
    this._tell('left', { id: f.id, name });
  }

  // ── Each frame, on the host ───────────────────────────────────────────────

  update(dt, you = null) {
    if (!this.host) return this._follow(dt, you);
    this.time += dt;
    const R = this.rounds;
    R.update(dt, this._standing());
    const frozen = R.phase === 'freeze' || R.phase === 'ended';
    for (const f of this.fighters) {
      f.blind = Math.max(0, f.blind - dt);
      if (!f.alive) continue;
      if (f.bot) this._drive(f, f.bot.think(this, f, dt, frozen), dt, frozen);
      else if (f.owner === this.me.id) this._drive(f, you || IDLE, dt, frozen);
      else this._ease(f, dt);
    }
    this._chargeTick(dt);
    this._nadesTick(dt);
    for (let i = this.smokes.length - 1; i >= 0; i--) if ((this.smokes[i].left -= dt) <= 0) this.smokes.splice(i, 1);
  }

  _standing() {
    const n = { attack: 0, defend: 0 };
    for (const f of this.fighters) if (f.alive) n[this.sideOf(f)]++;
    return n;
  }

  // Tell everyone here, and (the host) everyone else.
  _tell(kind, data) {
    if (this.host) this._ev.push([kind, data]);
    this.emit(kind, data);
  }

  // ── A fighter doing what it would ─────────────────────────────────────────

  _drive(f, i, dt, frozen) {
    const b = f.body;
    let gun = this.gunOf(f);
    if (i.turn) {
      const fine = f.sighted && gun && gun.zoom ? 1 / gun.zoom : 1;
      f.yaw = wrapAngle(f.yaw + i.turn.yaw * fine);
      f.pitch = clamp(f.pitch + i.turn.pitch * fine, -PITCH_MOST, PITCH_MOST);
    }
    // which way to go: a bot says it in the world, you by where you look
    if (i.wish) {
      _w.x = i.wish.x;
      _w.z = i.wish.z;
    } else if (i.move) {
      const s = Math.sin(f.yaw);
      const c = Math.cos(f.yaw);
      _w.x = -s * i.move.y + c * i.move.x;
      _w.z = -c * i.move.y - s * i.move.x;
    } else _w.x = _w.z = 0;
    const busy = f.planting > 0 || f.defusing > 0;
    if (frozen || busy) _w.x = _w.z = 0;
    f.walking = !!i.walk;
    _how.jump = !frozen && !busy && !!i.jump;
    _how.crouch = !!i.crouch;
    _how.walk = !!i.walk;
    _how.speed = (gun ? gun.pace : MOVE.speed) * (f.sighted ? 0.55 : 1);
    const events = f.owner === this.me.id ? [] : null;
    moveBody(b, _w, _how, dt, BOXES, events);
    if (events) for (const e of events) this.emit('moved', f.id, e);

    // the gun settling
    f.next = Math.max(0, f.next - dt);
    f.draw = Math.max(0, f.draw - dt);
    f.quiet += dt;
    if (f.quiet > SPRAY_RESETS) f.spray = 0;
    f.bloom *= Math.exp(-SETTLE * dt);
    const back = Math.exp(-UNKICK * dt);
    f.punch.pitch *= back;
    f.punch.yaw *= back;
    if (f.reloading > 0 && (f.reloading -= dt) <= 0) {
      f.reloading = 0;
      const a = gun && f.ammo[gun.id];
      if (a) {
        const n = Math.min(gun.mag - a.mag, a.spare);
        a.mag += n;
        a.spare -= n;
      }
    }

    if (i.buy) this.buy(f, i.buy);
    if (i.pick) {
      this._pick(f, i.pick);
      gun = this.gunOf(f);
    }
    f.wantPlant = f.wantDefuse = false;
    if (frozen) return;
    if (i.drop) this._drop(f);
    // E at a site with the charge on you: bring it out and set it
    if (i.use && f.charge && f.held !== 'charge' && siteAt(b.pos.x, b.pos.z)) this._hold(f, 'charge');
    if (f.held === 'charge') {
      f.wantPlant = !!(i.fire || i.use);
    } else if (GRENADES[f.held]) {
      if (i.fired && f.draw <= 0) this._throw(f, f.held);
    } else if (gun) {
      const pull = gun.auto || gun.slot === 'knife' ? i.fire || i.fired : i.fired;
      if (pull && f.next <= 0 && f.draw <= 0 && f.reloading <= 0) {
        if (gun.slot === 'knife' || f.ammo[gun.id].mag > 0) this._shoot(f, gun);
        else {
          f.next = 0.3;
          this.emit('dry', f.id);
          this._reload(f, gun);
        }
      }
      if (i.alt && gun.zoom && f.reloading <= 0) f.sighted = !f.sighted;
      if (i.reload) this._reload(f, gun);
    }
    f.wantDefuse = !!i.use && f.held !== 'charge';
  }

  _reload(f, gun) {
    const a = f.ammo[gun.id];
    if (!a || f.reloading > 0 || a.mag >= gun.mag || a.spare <= 0) return;
    f.reloading = gun.reload;
    f.sighted = false;
    this.emit('reload', f.id);
  }

  // Bring something up, if they have it.
  _hold(f, what) {
    if (!this.has(f, what) || f.held === what) return false;
    f.last = f.held;
    f.held = what;
    f.draw = DRAW;
    f.reloading = 0;
    f.sighted = false;
    this.emit('draw', f.id);
    return true;
  }

  // pick: a thing to hold ('main', 'knife', 'charge'…), or 'last' (what was
  // in hand before), 'nade' (the next grenade they have), 'next' | 'prev'
  // (along everything they carry).
  _pick(f, pick) {
    if (pick === 'last') return this._hold(f, this.has(f, f.last) ? f.last : 'knife');
    if (pick === 'nade') {
      const at = NADES.indexOf(f.held);
      for (let k = 1; k <= NADES.length; k++) if (this._hold(f, NADES[(at + k + NADES.length) % NADES.length])) return true;
      return false;
    }
    if (pick === 'next' || pick === 'prev') {
      const have = HELD.filter((h) => this.has(f, h));
      const at = have.indexOf(f.held);
      return this._hold(f, have[(at + (pick === 'next' ? 1 : -1) + have.length) % have.length]);
    }
    return HELD.includes(pick) && this._hold(f, pick);
  }

  // What's in hand has gone (thrown, set, dropped): back to a gun.
  _rearm(f) {
    f.held = f.kit.main ? 'main' : f.kit.side ? 'side' : 'knife';
    f.draw = DRAW;
    f.sighted = false;
  }

  // ── Shots ─────────────────────────────────────────────────────────────────

  _shoot(f, gun) {
    const b = f.body;
    const knife = gun.slot === 'knife';
    f.next = gun.every;
    f.quiet = 0;
    _o.x = b.pos.x;
    _o.y = b.pos.y + eyeOf(b);
    _o.z = b.pos.z;
    const rays = [];
    if (knife) {
      aim(f.yaw, f.pitch, _d);
      rays.push(this._ray(f, _o, _d, gun.reach, 0.25));
    } else {
      f.ammo[gun.id].mag--;
      const pace = Math.hypot(b.vel.x, b.vel.z) / gun.pace;
      const stray = spreadOf(gun, { pace, air: !b.grounded, ducked: b.crouch > 0.5, sighted: f.sighted, bloom: f.bloom });
      for (let k = 0; k < (gun.pellets || 1); k++) {
        // strayed by up to `stray`, more often by less
        const a = this.rng() * Math.PI * 2;
        const r = stray * Math.sqrt(this.rng()) * (0.4 + 0.6 * this.rng());
        aim(f.yaw + f.punch.yaw + (Math.cos(a) * r) / Math.max(0.2, Math.cos(f.pitch)), f.pitch + f.punch.pitch + Math.sin(a) * r, _d);
        rays.push(this._ray(f, _o, _d, REACH, 0));
      }
      const k = kickOf(gun, f.spray, this.rng);
      f.punch.pitch += k.pitch;
      f.punch.yaw += k.yaw;
      f.spray++;
      f.bloom = Math.min(gun.most, f.bloom + gun.bloom);
    }
    const shot = { by: f.id, gun: gun.id, from: [r2(_o.x), r2(_o.y), r2(_o.z)], rays };
    if (this.host) this._land(shot);
    else {
      this.emit('shot', shot);
      this.out.push({ t: 'shot', gun: shot.gun, from: shot.from, rays });
    }
  }

  // What a shot from o along d meets first: a wall, or one of the other
  // side. fat: how much wider than they are it counts (a knife's swing).
  _ray(f, o, d, reach, fat) {
    let far = rayBoxes(o, d, BOXES, reach, _n);
    let wall = far < Infinity;
    if (!wall) far = reach;
    let hit = null;
    for (const g of this.fighters) {
      if (g === f || !g.alive || g.team === f.team) continue;
      const part = strike(o, d, g, far, fat);
      if (!part) continue;
      far = _far;
      hit = [g.id, part];
      wall = false;
    }
    return { to: [r2(o.x + d.x * far), r2(o.y + d.y * far), r2(o.z + d.z * far)], hit, n: wall ? [_n.x, _n.y, _n.z] : null };
  }

  // (host) A shot lands: who it hurts.
  _land(shot) {
    const f = this.fighters[shot.by];
    const gun = GUNS[shot.gun];
    if (!f || !gun) return;
    const from = shot.from;
    for (const ray of shot.rays) {
      if (!ray.hit) continue;
      const g = this.fighters[ray.hit[0]];
      if (!g || !g.alive || g.team === f.team) continue;
      const part = ray.hit[1] === 'head' || ray.hit[1] === 'legs' ? ray.hit[1] : 'body';
      const far = Math.hypot(ray.to[0] - from[0], ray.to[1] - from[1], ray.to[2] - from[2]);
      let w;
      if (gun.slot === 'knife') {
        // from behind, a knife is the end of it
        const behind = -Math.sin(g.yaw) * (g.body.pos.x - from[0]) - Math.cos(g.yaw) * (g.body.pos.z - from[2]) > 0.3;
        w = { health: gun.dmg * (behind ? gun.behind : 1), armor: 0 };
      } else w = wound(gun, part, far, g.kit.armor, g.kit.helmet);
      this._hurt(g, f, w, part, gun.id);
    }
    this._tell('shot', shot);
    if (gun.slot !== 'knife') this._noise(from[0], from[2], 55, f);
  }

  _hurt(g, by, w, part, how) {
    const dmg = Math.max(1, Math.round(w.health));
    g.kit.armor = Math.max(0, Math.round(g.kit.armor - w.armor));
    g.hp -= dmg;
    if (by) g.hurtBy.set(by.id, (g.hurtBy.get(by.id) || 0) + dmg);
    this._tell('hurt', { id: g.id, by: by ? by.id : -1, dmg, part, hp: Math.max(0, g.hp), from: by ? [r2(by.body.pos.x), r2(by.body.pos.z)] : null });
    if (g.bot && by) g.bot.hurt(by);
    if (g.hp <= 0) this._kill(g, by, how, part === 'head');
  }

  _kill(g, by, how, head) {
    g.alive = false;
    g.hp = 0;
    g.deaths++;
    g.planting = g.defusing = 0;
    g.sighted = false;
    g.body.vel.x = g.body.vel.y = g.body.vel.z = 0;
    if (by && by.team !== g.team) {
      by.kills++;
      by.cash = Math.min(CASH.most, by.cash + (GUNS[how]?.reward ?? 300));
    }
    for (const [id, dmg] of g.hurtBy) if ((!by || id !== by.id) && dmg >= ASSIST) this.fighters[id].assists++;
    if (g.charge) this._fall(g, g.body.pos.x, g.body.pos.y, g.body.pos.z);
    this._tell('kill', { id: g.id, by: by ? by.id : -1, how, head });
  }

  // A loud noise: the bots on the other side within `reach` m hear it.
  _noise(x, z, reach, by) {
    for (const g of this.fighters) {
      if (!g.bot || !g.alive || g.team === by.team) continue;
      if (Math.hypot(g.body.pos.x - x, g.body.pos.z - z) < reach) g.bot.heard(x, z, this.time);
    }
  }

  // ── The charge ────────────────────────────────────────────────────────────

  // It leaves whoever had it, and lies at (x, y, z).
  _fall(f, x, y, z) {
    const c = this.charge;
    f.charge = false;
    f.planting = 0;
    c.state = 'dropped';
    c.by = -1;
    c.dropper = f.id;
    c.wait = 1.2;
    c.x = x;
    c.y = y;
    c.z = z;
    if (f.held === 'charge') this._rearm(f);
    this._tell('dropped', { id: f.id });
  }

  // G: put the charge down a step ahead, for someone else to carry.
  _drop(f) {
    if (!f.charge) return;
    if (!this.host) return void this.out.push({ t: 'drop' });
    const p = f.body.pos;
    aim(f.yaw, 0, _d);
    let far = rayBoxes({ x: p.x, y: p.y + 0.5, z: p.z }, _d, BOXES, 1.6);
    far = Math.max(0, Math.min(1.6, far) - 0.3);
    this._fall(f, p.x + _d.x * far, p.y, p.z + _d.z * far);
  }

  _chargeTick(dt) {
    const c = this.charge;
    const R = this.rounds;
    if (c.state === 'carried') {
      const f = this.fighters[c.by];
      c.x = f.body.pos.x;
      c.y = f.body.pos.y;
      c.z = f.body.pos.z;
      const site = siteAt(c.x, c.z);
      if (f.alive && f.wantPlant && R.phase === 'live' && f.body.grounded && site) {
        if (f.planting === 0) this._tell('planting', { id: f.id });
        f.planting += dt;
        if (f.planting >= R.rules.plant) {
          f.charge = false;
          f.planting = 0;
          f.cash = Math.min(CASH.most, f.cash + PAY.plant);
          if (f.held === 'charge') this._rearm(f);
          c.state = 'planted';
          c.by = -1;
          c.site = site.id;
          c.planter = f.id;
          R.plant();
          this._tell('planted', { id: f.id, site: site.id, at: [r2(c.x), r2(c.y), r2(c.z)] });
        }
      } else f.planting = 0;
      return;
    }
    if (c.state === 'dropped') {
      c.wait -= dt;
      if (R.phase !== 'live') return;
      for (const f of this.fighters) {
        if (!f.alive || this.sideOf(f) !== 'attack' || (f.id === c.dropper && c.wait > 0)) continue;
        if (Math.hypot(f.body.pos.x - c.x, f.body.pos.z - c.z) > PICK_UP || Math.abs(f.body.pos.y - c.y) > 1.5) continue;
        c.state = 'carried';
        c.by = f.id;
        f.charge = true;
        this._tell('picked', { id: f.id });
        break;
      }
      return;
    }
    if (c.state !== 'planted' || R.phase !== 'planted') return;
    // pulling it: whoever is at it already, or else the nearest who's trying
    let who = null;
    let near = Infinity;
    for (const f of this.fighters) {
      if (!f.alive || !f.wantDefuse || this.sideOf(f) !== 'defend' || !f.body.grounded) continue;
      const d = Math.hypot(f.body.pos.x - c.x, f.body.pos.z - c.z);
      if (d > DEFUSE_REACH || Math.abs(f.body.pos.y - c.y) > 1.2) continue;
      const rank = f.defusing > 0 ? -1 : d;
      if (rank < near) {
        near = rank;
        who = f;
      }
    }
    for (const f of this.fighters) if (f !== who) f.defusing = 0;
    if (!who) return;
    if (who.defusing === 0) this._tell('defusing', { id: who.id });
    who.defusing += dt;
    if (who.defusing >= (who.kit.kit ? R.rules.kitDefuse : R.rules.defuse)) {
      who.defusing = 0;
      who.cash = Math.min(CASH.most, who.cash + PAY.defuse);
      c.state = 'defused';
      this._tell('defused', { id: who.id });
      R.defuse();
    }
  }

  // It goes off: nobody near it walks away.
  _explode() {
    const c = this.charge;
    c.state = 'blown';
    this._tell('boom', { at: [r2(c.x), r2(c.y), r2(c.z)] });
    _o.x = c.x;
    _o.y = c.y + 0.5;
    _o.z = c.z;
    for (const g of this.fighters) {
      if (!g.alive) continue;
      const far = Math.hypot(g.body.pos.x - c.x, g.body.pos.y - c.y, g.body.pos.z - c.z);
      if (far >= BLAST.reach) continue;
      const k = 1 - far / BLAST.reach;
      this._hurt(g, null, { health: BLAST.dmg * k * k * (this._clear(_o, g) ? 1 : 0.35), armor: 0 }, 'body', 'charge');
    }
  }

  // Is there nothing solid between a point and a fighter's chest?
  _clear(o, g) {
    const p = g.body.pos;
    const dx = p.x - o.x;
    const dy = p.y + heightOf(g.body) * 0.65 - o.y;
    const dz = p.z - o.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-3) return true;
    _d.x = dx / d;
    _d.y = dy / d;
    _d.z = dz / d;
    return rayBoxes(o, _d, BOXES, d) === Infinity;
  }

  // ── Grenades ──────────────────────────────────────────────────────────────

  _throw(f, kind) {
    if (!(f.kit[kind] > 0)) return;
    f.kit[kind] = 0;
    const b = f.body;
    aim(f.yaw, f.pitch, _d);
    const p = [r2(b.pos.x + _d.x * 0.4), r2(b.pos.y + eyeOf(b) - 0.1), r2(b.pos.z + _d.z * 0.4)];
    const v = [r2(_d.x * THROW.speed + b.vel.x * 0.6), r2(_d.y * THROW.speed + THROW.up), r2(_d.z * THROW.speed + b.vel.z * 0.6)];
    this._rearm(f);
    if (this.host) this._lob(f, kind, p, v);
    else {
      f.threw = { kind, at: this.time };
      this.emit('thrown', { id: f.id, kind });
      this.out.push({ t: 'throw', kind, p, v });
    }
  }

  _lob(f, kind, p, v) {
    this.nades.push({ id: ++this._nade, kind, by: f.id, p: { x: p[0], y: p[1], z: p[2] }, v: { x: v[0], y: v[1], z: v[2] }, fuse: GRENADES[kind].fuse, still: false });
    this._tell('thrown', { id: f.id, kind });
  }

  _nadesTick(dt) {
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      n.fuse -= dt;
      if (!n.still) fly(n, dt);
      if (n.fuse > 0) continue;
      this.nades.splice(i, 1);
      this._burst(n);
    }
  }

  _burst(n) {
    const G = GRENADES[n.kind];
    const by = this.fighters[n.by];
    const at = { x: n.p.x, y: n.p.y + 0.15, z: n.p.z };
    this._tell('burst', { kind: n.kind, at: [r2(at.x), r2(at.y), r2(at.z)] });
    if (n.kind === 'smoke') {
      this.smokes.push({ x: at.x, y: at.y + 1.2, z: at.z, r: G.reach, left: G.lasts });
      return;
    }
    for (const g of this.fighters) {
      if (!g.alive) continue;
      const p = g.body.pos;
      const far = Math.hypot(p.x - at.x, p.y + 1 - at.y, p.z - at.z);
      if (far >= G.reach || !this._clear(at, g)) continue;
      if (n.kind === 'frag') {
        // the other side, and whoever threw it
        if (g.team === by.team && g !== by) continue;
        const dmg = G.dmg * (1 - far / G.reach);
        this._hurt(g, g === by ? null : by, { health: g.kit.armor > 0 ? dmg * 0.6 : dmg, armor: dmg * 0.2 }, 'body', 'frag');
      } else {
        // a flash: worst looking straight at it, close to
        aim(g.yaw, g.pitch, _d);
        const facing = (_d.x * (at.x - p.x) + _d.y * (at.y - p.y - eyeOf(g.body)) + _d.z * (at.z - p.z)) / Math.max(far, 0.1);
        const k = (facing > 0.4 ? 1 : facing > -0.1 ? 0.55 : 0.2) * (1 - (far / G.reach) * 0.7);
        g.blind = Math.max(g.blind, G.blind * k);
      }
    }
    this._noise(at.x, at.z, 40, by);
  }

  // ── Rounds ────────────────────────────────────────────────────────────────

  // A round begins: everyone at home, on their feet, with what they kept.
  _muster() {
    const R = this.rounds;
    const fresh = this._fresh;
    this._fresh = false;
    const next = { attack: 0, defend: 0 };
    for (const f of this.fighters) {
      const side = this.sideOf(f);
      if (fresh) f.cash = CASH.start;
      if (fresh || !f.alive) {
        f.kit = freshKit();
        f.ammo = {};
      }
      for (const slot of ['main', 'side']) if (f.kit[slot]) f.ammo[f.kit[slot]] = loaded(f.kit[slot]);
      const s = SPAWNS[side][next[side]++ % SPAWNS[side].length];
      this._place(f, s.x, 0, s.z, s.yaw);
      f.hp = 100;
      f.alive = true;
      f.charge = false;
      f.held = f.kit.main ? 'main' : 'side';
      f.last = 'knife';
      f.hurtBy.clear();
    }
    const raiders = this.fighters.filter((f) => this.sideOf(f) === 'attack');
    const carrier = raiders[Math.floor(this.rng() * raiders.length)];
    carrier.charge = true;
    Object.assign(this.charge, { state: 'carried', by: carrier.id, site: null, planter: -1, dropper: -1, wait: 0 });
    this.nades.length = 0;
    this.smokes.length = 0;
    brief(this);
    this._tell('round', { round: R.round, attackers: R.attackers, carrier: carrier.id });
  }

  _place(f, x, y, z, yaw) {
    const b = f.body;
    b.pos.x = x;
    b.pos.y = y;
    b.pos.z = z;
    b.vel.x = b.vel.y = b.vel.z = 0;
    b.grounded = true;
    b.crouch = 0;
    f.yaw = yaw;
    f.pitch = 0;
    f.to = null;
    f.tp++;
    f.next = f.draw = f.reloading = f.bloom = f.spray = f.planting = f.defusing = f.blind = 0;
    f.punch.pitch = f.punch.yaw = 0;
    f.sighted = f.wantPlant = f.wantDefuse = false;
  }

  // A round is won: everyone is paid, and if it was the charge, it goes off.
  _paid({ side, team, why, pay }) {
    for (const f of this.fighters) {
      const s = this.sideOf(f);
      const sum = pay.keepNothing && s === 'attack' && f.alive ? 0 : pay[s];
      f.cash = Math.min(CASH.most, f.cash + sum);
    }
    this._tell('won', { side, team, why });
    if (why === 'exploded') this._explode();
  }

  // (host) Buy something, if they're at home and it's still the time for it.
  buy(f, item) {
    if (!this.host) return void this.out.push({ t: 'buy', item });
    const side = this.sideOf(f);
    let no = '';
    if (!f.alive) no = 'not now';
    else if (!this.rounds.buying) no = 'the time to buy is over';
    else if (!this.atHome(f)) no = 'only at home';
    const q = no ? { no } : quote(f.kit, f.cash, side, item);
    if (q.no) return void this._tell('refused', { id: f.id, item, why: q.no });
    f.cash -= q.price;
    const gun = take(f.kit, item);
    if (gun) {
      f.ammo[gun] = loaded(gun);
      this._hold(f, GUNS[gun].slot);
    }
    this._tell('bought', { id: f.id, item });
  }

  // Is a fighter where their side comes in?
  atHome(f) {
    const s = SPAWNS[this.sideOf(f)][2];
    return Math.hypot(f.body.pos.x - s.x, f.body.pos.z - s.z) < BUY_REACH;
  }

  // ── Telling the guests, and being told ────────────────────────────────────

  // (host) How things stand, and what has happened since the last one.
  snapshot() {
    const R = this.rounds;
    const c = this.charge;
    return {
      n: ++this._n,
      r: [R.round, R.phase, r2(R.left), r2(R.time), R.score[0], R.score[1], R.attackers, R.losses[0], R.losses[1], R.planted ? 1 : 0, R.winner === undefined ? -2 : R.winner === null ? -1 : R.winner],
      c: [c.state, c.by, r2(c.x), r2(c.y), r2(c.z), c.site || 0, c.planter],
      f: this.fighters.map((f) => {
        const p = f.body.pos;
        const k = f.kit;
        const flags = (f.walking ? 1 : 0) | (f.sighted ? 2 : 0) | (f.body.grounded ? 4 : 0) | (f.reloading > 0 ? 8 : 0) | (k.helmet ? 16 : 0) | (k.kit ? 32 : 0) | (f.charge ? 64 : 0) | (f.alive ? 128 : 0);
        return [f.owner || 0, f.name, f.hp, r2(p.x), r2(p.y), r2(p.z), r3(f.yaw), r3(f.pitch), r2(f.body.crouch), f.held, k.main || 0, k.side || 0, k.frag, k.flash, k.smoke, k.armor, f.cash, f.kills, f.deaths, f.assists, f.tp, r2(f.planting), r2(f.defusing), r2(f.blind), flags];
      }),
      g: this.nades.map((n) => [n.id, n.kind, r2(n.p.x), r2(n.p.y), r2(n.p.z)]),
      s: this.smokes.map((s) => [r2(s.x), r2(s.y), r2(s.z), s.r, r2(s.left)]),
      e: this._ev.splice(0),
    };
  }

  // (guest) The host has said how things stand.
  apply(snap) {
    if (this.host || !snap || !Array.isArray(snap.f) || !Array.isArray(snap.r)) return;
    const R = this.rounds;
    const r = snap.r;
    R.round = num(r[0]);
    R.phase = PHASES.includes(r[1]) ? r[1] : 'freeze';
    R.left = num(r[2]);
    R.time = num(r[3]);
    R.score = [num(r[4]), num(r[5])];
    R.attackers = r[6] === 1 ? 1 : 0;
    R.losses = [num(r[7]), num(r[8])];
    R.planted = !!r[9];
    R.winner = r[10] === -2 ? undefined : r[10] === -1 ? null : r[10];
    const c = this.charge;
    if (Array.isArray(snap.c)) {
      c.state = typeof snap.c[0] === 'string' ? snap.c[0] : 'none';
      c.by = this.fighters[snap.c[1]] ? snap.c[1] : -1;
      if (c.state === 'carried' && c.by < 0) c.state = 'none';
      c.x = num(snap.c[2]);
      c.y = num(snap.c[3]);
      c.z = num(snap.c[4]);
      c.site = snap.c[5] === 'A' || snap.c[5] === 'B' ? snap.c[5] : null;
      c.planter = num(snap.c[6], -1);
    }
    snap.f.forEach((s, id) => {
      const f = this.fighters[id];
      if (!f || !Array.isArray(s)) return;
      const mine = s[0] === this.me.id;
      const was = { owner: f.owner, alive: f.alive, tp: f.tp, main: f.kit.main, side: f.kit.side };
      const flags = s[24];
      f.owner = typeof s[0] === 'string' && s[0] ? s[0] : null;
      if (typeof s[1] === 'string') f.name = s[1].slice(0, 24);
      f.hp = num(s[2]);
      f.alive = !!(flags & 128);
      const k = f.kit;
      // (what's said is checked: a guest draws from it every frame)
      k.main = GUNS[s[10]] ? s[10] : null;
      k.side = GUNS[s[11]] ? s[11] : null;
      for (const [j, kind] of NADES.entries()) if (!(mine && f.threw && f.threw.kind === kind && this.time - f.threw.at < 1.5)) k[kind] = s[12 + j];
      k.armor = num(s[15]);
      k.helmet = !!(flags & 16);
      k.kit = !!(flags & 32);
      f.charge = !!(flags & 64);
      f.cash = num(s[16]);
      f.kills = num(s[17]);
      f.deaths = num(s[18]);
      f.assists = num(s[19]);
      f.tp = num(s[20]);
      f.planting = num(s[21]);
      f.defusing = num(s[22]);
      const at = { x: num(s[3]), y: num(s[4]), z: num(s[5]), yaw: num(s[6]), pitch: num(s[7]), crouch: clamp(num(s[8]), 0, 1), grounded: !!(flags & 4) };
      const held = HELD.includes(s[9]) ? s[9] : 'knife';
      if (!mine) {
        f.held = held;
        f.walking = !!(flags & 1);
        f.sighted = !!(flags & 2);
        f.reloading = flags & 8 ? 1 : 0;
        f.blind = num(s[23]);
        if (!f.to || was.tp !== f.tp || (f.alive && !was.alive)) this._put(f, at);
        f.to = at;
        return;
      }
      // your own: where you are is yours to say, unless the match has moved you
      f.blind = Math.max(f.blind, num(s[23]));
      if (was.owner !== f.owner || was.tp !== f.tp || (f.alive && !was.alive)) {
        this._put(f, at);
        f.to = null;
        f.next = f.reloading = f.bloom = f.spray = 0;
        f.sighted = false;
        f.ammo = {};
        f.held = held;
      }
      // a gun you didn't have is full, and comes up
      for (const slot of ['main', 'side']) {
        const gun = k[slot];
        if (!gun) continue;
        if (!f.ammo[gun]) f.ammo[gun] = loaded(gun);
        if (gun !== was[slot] && was.owner === f.owner && was.tp === f.tp) this._hold(f, slot);
      }
      if (!this.has(f, f.held)) this._rearm(f);
    });
    this.nades = (Array.isArray(snap.g) ? snap.g : []).filter(Array.isArray).slice(0, 40).map((g) => ({ id: g[0], kind: g[1], p: { x: num(g[2]), y: num(g[3]), z: num(g[4]) } }));
    this.smokes = (Array.isArray(snap.s) ? snap.s : []).filter(Array.isArray).slice(0, 40).map((s) => ({ x: num(s[0]), y: num(s[1]), z: num(s[2]), r: num(s[3], 4), left: num(s[4]) }));
    for (const said of Array.isArray(snap.e) ? snap.e : []) {
      if (!Array.isArray(said)) continue;
      const [kind, data] = said;
      if (!TOLD_KINDS.has(kind) || !data || typeof data !== 'object') continue;
      // (who an event is about has to be someone)
      if (('id' in data && !this.fighters[data.id]) || ('by' in data && data.by !== -1 && !this.fighters[data.by])) continue;
      // (your own shots and throws you've already seen)
      const own = this.mine;
      if (own && ((kind === 'shot' && data.by === own.id) || (kind === 'thrown' && data.id === own.id))) continue;
      if (kind === 'round' && own) for (const slot of ['main', 'side']) if (own.kit[slot]) own.ammo[own.kit[slot]] = loaded(own.kit[slot]);
      this.emit(kind, data);
    }
  }

  _put(f, at) {
    const b = f.body;
    b.pos.x = at.x;
    b.pos.y = at.y;
    b.pos.z = at.z;
    b.vel.x = b.vel.y = b.vel.z = 0;
    b.crouch = at.crouch;
    b.grounded = at.grounded;
    f.yaw = at.yaw;
    f.pitch = at.pitch;
  }

  // (guest) Each frame: your own fighter moves at once; the rest are eased
  // to where the host last said they were; and the host is told where you are.
  _follow(dt, you) {
    this.time += dt;
    const R = this.rounds;
    if (R.phase !== 'ended') R.left = Math.max(0, R.left - dt);
    const frozen = R.phase === 'freeze' || R.phase === 'ended';
    const mine = this.mine;
    for (const f of this.fighters) {
      f.blind = Math.max(0, f.blind - dt);
      if (!f.alive) continue;
      if (f === mine) this._drive(f, you || IDLE, dt, frozen);
      else this._ease(f, dt);
    }
    for (const s of this.smokes) s.left -= dt;
    if (!mine) return;
    this._told -= dt;
    if (this._told > 0) return;
    this._told = TOLD;
    const b = mine.body;
    this.out.push({
      t: 'me',
      p: [r2(b.pos.x), r2(b.pos.y), r2(b.pos.z)],
      a: [r3(mine.yaw), r3(mine.pitch)],
      c: r2(b.crouch),
      h: mine.held,
      f: (mine.walking ? 1 : 0) | (mine.sighted ? 2 : 0) | (b.grounded ? 4 : 0) | (mine.reloading > 0 ? 8 : 0) | (mine.wantPlant ? 16 : 0) | (mine.wantDefuse ? 32 : 0),
    });
  }

  // Someone else's fighter, eased to where they last said they were.
  _ease(f, dt) {
    const to = f.to;
    if (!to) return;
    const b = f.body;
    const k = 1 - Math.exp(-EASE * dt);
    const dx = to.x - b.pos.x;
    const dy = to.y - b.pos.y;
    const dz = to.z - b.pos.z;
    if (Math.hypot(dx, dy, dz) > 5) {
      b.pos.x = to.x;
      b.pos.y = to.y;
      b.pos.z = to.z;
      b.vel.x = b.vel.z = 0;
    } else {
      const step = 1 / Math.max(dt, 1e-4);
      b.vel.x += ((dx * k * step - b.vel.x) * k) / 2;
      b.vel.z += ((dz * k * step - b.vel.z) * k) / 2;
      b.pos.x += dx * k;
      b.pos.y += dy * k;
      b.pos.z += dz * k;
    }
    b.crouch += (to.crouch - b.crouch) * k;
    b.grounded = to.grounded;
    f.yaw += wrapAngle(to.yaw - f.yaw) * k;
    f.pitch += (to.pitch - f.pitch) * k;
  }

  // (host) A guest has said something.
  hear(owner, msg) {
    if (!this.host || !msg || typeof msg !== 'object') return;
    const f = this.fighters.find((g) => g.owner === owner);
    if (!f) return;
    if (msg.t === 'me') {
      if (!Array.isArray(msg.p) || !Array.isArray(msg.a)) return;
      const flags = msg.f | 0;
      f.to = { x: num(msg.p[0]), y: num(msg.p[1]), z: num(msg.p[2]), yaw: num(msg.a[0]), pitch: clamp(num(msg.a[1]), -PITCH_MOST, PITCH_MOST), crouch: clamp(num(msg.c), 0, 1), grounded: !!(flags & 4) };
      if (HELD.includes(msg.h) && this.has(f, msg.h)) f.held = msg.h;
      f.walking = !!(flags & 1);
      f.sighted = !!(flags & 2);
      f.reloading = flags & 8 ? 1 : 0;
      f.wantPlant = !!(flags & 16) && f.charge;
      f.wantDefuse = !!(flags & 32);
      return;
    }
    if (!f.alive || this.rounds.phase === 'freeze' || this.rounds.phase === 'ended') {
      if (msg.t === 'buy' && typeof msg.item === 'string') this.buy(f, msg.item);
      return;
    }
    if (msg.t === 'shot') {
      const gun = GUNS[msg.gun];
      if (!gun || !Array.isArray(msg.from) || !Array.isArray(msg.rays)) return;
      if (gun.id !== 'knife' && gun.id !== f.kit.main && gun.id !== f.kit.side) return;
      const rays = msg.rays.slice(0, gun.pellets || 1).filter((r) => r && Array.isArray(r.to)).map((r) => ({ to: r.to.slice(0, 3).map((v) => num(v)), hit: Array.isArray(r.hit) ? [r.hit[0] | 0, String(r.hit[1])] : null, n: Array.isArray(r.n) ? r.n.slice(0, 3).map((v) => num(v)) : null }));
      this._land({ by: f.id, gun: gun.id, from: msg.from.slice(0, 3).map((v) => num(v)), rays });
    } else if (msg.t === 'throw') {
      if (!GRENADES[msg.kind] || !(f.kit[msg.kind] > 0) || !Array.isArray(msg.p) || !Array.isArray(msg.v)) return;
      f.kit[msg.kind] = 0;
      const v = msg.v.slice(0, 3).map((x) => clamp(num(x), -30, 30));
      this._lob(f, msg.kind, msg.p.slice(0, 3).map((x) => num(x)), v);
    } else if (msg.t === 'buy' && typeof msg.item === 'string') this.buy(f, msg.item);
    else if (msg.t === 'drop') this._drop(f);
  }

  // (guest) The host has gone: this browser runs the match from here, from
  // what it was last told. present: who is still in there.
  promote(present) {
    if (this.host) return;
    this.host = true;
    this._ev.length = 0;
    this.out.length = 0;
    const here = new Set(present);
    for (const f of this.fighters) {
      f.to = f.owner === this.me.id ? null : f.to;
      if (f.owner && !here.has(f.owner)) f.owner = null;
      if (!f.owner) {
        f.name = ROSTER[f.id].name;
        f.bot = new Bot(f.skill, mulberry32(Math.floor(this.rng() * 2 ** 31)));
        for (const slot of ['main', 'side']) if (f.kit[slot]) f.ammo[f.kit[slot]] = loaded(f.kit[slot]);
      }
      f.hurtBy.clear();
    }
    this.nades = this.nades.map((n) => ({ ...n, by: 0, v: { x: 0, y: 0, z: 0 }, fuse: 0.5, still: true }));
    brief(this);
  }
}

// Where along the ray o + d·t (t < max) it meets fighter g, and in what:
// 'head' | 'body' | 'legs', or null. The distance is left in _far.
let _far = 0;
export function strike(o, d, g, max, fat = 0) {
  const p = g.body.pos;
  const top = p.y + heightOf(g.body);
  const waist = p.y + heightOf(g.body) * 0.45;
  let best = max;
  let part = null;
  let t = rayBox(o, d, p.x - 0.17 - fat, top - HEAD_SIZE, p.z - 0.17 - fat, p.x + 0.17 + fat, top, p.z + 0.17 + fat, best);
  if (t < best) {
    best = t;
    part = 'head';
  }
  t = rayBox(o, d, p.x - 0.3 - fat, waist, p.z - 0.3 - fat, p.x + 0.3 + fat, top - HEAD_SIZE, p.z + 0.3 + fat, best);
  if (t < best) {
    best = t;
    part = 'body';
  }
  t = rayBox(o, d, p.x - 0.24 - fat, p.y, p.z - 0.24 - fat, p.x + 0.24 + fat, waist, p.z + 0.24 + fat, best);
  if (t < best) {
    best = t;
    part = 'legs';
  }
  _far = best;
  return part;
}

// A grenade on its way for dt seconds: it falls, bounces off what it meets
// and comes to rest.
function fly(n, dt) {
  n.v.y -= THROW.gravity * dt;
  let left = dt;
  for (let k = 0; k < 3 && left > 1e-5; k++) {
    const speed = Math.hypot(n.v.x, n.v.y, n.v.z);
    if (speed < 1e-4) break;
    _d.x = n.v.x / speed;
    _d.y = n.v.y / speed;
    _d.z = n.v.z / speed;
    const want = speed * left;
    const far = rayBoxes(n.p, _d, BOXES, want + 0.06, _n);
    if (far === Infinity) {
      n.p.x += _d.x * want;
      n.p.y += _d.y * want;
      n.p.z += _d.z * want;
      return;
    }
    const go = Math.max(0, far - 0.06);
    n.p.x += _d.x * go;
    n.p.y += _d.y * go;
    n.p.z += _d.z * go;
    left -= go / speed;
    // off the wall: what was going into it comes back, less; the rest rolls on, less
    const into = n.v.x * _n.x + n.v.y * _n.y + n.v.z * _n.z;
    n.v.x = (n.v.x - into * _n.x) * THROW.roll - into * _n.x * THROW.bounce;
    n.v.y = (n.v.y - into * _n.y) * THROW.roll - into * _n.y * THROW.bounce;
    n.v.z = (n.v.z - into * _n.z) * THROW.roll - into * _n.z * THROW.bounce;
    if (_n.y > 0.5 && Math.hypot(n.v.x, n.v.y, n.v.z) < 1.2) {
      n.v.x = n.v.y = n.v.z = 0;
      n.still = true;
      return;
    }
  }
}

