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
//
// What a feature provides has a type, said where it is provided. A feature
// written in TypeScript says it beside its install function; one still in
// JavaScript says it in a `services.d.ts` in its folder:
//
//   declare module '../game/game.ts' {
//     interface Services { fires: Fires }
//   }
//
// and from then on `game.fires` is a Fires wherever the game is typed, and
// `game.provide('fires', …)` takes nothing else.

import { Emitter } from '../core/events.js';
import { Commands } from './commands.js';
import { Budget } from './budget.ts';
import { isNotYet } from '../core/notYet.ts';

export const PHASES = ['input', 'update', 'world', 'audio', 'render', 'late'] as const;
export type Phase = (typeof PHASES)[number];
const MAX_STEP = 0.05; // seconds. Below 20 fps time slows down rather than taking bigger steps.
const FAULTS_BEFORE_STOPPING = 5;

// dt: seconds since the last frame (clamped) · now: wall clock, ms ·
// time: seconds the game has been running · n: frame number
export interface Frame {
  dt: number;
  now: number;
  time: number;
  n: number;
}

// Something done every frame, in one phase of it.
export interface System {
  name: string;
  phase: Phase;
  update(frame: Frame): void;
  dispose?(): void;
}
interface Running extends System {
  faults: number;
  off: boolean;
}

// The controls, as far as the game itself needs them. Whoever provides
// 'input' has at least these.
export interface Controls {
  wasPressed(code: string): boolean;
  down(code: string): boolean;
  endFrame(): void;
}

// Everything provided, by name. Features add to this (see the top of the file).
export interface Services {
  input: Controls;
}

// The game has each service as a property of its own, once it is provided.
export interface Game extends Services {}

// Emits:
//   'ready'    ()        everything is installed and restored; the loop is about to start
//   'fault'    (system, error)   a system threw, and has been stopped after doing so repeatedly
//   'dispose'  ()
export class Game extends Emitter {
  config: Record<string, any>;
  storage: unknown;
  commands: Commands;
  systems: Record<Phase, Running[]>;
  frame: Frame;
  // What the console sees as `world`: every service by name, plus helpers.
  api: Partial<Services> & { game: Game } & Record<string, unknown>;
  // Work that is done a little each frame, all of it out of one allowance.
  budget: Budget;
  // What has to be here before the hiker is set down where they were left:
  // see beforeArrival().
  arrivals: Promise<unknown>[];
  // Whether the hiker is set down where the forest isn't drawn (a place of
  // its own, under the land: arrivesCovered()), so the opening needn't wait
  // for the forest round them.
  arrivingCovered = false;
  running: boolean;
  private _covers: Array<{ on: () => boolean; idle: () => boolean }>;
  private _before: Promise<unknown> | null = null;
  private _last: number;
  private _raf: number;
  private _tick: (now: number) => void;

  constructor({ config = {}, storage = null }: { config?: Record<string, any>; storage?: unknown } = {}) {
    super();
    this.config = config;
    this.storage = storage;
    this.commands = new Commands();
    this.systems = Object.fromEntries(PHASES.map((p) => [p, []])) as unknown as Record<Phase, Running[]>;
    this.frame = { dt: 0, now: 0, time: 0, n: 0 };
    this.api = { game: this };
    this.budget = new Budget();
    this.arrivals = [];
    // (The controls arrive when a feature provides them, as 'input'. The game
    // itself only asks three things of them: wasPressed(code), down(code),
    // endFrame().)
    this.running = false;
    this._covers = [];
    this._last = 0;
    this._raf = 0;
    this._tick = (now) => this.tick(now);
  }

  // ── Putting the game together ─────────────────────────────────────────────

  // Install a feature. Order matters: a feature can use what earlier ones provided.
  // One that has to fetch something before the features after it can use it
  // (the ground round the start, which they look about on as they install)
  // returns the promise of it, and whoever installs them waits: settled().
  use(install: (game: Game) => unknown): this {
    const r = install(this);
    if (r && typeof (r as Promise<unknown>).then === 'function') this._before = (r as Promise<unknown>).catch(() => {});
    return this;
  }

