// How a mammal behaves. One brain for all of them, steered by each species'
// temperament in species.js, with a few specialities: squirrels bolt for a
// trunk and spiral up it, chipmunks dive under the nearest rock or log, bears
// stand up for a better look, wolves travel in single file and howl after
// dark, foxes listen for mice and pounce, and the cats sit and watch you.
//
// The brain decides where it wants to go and how fast, and what pose to hold
// (head down grazing, on alert, sitting up...). Quad (quadruped.js) turns
// that into a walk, a trot or a gallop.

import { Quad } from './quadruped.js';
import { disposeAnimal } from './rig.js';
import { clamp, lerp } from '../noise.js';

const rand = (a, b) => a + Math.random() * (b - a);
const range = (r) => rand(r[0], r[1]);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const FRIGHT = new Set(['flee', 'leave', 'toTree', 'climb', 'toCover', 'hide', 'stand', 'watch', 'freeze']);
const MOVES = new Set(['wander', 'travel', 'follow', 'prowl', 'sniff']);

function pickWeighted(w) {
  let total = 0;
  for (const k in w) total += w[k];
  let r = Math.random() * total;
  for (const k in w) {
    r -= w[k];
    if (r <= 0) return k;
  }
  return Object.keys(w)[0];
}

export class Beast {
  constructor(sp, x, z, yaw, group, index, env) {
    this.sp = sp;
    this.kind = sp.kind;
    this.group = group;
    const m = sp.member(index, group.size, Math.random, env);
    const built = sp.model.build((Math.random() * 1e9) | 0, m.variant || {});
    this.mesh = built.mesh;
    this.mesh.rotation.order = 'YXZ';
    this.scale = m.scale ?? 1;
    this.mesh.scale.setScalar(this.scale);
    this.quad = new Quad(this.mesh, built.sk, built.dims);
    this.label = m.label;
    this.height = built.dims.shoulderH * this.scale;
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.wantYaw = yaw;
    this.speed = 0;
    this.wantSpeed = 0;
    this.turnRate = 0;
    this.radius = sp.radius * this.scale;
    this.state = 'idle';
    this.t = 0;
    this.dur = 1;
    this.life = sp.cat === 'small' ? rand(40, 120) : rand(100, 260);
    this.leaving = false;
    this.done = false;
    this.target = null;
    this.pose = { graze: 0, alert: 0, rear: 0, crouch: 0, tailUp: 0, air: 0, lookPitch: 0, lift: 0 };
    this.lookAt = null;
    this.glance = 0;
    this.nextGlance = rand(1, 4);
    this.vigil = rand(3, 8);
    this.zig = 0;
    this.nextZig = 0;
    // a place in the herd, relative to the leader
    const a = rand(0, Math.PI * 2);
    const r = rand(0.4, 1) * sp.spread;
    this.slot = { x: Math.cos(a) * r, z: Math.sin(a) * r - sp.spread * 0.3 };
    this.lastHoof = 0;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = yaw;
    this.quad.onStep = (leg, gait) => this.onStep(leg, gait);
    this.ctx = null;
  }

  get leader() {
    return this.group.members[0];
  }
  get isLeader() {
    return this.group.members[0] === this;
  }

  setState(s, dur = 3) {
    this.state = s;
    this.t = 0;
    this.dur = dur;
    this.target = null;
  }

  // ── Per frame ────────────────────────────────────────────────────────────
  update(ctx) {
    this.ctx = ctx;
    const dt = ctx.dt;
    const sp = this.sp;
    this.t += dt;
    this.life -= dt;
    const P = ctx.nearest(this.x, this.z);
    // running is loud; standing still makes you hard to notice
    const loud = P.speed > 4.5 ? 1.7 : P.speed > 0.4 ? 1 : 0.7;
    const dEff = P.d / loud;
    const g = this.group;

    if (!FRIGHT.has(this.state) && this.state !== 'climb') {
      if (g.alarm && ctx.time - g.alarm.t < 6) this.startFlee(ctx, g.alarm);
      else if (dEff < sp.flee) this.startFlee(ctx, P);
      else if (dEff < sp.notice && this.state !== 'alert' && ctx.time > (this.calmUntil ?? 0)) this.notice(ctx, P);
      else if ((this.life < 0 || g.departing) && this.state !== 'alert') this.setState('leave', 999);
    } else if (this.state === 'freeze' || this.state === 'watch' || this.state === 'stand') {
      if (dEff < sp.flee * 0.8) this.startFlee(ctx, P);
    }

    // reset the pose; the state sets what it wants
    const pose = this.pose;
    pose.graze = pose.alert = pose.rear = pose.crouch = pose.tailUp = pose.air = pose.lookPitch = pose.lift = 0;
    this.lookAt = null;
    this.wantSpeed = 0;
    const fn = this[`s_${this.state}`];
    if (fn) fn.call(this, ctx, P);
    else this.nextIdle(ctx);

    if (this.state !== 'climb') this.move(ctx);
    this.animate(ctx);
  }

