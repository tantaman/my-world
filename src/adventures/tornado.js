// Tornado: the sky goes green-grey, and a twister touches down a couple of
// hundred metres upwind and comes on through the trees, wandering, but
// always coming back round toward you. Close to it the wind drags you in and
// round; get too close and it picks you up and throws you. Branches and
// boughs come flying out of it. Keep clear until it lifts back into the
// cloud, or get underground (a cave), where it can't reach you.

import * as THREE from 'three';
import { Storm } from './storm.js';
import { Puffs } from './fx.js';
import { WIND } from '../fires/look.js';
import { NOISE_GLSL } from '../render/glsl.js';
import { SHARED } from '../render/uniforms.js';
import { TREE_KINDS } from '../world/flora.js';
import { rand } from '../core/geom.js';
import { smoothstep } from '../noise.js';

const LASTS = 150; // s until it lifts
const FROM = [150, 175]; // m away it touches down, upwind (near enough to see through the haze)
const SPEED = [2.5, 6.2]; // m/s it moves at, at first and at its worst (you run at 7.5)
const AIM_EVERY = 6; // s between its turning back toward you
const FUNNEL = { height: 240, base: 8, top: 70 }; // m
const WINDS = 62; // m out from it that its winds reach
const CORE = 8; // m: this close, it picks you up
const PULL = { round: 5.5, in: 2.6 }; // m/s its winds shove you round and in, at the core's edge
const THROWN = { up: 13, round: 14, out: 4, hurt: 16, again: 3 }; // m/s, and how much it hurts, and s before it can again
const LANDING = { safe: 9, hurt: 2.2 }; // m/s you can fall at unhurt, and how much each m/s over that hurts
const FLING_EVERY = [2.5, 5]; // s between things it flings at you, near
const FLING_NEAR = 75; // m: ...this near
const LIFT = 6; // s it takes to rope out and lift
const _c = new THREE.Color();
const GLOOM = new THREE.Color(0.16, 0.2, 0.17); // the sky over a twister: green-grey

export const tornado = {
  id: 'tornado',
  title: 'Tornado',
  blurb: 'A twister touches down upwind and comes through the trees after you. Keep clear of it until it lifts back into the cloud, or get underground.',
  start: (kit, { from }) => new Tornado(kit, from),
};

class Tornado {
  constructor(kit, from) {
    this.kit = kit;
    this.t = 0;
    this.storm = new Storm(kit);
    // touch down upwind of you, so it comes the way the wind blows
    const a = Math.atan2(-WIND.x, -WIND.y) + rand(-0.6, 0.6);
    const d = rand(FROM[0], FROM[1]);
    this.x = from.x + Math.sin(a) * d;
    this.z = from.z + Math.cos(a) * d;
    this.heading = a + Math.PI;
    this.aim = { x: from.x, z: from.z };
    this.aimIn = AIM_EVERY;
    this.thrownFor = 0;
    this.flungAt = 0;
    this.nextFling = rand(FLING_EVERY[0], FLING_EVERY[1]);
    this.falling = 0; // the fastest you've come down since it threw you (m/s)
    this.airborne = false;
    this.lift = 0; // 0 on the ground .. 1 gone back up into the cloud
    this.puffs = new Puffs(kit.scene, 420);
    this.funnel = makeFunnel();
    kit.scene.add(this.funnel);
    this.storm.flying.push = (p, dt) => this._swirl(p, dt);
    kit.say('a twister has touched down · keep clear of it', 3200);
    kit.sound.sfx('thunder', { size: 0.3 });
  }

  objective() {
    return 'keep clear of the twister until it lifts';
  }

  left() {
    return LASTS - this.t;
  }

  guide() {
    return this.lift < 1 ? { x: this.x, z: this.z, label: 'the twister' } : null;
  }

  note() {
    const kit = this.kit;
    if (kit.player.space) return "underground · it can't reach you here";
    const d = this._dist();
    if (d < CORE * 2.2) return 'it has you · get out of it!';
    if (d < WINDS) return 'its winds are dragging at you · run!';
    return '';
  }

  _dist() {
    const P = this.kit.player.pos;
    return Math.hypot(P.x - this.x, P.z - this.z);
  }

