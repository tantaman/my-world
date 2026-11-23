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
// A plain `yield` is a place to stop if time is up. `yield 'wait'` says the
// search can't get further until something else has been found (the railway
// there is still being surveyed): the others in line are gone on with, and
// this one is come back to next time. A search only waits while it is
// `patient`, which it is in pump() and is not in get(): wanted outright, it
// has what it needs found there and then (the owner reads searches.patient).
//
// Every such registry used to carry its own copy of this, and its own
// allowance of the frame. Now they are jobs sharing one (game/budget.ts):
//
//   game.budget.add({ name: 'tracks', work: (ms) => tracks.pump(ms) });

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
  private line = new Map<string, A>(); // asked about and not yet answered, in the order asked
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
    if (ask && !this.line.has(key)) this.line.set(key, arg);
    return undefined;
  }

  // Put in line, without asking what the answer is.
  ask(key: string, arg: A): void {
    if (!this.known.has(key) && !this.line.has(key)) this.line.set(key, arg);
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
    for (const [key, arg] of this.line) {
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
      if (this.clock() - t0 > ms) break;
    }
    return this.line.size;
  }

  // Forget everything (a registry that has grown too big to keep).
  clear(): void {
    this.known.clear();
    this.growing.clear();
    this.line.clear();
  }
}