  // ── Reactions ────────────────────────────────────────────────────────────
  notice(ctx, P) {
    this.setState('alert', range(this.sp.alertTime));
    this.threat = { x: P.x, z: P.z };
    this.call(ctx, 'alert');
  }

  startFlee(ctx, from) {
    const sp = this.sp;
    this.setState('flee', range(sp.fleeTime));
    this.fleeFrom = { x: from.x, z: from.z };
    const g = this.group;
    if (!g.alarm || ctx.time - g.alarm.t > 6) {
      g.alarm = { x: from.x, z: from.z, t: ctx.time };
      this.call(ctx, 'flee');
    }
    // where to: a trunk to climb, a rock to dive under
    if (sp.escape === 'tree') this.refuge = ctx.nearestTree(this.x, this.z, 14, from);
    else if (sp.escape === 'cover') this.refuge = ctx.nearestCover(this.x, this.z, 10, from);
    if (this.refuge) this.setState(sp.escape === 'tree' ? 'toTree' : 'toCover', 8);
  }

  call(ctx, when) {
    const sp = this.sp;
    const kind = sp.calls && sp.calls[when];
    if (!kind) return;
    ctx.call(kind, this.x, this.mesh.position.y + this.height, this.z, { size: Math.min(1, this.height) });
  }

  onStep(leg, gait) {
    const ctx = this.ctx;
    if (!ctx || !this.sp.hooves || gait === 'walk') return;
    if (ctx.time - this.lastHoof < 0.06) return;
    this.lastHoof = ctx.time;
    const P = ctx.nearest(this.x, this.z);
    if (P.d < 40) ctx.call('hoof', this.x, this.mesh.position.y, this.z, { size: Math.min(1, this.height * 0.8) });
  }

  nextIdle(ctx) {
    const sp = this.sp;
    const L = this.leader;
    if (!this.isLeader && L && MOVES.has(L.state) && L.speed > 0.3) {
      this.setState('follow', rand(4, 9));
      return;
    }
    const w = { ...sp.idle };
    if (!ctx.night || !this.isLeader) delete w.howl;
    if (!this.isLeader && w.travel) {
      w.follow = w.travel;
      delete w.travel;
    }
    const s = pickWeighted(w);
    const D = {
      graze: [6, 16], browse: [6, 14], forage: [3, 8], idle: [2, 6], sit: [3, 8], sniff: [2, 5], howl: [6, 9],
      hunt: [2.5, 4.5], hop: [0.35, 1.1], travel: [15, 35], wander: [10, 25], prowl: [10, 25], follow: [4, 9],
    };
    this.setState(s, range(D[s] || [3, 6]));
    if (s === 'howl') {
      // the pack joins in, one after another
      this.group.members.forEach((m, i) => {
        if (m !== this && !FRIGHT.has(m.state)) m.setState('howl', this.dur + i * 0.6);
        ctx.call('howl', m.x, m.mesh.position.y + m.height, m.z, { delay: i * rand(0.5, 1.4), pitch: rand(360, 540) });
      });
    }
    if (sp.calls && Math.random() < (sp.callChance ?? 0)) {
      if (sp.calls.idle && (ctx.hours < 9 || ctx.hours > 16)) this.call(ctx, 'idle');
      if (sp.calls.night && ctx.night > 0.4) this.call(ctx, 'night');
    }
  }

