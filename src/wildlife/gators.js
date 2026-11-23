// The American alligator: a low, broad, armoured body on four short splayed
// legs, a long tail flattened side to side for swimming, and a broad rounded
// snout with the eyes and nostrils raised on top, so that lying in the water
// it shows nothing but those and the ridges of its back.
//
// One skinned mesh, like every animal (rig.js): a chain of spine bones from
// the neck to the tip of the tail, the head on the first and its lower jaw
// hinged under it, four legs. A young one is black with bright yellow bands
// across it; an old one is nearly black all over, its bands only a shade
// paler.
//
// How one behaves (class Gator): it basks on the bank, mouth open, or lies in
// the water, drifting; notices you and lifts its head; comes too close and it
// slides off the bank into the water, or sinks out of sight if it's in it
// already, and that's the last you see of it. Corner one on land and it
// hisses. In the spring a bull bellows. One that is `calm` (spot.calm: used
// to the tour boats, which have been coming by all its life) lets you come
// much closer before it goes.
//
// A gator is put somewhere by the spot it's handed: as the forest hands any
// animal a spot (out of sight, on dry ground), it looks round that for water
// and goes to its edge, to bask on the bank above it or lie out in it (with
// none near, it lies where it was put, and walks off when it goes); or
// the spot says exactly where and how, { x, z, yaw, pose: 'bask' | 'float',
// length, calm }, which is how a swamp tour has one waiting where it's
// going to be pointed out.

import * as THREE from 'three';
import { RigBuilder, lin, at, along, ellipsoid, cone } from '../render/rig.js';
import { spineBones } from './crawlers.js';
import { clamp, lerp } from '../noise.js';
import { rand, wrapAngle as wrap } from '../core/geom.js';

const ss = THREE.MathUtils.smoothstep;
const mix = (a, b, t) => new THREE.Color().copy(a).lerp(b, t);

// How long one grows (m, snout to tail): the least, and the most.
export const GATOR_LENGTH = [1.2, 3.9];
// Shorter than this it is young, and banded bright yellow; longer than BULL,
// a big old bull.
const YOUNG = 1.75;
const BULL = 3.2;
// How it gets about (m/s): swimming slowly, and fleeing, in the water or
// sliding down the bank into it; and how fast it sinks out of sight.
const SPEED = { drift: 0.06, swim: 0.55, flee: 2.4, sink: 0.25 };
// Where it looks for water from the spot it's handed (m), and how deep that
// has to be for it to lie in (m).
const WATER_REACH = 40;
const FLOAT_DEPTH = 0.5;
// Closer than this (m), on land, and it hisses at you.
const HISS = 3;
// How often (s) a bull lying in the water bellows, on average, in the spring.
const BELLOW_EVERY = 70;
// A calm one (the tour's) goes only when you're this close (m), whatever its
// kind says.
const CALM_FLEE = 2.2;

// ── The body ───────────────────────────────────────────────────────────────
// Everything in fractions of its length L. The spine runs from the back of
// the skull (z = 0) to the tip of the tail (z = -SPINE·L); the head is in
// front of it.
const SPINE = 0.85;
const BONES = 12;
// half its width along the spine, t = 0 at the neck, 1 at the tail's tip:
// a short neck, a broad belly, hips, then the long taper of the tail
function halfWidth(t) {
  if (t < 0.12) return lerp(0.045, 0.066, ss(t, 0, 0.12));
  if (t < 0.26) return lerp(0.066, 0.08, ss(t, 0.12, 0.26));
  if (t < 0.4) return lerp(0.08, 0.058, ss(t, 0.26, 0.4));
  return lerp(0.058, 0.004, Math.pow((t - 0.4) / 0.6, 0.85));
}
// how tall it is for how wide: flat as a board through the body, the tail
// flattened the other way, taller than it is wide
const flatness = (t) => lerp(0.52, 1.35, ss(t, 0.33, 0.62));
// where the shoulders and hips are along the spine
const SHOULDER = 0.12;
const HIP = 0.36;

