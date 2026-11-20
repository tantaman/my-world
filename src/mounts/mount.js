// One mount, wherever it is in its life:
//
//   wild    at its haunt, minding its own business: a horse grazing and
//           wandering its meadow, a turtle swimming its lake and hauling out
//           to bask on the shore, an eagle on its summit, now and then
//           circling over it. Walk up quietly and it watches you; rush it
//           and it's off; stand with it, hand out, and it comes round
//           (taming.js).
//   tame    yours: waiting where you left it (grazing, basking, perched), or
//           coming when you whistle
//   ridden  carrying you: you move (Player.carrier), and it is posed from that
//
// It has a body (bodies.js) only while you're near enough to see it.
//
// What it asks of the world (ctx, handed in by the feature):
//   stand(x, z, depth)   where its feet are: the ground, or afloat in water deeper than depth
//   ground(x, z)         the ground itself
//   water(x, z)          how deep the water is here (m, 0 on dry land)
//   pushOut(m, r)        shove it out of trunks, rocks and anything built
//   blocked(x, z, r)     is anything in the way of standing here?
//   inView(x, y, z, r)   could you see it there?
//   place(kind, x, z, minD, maxD) -> { x, z } somewhere out of sight round
//                        (x, z) that suits it (dry for a horse, water for a turtle), or null
//   waterNear(x, z)      -> { x, z } water deep enough to swim in near there, or null
// and `you` each frame: { x, z, d (m from it), speed (m/s), holding (your
// hand is out to it) }.

import { sense } from './taming.js';
import { shore } from './haunts.js';
import { basinRadius } from '../world/drainage.js';
import { clamp, lerp, smoothstep } from '../noise.js';
import { rand, wrapAngle as wrap } from '../core/geom.js';

// Speeds (m/s) it goes about at on its own.
const PACE = {
  horse: { wander: 1.4, trot: 4, come: 9.5, bolt: 10 },
  turtle: { swim: 1.1, crawl: 0.5, come: 5, bolt: 4.5 },
  eagle: { fly: 12, come: 14 },
};
// How quickly it turns (rad/s) walking and swimming.
const TURN = { horse: 2.4, turtle: 1.2, eagle: 2.5 };
// The eagle circles this high (m) over its summit, this wide (m).
const SOAR = { alt: 32, r: 26 };
// A tame one waiting wanders no further than this (m) from where it was left,
// doing what it does when there's nothing else to do.
const WAIT_ROAM = 4;
const IDLE = { horse: 'graze', turtle: 'bask', eagle: 'perch' };
// Coming when called: alongside you at this distance (m)...
const BESIDE = 2.6;
// ...and if it gets no closer than this (m) in this many seconds, it's stuck.
const STUCK = { by: 1, every: 3.5 };

export class Mount {
  // haunt: where it lives (haunts.js); body: the class to draw it with
  constructor({ kind, def, haunt, Body }) {
    this.kind = kind;
    this.def = def;
    this.haunt = haunt;
    this.Body = Body;
    this.body = null;
    this.tame = false;
    this.riding = false;
    this.x = haunt.x;
    this.z = haunt.z;
    this.y = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.turn = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.flying = false;
    this.grounded = true;
    this.swimming = false;
    this.home = { x: haunt.x, z: haunt.z, r: haunt.r };
    this.mode = kind === 'eagle' ? 'perch' : kind === 'turtle' ? 'bask' : 'graze';
    this.t = 0;
    this.dur = rand(20, 40);
    this.goal = null; // { x, z } where it is heading
    this.taming = { trust: 0, mood: 'ignore' };
    this.graze = 0;
    this.alert = 0;
    this.look = 0;
    this.shy = false;
    this.stuck = { t: 0, d: Infinity };
    this.placed = false;
    // basking: a spot on its lake's shore
    if (haunt.lake) {
      const a = rand(0, Math.PI * 2);
      this.goal = shore(haunt.lake, a, 0.6);
      this.x = this.goal.x;
      this.z = this.goal.z;
      this.yaw = a + Math.PI; // facing the water
    }
  }

  // ── Its body ───────────────────────────────────────────────────────────────
  show(scene, ctx) {
    if (this.body) return this.body;
    this.body = new this.Body();
    if (!this.placed) this.settle(ctx);
    this.body.place(this.x, this.y, this.z, this.yaw);
    scene.add(this.body.mesh);
    return this.body;
  }

