// A bear or a mountain lion that has decided you are its business. The body
// and the gait are the forest's own (wildlife/beasts.js, quadruped.js); the
// brain is this one's:
//
//   stalk     it keeps its distance, circling, out of your sight if it can:
//             a twig snaps, it huffs or snarls somewhere you can't see
//   charge    then it comes, flat out. A bear may stop short if you stand
//             your ground and face it (a bluff); a lion only comes from
//             behind, and turns off if you face it in time
//   maul      if it reaches you it knocks you flat and hurts you, then backs
//             off, and starts over
//   back      backing off: from a mauling, a shot, a fire you stand by
//   sleep     (in a cave) curled up, until you come too close or too loud
//   down      shot enough times, it goes down
//
// A burning campfire keeps it off: it won't come within FIRE_KEEPS of one.
// It can be shot: it is a target for the rifle (hunting/shot.js Targets).
//
//   const p = new Prowler('bear', x, z, world)
//   p.update(dt)        every frame
//   p.hit(o, d, far)    where a shot along o + d·t meets it, or null
//   p.shot()            -> 'down' | 'hurt'
//   p.heard(x, z)       a shot from (x, z)
//
// world: what it needs to know and do
//   ctx         ground, blocked, pushOut, call (as wildlife/wildlife.js makes them)
//   you()       -> { x, z, y, speed, facing: { x, z } (the way the camera looks), seen: (x, y, z) => in view }
//   fire(x, z)  -> a burning campfire near there, { x, z }, or null
//   maul(n, from, why)   it has got you
//   say(msg)

import { Beast } from '../wildlife/beasts.js';
import { SPECIES } from '../wildlife/species.js';
import { rand, wrapAngle } from '../core/geom.js';

const KINDS = {
  bear: { hp: 3, maul: 30, why: 'mauled by the bear', stalk: [32, 50], charge: 1, reach: 2.1, roar: 'roar', growl: 'huff', bluff: 0.45, label: 'the black bear', scale: 1.12 },
  cougar: { hp: 2, maul: 24, why: 'taken down by the mountain lion', stalk: [26, 42], charge: 1, reach: 2.4, roar: 'snarl', growl: 'snarl', bluff: 0, label: 'the mountain lion', scale: 1.05, pounce: 6 },
};
const STALK_FOR = [14, 30]; // s it circles before it comes
const BACK_FOR = [4, 7]; // s it backs off for
const BACK_TO = 38; // m it backs off to
const FACED = 0.9; // cos of the angle within which you're facing it
const FACED_NEAR = 16; // m: a lion this near, faced, turns off
const STAND = 0.6; // m/s: slower than this, you're standing your ground
const FIRE_KEEPS = 10; // m it keeps from a burning fire
const WAKE = { near: 4, loud: 10, loud_speed: 4 }; // m it wakes at, and running nearer than loud
const SOUND_EVERY = [5, 11]; // s between its sounds while it stalks
const STAGGER = 0.7; // s it reels when hit

export class Prowler extends Beast {
  constructor(kind, x, z, world, { asleep = false, scale } = {}) {
    const K = KINDS[kind];
    const sp = { ...SPECIES[kind], member: () => ({ scale: scale ?? K.scale }) };
    const group = { size: 1, members: [] };
    super(sp, x, z, 0, group, 0, null);
    group.members.push(this);
    this.K = K;
    this.world = world;
    this.hp = K.hp;
    this.label = K.label;
    this.mind = asleep ? 'sleep' : 'stalk';
    this.for = asleep ? Infinity : rand(STALK_FOR[0], STALK_FOR[1]);
    this.side = Math.random() < 0.5 ? 1 : -1;
    this.nextSound = rand(3, 6);
    this.reel = 0;
    this.down = false;
    this.bluffed = false;
    this.time = 0;
  }

  get y() {
    return this.mesh.position.y;
  }

  // ── Being shot ────────────────────────────────────────────────────────────
  shot() {
    if (this.down) return 'down';
    this.hp--;
    this.reel = STAGGER;
    if (this.hp <= 0) {
      this.down = true;
      this.mind = 'down';
      return 'down';
    }
    this.call(this.ctx, 'alert');
    this._sound(this.K.roar);
    // a hurt bear may come for you there and then; a lion slinks off
    if (this.kind === 'bear' && Math.random() < 0.5) this._set('charge');
    else this._set('back', rand(BACK_FOR[0], BACK_FOR[1]) + 3);
    return 'hurt';
  }

  heard(x, z) {
    if (this.down) return;
    if (this.mind === 'sleep') return this._wake();
    // a shot near makes it think again, unless it's already coming
    if (this.mind === 'stalk' && Math.hypot(x - this.x, z - this.z) < 60) this._set('back', rand(2, 4));
  }

  _wake() {
    this._sound(this.K.roar);
    this.world.say(`${this.label} is awake`);
    this._set('charge');
  }

  _set(mind, dur = Infinity) {
    this.mind = mind;
    this.for = dur;
    this.bluffed = false;
  }

  _sound(kind) {
    if (this.ctx) this.ctx.call(kind, this.x, this.mesh.position.y + this.height, this.z, { size: 1 });
  }