export function buildGator(seed, L) {
  const r = new RigBuilder(seed);
  r.grain = 0.22;
  const rng = r.rng;
  const young = L < YOUNG;
  const seg = (SPINE * L) / (BONES - 1);
  const spine = spineBones(r, BONES, seg, 0);
  const head = r.bone(spine[0], 0, 0, 0, 'head');
  const jaw = r.bone(head, 0, -0.012 * L, 0.01 * L, 'jaw');

  // its colours: the young bright-banded, the old dark all over
  const dark = lin(young ? 0x15150f : 0x1d1d17);
  const band = young ? lin(0xc9a95a) : lin(0x3b3829);
  const belly = lin(0xd6ccad);
  const bandAt = (t) => {
    // crossbands, closer together down the tail
    const k = t < 0.4 ? t * 15 : 6 + (t - 0.4) * 26;
    const f = k - Math.floor(k);
    return f < (young ? 0.32 : 0.26) && t > 0.08;
  };
  const skin = (t, a, p) => {
    const aa = Math.abs(a);
    if (aa > 2.25) return belly;
    // the yellow runs down the flanks in spots on the body, in bands on the tail
    if (bandAt(t)) {
      if (t > 0.4 || aa > 0.9) return band;
      return ((Math.floor(p.x * 40 / L) + Math.floor(p.z * 30 / L)) & 1) === 0 ? band : dark;
    }
    if (young && aa > 1.6 && ((Math.floor(p.z * 55 / L) & 1) === 0)) return band;
    return dark;
  };

  // the body and tail, one tube skinned along the spine
  const len = SPINE * L;
  const g = new THREE.CylinderGeometry(1, 1, len, 14, (BONES - 1) * 3, true);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -len / 2);
  const weights = (w) => {
    const f = clamp(-w.z / seg, 0, BONES - 1 - 1e-4);
    const i = Math.floor(f);
    return [spine[i], 1 - (f - i), spine[i + 1], f - i];
  };
  r.part(spine[0], g, {
    deform: (p) => {
      const t = clamp(-p.z / len, 0, 1);
      const w = halfWidth(t) * L;
      p.x *= w;
      // the back a little flatter than the belly is round
      p.y *= w * flatness(t) * (p.y > 0 ? 0.92 : 1.05);
    },
    color: (p, n, w) => skin(clamp(-w.z / len, 0, 1), Math.atan2(n.x, n.y), w),
    weights,
  });
  // the tip of the tail, closed
  r.part(spine[BONES - 1], ellipsoid(0.005 * L, 0.006 * L, 0.012 * L, 5, 3), { color: dark });

  // Armour: rows of raised scutes down the back, six across the body, two
  // down the base of the tail joining into one crest of upright plates.
  const scute = (x, z, s, tall) => {
    const t = clamp(-z / len, 0, 1);
    const top = halfWidth(t) * L * flatness(t) * 0.92 * Math.sqrt(Math.max(0, 1 - (x / (halfWidth(t) * L)) ** 2));
    r.part(spine[0], ellipsoid(s * (tall ? 0.45 : 1), s * (tall ? 1.6 : 0.7), s * 1.2, 5, 3), {
      matrix: at(x, top + s * (tall ? 0.8 : 0.2), z),
      color: (p) => (p.y > 0 && young && bandAt(t) ? band : dark),
      weights,
    });
  };
  for (let z = -0.04 * L; z > -0.36 * L; z -= 0.024 * L) {
    const t = -z / len;
    const w = halfWidth(t) * L;
    for (const k of [0.18, 0.45, 0.72]) for (const side of [1, -1]) scute(side * k * w, z + (k > 0.5 ? 0.008 * L : 0), 0.011 * L * (1 - k * 0.3), false);
  }
  for (let z = -0.36 * L; z > -0.95 * len; z -= 0.022 * L) {
    const t = -z / len;
    const w = halfWidth(t) * L;
    const s = Math.max(0.004, 0.011 * (1 - t * 0.7)) * L;
    if (t < 0.62) for (const side of [1, -1]) scute(side * w * 0.5, z, s, true);
    else scute(0, z, s, true);
  }

  // The head: a skull, the broad, rounded snout in front of it, the eyes
  // raised on top behind the snout, the nostrils on a knob at its tip, and
  // the upper teeth showing down the sides even with the mouth shut.
  const snoutColor = (p, n) => (n.y < -0.4 ? belly : dark);
  r.part(head, ellipsoid(0.05 * L, 0.03 * L, 0.05 * L, 10, 6), { matrix: at(0, 0.004 * L, 0.02 * L), color: snoutColor });
  r.part(head, ellipsoid(0.04 * L, 0.018 * L, 0.075 * L, 12, 6), {
    // broad all the way down to a rounded tip: a U, not a V
    deform: (p) => {
      p.x *= 1 - Math.max(0, p.z) * 0.18;
    },
    matrix: at(0, -0.002 * L, 0.095 * L),
    color: snoutColor,
  });
  r.part(head, ellipsoid(0.012 * L, 0.008 * L, 0.01 * L, 6, 4), { matrix: at(0, 0.014 * L, 0.162 * L), color: dark });
  r.mirror((side) => [head, ellipsoid(0.0035 * L, 0.003 * L, 0.003 * L, 4, 3), { matrix: at(side * 0.005 * L, 0.02 * L, 0.168 * L), color: lin(0x050504), grain: 0 }]);
  r.mirror((side) => [head, ellipsoid(0.014 * L, 0.013 * L, 0.018 * L, 7, 5), { matrix: at(side * 0.021 * L, 0.024 * L, 0.03 * L), color: dark }]);
  // the eyes: green-gold, slit-pupilled, looking out and up
  const eye = lin(0x8f8a3a);
  r.mirror((side) => [head, ellipsoid(0.0075 * L, 0.0065 * L, 0.0085 * L, 7, 5), { matrix: at(side * 0.027 * L, 0.031 * L, 0.034 * L), color: (p) => (Math.abs(p.z) < 0.12 && p.x * side > 0.3 ? lin(0x070605) : eye), grain: 0 }]);
  for (let k = 0; k < 9; k++) {
    const z = (0.04 + k * 0.016) * L;
    const x = (0.039 - k * 0.0012) * L;
    const s = (0.0028 + (k === 3 ? 0.0015 : 0)) * L;
    r.mirror((side) => [head, cone(s, s * 2.6, 4), { matrix: at(side * x, -0.008 * L, z, Math.PI), color: lin(0xd8d2b8), grain: 0.05 }]);
  }
  // the lower jaw, hinged at the back of the skull, pale underneath
  r.part(jaw, ellipsoid(0.042 * L, 0.011 * L, 0.078 * L, 10, 5), {
    deform: (p) => {
      p.x *= 1 - Math.max(0, p.z) * 0.2;
    },
    matrix: at(0, -0.004 * L, 0.075 * L),
    color: (p, n) => (n.y < 0 ? belly : lin(0xc9a690)),
  });

  // Legs: short and splayed out sideways, the elbows and knees out and the
  // feet flat down under them. Five short fingers in front, four long webbed
  // toes behind, with claws.
  const legs = [];
  for (const [t, front] of [[SHOULDER, true], [HIP, false]]) {
    const z = -t * len;
    const i = Math.round(t * (BONES - 1));
    const w = halfWidth(t) * L;
    const up = (front ? 0.05 : 0.064) * L;
    const down = (front ? 0.05 : 0.06) * L;
    for (const side of [1, -1]) {
      const hip = r.bone(spine[i], side * w * 0.8, -0.01 * L, z + i * seg, 'leg');
      const thigh = (front ? 0.017 : 0.024) * L;
      r.part(hip, ellipsoid(up * 0.6, thigh, thigh * 1.1, 7, 5), { matrix: at(side * up * 0.5, -0.004 * L, 0), color: (p, n) => (n.y < -0.5 ? mix(dark, belly, 0.35) : dark) });
      const knee = [side * up, -0.012 * L, front ? 0 : -0.01 * L];
      const foot = [side * (up + 0.01 * L), -down, front ? 0.012 * L : -0.004 * L];
      r.part(hip, ellipsoid(thigh * 0.7, down * 0.55, thigh * 0.75, 6, 4), { matrix: at((knee[0] + foot[0]) / 2, (knee[1] + foot[1]) / 2, (knee[2] + foot[2]) / 2), color: dark });
      const toes = front ? 5 : 4;
      for (let k = 0; k < toes; k++) {
        const a = (k / (toes - 1) - 0.5) * (front ? 1.6 : 1.1) + side * (front ? 0.35 : 0.2);
        const tl = (front ? 0.018 : 0.03) * L * (1 - Math.abs(k / (toes - 1) - 0.4) * 0.5);
        const dx = Math.sin(a) * tl;
        const dz = Math.cos(a) * tl;
        r.part(hip, ellipsoid(0.0035 * L, 0.0025 * L, tl * 0.55, 4, 3), { matrix: at(foot[0] + dx * 0.5, foot[1] + 0.002 * L, foot[2] + dz * 0.5, 0, a), color: dark });
        r.part(hip, cone(0.0016 * L, 0.006 * L, 3), { matrix: along(foot[0] + dx, foot[1] + 0.002 * L, foot[2] + dz, Math.sin(a), -0.3, Math.cos(a), 1, 1), color: lin(0x2a2620), grain: 0 });
      }
      if (!front) r.part(hip, ellipsoid(0.02 * L, 0.0015 * L, 0.016 * L, 5, 3), { matrix: at(foot[0] + side * 0.002 * L, foot[1] + 0.002 * L, foot[2] + 0.014 * L), color: dark });
      legs.push({ bone: hip, side, front });
    }
  }

  const mesh = r.build({ shadow: true });
  // the spine's height over flat ground, lying on its belly; and how high
  // its eyes stand over the spine, lying level
  const rest = halfWidth(0.26) * flatness(0.26) * 1.02 * L;
  const eyes = 0.038 * L;
  return { mesh, spine, head, jaw, legs, seg, len, L, rest, eyes, young };
}

