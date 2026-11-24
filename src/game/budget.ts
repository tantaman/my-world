// Work done a little at a time, all of it out of one allowance a frame.
//
// Finding where the towns are further off, where a race track can go, which
// squares hold an old ruin: none of it has to be done this frame, so it is
// done in slices, a millisecond or two at a time. Each such search used to
// keep an allowance of its own, and with several busy at once a frame was
// asked for more time than it had. Now each is a *job*, and the jobs share
// one allowance:
//
//   game.budget.add({
//     name: 'towns',
//     work: (ms) => towns.pump(ms),   // do up to about ms of it -> is there more?
//   });
//
// Each frame the allowance is shared out among the jobs that have something
// to do, a different one first each time, so a job with a great deal to do
// can't keep the others waiting. A job with nothing to do costs one call.
// One that throws is reported, and stopped if it keeps on, like a system
// (game.ts).
//
// Some of it holds the rest up: every road for kilometres waits to know where
// the ship's pier is, and nearly everything waits for the airfield where you
// are. A job says so while it's so (`pressing`), and then goes before the
// others and may have most of the allowance (PRESSING_SHARE of it), rather
// than its even share of it, which with a dozen jobs busy is very little.
// What it doesn't use the others have, as ever.
//
// And some of it nobody is waiting for at all: the airfields of the other
// parts of the world, before anyone has asked where they could fly. A job
// says that too while it's so (`idle`), and then has only what the others
// leave: nothing while they are busy, all of it once they're done.
//
// A job can't be stopped part way through a step, so a step that runs long
// takes the frame over its allowance. What it went over by is owed: it comes
// out of the frames after, which do less, or nothing, until it's made up. So
// the allowance holds over any second or so, whatever the jobs' steps are
// like, and a job with long steps is slower for it rather than the game.
// (The frame the long step was in is still late: keep steps short. A search
// should yield every millisecond or two of work, not every so many rows.)
//
// What you are standing on is not in here: the ground and the grass stream
// in on allowances of their own (world/index.js), because they are not work
// that can wait.

import { isNotYet } from '../core/notYet.ts';

const USUAL_MS = 4; // ms a frame for all of it, while the world is being drawn
const ROOMY_MS = 10; // ...and while it isn't, and nothing else is (the map is over it, and still): the frame has time to spare (but is still a frame: with the rest of what it does, this keeps it under 16 ms)
const LEAST_MS = 0.5; // a job's slice is never cut finer than this
const PRESSING_SHARE = 0.75; // how much of the allowance the jobs others are waiting on may have between them, before the rest have theirs
const OWED_MOST = 120; // ms owed at the most: one dreadful step doesn't stop the jobs for longer than half a second or so
const FAULTS_BEFORE_STOPPING = 5;

export interface Job {
  name: string;
  // Do up to about `ms` milliseconds of work. -> whether there is more to do
  // (true, or how much, anything but 0 / false / nothing).
  work(ms: number): boolean | number | void;
  // Whether others are held up until this has done what it's doing now
  // (asked each frame): see the top.
  pressing?(): boolean;
  // Whether nobody is waiting for what it has to do now (asked each frame).
  idle?(): boolean;
}

interface Held extends Job {
  faults: number;
}

export class Budget {
  usual = USUAL_MS;
  roomy = ROOMY_MS;
  // ms spent last frame, and by which jobs: { towns: 1.2, … } (for the stats line)
  spent = 0;
  by: Record<string, number> = {};
  // ms the frames so far have gone over by, still to be made up
  owed = 0;
  private jobs: Held[] = [];
  private first = 0;
  private clock: () => number;

  constructor({ clock = () => performance.now() }: { clock?: () => number } = {}) {
    this.clock = clock;
  }

