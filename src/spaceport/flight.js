// The trip: climbing in, the countdown, the climb to orbit, the visit, and
// the capsule coming home under its parachute. Where you are in it, and how
// high the rocket or the capsule is, over time.
//
// No three.js in here; the launch site (launchSite.js) draws it and index.js
// moves you with it.
//
// Emits:
//   'phase'   (phase, was)   ground → boarding → countdown → climb → orbit →
//                            home → ground
//   'tick'    (n)            a second of the countdown: 5, 4, 3, 2, 1
//   'ignite'  ()             the engine lights, a moment before lift-off
//   'liftoff' ()

import { Emitter } from '../core/events.js';
import { NAME } from './orrery.js';

export const DESTINATIONS = {
  ds9: { name: 'Deep Space 9', trip: 'Dock and explore the Promenade' },
  orrery: { name: NAME, trip: 'Orbital railgun arena' },
};

export const FLIGHT = {
  board: 1.4, // s climbing up the tower and in
  count: 5, // s of countdown
  ignite: 1.2, // s before lift-off that the engine lights
  climb: 11, // s from lift-off to orbit...
  white: 1.8, // ...the last of them fading into the glare
  accel: 9, // m/s² the rocket climbs at
  home: 9, // s coming down under the parachute...
  from: 150, // ...from this far over the pad (m)
  clear: 1.5, // s of glare at the start of the way down, fading
};

export class Flight extends Emitter {
  constructor() {
    super();
    this.phase = 'ground';
    this.destination = null;
    this.t = 0; // s into the phase
    // Whether what's up there is ready to arrive at: until it is, the climb
    // goes on at its top, in the glare. (Whoever builds what's up there says:
    // it's fetched as you board, and is nearly always here long before.)
    this.mayArrive = () => true;
  }

  _go(phase) {
    const was = this.phase;
    this.phase = phase;
    if (phase === 'ground') this.destination = null;
    this.t = 0;
    this.emit('phase', phase, was);
  }

  board(destination = 'orrery') {
    if (this.phase !== 'ground' || !Object.hasOwn(DESTINATIONS, destination)) return false;
    this.destination = destination;
    this._go('boarding');
    return true;
  }

  // Back from either destination, the capsule comes down.
  comeHome() {
    if (this.phase === 'orbit') this._go('home');
  }

  // Skip on to the end of the phase (from the console, and the play-through).
  hurry() {
    const left = { boarding: FLIGHT.board, countdown: FLIGHT.count, climb: FLIGHT.climb, home: FLIGHT.home }[this.phase];
    if (left !== undefined) this.update(Math.max(0, left - this.t) + 1e-3);
  }

  update(dt) {
    const was = this.t;
    this.t += dt;
    const t = this.t;
    switch (this.phase) {
      case 'boarding':
        if (t >= FLIGHT.board) this._go('countdown');
        break;
      case 'countdown': {
        // a tick as each second of the countdown begins: 5 at once, then 4...
        for (let n = FLIGHT.count; n >= 1; n--) {
          const at = FLIGHT.count - n;
          if (was <= at && t > at) this.emit('tick', n);
        }
        const lit = FLIGHT.count - FLIGHT.ignite;
        if (was <= lit && t > lit) this.emit('ignite');
        if (t >= FLIGHT.count) {
          this._go('climb');
          this.emit('liftoff');
        }
        break;
      }
      case 'climb':
        if (t >= FLIGHT.climb && this.mayArrive()) this._go('orbit');
        break;
      case 'home':
        if (t >= FLIGHT.home) this._go('ground');
        break;
    }
  }

  // How high the rocket is over the pad (m).
  get rocketUp() {
    return this.phase === 'climb' ? climbHeight(Math.min(this.t, FLIGHT.climb)) : 0;
  }

  // How high the capsule is over where it comes down (m).
  get capsuleUp() {
    return this.phase === 'home' ? homeHeight(this.t) : 0;
  }

  // How white the view is with glare, 0..1: up into it at the top of the
  // climb, and out of it again on the way down.
  get glare() {
    if (this.phase === 'climb') return Math.max(0, Math.min(1, (this.t - (FLIGHT.climb - FLIGHT.white)) / FLIGHT.white));
    if (this.phase === 'home') return Math.max(0, 1 - this.t / FLIGHT.clear);
    return 0;
  }

  // How hard the engine is going, 0..1 (for its flame, smoke and roar).
  get thrust() {
    if (this.phase === 'countdown') return Math.max(0, Math.min(1, (this.t - (FLIGHT.count - FLIGHT.ignite)) / FLIGHT.ignite)) * 0.6;
    if (this.phase === 'climb') return 1;
    return 0;
  }
}

// The rocket's height t s after lift-off (m): slow off the pad, then faster.
export function climbHeight(t) {
  return 0.5 * FLIGHT.accel * t * t;
}

// The capsule's height t s into the way home (m): falling fast at first,
// and slowed to a gentle touch by the time it's down.
export function homeHeight(t) {
  const s = Math.max(0, Math.min(1, t / FLIGHT.home));
  return FLIGHT.from * (1 - s) * (1 - s);
}