// ── How one behaves ─────────────────────────────────────────────────────────
const _w = { level: 0, depth: 0 };
const water = (ctx, x, z) => {
  const w = ctx.water ? ctx.water(x, z) : null;
  if (!w) return null;
  _w.level = w.level;
  _w.depth = w.depth;
  return _w;
};

// Water by (x, z), as a gator wants it: going out from there, the first
// place deep enough to lie in, and the last dry ground before it.
// → { bank: { x, z }, deep: { x, z, level }, yaw (from the bank to the
//   water) } or null
export function waterNear(ctx, x, z, reach = WATER_REACH) {
  let best = null;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + 0.2;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    let dry = null;
    for (let d = 0; d <= reach; d += 1) {
      const px = x + dx * d;
      const pz = z + dz * d;
      const w = water(ctx, px, pz);
      if (!w || w.depth < 0) {
        dry = { x: px, z: pz };
        continue;
      }
      if (w.depth < FLOAT_DEPTH) continue;
      if (dry && (!best || d < best.d)) best = { d, bank: dry, deep: { x: px, z: pz, level: w.level }, yaw: a };
      break;
    }
  }
  return best;
}

export class Gator {
  // spot: where the forest put it, or where and how a tour wants one
  // (see the top of this file)
  constructor(sp, spot, ctx, toward = 0) {
    this.sp = sp;
    this.kind = sp.kind;
    const L = spot.length ?? GATOR_LENGTH[0] + Math.random() ** 1.6 * (GATOR_LENGTH[1] - GATOR_LENGTH[0]);
    this.rig = buildGator((Math.random() * 1e9) | 0, L);
    this.L = L;
    this.label = L > BULL ? 'a big bull alligator' : L < YOUNG ? 'a young alligator' : 'an American alligator';
    this.mesh = this.rig.mesh;
    this.meshes = [this.mesh];
    this.calm = !!spot.calm;
    this.done = false;
    this.leaving = false;
    this.t = 0;
    this.speed = 0;
    this.phase = Math.random() * 6;
    this.gape = 0; // 0..1 how far its mouth is open
    this.lift = 0; // 0..1 how far its head is up
    this.bend = 0; // how far it's turning (radians along the body)
    this.nextHiss = 0;
    this.nextBellow = rand(10, BELLOW_EVERY);
    this.life = spot.life ?? rand(120, 300);
    this.away = null; // where it's going: from whoever scared it
    if (spot.pose) {
      this.x = spot.x;
      this.z = spot.z;
      this.yaw = spot.yaw ?? toward;
      this.set(spot.pose);
    } else {
      // round where it was put, the water: on the bank, or out in it
      const w = waterNear(ctx, spot.x, spot.z);
      if (!w) {
        // no water near: out on dry ground between one pond and the next,
        // lying where it was put
        this.x = spot.x;
        this.z = spot.z;
        this.yaw = toward + rand(-1, 1);
        this.set('bask');
      } else if (Math.random() < 0.55) {
        // on the bank, head to the water, its snout just short of it
        this.yaw = w.yaw;
        this.x = w.bank.x - Math.sin(w.yaw) * L * 0.25;
        this.z = w.bank.z - Math.cos(w.yaw) * L * 0.25;
        this.set('bask');
      } else {
        this.yaw = w.yaw + rand(-1.2, 1.2);
        this.x = w.deep.x + Math.sin(w.yaw) * 1.5;
        this.z = w.deep.z + Math.cos(w.yaw) * 1.5;
        this.set('float');
      }
    }
    this.y = ctx.ground(this.x, this.z);
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.yaw;
    this.mesh.visible = !this.done;
  }

