// The bots: everyone in the town who isn't a person.
//
// Each has a name and a knack (how quick, how steady), and they play the
// round as a side:
//
//   Raiders   pick a site between them at the start of a round and go for it
//             by different ways. Whoever has the charge sets it; if they
//             fall, the nearest goes back for it. Once it's set they stand
//             guard over it. If a person on their side is carrying it, they
//             go where that person goes.
//   Wardens   two to each site and one watching the middle. When enough of
//             the other side is seen at one site, or the charge is heard
//             being set, the rest come round. Once it's set the nearest goes
//             to pull it and the others cover.
//
// A bot finds its way on the town's nodes (town.js), cutting the corner
// where it can see the next one. When it can see someone on the other side
// it turns to them, takes a moment to react, and fires in bursts once its
// aim is near enough. Its aim wobbles, and settles the longer it holds it,
// so a good bot hits more often than a poor one but nobody hits every time.
// It hears gunfire, and running feet close by; walk, and it won't hear you.
//
// No three.js in here. A bot reads the match only through what it is handed
// each frame, and answers with what it would do, as a person's keys would
// (see the top of match.js), but saying which way to go in the world:
//   think(match, fighter, dt, frozen) -> { wish: { x, z }, jump, crouch,
//     walk, fire, fired, alt, use, reload, pick, buy }
// It turns the fighter's view itself (yaw, pitch).

import { BOXES, SITES, NODES, siteById, nodeById, nearestNode, route, floorAt, GALLERY, MID_POSTS } from './town.js';
import { MOVE, eyeOf, heightOf, rayBoxes } from './mover.js';
import { shopping } from './arms.js';
import { wrapAngle } from '../core/geom.js';

const LOOK_EVERY = 0.12; // s between looks round for someone to fight
const FOV = Math.cos(1.2); // what's in front: about 70° either side
const NEAR = 4.5; // m: someone this close is noticed whichever way they are
const FAR = 80; // m a bot sees
const EARS = 10; // m a bot hears running feet from
const KEEP = 2.5; // s it remembers where it last saw whoever it was fighting
const ARRIVED = 0.7; // m from a node (in plan) that counts as there
const STUCK = 2.2; // s without getting nearer the next node before thinking again
const ALARM = { reach: 26, lasts: 14, forget: 6 }; // m from a site that counts as at it; s the Wardens stay turned out; s a sighting counts
const SCAN = 0.3; // rad a bot on guard looks to either side
const SET = { after: 0.8, react: 0.55, wobble: 0.65 }; // stood still this long (s) at the post it was given, a bot is set: this much quicker, this much steadier
const RETAKE = { near: 20, gathered: 5, latest: 25 }; // Wardens this far (m) from a set charge meet outside first, and go in once they're all within this (m) of the meeting place, or with this long (s) left on the fuse
const STAGE = { back: 26, go: [14, 26] }; // the Raiders gather this far (m of walking) short of the site, and go in after this long (s)

// What a skill comes to.
export function knack(skill) {
  return {
    react: 0.75 - 0.35 * skill, // s from first seeing someone to firing
    turn: 3.5 + 6 * skill, // rad/s it can turn its aim
    wobble: 0.08 - 0.045 * skill, // rad its aim strays by when it first takes aim
    settle: 0.8 + 1.4 * skill, // 1/s that dies away while it holds aim...
    steady: 0.35, // ...down to this share of it
    head: 0.06 + 0.3 * skill, // chance it goes for the head
    burst: 3 + Math.round(4 * skill), // rounds to a burst
  };
}

