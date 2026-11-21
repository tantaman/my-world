// The line: cast out, the float lying on the water, a fish nosing at the bait
// and then taking it, striking to hook it, and playing it in. Plain numbers,
// no drawing (look.js draws it), so it can be tested on its own.
//
// It goes:
//   idle      nothing out
//   flying    the float on its way out over the water
//   waiting   the float lying there. Now and then a fish comes: a nibble or
//             two (the float twitches), and then it takes the bait
//   biting    ...the float goes under, for a moment: strike now (click) and
//             it's hooked. Strike while it's only nibbling and it's off
//   hooked    a fish on: hold click to reel it in. Every so often it runs,
//             and the line goes tight; keep reeling into a run, or reel too
//             long without letting it rest, and the line snaps. Reel it in
//             close and it's caught
//   in        the float reeled back in, with nothing on it
//
// Where you are and where the float is are (x, z) in the world. What bites
// where is handed to cast() as `water` (see catch.js):
//   rate      bites a second here
//   bite()    -> the fish that takes it ({ kind, name, len, kg, strength })
//
// Emits (as each thing happens):
//   'splash'  (x, z)          the float landed
//   'nibble'  ()              a fish at the bait
//   'bite'    ()              it took it: the float goes under
//   'early'   ()              struck at a nibble: it's gone
//   'missed'  ()              too slow: it let go
//   'hooked'  (fish)
//   'run'     (fish)          it ran
//   'snapped' (fish)          too much strain on the line
//   'freed'   (fish)          reeled in or put down with one on: let go
//   'caught'  (fish)
//   'in'      ()              reeled in with nothing on

import { Emitter } from '../core/events.js';

export const LINE = {
  reach: [3.5, 20], // m: the nearest and furthest you can cast
  flight: 0.8, // s the float is in the air
  window: 1.2, // s a bite lasts: strike within it
  nibbles: [0, 3], // how many nibbles before a bite, fewest and most
  nibbleGap: [0.7, 1.6], // s between them
  land: 1.5, // m: reeled this close, it's caught
  slack: 26, // m: further than this from the float, you reel in
  reelIn: 7, // m/s, reeling in with nothing on
  // Playing a fish, for one of strength 1 (a stronger one strains the line
  // by the square of how much stronger it is, so a little one hardly can):
  reel: 1.9, // m/s it comes in while you reel
  strain: 0.12, // how fast the line tightens while you reel (a second)
  strainRun: 0.95, // ...and while you reel into a run
  ease: 0.6, // how fast it slackens while you don't
  drift: 0.25, // m/s it pulls away while you rest
  runSpeed: 2.4, // m/s it takes line on a run
  runFor: [0.7, 1.7], // s a run lasts
  runEvery: [2, 4.5], // s between runs
  tires: 25, // s for a fish to tire out: then it runs less, and pulls less
};

const rnd = (rand, [a, b]) => a + (b - a) * rand();

export class Line extends Emitter {
  constructor({ rand = Math.random } = {}) {
    super();
    this.rand = rand;
    this.state = 'idle';
    this.t = 0; // seconds in this state
    this.float = { x: 0, z: 0 }; // where the float is (or the fish, once hooked)
    this.from = { x: 0, z: 0 }; // where it was cast from
    this.water = null;
    this.next = 0; // seconds till a fish comes, waiting
    this.nibbles = 0; // ...nibbles to go before it bites
    this.fish = null; // the one on the line
    this.tension = 0; // 0..1: at 1 it snaps
    this.run = 0; // seconds of a run left
    this.runIn = 0; // seconds till the next one
    this.stamina = 1; // 1 fresh, 0 tired out
    this.dist = 0; // m from you to the fish, as it was hooked (for how far in)
    this.twitch = 0; // the float bobbing at a nibble, 1 and dying away
    this.near = false; // a fish is at the bait, waiting
    this._d = 0; // m from you to the fish now
  }

  get out() {
    return this.state !== 'idle';
  }

  // How far it's been reeled in, 0..1, while a fish is on.
  get landed() {
    return this.state === 'hooked' ? Math.max(0, 1 - this._d / Math.max(1e-3, this.dist)) : 0;
  }

  // Cast from (fx, fz) to (x, z), where the water is as `water` says.
  cast(fx, fz, x, z, water) {
    this.state = 'flying';
    this.t = 0;
    this.from = { x: fx, z: fz };
    this.float = { x, z };
    this.water = water;
    this.fish = null;
    this.tension = 0;
  }

  // Click: strike. -> what came of it: 'hooked', 'early', or null (nothing there)
  strike() {
    if (this.state === 'biting') {
      this.fish = this.water.bite();
      if (!this.fish) return this._wait(), null;
      this.state = 'hooked';
      this.t = 0;
      this.tension = 0.15;
      this.stamina = 1;
      this.run = 0;
      this.runIn = rnd(this.rand, LINE.runEvery) * 0.6;
      this.dist = 0;
      this._d = 0;
      this.emit('hooked', this.fish);
      return 'hooked';
    }
    if (this.state === 'waiting' && this.near) {
      // a fish was at it, and you've frightened it off
      this.emit('early');
      this._wait(4);
      return 'early';
    }
    return null;
  }

