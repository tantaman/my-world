// The men holding the stronghold. Each stands a post, walks a round, or
// watches from a tower, rifle in hand. They see you if you're in front of
// them, near enough and not behind something (the ground, the stockade, a
// tent), the sooner the nearer you are and the more you move; a shot is
// heard all round. Once one has seen you he shouts, and the others near him
// know too. Then they shoot at you whenever they can see you, the nearer the
// surer, and the ones on the ground come looking where they last saw you,
// through the gate if they have to. One good hit and a man is down.
//
// Their bodies are the townsfolk's (towns/people.js), dressed for it, with
// the hunting rifle (hunting/models.js) in their hands.
//
//   const guards = new Guards(camp, world)
//   guards.update(dt)
//   guards.aimed(o, d, far, near) -> { t, guard } or null    for the rifle
//   guards.shot(guard)                                        he's hit
//   guards.heard(x, z)                                        a shot from there
//
// world:
//   scene, ground(x, z)
//   keepOut(guard, r)  shove him back out of anything solid
//   you()        -> { x, y, z, speed }
//   see(from, to)  -> is the way clear (the ground, the walls)
//   fire(guard, hit)  a man fires at you: hit or miss
//   call(kind, x, y, z)

import * as THREE from 'three';
import { Body } from '../people/body.js';
import { lin } from '../render/rig.js';
import { makeRifle } from '../hunting/models.js';
import { rayCapsule } from '../core/geom.js';
import { rand, wrapAngle } from '../core/geom.js';