  // → a promise of what the feature last installed has to have before the
  // next is installed (see use()): at once, for nearly all of them.
  settled(): Promise<unknown> {
    const p = this._before || Promise.resolve();
    this._before = null;
    return p;
  }

  // Make something available to later features as game.<name>, and to the
  // console as world.<name>.
  provide<K extends keyof Services>(name: K, service: Services[K]): Services[K] {
    const held = this as unknown as Record<string, unknown>;
    if (held[name]) throw new Error(`"${name}" is already provided`);
    held[name] = service;
    (this.api as Record<string, unknown>)[name] = service;
    return service;
  }

  // { name, phase, update(frame), dispose?() }
  addSystem<S extends System>(system: S): S {
    if (!this.systems[system.phase]) throw new Error(`system "${system.name}": no such phase "${system.phase}" (${PHASES.join(', ')})`);
    this.systems[system.phase].push({ faults: 0, off: false, ...system });
    return system;
  }

  // Something that has to be here before the hiker is set down: code that is
  // fetched when it's first wanted (core/lazy.ts), and is wanted at once,
  // because the save says they were left standing on what it builds.
  // main.js waits for these, a while, before they arrive.
  beforeArrival(wait: Promise<unknown>): void {
    this.arrivals.push(wait.catch(() => {}));
  }

  // The save leaves the hiker somewhere that covers the forest (coverWhen:
  // Purgatory's mountain): main.js doesn't wait for the forest round where
  // they're set down before they arrive, since it isn't drawn (it streams in
  // after, as it does round anywhere). A place says so as it's restored.
  arrivesCovered(): void {
    this.arrivingCovered = true;
  }

  // While fn() is true something covers the whole view (the map, say) and the
  // world doesn't need drawing under it. idle(), if it's given, says when
  // what covers it is costing the frame next to nothing itself (the map,
  // while nobody is scrolling it): the frame then has time to spare (`spare`),
  // and the work that can wait is given more of it. Left out, it never is:
  // somewhere else that is drawn in the forest's place is as busy as the
  // forest was.
  coverWhen(fn: () => boolean, idle: () => boolean = () => false): void {
    this._covers.push({ on: fn, idle });
  }

  get covered(): boolean {
    return this._covers.some((c) => c.on());
  }

  // Whether the frame has time to spare: the view is covered, and by nothing
  // that is busy itself.
  get spare(): boolean {
    let any = false;
    for (const c of this._covers) {
      if (!c.on()) continue;
      if (!c.idle()) return false;
      any = true;
    }
    return any;
  }

  // ── Running ───────────────────────────────────────────────────────────────

  start(): void {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    this.emit('ready');
    this._raf = requestAnimationFrame(this._tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  // One frame. Called by the browser; call it yourself to step the game by hand.
  tick(now: number = performance.now()): void {
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
          // (asking about what's been sent for and isn't here yet is no
          // fault: it's asked again next frame)
          if (!isNotYet(err)) this._fault(s, err);
        }
      }
      // What can wait is done once the world has caught up with where you
      // are, out of whatever the frame can spare (budget.ts).
      if (phase === 'world') this.budget.run(this.spare);
    }
    // What was pressed this frame has now been seen by everyone.
    if (this.input) this.input.endFrame();
  }

  // A system that throws is reported, and one that throws frame after frame
  // is stopped: a stuck animal shouldn't freeze the forest.
  private _fault(s: Running, err: unknown): void {
    s.faults++;
    if (s.faults === 1) console.error(`[${s.name}]`, err);
    if (s.faults < FAULTS_BEFORE_STOPPING) return;
    s.off = true;
    console.error(`[${s.name}] stopped after failing ${s.faults} frames running`);
    this.emit('fault', s, err);
  }

  dispose(): void {
    this.stop();
    for (const phase of [...PHASES].reverse()) {
      for (const s of [...this.systems[phase]].reverse()) if (s.dispose) s.dispose();
      this.systems[phase].length = 0;
    }
    this.emit('dispose');
  }
}