  // ── Every frame ───────────────────────────────────────────────────────────
  update(dt) {
    const ctx = this.world.ctx;
    ctx.dt = dt;
    this.ctx = ctx;
    this.time += dt;
    this.for -= dt;
    const P = this.world.you();
    const dx = P.x - this.x;
    const dz = P.z - this.z;
    const d = Math.hypot(dx, dz);
    const pose = this.pose;
    pose.graze = pose.alert = pose.rear = pose.crouch = pose.tailUp = pose.air = pose.lift = pose.lookPitch = 0;
    this.lookAt = { x: P.x, z: P.z };
    this.wantSpeed = 0;
    this.state = 'idle';
    const S = this.sp.speed;
    const fire = this.world.fire(P.x, P.z);

    if (this.down) {
      this.state = 'idle';
      this.speed = 0;
      this.animate(ctx);
      return;
    }
    if (this.reel > 0) {
      this.reel -= dt;
      pose.rear = 0.4;
      this.wantSpeed = 0;
      this.move(ctx);
      this.animate(ctx);
      return;
    }

    switch (this.mind) {
      case 'sleep': {
        pose.crouch = 1;
        pose.graze = 0.6;
        this.lookAt = null;
        if (d < WAKE.near || (d < WAKE.loud && P.speed > WAKE.loud_speed)) this._wake();
        break;
      }
      case 'stalk': {
        // round you, at its distance, on the side you're not looking at
        const [near, far] = this.K.stalk;
        const want = (near + far) / 2;
        const a = Math.atan2(this.x - P.x, this.z - P.z) + this.side * 0.35;
        const behind = Math.atan2(-P.facing.x, -P.facing.z);
        const to = wrapAngle(behind - a);
        const ang = a + Math.max(-0.4, Math.min(0.4, to)) * (this.kind === 'cougar' ? 1 : 0.4);
        const r = Math.max(want, fire ? FIRE_KEEPS + 6 : 0);
        this.headTo(P.x + Math.sin(ang) * r, P.z + Math.cos(ang) * r, d < near ? S.trot * 1.6 : S.trot, 2);
        pose.crouch = this.kind === 'cougar' ? 0.45 : 0;
        if (Math.random() < dt * 0.05) this.side = -this.side;
        this.nextSound -= dt;
        if (this.nextSound <= 0) {
          this.nextSound = rand(SOUND_EVERY[0], SOUND_EVERY[1]);
          this._sound(Math.random() < 0.6 ? 'snap' : this.K.growl);
        }
        if (this.for <= 0 && !fire) {
          // a lion waits until you're looking away
          if (this.kind !== 'cougar' || !this._faced(P, d)) {
            this._set('charge');
            this._sound(this.K.roar);
          }
        }
        break;
      }
      case 'charge': {
        if (fire && Math.hypot(this.x - fire.x, this.z - fire.z) < FIRE_KEEPS + 4) {
          this._set('back', rand(BACK_FOR[0], BACK_FOR[1]));
          this.world.say(`${this.label} won't come near the fire`);
          break;
        }
        this.headTo(P.x, P.z, S.run, 0.5);
        this.state = 'flee'; // (for the quick start it gets in Beast.move)
        // a lion faced in time turns off
        if (this.kind === 'cougar' && d < FACED_NEAR && d > 5 && this._faced(P, d)) {
          this._set('back', rand(BACK_FOR[0], BACK_FOR[1]));
          this._sound('snarl');
          this.world.say('it saw you looking · it turns away');
          break;
        }
        // a bear may stop short of someone who stands and faces it
        if (this.kind === 'bear' && d < 9 && !this.bluffed) {
          this.bluffed = true;
          if (P.speed < STAND && this._faced(P, d) && Math.random() < this.K.bluff) {
            this._set('bluff', 1.6);
            this._sound('huff');
            this.world.say('it stops short · a bluff · stand your ground');
            break;
          }
        }
        if (this.K.pounce && d < this.K.pounce) {
          this._set('pounce', 0.55);
          this.state = 'leap';
          break;
        }
        if (d < this.K.reach) this._maul(P);
        break;
      }
      case 'pounce': {
        const u = Math.min(1, 1 - this.for / 0.55);
        pose.air = Math.sin(Math.PI * u);
        pose.lift = 1.2 * u * (1 - u) * 4 * 0.5;
        this.state = 'leap';
        this.headTo(P.x, P.z, S.run, 0.2);
        if (d < this.K.reach + 0.6) this._maul(P);
        else if (this.for <= 0) this._set('charge');
        break;
      }
      case 'bluff': {
        pose.rear = 0.6;
        pose.alert = 1;
        if (this.for <= 0) this._set('back', rand(BACK_FOR[0], BACK_FOR[1]));
        break;
      }
      case 'back': {
        const ax = d > 0.01 ? -dx / d : 1;
        const az = d > 0.01 ? -dz / d : 0;
        if (d < BACK_TO) this.headTo(this.x + ax * 10, this.z + az * 10, S.trot * 1.8, 1);
        else this.lookAt = { x: P.x, z: P.z };
        if (this.for <= 0) this._set('stalk', rand(STALK_FOR[0], STALK_FOR[1]) * 0.7);
        break;
      }
      default:
        this._set('stalk', rand(STALK_FOR[0], STALK_FOR[1]));
    }
    this.move(ctx);
    this.animate(ctx);
  }

  // Are you looking its way?
  _faced(P, d) {
    const fx = P.facing.x;
    const fz = P.facing.z;
    return ((this.x - P.x) * fx + (this.z - P.z) * fz) / (d || 1) > FACED;
  }

  _maul(P) {
    const d = Math.hypot(P.x - this.x, P.z - this.z) || 1;
    this.world.maul(this.K.maul, { x: (P.x - this.x) / d, z: (P.z - this.z) / d }, this.K.why);
    this._sound(this.K.roar);
    this.speed *= 0.2;
    this._set('back', rand(BACK_FOR[0], BACK_FOR[1]));
  }
}
