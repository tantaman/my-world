// A storm: what the hurricane is, and what the twister comes out of. The sky
// goes dark and close, rain drives in sideways, gusts shove you about, the
// trees thrash, lightning cracks down round you and branches come flying out
// of the wind.
//
//   const storm = new Storm(kit)
//   storm.update(dt, { level, wind, rain, lightning, debris })   every frame
//     level      0..1, how much of a storm it is (eased in and out by the caller)
//     wind       m/s the gusts blow at, at their worst
//     rain       0..1
//     lightning  strikes a minute
//     debris     things flying at you a minute
//   storm.dispose()
//
// It writes the sky and the air an adventure is allowed to (kit.look,
// kit.air), and shoves and hurts you (kit.push, kit.hurt). Under cover
// (kit.sheltered: a cave, or a roof you built) none of the wind or what it
// carries reaches you.

import * as THREE from 'three';
import { Rain, Bolt, Flying } from './fx.js';
import { rand } from '../core/geom.js';

const GLOOM = new THREE.Color(0.12, 0.14, 0.16); // a storm sky: slate
const PUSH = 0.13; // how much of the wind's speed shoves you along (m/s per m/s)
const VEER = 0.05; // radians a second the wind slowly comes round
const HIT = { reach: 0.9, fast: 6, hurt: 7 }; // m from your middle a flying thing hits; how fast it must be going (m/s); how much
const STRIKE = { near: 14, far: 320, close: 40, stun: 22, hurt: 12 }; // m: lightning's spread, and how close knocks you down
const DEBRIS = [
  { size: [0.08, 0.08, 1.4], color: 0x5a4632, why: 'hit by a flying branch' },
  { size: [0.12, 0.1, 0.9], color: 0x6b5236, why: 'hit by a flying branch' },
  { size: [0.5, 0.03, 0.5], color: 0x3e5a2a, why: 'hit by a bough torn off a tree' },
  { size: [0.18, 0.04, 1.6], color: 0x8a6f50, why: 'hit by a flying board' },
];

export class Storm {
  constructor(kit) {
    this.kit = kit;
    this.rain = new Rain(kit.scene);
    this.bolt = new Bolt(kit.scene);
    this.flying = new Flying(kit.scene, 160);
    this.dir = rand(0, Math.PI * 2); // the way the wind blows toward
    this.gust = 0.5;
    this.gustTo = 0.5;
    this.nextStrike = rand(3, 6);
    this.nextDebris = rand(1, 3);
    this.flash = 0;
    this.thunder = []; // [s until heard, how near 0..1]
    this.sheltered = false;
    this.wind = { x: 0, z: 0 }; // the wind now, m/s
  }

  update(dt, { level = 1, wind = 18, rain = 1, lightning = 8, debris = 30 } = {}) {
    const kit = this.kit;
    const P = kit.player.pos;
    this.dir += VEER * dt * Math.sin(kit.player.pos.x * 0.001 + this.dir);
    if (Math.random() < dt * 0.6) this.gustTo = rand(0.25, 1);
    this.gust += (this.gustTo - this.gust) * (1 - Math.exp(-dt * 1.5));
    const speed = wind * level * (0.45 + 0.55 * this.gust);
    this.wind.x = Math.sin(this.dir) * speed;
    this.wind.z = Math.cos(this.dir) * speed;
    this.sheltered = kit.sheltered();

    // the sky and the air
    const L = kit.look;
    L.overcast = Math.max(L.overcast, 0.95 * level);
    L.haze = Math.max(L.haze, 1 + 2.2 * level * rain);
    L.sight = Math.min(L.sight || Infinity, 240 - 170 * level * rain);
    L.wind = Math.max(L.wind, 3.5 * level * (0.5 + this.gust));
    L.gloom = Math.max(L.gloom, 0.8 * level);
    if (!L.gloomColor) L.gloomColor = GLOOM;
    kit.air.wind = Math.max(kit.air.wind, level * (0.4 + 0.6 * this.gust));
    kit.air.rain = Math.max(kit.air.rain, level * rain);
    const open = kit.player.space ? 0 : this.sheltered ? 0.15 : 1;
    this.rain.update({ x: P.x, y: P.y, z: P.z }, { amount: rain * level, wind: this.wind, open });

    // the gusts shove you, out in it
    if (!this.sheltered && level > 0.05) kit.push(this.wind.x * PUSH * dt * this.gust, this.wind.z * PUSH * dt * this.gust);

    this._lightning(dt, level, lightning);
    this._debris(dt, level, debris);
    this.flying.update(dt, kit.ground);
    this.bolt.update(dt);
  }

