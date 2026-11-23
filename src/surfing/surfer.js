// One surfer on a board: the physics of it, and nothing else. It is handed
// the sea (index.js gives it) and the controls each frame, and keeps where
// you are, which way the board points, what you're doing and how the wave is
// treating you. index.js puts the hiker there.
//
// Lying on the board you paddle: it goes the way it points, slowly, and the
// sea moves you as it moves: the water under a wave goes in with it, and a
// wave's face is a slope you slide down. Paddle in ahead of a wave as it
// steepens and the face takes you, faster and faster, until you're going in
// as fast as it is: you've caught it, and can stand up (pop). White water
// shoves you back toward the beach, unless you push the nose under it (duck).
//
// Standing, the board is a hull on a moving slope. Gravity pulls you down the
// face; the water running up the face holds you on it (it carries you in as
// fast as the wave goes, never faster: run on ahead of it and you're on your
// own, out in the flat until it catches you up); the rails bite, so
// what you slide sideways bleeds away (a carve) and the board goes where it
// points. Point it along the wave and you run along the face ahead of where
// it's breaking; down the face and you go faster but run out in front of it
// into the flat; up and over the back and you've kicked out. Lean back
// (stall) and the break catches you up; crouch, low in the face, and you can
// ride inside the curl as the lip falls over you (the barrel) — until it
// closes. Up the face fast and over the lip and you fly.
//
// You fall if the lip lands on you standing (anywhere it lands but inside the
// barrel), if the barrel closes on you, if the nose digs in going straight
// down a face too steep for it, or if you come down from the air sideways or
// too hard. Fallen, you're under for a moment, rolled in with the wave, and
// come up lying on the board.
//
// The sea (index.js):
//   level                   m: where it stands when it's still
//   at(x, z, out) -> out    how the waves are there (world/breakers.js
//                           sample: rise, gx, gz, fx, fz, wave), with rise 0
//                           and no wave away from a break
//   depth(x, z)             m of water there (under 0 on dry land)
//
// The controls (step):
//   steer  -1..1  + is right       pop     pressed this frame (stand, fly)
//   push   -1..1  + forward        crouch  held
//   sprint held (paddle harder)    duck    held, lying down (nose under)
//
// Emits:
//   'caught'  ()                     a wave has you, lying down
//   'pop'     ()                     up on your feet
//   'turn'    ({ name, points })     a turn that counts: a bottom turn, a snap, a cutback
//   'tube'    (s)                    in the barrel: how long so far
//   'tubed'   ({ time, points })     ...and out of it again, standing
//   'takeoff' ()
//   'land'    ({ name, points, impact })
//   'crash'   (why, speed)
//   'up'      ()                     back up on the board after a fall
//   'off'     (why)                  off the wave, slowed right down, lying down again:
//                                    'kicked out', 'the white water ran out', 'stalled: ...'
//   'beach'   ()                     ridden in to where it's too shallow to stand on a board

import { Emitter } from '../core/events.js';
import { clamp, smoothstep } from '../noise.js';
import { wrapAngle as wrap } from '../core/geom.js';

