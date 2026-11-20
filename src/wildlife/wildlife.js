// The animals that are about. Nothing here is saved or shared: wildlife is
// the forest's, not yours, so it comes and goes on its own. Every so often
// something arrives — out of sight, somewhere that suits it, at an hour it
// keeps — goes about its business, reacts to you (and to anyone else in the
// world with you), and eventually wanders off again.
//
//   world.wildlife.spawn('bear')         call one up nearby (from the console)
//   world.wildlife.list()                who's around
//
// ?animals=0 turns them off, ?animals=2 doubles how many there are.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { SPECIES, CATEGORIES, ACTIVE } from './species.js';
import { Beast } from './beasts.js';
import { Flock, Flit, Soar, Owl } from './flyers.js';
import { buildSnake, buildSalamander, Crawler } from './crawlers.js';
import { BeeSwarm, buildButterfly, Butterfly } from './insects.js';
import { disposeAnimal } from './rig.js';
import { smoothstep, clamp } from '../noise.js';
import { rand, pick, wrapAngle as wrap, segDist, waterSample } from '../core/geom.js';
import { TREE_KINDS as TREES } from '../world/flora.js';

const article = (s) => (/^[aeiou]/i.test(s) ? `an ${s}` : `a ${s}`);
const _seg = { d: 0, nx: 0, nz: 0, t: 0 };
const _v = new THREE.Vector3();
const _sphere = new THREE.Sphere();
const _wet = waterSample();
// Animals ford a shallow stream but go round anything deeper.
const WADE = 0.35;

// ── A herd, pack, family or lone animal ────────────────────────────────────
class Herd {
  constructor(sp, x, z, yaw, n, env, entry) {
    this.sp = sp;
    this.kind = sp.kind;
    this.size = n;
    this.members = [];
    this.alarm = null;
    this.entry = entry;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const r = i === 0 ? 0 : rand(0.5, 1) * sp.spread;
      this.members.push(new Beast(sp, x + Math.cos(a) * r, z + Math.sin(a) * r, yaw, this, i, env));
    }
    this.meshes = this.members.map((m) => m.mesh);
    const L = this.members[0];
    this.label = n === 1 ? L.label ?? article(sp.name) : sp.many ?? article(sp.name);
    // start out: the leader heads on in, the rest come along
    const travels = sp.idle.travel && Math.random() < 0.65;
    L.setState(travels ? 'travel' : sp.idle.prowl ? 'prowl' : 'wander', rand(25, 40));
    for (const m of this.members.slice(1)) m.setState('follow', rand(6, 12));
    this.done = false;
  }
  get x() {
    return this.members.length ? this.members[0].x : 0;
  }
  get z() {
    return this.members.length ? this.members[0].z : 0;
  }
  get y() {
    return this.members.length ? this.members[0].mesh.position.y : 0;
  }
  get leaving() {
    return this.members.every((m) => m.leaving);
  }
  update(ctx) {
    for (const m of this.members) m.update(ctx);
    // the ones that have gone (up a tree, out of sight) leave the herd
    for (let i = this.members.length - 1; i >= 0; i--) {
      const m = this.members[i];
      const d = ctx.distance(m.x, m.z);
      if (m.done || d > 170 || (m.leaving && d > 55 && !ctx.inView(m.x, m.mesh.position.y, m.z, 1.5))) {
        ctx.remove(m.mesh);
        m.dispose();
        this.members.splice(i, 1);
      }
    }
    this.done = this.members.length === 0;
  }
  dispose() {
    for (const m of this.members) m.dispose();
  }
}

