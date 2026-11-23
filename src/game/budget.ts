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
// What you are standing on is not in here: the ground and the grass stream
// in on allowances of their own (world/index.js), because they are not work
// that can wait.

import { isNotYet } from '../core/notYet.ts';

const USUAL_MS = 4; // ms a frame for all of it, while the world is being drawn
const ROOMY_MS = 12; // ...and while it isn't (the map is over it): the frame has time to spare
const LEAST_MS = 0.5; // a job's slice is never cut finer than this
const FAULTS_BEFORE_STOPPING = 5;

export interface Job {
  name: string;
  // Do up to about `ms` milliseconds of work. -> whether there is more to do
  // (true, or how much, anything but 0 / false / nothing).
  work(ms: number): boolean | number | void;
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
  private jobs: Held[] = [];
  private first = 0;
  private clock: () => number;

  constructor({ clock = () => performance.now() }: { clock?: () => number } = {}) {
    this.clock = clock;
  }

  // -> a function that takes the job off again
  add(job: Job): () => void {
    if (this.jobs.some((j) => j.name === job.name)) throw new Error(`two jobs are called "${job.name}"`);
    const held: Held = { faults: 0, ...job, work: job.work.bind(job) };
    this.jobs.push(held);
    return () => {
      const i = this.jobs.indexOf(held);
      if (i >= 0) this.jobs.splice(i, 1);
    };
  }

  get names(): string[] {
    return this.jobs.map((j) => j.name);
  }

  // One frame's worth: `roomy` when nothing is being drawn under whatever
  // covers the view. (Game.tick calls this; call it yourself to step by hand.)
  run(roomy = false): void {
    const allowance = roomy ? this.roomy : this.usual;
    this.spent = 0;
    this.by = {};
    const n = this.jobs.length;
    if (!n) return;
    // Round and round, a slice each, until the allowance is gone or nobody
    // has anything left. Whoever went first last frame goes last this one.
    this.first = (this.first + 1) % n;
    let waiting = this.jobs.slice(this.first).concat(this.jobs.slice(0, this.first));
    const t0 = this.clock();
    while (waiting.length) {
      const still: Held[] = [];
      for (let i = 0; i < waiting.length; i++) {
        const left = allowance - (this.clock() - t0);
        if (left <= 0) return this._close(t0);
        const job = waiting[i];
        const slice = Math.max(LEAST_MS, left / (waiting.length - i)); // an even share of what's left, among those still to go this round
        const before = this.clock();
        let more: boolean | number | void = false;
        try {
          more = job.work(Math.min(slice, left));
          job.faults = 0;
        } catch (err) {
          more = false;
          // (what it asked about isn't here yet: no fault, it's asked again)
          if (!isNotYet(err)) this._fault(job, err);
        }
        const took = this.clock() - before;
        if (took > 0) this.by[job.name] = (this.by[job.name] || 0) + took;
        // It comes round again this frame only if it used what it was given:
        // one that stopped short is waiting on something, and asking it over
        // and over would only burn the allowance.
        if (more && took >= Math.min(slice, left) * 0.5) still.push(job);
      }
      waiting = still;
    }
    this._close(t0);
  }

  private _close(t0: number): void {
    this.spent = this.clock() - t0;
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