const nodeIndex = new Map(NODES.map((n, i) => [n.id, i]));
// Parts of the town, by the names of their nodes (town.js): the two lanes;
// and everything that isn't the east one, or the west one.
const LANES = /^(el-|wl-)/;
const NOT_EAST = /^(mid-|st-|na-|cw|ce|wl-|tun-)/;
const NOT_WEST = /^(mid-|st-|na-|cw|ce|el-|ea-)/;
const centre = (s) => ({ x: (s.zone[0] + s.zone[2]) / 2, z: (s.zone[1] + s.zone[3]) / 2 });
const CENTRES = new Map(SITES.map((s) => [s.id, centre(s)]));
// Where the Wardens meet to take a site back: outside its door from their yard.
const RALLY = { A: { x: 28, z: -34 }, B: { x: -34.5, z: -34 } };
const _e = { x: 0, y: 0, z: 0 };
const _d = { x: 0, y: 0, z: 0 };

export class Bot {
  // rng: () => 0..1, for everything this bot decides by chance
  constructor(skill, rng) {
    this.skill = skill;
    this.k = knack(skill);
    this.rng = rng;
    this.out = { wish: { x: 0, z: 0 }, jump: false, crouch: false, walk: false, fire: false, fired: false, alt: false, use: false, reload: false, pick: null, buy: null };
    this.orders = { n: 0, site: 'A', post: null, late: 0, turnOut: 2, avoid: null };
    this.salt = 0;
    // What a stretch of the way costs this bot: its length, a little more or
    // less by chance (so they don't all go the same way), and a lot more
    // through the part of town its orders keep it out of.
    this.cost = (a, b, d) => d * (1 + (((nodeIndex.get(a) + nodeIndex.get(b)) * 31 + this.salt) % 97) / 194) * (this.orders.avoid && (this.orders.avoid.test(a) || this.orders.avoid.test(b)) ? 3 : 1);
    this._fresh();
  }

  _fresh() {
    this.target = null; // the fighter it's fighting
    this.seen = 0; // s since it started seeing them
    this.lastSeen = null; // { x, y, z, t }
    this.noise = null; // { x, z, t }: something heard
    this.lookIn = 0;
    this.off = { yaw: 0, pitch: 0, in: 0 }; // the wobble in its aim
    this.err = 1;
    this.aimHead = false;
    this.burst = 0;
    this.restIn = 0;
    this.tapIn = 0;
    this.strafe = 0;
    this.strafeIn = 0;
    this.path = null;
    this.destKey = '';
    this.best = Infinity;
    this.since = 0;
    this.orderIn = 0;
    this.order = null;
    this.shopIn = 0.4 + this.rng() * 2;
    this.shopped = false;
    this.cart = [];
    this.quiet = 0; // s since it last had someone to fight
    this.still = 0; // s it has been standing still
    this.set = false; // set: stood still a moment at the post it was given, so quicker and steadier
    this.wasSet = false; // ...and whether it was when it saw whoever it's fighting
    this.stage = null; // where a Raider waits for the others, on its way in
    this.retaking = false; // a Warden coming to a site that's been taken: 'rally', then 'in'
    this.clock = 0;
  }

  // What this bot is to do this round: see brief(), below.
  brief(orders) {
    this._fresh();
    this.orders = orders;
    this.salt = Math.floor(this.rng() * 1000);
  }

  // Shot at: turn to whoever it was, and be quicker about it.
  hurt(by) {
    if (!this.target) this.noise = { x: by.body.pos.x, z: by.body.pos.z, t: this.clock };
  }

  // Something loud, over there.
  heard(x, z, t) {
    if (!this.target) this.noise = { x, z, t };
  }

