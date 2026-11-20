// The game itself: the things every feature shares, and the loop.
//
// A *feature* is a function that takes the game and installs itself:
//
//   export function installWildlife(game) {
//     const wildlife = new Wildlife({ scene: game.scene, chunks: game.chunks, ... });
//     game.provide('wildlife', wildlife);
//     game.addSystem({ name: 'wildlife', phase: 'world', update: (f) => wildlife.update(f.dt) });
//   }
//
// main.js finds every feature and installs them in order (features.js: each
// says what it comes after). So a new feature's own folder is the only place
// it has to touch: tools, sounds, saved state, keys and help rows are all
// registered from inside the feature (see "Extending the game" in the README).
//
// Each frame runs in phases, and within a phase in the order systems were
// added:
//
//   input    the keys have been read and commands run; clocks tick
//   update   what you do: walking, the tool in your hands
//   world    what follows from where you are: streaming, sky, animals, peers
//   audio    what all of that sounds like
//   render   draw it
//   late     the HUD, saving, bookkeeping
//
// Only a feature's install function should hold on to `game`. The classes it
// builds take what they need as arguments, which keeps them usable (and
// testable) on their own.

import { Emitter } from '../core/events.js';
import { Commands } from './commands.js';

export const PHASES = ['input', 'update', 'world', 'audio', 'render', 'late'];
const MAX_STEP = 0.05; // seconds. Below 20 fps time slows down rather than taking bigger steps.
const FAULTS_BEFORE_STOPPING = 5;

// Emits:
//   'ready'    ()        everything is installed and restored; the loop is about to start
//   'fault'    (system, error)   a system threw, and has been stopped after doing so repeatedly
//   'dispose'  ()
export class Game extends Emitter {
  constructor({ config = {}, storage = null } = {}) {
    super();
    this.config = config;
    this.storage = storage;
    this.commands = new Commands();
    this.systems = Object.fromEntries(PHASES.map((p) => [p, []]));
    // dt: seconds since the last frame (clamped) · now: wall clock, ms ·
    // time: seconds the game has been running · n: frame number
    this.frame = { dt: 0, now: 0, time: 0, n: 0 };
    // What the console sees as `world`: every service by name, plus helpers.
    this.api = { game: this };
    // The controls, once a feature provides them ('input'). The game itself
    // only asks three things of them: wasPressed(code), down(code), endFrame().
    this.input = null;
    this.running = false;
    this._covers = [];
    this._last = 0;
    this._raf = 0;
    this._tick = (now) => this.tick(now);
  }

  // ── Putting the game together ─────────────────────────────────────────────

  // Install a feature. Order matters: a feature can use what earlier ones provided.
  use(install) {
    install(this);
    return this;
  }

  // Make something available to later features as game.<name>, and to the
  // console as world.<name>.
  provide(name, service) {
    if (this[name]) throw new Error(`"${name}" is already provided`);
    this[name] = service;
    this.api[name] = service;
    return service;
  }

  // { name, phase, update(frame), dispose?() }
  addSystem(system) {
    if (!this.systems[system.phase]) throw new Error(`system "${system.name}": no such phase "${system.phase}" (${PHASES.join(', ')})`);
    this.systems[system.phase].push({ faults: 0, off: false, ...system });
    return system;
  }

  // While fn() is true something covers the whole view (the map, say) and the
  // world doesn't need drawing under it.
  coverWhen(fn) {
    this._covers.push(fn);
  }

  get covered() {
    return this._covers.some((fn) => fn());
  }

  // ── Running ───────────────────────────────────────────────────────────────

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    this.emit('ready');
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  // One frame. Called by the browser; call it yourself to step the game by hand.
  tick(now = performance.now()) {
    // Ask for the next frame first: one bad frame mustn't end the game.
    if (this.running) this._raf = requestAnimationFrame(this._tick);
    const f = this.frame;
    f.dt = Math.min(MAX_STEP, Math.max(0, (now - this._last) / 1000));
    f.now = now;
    f.time += f.dt;
    f.n++;
    this._last = now;
    // Commands first, so everything this frame sees what they did.
    if (this.input) this.commands.update(this.input, f.dt);
    for (const phase of PHASES) {
      for (const s of this.systems[phase]) {
        if (s.off) continue;
        try {
          s.update(f);
          s.faults = 0;
        } catch (err) {
          this._fault(s, err);
        }
      }
    }
    // What was pressed this frame has now been seen by everyone.
    if (this.input) this.input.endFrame();
  }

  // A system that throws is reported, and one that throws frame after frame
  // is stopped: a stuck animal shouldn't freeze the forest.
  _fault(s, err) {
    s.faults++;
    if (s.faults === 1) console.error(`[${s.name}]`, err);
    if (s.faults < FAULTS_BEFORE_STOPPING) return;
    s.off = true;
    console.error(`[${s.name}] stopped after failing ${s.faults} frames running`);
    this.emit('fault', s, err);
  }

  dispose() {
    this.stop();
    for (const phase of [...PHASES].reverse()) {
      for (const s of [...this.systems[phase]].reverse()) if (s.dispose) s.dispose();
      this.systems[phase].length = 0;
    }
    this.emit('dispose');
  }
}