  update(dt) {
    const kit = this.kit;
    this.t += dt;
    const ending = this.t >= LASTS;
    if (ending) this.lift = Math.min(1, this.lift + dt / LIFT);
    const on = 1 - this.lift;
    const P = kit.player.pos;

    // ── It moves: on toward where you were, wandering ───────────────────────
    this.aimIn -= dt;
    if (this.aimIn <= 0) {
      this.aimIn = AIM_EVERY;
      this.aim = { x: P.x + rand(-25, 25), z: P.z + rand(-25, 25) };
    }
    const want = Math.atan2(this.aim.x - this.x, this.aim.z - this.z);
    let turn = want - this.heading;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    this.heading += Math.max(-0.35 * dt, Math.min(0.35 * dt, turn));
    const speed = SPEED[0] + (SPEED[1] - SPEED[0]) * smoothstep(0, 50, this.t);
    const wobble = Math.sin(this.t * 0.37) * 0.6;
    this.x += Math.sin(this.heading + wobble) * speed * dt;
    this.z += Math.cos(this.heading + wobble) * speed * dt;
    const g = kit.ground(this.x, this.z);
    this.funnel.position.set(this.x, g - 2 + this.lift * 40, this.z);
    const u = this.funnel.material.uniforms;
    u.uOn.value = on;
    u.uLean.value.set(Math.sin(this.heading) * 18, Math.cos(this.heading) * 18);
    const light = kit.sky.hemi;
    u.uLight.value.copy(light.color).multiplyScalar(light.intensity * 0.7).add(_c.copy(kit.sky.sun.color).multiplyScalar(kit.sky.sun.intensity * 0.05));

    const d = this._dist();
    const near = 1 - smoothstep(30, 260, d);
    this.storm.update(dt, { level: Math.max(0.35, 0.6 + 0.4 * near) * (1 - this.lift * 0.6), wind: 10 + 10 * near, rain: 0.35, lightning: 5, debris: 0 });
    kit.look.sight = 0; // you need to see it coming
    kit.look.haze = Math.min(kit.look.haze, 1.25);
    kit.look.gloom = Math.max(kit.look.gloom, 0.8 * (1 - this.lift));
    kit.look.gloomColor = GLOOM;
    kit.look.wind = Math.max(kit.look.wind, 6 * near * on);
    kit.air.roar = Math.max(kit.air.roar, (1 - smoothstep(20, 280, d)) * on);
    kit.air.wind = Math.max(kit.air.wind, (0.5 + 0.5 * near) * on);

    // its dust and what it tears off the trees
    this._dust(dt, g, on);
    // ...and what it has, flung at you
    this.nextFling -= dt;
    if (this.nextFling <= 0 && d < FLING_NEAR && on > 0.5 && !kit.player.space) {
      this.nextFling = rand(FLING_EVERY[0], FLING_EVERY[1]);
      this._flingAt(P);
    }

    // ── It has you ──────────────────────────────────────────────────────────
    this.thrownFor = Math.max(0, this.thrownFor - dt);
    if (!kit.player.space && on > 0.3) {
      if (d < WINDS) {
        const w = Math.pow(1 - d / WINDS, 1.5) * on;
        const ux = (this.x - P.x) / (d || 1);
        const uz = (this.z - P.z) / (d || 1);
        // round it (anticlockwise, from above), and in
        kit.push((-uz * PULL.round + ux * PULL.in) * w * dt, (ux * PULL.round + uz * PULL.in) * w * dt);
      }
      if (d < CORE && this.thrownFor <= 0) {
        this.thrownFor = THROWN.again;
        const ux = (P.x - this.x) / (d || 1);
        const uz = (P.z - this.z) / (d || 1);
        kit.fling(-uz * THROWN.round + ux * THROWN.out, THROWN.up, ux * THROWN.round + uz * THROWN.out);
        kit.hurt(THROWN.hurt, 'picked up and thrown by the twister');
        this.airborne = true;
        this.falling = 0;
      }
    }
    // coming down from being thrown
    if (this.airborne) {
      const pl = kit.player;
      this.falling = Math.max(this.falling, -pl.vel.y);
      if (pl.grounded && pl.vel.y > -0.5 && this.thrownFor < THROWN.again - 0.3) {
        this.airborne = false;
        const over = this.falling - LANDING.safe;
        if (over > 0) kit.hurt(Math.round(over * LANDING.hurt), 'thrown down by the twister');
      }
    }

    this.puffs.update(dt, kit.sky);
    if (ending && this.lift >= 1 && !this.won) {
      this.won = true;
      return { won: 'the twister roped out and lifted back into the cloud' };
    }
    if (ending && !this.said) {
      this.said = true;
      kit.say('it is roping out · lifting', 2400);
    }
    return null;
  }

  // Dust boiling up round its foot, and leaves and branches torn off the
  // trees it passes through.
  _dust(dt, g, on) {
    const kit = this.kit;
    this.dustAcc = (this.dustAcc || 0) + dt * 40 * on;
    while (this.dustAcc >= 1) {
      this.dustAcc -= 1;
      const a = rand(0, Math.PI * 2);
      const r = rand(FUNNEL.base * 0.8, FUNNEL.base * 3);
      this.puffs.add({
        x: this.x + Math.sin(a) * r,
        y: g + rand(0, 4),
        z: this.z + Math.cos(a) * r,
        vx: Math.cos(a) * 9 + Math.sin(a) * 3,
        vy: rand(2, 7),
        vz: -Math.sin(a) * 9 + Math.cos(a) * 3,
        size: rand(3.5, 7),
        grow: 1.6,
        life: rand(2, 4),
        alpha: 0.7,
        color: 0x4a3e32,
        drag: 0.6,
      });
    }
    this.tearAcc = (this.tearAcc || 0) + dt * 6 * on;
    if (this.tearAcc < 1) return;
    this.tearAcc = 0;
    let n = 0;
    kit.chunks.forEachPlant(this.x, this.z, 16, TREE_KINDS, (ch, kind, k, px, py, pz, s) => {
      if (n++ > 2 || Math.random() < 0.5) return;
      const leaf = Math.random() < 0.6;
      this.storm.flying.add({ x: px, y: py + rand(3, 9) * s, z: pz, vx: rand(-3, 3), vy: rand(2, 6), vz: rand(-3, 3), size: leaf ? [0.4, 0.04, 0.4] : [0.07, 0.07, rand(0.8, 1.8)], color: leaf ? 0x4a6a2e : 0x5a4632, life: 9, spin: rand(4, 10), gravity: 4, drag: 0.15 });
    });
  }

