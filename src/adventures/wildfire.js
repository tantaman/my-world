// Wildfire: lightning has lit the forest upwind of you, and the wind is
// bringing the fire on through the trees. It's a long front, burning on the
// ground and up into the crowns, faster through thick woods and uphill,
// slower through meadows, and it can't burn across water. The air fills with
// smoke and the sky turns brown. Close to the flames the heat wears you
// down; in them, it's quick.
//
// Get into water deep enough to wade and let it go round you, or find a thin
// place and get through it onto the burnt ground behind, where there's
// nothing left to burn. Or keep ahead of it until the rain comes.
//
// The fire is a line of points across the wind, each with how far it has
// come; nothing burns for real, and when it's over the forest is as it was.

import * as THREE from 'three';
import { Flames, Puffs } from './fx.js';
import { findWater } from './places.js';
import { WIND } from '../fires/look.js';
import { SPECIES } from '../build/forestry.js';
import { TREE_KINDS } from '../world/flora.js';
import { rand, waterSample } from '../core/geom.js';
import { smoothstep, hash2i } from '../noise.js';

// 0..1, the same every time for (i, j)
const h01 = (i, j, seed) => hash2i(i, j, seed) / 4294967296;

const UPWIND = [95, 120]; // m upwind of you it starts
const HALF = 170; // m either side the front reaches
const STEP = 3; // m between its points
const DEEP = 12; // m of burning behind the front
const SPEED = { base: 0.9, fuel: 1.5, up: 2.5, most: 3.6, ramp: 25 }; // m/s, and s to get going
const ROUND = 1.6; // m/s it creeps round the ends of what it can't burn
const WET = 0.12; // m of water stops it
const HEAT = { reach: 7, wear: 2.6 }; // m from the flames the heat gets at you, and how much a second at the edge of them
const IN_IT = 26; // health a second, in the flames
const SCORCH = 0.3; // s between the burns you take in them
const SMOKE = { ahead: 40, wear: 0.5 }; // m ahead of it the smoke is thick, and how much it wears a second
const WADE = 0.55; // m deep: water that keeps the heat off
const WAIT = 18; // s in the water with the fire near, to have waited it out
const LASTS = 170; // s until the rain comes
const TREES_EVERY = 0.5; // s between looks for the trees burning near you
const NEAR = 130; // m from you that flames are drawn
const _w = waterSample();
const SMOKY = new THREE.Color(0.55, 0.22, 0.07); // the sky through the smoke

export const wildfire = {
  id: 'wildfire',
  title: 'Wildfire',
  blurb: 'Lightning has lit the forest upwind, and the wind is bringing the fire your way. Get into water and let it go round you, or get through it onto burnt ground.',
  start: (kit, { from }) => new Wildfire(kit, from),
};

class Wildfire {
  constructor(kit, from) {
    this.kit = kit;
    this.t = 0;
    // along: the way the wind blows (and the fire goes); across: square to it
    this.ax = WIND.x;
    this.az = WIND.y;
    this.cx = -WIND.y;
    this.cz = WIND.x;
    const back = rand(UPWIND[0], UPWIND[1]);
    this.ox = from.x - this.ax * back;
    this.oz = from.z - this.az * back;
    this.n = Math.round((HALF * 2) / STEP) + 1;
    this.front = new Float32Array(this.n);
    this.lit = new Uint8Array(this.n);
    const seed = (Math.random() * 1e6) | 0;
    for (let i = 0; i < this.n; i++) this.front[i] = 8 * Math.sin(i * 0.21 + seed) + 5 * Math.sin(i * 0.53 + seed * 0.3) + rand(0, 3);
    this.seed = seed;
    this.flames = new Flames(kit.scene, 640);
    this.puffs = new Puffs(kit.scene, 520);
    this.trees = [];
    this.treesIn = 0;
    this.water = null;
    this.waterIn = 0;
    this.waited = 0;
    this.where = { i: 0, along: 0, ahead: Infinity, inIt: false, wet: false };
    kit.say('fire in the forest upwind · get to water', 3200);
    kit.sound.sfx('thunder', { size: 0.4 });
  }

  // Where point i of the front is, `back` metres behind it.
  _at(i, back = 0, out = {}) {
    const s = -HALF + i * STEP;
    const a = this.front[i] - back;
    out.x = this.ox + this.ax * a + this.cx * s;
    out.z = this.oz + this.az * a + this.cz * s;
    return out;
  }

  _wet(x, z) {
    return this.kit.chunks.waterAt(x, z, _w) && _w.depth > WET;
  }

  objective() {
    return this.water ? 'get into the water and let it go round you' : 'keep ahead of it, or get through it';
  }

  left() {
    return LASTS - this.t;
  }

  guide() {
    if (this.where.wet) return null;
    return this.water ? { x: this.water.x, z: this.water.z, label: 'water' } : null;
  }

