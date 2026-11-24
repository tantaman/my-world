// Answers that take a while to work out, each worked out once: where the
// railway runs in a square, whether a town has a race track and where.
//
// The world has no end, so nothing like that is worked out ahead of time.
// It is worked out when it's asked for, and kept. Asking can go two ways:
//
//   get(key)    the answer, now: the search is run to its end, however long
//               that takes (someone is going there)
//   peek(key)   the answer if it is known, or undefined, and the search is
//               put in line to be done a little at a time by pump() (a list,
//               the map: they'd rather fill in over a few frames than stall)
//
// The search itself is the owner's, a generator that yields now and then so
// it can be left there until next frame:
//
//   const tracks = new Searches({
//     *grow(id, town) { …; yield; …; return site; },   // or null: nothing there
//   });
//
// A plain `yield` is a place to stop if time is up: there should be one
// every millisecond or two of work, since a step can't be stopped part way
// and the frame waits for it (game/budget.ts). `yield 'wait'` says the
// search can't get further until something else has been found (the railway
// there is still being surveyed): the others in line are gone on with, and
// this one is come back to next time. A search only waits while it is
// `patient`, which it is in pump() and is not in get(): wanted outright, it
// has what it needs found there and then (the owner reads searches.patient).
//
// A search that asks about something sent for and not here yet (the real
// Earth under a part of the world, before its tile has come: core/notYet.ts)
// is dropped and started over from the beginning once it's in line again:
// searches answer from the seed alone, so starting over finds the same.
//
// The line is gone through most lately asked for first. Whoever still wants
// an answer asks again: what looks round where you are asks every second or
// two, the map every time it's drawn, a search waiting on another every
// time it's come back to. So what is wanted now, and whatever that is
// waiting on, is found before what was asked for once, a while ago (the
// roads across a map that has since been scrolled away, or shut). Those
// asked for together are looked for in the order they were asked in:
// nearest first, if that's how they were asked. Nothing is dropped; what
// nobody asks for again is found last.
//
// Every such registry used to carry its own copy of this, and its own
// allowance of the frame. Now they are jobs sharing one (game/budget.ts):
//
//   game.budget.add({ name: 'tracks', work: (ms) => tracks.pump(ms) });

import { isNotYet } from './notYet.ts';

export type Search<T> = Generator<unknown, T, unknown>;

export interface SearchOptions<T, A> {
  // Work out the answer for `key`: a generator, or (if it's quick) the
  // answer itself. `arg` is whatever was handed in with the key.
  grow(key: string, arg: A): Search<T> | T;
  // Told each answer as it's found, once.
  found?(key: string, answer: T): void;
  clock?: () => number;
}

const isSearch = <T>(v: Search<T> | T): v is Search<T> => !!v && typeof (v as Search<T>).next === 'function' && typeof (v as Search<T>)[Symbol.iterator] === 'function';

export class Searches<T, A = undefined> {
  // key -> the answer, for every one worked out so far
  readonly known = new Map<string, T>();
  // False while an answer is wanted outright (inside get): see above.
  patient = true;
  private growing = new Map<string, Search<T>>();
  // Asked about and not yet answered: what was handed in with each, and
  // which turn of pump it was last asked for in. Kept in the order they were
  // last asked for, so the latest are at the end.
  private line = new Map<string, { arg: A; turn: number }>();
  private turn = 0;
  private grow: (key: string, arg: A) => Search<T> | T;
  private found?: (key: string, answer: T) => void;
  private clock: () => number;

  constructor({ grow, found, clock = () => performance.now() }: SearchOptions<T, A>) {
    this.grow = grow;
    this.found = found;
    this.clock = clock;
  }

  // How many are in line.
  get size(): number {
    return this.line.size;
  }

  // The line itself, as far as anyone outside needs it: how long it is,
  // whether a key is in it, and putting one in.
  readonly queue = {
    owner: this as Searches<T, A>,
    get size(): number {
      return this.owner.line.size;
    },
    has(key: string): boolean {
      return this.owner.line.has(key);
    },
    add(key: string, arg?: A): void {
      this.owner.ask(key, arg as A);
    },
  };

