// Birds in the world, as opposed to the ones you only hear (soundscape.js):
//
//   Flock  songbirds (or crows) that drop onto a clearing or a path, hop about
//          and peck, and burst up into the trees in a whirr of wings when you
//          come too close
//   Flit   one bird crossing between the trees in bounding flight
//   Soar   a red-tail circling high over the meadows, screaming now and then
//   Owl    a great horned owl ghosting across a clearing after dark

import { buildBird, BirdAnim } from './birds.js';
import { disposeAnimal } from './rig.js';
import { clamp, lerp } from '../noise.js';
import { rand, pick, wrapAngle as wrap } from '../core/geom.js';


// One bird's body in the air or on the ground.
class Bird {
  constructor(kind, x, y, z) {
    this.rig = buildBird(kind, (Math.random() * 1e9) | 0);
    this.anim = new BirdAnim(this.rig);
    this.mesh = this.rig.mesh;
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.yaw = Math.random() * 6.28;
    this.turn = 0;
    this.grounded = false;
    this.hopT = 0;
    this.timer = rand(0, 2);
  }

  // Fly toward a point at a cruising speed; `agility` is how hard it turns.
  fly(dt, tx, ty, tz, speed, agility = 2.5) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dz = tz - this.z;
    const d = Math.hypot(dx, dy, dz) + 1e-4;
    const sp = Math.min(speed, d * 2.2);
    const k = 1 - Math.exp(-dt * agility);
    this.vx = lerp(this.vx, (dx / d) * sp, k);
    this.vy = lerp(this.vy, (dy / d) * sp, k);
    this.vz = lerp(this.vz, (dz / d) * sp, k);
    this.integrate(dt);
    this.anim.wantFly = true;
    this.anim.flap = this.vy > 0.3 || sp < speed * 0.6 ? 1 : this.vy < -0.8 ? 0.15 : 0.7;
    return d;
  }

  integrate(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
    const h = Math.hypot(this.vx, this.vz);
    if (h > 0.2) {
      const want = Math.atan2(this.vx, this.vz);
      const d = wrap(want - this.yaw);
      this.yaw = wrap(this.yaw + d * Math.min(1, dt * 8));
      this.turn = lerp(this.turn, d / Math.max(dt, 1e-3), Math.min(1, dt * 4));
    }
    this.anim.climb = this.vy;
    this.anim.bank = clamp(-this.turn * 0.12, -0.9, 0.9);
  }

  pose(dt) {
    this.anim.update(dt);
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.yaw;
  }

  dispose() {
    disposeAnimal(this.mesh);
  }
}

// ── Flock ──────────────────────────────────────────────────────────────────
const FLOCK_KINDS = {
  meadow: ['robin', 'goldfinch', 'sparrow', 'junco'],
  edge: ['sparrow', 'junco', 'robin', 'cardinal', 'jay'],
  forest: ['chickadee', 'jay', 'junco'],
};

export class Flock {
  constructor(wl, sp, spot, env, ctx) {
    this.sp = sp;
    this.kind = sp.kind;
    this.crows = sp.kind === 'crows';
    const habitat = env.forest > 0.65 ? 'forest' : env.forest > 0.35 ? 'edge' : 'meadow';
    this.bird = this.crows ? 'crow' : pick(FLOCK_KINDS[habitat]);
    const n = this.crows ? Math.floor(rand(2, 5)) : this.bird === 'jay' || this.bird === 'cardinal' ? Math.floor(rand(1, 3)) : Math.floor(rand(3, 8));
    this.flushDist = this.crows ? 16 : this.bird === 'jay' ? 9 : 6.5;
    // where they'll land: never so close that they'd take off again at once
    const P = ctx.nearest(spot.x, spot.z);
    if (P.d < this.flushDist * 1.7) {
      const a = Math.atan2(spot.x - P.x, spot.z - P.z);
      const d = this.flushDist * rand(1.7, 2.3);
      spot = { x: P.x + Math.sin(a) * d, z: P.z + Math.cos(a) * d };
    }
    this.home = spot;
    this.state = 'arrive';
    this.t = 0;
    this.life = rand(30, 90);
    this.birds = [];
    this.meshes = [];
    this.done = false;
    this.leaving = false;
    // they come in from out of view, high, and drop down
    const from = ctx.offscreenPoint(spot.x, spot.z, 45, 65);
    const fy = ctx.ground(from.x, from.z) + rand(10, 16);
    for (let i = 0; i < n; i++) {
      const b = new Bird(this.bird, from.x + rand(-3, 3), fy + rand(-1.5, 1.5), from.z + rand(-3, 3));
      const a = rand(0, Math.PI * 2);
      const r = Math.sqrt(Math.random()) * (this.crows ? 6 : 3);
      b.spot = { x: spot.x + Math.cos(a) * r, z: spot.z + Math.sin(a) * r };
      b.lag = rand(0, 0.8);
      this.birds.push(b);
      this.meshes.push(b.mesh);
    }
    this.label = this.crows ? 'crows' : labelFor(this.bird, n);
    this.nextSong = rand(2, 6);
    // crows often just pass over, calling
    this.passing = this.crows && Math.random() < 0.45;
    if (this.passing) {
      this.state = 'pass';
      const to = { x: spot.x + (spot.x - from.x), z: spot.z + (spot.z - from.z) };
      this.passTo = to;
    }
  }

