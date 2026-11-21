// The stronghold: a band of outlaws has thrown up a stockade in a clearing
// a couple of hundred metres off, and holds it with rifles: two up in the
// watchtowers, two at the gate, and more walking rounds inside and out.
// Take it. Every one of them has to go down to your rifle (0; hold
// right-click for the scope), and once they know you're there they'll shoot
// back. Creep up, keep the ground and the trees between you, and pick them
// off from where they can't see you. The stockade stops a bullet, theirs and
// yours.
//
// Won, the camp stays a while for you to look round; then it's gone.

import * as THREE from 'three';
import { buildCamp, rayWalls, waveFlag, CAMP } from './camp.js';
import { Guards } from './guards.js';
import { Flames, Puffs } from './fx.js';
import { findClearing } from './places.js';
import { TREE_KINDS } from '../world/flora.js';
import { rand, segDist, waterSample } from '../core/geom.js';
import { anchor } from '../render/origin.js';

const NAMES = ['Fort Raven', 'Blackwater Stockade', 'Hangman’s Fort', 'Rattlesnake Camp', 'Fort Desolation', 'Cutthroat Stockade'];
const AWAY = { near: 170, far: 250 }; // m off the camp is put
const HURT = 11; // how much one of their bullets hurts
const STAYS = 240; // s the camp stays once it's yours
const GONE = 360; // m away, and it's gone sooner
const _w = waterSample();
const _seg = { d: 0, nx: 0, nz: 0, t: 0 };
const _d = new THREE.Vector3();

export const stronghold = {
  id: 'stronghold',
  title: 'The stronghold',
  blurb: 'Outlaws have built a stockade in a clearing nearby and hold it with rifles. Take it: bring down every one of them with your rifle (0). They will shoot back.',
  start: (kit, { from }) => new Stronghold(kit, from),
};

class Stronghold {
  constructor(kit, from) {
    this.kit = kit;
    this.t = 0;
    this.linger = STAYS;
    this.name = NAMES[Math.floor(Math.random() * NAMES.length)];
    const site = this._site(from);
    this.camp = buildCamp(site, kit.ground);
    kit.scene.add(this.camp.object);
    this.owner = { stronghold: this.name }; // whose solids these are
    kit.solids.set(this.owner, this.camp.solids);
    this.flames = new Flames(kit.scene, 4);
    this.smoke = new Puffs(kit.scene, 60);
    this.tracers = new Tracers(kit.scene);
    this.guards = new Guards(this.camp, this._world());
    this.total = this.guards.list.length;
    this.off = kit.targets.add({
      aimed: (o, d, far, near) => {
        const g = this.guards.aimed(o, d, far, near);
        const w = rayWalls(this.camp.walls, o, d, g ? g.t : far, near);
        if (w !== null) return { t: w, solid: true };
        return g ? { t: g.t, label: 'an outlaw', hit: g.guard } : null;
      },
      struck: (g) => {
        this.guards.shot(g);
        const n = this.guards.left;
        return n ? `an outlaw is down · ${n} left` : 'the last of them is down';
      },
      heard: (x, z) => this.guards.heard(x, z),
    });
    kit.say(`outlaws hold ${this.name} · take it`, 3000);
  }

  // A clearing for it, off a way, clear of water, your buildings, caves and
  // anything brought in from a photo.
  _site(from) {
    const kit = this.kit;
    const keep = (x, z) => {
      for (const b of kit.buildings.list) for (const f of b.footings.values()) if (Math.hypot(f.x - x, f.z - z) < CAMP.r + 25) return true;
      const cave = kit.caves.nearest(x, z, CAMP.r + 40);
      return !!cave;
    };
    const look = {
      height: kit.ground,
      depth: (x, z) => (kit.chunks.waterAt(x, z, _w) ? _w.depth : -Infinity),
      trees: (x, z, r) => {
        let n = 0;
        kit.chunks.forEachPlant(x, z, r, TREE_KINDS, () => n++);
        return n || kit.gen.forest(x, z) * r * 0.3;
      },
      off: (x0, z0, x1, z1) => !!kit.landforms.reaches(x0, z0, x1, z1),
      keep,
    };
    const spot = findClearing(look, from.x, from.z, { ...AWAY, radius: CAMP.r + 4 }) || findClearing(look, from.x, from.z, { near: 120, far: 330, radius: CAMP.r, tries: 90 });
    if (spot) return spot;
    // nowhere good: straight ahead of you, as it is
    const a = from.camYaw + Math.PI;
    const x = from.x + Math.sin(a) * 200;
    const z = from.z + Math.cos(a) * 200;
    return { x, z, yaw: Math.atan2(from.x - x, from.z - z) };
  }