  note() {
    const w = this.where;
    if (w.inIt) return "you're in the flames · get out!";
    if (w.wet && w.ahead < 60) return `in the water · wait it out (${Math.max(0, Math.ceil(WAIT - this.waited))} s)`;
    if (w.wet) return 'in the water · let it come';
    if (w.ahead < HEAT.reach) return 'the heat is terrible · get away from it';
    if (w.ahead < SMOKE.ahead) return 'choking smoke';
    if (!this.water) return 'no water near enough · keep ahead of it';
    return '';
  }

  update(dt) {
    const kit = this.kit;
    this.t += dt;
    const P = kit.player.pos;
    const gen = kit.gen;

    // ── It spreads ──────────────────────────────────────────────────────────
    const go = smoothstep(0, SPEED.ramp, this.t);
    const raining = smoothstep(LASTS - 20, LASTS, this.t);
    const p = {};
    const q = {};
    for (let i = 0; i < this.n; i++) {
      this._at(i, 0, p);
      this._at(i, -3, q);
      const wet = this._wet(q.x, q.z);
      this.lit[i] = wet || this._wet(p.x, p.z) ? 0 : 1;
      if (wet) continue;
      const fuel = Math.max(0, Math.min(1, gen.forest(p.x, p.z)));
      const rise = (kit.ground(q.x, q.z) - kit.ground(p.x, p.z)) / 3;
      const v = (SPEED.base + SPEED.fuel * fuel) * (1 + Math.max(-0.5, Math.min(1.5, rise * SPEED.up)));
      this.front[i] += Math.min(SPEED.most, v) * go * (1 - raining) * dt;
    }
    // ...and creeps round the ends of what it couldn't burn
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < this.n - 1; i++) {
        const want = Math.max(this.front[i - 1], this.front[i + 1]) - STEP * 1.2;
        if (want > this.front[i]) this.front[i] = Math.min(want, this.front[i] + ROUND * dt);
      }
    }

    // ── Where you are to it ─────────────────────────────────────────────────
    const along = (P.x - this.ox) * this.ax + (P.z - this.oz) * this.az;
    const across = (P.x - this.ox) * this.cx + (P.z - this.oz) * this.cz;
    const i = Math.max(0, Math.min(this.n - 1, Math.round((across + HALF) / STEP)));
    const w = this.where;
    w.i = i;
    w.wet = kit.chunks.waterAt(P.x, P.z, _w) && _w.depth > WADE;
    // the nearest burning point of the front to you, and how far ahead of it you are
    let ahead = Infinity;
    for (let j = Math.max(0, i - 4); j <= Math.min(this.n - 1, i + 4); j++) {
      if (!this.lit[j]) continue;
      const lateral = Math.abs(-HALF + j * STEP - across);
      const fwd = along - this.front[j];
      const d = fwd > 0 ? Math.hypot(fwd, lateral) : fwd > -DEEP ? lateral : Infinity;
      ahead = Math.min(ahead, d);
    }
    w.ahead = ahead;
    w.inIt = !w.wet && this.lit[i] && along <= this.front[i] + 1 && along > this.front[i] - DEEP && Math.abs(-HALF + i * STEP - across) < STEP;
    const out = Math.abs(across) > HALF;
    const fade = 1 - raining;

    // ── What it does to you ─────────────────────────────────────────────────
    if (!out && fade > 0.2) {
      this.scorch = (this.scorch || 0) - dt;
      if (w.inIt) {
        if (this.scorch <= 0) {
          this.scorch = SCORCH;
          kit.hurt(IN_IT * SCORCH, 'caught in the fire');
        }
      } else if (ahead < HEAT.reach) kit.wear(HEAT.wear * (1 - ahead / HEAT.reach) * (w.wet ? 0.3 : 1) * dt * 2, 'overcome by the heat');
      else if (along > this.front[i] && along - this.front[i] < SMOKE.ahead && !w.wet) kit.wear(SMOKE.wear * dt, 'overcome by the smoke');
    }

    // ── The sky, the air ────────────────────────────────────────────────────
    const near = out ? 0 : 1 - smoothstep(10, 160, Math.max(0, along - this.front[i]));
    const behind = along < this.front[i] - DEEP;
    const L = kit.look;
    L.gloom = Math.max(L.gloom, (0.35 + 0.5 * near) * fade);
    L.gloomColor = SMOKY;
    L.overcast = Math.max(L.overcast, (0.35 + 0.4 * near) * fade);
    L.haze = Math.max(L.haze, 1 + (1.2 + 2 * near) * fade);
    kit.air.fire = Math.max(kit.air.fire, (behind ? 0.25 : 0.15 + 0.85 * near) * fade);
    kit.air.wind = Math.max(kit.air.wind, 0.3);
    kit.air.rain = Math.max(kit.air.rain, raining);

    this._look(dt, P, fade);

    // ── How it ends ─────────────────────────────────────────────────────────
    this.waterIn -= dt;
    if (this.waterIn <= 0) {
      this.waterIn = 5;
      this.water = findWater((x, z) => (kit.chunks.waterAt(x, z, _w) ? _w.depth : -Infinity), P.x, P.z, { far: 480, deep: WADE + 0.1, step: 10 });
    }
    if (w.wet && ahead < 60) this.waited += dt;
    if (this.waited >= WAIT) return { won: 'you waited it out in the water while it burned past' };
    if (!out && along < this.front[i] - DEEP - 4 && this.t > 10) return { won: 'you got through it onto the burnt ground behind' };
    if (this.t >= LASTS) return { won: 'the rain came, and put the fire out' };
    return null;
  }

  // ── What it looks like ────────────────────────────────────────────────────
  _look(dt, P, fade) {
    const kit = this.kit;
    const f = this.flames;
    const p = {};
    f.from(P.x, P.z);
    let k = 0;
    // flames along the front, and back through the burning
    for (let i = 0; i < this.n; i++) {
      if (!this.lit[i]) continue;
      this._at(i, 0, p);
      if (Math.hypot(p.x - P.x, p.z - P.z) > NEAR + DEEP) continue;
      for (let j = 0; j < 4; j++) {
        const h = h01(i, j, this.seed);
        const back = j === 0 ? h * 1.5 : h * DEEP;
        const side = (h01(j, i, this.seed + 1) - 0.5) * STEP;
        this._at(i, back, p);
        const x = p.x + this.cx * side;
        const z = p.z + this.cz * side;
        if (this._wet(x, z)) continue;
        const tall = (j === 0 ? 2.2 : 1.2) + h * 1.6;
        f.set(k++, x, kit.ground(x, z) - 0.1, z, tall * fade, i * 1.7 + j, j === 0 ? 0.8 : 0.4);
      }
    }
    // the trees in the burning go up like torches
    this.treesIn -= dt;
    if (this.treesIn <= 0) {
      this.treesIn = TREES_EVERY;
      this._findTrees(P);
    }
    for (const tr of this.trees) {
      f.set(k++, tr.x, tr.y + tr.h * 0.2, tr.z, tr.h * 0.85 * fade, tr.seed, 0.6);
      if (k >= f.max) break;
    }
    f.count = k;
    f.update();

    // smoke boiling up off the front, dark and thick, drifting downwind
    this.smokeAcc = (this.smokeAcc || 0) + dt * 28 * fade;
    while (this.smokeAcc >= 1) {
      this.smokeAcc -= 1;
      const near = Math.random() < 0.7;
      const i = near ? Math.max(0, Math.min(this.n - 1, this.where.i + Math.round(rand(-30, 30)))) : Math.floor(Math.random() * this.n);
      if (!this.lit[i]) continue;
      this._at(i, rand(0, DEEP), p);
      const g = kit.ground(p.x, p.z);
      this.puffs.add({ x: p.x, y: g + rand(2, 8), z: p.z, vx: this.ax * rand(1, 3), vy: rand(1.5, 3), vz: this.az * rand(1, 3), size: rand(3, 6), grow: 1.4, life: rand(6, 10), alpha: 0.6, color: 0x2a2622, warm: 0.5, drag: 0.1, rise: 0.15 });
    }
    // and embers carried ahead of it
    this.emberAcc = (this.emberAcc || 0) + dt * 10 * fade;
    while (this.emberAcc >= 1) {
      this.emberAcc -= 1;
      const i = Math.max(0, Math.min(this.n - 1, this.where.i + Math.round(rand(-15, 15))));
      if (!this.lit[i]) continue;
      this._at(i, 0, p);
      this.puffs.add({ x: p.x, y: kit.ground(p.x, p.z) + rand(1, 6), z: p.z, vx: this.ax * rand(3, 7), vy: rand(0.5, 2), vz: this.az * rand(3, 7), size: 0.15, grow: 0, life: rand(2, 4), alpha: 1, color: 0x000000, warm: 3, drag: 0.2 });
    }
    this.puffs.update(dt, kit.sky);
  }

  // The trees standing in the burning, near you: they go up as it reaches them.
  _findTrees(P) {
    const kit = this.kit;
    const seen = new Set();
    this.trees.length = 0;
    const p = {};
    for (let i = 0; i < this.n; i += 2) {
      if (!this.lit[i]) continue;
      this._at(i, DEEP / 2, p);
      if (Math.hypot(p.x - P.x, p.z - P.z) > NEAR) continue;
      kit.chunks.forEachPlant(p.x, p.z, DEEP / 2 + STEP, TREE_KINDS, (ch, kind, k, x, y, z, s) => {
        const key = `${Math.round(x * 10)},${Math.round(z * 10)}`;
        if (seen.has(key) || this.trees.length >= 260) return;
        // only those the front has reached
        const along = (x - this.ox) * this.ax + (z - this.oz) * this.az;
        const across = (x - this.ox) * this.cx + (z - this.oz) * this.cz;
        const j = Math.max(0, Math.min(this.n - 1, Math.round((across + HALF) / STEP)));
        if (along > this.front[j] || along < this.front[j] - DEEP * 1.6) return;
        seen.add(key);
        this.trees.push({ x, y, z, h: (SPECIES[kind] ? SPECIES[kind].h : 10) * s, seed: x * 0.37 + z * 0.11 });
      });
    }
  }

  dispose() {
    this.flames.dispose();
    this.puffs.dispose();
  }
}