  think(m, f, dt, frozen) {
    const o = this.out;
    o.wish.x = o.wish.z = 0;
    o.jump = o.crouch = o.walk = o.fire = o.fired = o.alt = o.use = o.reload = false;
    o.pick = o.buy = null;
    this.clock = m.time;
    const side = m.sideOf(f);
    const p = f.body.pos;
    // shopping, at home, a thing a frame
    if (m.rounds.buying && !this.shopped && (this.shopIn -= dt) <= 0) {
      this.shopped = true;
      this.cart = shopping(f.kit, f.cash, side, this.skill);
    }
    if (this.cart.length) o.buy = this.cart.shift();
    if (frozen) return o;
    if (f.blind > 0.5) {
      // can't see a thing: back off, and don't fire
      this.target = null;
      o.wish.x = Math.sin(f.yaw) * 0.5;
      o.wish.z = Math.cos(f.yaw) * 0.5;
      return o;
    }
    // ── Who to fight ──
    if ((this.lookIn -= dt) <= 0) {
      this.lookIn = LOOK_EVERY * (0.8 + 0.4 * this.rng());
      this._lookRound(m, f, side);
    }
    if (this.target && !this.target.alive) {
      this.target = null;
      this.lastSeen = null;
    }
    const t = this.target;
    this.quiet = t ? 0 : this.quiet + dt;
    this.still = Math.hypot(f.body.vel.x, f.body.vel.z) < 0.6 ? this.still + dt : 0;
    if (side === 'defend' && this.noise && m.time - this.noise.t < 0.3 && m.intel) {
      for (const s of SITES) if (Math.hypot(this.noise.x - CENTRES.get(s.id).x, this.noise.z - CENTRES.get(s.id).z) < ALARM.reach) raise(m, s.id);
    }
    // ── What to be doing ──
    if ((this.orderIn -= dt) <= 0 || !this.order) {
      this.orderIn = 0.35 + this.rng() * 0.2;
      this.order = this._orders(m, f, side);
    }
    const ord = this.order;
    const gun = m.gunOf(f);
    const dest = ord.dest;
    const there = Math.hypot(dest.x - p.x, dest.z - p.z);
    // the charge comes first when there's no time for anything else
    const mustAct = ord.act === 'plant' ? m.rounds.left < 14 : ord.act === 'defuse' ? m.rounds.left < (f.kit.kit ? 5 : 10) + 4 : false;
    const far = t ? Math.hypot(t.body.pos.x - p.x, t.body.pos.z - p.z) : 0;
    // set: stood a moment at the post it was given
    this.set = this.still > SET.after && ord.dest === this.orders.post;
    // someone too far off to be worth a shot is watched, not fought
    if (t && far <= (gun ? gun.far : 0) && !(mustAct && there < 1.5)) {
      // ── A fight ──
      this.seen += dt;
      const tp = t.body.pos;
      this._aim(f, tp.x, this.aimHead ? tp.y + heightOf(t.body) - 0.15 : tp.y + heightOf(t.body) * 0.62, tp.z, dt, true);
      this._fire(f, gun, far, o, dt);
      // sidestep between bursts, at a walk so the shots still go where they're aimed
      if ((this.strafeIn -= dt) <= 0) {
        this.strafeIn = 0.4 + this.rng() * 0.7;
        this.strafe = this.rng() < 0.25 ? 0 : this.rng() < 0.5 ? -1 : 1;
      }
      const back = ord.hold && there > 2.5; // not too far from the post
      if (back) this._go(f, dest, dt, o);
      else if (this.strafe) {
        const sx = Math.cos(f.yaw) * this.strafe;
        const sz = -Math.sin(f.yaw) * this.strafe;
        if (clearAhead(p, sx, sz, 1.2)) {
          o.wish.x = sx;
          o.wish.z = sz;
        }
      }
      // (at a walk, unless there's a long way still to go and they're far off)
      o.walk = !(back && there > 8 && far > 18);
      o.crouch = far > 14 && this.skill > 0.5 && o.fire && !back;
    } else {
      // ── Getting on with it ──
      if (gun && gun.zoom && f.sighted && this.quiet > 1.5) o.alt = true;
      if (gun && gun.slot === 'knife') o.pick = f.kit.main ? 'main' : 'side';
      else if (gun && gun.slot === 'side' && f.kit.main && f.ammo[f.kit.main].mag > 0 && this.quiet > 1) o.pick = 'main';
      const a = gun && f.ammo[gun.id];
      if (a && a.spare > 0 && (a.mag === 0 || (this.quiet > 1.6 && a.mag < gun.mag * 0.45))) o.reload = true;
      const late = side === 'attack' && m.rounds.phase === 'live' && m.rounds.time < this.orders.late;
      const at = late || this._go(f, dest, dt, o);
      // set the charge, unless there's someone to deal with first and time to
      if (at && ord.act === 'plant' && f.charge && !(t && !mustAct)) {
        if (f.held !== 'charge') o.pick = 'charge';
        else o.fire = true;
        o.crouch = true;
      } else if (f.held === 'charge') o.pick = f.kit.main ? 'main' : 'side';
      else if (ord.act === 'defuse' && there < 1.3) {
        o.use = true;
        o.crouch = true;
        o.wish.x = o.wish.z = 0;
      }
      // where to look: where they were, what was heard, what the post watches, or the way it's going
      const seen = this.lastSeen;
      const noise = this.noise;
      if (t) this._aim(f, t.body.pos.x, t.body.pos.y + heightOf(t.body) * 0.62, t.body.pos.z, dt, false);
      else if (seen && m.time - seen.t < KEEP) this._aim(f, seen.x, seen.y, seen.z, dt, false);
      else if (noise && m.time - noise.t < 2.2) this._aim(f, noise.x, p.y + 1.3, noise.z, dt, false);
      else if (at && ord.look) {
        const base = Math.atan2(-(ord.look.x - p.x), -(ord.look.z - p.z));
        f.yaw = turnTo(f.yaw, base + Math.sin(m.time * 0.7 + this.salt) * SCAN, this.k.turn * 0.4 * dt);
        f.pitch = turnTo(f.pitch, 0, dt * 2);
      } else {
        const w = o.wish;
        if (Math.hypot(w.x, w.z) > 0.1) f.yaw = turnTo(f.yaw, Math.atan2(-w.x, -w.z), this.k.turn * 0.7 * dt);
        f.pitch = turnTo(f.pitch, 0, dt * 2);
      }
    }
    // not on top of each other
    for (const g of m.fighters) {
      if (g === f || !g.alive || g.team !== f.team) continue;
      const dx = p.x - g.body.pos.x;
      const dz = p.z - g.body.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.95 || d < 1e-3) continue;
      o.wish.x += (dx / d) * (0.95 - d) * 2;
      o.wish.z += (dz / d) * (0.95 - d) * 2;
    }
    return o;
  }

  // The nearest of the other side it can see, keeping to the one it has
  // while it can; and what it hears.
  _lookRound(m, f, side) {
    let best = null;
    let bestD = Infinity;
    const p = f.body.pos;
    for (const g of m.fighters) {
      if (g.team === f.team || !g.alive) continue;
      const d = sees(m, f, g);
      if (d === null) {
        // running feet, close by
        const q = g.body.pos;
        const dq = Math.hypot(q.x - p.x, q.z - p.z);
        if (dq < EARS && !g.walking && g.body.crouch < 0.5 && Math.hypot(g.body.vel.x, g.body.vel.z) > 2.6) this.heard(q.x, q.z, m.time);
        continue;
      }
      if (m.intel) note(m, side, g);
      const score = g === this.target ? d * 0.6 : d;
      if (score < bestD) {
        bestD = score;
        best = g;
      }
    }
    if (best && best !== this.target) {
      // quicker onto someone it was expecting
      const ready = this.noise && m.time - this.noise.t < 2.5;
      this.seen = ready ? this.k.react * 0.5 : 0;
      this.wasSet = this.set;
      // (the Raiders waiting to go in go now, if it's one of them who was seen)
      if (side === 'attack' && m.intel && this.order && this.order.staged) m.intel.attack.going = true;
      this.aimHead = this.rng() < this.k.head;
      this.off.in = 0;
      this.burst = 0;
      this.restIn = 0;
    }
    this.target = best;
    if (best) this.lastSeen = { x: best.body.pos.x, y: best.body.pos.y + heightOf(best.body) * 0.62, z: best.body.pos.z, t: m.time };
  }

  // Turn the view towards a point: with the wobble of taking aim, if it is.
  _aim(f, x, y, z, dt, fighting) {
    const p = f.body.pos;
    const dx = x - p.x;
    const dy = y - (p.y + eyeOf(f.body));
    const dz = z - p.z;
    let wantYaw = Math.atan2(-dx, -dz);
    let wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
    if (fighting) {
      if ((this.off.in -= dt) <= 0) {
        this.off.in = 0.35 + this.rng() * 0.45;
        const a = this.rng() * Math.PI * 2;
        const r = this.k.wobble * (this.set ? SET.wobble : 1) * (this.k.steady + (1 - this.k.steady) * Math.exp(-this.seen * this.k.settle)) * (0.3 + 0.7 * this.rng());
        this.off.yaw = Math.cos(a) * r;
        this.off.pitch = Math.sin(a) * r * 0.6;
      }
      wantYaw += this.off.yaw;
      wantPitch += this.off.pitch;
    }
    const most = this.k.turn * (fighting ? 1 : 0.6) * dt;
    f.yaw = turnTo(f.yaw, wantYaw, most);
    f.pitch = turnTo(f.pitch, wantPitch, most);
    this.err = Math.hypot(wrapAngle(f.yaw - wantYaw), f.pitch - wantPitch);
  }

  // Pull the trigger, if it's time to: after its moment to react, with its
  // aim near enough, a burst and then a breath.
  _fire(f, gun, far, o, dt) {
    if (!gun || gun.slot === 'knife') {
      o.pick = f.kit.main ? 'main' : 'side';
      return;
    }
    const a = f.ammo[gun.id];
    if (a.mag === 0) {
      const side = f.kit.side && f.ammo[f.kit.side];
      if (gun.slot === 'main' && far < 10 && side && side.mag > 0) o.pick = 'side';
      else o.reload = true;
      return;
    }
    if (this.seen < this.k.react * (this.wasSet ? SET.react : 1) || f.draw > 0 || f.reloading > 0) return;
    if (gun.zoom && !f.sighted && far > 9) {
      o.alt = true;
      return;
    }
    if (this.err > 0.02 + 0.45 / Math.max(far, 3)) return;
    if (gun.auto) {
      if ((this.restIn -= dt) > 0) return;
      if (this.burst <= 0) this.burst = (this.k.burst + this.rng() * 2) * gun.every;
      o.fire = true;
      if ((this.burst -= dt) <= 0) this.restIn = far < 8 ? 0.05 : 0.22 + this.rng() * 0.3;
    } else if ((this.tapIn -= dt) <= 0) {
      o.fired = true;
      this.tapIn = Math.max(gun.every * 1.1, 0.16 + (1 - this.skill) * 0.25) * (0.8 + 0.5 * this.rng());
    }
  }

  // What to be doing just now: { dest, look?, act?, hold? }.
  _orders(m, f, side) {
    const c = m.charge;
    const I = m.intel;
    const mine = this.orders;
    if (side === 'attack') {
      if (c.state === 'planted') {
        const s = siteById.get(c.site);
        const post = s.posts[mine.n % s.posts.length];
        return { dest: post, look: post.look, hold: true };
      }
      if (c.state === 'dropped' && nearestBot(m, 'attack', c) === f) return { dest: c };
      // a person carrying it leads: the site they're making for is the site
      const lead = c.state === 'carried' ? m.fighters[c.by] : null;
      if (lead && lead.owner && lead.alive) {
        for (const s of SITES) {
          const at = CENTRES.get(s.id);
          if (Math.hypot(lead.body.pos.x - at.x, lead.body.pos.z - at.z) < 30) I.attack.site = s.id;
        }
      }
      const s = siteById.get(I.attack.site);
      const post = s.posts[mine.n % s.posts.length];
      const dest = f.charge ? s.spots[mine.n % s.spots.length] : post;
      // gather short of the site, and go in together: when the time comes,
      // when someone has been seen, or when a person leading them is nearly there
      if (lead && lead.owner && Math.hypot(lead.body.pos.x - CENTRES.get(s.id).x, lead.body.pos.z - CENTRES.get(s.id).z) < 30) I.attack.going = true;
      if (!I.attack.going && m.rounds.phase === 'live' && m.rounds.time < I.attack.go && m.rounds.left > 45) {
        if (this.stage === null) this.stage = stageFor(f.body.pos, dest, this.cost) || false;
        if (this.stage) return { dest: this.stage, look: this.stage.look, hold: true, staged: true };
      }
      if (f.charge) return { dest, act: 'plant' };
      return { dest: post, look: post.look, hold: true };
    }
    if (c.state === 'planted') {
      const s = siteById.get(c.site);
      // whoever's nearest pulls it, unless a person is at it already
      const person = m.fighters.some((g) => g.owner && g.defusing > 0);
      // those who have to come from somewhere else meet outside first, and
      // go in together, while there's time to
      const p = f.body.pos;
      const rally = RALLY[s.id];
      const away = Math.hypot(p.x - c.x, p.z - c.z) > RETAKE.near;
      if (this.retaking === false && away) this.retaking = 'rally';
      if (this.retaking === 'rally') {
        const others = m.fighters.filter((g) => g !== f && g.alive && g.bot && g.bot.retaking === 'rally' && m.sideOf(g) === 'defend');
        const here = (g) => Math.hypot(g.body.pos.x - rally.x, g.body.pos.z - rally.z) < RETAKE.gathered;
        if (m.rounds.left < RETAKE.latest || (here(f) && others.every(here))) {
          this.retaking = 'in';
          for (const g of others) if (here(g)) g.bot.retaking = 'in';
        } else return { dest: rally, look: { x: c.x, z: c.z }, hold: true };
      }
      if (!person && nearestBot(m, 'defend', c) === f) return { dest: c, act: 'defuse' };
      const post = s.posts[(mine.n + 1) % s.posts.length];
      return { dest: post, look: { x: c.x, z: c.z }, hold: true };
    }
    // the charge heard being set is as good as seen
    const setting = m.fighters.find((g) => g.planting > 0);
    if (setting && I) raise(m, siteNear(setting.body.pos));
    const alarm = I && I.defend.alarm && m.time - I.defend.at < ALARM.lasts ? I.defend.alarm : null;
    let post = mine.post;
    if (alarm && post.site !== alarm && m.time - I.defend.at > mine.turnOut) {
      const s = siteById.get(alarm);
      post = s.posts[(mine.n + 2) % s.posts.length];
    }
    return { dest: post, look: post.look, hold: true };
  }

  // Walk towards dest along the nodes. -> whether it's there.
  _go(f, dest, dt, o) {
    const p = f.body.pos;
    const key = `${Math.round(dest.x * 2)}:${Math.round(dest.z * 2)}`;
    if (key !== this.destKey || !this.path) {
      this.destKey = key;
      this.path = wayTo(p, dest, this.cost);
      this.best = Infinity;
      this.since = 0;
    }
    let w = this.path[0] || dest;
    let d = Math.hypot(w.x - p.x, w.z - p.z);
    while (this.path.length && d < ARRIVED) {
      this.path.shift();
      w = this.path[0] || dest;
      d = Math.hypot(w.x - p.x, w.z - p.z);
      this.best = Infinity;
      this.since = 0;
    }
    if (!this.path.length && d < 0.45) return true;
    // not getting any nearer: hop (it may be a ledge), then think again
    if (d < this.best - 0.05) {
      this.best = d;
      this.since = 0;
    } else {
      this.since += dt;
      if (this.since > 0.8 && this.since < 0.95) o.jump = true;
      if (this.since > STUCK) {
        this.path = null;
        return false;
      }
    }
    const k = !this.path.length && d < 1.2 ? Math.max(0.3, d / 1.2) : 1;
    o.wish.x = ((w.x - p.x) / Math.max(d, 1e-3)) * k;
    o.wish.z = ((w.z - p.z) / Math.max(d, 1e-3)) * k;
    return false;
  }
}