  set(state, dur = 0) {
    this.state = state;
    this.t = 0;
    this.dur = dur;
  }

  // a sudden loud noise: it goes, as it would for you up close
  startle(x, z) {
    if (this.calm || this.state === 'sink' || this.state === 'gone') return;
    this.away = { x, z };
    this.set(this.state === 'bask' ? 'slide' : 'sink');
  }

  update(ctx) {
    const dt = ctx.dt;
    if (this.state === 'gone') {
      this.done = true;
      return;
    }
    this.t += dt;
    this.life -= dt;
    const P = ctx.nearest(this.x, this.z);
    const flee = this.calm ? CALM_FLEE : this.sp.flee;
    const notice = this.calm ? this.sp.notice * 0.5 : this.sp.notice;
    const here = water(ctx, this.x, this.z);
    const wet = here && here.depth > this.rig.rest * 0.8;
    let want = 0;
    let lift = P.d < notice ? 0.6 : 0;
    let gape = 0;
    let wave = 0; // how hard its tail sweeps
    switch (this.state) {
      case 'bask':
        // mouth open to the air, now and then shut for a while
        gape = P.d < notice ? 0 : Math.sin(this.t * 0.07 + this.phase) > -0.3 ? 0.55 : 0;
        if (P.d < HISS && !this.calm && ctx.time > this.nextHiss) {
          this.nextHiss = ctx.time + 6;
          this.hissing = 1.6;
          ctx.call('hiss', this.x, this.y + 0.2, this.z, { size: this.L / 3 });
        }
        if (P.d < flee || this.life < 0) {
          this.away = P.d < flee ? { x: P.x, z: P.z } : null;
          this.set('slide');
        }
        break;
      case 'slide':
        // off the bank head first, the way it was facing, fast
        want = SPEED.flee;
        wave = 1;
        lift = 0;
        if (wet) this.set('swim', rand(1.5, 3));
        else if (this.t > 4) this.set('away');
        break;
      case 'away':
        // no water to go to: off on foot, high on its legs, and gone
        want = SPEED.swim;
        wave = 0.5;
        this.leaving = true;
        if (wet) this.set('sink');
        break;
      case 'float':
        want = SPEED.drift;
        this.yaw += Math.sin(this.t * 0.05 + this.phase) * 0.04 * dt;
        if (P.d < flee * (this.calm ? 1 : 0.7) || this.life < 0) {
          this.away = { x: P.x, z: P.z };
          this.set('sink');
        } else if (this.t > 25 && Math.random() < dt / 30 && !this.calm) this.set('swim', rand(5, 12));
        if (this.L > 2.6 && ctx.time > this.nextBellow) {
          this.nextBellow = ctx.time + rand(0.5, 1.5) * BELLOW_EVERY;
          ctx.call('bellow', this.x, this.y, this.z, { size: this.L / 3.5 });
          this.lift = 1;
        }
        break;
      case 'swim':
        want = this.away ? SPEED.flee * 0.6 : SPEED.swim;
        wave = 0.7;
        if (this.t > this.dur) this.set(this.away ? 'sink' : 'float');
        break;
      case 'sink':
        want = this.away ? SPEED.swim : 0;
        wave = 0.4;
        this.leaving = true;
        if (this.t > 5) this.done = true;
        break;
    }
    // away from whoever it's going from, keeping to water deep enough
    if (this.away && want > 0.2) {
      const a = Math.atan2(this.x - this.away.x, this.z - this.away.z);
      this.yaw += wrap(a - this.yaw) * Math.min(1, dt * (this.state === 'slide' ? 0.6 : 1.2));
    }
    if (want > 0 && (this.state === 'swim' || this.state === 'float')) {
      const ax = this.x + Math.sin(this.yaw) * this.L * 0.8;
      const az = this.z + Math.cos(this.yaw) * this.L * 0.8;
      const ahead = water(ctx, ax, az);
      if (!ahead || ahead.depth < FLOAT_DEPTH * 0.8) {
        this.yaw += dt * 1.2;
        want *= 0.3;
      }
    }
    const was = this.yaw;
    this.speed += (want - this.speed) * Math.min(1, dt * 1.5);
    this.x += Math.sin(this.yaw) * this.speed * dt;
    this.z += Math.cos(this.yaw) * this.speed * dt;
    if (this.hissing > 0) {
      this.hissing -= dt;
      gape = 1;
      lift = 1;
    }
    const k = 1 - Math.exp(-dt * 3);
    this.gape += (gape - this.gape) * k;
    this.lift += (lift - this.lift) * k;
    this.bend += (clamp(wrap(this.yaw - was) / Math.max(dt, 1e-3), -1, 1) * 0.5 - this.bend) * k;
    this.phase += dt * (0.6 + this.speed * 2.4);
    this.pose(ctx, wet ? here.level : null, wave * clamp(this.speed * 2, 0.25, 1));
  }