  // -> a function that takes the job off again
  add(job: Job): () => void {
    if (this.jobs.some((j) => j.name === job.name)) throw new Error(`two jobs are called "${job.name}"`);
    const held: Held = { faults: 0, ...job, work: job.work.bind(job), pressing: job.pressing?.bind(job), idle: job.idle?.bind(job) };
    this.jobs.push(held);
    return () => {
      const i = this.jobs.indexOf(held);
      if (i >= 0) this.jobs.splice(i, 1);
    };
  }

  get names(): string[] {
    return this.jobs.map((j) => j.name);
  }

  // One frame's worth: `roomy` when the frame has time to spare (nothing is
  // being drawn under whatever covers the view, and that is still: Game's
  // `spare`). (Game.tick calls this; call it yourself to step by hand.)
  run(roomy = false): void {
    const whole = roomy ? this.roomy : this.usual;
    this.spent = 0;
    this.by = {};
    const n = this.jobs.length;
    if (!n) return;
    // What's owed comes out of this frame first, and if that's all of it,
    // nothing is done.
    const allowance = whole - this.owed;
    if (allowance < LEAST_MS) {
      this.owed = Math.max(0, this.owed - whole);
      return;
    }
    const t0 = this.clock();
    // Whoever went first last frame goes last this one.
    this.first = (this.first + 1) % n;
    const pressing: Held[] = [];
    const usual: Held[] = [];
    const idle: Held[] = [];
    for (let i = 0; i < n; i++) {
      const job = this.jobs[(this.first + i) % n];
      (job.pressing && job.pressing() ? pressing : job.idle && job.idle() ? idle : usual).push(job);
    }
    // Those the others are waiting on, first.
    for (let i = 0; i < pressing.length; i++) {
      const left = allowance * PRESSING_SHARE - (this.clock() - t0);
      if (left < LEAST_MS) break;
      this._turn(pressing[i], left / (pressing.length - i));
    }
    // Then the rest, and with what they leave, those nobody is waiting for.
    if (this._rounds(usual, t0, allowance)) this._rounds(idle, t0, allowance);
    this._close(t0, allowance);
  }

  // Round and round these, a slice each, until the allowance is gone or none
  // of them has anything left. -> whether there's allowance left.
  private _rounds(waiting: Held[], t0: number, allowance: number): boolean {
    while (waiting.length) {
      const still: Held[] = [];
      for (let i = 0; i < waiting.length; i++) {
        const left = allowance - (this.clock() - t0);
        if (left <= 0) return false;
        const slice = Math.min(left, Math.max(LEAST_MS, left / (waiting.length - i))); // an even share of what's left, among those still to go this round
        // It comes round again this frame only if it used what it was given:
        // one that stopped short is waiting on something, and asking it over
        // and over would only burn the allowance.
        if (this._turn(waiting[i], slice)) still.push(waiting[i]);
      }
      waiting = still;
    }
    return allowance - (this.clock() - t0) > 0;
  }

  // A job's turn: up to about `ms` of its work. -> whether it has more to do
  // and used what it was given (so is worth coming back to this frame).
  private _turn(job: Held, ms: number): boolean {
    const before = this.clock();
    let more: boolean | number | void = false;
    try {
      more = job.work(ms);
      job.faults = 0;
    } catch (err) {
      more = false;
      // (what it asked about isn't here yet: no fault, it's asked again)
      if (!isNotYet(err)) this._fault(job, err);
    }
    const took = this.clock() - before;
    if (took > 0) this.by[job.name] = (this.by[job.name] || 0) + took;
    return !!more && took >= ms * 0.5;
  }

  private _close(t0: number, allowance: number): void {
    this.spent = this.clock() - t0;
    this.owed = Math.min(OWED_MOST, Math.max(0, this.spent - allowance));
  }

  private _fault(job: Held, err: unknown): void {
    job.faults++;
    if (job.faults === 1) console.error(`[${job.name}]`, err);
    if (job.faults < FAULTS_BEFORE_STOPPING) return;
    console.error(`[${job.name}] stopped after failing ${job.faults} times running`);
    const i = this.jobs.indexOf(job);
    if (i >= 0) this.jobs.splice(i, 1);
  }
}