// ── Snakes and salamanders ─────────────────────────────────────────────────
class Serpent {
  constructor(sp, x, z, yaw, env) {
    this.sp = sp;
    this.kind = sp.kind;
    this.snake = sp.kind === 'snake';
    if (this.snake) {
      const rattler = Math.random() < 0.2;
      this.rig = buildSnake((Math.random() * 1e9) | 0, rattler ? 'rattler' : 'garter');
      this.label = rattler ? 'a timber rattlesnake' : 'a garter snake';
      this.base = rand(0.14, 0.24);
    } else {
      const eft = Math.random() < 0.4;
      this.rig = buildSalamander((Math.random() * 1e9) | 0, eft ? 'eft' : 'spotted');
      this.label = eft ? 'a red eft' : 'a spotted salamander';
      this.base = rand(0.025, 0.045);
      this.rig.mesh.scale.setScalar(1.3);
    }
    this.mesh = this.rig.mesh;
    this.meshes = [this.mesh];
    this.cr = new Crawler(this.rig);
    this.x = x;
    this.z = z;
    this.heading = yaw;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = yaw;
    this.cr.reset();
    this.state = 'crawl';
    this.t = 0;
    this.dur = rand(6, 15);
    this.life = rand(60, 150);
    this.done = false;
    this.leaving = false;
    this.speed = 0;
  }
  get y() {
    return this.mesh.position.y;
  }
  update(ctx) {
    const dt = ctx.dt;
    this.t += dt;
    this.life -= dt;
    const P = ctx.nearest(this.x, this.z);
    let want = 0;
    const cr = this.cr;
    if (this.snake && P.d < 3.2 && (this.state === 'crawl' || this.state === 'bask')) {
      this.state = 'guard';
      this.t = 0;
      this.dur = rand(2, 3.5);
      if (this.rig.rattler) ctx.call('rattle', this.x, this.y + 0.1, this.z, { dur: this.dur + 0.5 });
    }
    if (!this.snake && P.d < 1.4 && this.state === 'crawl') {
      this.state = 'bask';
      this.t = 0;
      this.dur = rand(4, 8);
    }
    if (this.life < 0 && this.state !== 'flee') this.leaving = true;
    switch (this.state) {
      case 'crawl':
        want = this.base;
        this.heading += Math.sin(ctx.time * 0.3 + this.x) * 0.3 * dt;
        if (this.t > this.dur) {
          this.state = 'bask';
          this.t = 0;
          this.dur = rand(4, 14);
        }
        break;
      case 'bask':
        if (this.t > this.dur) {
          this.state = 'crawl';
          this.t = 0;
          this.dur = rand(5, 14);
          this.heading += rand(-1.5, 1.5);
        }
        break;
      case 'guard':
        cr.raise = Math.min(1, cr.raise + dt * 4);
        cr.rattle = this.rig.rattler ? 1 : 0;
        if (this.t > this.dur) {
          this.state = 'flee';
          this.t = 0;
          this.heading = Math.atan2(this.x - P.x, this.z - P.z);
        }
        break;
      case 'flee':
        this.leaving = true;
        want = this.base * 2.8;
        this.heading += wrap(Math.atan2(this.x - P.x, this.z - P.z) - this.heading) * dt;
        break;
    }
    if (this.state !== 'guard') {
      cr.raise = Math.max(0, cr.raise - dt * 2);
      cr.rattle = 0;
    }
    this.speed += (want - this.speed) * Math.min(1, dt * 3);
    cr.speed = this.speed;
    const dir = this.heading + cr.meander;
    this.x += Math.sin(dir) * this.speed * dt;
    this.z += Math.cos(dir) * this.speed * dt;
    ctx.pushOut(this, 0.05);
    this.mesh.position.x = this.x;
    this.mesh.position.z = this.z;
    this.mesh.rotation.y = dir;
    cr.update(dt, ctx.ground);
  }
  dispose() {
    disposeAnimal(this.mesh);
  }
}