// ── What a team knows between them ──────────────────────────────────────────

// The start of a round (or a bot coming back mid-round, `only`): the Raiders
// choose a site; the Wardens are given their posts.
export function brief(m, only = null) {
  if (!only || !m.intel) {
    const site = m.rng() < 0.5 ? 'A' : 'B';
    m.intel = { attack: { site, go: STAGE.go[0] + m.rng() * (STAGE.go[1] - STAGE.go[0]), going: false }, defend: { alarm: null, at: -Infinity, seen: new Map() } };
  }
  const posts = { attack: 0, defend: 0 };
  // two to a site and one in the middle, a different pair each round
  const turn = Math.floor(m.rng() * 5);
  for (const f of m.fighters) {
    const side = m.sideOf(f);
    const n = posts[side]++;
    if (!f.bot || (only && !only.includes(f))) continue;
    // (turnOut: how long after the alarm a Warden leaves its own post for
    // the other site: the one in the middle at once, one at each site last)
    const orders = { n, site: m.intel.attack.site, post: null, late: m.rng() * 2.5, turnOut: 2.5 + m.rng() * 2.5, avoid: null };
    if (side === 'attack') {
      // three or four up the lane on the site's own side, the rest through the middle
      const k = (n + turn) % 5;
      const middle = k === 3 || (k === 4 && m.rng() < 0.5);
      orders.avoid = middle ? LANES : orders.site === 'A' ? NOT_EAST : NOT_WEST;
    }
    if (side === 'defend') {
      const k = (n + turn) % 5;
      if (k === 4) {
        orders.post = { ...MID_POSTS[Math.floor(m.rng() * MID_POSTS.length)], site: 'mid' };
        orders.turnOut = 0.5 + m.rng();
      } else {
        const s = SITES[k % 2];
        orders.post = { ...s.posts[(k >> 1) + (turn % 2)], site: s.id };
        if (k < 2) orders.turnOut = 6 + m.rng() * 3;
      }
    }
    f.bot.brief(orders);
  }
}