  get x() {
    return this.birds.length ? this.birds[0].x : this.home.x;
  }
  get z() {
    return this.birds.length ? this.birds[0].z : this.home.z;
  }
  get y() {
    return this.birds.length ? this.birds[0].y : 0;
  }

  update(ctx) {
    const dt = ctx.dt;
    this.t += dt;
    this.life -= dt;
    const P = ctx.nearest(this.home.x, this.home.z);
    const loud = P.speed > 4.5 ? 1.6 : 1;
    if ((this.state === 'arrive' || this.state === 'forage') && (P.d / loud < this.flushDist || this.life < 0)) this.flush(ctx, P);

    this.nextSong -= dt;
    if (this.nextSong < 0 && this.birds.length) {
      this.nextSong = rand(4, 12);
      const b = pick(this.birds);
      if (this.crows) ctx.call('caw', b.x, b.y + 0.3, b.z);
      else if (!ctx.night) ctx.call('song', b.x, b.y + 0.2, b.z, { song: pick(['chips', 'chips', 'whistle', 'trill']) });
    }

    let gone = 0;
    for (const b of this.birds) {
      const g = ctx.ground(b.x, b.z);
      if (this.state === 'pass') {
        const tx = this.passTo.x;
        const tz = this.passTo.z;
        b.fly(dt, tx + b.lag * 4, ctx.ground(tx, tz) + 18, tz + b.lag * 3, 9, 1.5);
        if (Math.hypot(b.x - tx, b.z - tz) < 6) gone++;
      } else if (this.state === 'flush') {
        const t = b.flee;
        b.fly(dt, t.x, t.y, t.z, this.crows ? 10 : 9, 3);
        if (Math.hypot(b.x - t.x, b.z - t.z) < 3) gone++;
      } else if (!b.grounded) {
        // coming in to land on its spot
        if (this.t < b.lag) {
          b.fly(dt, b.x + b.vx, b.y, b.z + b.vz, 6);
        } else {
          const sy = ctx.ground(b.spot.x, b.spot.z);
          const hd = Math.hypot(b.spot.x - b.x, b.spot.z - b.z);
          b.fly(dt, b.spot.x, sy + Math.min(6, hd * 0.35), b.spot.z, this.crows ? 8 : 7, 3);
          if (hd < 0.6 && b.y < sy + 0.5) {
            b.grounded = true;
            b.y = sy;
            b.vx = b.vy = b.vz = 0;
            b.anim.wantFly = false;
            this.state = 'forage';
          }
        }
        if (b.y < g) b.y = g;
      } else {
        this.forage(ctx, b, g);
      }
      b.pose(dt);
    }
    if ((this.state === 'flush' || this.state === 'pass') && (gone === this.birds.length || this.t > 25)) this.done = true;
  }