  hide(scene) {
    if (!this.body) return;
    scene.remove(this.body.mesh);
    this.body.dispose();
    this.body = null;
  }

  // Stand it on whatever is under it.
  settle(ctx) {
    this.y = ctx.stand(this.x, this.z, this.def.carrier.depth);
    this.placed = true;
  }

  // Somewhere else at once (out of sight, called from afar; or put back).
  moveTo(x, z, ctx, yaw = this.yaw) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.speed = 0;
    this.flying = false;
    this.grounded = true;
    this.settle(ctx);
    if (this.body) this.body.place(this.x, this.y, this.z, this.yaw);
  }

  // ── Per frame, when it isn't carrying you ──────────────────────────────────
  update(dt, ctx, you) {
    this.t += dt;
    if (!this.tame) sense(this.taming, you, this.def.taming, dt);
    else this.taming.mood = 'ignore';
    if (this.kind === 'horse') this.#horse(dt, ctx, you);
    else if (this.kind === 'turtle') this.#turtle(dt, ctx, you);
    else this.#eagle(dt, ctx, you);
    if (this.body) this.pose(dt, ctx);
  }

  pose(dt, ctx, s = this) {
    const depth = this.def.carrier.depth;
    this.body.pose(dt, {
      x: s.x,
      y: s.y,
      z: s.z,
      yaw: s.yaw,
      speed: s.speed,
      turn: s.turn,
      vy: s.vy,
      grounded: s.grounded ?? !s.flying,
      flying: s.flying,
      climbing: s.climbing ?? s.vy > 0.5,
      swimming: s.swimming,
      graze: this.graze,
      alert: this.alert,
      look: this.look,
      shy: this.shy,
      ridden: this.riding,
      ground: (x, z) => ctx.stand(x, z, depth),
    });
  }

  // Settle down here: graze, bask or perch, and stay about this spot.
  rest() {
    this.home = { x: this.x, z: this.z, r: WAIT_ROAM };
    this.set(IDLE[this.kind], rand(8, 16));
  }

  set(mode, dur = 5, goal = null) {
    this.mode = mode;
    this.t = 0;
    this.dur = dur;
    this.goal = goal;
    this.stuck.t = 0;
    this.stuck.d = Infinity;
  }

  // Whistled for: come to you. -> false if it can't (a turtle far from water).
  call(you, ctx) {
    if (this.kind === 'turtle') {
      const w = ctx.waterNear(you.x, you.z);
      if (!w) return false;
      this.set('come', 60, w);
      return true;
    }
    this.set('come', 60, null);
    return true;
  }

  // ── Getting about ──────────────────────────────────────────────────────────
  // Head for (tx, tz) at `pace`, turning as it can. -> how far it still is.
  #walk(dt, ctx, tx, tz, pace) {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    const turn = TURN[this.kind];
    const dyaw = d > 0.2 ? wrap(Math.atan2(dx, dz) - this.yaw) : 0;
    const step = clamp(dyaw, -turn * dt, turn * dt);
    this.yaw += step;
    this.turn = lerp(this.turn, step / Math.max(dt, 1e-4), 1 - Math.exp(-dt * 6));
    // slow to turn round, and slow down on the way in
    const want = d < 0.25 ? 0 : Math.min(pace, d * 1.5) * Math.max(0.15, Math.cos(dyaw));
    this.speed = lerp(this.speed, want, 1 - Math.exp(-dt * 3));
    this.#advance(dt, ctx);
    return d;
  }

  #stop(dt, ctx) {
    this.speed = lerp(this.speed, 0, 1 - Math.exp(-dt * 4));
    this.turn = lerp(this.turn, 0, 1 - Math.exp(-dt * 4));
    this.#advance(dt, ctx);
  }

  #face(dt, x, z) {
    const dyaw = wrap(Math.atan2(x - this.x, z - this.z) - this.yaw);
    const turn = TURN[this.kind] * 0.6;
    this.yaw += clamp(dyaw, -turn * dt, turn * dt);
  }

  #advance(dt, ctx) {
    this.x += Math.sin(this.yaw) * this.speed * dt;
    this.z += Math.cos(this.yaw) * this.speed * dt;
    if (this.speed > 0.05) ctx.pushOut(this, this.kind === 'turtle' ? 0.7 : 0.5);
    const depth = this.def.carrier.depth;
    this.swimming = ctx.water(this.x, this.z) > depth;
    const y = ctx.stand(this.x, this.z, depth);
    this.vy = (y - this.y) / Math.max(dt, 1e-4);
    this.y = y;
    this.flying = false;
    this.grounded = true;
  }

  // Turn the head toward you (radians, relative to the body), while it watches.
  #lookAt(dt, you, on) {
    const want = on ? clamp(wrap(Math.atan2(you.x - this.x, you.z - this.z) - this.yaw), -1.2, 1.2) : 0;
    this.look = lerp(this.look, want, 1 - Math.exp(-dt * 3));
  }

  // Somewhere to wander to round the middle of where it lives.
  #roam(r = this.home.r) {
    const a = rand(0, Math.PI * 2);
    const d = Math.sqrt(Math.random()) * r;
    return { x: this.home.x + Math.cos(a) * d, z: this.home.z + Math.sin(a) * d };
  }

  // Somewhere well away from you, but not so far it leaves home.
  #away(you, dist, keep) {
    let dx = this.x - you.x;
    let dz = this.z - you.z;
    const l = Math.hypot(dx, dz) || 1;
    const a = Math.atan2(dx / l, dz / l) + rand(-0.6, 0.6);
    let x = this.x + Math.sin(a) * dist;
    let z = this.z + Math.cos(a) * dist;
    dx = x - this.home.x;
    dz = z - this.home.z;
    const far = Math.hypot(dx, dz);
    if (far > keep) {
      x = this.home.x + (dx / far) * keep;
      z = this.home.z + (dz / far) * keep;
    }
    return { x, z };
  }

  // Not getting any closer to where it's going? -> true when stuck.
  #stuck(dt, d) {
    const s = this.stuck;
    s.t += dt;
    if (s.t < STUCK.every) return false;
    const stuck = d > s.d - STUCK.by;
    s.t = 0;
    s.d = d;
    return stuck;
  }

  // Where to stand beside you, on whichever side it's coming from.
  #beside(you) {
    const dx = this.x - you.x;
    const dz = this.z - you.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: you.x + (dx / l) * BESIDE, z: you.z + (dz / l) * BESIDE };
  }

  // ── A horse ───────────────────────────────────────────────────────────────
  #horse(dt, ctx, you) {
    const P = PACE.horse;
    const mood = this.taming.mood;
    if (!this.tame) {
      if (mood === 'bolt' && this.mode !== 'bolt') this.set('bolt', rand(4, 6), this.#away(you, rand(28, 42), this.home.r * 1.8));
      else if (mood === 'calm' && this.mode !== 'bolt') this.mode = 'calm';
      else if (mood === 'watch' && (this.mode === 'graze' || this.mode === 'wander') && this.t > 2.5) this.set('watch', rand(3, 7));
    }
    let graze = 0;
    let alert = 0;
    let watching = false;
    this.shy = false;
    switch (this.mode) {
      case 'graze':
        graze = 1;
        this.#stop(dt, ctx);
        if (this.t > this.dur) this.#idle();
        break;
      case 'wander':
        if (this.#walk(dt, ctx, this.goal.x, this.goal.z, P.wander) < 0.6 || this.t > this.dur) this.set('graze', rand(6, 14));
        break;
      case 'watch':
        alert = 1;
        watching = true;
        this.#stop(dt, ctx);
        if (you.d < 20) this.#face(dt, you.x, you.z);
        if (this.t > this.dur) this.set('graze', rand(4, 9));
        break;
      case 'calm':
        // head down to you, sniffing your hand
        graze = 0.35;
        watching = true;
        this.#stop(dt, ctx);
        this.#face(dt, you.x, you.z);
        if (mood !== 'calm') this.set('watch', rand(3, 5));
        break;
      case 'bolt':
        alert = 1;
        this.shy = true;
        if (this.#walk(dt, ctx, this.goal.x, this.goal.z, P.bolt) < 1.5 || this.t > this.dur) this.set('watch', rand(5, 8));
        break;
      case 'come': {
        watching = true;
        const at = this.#beside(you);
        const d = this.#walk(dt, ctx, at.x, at.z, you.d > 25 ? P.come : you.d > 8 ? P.trot : P.wander);
        if (d < 0.6 || you.d < BESIDE + 0.4) this.#arrived();
        else if (this.#stuck(dt, d)) this.#cutAcross(you, ctx);
        break;
      }
      case 'wait':
      default:
        this.mode = 'graze';
        break;
    }
    this.graze = graze;
    this.alert = alert;
    this.#lookAt(dt, you, watching && you.d < 30);
  }

  #idle() {
    if (Math.random() < 0.55) this.set('wander', 20, this.#roam(this.tame ? WAIT_ROAM : this.home.r));
    else this.set('graze', rand(6, 14));
  }

  #arrived() {
    this.rest();
    this.arrived = true; // for whoever called it to notice
  }

  // Stuck behind something on its way to you: it finds another way round,
  // out of sight, and turns up a little nearer.
  #cutAcross(you, ctx) {
    const p = ctx.place(this.kind, you.x, you.z, 12, 22);
    if (p) this.moveTo(p.x, p.z, ctx, Math.atan2(you.x - p.x, you.z - p.z));
  }

  // ── A turtle ──────────────────────────────────────────────────────────────
  #turtle(dt, ctx, you) {
    const P = PACE.turtle;
    const lake = this.haunt.lake;
    const mood = this.taming.mood;
    if (!this.tame) {
      if (mood === 'bolt' && this.mode !== 'flee') this.set('flee', rand(8, 12), this.#inLake(lake, you, true));
      else if (mood === 'calm' && this.mode !== 'flee') this.mode = 'calm';
      else if (mood === 'watch' && (this.mode === 'bask' || this.mode === 'swim') && this.t > 3 && this.mode !== 'watch') this.set('watch', rand(4, 8));
    }
    let watching = false;
    this.shy = false;
    const pace = this.swimming ? P.swim : P.crawl;
    switch (this.mode) {
      case 'bask':
        this.#stop(dt, ctx);
        if (this.t > this.dur) this.set('swim', rand(15, 30), this.#inLake(lake));
        break;
      case 'swim':
        if (this.#walk(dt, ctx, this.goal.x, this.goal.z, pace) < 1 || this.t > this.dur) {
          // out onto the shore for a while, or on round the lake
          if (Math.random() < 0.6 && lake) this.set('haul', 60, shore(lake, rand(0, Math.PI * 2), 0.6));
          else this.set('swim', rand(15, 30), this.#inLake(lake));
        }
        break;
      case 'haul':
        if (this.#walk(dt, ctx, this.goal.x, this.goal.z, pace) < 0.6 || this.t > this.dur) this.set('bask', rand(40, 80));
        break;
      case 'watch':
        watching = true;
        this.#stop(dt, ctx);
        if (this.t > this.dur) this.set(this.swimming ? 'swim' : 'bask', rand(20, 40), this.swimming ? this.#inLake(lake) : null);
        break;
      case 'calm':
        watching = true;
        this.#stop(dt, ctx);
        this.#face(dt, you.x, you.z);
        if (mood !== 'calm') this.set('watch', rand(3, 5));
        break;
      case 'flee':
        this.shy = true;
        if (this.#walk(dt, ctx, this.goal.x, this.goal.z, this.swimming ? P.bolt : P.crawl * 1.6) < 1 || this.t > this.dur) this.set('watch', rand(5, 9));
        break;
      case 'come': {
        watching = true;
        const d = this.#walk(dt, ctx, this.goal.x, this.goal.z, this.swimming ? P.come : P.crawl);
        if (d < 1 || you.d < BESIDE) this.#arrived();
        else if (this.#stuck(dt, d)) this.#cutAcross(you, ctx);
        break;
      }
      default:
        this.mode = 'bask';
        break;
    }
    this.alert = watching ? 1 : 0;
    this.#lookAt(dt, you, watching && you.d < 25);
  }

  // A spot out in the lake: anywhere, or (away) on the far side from you.
  #inLake(lake, you = null, away = false) {
    if (!lake) return this.#roam(WAIT_ROAM);
    const a = away && you ? Math.atan2(lake.z - you.z, lake.x - you.x) + rand(-0.5, 0.5) : rand(0, Math.PI * 2);
    const r = basinRadius(lake, a) * (away ? rand(0.4, 0.7) : rand(0.1, 0.65));
    return { x: lake.x + Math.cos(a) * r, z: lake.z + Math.sin(a) * r };
  }

  // ── An eagle ──────────────────────────────────────────────────────────────
  #eagle(dt, ctx, you) {
    const P = PACE.eagle;
    const mood = this.taming.mood;
    if (!this.tame) {
      if (mood === 'bolt' && !this.flying) this.set('soar', rand(20, 30));
      else if (mood === 'calm' && !this.flying) this.mode = 'calm';
      else if (mood === 'watch' && this.mode === 'perch') this.mode = 'watch';
      else if (mood !== 'watch' && this.mode === 'watch') this.mode = 'perch';
    }
    let watching = false;
    this.shy = false;
    switch (this.mode) {
      case 'perch':
        this.#stop(dt, ctx);
        // now and then, up to ride the air over its summit
        if (!this.tame && this.t > this.dur) this.set('soar', rand(20, 40));
        break;
      case 'watch':
      case 'calm':
        watching = true;
        this.#stop(dt, ctx);
        this.#face(dt, you.x, you.z);
        if (this.mode === 'calm' && mood !== 'calm') this.mode = 'watch';
        break;
      case 'soar': {
        this.shy = true;
        const h = this.home;
        const ang = Math.atan2(this.x - h.x, this.z - h.z) + (P.fly / SOAR.r) * dt * 1.4;
        const tx = h.x + Math.sin(ang) * SOAR.r;
        const tz = h.z + Math.cos(ang) * SOAR.r;
        this.#fly(dt, ctx, tx, ctx.ground(h.x, h.z) + SOAR.alt + Math.sin(this.t * 0.3) * 3, tz, P.fly);
        if (this.t > this.dur) this.set('land', 40, { x: h.x, z: h.z });
        break;
      }
      case 'land':
        if (this.#flyDown(dt, ctx, this.goal.x, this.goal.z, P.fly)) this.set('perch', rand(30, 70));
        break;
      case 'come': {
        watching = true;
        if (!this.goal) this.goal = this.#beside(you);
        // keep the landing spot beside you as you move
        if (Math.hypot(this.goal.x - you.x, this.goal.z - you.z) > BESIDE + 2.5) this.goal = this.#beside(you);
        if (this.#flyDown(dt, ctx, this.goal.x, this.goal.z, P.come)) this.#arrived();
        break;
      }
      default:
        this.mode = 'perch';
        break;
    }
    this.alert = watching ? 1 : 0;
    this.#lookAt(dt, you, watching && you.d < 35);
  }

  // Fly toward a point in the air.
  #fly(dt, ctx, tx, ty, tz, speed) {
    if (!this.flying) {
      this.flying = true;
      this.grounded = false;
      this.vy = 5;
    }
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dz = tz - this.z;
    const d = Math.hypot(dx, dy, dz) + 1e-4;
    const sp = Math.min(speed, d * 1.2 + 1.5);
    const k = 1 - Math.exp(-dt * 1.4);
    this.vx = lerp(this.vx, (dx / d) * sp, k);
    this.vy = lerp(this.vy, (dy / d) * sp, k);
    this.vz = lerp(this.vz, (dz / d) * sp, k);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
    // never through the ground
    const floor = ctx.stand(this.x, this.z, this.def.carrier.depth);
    if (this.y < floor + 0.5) {
      this.y = floor + 0.5;
      this.vy = Math.max(0, this.vy);
    }
    const h = Math.hypot(this.vx, this.vz);
    if (h > 0.3) {
      const dyaw = wrap(Math.atan2(this.vx, this.vz) - this.yaw);
      const step = dyaw * Math.min(1, dt * 4);
      this.yaw += step;
      this.turn = lerp(this.turn, step / Math.max(dt, 1e-4), 1 - Math.exp(-dt * 4));
    }
    this.speed = h;
    this.climbing = this.vy > 0.8;
    return d;
  }

  // Fly in high over the trees, come down and land at (tx, tz). -> true once down.
  #flyDown(dt, ctx, tx, tz, speed) {
    const g = ctx.stand(tx, tz, this.def.carrier.depth);
    const flat = Math.hypot(tx - this.x, tz - this.z);
    if (!this.flying && flat < 1.2) return true;
    const ty = g + smoothstep(4, 30, flat) * 16;
    this.#fly(dt, ctx, tx, ty, tz, flat < 12 ? Math.max(3, speed * (flat / 12)) : speed);
    if (flat < 1.2 && this.y - g < 0.9) {
      this.flying = false;
      this.grounded = true;
      this.vx = this.vy = this.vz = 0;
      this.speed = 0;
      this.y = g;
      return true;
    }
    return false;
  }
}