// A Warden has seen a Raider at a site: the others are called round.
function note(m, side, g) {
  if (side !== 'defend') return;
  const I = m.intel.defend;
  const p = g.body.pos;
  I.seen.set(g.id, { x: p.x, z: p.z, t: m.time });
  for (const s of SITES) {
    const at = CENTRES.get(s.id);
    let n = 0;
    for (const v of I.seen.values()) if (m.time - v.t < ALARM.forget && Math.hypot(v.x - at.x, v.z - at.z) < ALARM.reach) n++;
    if (n >= 1) raise(m, s.id);
  }
}

function raise(m, site) {
  if (!site) return;
  const I = m.intel.defend;
  if (I.alarm === site && m.time - I.at < ALARM.lasts) return;
  I.alarm = site;
  I.at = m.time;
}

function siteNear(p) {
  let best = null;
  let bestD = Infinity;
  for (const s of SITES) {
    const at = CENTRES.get(s.id);
    const d = Math.hypot(p.x - at.x, p.z - at.z);
    if (d < bestD) {
      bestD = d;
      best = s.id;
    }
  }
  return best;
}

// The bot of a side that's standing nearest a point, or null.
function nearestBot(m, side, at) {
  let best = null;
  let bestD = Infinity;
  for (const g of m.fighters) {
    if (!g.bot || !g.alive || m.sideOf(g) !== side) continue;
    const d = Math.hypot(g.body.pos.x - at.x, g.body.pos.z - at.z);
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  return best;
}

// ── Seeing ──────────────────────────────────────────────────────────────────

// Can fighter f see fighter g? -> how far, or null. In front of it (or right
// beside it), nothing solid between its eye and their chest or their head,
// and no smoke.
export function sees(m, f, g) {
  const p = f.body.pos;
  const q = g.body.pos;
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  const flat = Math.hypot(dx, dz);
  if (flat > FAR) return null;
  if (flat > NEAR && (-Math.sin(f.yaw) * dx - Math.cos(f.yaw) * dz) / flat < FOV) return null;
  _e.x = p.x;
  _e.y = p.y + eyeOf(f.body);
  _e.z = p.z;
  const tall = heightOf(g.body);
  for (const up of [tall * 0.62, tall - 0.12]) {
    const dy = q.y + up - _e.y;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-3) return 0;
    _d.x = dx / d;
    _d.y = dy / d;
    _d.z = dz / d;
    if (rayBoxes(_e, _d, BOXES, d) !== Infinity) continue;
    if (m.smokes.some((s) => throughSmoke(_e, _d, d, s))) continue;
    return d;
  }
  return null;
}