  // Somewhere to wander to: near the herd's way in at first (so you meet
  // them), then nearby, nudged toward better ground.
  pickTarget(ctx, dist) {
    const g = this.group;
    if (g.entry) {
      const e = g.entry;
      g.entry = null;
      return e;
    }
    let best = null;
    let bestW = -1;
    for (let i = 0; i < 4; i++) {
      const a = this.yaw + rand(-1.6, 1.6);
      const d = rand(dist * 0.4, dist);
      const x = this.x + Math.sin(a) * d;
      const z = this.z + Math.cos(a) * d;
      const w = this.sp.habitat(ctx.env(x, z)) + Math.random() * 0.3;
      if (w > bestW) {
        bestW = w;
        best = { x, z };
      }
    }
    return best;
  }

  headTo(x, z, speed, arrive = 1) {
    const dx = x - this.x;
    const dz = z - this.z;
    const d = Math.hypot(dx, dz);
    this.wantYaw = Math.atan2(dx, dz);
    this.wantSpeed = d < arrive ? 0 : speed * clamp(d / (arrive * 2.5), 0.35, 1);
    return d;
  }

  away(from, jitter = 0) {
    return Math.atan2(this.x - from.x, this.z - from.z) + jitter;
  }

  // ── States ───────────────────────────────────────────────────────────────
  s_idle() {
    if (this.t > this.dur) this.nextIdle(this.ctx);
  }

  s_graze(ctx) {
    // head down, a step now and then, and every few seconds up for a look
    this.vigil -= ctx.dt;
    const up = this.vigil < 0;
    if (this.vigil < -rand(1.2, 2.5)) this.vigil = rand(3, 9);
    this.pose.graze = up ? 0 : 1;
    this.pose.alert = up ? 0.4 : 0;
    if (!up && Math.sin(this.t * 0.7 + this.x) > 0.93) this.wantSpeed = this.sp.speed.walk * 0.3;
    if (this.t > this.dur) this.nextIdle(ctx);
  }

  s_browse(ctx) {
    // a moose stripping leaves: head at shoulder height, in among the bushes
    this.pose.graze = 0.35 + 0.1 * Math.sin(this.t * 1.3);
    if (Math.sin(this.t * 0.5 + this.z) > 0.9) this.wantSpeed = this.sp.speed.walk * 0.4;
    if (this.t > this.dur) this.nextIdle(ctx);
  }

  s_forage(ctx) {
    // small mammals: nose in the leaf litter, now and then up on the haunches
    this.vigil -= ctx.dt;
    if (this.vigil < 0) {
      this.pose.rear = this.sp.cat === 'small' ? 1 : 0.5;
      this.pose.alert = 0.6;
      if (this.vigil < -1.5) this.vigil = rand(2, 5);
    } else this.pose.graze = 0.9;
    if (this.t > this.dur) this.nextIdle(ctx);
  }

  s_sniff(ctx) {
    if (!this.target) this.target = this.pickTarget(ctx, 8);
    this.headTo(this.target.x, this.target.z, this.sp.speed.walk * 0.6);
    this.pose.graze = 0.55;
    if (this.t > this.dur) this.nextIdle(ctx);
  }

  s_sit(ctx) {
    this.pose.rear = 1;
    this.pose.alert = 0.3;
    if (this.t > this.dur) this.nextIdle(ctx);
  }

  s_wander(ctx) {
    if (!this.isLeader) return this.s_follow(ctx);
    if (!this.target) this.target = this.pickTarget(ctx, 25);
    const d = this.headTo(this.target.x, this.target.z, this.sp.speed.walk, 1.5);
    if (d < 1.6 || this.t > this.dur + 20) this.nextIdle(ctx);
  }

  s_prowl(ctx) {
    // the cats: slow, low, deliberate
    if (!this.target) this.target = this.pickTarget(ctx, 30);
    const d = this.headTo(this.target.x, this.target.z, this.sp.speed.walk, 1.5);
    this.pose.crouch = 0.18;
    this.pose.graze = 0.15;
    if (d < 1.6 || this.t > this.dur + 20) this.nextIdle(ctx);
  }