// ── Bees ───────────────────────────────────────────────────────────────────
class Bees {
  constructor(sp, x, z, ctx) {
    this.sp = sp;
    this.kind = sp.kind;
    this.swarm = new BeeSwarm(x, z, Math.floor(rand(5, 11)), ctx.ground);
    this.meshes = [this.swarm.mesh];
    this.x = x;
    this.z = z;
    this.life = rand(60, 180);
    this.done = false;
    this.leaving = false;
    this.nextBuzz = 0;
    this.label = 'bumblebees';
  }
  get y() {
    return this.swarm.bees[0].y;
  }
  update(ctx) {
    this.life -= ctx.dt;
    if (this.life < 0) this.leaving = true;
    this.swarm.update(ctx.dt, ctx.time);
    const P = ctx.nearest(this.x, this.z);
    if (P.d < 8 && ctx.time > this.nextBuzz) {
      this.nextBuzz = ctx.time + rand(0.25, 0.9);
      const b = pick(this.swarm.bees);
      ctx.call('buzz', b.x, b.y, b.z);
    }
  }
  dispose() {
    this.swarm.dispose();
  }
}

// ── Butterflies ────────────────────────────────────────────────────────────
const BUTTERFLY_NAMES = { monarch: 'a monarch', white: 'a cabbage white', swallowtail: 'a tiger swallowtail', cloak: 'a mourning cloak', azure: 'a spring azure' };
class Flutter {
  constructor(sp, x, z, ctx) {
    this.sp = sp;
    this.kind = sp.kind;
    const kind = pick(['monarch', 'monarch', 'white', 'white', 'swallowtail', 'cloak', 'azure']);
    const n = kind === 'white' || kind === 'azure' ? Math.floor(rand(1, 4)) : 1;
    this.flies = [];
    for (let i = 0; i < n; i++) {
      const rig = buildButterfly(kind, (Math.random() * 1e9) | 0);
      this.flies.push(new Butterfly(rig, x + rand(-1, 1), z + rand(-1, 1), ctx.ground));
    }
    this.meshes = this.flies.map((f) => f.mesh);
    this.life = rand(50, 140);
    this.done = false;
    this.leaving = false;
    this.label = n > 1 ? `${BUTTERFLY_NAMES[kind].slice(2)}s` : BUTTERFLY_NAMES[kind];
  }
  get x() {
    return this.flies[0].x;
  }
  get y() {
    return this.flies[0].y;
  }
  get z() {
    return this.flies[0].z;
  }
  update(ctx) {
    this.life -= ctx.dt;
    if (this.life < 0 && !this.leaving) {
      this.leaving = true;
      for (const f of this.flies) f.leaving = true;
    }
    for (const f of this.flies) f.update(ctx.dt);
  }
  dispose() {
    for (const f of this.flies) disposeAnimal(f.mesh);
  }
}

// ── Classes of animal ──────────────────────────────────────────────────────
// A species (species.js) says which class it is with `cls`; the class is what
// knows how to put one in the world and run it. Most are the default, 'herd':
// a four-legged mammal, alone or in a group. A new kind of creature — a fish,
// a bat — is a class registered here from its own module.
//
// The factory is handed { wildlife, sp, spot, env, ctx, toward, player } and
// returns an animal (or a group of them moving as one):
//
//   sp, kind        its species, and the species' key
//   label           what to call it when you spot it ('a red fox'), if anything
//   meshes          the three.js objects to add to (and take out of) the scene
//   x, y, z         where it is: for spotting it, and for knowing it has gone
//   done            true once it has left of its own accord
//   leaving         true once it is on its way out, so it can be removed
//                   when it is far enough off and out of sight
//   update(ctx)     every frame; ctx is what an animal may ask about the world
//                   (see _makeCtx: ground, nearest person, cover, calls...)
//   dispose()       free its geometry
const CLASSES = new Map();

export function defineAnimalClass(name, make) {
  CLASSES.set(name, make);
}