  // Right-click: reel it in.
  reelIn() {
    if (this.state === 'idle' || this.state === 'in') return;
    if (this.state === 'hooked') this.emit('freed', this.fish);
    this.state = 'in';
    this.fish = null;
    this.t = 0;
  }

  // Let it all go at once (the rod put down).
  drop() {
    if (this.state === 'hooked') this.emit('freed', this.fish);
    this.state = 'idle';
    this.fish = null;
  }

  // you: { x, z } where you are; reeling: whether click is held
  update(dt, you, reeling = false) {
    this.t += dt;
    this.twitch = Math.max(0, this.twitch - dt * 2.5);
    const s = this.state;
    if (s === 'flying') {
      if (this.t >= LINE.flight) {
        this.emit('splash', this.float.x, this.float.z);
        this._wait();
      }
    } else if (s === 'waiting' || s === 'biting') {
      if (Math.hypot(this.float.x - you.x, this.float.z - you.z) > LINE.slack) return this.reelIn();
      if (s === 'biting') {
        if (this.t >= LINE.window) {
          this.emit('missed');
          this._wait();
        }
        return;
      }
      this.next -= dt;
      if (this.next > 0) return;
      // a fish at it: nibbles first, then it takes it
      this.near = true;
      if (this.nibbles > 0) {
        this.nibbles--;
        this.twitch = 1;
        this.emit('nibble');
        this.next = rnd(this.rand, LINE.nibbleGap);
        return;
      }
      this.state = 'biting';
      this.t = 0;
      this.emit('bite');
    } else if (s === 'hooked') this._play(dt, you, reeling);
    else if (s === 'in') {
      const dx = you.x - this.float.x;
      const dz = you.z - this.float.z;
      const d = Math.hypot(dx, dz);
      const step = LINE.reelIn * dt;
      if (d <= LINE.land + step) {
        this.state = 'idle';
        this.emit('in');
        return;
      }
      this.float.x += (dx / d) * step;
      this.float.z += (dz / d) * step;
    }
  }

  // Wait for the next fish: `extra` seconds longer than it might be.
  _wait(extra = 0) {
    this.state = 'waiting';
    this.t = 0;
    this.near = false;
    const rate = Math.max(1e-4, this.water.rate);
    // the wait for a fish, as for anything that happens at a steady rate
    this.next = Math.max(4, -Math.log(1 - this.rand() * 0.999) / rate) + extra;
    this.nibbles = Math.round(rnd(this.rand, LINE.nibbles));
  }

  // Playing a fish on the line.
  _play(dt, you, reeling) {
    const f = this.fish;
    const dx = this.float.x - you.x;
    const dz = this.float.z - you.z;
    const d = Math.hypot(dx, dz) || 1e-3;
    if (!this.dist) this.dist = d;
    const ux = dx / d;
    const uz = dz / d;
    this.stamina = Math.max(0, this.stamina - dt / LINE.tires);
    const pull = f.strength * (0.45 + 0.55 * this.stamina);
    let move = 0; // m it comes in (negative: goes out)
    if (this.run > 0) {
      this.run -= dt;
      if (reeling) this.tension += LINE.strainRun * pull * pull * dt;
      else {
        this.tension = Math.max(0.35, this.tension - LINE.ease * 0.5 * dt);
        move = -LINE.runSpeed * pull * dt;
      }
    } else {
      if (reeling) {
        this.tension += LINE.strain * pull * pull * dt;
        move = (LINE.reel / Math.pow(f.strength, 0.3)) * dt;
      } else {
        this.tension = Math.max(0, this.tension - LINE.ease * dt);
        move = -LINE.drift * pull * dt;
      }
      this.runIn -= dt;
      if (this.runIn <= 0) {
        this.run = rnd(this.rand, LINE.runFor) * (0.5 + 0.5 * this.stamina);
        this.runIn = rnd(this.rand, LINE.runEvery) / (0.6 + 0.4 * this.stamina);
        this.emit('run', f);
      }
    }
    if (this.tension >= 1) {
      this.state = 'idle';
      this.fish = null;
      this.emit('snapped', f);
      return;
    }
    // it swims a little to and fro across the line as it comes
    const side = Math.sin(this.t * 1.3) * 0.4 * dt * (this.run > 0 ? 2 : 1);
    const nd = Math.min(LINE.slack + 4, d - move);
    this.float.x = you.x + ux * nd - uz * side;
    this.float.z = you.z + uz * nd + ux * side;
    this._d = nd;
    if (nd <= LINE.land) {
      this.state = 'idle';
      this.fish = null;
      this.dist = 0;
      this.emit('caught', f);
    }
  }
}