  s_travel(ctx) {
    if (!this.isLeader) return this.s_follow(ctx);
    if (this.travelYaw === undefined || this.t < ctx.dt * 1.5) {
      const tgt = this.group.entry ? this.pickTarget(ctx, 40) : null;
      this.travelYaw = tgt ? Math.atan2(tgt.x - this.x, tgt.z - this.z) : this.yaw + rand(-0.8, 0.8);
    }
    this.travelYaw += Math.sin(ctx.time * 0.13 + this.x * 0.01) * 0.12 * ctx.dt;
    this.wantYaw = this.travelYaw;
    this.wantSpeed = this.sp.travelGait === 'trot' ? this.sp.speed.trot : this.sp.speed.walk;
    if (this.t > this.dur) this.nextIdle(ctx);
  }

  s_follow(ctx) {
    const L = this.leader;
    if (!L || L === this) return this.nextIdle(ctx);
    let tx;
    let tz;
    if (this.sp.file) {
      // single file: behind whoever is in front of you
      const i = this.group.members.indexOf(this);
      const ahead = this.group.members[i - 1] || L;
      tx = ahead.x - Math.sin(ahead.yaw) * 1.6;
      tz = ahead.z - Math.cos(ahead.yaw) * 1.6;
    } else {
      const s = Math.sin(L.yaw);
      const c = Math.cos(L.yaw);
      tx = L.x + this.slot.x * c + this.slot.z * s;
      tz = L.z - this.slot.x * s + this.slot.z * c;
    }
    const d = Math.hypot(tx - this.x, tz - this.z);
    const fast = d > this.sp.spread * 2 ? this.sp.speed.trot : Math.max(this.sp.speed.walk, L.speed * 1.1);
    this.headTo(tx, tz, fast, 0.8);
    if (d < 1 && L.speed < 0.2 && this.t > 1) this.nextIdle(ctx);
    else if (this.t > this.dur + 15) this.nextIdle(ctx);
  }

  s_hop(ctx) {
    // a dash of a few bounds, then stop
    if (!this.target) {
      const a = this.yaw + rand(-1.2, 1.2);
      this.target = { x: this.x + Math.sin(a) * 3, z: this.z + Math.cos(a) * 3 };
    }
    this.headTo(this.target.x, this.target.z, this.sp.speed.run * 0.45, 0.2);
    if (this.t > this.dur) this.setState(Math.random() < 0.6 ? 'forage' : 'sit', rand(1, 4));
  }

  s_howl(ctx) {
    this.pose.rear = 1;
    this.pose.lookPitch = 1.1;
    if (this.t > this.dur) this.nextIdle(ctx);
  }

  s_hunt(ctx) {
    // ears on the grass: a vole somewhere just ahead
    this.pose.crouch = 0.35;
    this.pose.graze = 0.45;
    this.pose.alert = 1;
    if (this.t > this.dur) this.setState('leap', 0.8);
  }

  s_leap(ctx) {
    const u = clamp(this.t / this.dur, 0, 1);
    this.pose.air = Math.sin(Math.PI * u);
    this.pose.lift = 4 * 0.5 * this.scale * u * (1 - u);
    this.wantSpeed = 2.4;
    this.speed = 2.4;
    if (u >= 1) this.setState('graze', rand(1.5, 3));
  }

  s_alert(ctx, P) {
    const sp = this.sp;
    this.threat = { x: P.x, z: P.z };
    this.lookAt = this.threat;
    this.pose.alert = 1;
    if (sp.cat === 'small') this.pose.rear = 1;
    // turn to face it if it's well off to one side
    const toward = Math.atan2(P.x - this.x, P.z - this.z);
    if (Math.abs(wrap(toward - this.yaw)) > 1.3) this.wantYaw = toward;
    if (sp.tailFlag) this.pose.tailUp = Math.sin(this.t * 9) > 0.85 ? 0.4 : 0;
    if (this.t > this.dur) {
      const loud = P.speed > 4.5 ? 1.7 : P.speed > 0.4 ? 1 : 0.7;
      if (P.d / loud > sp.notice * 1.15) return this.nextIdle(ctx);
      // you stood stock still: often they decide you're nothing, and go back
      // to feeding, with an eye on you
      if (P.speed < 0.3 && P.d > sp.flee * 1.3 && (sp.afterAlert === 'flee' || sp.afterAlert === 'leave') && Math.random() < 0.6) {
        this.vigil = rand(1, 3);
        this.calmUntil = ctx.time + rand(8, 20);
        return this.nextIdle(ctx);
      }
      switch (sp.afterAlert) {
        case 'flee':
          return this.startFlee(ctx, P);
        case 'stand':
          this.call(ctx, 'alert');
          return this.setState('stand', rand(2.5, 4));
        case 'watch':
          return this.setState('watch', rand(3, 7));
        case 'freeze':
          return this.setState('freeze', rand(5, 10));
        default:
          return this.setState('leave', 999);
      }
    }
  }

