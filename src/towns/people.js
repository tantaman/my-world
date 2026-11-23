// The people of a town. Some towns have them and some don't (towns.js says
// how many live where); in those that do, they stroll from one door to the
// next, stop and stand about, turn to look at you, and when you come up to
// one, wave and say something. After dark most go indoors. The figures in a
// dark town are something else: they stand where they are and watch you, and
// they only ever move while you're not looking.
//
// Like the animals, they're nobody's to keep: nothing about them is saved or
// shared. What each looks like is grown from the town's seed, so everyone
// meets the same people there; where they wander is their own business.
//
// What a person is made of, and how one walks and waves, is people/body.js.
//
//   new Townsfolk(town, { scene, ground })
//   .update(dt, { player, night, hours, inView })
//   .dispose()
//
// Emits:
//   'hello'   ({ x, y, z, line, voice })  someone has something to say to you
//   'vanish'  ({ x, z })                  a watcher was there a moment ago

import { Body, lookOf, OUTFITS } from '../people/body.js';
import { mulberry32 } from '../noise.js';
import { wrapAngle } from '../core/geom.js';
import { Emitter } from '../core/events.js';
import { toWorld, toLocal } from '../world/frame.js';
import { FRONT_STEP, OPEN } from './towns.js';

const WALK = [1.1, 1.45]; // m/s, slowest and quickest stroll
const LANE = 1.6; // m either side of the middle of the street where people walk
const IDLE = [5, 18]; // s someone stands about before going somewhere else
const NOTICE = 9; // m: closer than this, people turn to look at you
const GREET = 3.6; // m: ...and closer than this, wave and say something
const AGAIN = 50; // s before the same person greets you again
const CHATTER = 7; // s at least between one greeting and the next, from anyone
const WAIT = 1.4; // m: someone walking stops if you're this close in front
const INDOORS = 0.55; // how dark (SKY.uNight) before most go in
const OUT_AGAIN = 0.4; // ...and how light before they come out again
const WATCH = { near: 6.5, step: 1.6, every: [3.5, 7], back: [14, 35] }; // a watcher: how close it comes, how far each move, how often, how long gone

const _l = { x: 0, z: 0 };
const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];
const lerp = (a, b, t) => a + (b - a) * t;

// ── A town's people ──────────────────────────────────────────────────────────
// Where they go: the front of each building, out in the street, and the
// middle of the green or the gate of the graveyard. A person walks from one to
// another out along their side of the street, down it, and in again.
export function spotsOf(town) {
  const out = [];
  for (const lot of town.lots) {
    if (lot.ruin) continue;
    const p = toWorld(lot, (lot.u * 7) % 1.4 - 0.7, lot.d / 2 + FRONT_STEP);
    out.push({ x: p.x, z: p.z, yaw: lot.yaw + Math.PI, lot, open: !!OPEN[lot.type] });
  }
  return out;
}

export class Townsfolk extends Emitter {
  constructor(town, { scene, ground }) {
    super();
    this.town = town;
    this.scene = scene;
    this.ground = ground;
    this.spots = spotsOf(town);
    this.style = town.style;
    this.watchers = town.style === 'creepy';
    this.people = [];
    const rnd = mulberry32(town.seed ^ 0x5eed);
    const O = OUTFITS[town.style];
    this.lines = O.lines;
    for (let i = 0; i < town.people && this.spots.length; i++) {
      const look = lookOf(town.style, rnd);
      const body = new Body(look, Math.floor(rnd() * 1e9));
      const home = this.spots[Math.floor(rnd() * this.spots.length)];
      const p = {
        body,
        home,
        x: home.x + (rnd() - 0.5) * 2,
        z: home.z + (rnd() - 0.5) * 2,
        yaw: home.yaw + (rnd() - 0.5),
        speed: 0,
        pace: lerp(WALK[0], WALK[1], rnd()) * (look.child ? 1.15 : 1),
        path: [],
        idle: rnd() * IDLE[1],
        greeted: -AGAIN,
        indoors: false,
        owl: town.style === 'western' && i < 2, // stays out after dark
        voice: look.her || look.child ? 1.35 + rnd() * 0.3 : 0.85 + rnd() * 0.25,
        gone: 0, // a watcher, gone from where it was: s until it's back
        moveIn: 0,
      };
      body.mesh.position.set(p.x, ground(p.x, p.z), p.z);
      body.mesh.rotation.y = p.yaw;
      scene.add(body.mesh);
      this.people.push(p);
    }
    this.clock = 0;
    this.said = -CHATTER; // when anyone last said hello
  }

  // ctx: { player: { x, z }, night: 0..1, hours, inView(x, y, z, r) }
  update(dt, ctx) {
    this.clock += dt;
    for (const p of this.people) {
      if (this.watchers) this._watch(p, dt, ctx);
      else this._live(p, dt, ctx);
      const m = p.body.mesh;
      m.visible = !p.indoors && p.gone <= 0;
      if (!m.visible) continue;
      m.position.set(p.x, this.ground(p.x, p.z), p.z);
      m.rotation.y = p.yaw;
      const toYou = Math.atan2(ctx.player.x - p.x, ctx.player.z - p.z);
      const d = Math.hypot(ctx.player.x - p.x, ctx.player.z - p.z);
      p.body.pose(dt, p.speed, d < NOTICE ? wrapAngle(toYou - p.yaw) : null);
    }
  }