// Does the ray o + d·t, t < far, pass through a smoke cloud?
function throughSmoke(o, d, far, s) {
  const t = Math.max(0, Math.min(far, (s.x - o.x) * d.x + (s.y - o.y) * d.y + (s.z - o.z) * d.z));
  return Math.hypot(o.x + d.x * t - s.x, o.y + d.y * t - s.y, o.z + d.z * t - s.z) < s.r * 0.9;
}

// ── Finding the way ─────────────────────────────────────────────────────────

// Can a body walk straight from a (with its feet at a.y) to b? Nothing in
// the way at the knee or the head, a body's width either side, and b on the
// same floor.
export function clearWalk(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) return true;
  const by = b.y ?? floorAt(b.x, b.z, a.y + MOVE.step + 0.1);
  if (Math.abs(by - a.y) > MOVE.step + 0.05) return false;
  _d.x = dx / d;
  _d.y = 0;
  _d.z = dz / d;
  const sx = -_d.z * (MOVE.half + 0.05);
  const sz = _d.x * (MOVE.half + 0.05);
  for (const [k, up] of [[0, 0.62], [1, 0.62], [-1, 0.62], [0, 1.6]]) {
    _e.x = a.x + sx * k;
    _e.y = a.y + up;
    _e.z = a.z + sz * k;
    if (rayBoxes(_e, _d, BOXES, d) !== Infinity) return false;
  }
  return true;
}

