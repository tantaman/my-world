// The cave: somewhere at the bottom of the nearest cave is an old strongbox,
// left there long ago. Go down and get it, and bring it back up into the
// daylight. Bats roost in the rooms on the way, and your lamp sets them off;
// put it out (K) and creep past. The roof comes down in places as you pass:
// when you hear it go, move. And something big is asleep down there beside
// the strongbox. It won't stay asleep when you take it.
//
// You're sent to the cave's mouth first; it begins as you get there.

import * as THREE from 'three';
import { Prowler } from './prowler.js';
import { prowlerWorld, asTarget } from './hunted.js';
import { Puffs, Flying } from './fx.js';
import { farthest } from '../caves/sites.js';
import { Mesher } from '../build/geometry.js';
import { rand } from '../core/geom.js';

const FIND = 900; // m: the nearest cave this near
const AT_MOUTH = 14; // m from its mouth it begins
const REACH = 1.9; // m from the strongbox you can take it
const STIRS = 1.6; // s after you take it the bear wakes
const OUT = 9; // m out past the mouth, in daylight, with it: done
const BATS = { n: 11, notice: 9, close: 3.5, swarm: 7, calm: 35, nip: 2, every: [0.7, 1.4] }; // per room; m with the lamp on, m without; s; s; health; s
const FALL = { n: 3, trip: 2.6, warn: 1.3, reach: 2.6, hurt: 26 }; // places; m; s; m; health
const _in = { floor: 0, roof: Infinity };
const _wall = { d: 0, nx: 0, nz: 0 };

export const dungeon = {
  id: 'cave',
  title: 'The cave',
  blurb: 'At the bottom of the nearest cave is an old strongbox. Go down, past the bats and the falling rock, take it from beside what sleeps there, and bring it out alive.',
  where(kit, from) {
    if (kit.player.space && kit.player.space.cave) return null;
    const near = kit.caves.nearest(from.x, from.z, FIND);
    if (!near) return { none: 'no cave near enough · try it in the hills' };
    const m = near.cave.mouth;
    return { x: m.x - m.ux * 4, z: m.z - m.uz * 4, label: near.cave.name || 'the cave', near: AT_MOUTH, objective: `get to the mouth of ${near.cave.name || 'the cave'}`, cave: near.cave };
  },
  start: (kit, { at, from }) => {
    const cave = (at && at.cave) || (kit.player.space && kit.player.space.cave) || kit.caves.nearest(from.x, from.z, FIND)?.cave;
    return new Dungeon(kit, cave);
  },
};

