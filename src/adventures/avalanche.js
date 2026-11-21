// Avalanche: up on a mountainside, the slope above you lets go. A crack, a
// rumble, and a slide comes down the fall line straight at you, a wall of
// powder boiling up ahead of it and lumps of snow tumbling in it, faster and
// faster. You can't outrun it downhill: get across the slope, out of its
// path. Three times.
//
// If you're not on a steep enough slope when you start it, you're sent to
// the nearest one first.

import { Puffs, Flying } from './fx.js';
import { slopeAt, findSlope } from './places.js';
import { rand } from '../core/geom.js';
import { smoothstep } from '../noise.js';

const STEEP = 0.38; // rise over run the mountainside must have
const SLIDES = 3;
const FIRST = 6; // s before the first lets go
const BETWEEN = [22, 28]; // s between one and the next
const ABOVE = [110, 140]; // m up the fall line from you it lets go
const WARN = 1.6; // s between the crack and its moving
const WIDTH = [26, 38]; // m either side of its line, where it starts and where it ends
const LONG = 70; // m from its front back to its tail
const SPEED = { start: 7, most: 24, gain: 5 }; // m/s, and m/s it gains a second
const RUN_OUT = 260; // m below you it runs out
const SWEPT = { hurt: 48, down: 11, up: 4 }; // how much being caught hurts, and how it throws you
const OUT_OF_IT = 48; // m across the slope that's surely clear of it
const _p = {};

export const avalanche = {
  id: 'avalanche',
  title: 'Avalanche',
  blurb: 'High on a mountainside, the snow above you lets go, three times. You can’t outrun it down the hill: get across the slope, out of its path.',
  where(kit, from) {
    const off = (x0, z0, x1, z1) => !!kit.landforms.reaches(x0, z0, x1, z1);
    const s = findSlope(kit.ground, from.x, from.z, { steep: STEEP, step: 30, off });
    if (!s) return { none: 'no mountainside steep enough near here for an avalanche · try it in the mountains' };
    if (Math.hypot(s.x - from.x, s.z - from.z) < 20) return null;
    return { x: s.x, z: s.z, label: 'the mountainside', near: 22, objective: 'climb up onto the mountainside' };
  },
  start: (kit) => new Avalanche(kit),
};

class Avalanche {
  constructor(kit) {
    this.kit = kit;
    this.t = 0;
    this.next = FIRST;
    this.done = 0; // slides that have come down
    this.swept = 0; // ...and of those, ones that took you with them
    this.slide = null;
    this.puffs = new Puffs(kit.scene, 600);
    this.flying = new Flying(kit.scene, 220);
    kit.say('the snow above you is groaning · be ready to run', 3000);
  }

  objective() {
    if (this.slide && !this.slide.past) return 'AVALANCHE · get across the slope, out of its path';
    return `stay alive on the mountainside (${this.done} of ${SLIDES})`;
  }

  left() {
    return this.slide && !this.slide.past ? null : Math.max(0, this.next);
  }

  guide() {
    const s = this.slide;
    if (!s || s.past) return null;
    return { x: s.out.x, z: s.out.z, label: 'out of its path' };
  }

  note() {
    const s = this.slide;
    if (!s) return 'the next one could go any moment';
    if (s.past) return s.caught ? 'it took you down the hill · climb back up' : 'it went past you';
    return s.moving ? 'it is coming · run across, not down!' : 'a crack above you…';
  }

  update(dt) {
    const kit = this.kit;
    this.t += dt;
    if (!this.slide || this.slide.past) {
      this.next -= dt;
      if (this.next <= 0) {
        if (this.done >= SLIDES) return { won: this.swept ? `you came through all ${SLIDES}, battered` : `you got out of the way of all ${SLIDES}` };
        this.slide = this._release();
        if (!this.slide) {
          this.next = 4;
          kit.say('the slope above you is too gentle to slide · climb higher', 2600);
        }
      }
    }
    const s = this.slide;
    if (s && !s.past) this._move(s, dt);
    this.puffs.update(dt, kit.sky);
    this.flying.update(dt, kit.ground);
    return null;
  }