  // On the ground: hop, peck, look about; now and then flit to a new spot.
  forage(ctx, b, g) {
    const dt = ctx.dt;
    b.timer -= dt;
    const a = b.anim;
    a.peck = Math.max(0, a.peck - dt * 6);
    if (b.hopT > 0) {
      // mid-hop
      b.hopT -= dt;
      const u = 1 - b.hopT / 0.18;
      a.hop = Math.sin(Math.PI * clamp(u, 0, 1));
      const sp = this.crows ? 0.5 : 0.9;
      b.x += Math.sin(b.yaw) * sp * dt;
      b.z += Math.cos(b.yaw) * sp * dt;
    } else a.hop = 0;
    if (b.timer < 0) {
      const r = Math.random();
      if (r < 0.45) a.peck = 1;
      else if (r < 0.8) {
        b.yaw += rand(-1.2, 1.2);
        // stay near the spot
        const dx = this.home.x - b.x;
        const dz = this.home.z - b.z;
        if (dx * dx + dz * dz > 16) b.yaw = Math.atan2(dx, dz) + rand(-0.5, 0.5);
        b.hopT = 0.18;
      } else if (r < 0.95) a.lookYaw = rand(-1, 1);
      else {
        // a short flight to somewhere else nearby
        b.grounded = false;
        const ang = rand(0, Math.PI * 2);
        b.spot = { x: this.home.x + Math.cos(ang) * rand(0.5, 3.5), z: this.home.z + Math.sin(ang) * rand(0.5, 3.5) };
        b.vy = 2.5;
      }
      b.timer = this.crows ? rand(0.6, 2) : rand(0.25, 1.1);
    }
    b.y = g;
  }

  flush(ctx, P) {
    this.state = 'flush';
    this.leaving = true;
    this.t = 0;
    const away = Math.atan2(this.home.x - P.x, this.home.z - P.z);
    const cx = this.home.x + Math.sin(away) * rand(45, 70);
    const cz = this.home.z + Math.cos(away) * rand(45, 70);
    for (const b of this.birds) {
      b.grounded = false;
      b.vy = rand(2.5, 4);
      b.flee = { x: cx + rand(-8, 8), y: ctx.ground(cx, cz) + rand(9, 16), z: cz + rand(-8, 8) };
    }
    ctx.call('flush', this.home.x, ctx.ground(this.home.x, this.home.z) + 0.5, this.home.z, { count: Math.min(8, this.birds.length + 1) });
    if (this.crows) ctx.call('caw', this.home.x, ctx.ground(this.home.x, this.home.z) + 1, this.home.z, { delay: 0.3 });
  }

  // A sudden loud noise from (x, z): up off the ground and away from it.
  startle(x, z, ctx) {
    if (this.state === 'arrive' || this.state === 'forage') this.flush(ctx, { x, z });
  }

  dispose() {
    for (const b of this.birds) b.dispose();
  }
}

function labelFor(kind, n) {
  const names = { robin: 'robins', goldfinch: 'goldfinches', sparrow: 'sparrows', junco: 'juncos', cardinal: 'cardinals', jay: 'blue jays', chickadee: 'chickadees' };
  const one = { robin: 'a robin', goldfinch: 'a goldfinch', sparrow: 'a sparrow', junco: 'a junco', cardinal: 'a cardinal', jay: 'a blue jay', chickadee: 'a chickadee' };
  return n > 1 ? names[kind] : one[kind];
}

// ── Flit: one bird crossing between the trees ──────────────────────────────
export class Flit {
  constructor(wl, sp, spot, env, ctx) {
    this.sp = sp;
    this.kind = sp.kind;
    const kind = pick(env.forest > 0.5 ? ['chickadee', 'jay', 'cardinal', 'robin', 'junco'] : ['goldfinch', 'robin', 'sparrow', 'cardinal']);
    const from = ctx.offscreenPoint(spot.x, spot.z, 25, 40);
    const a = Math.atan2(spot.x - from.x, spot.z - from.z) + rand(-0.4, 0.4);
    const d = rand(30, 55);
    this.to = { x: spot.x + Math.sin(a) * d * 0.5, z: spot.z + Math.cos(a) * d * 0.5 };
    this.alt = rand(5, 11);
    this.b = new Bird(kind, from.x, ctx.ground(from.x, from.z) + this.alt, from.z);
    this.meshes = [this.b.mesh];
    this.done = false;
    this.leaving = false; // passing through: free to vanish once it's gone by
    this.label = labelFor(kind, 1);
    this.t = 0;
  }
  get x() {
    return this.b.x;
  }
  get y() {
    return this.b.y;
  }
  get z() {
    return this.b.z;
  }
  update(ctx) {
    this.t += ctx.dt;
    const b = this.b;
    this.leaving = this.t > 5;
    const ty = ctx.ground(b.x, b.z) + this.alt + Math.sin(this.t * 4) * 0.5;
    const d = b.fly(ctx.dt, this.to.x, ty, this.to.z, 8, 2);
    b.pose(ctx.dt);
    if (d < 2 || this.t > 20) this.done = true;
  }
  dispose() {
    this.b.dispose();
  }
}