export const SURFER = {
  gravity: 9.8, // m/s²
  // lying down: paddling up to top (m/s through the water; sprint: harder),
  // turning (rad/s), the water holding the board back along it and across it
  // (1/s), how much of the slope it slides down, and how hard white water
  // shoves it (1/s, toward going in as fast as the wave)
  prone: { push: 1.4, top: 1.6, sprint: 2.3, turn: 1.9, drag: 0.9, grip: 3.5, slide: 0.9, shove: 2.2, back: 0.6 },
  duck: { time: 1.1, rest: 0.6 }, // s under, and s before you can again
  // caught: going in at this much of the wave's own speed, on its face, a
  // wave this high at least (m)
  catch: { speed: 0.6, least: 0.35 },
  // standing: the water holding the board back along it and across it (1/s),
  // the air (per m), turning (rad/s at a standstill and at speed, and the m/s
  // between), pumping (m/s² along it, W), stalling (1/s, S), crouched turning
  // tighter, and riding the white water (more drag)
  ride: { drag: 0.16, grip: 7, carve: 0.15, air: 0.004, turn: [2.8, 1.5, 9], pump: 1.1, stall: 1.1, crouch: 1.15, foam: 0.6 },
  // the water running up a face, carrying you in up to the wave's speed
  // (1/s), standing and lying down caught; over the face, and a little of its back
  carry: { ride: 2.6, prone: 1.6, back: 0.3 },
  pop: 3.6, // m/s up off the lip, on top of how fast the face carries you
  launch: 1.6, // m/s up at least, for the face falling away to throw you
  land: { angle: 0.65, hard: 9 }, // rad off the way you're going (either way round), m/s down
  spin: 5.5, // rad/s spinning in the air
  ease: 8, // 1/s: how quickly a turn comes on and lets go
  // launched off the top only climbing the face this fast yourself (m/s up),
  // not by the wave going under you
  climb: 1.8,
  fresh: 0.9, // s after you stand: making the drop and the turn, the lip can't have you yet
  angle: 0.6, // rad the board is angled off as you stand, steering that way
  pearl: { slope: 1.5, nose: 0.85, speed: 3 }, // too steep down the face (rise per m), pointing straight down it, going this fast
  // the lip: it lands from this far in front of the face (of H) to this far
  // behind the crest (of its back), once it has fallen this far (lip, of 1:
  // until then it's still in the air over you); the barrel is low in the
  // face (under this of it), crouched, once it has thrown out over you
  // (tube) and until it comes down (closes)
  lip: { front: 0.6, behind: 0.25, lands: 0.45, low: 0.3, tube: 0.15, closes: 0.85 },
  down: 2.6, // s under after a fall
  slow: { speed: 1.6, time: 0.6 }, // stood this slow this long (m/s, s): off the wave
  shallow: [0.45, 0.25], // m: ridden in, standing, this shallow; and lying down
  // a turn that counts: this much (rad) of it, carved at this speed (m/s)
  turn: { least: 1.1, speed: 3.5, after: 1.2 },
};

const _s = { rise: 0, gx: 0, gz: 0, fx: 0, fz: 0, wave: null };

export class Surfer extends Emitter {
  constructor(sea) {
    super();
    this.sea = sea;
    this.reset(0, 0, 0);
  }