  s_stand(ctx, P) {
    // a bear up on its hind legs to see and smell you better
    this.pose.rear = 1;
    this.pose.alert = 1;
    this.pose.lookPitch = 0.2;
    this.lookAt = { x: P.x, z: P.z };
    if (this.t > this.dur) this.setState('leave', 999);
  }

  s_watch(ctx, P) {
    // a cat sits and looks straight at you, then slips away
    this.pose.rear = 0.8;
    this.pose.crouch = 0.25;
    this.pose.alert = 1;
    this.lookAt = { x: P.x, z: P.z };
    const toward = Math.atan2(P.x - this.x, P.z - this.z);
    this.wantYaw = toward;
    if (this.t > this.dur) this.setState('leave', 999);
  }

  s_freeze(ctx, P) {
    // a rabbit flattened in the grass, trusting its colours
    this.pose.crouch = 0.6;
    this.pose.graze = 0.2;
    const loud = P.speed > 4.5 ? 1.7 : P.speed > 0.4 ? 1 : 0.7;
    if (this.t > this.dur && P.d / loud > this.sp.notice) this.nextIdle(ctx);
  }

  s_flee(ctx) {
    const sp = this.sp;
    this.leaving = true;
    if (ctx.time > this.nextZig) {
      this.zig = sp.zigzag ? (this.zig > 0 ? -1 : 1) * rand(0.5, 0.9) : rand(-0.25, 0.25);
      this.nextZig = ctx.time + (sp.zigzag ? rand(0.3, 0.6) : rand(0.8, 1.6));
    }
    this.wantYaw = this.away(this.fleeFrom, this.zig);
    this.wantSpeed = sp.speed.run;
    this.pose.tailUp = sp.tailFlag ? 1 : 0;
    if (this.t > this.dur) {
      if (sp.escape === 'hide') this.setState('hide', rand(2, 4));
      else this.setState('leave', 999);
    }
  }

  s_leave(ctx, P) {
    // away from people, at an unhurried pace; the rest of the herd comes too
    this.leaving = true;
    this.group.departing = true;
    const sp = this.sp;
    const a = this.away(P, Math.sin(ctx.time * 0.2 + this.z) * 0.4);
    this.wantYaw = a;
    this.wantSpeed = P.d < sp.notice ? sp.speed.trot : sp.speed.walk * 1.2;
    if (sp.afterAlert === 'watch') this.pose.crouch = 0.3;
  }

  s_hide(ctx) {
    // into the undergrowth: keep going until out of sight, then gone
    this.leaving = true;
    this.wantYaw = this.yaw + Math.sin(this.t * 3) * 0.3;
    this.wantSpeed = this.sp.speed.run * 0.7;
    if (this.t > this.dur && (!ctx.inView(this.x, this.mesh.position.y, this.z) || this.t > this.dur + 4)) this.done = true;
  }

  s_toTree(ctx) {
    this.leaving = true;
    const tr = this.refuge;
    const d = this.headTo(tr.x, tr.z, this.sp.speed.run, 0.01);
    if (d < tr.r + this.radius + 0.3) {
      this.setState('climb', rand(4, 7));
      this.climbY = 0;
      this.climbA = Math.atan2(this.x - tr.x, this.z - tr.z);
      this.quad.flat = true;
      this.call(ctx, 'alert');
    } else if (this.t > this.dur) this.setState('hide', 2);
  }