class Dungeon {
  constructor(kit, cave) {
    this.kit = kit;
    this.cave = cave;
    this.t = 0;
    kit.caves.ensure(cave.nodes[1].x, cave.nodes[1].z);
    const N = cave.nodes;
    const far = farthest(cave);
    this.box = { x: N[far].x, z: N[far].z, y: N[far].floor, held: false };
    this.boxMesh = makeStrongbox();
    this.boxMesh.position.set(this.box.x, this.box.y, this.box.z);
    this.boxMesh.rotation.y = rand(0, Math.PI * 2);
    kit.scene.add(this.boxMesh);
    this.puffs = new Puffs(kit.scene, 220);
    this.rocks = new Flying(kit.scene, 120);
    this.floor = (x, z, y = Infinity) => (kit.spaces.at(x, z, y + 0.6, _in) ? _in.floor : kit.ground(x, z));

    // ── What sleeps beside it ───────────────────────────────────────────────
    // a few metres off, back toward the way in
    const back = N[this._parent(far)] || N[0];
    const dx = back.x - this.box.x;
    const dz = back.z - this.box.z;
    const dl = Math.hypot(dx, dz) || 1;
    const bx = this.box.x + (dx / dl) * 3.5 - (dz / dl) * 2.2;
    const bz = this.box.z + (dz / dl) * 3.5 + (dx / dl) * 2.2;
    this.bear = new Prowler('bear', bx, bz, this._world(), { asleep: true, scale: 1.2 });
    this.bear.label = 'the cave bear';
    this.bear.yaw = Math.atan2(this.box.x - bx, this.box.z - bz);
    this.bear.mesh.position.y = this.floor(bx, bz, this.box.y);
    kit.scene.add(this.bear.mesh);
    this.bearDown = false;
    this.off = kit.targets.add(asTarget(this.bear, () => (this.bearDown = true)));
    this.stirIn = -1;

    // ── Bats in the rooms on the way ────────────────────────────────────────
    this.colonies = [];
    for (const r of cave.rooms) {
      if (r.node === far) continue;
      const n = N[r.node];
      const roof = kit.spaces.at(n.x, n.z, n.floor + 0.6, _in) ? Math.min(_in.roof, n.floor + 4) : n.floor + 3;
      this.colonies.push({ x: n.x, z: n.z, y: roof - 0.3, floor: n.floor, state: 'roost', t: 0, nip: 0 });
    }
    this.bats = new Bats(kit.scene, this.colonies.length * BATS.n);

    // ── Where the roof comes down ───────────────────────────────────────────
    // on the passages, between the first stretch and the far end
    const total = N[far].d;
    const spots = cave.passages
      .slice(1)
      .map((p) => ({ a: N[p.a], b: N[p.b] }))
      .filter(({ a, b }) => (a.d + b.d) / 2 > total * 0.2 && (a.d + b.d) / 2 < total * 0.85)
      .sort(() => Math.random() - 0.5)
      .slice(0, FALL.n);
    this.falls = spots.map(({ a, b }) => {
      const k = rand(0.3, 0.7);
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, floor: a.floor + (b.floor - a.floor) * k, armed: true, warn: -1 };
    });
    kit.say(`${cave.name || 'the cave'} · the strongbox is at the bottom`, 3000);
  }

  _parent(i) {
    for (const p of this.cave.passages) {
      if (p.b === i) return p.a;
      if (p.a === i) return p.b;
    }
    return 0;
  }

  // The bear's world: the cave's floor under it and its walls round it.
  _world() {
    const kit = this.kit;
    const self = this;
    const w = prowlerWorld(kit);
    const base = w.ctx;
    const ctx = Object.create(base);
    ctx.ground = (x, z) => self.floor(x, z, self.bear ? self.bear.mesh.position.y : self.box.y);
    ctx.blocked = (x, z, r) => {
      const s = kit.spaces.at(x, z, (self.bear ? self.bear.mesh.position.y : self.box.y) + 0.6, _in);
      if (!s) return base.blocked(x, z, r);
      s.walls(x, z, _wall);
      return _wall.d < r ? { x: x - _wall.nx, z: z - _wall.nz } : null;
    };
    ctx.pushOut = (e, r) => {
      const s = kit.spaces.at(e.x, e.z, e.mesh.position.y + 0.6, _in);
      if (!s) return base.pushOut.call(ctx, e, r);
      s.walls(e.x, e.z, _wall);
      if (_wall.d < r && Number.isFinite(_wall.d)) {
        e.x += _wall.nx * (r - _wall.d);
        e.z += _wall.nz * (r - _wall.d);
      }
    };
    w.ctx = ctx;
    return w;
  }

  objective() {
    return this.box.held ? 'get the strongbox out into the daylight' : 'find the strongbox at the bottom of the cave';
  }

  left() {
    return null;
  }

  guide() {
    if (this.box.held) {
      const m = this.cave.mouth;
      return { x: m.x - m.ux * OUT, z: m.z - m.uz * OUT, label: 'the way out' };
    }
    return { x: this.box.x, z: this.box.z, label: 'the strongbox' };
  }

  note() {
    const b = this.bear;
    if (!this.bearDown && (b.mind === 'charge' || b.mind === 'pounce')) return 'the bear is coming!';
    if (this.colonies.some((c) => c.state === 'swarm')) return 'bats! · put your lamp out (K) and get through';
    if (this.box.held) return this.bearDown ? 'the way out is clear' : 'it is awake · rifle on 0';
    if (!this.kit.player.space) return 'go on in';
    return this.kit.headlamp && this.kit.headlamp.on ? 'bats roost in the rooms · your lamp sets them off' : 'in the dark';
  }

  update(dt) {
    const kit = this.kit;
    this.t += dt;
    const P = kit.player.pos;
    const inside = !!kit.player.space;

    // ── The strongbox ───────────────────────────────────────────────────────
    if (!this.box.held && Math.hypot(P.x - this.box.x, P.z - this.box.z) < REACH && Math.abs(P.y - this.box.y) < 2) {
      this.box.held = true;
      this.boxMesh.visible = false;
      kit.sound.sfx('thud', { size: 0.4 });
      kit.say('you have the strongbox · now get it out', 2600);
      if (!this.bearDown && this.bear.mind === 'sleep') this.stirIn = STIRS;
      for (const f of this.falls) f.armed = true; // the way back is no safer
    }
    if (this.stirIn > 0) {
      this.stirIn -= dt;
      if (this.stirIn <= 0 && this.bear.mind === 'sleep') this.bear.heard(P.x, P.z);
    }
    if (!this.bearDown) this.bear.update(dt);
    else if (!this.tipped) this._tip(dt);

    this.bats.update(dt);
    this._bats(dt, P, inside);
    this._falls(dt, P, inside);
    this.puffs.update(dt, kit.sky);
    this.rocks.update(dt, (x, z) => this.floor(x, z, P.y));

    if (this.box.held && !inside) {
      const m = this.cave.mouth;
      if (Math.hypot(P.x - m.x, P.z - m.z) > OUT) return { won: 'you brought the strongbox up into the daylight · it is full of old silver' };
    }
    return null;
  }

  // Down in the cave: it rolls onto its side where it fell.
  _tip(dt) {
    const b = this.bear;
    this.tipT = (this.tipT || 0) + dt;
    const k = Math.min(1, this.tipT / 0.5);
    b.mesh.rotation.order = 'YXZ';
    b.mesh.rotation.z = (Math.PI / 2) * k * k;
    b.mesh.position.y = this.floor(b.x, b.z, b.mesh.position.y) + b.torso.r * k;
    if (k >= 1) this.tipped = true;
  }

  // ── Bats ──────────────────────────────────────────────────────────────────
  _bats(dt, P, inside) {
    const kit = this.kit;
    const lamp = kit.headlamp && kit.headlamp.on;
    for (const c of this.colonies) {
      c.t += dt;
      const d = Math.hypot(P.x - c.x, P.z - c.z);
      if (c.state === 'roost' && inside && (d < BATS.close || (lamp && d < BATS.notice))) {
        c.state = 'swarm';
        c.t = 0;
        c.nip = rand(BATS.every[0], BATS.every[1]);
        kit.sound.call('bats', c.x, c.y, c.z);
      } else if (c.state === 'swarm') {
        c.nip -= dt;
        if (c.nip <= 0 && d < 6) {
          c.nip = rand(BATS.every[0], BATS.every[1]);
          kit.hurt(BATS.nip, 'bitten and battered by bats');
          if (Math.random() < 0.5) kit.sound.call('bats', P.x, P.y + 1.5, P.z);
        }
        if (c.t > BATS.swarm) {
          c.state = 'calm';
          c.t = 0;
        }
      } else if (c.state === 'calm' && c.t > BATS.calm) c.state = 'roost';
    }
    this.bats.place(this.colonies, P);
  }

  // ── Falling rock ──────────────────────────────────────────────────────────
  _falls(dt, P, inside) {
    const kit = this.kit;
    for (const f of this.falls) {
      if (f.armed && inside && Math.hypot(P.x - f.x, P.z - f.z) < FALL.trip) {
        f.armed = false;
        f.warn = FALL.warn;
        kit.sound.call('crash', f.x, f.floor + 2.5, f.z, { gain: 0.4 });
        kit.sound.sfx('rumble', { size: 0.3 });
        kit.say('the roof is coming down · move!', 1600);
        for (let i = 0; i < 14; i++) this.puffs.add({ x: f.x + rand(-1.5, 1.5), y: f.floor + 2.6, z: f.z + rand(-1.5, 1.5), vx: 0, vy: -1, vz: 0, size: rand(0.6, 1.4), grow: 0.5, life: rand(1.5, 2.5), alpha: 0.4, color: 0x9a8e7c, drag: 1 });
      }
      if (f.warn > 0) {
        f.warn -= dt;
        if (f.warn <= 0) {
          kit.sound.call('crash', f.x, f.floor + 1, f.z);
          for (let i = 0; i < 16; i++) {
            const s = rand(0.25, 0.7);
            this.rocks.add({ x: f.x + rand(-FALL.reach, FALL.reach) * 0.8, y: f.floor + rand(2.2, 3.2), z: f.z + rand(-FALL.reach, FALL.reach) * 0.8, vx: rand(-0.5, 0.5), vy: 0, vz: rand(-0.5, 0.5), size: [s, s * 0.7, s], color: 0x7a7266, life: 600, spin: rand(1, 4) });
          }
          for (let i = 0; i < 12; i++) this.puffs.add({ x: f.x + rand(-2, 2), y: f.floor + rand(0.2, 1.5), z: f.z + rand(-2, 2), vx: rand(-1.5, 1.5), vy: rand(0.2, 0.8), vz: rand(-1.5, 1.5), size: rand(1, 2), grow: 0.8, life: rand(2, 3.5), alpha: 0.45, color: 0xa89c88, drag: 0.8 });
          if (Math.hypot(P.x - f.x, P.z - f.z) < FALL.reach && Math.abs(P.y - f.floor) < 2.5) kit.hurt(FALL.hurt, 'caught under falling rock');
        }
      }
    }
  }

  dispose() {
    const kit = this.kit;
    this.off();
    kit.scene.remove(this.boxMesh);
    this.boxMesh.geometry.dispose();
    kit.scene.remove(this.bear.mesh);
    this.bear.dispose();
    this.bats.dispose();
    this.puffs.dispose();
    this.rocks.dispose();
  }
}