const SIGHT = { ground: 70, tower: 115, fov: 0.25 }; // m he sees you at, and the cos of how far round he sees
const NOTICE = 1.6; // s of seeing you, at the edge of his sight, before he's sure (much less near)
const HEARS = 160; // m a shot is heard at
const SHOUT = 60; // m: the others this near know when he does
const AIM = 1.5; // s from seeing you to his first shot
const EVERY = [2, 3.4]; // s between his shots
const SURE = { near: 0.45, far: 110, least: 0.05 }; // chance of a hit: near, falling to `least` by `far` m
const RUN = 3.6; // m/s, coming after you
const WALK = 1.2; // m/s, on his round
const HIT = { r: 0.3, low: 0.15, high: 1.65 }; // his body, as a capsule, for a shot
const FALL = 0.55; // s he takes to go down
const LOOK = ['cap', 'cowboy', 'cowboy', 'none'];
const SHIRT = [0x3e4430, 0x4a3a2a, 0x2e3436, 0x5a4a32, 0x3a3a3a].map(lin);
const LEGS = [0x2a2a26, 0x3a3226, 0x2a2e36].map(lin);
const SKIN = [0xe8c4a8, 0xdcae90, 0xc68c6c, 0xa86f50, 0x8a5a3c].map(lin);
const HAIR = [0x2a1c14, 0x4a3020, 0x1a1a1a, 0x6a4a2a].map(lin);
const HAT = [0x2a221a, 0x3a3026, 0x1a1816, 0x4a3e2e].map(lin);
const _o = new THREE.Vector3();
const _a = { x: 0, y: 0, z: 0 };
const _b = { x: 0, y: 0, z: 0 };
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class Guards {
  constructor(camp, world) {
    this.camp = camp;
    this.world = world;
    this.list = [];
    const add = (role, x, z, y, extra = {}) => this.list.push(this._man(role, x, z, y, extra));
    for (const t of camp.towers) add('tower', t.x, t.z, t.y);
    for (const p of camp.posts) add('post', p.x, p.z, null, { yaw: p.yaw });
    add('round', camp.inside[0].x, camp.inside[0].z, null, { route: camp.inside, at: 0 });
    add('round', camp.inside[3].x, camp.inside[3].z, null, { route: camp.inside, at: 3 });
    add('round', camp.outside[0].x, camp.outside[0].z, null, { route: camp.outside, at: 0 });
    add('round', camp.outside[5].x, camp.outside[5].z, null, { route: camp.outside, at: 5 });
  }

  get left() {
    return this.list.filter((g) => !g.down).length;
  }

  get alerted() {
    return this.list.some((g) => !g.down && g.alert);
  }

  _man(role, x, z, y, extra) {
    const look = {
      her: false,
      child: false,
      dark: false,
      height: 0.97 + Math.random() * 0.1,
      build: 1 + Math.random() * 0.12,
      skin: pick(SKIN),
      hair: pick(HAIR),
      shirt: pick(SHIRT),
      vest: Math.random() < 0.5 ? lin(0x1e1a16) : null,
      legs: pick(LEGS),
      dress: null,
      apron: false,
      coat: Math.random() < 0.3,
      hat: pick(LOOK),
      hatColor: pick(HAT),
      beard: Math.random() < 0.55,
    };
    const body = new Body(look, (Math.random() * 1e9) | 0);
    const rifle = makeRifle();
    body.arms[1].fore.add(rifle);
    rifle.position.set(0, -0.29, 0.02);
    const flash = rifle.getObjectByName('flash');
    body.mesh.castShadow = true;
    this.world.scene.add(body.mesh);
    const gy = y ?? this.world.ground(x, z);
    const g = {
      role,
      body,
      flash,
      x,
      z,
      y: gy,
      yaw: extra.yaw ?? Math.random() * Math.PI * 2,
      route: extra.route ?? null,
      at: extra.at ?? 0,
      home: { x, z, yaw: extra.yaw ?? null },
      speed: 0,
      alert: false,
      sure: 0, // how sure he is he's seen you, 0..1
      seen: null, // where he last saw you
      sees: false,
      aim: 0, // s until he can shoot
      flashT: 0,
      down: false,
      fall: 0,
      idle: rand(2, 6),
      look: null, // the way he's turning to look, standing
      label: 'an outlaw',
    };
    if (flash) flash.visible = false;
    this._place(g);
    return g;
  }

  // ── For the rifle ─────────────────────────────────────────────────────────
  aimed(o, d, far, near = 0) {
    let best = null;
    for (const g of this.list) {
      if (g.down) continue;
      _a.x = _b.x = g.x;
      _a.z = _b.z = g.z;
      _a.y = g.y + HIT.low;
      _b.y = g.y + HIT.high;
      const t = rayCapsule(o, d, _a, _b, HIT.r, best ? best.t : far);
      if (t !== null && t >= near) best = { t, guard: g };
    }
    return best;
  }

  shot(g) {
    if (g.down) return;
    g.down = true;
    g.fall = 0;
    if (g.flash) g.flash.visible = false;
    const P = this.world.you();
    this._shout(g, P, true);
  }

  heard(x, z) {
    for (const g of this.list) {
      if (g.down) continue;
      const d = Math.hypot(g.x - x, g.z - z);
      if (d > HEARS) continue;
      // he turns that way, and near enough he knows
      g.seen = { x, z };
      g.sure = Math.max(g.sure, d < 70 ? 1 : 0.6);
      if (d < 70 && !g.alert) this._alert(g, false);
    }
  }

  _alert(g, shout) {
    if (g.alert) return;
    g.alert = true;
    g.aim = AIM + rand(0, 0.6);
    if (shout) this.world.call('shout', g.x, g.y + 1.6, g.z);
  }

  // He has seen you, or seen a man go down: the ones near him know.
  _shout(g, P, quiet = false) {
    if (!quiet) this.world.call('shout', g.x, g.y + 1.6, g.z);
    for (const o of this.list) {
      if (o.down || o === g) continue;
      if (Math.hypot(o.x - g.x, o.z - g.z) < SHOUT) {
        o.seen = { x: P.x, z: P.z };
        this._alert(o, false);
      }
    }
  }

  // ── Every frame ───────────────────────────────────────────────────────────
  update(dt) {
    const P = this.world.you();
    for (const g of this.list) {
      if (g.down) {
        this._fall(g, dt);
        continue;
      }
      this._look(g, P, dt);
      if (g.alert) this._fight(g, P, dt);
      else this._routine(g, dt);
      this._place(g);
      const lookAt = g.alert || g.sure > 0.3 ? wrapAngle(Math.atan2(P.x - g.x, P.z - g.z) - g.yaw) : null;
      g.body.pose(dt, g.speed, lookAt);
      // the rifle up, at his shoulder, once he's after you
      const up = g.alert;
      const [left, right] = [g.body.arms[0], g.body.arms[1]];
      right.arm.rotation.x = up ? -1.45 : -0.3;
      right.fore.rotation.x = up ? -0.15 : -0.9;
      left.arm.rotation.x = up ? -1.25 : left.arm.rotation.x;
      left.arm.rotation.z = up ? -0.45 : left.arm.rotation.z;
      left.fore.rotation.x = up ? -0.6 : left.fore.rotation.x;
      if (g.flashT > 0) {
        g.flashT -= dt;
        if (g.flashT <= 0 && g.flash) g.flash.visible = false;
      }
    }
  }

  // Can he see you, and is he sure yet?
  _look(g, P, dt) {
    const tower = g.role === 'tower';
    const dx = P.x - g.x;
    const dz = P.z - g.z;
    const d = Math.hypot(dx, dz);
    const reach = tower ? SIGHT.tower : SIGHT.ground;
    g.sees = false;
    if (d < reach) {
      const facing = (dx * Math.sin(g.yaw) + dz * Math.cos(g.yaw)) / (d || 1);
      // once he's after you he looks all round; up a tower, most of the way round
      const inFront = g.alert || (tower ? facing > -0.5 : facing > SIGHT.fov);
      if (inFront || d < 4) g.sees = this.world.see({ x: g.x, y: g.y + 1.55, z: g.z }, { x: P.x, y: P.y + 1.2, z: P.z });
    }
    if (g.sees) {
      g.seen = { x: P.x, z: P.z };
      if (!g.alert) {
        const k = (1 - d / reach) * (P.speed > 4 ? 2 : P.speed > 0.5 ? 1.2 : 0.7);
        g.sure = Math.min(1, g.sure + (dt / NOTICE) * (0.3 + 2.5 * k));
        if (g.sure >= 1) {
          this._alert(g, true);
          this._shout(g, P, true);
        }
      }
    } else if (!g.alert) g.sure = Math.max(0, g.sure - dt * 0.15);
  }

  _routine(g, dt) {
    g.speed = 0;
    // half sure: he turns to look where he thinks he saw something
    if (g.sure > 0.3 && g.seen) {
      this._turnTo(g, g.seen.x, g.seen.z, dt * 2);
      return;
    }
    if (g.role === 'round') {
      const to = g.route[g.at];
      const d = Math.hypot(to.x - g.x, to.z - g.z);
      if (d < 0.8) {
        g.idle -= dt;
        if (g.idle <= 0) {
          g.idle = rand(1, 5);
          g.at = (g.at + 1) % g.route.length;
        }
      } else this._walk(g, to.x, to.z, WALK, dt);
      return;
    }
    // a post or a tower: stand and look out, turning now and then
    g.idle -= dt;
    if (g.idle <= 0) {
      g.idle = rand(3, 8);
      g.look = (g.role === 'post' && g.home.yaw !== null ? g.home.yaw : g.yaw) + rand(-1.2, 1.2);
      if (g.role === 'tower') g.look = Math.random() * Math.PI * 2;
    }
    if (g.look !== null) this._turnTo(g, g.x + Math.sin(g.look) * 10, g.z + Math.cos(g.look) * 10, dt);
  }

  _fight(g, P, dt) {
    g.speed = 0;
    if (g.sees) {
      this._turnTo(g, P.x, P.z, dt * 5);
      g.aim -= dt;
      if (g.aim <= 0) {
        g.aim = rand(EVERY[0], EVERY[1]);
        const d = Math.hypot(P.x - g.x, P.z - g.z);
        let p = Math.max(SURE.least, SURE.near - (SURE.near - SURE.least) * (d / SURE.far));
        if (P.speed > 4) p *= 0.6;
        if (g.flash) g.flash.visible = true;
        g.flashT = 0.06;
        this.world.fire(g, Math.random() < p);
      }
      return;
    }
    g.aim = Math.max(g.aim, 0.5);
    if (g.role === 'tower' || !g.seen) return;
    // off to where he last saw you, by the gate if the stockade is between
    const to = this._wayTo(g, g.seen);
    if (Math.hypot(to.x - g.x, to.z - g.z) > 1.2) this._walk(g, to.x, to.z, RUN, dt);
    else if (to === g.seen) g.seen = null;
  }

  // Inside to out, or out to in: by the gate.
  _wayTo(g, to) {
    const c = this.camp.fire;
    const r = this.camp.r;
    const inG = Math.hypot(g.x - c.x, g.z - c.z) < r;
    const inT = Math.hypot(to.x - c.x, to.z - c.z) < r;
    if (inG === inT) return to;
    const gate = this.camp.gate;
    const near = inG ? gate.in : gate.out;
    if (Math.hypot(near.x - g.x, near.z - g.z) > 1.5 && !g.through) return near;
    g.through = true;
    const far = inG ? gate.out : gate.in;
    if (Math.hypot(far.x - g.x, far.z - g.z) < 1.2) g.through = false;
    return far;
  }

  _walk(g, x, z, speed, dt) {
    this._turnTo(g, x, z, dt * 4);
    g.speed = speed;
    const nx = g.x + Math.sin(g.yaw) * speed * dt;
    const nz = g.z + Math.cos(g.yaw) * speed * dt;
    g.x = nx;
    g.z = nz;
    this.world.keepOut(g, 0.35);
    g.y = this.world.ground(g.x, g.z);
  }

  _turnTo(g, x, z, k) {
    const want = Math.atan2(x - g.x, z - g.z);
    g.yaw = wrapAngle(g.yaw + wrapAngle(want - g.yaw) * Math.min(1, k));
  }

  _place(g) {
    const m = g.body.mesh;
    m.position.set(g.x, g.y, g.z);
    m.rotation.y = g.yaw;
  }

  // Going down: over backwards, and lying there.
  _fall(g, dt) {
    if (g.fall >= 1) return;
    g.fall = Math.min(1, g.fall + dt / FALL);
    const m = g.body.mesh;
    m.rotation.order = 'YXZ';
    m.rotation.x = -(Math.PI / 2) * g.fall * g.fall;
    m.position.y = g.y + 0.15 * g.fall;
    g.body.pose(dt, 0, null);
  }

  // Where a man's rifle is, to fire from.
  muzzle(g, out = _o) {
    return out.set(g.x + Math.sin(g.yaw) * 0.6, g.y + 1.4, g.z + Math.cos(g.yaw) * 0.6);
  }

  dispose() {
    for (const g of this.list) {
      this.world.scene.remove(g.body.mesh);
      g.body.dispose();
    }
  }
}