  // ── Lightning ─────────────────────────────────────────────────────────────
  _lightning(dt, level, perMinute) {
    const kit = this.kit;
    this.flash = Math.max(0, this.flash - dt * 5);
    kit.look.flash = Math.max(kit.look.flash, this.flash * (kit.player.space ? 0.1 : 1));
    for (let i = this.thunder.length - 1; i >= 0; i--) {
      const th = this.thunder[i];
      th[0] -= dt;
      if (th[0] <= 0) {
        kit.sound.sfx('thunder', { size: th[1] });
        this.thunder.splice(i, 1);
      }
    }
    if (perMinute <= 0 || level < 0.3) return;
    this.nextStrike -= dt;
    if (this.nextStrike > 0) return;
    this.nextStrike = rand(0.4, 1.6) * (60 / perMinute);
    const P = kit.player.pos;
    const close = Math.random() < 0.18;
    const a = rand(0, Math.PI * 2);
    const d = close ? rand(STRIKE.near, STRIKE.close) : rand(STRIKE.close, STRIKE.far);
    this.strike(P.x + Math.sin(a) * d, P.z + Math.cos(a) * d);
  }

  // Lightning comes down at (x, z).
  strike(x, z) {
    const kit = this.kit;
    const P = kit.player.pos;
    const g = kit.ground(x, z);
    this.bolt.strike(x + rand(-30, 30), g + 260, z + rand(-30, 30), x, g, z, kit.camera);
    const d = Math.hypot(x - P.x, z - P.z);
    this.flash = Math.max(this.flash, d < 120 ? 1 : 0.55);
    // thunder: sound comes at 340 m/s; near, there's a crack in it
    this.thunder.push([d / 340, Math.max(0, 1 - d / 300)]);
    if (d < STRIKE.stun && !this.sheltered) {
      const k = 1 - d / STRIKE.stun;
      const ux = (P.x - x) / (d || 1);
      const uz = (P.z - z) / (d || 1);
      kit.fling(ux * 5 * k, 4 * k, uz * 5 * k);
      kit.hurt(Math.round(STRIKE.hurt * (0.5 + k)), 'knocked flat by lightning');
    }
    // a strike throws up what it hits
    for (let i = 0; i < 8; i++) this.flying.add({ x, y: g + 0.3, z, vx: rand(-4, 4), vy: rand(3, 8), vz: rand(-4, 4), size: [0.12, 0.12, 0.12], color: 0x3a3028, life: 3 });
  }

  // ── Things flying in the wind ─────────────────────────────────────────────
  _debris(dt, level, perMinute) {
    const kit = this.kit;
    const P = kit.player.pos;
    if (perMinute > 0 && level > 0.35) {
      this.nextDebris -= dt;
      if (this.nextDebris <= 0) {
        this.nextDebris = rand(0.4, 1.6) * (60 / perMinute);
        this.throwAt(P.x, P.y + 1, P.z, Math.hypot(this.wind.x, this.wind.z) + 6);
      }
    }
    // the ones still flying fast hit you, out in it
    if (this.sheltered) return;
    for (const p of this.flying.list) {
      if (p.resting || !p.why) continue;
      const v = Math.hypot(p.vx, p.vy, p.vz);
      if (v < HIT.fast) continue;
      if (Math.hypot(p.x - P.x, p.y - (P.y + 1), p.z - P.z) < HIT.reach) {
        kit.hurt(HIT.hurt, p.why);
        p.why = null;
        p.vx *= -0.3;
        p.vz *= -0.3;
      } else if (!p.heard && Math.hypot(p.x - P.x, p.z - P.z) < 4) {
        p.heard = true;
        kit.sound.sfx('swish', { size: Math.min(1, v / 25) });
      }
    }
  }

  // Something comes flying out of the wind at (x, y, z), at `speed` m/s,
  // from upwind, and not quite straight at it.
  throwAt(x, y, z, speed) {
    const from = 22;
    const ux = Math.sin(this.dir);
    const uz = Math.cos(this.dir);
    const side = rand(-6, 6);
    const sx = x - ux * from + uz * side;
    const sz = z - uz * from - ux * side;
    const sy = Math.max(this.kit.ground(sx, sz) + 1.5, y + rand(0.5, 3));
    const t = from / speed;
    const kind = DEBRIS[Math.floor(Math.random() * DEBRIS.length)];
    this.flying.add({
      x: sx,
      y: sy,
      z: sz,
      vx: (x + rand(-2, 2) - sx) / t,
      vy: (y - sy) / t + 0.5 * 3.4 * t, // to fall back onto the mark by then
      vz: (z + rand(-2, 2) - sz) / t,
      size: kind.size,
      color: kind.color,
      life: 7,
      spin: rand(4, 12),
      gravity: 3.4,
      drag: 0.05,
    });
    this.flying.list[this.flying.list.length - 1].why = kind.why;
  }

  dispose() {
    this.rain.dispose();
    this.bolt.dispose();
    this.flying.dispose();
  }
}