// Is there room to step `far` m along (dx, dz) from p?
function clearAhead(p, dx, dz, far) {
  return clearWalk(p, { x: p.x + dx * far, z: p.z + dz * far, y: p.y });
}

// The way from p to dest, as points to walk to in turn (dest itself not
// among them): along the nodes, but not back to one that's behind when the
// one after is in plain reach, nor on to the last when dest already is.
export function wayTo(p, dest, cost = null) {
  const from = nearestNode(p.x, p.z, p.y);
  const destY = dest.y ?? floorAt(dest.x, dest.z, GALLERY + 0.1);
  const to = nearestNode(dest.x, dest.z, destY);
  if (!from || !to) return [];
  const ids = route(from.id, to.id, cost) || [];
  const nodes = [from, ...ids.map((id) => nodeById.get(id))];
  const end = { x: dest.x, z: dest.z, y: destY };
  while (nodes.length > 1 && clearWalk(p, nodes[1])) nodes.shift();
  if (nodes.length === 1 && clearWalk(p, end)) nodes.shift();
  while (nodes.length > 1 && clearWalk(nodes[nodes.length - 2], end)) nodes.pop();
  return nodes.map((n) => ({ x: n.x, z: n.z }));
}

// Where a Raider on its way from p to dest waits for the others: the point
// on its way that's STAGE.back m of walking short of dest, looking on along
// it. -> { x, z, look }, or null if it's nearer than that already.
export function stageFor(p, dest, cost = null) {
  const way = [...wayTo(p, dest, cost), dest];
  let left = 0;
  for (let i = way.length - 1; i > 0; i--) {
    left += Math.hypot(way[i].x - way[i - 1].x, way[i].z - way[i - 1].z);
    if (left >= STAGE.back) return { x: way[i - 1].x, z: way[i - 1].z, look: { x: way[i].x, z: way[i].z } };
  }
  return null;
}

// Turn angle a towards b by at most `most` radians.
function turnTo(a, b, most) {
  const d = wrapAngle(b - a);
  return a + Math.max(-most, Math.min(most, d));
}