  has(key: string): boolean {
    return this.known.has(key);
  }

  // The answer, now.
  get(key: string, arg: A): T {
    if (this.known.has(key)) return this.known.get(key) as T;
    let run = this.growing.get(key);
    if (!run) {
      const begun = this.grow(key, arg);
      if (!isSearch(begun)) return this.set(key, begun);
      run = begun;
    }
    const was = this.patient;
    this.patient = false;
    try {
      let r = run.next();
      while (!r.done) r = run.next();
      return this.set(key, r.value);
    } finally {
      this.patient = was;
    }
  }

  // The answer if it's known; else undefined, and unless `ask` is false it's
  // put in line for pump().
  peek(key: string, arg: A, ask = true): T | undefined {
    if (this.known.has(key)) return this.known.get(key) as T;
    if (ask) this.want(key, arg);
    return undefined;
  }

  // Put in line, without asking what the answer is.
  ask(key: string, arg: A): void {
    if (!this.known.has(key)) this.want(key, arg);
  }

  // In line, as asked for just now: at the end of it, where pump looks first.
  private want(key: string, arg: A): void {
    const held = this.line.get(key);
    if (!held) {
      this.line.set(key, { arg, turn: this.turn });
      return;
    }
    if (held.turn === this.turn) return; // (asked for already since pump last looked)
    held.turn = this.turn;
    this.line.delete(key);
    this.line.set(key, held);
  }

  // The answer is this (it needed no search, or was found some other way).
  set(key: string, answer: T): T {
    this.growing.delete(key);
    this.line.delete(key);
    this.known.set(key, answer);
    if (this.found) this.found(key, answer);
    return answer;
  }

  // Work through the line for up to `ms` milliseconds. -> how many are left.
  pump(ms: number): number {
    const t0 = this.clock();
    for (const key of this.inTurn()) {
      const held = this.line.get(key);
      if (!held) continue; // (answered meanwhile: something wanted it outright)
      const arg = held.arg;
      try {
        let run = this.growing.get(key);
        if (!run) {
          const begun = this.grow(key, arg);
          if (!isSearch(begun)) {
            this.set(key, begun);
            if (this.clock() - t0 > ms) break;
            continue;
          }
          this.growing.set(key, (run = begun));
        }
        for (;;) {
          const r = run.next();
          if (r.done) {
            this.set(key, r.value);
            break;
          }
          if (r.value === 'wait') break; // on with the next: this one can't get further yet
          if (this.clock() - t0 > ms) return this.line.size;
        }
      } catch (err) {
        if (!isNotYet(err)) throw err;
        this.growing.delete(key); // to start over when what it asked about is here
      }
      if (this.clock() - t0 > ms) break;
    }
    return this.line.size;
  }

  // The line as pump goes through it: those asked for most lately first, and
  // those asked for in the same turn in the order they were. (The line is
  // kept in the order last asked for, so that is its runs of one turn, the
  // last run first.) What's asked for from here on is for the next turn.
  private inTurn(): string[] {
    const { keys, turns, order } = this;
    keys.length = turns.length = order.length = 0;
    this.turn++;
    if (!this.line.size) return order;
    this.line.forEach((held, key) => {
      keys.push(key);
      turns.push(held.turn);
    });
    let end = keys.length;
    while (end > 0) {
      const turn = turns[end - 1];
      let start = end - 1;
      while (start > 0 && turns[start - 1] === turn) start--;
      for (let i = start; i < end; i++) order.push(keys[i]);
      end = start;
    }
    return order;
  }
  // (kept from one pump to the next, to make nothing new each frame)
  private keys: string[] = [];
  private turns: number[] = [];
  private order: string[] = [];

  // Forget everything (a registry that has grown too big to keep).
  clear(): void {
    this.known.clear();
    this.growing.clear();
    this.line.clear();
  }
}