  // Someone who lives here: stands about, walks somewhere, goes in at night.
  _live(p, dt, ctx) {
    const { player, night } = ctx;
    const d = Math.hypot(player.x - p.x, player.z - p.z);
    const toYou = Math.atan2(player.x - p.x, player.z - p.z);
    // after dark, home and indoors; out again in the morning
    if (!p.owl) {
      if (night > INDOORS && !p.indoors && !p.path.length && !p.goingHome) this._goTo(p, p.home, true);
      if (night < OUT_AGAIN && p.indoors) {
        p.indoors = false;
        p.goingHome = false;
        p.idle = 2 + Math.random() * 10;
      }
    }
    if (p.indoors) return;
    if (p.path.length) {
      // walking: stop for you if you're in the way
      const w = p.path[0];
      const ahead = Math.abs(wrapAngle(toYou - p.yaw)) < 0.7;
      const blocked = d < WAIT && ahead;
      const dx = w.x - p.x;
      const dz = w.z - p.z;
      const left = Math.hypot(dx, dz);
      const want = blocked ? 0 : p.pace;
      p.speed += (want - p.speed) * Math.min(1, dt * 4);
      if (left < 0.25) {
        p.path.shift();
        if (!p.path.length) {
          p.speed = 0;
          p.idle = lerp(IDLE[0], IDLE[1], Math.random());
          if (p.goingHome) p.indoors = true;
        }
      } else {
        const yaw = Math.atan2(dx, dz);
        p.yaw += wrapAngle(yaw - p.yaw) * Math.min(1, dt * 5);
        const step = Math.min(left, p.speed * dt);
        p.x += Math.sin(p.yaw) * step;
        p.z += Math.cos(p.yaw) * step;
      }
    } else {
      p.speed = 0;
      // standing about: face whoever comes up to talk
      if (d < NOTICE * 0.6) p.yaw += wrapAngle(toYou - p.yaw) * Math.min(1, dt * 2);
      p.idle -= dt;
      if (p.idle <= 0 && d > GREET) {
        const near = this.spots.filter((s) => Math.hypot(s.x - p.x, s.z - p.z) < 60);
        const list = near.length > 1 ? near : this.spots;
        this._goTo(p, list[Math.floor(Math.random() * list.length)]);
      }
    }
    // saying hello
    if (d < GREET && this.clock - p.greeted > AGAIN && this.clock - this.said > CHATTER && this.lines) {
      p.greeted = this.said = this.clock;
      p.body.waving = 1.8;
      this.emit('hello', { x: p.x, y: this.ground(p.x, p.z) + 1.6 * p.body.look.height, z: p.z, line: this._line(ctx.hours), voice: p.voice });
    }
  }

  // A watcher: never seen to move. While you're looking it stands and turns
  // its head to you; while you aren't, it comes a little closer, and close
  // up it isn't there at all, until it is again somewhere else.
  _watch(p, dt, ctx) {
    const { player, inView } = ctx;
    const seen = (x, z) => inView(x, this.ground(x, z) + 1, z, 1.2);
    if (p.gone > 0) {
      p.gone -= dt;
      if (p.gone <= 0) {
        // back, somewhere you aren't looking
        const free = this.spots.filter((s) => !seen(s.x, s.z) && Math.hypot(s.x - player.x, s.z - player.z) > 14);
        if (!free.length) p.gone = 3;
        else {
          const s = free[Math.floor(Math.random() * free.length)];
          p.x = s.x;
          p.z = s.z;
        }
      }
      return;
    }
    const d = Math.hypot(player.x - p.x, player.z - p.z);
    const toYou = Math.atan2(player.x - p.x, player.z - p.z);
    p.speed = 0;
    if (seen(p.x, p.z)) return;
    if (d < WATCH.near - 0.5) {
      p.gone = lerp(WATCH.back[0], WATCH.back[1], Math.random());
      this.emit('vanish', { x: p.x, z: p.z });
      return;
    }
    p.moveIn -= dt;
    if (p.moveIn <= 0 && d < 45) {
      p.moveIn = lerp(WATCH.every[0], WATCH.every[1], Math.random());
      const step = Math.min(WATCH.step, d - WATCH.near);
      const nx = p.x + Math.sin(toYou) * step;
      const nz = p.z + Math.cos(toYou) * step;
      // only along open ground: the street, or where it already stood
      toLocal(this.town, nx, nz, _l);
      if (Math.abs(_l.z) <= this.town.half + 3 && Math.abs(_l.x) < this.town.len / 2 + 6 && !seen(nx, nz)) {
        p.x = nx;
        p.z = nz;
      }
      p.yaw = toYou;
    }
    return;
  }

  // Walk to a spot: out to this side of the street, along, and in.
  _goTo(p, s, home = false) {
    const t = this.town;
    const a = toLocal(t, p.x, p.z, {});
    const b = toLocal(t, s.x, s.z, {});
    const lane = (b.z < 0 ? -1 : 1) * LANE;
    const w = (u, v) => toWorld(t, u, v, {});
    p.path = [w(a.x, lane), w(b.x, lane), { x: s.x, z: s.z }];
    p.goingHome = home;
  }

  _line(hours) {
    const L = this.lines;
    const when = hours < 5 || hours > 21.5 ? 'night' : hours < 11 ? 'morning' : hours < 18 ? 'day' : 'evening';
    return pick(L[when], Math.random).replace('{town}', this.town.name);
  }

  dispose() {
    for (const p of this.people) {
      this.scene.remove(p.body.mesh);
      p.body.dispose();
    }
    this.people.length = 0;
  }
}