// ── Soar: a hawk circling high ─────────────────────────────────────────────
export class Soar {
  constructor(wl, sp, spot, env, ctx) {
    this.sp = sp;
    this.kind = sp.kind;
    this.c = { x: spot.x, z: spot.z };
    this.R = rand(22, 38);
    this.alt = rand(26, 42);
    this.dir = Math.random() < 0.5 ? 1 : -1;
    const from = ctx.offscreenPoint(spot.x, spot.z, 90, 120);
    this.b = new Bird('hawk', from.x, ctx.ground(from.x, from.z) + this.alt + 10, from.z);
    this.b.anim.flapRate = 3;
    this.meshes = [this.b.mesh];
    this.life = rand(70, 160);
    this.done = false;
    this.leaving = false;
    this.label = 'a red-tailed hawk';
    this.ang = Math.atan2(from.x - spot.x, from.z - spot.z);
    this.nextCall = rand(5, 20);
    this.flapT = 0;
    this.t = 0;
  }
  get x() {
    return this.b.x;
  }
  get y() {
    return this.b.y;
  }
  get z() {
    return this.b.z;
  }
  update(ctx) {
    const dt = ctx.dt;
    this.t += dt;
    this.life -= dt;
    const b = this.b;
    const g = ctx.ground(this.c.x, this.c.z);
    let tx;
    let tz;
    let ty;
    if (this.life > 0) {
      // ride the thermal: round and round, drifting slowly downwind
      this.ang += (this.dir * 9.5 * dt) / this.R;
      this.c.x += dt * 0.4;
      this.c.z += dt * 0.18;
      tx = this.c.x + Math.sin(this.ang + this.dir * 0.4) * this.R;
      tz = this.c.z + Math.cos(this.ang + this.dir * 0.4) * this.R;
      ty = g + this.alt + Math.sin(this.t * 0.2) * 3;
    } else {
      this.leaving = true;
      tx = b.x + b.vx * 10;
      tz = b.z + b.vz * 10;
      ty = b.y + 2;
      if (ctx.nearest(b.x, b.z).d > 160) this.done = true;
    }
    b.fly(dt, tx, ty, tz, 10, 1.2);
    // mostly gliding; a few deep beats now and then
    this.flapT -= dt;
    if (this.flapT < -rand(6, 14)) this.flapT = rand(0.8, 1.6);
    b.anim.flap = this.flapT > 0 ? 0.8 : 0;
    b.anim.bank = clamp(-b.turn * 0.25, -0.5, 0.5);
    b.pose(dt);
    this.nextCall -= dt;
    if (this.nextCall < 0) {
      this.nextCall = rand(15, 40);
      ctx.call('hawk', b.x, b.y, b.z);
    }
  }
  dispose() {
    this.b.dispose();
  }
}

// ── Owl: a silent glide across a clearing at night ─────────────────────────
export class Owl {
  constructor(wl, sp, spot, env, ctx) {
    this.sp = sp;
    this.kind = sp.kind;
    const from = ctx.offscreenPoint(spot.x, spot.z, 35, 50);
    const a = Math.atan2(spot.x - from.x, spot.z - from.z);
    this.to = { x: spot.x + Math.sin(a) * rand(30, 45), z: spot.z + Math.cos(a) * rand(30, 45) };
    this.alt = rand(4.5, 8);
    this.b = new Bird('owl', from.x, ctx.ground(from.x, from.z) + this.alt + 2, from.z);
    this.b.anim.flapRate = 2.6;
    this.meshes = [this.b.mesh];
    this.done = false;
    this.leaving = false;
    this.label = 'a great horned owl';
    this.t = 0;
    this.hooted = false;
    ctx.call('hoot', from.x, ctx.ground(from.x, from.z) + 8, from.z);
  }
  get x() {
    return this.b.x;
  }
  get y() {
    return this.b.y;
  }
  get z() {
    return this.b.z;
  }
  update(ctx) {
    this.t += ctx.dt;
    const b = this.b;
    this.leaving = this.t > 8;
    const ty = ctx.ground(b.x, b.z) + this.alt;
    const d = b.fly(ctx.dt, this.to.x, ty, this.to.z, 6.5, 1.6);
    b.anim.flap = Math.sin(this.t * 0.9) > 0.1 ? 0.9 : 0;
    b.pose(ctx.dt);
    if (!this.hooted && d < 15) {
      this.hooted = true;
      ctx.call('hoot', this.to.x, ctx.ground(this.to.x, this.to.z) + 8, this.to.z, { delay: 3 });
    }
    if (d < 2 || this.t > 25) this.done = true;
  }
  dispose() {
    this.b.dispose();
  }
}