defineAnimalClass('flock', ({ wildlife, sp, spot, env, ctx }) => new Flock(wildlife, sp, spot, env, ctx));
defineAnimalClass('flit', ({ wildlife, sp, spot, env, ctx }) => new Flit(wildlife, sp, spot, env, ctx));
defineAnimalClass('soar', ({ wildlife, sp, spot, env, ctx }) => new Soar(wildlife, sp, spot, env, ctx));
defineAnimalClass('owl', ({ wildlife, sp, spot, env, ctx }) => new Owl(wildlife, sp, spot, env, ctx));
defineAnimalClass('crawler', ({ sp, spot, env, toward }) => new Serpent(sp, spot.x, spot.z, toward + rand(-1.5, 1.5), env));
defineAnimalClass('bees', ({ sp, spot, ctx }) => new Bees(sp, spot.x, spot.z, ctx));
defineAnimalClass('butterflies', ({ sp, spot, ctx }) => new Flutter(sp, spot.x, spot.z, ctx));
defineAnimalClass('herd', ({ sp, spot, env, toward, player }) => {
  // mammals head in toward where you are, but stop short of spooking:
  // their first stop is a little beyond the distance they'd notice you
  const n = sp.group(Math.random);
  const stand = sp.notice * rand(1.05, 1.35);
  const a = toward + Math.PI + rand(-0.9, 0.9);
  const entry = { x: player.x + Math.sin(a) * stand, z: player.z + Math.cos(a) * stand };
  return new Herd(sp, spot.x, spot.z, Math.atan2(entry.x - spot.x, entry.z - spot.z), n, env, entry);
});

// ── The manager ────────────────────────────────────────────────────────────
export class Wildlife {
  // solids: built things animals have to go round (src/world/solids.js)
  // spaces: caves, which they keep out of (src/world/spaces.js)
  constructor({ scene, gen, chunks, solids = null, spaces = null, player, peers, sound, camera, hud }) {
    this.scene = scene;
    this.gen = gen;
    this.chunks = chunks;
    this.solids = solids;
    this.spaces = spaces;
    this.player = player;
    this.peers = peers;
    this.sound = sound;
    this.camera = camera;
    this.hud = hud;
    this.density = Math.max(0, CONFIG.animals);
    this.group = new THREE.Group();
    this.group.name = 'wildlife';
    scene.add(this.group);
    this.entities = [];
    this.time = 0;
    // the first arrivals come along fairly soon
    this.next = { big: rand(8, 20), small: rand(3, 8), herp: rand(15, 30), bird: rand(2, 6), insect: rand(4, 10) };
    this.frustum = new THREE.Frustum();
    this._pm = new THREE.Matrix4();
    this.people = [];
    this.rested = {}; // kind -> time before which another won't arrive
    this.nextSight = 0;
    this.seen = new Set();
    this.species = SPECIES; // for tuning from the console
    this.ctx = this._makeCtx();
  }