// ── The strongbox ───────────────────────────────────────────────────────────
// An old iron-bound chest, built round its own foot.
const STRONGBOX_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1 });
function makeStrongbox() {
  const m = new Mesher();
  const wood = new THREE.Color(0x5a3a22);
  const iron = new THREE.Color(0x2a2624);
  const brass = new THREE.Color(0xb08a3a);
  const put = (w, h, d, x, y, z, color) => m.add(new THREE.BoxGeometry(w, h, d), new THREE.Matrix4().makeTranslation(x, y, z), (p, n, out) => out.copy(color));
  put(0.8, 0.42, 0.5, 0, 0.21, 0, wood);
  put(0.84, 0.14, 0.54, 0, 0.49, 0, wood); // the lid
  for (const x of [-0.3, 0, 0.3]) put(0.05, 0.6, 0.56, x, 0.3, 0, iron);
  put(0.12, 0.12, 0.04, 0, 0.38, 0.27, brass); // the lock
  const mesh = new THREE.Mesh(m.build(), STRONGBOX_MAT);
  mesh.castShadow = true;
  mesh.name = 'strongbox';
  return mesh;
}

// ── Bats ────────────────────────────────────────────────────────────────────
// Little dark wings, hung from the roofs of the rooms, and whirling round you
// when set off. Flapping is the wings narrowing and widening, which at the
// size they're seen is all a wingbeat is.
class Bats {
  constructor(scene, max) {
    const g = new THREE.BufferGeometry();
    // a body and two wings, flat, about 30 cm across
    const v = [0, 0, -0.06, 0, 0, 0.06, -0.16, 0, 0.0, 0, 0, -0.06, 0.16, 0, 0.0, 0, 0, 0.06, -0.16, 0, 0, -0.08, 0, 0.05, 0, 0, 0.03, 0.16, 0, 0, 0, 0, 0.03, 0.08, 0, 0.05];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 1, side: THREE.DoubleSide }), Math.max(1, max));
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.scene = scene;
    this.bats = [];
    for (let i = 0; i < max; i++) this.bats.push({ x: 0, y: 0, z: 0, a: rand(0, 6.28), r: rand(0.4, 1.2), h: rand(-0.3, 0.3), s: rand(2, 4), ph: rand(0, 6.28), dx: rand(-1.5, 1.5), dz: rand(-1.5, 1.5) });
    this.t = 0;
    this.dt = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  // Each colony's bats: hung up at its roost, or round you.
  place(colonies, P) {
    let i = 0;
    const at = this.mesh.position;
    if (colonies.length) at.set(Math.round(colonies[0].x), 0, Math.round(colonies[0].z));
    for (const c of colonies) {
      for (let k = 0; k < BATS.n; k++, i++) {
        const b = this.bats[i];
        const swarm = c.state === 'swarm';
        const tx = swarm ? P.x + Math.cos(b.a) * b.r * 1.6 : c.x + b.dx;
        const ty = swarm ? P.y + 1.4 + b.h + Math.sin(b.a * 2) * 0.4 : c.y;
        const tz = swarm ? P.z + Math.sin(b.a) * b.r * 1.6 : c.z + b.dz;
        const k2 = swarm || c.state === 'calm' ? 0.12 : 0.04;
        b.x += (tx - b.x) * k2;
        b.y += (ty - b.y) * k2;
        b.z += (tz - b.z) * k2;
        if (!b.init) {
          b.init = true;
          b.x = tx;
          b.y = ty;
          b.z = tz;
        }
        b.a += (swarm ? b.s : c.state === 'calm' ? b.s * 0.5 : 0) * this.dt;
        const flying = c.state !== 'roost' || Math.hypot(b.x - tx, b.z - tz) > 0.3;
        const flap = flying ? 0.35 + 0.65 * Math.abs(Math.sin(this.t * 22 + b.ph)) : 0.25;
        this._q.setFromEuler(this._e.set(flying ? 0.2 : Math.PI / 2, b.a, 0));
        this._m.compose(this._p.set(b.x - at.x, b.y, b.z - at.z), this._q, this._s.set(flap, 1, 1));
        this.mesh.setMatrixAt(i, this._m);
      }
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    this.t += dt;
    this.dt = dt;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