  // What the men need of the world.
  _world() {
    const kit = this.kit;
    const camp = () => this.camp;
    return {
      scene: kit.scene,
      ground: kit.ground,
      you: () => {
        const P = kit.player;
        return { x: P.pos.x, y: P.pos.y, z: P.pos.z, speed: Math.hypot(P.vel.x, P.vel.z) };
      },
      // the ground, and the walls, between two points
      see(a, b) {
        if (kit.player.space) return false;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dy, dz);
        for (let i = 1; i < 12; i++) {
          const t = i / 12;
          if (kit.ground(a.x + dx * t, a.z + dz * t) > a.y + dy * t + 0.15) return false;
        }
        _d.set(dx / len, dy / len, dz / len);
        return rayWalls(camp().walls, a, _d, len - 0.5, 0.5) === null;
      },
      fire: (g, hit) => this._fire(g, hit),
      call: (kind, x, y, z) => kit.sound.call(kind, x, y, z),
      keepOut(g, r) {
        kit.solids.forEachNear(g.x, g.z, r + 1, (s) => {
          segDist(g.x, g.z, s.ax, s.az, s.bx, s.bz, _seg);
          const min = s.r + r;
          if (_seg.d >= min) return;
          g.x += _seg.nx * (min - _seg.d);
          g.z += _seg.nz * (min - _seg.d);
        });
        kit.chunks.forEachCollider(g.x, g.z, (cx, cz, cr) => {
          const dx = g.x - cx;
          const dz = g.z - cz;
          const d = Math.hypot(dx, dz);
          if (d < cr + r && d > 1e-5) {
            g.x += (dx / d) * (cr + r - d);
            g.z += (dz / d) * (cr + r - d);
          }
        });
      },
    };
  }

  // One of them fires at you.
  _fire(g, hit) {
    const kit = this.kit;
    const P = kit.player.pos;
    const m = this.guards.muzzle(g);
    kit.sound.call('gunshot', m.x, m.y, m.z);
    const miss = hit ? 0 : rand(0.8, 2.5);
    const a = rand(0, Math.PI * 2);
    const tx = P.x + Math.cos(a) * miss;
    const ty = P.y + 1.1 + (hit ? 0 : rand(-0.5, 1));
    const tz = P.z + Math.sin(a) * miss;
    this.tracers.add(m.x, m.y, m.z, tx, ty, tz);
    if (hit) kit.hurt(HURT, 'shot by an outlaw');
    else kit.sound.sfx('whizz');
  }

  objective() {
    const n = this.guards.left;
    return `take ${this.name} · ${n} of ${this.total} left`;
  }

  left() {
    return null;
  }

  guide() {
    const c = this.camp.fire;
    const P = this.kit.player.pos;
    return Math.hypot(P.x - c.x, P.z - c.z) > CAMP.r + 8 ? { x: c.x, z: c.z, label: this.name } : null;
  }

  note() {
    if (!this.guards.left) return 'it is yours';
    if (this.guards.alerted) return 'they know you are here · keep in cover';
    return "they haven't seen you · rifle on 0, right-click for the scope";
  }

  update(dt) {
    this.t += dt;
    this._life(dt);
    if (!this.guards.left && !this.won) {
      this.won = true;
      return { won: `${this.name} is yours · every one of them is down` };
    }
    return null;
  }

  // After it's won: the camp stays a while, until you go.
  after(dt) {
    this._life(dt);
    const c = this.camp.fire;
    const P = this.kit.player.pos;
    return Math.hypot(P.x - c.x, P.z - c.z) < GONE;
  }

  // The fire, the flag, the men, the shots.
  _life(dt) {
    const kit = this.kit;
    this.guards.update(dt);
    waveFlag(this.camp.flag, this.t, 1);
    const f = this.camp.fire;
    this.flames.from(f.x, f.z);
    for (let i = 0; i < 3; i++) this.flames.set(i, f.x + (i - 1) * 0.18, f.y, f.z + (i === 1 ? 0.15 : -0.05), 0.75 + i * 0.12, i * 3.1, 0.7);
    this.flames.count = 3;
    this.flames.update();
    this.smokeAcc = (this.smokeAcc || 0) + dt * 2;
    while (this.smokeAcc >= 1) {
      this.smokeAcc -= 1;
      this.smoke.add({ x: f.x + rand(-0.2, 0.2), y: f.y + 0.9, z: f.z + rand(-0.2, 0.2), vy: 0.6, size: 0.4, grow: 0.25, life: 6, alpha: 0.35, color: 0x777777, warm: 0.2 });
    }
    this.smoke.update(dt, kit.sky);
    this.tracers.update(dt);
  }

  dispose() {
    const kit = this.kit;
    this.off();
    kit.solids.set(this.owner, null);
    kit.scene.remove(this.camp.object);
    this.camp.dispose();
    this.guards.dispose();
    this.flames.dispose();
    this.smoke.dispose();
    this.tracers.dispose();
  }
}

// ── Tracers ─────────────────────────────────────────────────────────────────
// The streak of a shot, for a moment: a bright line from the muzzle.
const TRACE = { max: 12, show: 0.07 };

class Tracers {
  constructor(scene) {
    this.pos = new Float32Array(TRACE.max * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(3, 2.4, 1.2), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.scene = scene;
    this.list = [];
  }

  add(ax, ay, az, bx, by, bz) {
    if (this.list.length >= TRACE.max) this.list.shift();
    this.list.push({ ax, ay, az, bx, by, bz, t: TRACE.show });
  }

  update(dt) {
    let n = 0;
    for (const s of this.list) {
      s.t -= dt;
      if (s.t > 0) this.list[n++] = s;
    }
    this.list.length = n;
    const at = n ? anchor(this.mesh, this.list[0].ax, this.list[0].az) : this.mesh.position;
    for (let i = 0; i < n; i++) {
      const s = this.list[i];
      // the streak is a stretch of the shot's path, partway along it
      const k0 = 1 - s.t / TRACE.show;
      const k1 = Math.min(1, k0 + 0.35);
      this.pos.set([s.ax + (s.bx - s.ax) * k0 - at.x, s.ay + (s.by - s.ay) * k0, s.az + (s.bz - s.az) * k0 - at.z, s.ax + (s.bx - s.ax) * k1 - at.x, s.ay + (s.by - s.ay) * k1, s.az + (s.bz - s.az) * k1 - at.z], i * 6);
    }
    this.mesh.geometry.setDrawRange(0, n * 2);
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
