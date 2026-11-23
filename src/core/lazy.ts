// Code that isn't needed until you get there, fetched then, and once.
//
// Everything the game can do used to arrive in one file, so each new place
// to go made the first load longer for everyone, whether or not they ever
// went. What a place looks like (its buildings, its people, the inside of
// a ship) can come when you first come near instead: a feature keeps what
// plugs it in, and where its places are, and leaves the rest in a module of
// its own that is asked for here.
//
//   const look = lazy(() => import('./look.js'));   // nothing is fetched yet
//
//   const m = look.want();      // the module if it's here; if not, null, and it's sent for
//   if (!m) return;             // (standing a place up is tried again next frame anyway)
//   scene.add(m.buildStore(site));
//
//   await look.ready();         // or wait for it, where there is something to wait in
//
// A fetch that fails is tried again, but not straight away: after RETRY[0]
// seconds, then RETRY[1], and so on, so a server that's down isn't asked
// every frame. (A page left open across a new deploy asks for a file that's
// gone; only a reload mends that.)

const RETRY = [2, 5, 15, 30]; // s to wait before asking again, after each failure in a row

export class Lazy<M> {
  // The module, once it's here.
  loaded: M | null = null;
  private load: () => Promise<M>;
  private loading: Promise<M> | null = null;
  private failures = 0;
  private notBefore = 0; // ms: not asked again before this, after a failure
  private clock: () => number;

  constructor(load: () => Promise<M>, { clock = () => performance.now() }: { clock?: () => number } = {}) {
    this.load = load;
    this.clock = clock;
  }

  // The module if it's here; else null, and it's sent for (if it isn't already).
  want(): M | null {
    if (this.loaded) return this.loaded;
    if (!this.loading && this.clock() >= this.notBefore) this.fetch().catch(() => {});
    return null;
  }

  // -> Promise of the module. Rejects if this fetch fails (the next ask tries again).
  ready(): Promise<M> {
    if (this.loaded) return Promise.resolve(this.loaded);
    return this.loading || this.fetch();
  }

  private fetch(): Promise<M> {
    const going = this.load().then(
      (m) => {
        this.loaded = m;
        this.loading = null;
        this.failures = 0;
        return m;
      },
      (err) => {
        this.loading = null;
        this.notBefore = this.clock() + RETRY[Math.min(this.failures, RETRY.length - 1)] * 1000;
        this.failures++;
        console.warn('a part of the game could not be fetched, and will be asked for again', err);
        throw err;
      },
    );
    this.loading = going;
    return going;
  }
}

export const lazy = <M>(load: () => Promise<M>): Lazy<M> => new Lazy(load);