  // ── It lets go ────────────────────────────────────────────────────────────
  // Its line: up the fall line from you to where it lets go, then back down
  // through where you are and on down until it runs out.
  _release() {
    const kit = this.kit;
    const P = kit.player.pos;
    const up = [{ x: P.x, z: P.z }];
    const above = rand(ABOVE[0], ABOVE[1]);
    let x = P.x;
    let z = P.z;
    for (let d = 0; d < above; d += 5) {
      const s = slopeAt(kit.ground, x, z, 5);
      if (s.slope < 0.1) break;
      x -= s.ux * 5;
      z -= s.uz * 5;
      up.push({ x, z });
    }
    if (up.length < 10) return null;
    const line = up.reverse();
    x = P.x;
    z = P.z;
    for (let d = 0; d < RUN_OUT; d += 5) {
      const s = slopeAt(kit.ground, x, z, 5);
      if (s.slope < 0.05) break;
      x += s.ux * 5;
      z += s.uz * 5;
      line.push({ x, z });
    }
    // how far along it each point is
    let run = 0;
    line[0].d = 0;
    for (let i = 1; i < line.length; i++) {
      run += Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z);
      line[i].d = run;
    }
    // out of its path: across the slope from you, whichever side is nearer clear
    const at = up.length - 1;
    const a = line[Math.max(0, at - 1)];
    const b = line[Math.min(line.length - 1, at + 1)];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const side = Math.random() < 0.5 ? 1 : -1;
    const out = { x: P.x + ((b.z - a.z) / len) * OUT_OF_IT * side, z: P.z - ((b.x - a.x) / len) * OUT_OF_IT * side };
    kit.sound.sfx('crack');
    kit.sound.sfx('rumble', { size: 1 });
    kit.say('AVALANCHE · get across the slope!', 2600);
    return { line, front: 0, speed: SPEED.start, wait: WARN, moving: false, past: false, caught: false, out, total: run };
  }

  // Where along its line `d` is, and how wide it is there.
  _point(s, d, out = _p) {
    const L = s.line;
    let i = 1;
    while (i < L.length - 1 && L[i].d < d) i++;
    const a = L[i - 1];
    const b = L[i];
    const k = Math.max(0, Math.min(1, (d - a.d) / ((b.d - a.d) || 1)));
    out.x = a.x + (b.x - a.x) * k;
    out.z = a.z + (b.z - a.z) * k;
    out.ux = (b.x - a.x) / ((b.d - a.d) || 1);
    out.uz = (b.z - a.z) / ((b.d - a.d) || 1);
    out.w = WIDTH[0] + (WIDTH[1] - WIDTH[0]) * Math.min(1, d / s.total);
    return out;
  }

  _move(s, dt) {
    const kit = this.kit;
    if (!s.moving) {
      s.wait -= dt;
      if (s.wait <= 0) s.moving = true;
      return;
    }
    s.speed = Math.min(SPEED.most, s.speed + SPEED.gain * dt);
    s.front += s.speed * dt;
    const P = kit.player.pos;
    const near = smoothstep(220, 20, this._distTo(s, P));
    kit.air.wind = Math.max(kit.air.wind, near * 0.8);
    kit.air.roar = Math.max(kit.air.roar, near * 0.9);
    kit.look.haze = Math.max(kit.look.haze, 1 + near * 1.5);

    // the powder boiling up off its front, the snow tumbling in it
    const f = this._point(s, s.front, {});
    this.acc = (this.acc || 0) + dt * 60;
    while (this.acc >= 1) {
      this.acc -= 1;
      const across = rand(-1, 1) * f.w;
      const back = rand(0, 12);
      const x = f.x - f.uz * across - f.ux * back;
      const z = f.z + f.ux * across - f.uz * back;
      const g = kit.ground(x, z);
      this.puffs.add({ x, y: g + rand(0, 3), z, vx: f.ux * s.speed * 0.8 + rand(-2, 2), vy: rand(2, 6), vz: f.uz * s.speed * 0.8 + rand(-2, 2), size: rand(4, 9), grow: 2.2, life: rand(2.5, 4.5), alpha: 0.75, color: 0xf4f6fa, drag: 0.5 });
      if (Math.random() < 0.3) this.flying.add({ x, y: g + 1, z, vx: f.ux * s.speed + rand(-2, 2), vy: rand(1, 4), vz: f.uz * s.speed + rand(-2, 2), size: [rand(0.4, 1.1), rand(0.3, 0.8), rand(0.4, 1.1)], color: 0xe8ecf2, life: rand(2, 4), spin: rand(2, 6), drag: 0.3 });
    }

    // has it got you?
    if (!s.caught && !kit.player.space) {
      const me = this._onLine(s, P);
      if (me && me.across < me.w && me.d <= s.front && me.d > s.front - LONG) {
        s.caught = true;
        this.swept++;
        const p = this._point(s, me.d, {});
        kit.fling(p.ux * SWEPT.down, SWEPT.up, p.uz * SWEPT.down);
        kit.hurt(SWEPT.hurt, 'swept away by the avalanche');
      }
    }
    if (s.front - LONG > s.total) {
      s.past = true;
      this.done++;
      this.next = this.done >= SLIDES ? 3 : rand(BETWEEN[0], BETWEEN[1]);
      if (!s.caught && this.done < SLIDES) kit.say(`clear of it · ${SLIDES - this.done} more to come`, 2400);
    }
  }

  // Where you are to its line: how far along it the nearest point is, how
  // far across from it you are, and how wide it is there.
  _onLine(s, P) {
    let best = null;
    const L = s.line;
    for (let i = 0; i < L.length - 1; i++) {
      const a = L[i];
      const b = L[i + 1];
      const vx = b.x - a.x;
      const vz = b.z - a.z;
      const len2 = vx * vx + vz * vz || 1;
      const k = Math.max(0, Math.min(1, ((P.x - a.x) * vx + (P.z - a.z) * vz) / len2));
      const across = Math.hypot(P.x - (a.x + vx * k), P.z - (a.z + vz * k));
      if (!best || across < best.across) best = { across, d: a.d + (b.d - a.d) * k };
    }
    if (best) best.w = this._point(s, best.d, {}).w;
    return best;
  }

  _distTo(s, P) {
    const f = this._point(s, s.front, {});
    return Math.hypot(f.x - P.x, f.z - P.z);
  }

  dispose() {
    this.puffs.dispose();
    this.flying.dispose();
  }
}