  s_climb(ctx) {
    // up the trunk, spiralling a little, then lost in the canopy
    const tr = this.refuge;
    const dt = ctx.dt;
    const rate = this.t < 2.5 ? 2.2 : 0.9;
    this.climbY += rate * dt;
    this.climbA += (this.t < 2.5 ? 0.6 : 0.15) * dt;
    const r = tr.r * 0.9 + 0.05 * this.scale;
    const dx = Math.sin(this.climbA);
    const dz = Math.cos(this.climbA);
    this.x = tr.x + dx * r;
    this.z = tr.z + dz * r;
    this.speed = rate;
    this.quad.speed = this.t < 2.5 ? rate : Math.sin(this.t * 2) > 0.3 ? rate : 0;
    const m = this.mesh;
    m.position.set(this.x, ctx.ground(tr.x, tr.z) + 0.05 + this.climbY, this.z);
    m.rotation.set(-Math.PI / 2, Math.atan2(-dx, -dz), 0, 'YXZ');
    if (this.t > this.dur || this.climbY > this.dur) this.done = true;
  }

  s_toCover(ctx) {
    this.leaving = true;
    const c = this.refuge;
    const d = this.headTo(c.x, c.z, this.sp.speed.run, 0.01);
    if (d < c.r + this.radius + 0.35 || this.t > this.dur) this.done = true;
  }

  // ── Moving ───────────────────────────────────────────────────────────────
  move(ctx) {
    const dt = ctx.dt;
    const sp = this.sp;
    let want = this.wantYaw;
    // steer round trunks and boulders ahead
    if (this.wantSpeed > 0.05) {
      const look = this.radius + 0.5 + this.speed * 0.3;
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      const hit = ctx.blocked(this.x + fx * look, this.z + fz * look, this.radius + 0.15);
      if (hit) {
        const cross = fx * (hit.z - this.z) - fz * (hit.x - this.x);
        want = this.yaw + (cross < 0 ? -1 : 1);
      }
    }
    const dy = wrap(want - this.yaw);
    const maxTurn = sp.turn * dt * (this.speed < 0.4 ? 1.5 : 1);
    const turn = clamp(dy, -maxTurn, maxTurn);
    this.yaw = wrap(this.yaw + turn);
    this.turnRate = turn / Math.max(dt, 1e-4);
    const ease = 1 - Math.min(0.7, Math.abs(dy) / 2.2);
    const target = this.wantSpeed * ease;
    const acc = (target > this.speed ? (this.state === 'flee' ? 14 : 4) : 8) * dt;
    this.speed += clamp(target - this.speed, -acc * 1.5, acc);
    this.x += Math.sin(this.yaw) * this.speed * dt;
    this.z += Math.cos(this.yaw) * this.speed * dt;
    ctx.pushOut(this, this.radius);
    this.mesh.position.x = this.x;
    this.mesh.position.z = this.z;
    this.mesh.rotation.y = this.yaw;
  }

  animate(ctx) {
    const dt = ctx.dt;
    const q = this.quad;
    const p = this.pose;
    const k = 1 - Math.exp(-dt * 5);
    const kf = 1 - Math.exp(-dt * 12);
    q.speed = this.state === 'climb' ? q.speed : this.speed;
    q.turn = this.turnRate;
    q.graze = lerp(q.graze, p.graze, k);
    q.alert = lerp(q.alert, p.alert, k);
    q.rear = lerp(q.rear, p.rear, k);
    q.crouch = lerp(q.crouch, p.crouch, k);
    q.tailUp = lerp(q.tailUp, p.tailUp, kf);
    q.air = this.state === 'leap' ? p.air : lerp(q.air, 0, kf);
    q.lift = p.lift;
    q.lookPitch = lerp(q.lookPitch, p.lookPitch, k);
    // where the head points
    let look = 0;
    if (this.lookAt) look = clamp(wrap(Math.atan2(this.lookAt.x - this.x, this.lookAt.z - this.z) - this.yaw), -1.3, 1.3);
    else if (this.speed < 0.3) {
      this.nextGlance -= dt;
      if (this.nextGlance < 0) {
        this.glance = Math.random() < 0.4 ? 0 : rand(-1, 1);
        this.nextGlance = rand(1.5, 5);
      }
      look = this.glance * (1 - q.graze);
    }
    q.lookYaw = lerp(q.lookYaw, look, 1 - Math.exp(-dt * 4));
    if (this.state !== 'climb' && q.flat) {
      q.flat = false;
      this.mesh.rotation.x = 0;
    }
    q.update(dt, ctx.ground);
  }

  dispose() {
    disposeAnimal(this.mesh);
  }
}