  // Lay it out: lying on the ground along its slope, or level in the water
  // with its eyes at the surface (and under it, sinking); its spine bent
  // into the sweep of its tail and the turn it's making; legs walking, or
  // folded back to swim.
  pose(ctx, level, wave) {
    const rig = this.rig;
    const m = this.mesh;
    const sinking = this.state === 'sink' ? Math.min(1, this.t / 4) : 0;
    const afloat = level !== null && this.state !== 'bask';
    const ground = ctx.ground(this.x, this.z);
    const target = afloat ? Math.max(ground + rig.rest * 0.4, level - rig.eyes + 0.012 * this.L - sinking * this.L * 0.25) : ground + rig.rest;
    this.y = this.y === undefined ? target : lerp(this.y, target, 1 - Math.exp(-ctx.dt * 4));
    m.position.set(this.x, this.y, this.z);
    m.rotation.y = this.yaw;
    const n = rig.spine.length;
    let px = this.x;
    let pz = this.z;
    let py = this.y;
    let yaw = this.yaw;
    let prevPitch = 0;
    for (let i = 0; i < n; i++) {
      const b = rig.spine[i];
      const u = i / (n - 1);
      // the turn, spread down the body; the sweep of the tail, growing to its tip
      const side = this.bend * 0.18 + Math.sin(this.phase * Math.PI * 2 * 0.5 - u * 4.2) * wave * (0.04 + u * 0.32);
      b.rotation.y = i === 0 ? side * 0.5 : side;
      yaw += b.rotation.y;
      // on land, along the ground under it
      const qx = px - Math.sin(yaw) * rig.seg;
      const qz = pz - Math.cos(yaw) * rig.seg;
      const qy = afloat ? py : ctx.ground(qx, qz) + rig.rest * (1 - u * 0.75);
      const pitch = i === 0 ? 0 : clamp(-Math.atan2(py - qy, rig.seg), -0.5, 0.5);
      b.rotation.x = afloat ? 0 : pitch - prevPitch;
      prevPitch = afloat ? 0 : pitch;
      px = qx;
      pz = qz;
      py = afloat ? py : qy;
    }
    rig.head.rotation.x = -this.lift * 0.22 - this.gape * 0.12;
    rig.jaw.rotation.x = this.gape * 0.62;
    // legs: a sprawling walk on land; in the water, folded back along the body
    const walk = !afloat && this.speed > 0.05;
    for (const leg of rig.legs) {
      const diag = (leg.side > 0) === leg.front ? 0 : 0.5;
      const p = (this.phase + diag) * Math.PI * 2;
      if (afloat) {
        leg.bone.rotation.y = lerp(leg.bone.rotation.y, -leg.side * (leg.front ? 1.1 : 1.3), 0.1);
        leg.bone.rotation.z = lerp(leg.bone.rotation.z, leg.side * 0.25, 0.1);
      } else {
        leg.bone.rotation.y = walk ? leg.side * Math.sin(p) * 0.55 : lerp(leg.bone.rotation.y, 0, 0.1);
        leg.bone.rotation.z = walk ? leg.side * Math.max(0, Math.cos(p)) * 0.35 : lerp(leg.bone.rotation.z, 0, 0.1);
      }
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    if (this.mesh.skeleton) this.mesh.skeleton.dispose();
  }
}