  // Lying on the board at (x, z), pointing yaw (the way it goes: x = sin, z = cos).
  reset(x, z, yaw) {
    this.x = x;
    this.z = z;
    this.vx = 0;
    this.vz = 0;
    this.y = this.sea.level;
    this.vy = 0;
    this.yaw = yaw;
    this.mode = 'prone'; // 'prone' | 'riding' | 'down'
    this.flying = false;
    this.caught = false; // lying down, and a wave has you
    this.ducking = 0; // s left with the nose under
    this.duckRest = 0;
    this.slow = 0;
    this.downFor = 0;
    this.tube = 0; // s in the barrel
    this.spun = 0; // rad spun in the air
    this.turning = null; // the turn going on: { yaw0, swept, top, low, along0 }
    this.yawRate = 0;
    this.lateral = 0; // m/s² round the turn (for the lean)
    this.rise = 0; // m the waves raise the water here, and its slope
    this.gx = 0;
    this.gz = 0;
    this.fx = 0; // m/s the water goes with them
    this.fz = 0;
    this.wave = null; // the wave you're on, as the sea says (a copy)
    this._wave = {};
    this.time = 0;
    this.why = '';
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  get heading() {
    return this.speed > 0.4 ? Math.atan2(this.vx, this.vz) : this.yaw;
  }

  step(dt, c) {
    if (dt <= 0) return;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const sea = this.sea;
    const s = sea.at(this.x, this.z, _s);
    this.rise = s.rise;
    this.gx = s.gx;
    this.gz = s.gz;
    this.fx = s.fx;
    this.fz = s.fz;
    this.wave = s.wave ? Object.assign(this._wave, s.wave) : null;
    if (this.mode === 'down') return this._down(dt, s);
    if (this.mode === 'prone') return this._prone(dt, c, s);
    return this._ride(dt, c, s);
  }

  // ── Lying down ────────────────────────────────────────────────────────────
  _prone(dt, c, s) {
    const P = SURFER.prone;
    const g = SURFER.gravity;
    this.duckRest = Math.max(0, this.duckRest - dt);
    if (c.duck && !this.ducking && !this.duckRest) this.ducking = SURFER.duck.time;
    if (this.ducking) {
      this.ducking = Math.max(0, this.ducking - dt);
      if (!this.ducking) this.duckRest = SURFER.duck.rest;
    }
    const under = this.ducking > 0;
    this._turn(dt, -(c.steer || 0) * P.turn);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    // through the water: along the board and across it
    const wx = under ? 0 : s.fx;
    const wz = under ? 0 : s.fz;
    const rx = this.vx - wx;
    const rz = this.vz - wz;
    const along = rx * fx + rz * fz;
    const across = rx * fz - rz * fx;
    let af = -P.drag * along;
    const al = -P.grip * across;
    const top = c.sprint ? P.sprint : P.top;
    const push = Math.max(0, c.push || 0);
    if (push > 0 && along < top) af += P.push * push * (c.sprint ? 1.4 : 1) * (1 - Math.max(0, along) / top);
    // backpaddling, slowly
    if ((c.push || 0) < 0) af -= P.back * Math.min(1, -c.push) * (along > -0.5 ? 1 : 0);
    let ax = af * fx + al * fz;
    let az = af * fz - al * fx;
    // sliding down the face (not under it)
    if (!under) {
      const k = (P.slide * g) / (1 + s.gx * s.gx + s.gz * s.gz);
      ax -= k * s.gx;
      az -= k * s.gz;
    }
    // white water shoves you in with it; a face you've caught carries you
    const w = this.wave;
    if (this.caught) {
      const a = this._carry(SURFER.carry.prone);
      ax += w.ix * a;
      az += w.iz * a;
    }
    if (w && w.lip > 0.25 && !under && w.x > -w.face && w.x < w.back * 0.4) {
      const into = this.vx * w.ix + this.vz * w.iz;
      const shove = P.shove * smoothstep(0.25, 0.8, w.lip) * Math.max(0, w.c * 0.8 - into);
      ax += w.ix * shove;
      az += w.iz * shove;
    }
    this.vx += ax * dt;
    this.vz += az * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.y = this.sea.level + s.rise - (under ? 0.7 : 0);
    this.vy = 0;
    // has a wave got you?
    // (not as its lip pitches over you: before it breaks, or the white water after)
    const caught = !!w && !under && w.H > SURFER.catch.least && (w.lip < 0.05 || w.lip > 1.2) && w.x < 0.3 * w.back && w.x > -w.face - 1 && this.vx * w.ix + this.vz * w.iz > SURFER.catch.speed * w.c && fx * w.ix + fz * w.iz > 0.3;
    if (caught && !this.caught) this.emit('caught');
    this.caught = caught;
    if (caught && c.pop) this._stand(c.steer || 0);
    else if (this.sea.depth(this.x, this.z) < SURFER.shallow[1]) this.emit('beach');
  }

  // Up on your feet: angled off the way you were steering, if you were.
  _stand(steer = 0) {
    if (Math.abs(steer) > 0.3) this.yaw = wrap(this.yaw - Math.sign(steer) * SURFER.angle);
    this.mode = 'riding';
    this.caught = false;
    this.flying = false;
    this.slow = 0;
    this.fresh = SURFER.fresh;
    this.upFor = 0; // s on your feet
    this.tube = 0;
    this.turning = null;
    // up with the board going the way it points, as fast as it was going
    const v = Math.max(this.speed, this.wave ? this.wave.c * 0.9 : 0);
    this.vx = Math.sin(this.yaw) * v;
    this.vz = Math.cos(this.yaw) * v;
    this.emit('pop');
  }

  // ── Standing ──────────────────────────────────────────────────────────────
  _ride(dt, c, s) {
    const R = SURFER.ride;
    const g = SURFER.gravity;
    const surface = this.sea.level + s.rise;
    this.upFor += dt;
    if (this.flying) return this._fly(dt, c, surface);
    const speed = this.speed;
    const crouch = !!c.crouch;
    // turning: tighter slow, wider fast; tighter crouched
    const [t0, t1, tv] = R.turn;
    const rate = (t0 + (t1 - t0) * clamp(speed / tv, 0, 1)) * (crouch ? R.crouch : 1);
    this._turn(dt, -(c.steer || 0) * rate);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    // through the water, along the board and across it
    const rx = this.vx - s.fx;
    const rz = this.vz - s.fz;
    const along = rx * fx + rz * fz;
    const across = rx * fz - rz * fx;
    const w = this.wave;
    const foam = w && w.lip > 1 && w.x > -w.face - 1 && w.x < 1.5 ? 1 : 0;
    let af = -(R.drag + R.foam * foam) * along - R.air * speed * (this.vx * fx + this.vz * fz);
    // the rails bite: slip across bleeds away, some of it into speed along
    const bite = Math.min(1, R.grip * dt);
    const slip = across * bite;
    const al = -slip / dt;
    af += (Math.abs(slip) * R.carve * Math.sign(along || 1)) / dt;
    // pumping along the face; stalling, back on the tail
    const push = c.push || 0;
    if (push > 0 && w && w.H > 0.3) af += R.pump * push;
    if (push < 0) af -= R.stall * -push * along;
    let ax = af * fx + al * fz;
    let az = af * fz - al * fx;
    // gravity, down the face; and the face carrying you in
    const kk = g / (1 + s.gx * s.gx + s.gz * s.gz);
    ax -= kk * s.gx;
    az -= kk * s.gz;
    const carry = this._carry(SURFER.carry.ride);
    if (carry) {
      ax += w.ix * carry;
      az += w.iz * carry;
    }
    this.lateral = (-al + (this.yawRate * speed)) * 0.5;
    this.vx += ax * dt;
    this.vz += az * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // up and down with the water: and off it, if it falls away faster than you can
    const vy = (surface - this.y) / dt;
    if (c.pop && w && w.x > -w.face * 0.6 && w.x < 1.5 && this.vy > 0.3 && speed > 3) return this._takeoff(Math.max(this.vy, 0) + SURFER.pop);
    const climb = this.vx * s.gx + this.vz * s.gz;
    if (this.vy > SURFER.launch && climb > SURFER.climb && vy < this.vy - g * dt * 1.5) return this._takeoff(this.vy);
    this.vy = vy;
    this.y = surface;

    if (this._falls(dt, c, s, speed)) return;
    this._turns(dt, speed);
    // off the wave, slowed right down
    this.slow = speed < SURFER.slow.speed ? this.slow + dt : 0;
    if (this.slow > SURFER.slow.time) {
      const why = w && w.x > 0 ? 'kicked out' : w && w.lip > 1 ? 'the white water ran out' : 'stalled: the wave went on without you';
      this._lie();
      return this.emit('off', why);
    }
    if (this.sea.depth(this.x, this.z) < SURFER.shallow[0]) this.emit('beach');
  }

  // How the face carries you in: the acceleration (m/s², along its way in)
  // toward going in as fast as it does, at k (1/s), over its face.
  _carry(k) {
    const w = this.wave;
    if (!w || w.H < SURFER.catch.least * 0.8) return 0;
    const on = smoothstep(-w.face - 0.8, -w.face * 0.5, w.x) * (1 - smoothstep(0, w.back * SURFER.carry.back, w.x));
    const into = this.vx * w.ix + this.vz * w.iz;
    return k * on * Math.max(0, w.c - into);
  }

  // Come round toward turning at `rate` (rad/s; + to the left), and turn.
  _turn(dt, rate) {
    this.yawRate += (rate - this.yawRate) * (1 - Math.exp(-dt * SURFER.ease));
    this.yaw = wrap(this.yaw + this.yawRate * dt);
  }

  _takeoff(vy) {
    this.flying = true;
    this.vy = vy;
    this.spun = 0;
    this._yaw0 = this.yaw;
    this._spinDir = 0;
    this.turning = null;
    this._endTube(true);
    this.emit('takeoff');
  }

  _fly(dt, c, surface) {
    const g = SURFER.gravity;
    const steer = -(c.steer || 0);
    if (steer) {
      this.yaw = wrap(this.yaw + steer * SURFER.spin * dt);
      this.spun += steer * SURFER.spin * dt;
    }
    this.yawRate = steer * SURFER.spin;
    this.vy -= g * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.y += this.vy * dt;
    if (this.y > surface) return;
    // down again
    const impact = -this.vy;
    this.y = surface;
    this.vy = 0;
    this.flying = false;
    const off = Math.abs(wrap(this.yaw - Math.atan2(this.vx, this.vz)));
    const straight = off < SURFER.land.angle || off > Math.PI - SURFER.land.angle;
    if (!straight || impact > SURFER.land.hard) return this._crash(straight ? 'came down too hard' : 'landed sideways');
    // ridden away: backwards is still ridden (the board swings round)
    if (off > Math.PI / 2) this.yaw = wrap(this.yaw + Math.PI);
    const half = Math.round(Math.abs(this.spun) / Math.PI);
    const name = half === 0 ? 'air' : half === 1 ? 'air 180' : half === 2 ? 'air reverse' : half === 3 ? '540 air' : 'full rotor';
    const points = [400, 550, 800, 1100, 1400][Math.min(half, 4)];
    this.emit('land', { name, points, impact });
  }

  // The lip, a nose dug in: true if you fell.
  _falls(dt, c, s, speed) {
    const w = this.wave;
    const L = SURFER.lip;
    this.fresh = Math.max(0, (this.fresh || 0) - dt);
    if (w && w.lip >= 0 && w.lip < 1.1 && !this.fresh) {
      const under = w.x < w.back * L.behind && w.x > -w.face - L.front * w.H;
      const low = w.x < 0 && -w.x > w.face * L.low;
      if (under && c.crouch && low && w.lip > L.tube && w.lip < L.closes) {
        this.tube += dt;
        this.emit('tube', this.tube);
      } else if (under && this.tube > 0 && w.lip >= L.closes) {
        this._crash('the barrel closed on you');
        return true;
      } else if (under && w.lip > L.lands) {
        this._crash('the lip landed on you');
        return true;
      } else this._endTube(false);
    } else this._endTube(false);
    // the nose dug in, straight down a face too steep
    const P = SURFER.pearl;
    const steep = Math.hypot(s.gx, s.gz);
    if (steep > P.slope && speed > P.speed) {
      const down = -(Math.sin(this.yaw) * s.gx + Math.cos(this.yaw) * s.gz) / steep;
      if (down > P.nose && !c.crouch) {
        this._crash('pearled: the nose dug in');
        return true;
      }
    }
    return false;
  }

  _endTube(silent) {
    if (this.tube <= 0) return;
    const time = this.tube;
    this.tube = 0;
    if (silent || time < 0.3) return;
    this.emit('tubed', { time, points: Math.round(200 + time * 500) });
  }

  // Turns that count: a carve of a good sweep, named for where on the face
  // it was and which way it left you going.
  _turns(dt, speed) {
    const T = SURFER.turn;
    const w = this.wave;
    const turning = Math.abs(this.yawRate) > 0.6 && speed > T.speed;
    if (turning) {
      if (!this.turning || Math.sign(this.yawRate) !== this.turning.dir) {
        this._turned();
        // (which way along the crest you were running, if you were)
        // (not the turn off the takeoff: up a moment, and going)
        const run = w ? this.vx * -w.iz + this.vz * w.ix : 0;
        const going = this.upFor > SURFER.turn.after && speed > SURFER.turn.speed + 1 && Math.abs(run) > speed * 0.5;
        this.turning = { dir: Math.sign(this.yawRate), swept: 0, top: 0, low: 0, in0: going ? Math.sign(run) : 0 };
      }
      const t = this.turning;
      t.swept += Math.abs(this.yawRate) * dt;
      if (w) {
        if (w.x > -w.face * 0.35) t.top++;
        else t.low++;
      } else t.low++;
    } else this._turned();
  }

  _turned() {
    const t = this.turning;
    this.turning = null;
    if (!t || t.swept < SURFER.turn.least) return;
    const w = this.wave;
    // which way along the crest you go, before and after
    const along = w ? Math.sign(this.vx * -w.iz + this.vz * w.ix) : 0;
    let name;
    let points;
    if (t.in0 && along && along !== t.in0 && t.swept > 2) {
      [name, points] = t.swept > 3 ? ['roundhouse cutback', 450] : ['cutback', 300];
    } else if (t.top > t.low) [name, points] = t.swept > 2 ? ['big snap', 350] : ['snap', 220];
    else [name, points] = t.swept > 1.8 ? ['carve', 120] : ['bottom turn', 60];
    this.emit('turn', { name, points });
  }

  _crash(why) {
    const speed = this.speed;
    this.mode = 'down';
    this.flying = false;
    this.downFor = SURFER.down;
    this.tube = 0;
    this.turning = null;
    this.caught = false;
    this.why = why;
    this.emit('crash', why, speed);
  }

  // Under, rolled in with the wave, then up lying on the board.
  _down(dt, s) {
    this.downFor -= dt;
    const k = Math.exp(-dt * 2.5);
    this.vx = this.vx * k + s.fx * (1 - k);
    this.vz = this.vz * k + s.fz * (1 - k);
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.y = this.sea.level + s.rise - 0.9 * smoothstep(0, 0.4, SURFER.down - this.downFor) * smoothstep(0, 0.5, this.downFor);
    if (this.downFor > 0) return;
    this._lie();
    this.emit('up');
  }

  _lie() {
    this.mode = 'prone';
    this.flying = false;
    this.caught = false;
    this.slow = 0;
    this.tube = 0;
    this.turning = null;
    this.vx *= 0.3;
    this.vz *= 0.3;
  }

  // Up on your feet now, whatever the wave (from the console).
  stand() {
    if (this.mode !== 'riding') this._stand();
  }
}