  // ── What the animals can ask about the world ──────────────────────────────
  _makeCtx() {
    const wl = this;
    const chunks = this.chunks;
    const gen = this.gen;
    const deep = (x, z) => chunks.waterAt(x, z, _wet) && _wet.depth > WADE;
    return {
      dt: 0,
      time: 0,
      hours: 12,
      night: 0,
      ground: (x, z) => chunks.heightAt(x, z),
      distance: (x, z) => {
        const p = wl.player.pos;
        return Math.hypot(x - p.x, z - p.z);
      },
      // the nearest person (you, or someone in the world with you)
      nearest(x, z) {
        let best = null;
        let bd = Infinity;
        for (const p of wl.people) {
          const d = Math.hypot(p.x - x, p.z - z);
          if (d < bd) {
            bd = d;
            best = p;
          }
        }
        return best ? { d: bd, x: best.x, z: best.z, speed: best.speed } : { d: Infinity, x: 0, z: 0, speed: 0 };
      },
      env: (x, z) => wl.env(x, z),
      inView: (x, y, z, r = 1) => wl.inView(x, y, z, r),
      offscreenPoint: (x, z, minD, maxD) => wl.offscreenPoint(x, z, minD, maxD),
      call: (kind, x, y, z, opts) => wl.sound && wl.sound.call(kind, x, y, z, opts),
      remove: (mesh) => wl.group.remove(mesh),
      // a trunk or boulder (or deep water, or the way into a cave) in the way at (x, z)?
      blocked(x, z, r) {
        if (deep(x, z)) return { x, z };
        if (wl.spaces && wl.spaces.at(x, z, chunks.heightAt(x, z) + 0.05)) return { x, z };
        let hit = null;
        chunks.forEachCollider(x, z, (cx, cz, cr) => {
          if (!hit && Math.hypot(cx - x, cz - z) < cr + r) hit = { x: cx, z: cz };
        });
        const solids = wl.solids;
        if (!hit && solids) {
          solids.forEachNear(x, z, r + 0.5, (s) => {
            if (hit) return;
            segDist(x, z, s.ax, s.az, s.bx, s.bz, _seg);
            if (_seg.d < s.r + r && Math.max(s.topA, s.topB) - chunks.heightAt(x, z) > 0.3) hit = { x: x - _seg.nx * _seg.d, z: z - _seg.nz * _seg.d };
          });
        }
        return hit;
      },
      // shove an animal back out of trunks, rocks and anything built, and
      // ease it back toward the shallows if it's found its way into deep water
      pushOut(e, r) {
        if (deep(e.x, e.z)) {
          let best = _wet.depth;
          let bx = 0;
          let bz = 0;
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            const px = e.x + Math.sin(a) * 1.5;
            const pz = e.z + Math.cos(a) * 1.5;
            const d = chunks.waterAt(px, pz, _wet) ? _wet.depth : -1;
            if (d < best) {
              best = d;
              bx = Math.sin(a);
              bz = Math.cos(a);
            }
          }
          e.x += bx * 2.5 * this.dt;
          e.z += bz * 2.5 * this.dt;
        }
        chunks.forEachCollider(e.x, e.z, (cx, cz, cr) => {
          const dx = e.x - cx;
          const dz = e.z - cz;
          const d = Math.hypot(dx, dz);
          const min = cr + r;
          if (d < min && d > 1e-5) {
            e.x += (dx / d) * (min - d);
            e.z += (dz / d) * (min - d);
          }
        });
        const solids = wl.solids;
        if (solids) {
          solids.forEachNear(e.x, e.z, r + 1, (s) => {
            segDist(e.x, e.z, s.ax, s.az, s.bx, s.bz, _seg);
            const min = s.r + r;
            if (_seg.d >= min) return;
            const top = s.topA + (s.topB - s.topA) * _seg.t;
            if (top - chunks.heightAt(e.x, e.z) < 0.3) return; // low enough to step over
            e.x += _seg.nx * (min - _seg.d);
            e.z += _seg.nz * (min - _seg.d);
          });
        }
      },
      // a standing tree to bolt up, preferably not toward whoever scared you
      nearestTree(x, z, maxD, from) {
        let best = null;
        let bs = Infinity;
        chunks.forEachPlant(x, z, maxD, TREES, (ch, kind, k, px, py, pz, s) => {
          const d = Math.hypot(px - x, pz - z);
          const toward = from ? Math.max(0, ((px - x) * (from.x - x) + (pz - z) * (from.z - z)) / (d * Math.hypot(from.x - x, from.z - z) + 1e-4)) : 0;
          const score = d * (1 + toward * 2);
          if (score < bs) {
            bs = score;
            best = { x: px, z: pz, r: chunks.trunkRadius[kind] * s };
          }
        });
        return best;
      },
      // a rock or a fallen log to dive under
      nearestCover(x, z, maxD, from) {
        let best = null;
        let bd = Infinity;
        chunks.forEachPlant(x, z, maxD, ['rock', 'log'], (ch, kind, k, px, py, pz, s) => {
          if (kind === 'rock' && s < 0.35) return;
          const d = Math.hypot(px - x, pz - z);
          if (d < bd) {
            bd = d;
            best = { x: px, z: pz, r: kind === 'rock' ? s * 0.8 : 0.4 };
          }
        });
        return best;
      },
    };
  }

  env(x, z) {
    const gen = this.gen;
    const forest = gen.forest(x, z);
    return {
      forest,
      meadow: 1 - forest,
      edge: clamp(1 - Math.abs(forest - 0.45) * 2.4, 0, 1),
      conifer: smoothstep(-0.3, 0.3, gen.species(x, z)),
      moist: gen.moisture(x, z),
      path: gen.pathMask(x, z),
      high: smoothstep(5, 30, gen.height(x, z)),
    };
  }

  inView(x, y, z, r = 1) {
    const c = this.camera.position;
    if (Math.hypot(x - c.x, z - c.z) > 150) return false;
    _sphere.center.set(x, y + r * 0.5, z);
    _sphere.radius = r;
    return this.frustum.intersectsSphere(_sphere);
  }

  offscreenPoint(x, z, minD, maxD) {
    let p = null;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = rand(minD, maxD);
      const px = x + Math.sin(a) * d;
      const pz = z + Math.cos(a) * d;
      p = { x: px, z: pz };
      if (!this.inView(px, this.chunks.heightAt(px, pz), pz, 3)) return p;
    }
    return p;
  }

  // ── Spawning ──────────────────────────────────────────────────────────────
  count(kind) {
    let n = 0;
    for (const e of this.entities) if (e.kind === kind) n++;
    return n;
  }

  // A place for an arrival of this category: out of view (birds fly in, so
  // their spot can be anywhere near), on open ground, off any building site,
  // and not in the water.
  findSpot(cat) {
    const C = CATEGORIES[cat];
    const p = this.player.pos;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = cat === 'bird' ? rand(10, 32) : rand(C.near, C.far);
      const x = p.x + Math.sin(a) * d;
      const z = p.z + Math.cos(a) * d;
      if (cat !== 'bird' && this.inView(x, this.chunks.heightAt(x, z), z, 2.5)) continue;
      if (this.gen.padClearance(x, z) < 2) continue;
      if (this.chunks.waterAt(x, z, _wet) && _wet.depth > -0.3) continue;
      if (this.ctx.blocked(x, z, 0.6)) continue;
      return { x, z };
    }
    return null;
  }

  trySpawn(cat) {
    const hours = this.ctx.hours;
    const kinds = Object.values(SPECIES).filter((s) => s.cat === cat && this.time >= (this.rested[s.kind] ?? 0) && this.count(s.kind) < Math.max(1, Math.round(s.max * Math.min(2, this.density))));
    if (!kinds.length) return null;
    // a few candidate places; each species weighs how much it likes each
    const options = [];
    let total = 0;
    for (let i = 0; i < 4; i++) {
      const spot = this.findSpot(cat);
      if (!spot) continue;
      const env = this.env(spot.x, spot.z);
      for (const s of kinds) {
        const w = s.abundance * Math.max(0, s.habitat(env)) * ACTIVE[s.active](hours);
        if (w > 0.001) {
          options.push({ s, spot, env, w });
          total += w;
        }
      }
    }
    if (!options.length) return null;
    let r = Math.random() * total;
    for (const o of options) {
      r -= o.w;
      if (r <= 0) return this.spawnAt(o.s, o.spot, o.env);
    }
    const o = options[options.length - 1];
    return this.spawnAt(o.s, o.spot, o.env);
  }

  spawnAt(sp, spot, env = this.env(spot.x, spot.z)) {
    const p = this.player.pos;
    const ctx = this.ctx;
    const make = CLASSES.get(sp.cls ?? 'herd');
    if (!make) throw new Error(`species "${sp.kind}": no such class of animal "${sp.cls}"`);
    const toward = Math.atan2(p.x - spot.x, p.z - spot.z);
    const e = make({ wildlife: this, sp, spot, env, ctx, toward, player: p });
    for (const m of e.meshes) this.group.add(m);
    this.entities.push(e);
    this.rested[sp.kind] = this.time + (sp.rest ?? CATEGORIES[sp.cat].rest) / Math.max(0.5, this.density);
    return e;
  }

  // From the console: world.wildlife.spawn('moose', { dist: 25 }).
  // Turns up just out of view unless { here: true } (in front of you, or
  // `angle` radians round from straight ahead).
  spawn(kind, { dist, here = false, angle = 0.35 } = {}) {
    const sp = SPECIES[kind];
    if (!sp) return `no such animal: try ${Object.keys(SPECIES).join(', ')}`;
    const p = this.player.pos;
    const C = CATEGORIES[sp.cat];
    let spot;
    if (here) {
      const yaw = this.player.camYaw + Math.PI + angle;
      const d = dist ?? (sp.cat === 'small' || sp.cat === 'herp' || sp.cat === 'insect' ? 4 : 14);
      spot = { x: p.x + Math.sin(yaw) * d, z: p.z + Math.cos(yaw) * d };
    } else {
      const d = dist ?? rand(C.near, C.far);
      spot = this.offscreenPoint(p.x, p.z, d, d + 1);
    }
    const e = this.spawnAt(sp, spot);
    return `${e.label ?? kind} at ${spot.x.toFixed(0)}, ${spot.z.toFixed(0)}`;
  }

  list() {
    const p = this.player.pos;
    return this.entities.map((e) => ({ kind: e.kind, label: e.label, x: Math.round(e.x), z: Math.round(e.z), dist: Math.round(Math.hypot(e.x - p.x, e.z - p.z)), leaving: !!e.leaving }));
  }

  clear() {
    for (const e of this.entities) {
      for (const m of e.meshes) this.group.remove(m);
      e.dispose();
    }
    this.entities.length = 0;
  }

  // ── Per frame ─────────────────────────────────────────────────────────────
  update(dt, { hours, night }) {
    if (this.density <= 0 && !this.entities.length) return;
    this.time += dt;
    const ctx = this.ctx;
    ctx.dt = dt;
    ctx.time = this.time;
    ctx.hours = hours;
    ctx.night = night;

    const cam = this.camera;
    cam.updateMatrixWorld();
    this._pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this._pm);

    // who the animals are wary of
    const people = this.people;
    people.length = 0;
    const me = this.player;
    people.push({ x: me.pos.x, z: me.pos.z, speed: Math.hypot(me.vel.x, me.vel.z) });
    if (this.peers) for (const pr of this.peers.all.values()) people.push({ x: pr.pos.x, z: pr.pos.z, speed: pr.speed });

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      e.update(ctx);
      const d = ctx.distance(e.x, e.z);
      if (e.done || d > 180 || (e.leaving && d > 55 && !this.inView(e.x, e.y, e.z, 2))) {
        for (const m of e.meshes) this.group.remove(m);
        e.dispose();
        this.entities.splice(i, 1);
      }
    }

    if (this.density > 0) {
      for (const cat in CATEGORIES) {
        if (this.time < this.next[cat]) continue;
        const C = CATEGORIES[cat];
        this.next[cat] = this.time + (C.every / this.density) * rand(0.5, 1.5);
        let n = 0;
        for (const e of this.entities) if (e.sp.cat === cat) n++;
        if (n < Math.max(1, Math.round(C.cap * this.density))) this.trySpawn(cat);
      }
    }
    this.sightings();
  }

  // Is the ground in the way between the eye and (x, y, z)?
  lineOfSight(eye, x, y, z) {
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      const px = eye.x + (x - eye.x) * t;
      const pz = eye.z + (z - eye.z) * t;
      if (this.chunks.heightAt(px, pz) > eye.y + (y - eye.y) * t + 0.2) return false;
    }
    return true;
  }

  // When you're looking right at something, say what it is.
  sightings() {
    if (!this.hud || this.time < this.nextSight) return;
    const cam = this.camera;
    cam.getWorldDirection(_v);
    for (const e of this.entities) {
      if (e.announced || !e.label) continue;
      const sight = e.sp.sight ?? 30;
      const dx = e.x - cam.position.x;
      const dy = e.y + 0.4 - cam.position.y;
      const dz = e.z - cam.position.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > sight + 6) continue;
      if ((dx * _v.x + dy * _v.y + dz * _v.z) / d < 0.93) continue; // not in the middle of the view
      if (!this.lineOfSight(cam.position, e.x, e.y + 0.4, e.z)) continue;
      e.announced = true;
      this.nextSight = this.time + 7;
      this.seen.add(e.kind);
      this.hud.flash(e.label);
      return;
    }
  }
}