  // Its winds steer what it carries: round, in and up near it.
  _swirl(p, dt) {
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d > WINDS || p.why) return;
    const w = (1 - d / WINDS) * (1 - this.lift);
    p.vx += (-dz / d) * 26 * w * dt - (dx / d) * 6 * w * dt;
    p.vz += (dx / d) * 26 * w * dt - (dz / d) * 6 * w * dt;
    p.vy += 12 * w * w * dt;
  }

  // Something out of it, thrown at you.
  _flingAt(P) {
    const g = this.kit.ground(this.x, this.z);
    const sx = this.x + rand(-4, 4);
    const sz = this.z + rand(-4, 4);
    const sy = g + rand(4, 14);
    const d = Math.hypot(P.x - sx, P.z - sz);
    const speed = 20;
    const t = d / speed;
    const big = Math.random() < 0.4;
    this.storm.flying.add({
      x: sx,
      y: sy,
      z: sz,
      vx: (P.x + rand(-2, 2) - sx) / t,
      vy: (P.y + 1 - sy) / t + 0.5 * 3 * t,
      vz: (P.z + rand(-2, 2) - sz) / t,
      size: big ? [0.16, 0.16, 2.2] : [0.5, 0.04, 0.5],
      color: big ? 0x5a4632 : 0x3e5a2a,
      life: 8,
      spin: rand(5, 12),
      gravity: 3,
      drag: 0.02,
    });
    this.storm.flying.list[this.storm.flying.list.length - 1].why = big ? 'hit by a branch out of the twister' : 'hit by a bough out of the twister';
  }

  dispose() {
    const kit = this.kit;
    kit.scene.remove(this.funnel);
    this.funnel.geometry.dispose();
    this.funnel.material.dispose();
    this.puffs.dispose();
    this.storm.dispose();
  }
}

// The funnel: an open cone, narrow at the foot and wide where it meets the
// cloud, bent with the wind and leaning the way it goes, filled with bands of
// dust and cloud wound round it and racing up. Built round its own foot (the
// mesh is put where it touches down), and patterned from its own surface,
// not where it is in the world.
function makeFunnel() {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 32, 30, true).translate(0, 0.5, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: SHARED.uTime,
      uOn: { value: 1 },
      uLean: { value: new THREE.Vector2() },
      uLight: { value: new THREE.Color(0.5, 0.5, 0.5) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uOn;
      uniform vec2 uLean;
      varying vec2 vUv;
      varying float vShade;
      void main() {
        vUv = uv;
        float y = position.y;
        // narrow at the foot (thinner still as it ropes out), flaring into the cloud
        float r = mix(${FUNNEL.base.toFixed(1)} * mix(0.25, 1.0, uOn), ${FUNNEL.top.toFixed(1)}, pow(y, 2.2));
        vec3 p = vec3(position.x * r, y * ${FUNNEL.height.toFixed(1)}, position.z * r);
        // it snakes as it goes, and the foot drags behind
        float bend = sin(y * 4.0 + uTime * 0.6) * 9.0 * y * (1.0 - y) * (2.0 - uOn);
        p.xz += vec2(bend, bend * 0.6) - uLean * (1.0 - y) * (1.0 - y) * 0.6;
        vShade = 0.55 + 0.45 * position.x;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOn;
      uniform vec3 uLight;
      varying vec2 vUv;
      varying float vShade;
      ${NOISE_GLSL}
      void main() {
        float y = vUv.y;
        // bands wound round it, racing round faster at the foot, and up
        float spin = uTime * mix(1.6, 0.35, y);
        float n = fbm4(vec2(vUv.x * 7.0 + spin + y * 3.0, y * 9.0 - uTime * 1.3));
        float streak = vnoise(vec2(vUv.x * 26.0 + spin * 3.0, y * 3.0));
        float a = smoothstep(0.25, 0.75, n + streak * 0.25) * 0.9 + 0.25;
        a *= smoothstep(0.0, 0.03, y) * (1.0 - smoothstep(0.7, 1.0, y)) * mix(0.2, 1.0, uOn);
        if (a < 0.35) discard;
        // dark with dust and wreckage at the foot, storm-cloud grey above
        vec3 col = mix(vec3(0.2, 0.17, 0.14), vec3(0.3, 0.32, 0.32), smoothstep(0.0, 0.45, y));
        col *= uLight * (0.35 + 1.1 * n + 0.5 * streak) * vShade;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = 'twister';
  return mesh;
}
