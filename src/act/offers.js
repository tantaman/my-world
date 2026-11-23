// What could be done with what's at hand, and which of it the act key does.
//
// Each feature offers what it would do: at() says, now, how far you are from
// the thing it would be done to and what doing it is called, or null when
// there's nothing to do. The nearest wins: what you're in or on (0 m away)
// before anything beside you, and of two as near, the one offered first.
//
//   offers.offer({ id, at })   at() -> null, or { d, word, run, hold }:
//                                d      how far you are from it (m)
//                                word   what it would do, in a word or two ('get in', 'ride')
//                                run()  do it
//                                hold(dt)  if it's done by holding the key
//                                       down (calming a wild horse): each
//                                       frame the key is held
//                                icon   what it is done to, as a picture for
//                                       your pack (src/pack/picture.js): a
//                                       canoe, a horse
//   offers.here() -> what the key would do now ({ id, d, word, run, hold, icon }), or null
//   offers.press() -> do it: whether there was anything to do
//   offers.hold(dt) -> the key held down a frame: whether that did anything
//
// No three.js, and no game: the tests read it.

export class Offers {
  constructor() {
    this.list = [];
  }

  offer(o) {
    if (!o || !o.id || typeof o.at !== 'function') throw new Error('an offer needs an id and at()');
    if (this.list.some((p) => p.id === o.id)) throw new Error(`there's an offer called "${o.id}" already`);
    this.list.push(o);
    return o;
  }

  here() {
    let best = null;
    for (const o of this.list) {
      const a = o.at();
      if (!a || !(a.d <= Infinity) || typeof a.run !== 'function') continue;
      if (!best || a.d < best.d) best = { id: o.id, d: a.d, word: a.word || '', run: a.run, hold: a.hold || null, icon: a.icon || null };
    }
    return best;
  }

  press() {
    const a = this.here();
    if (!a) return false;
    a.run();
    return true;
  }

  hold(dt) {
    const a = this.here();
    if (!a || !a.hold) return false;
    a.hold(dt);
    return true;
  }
}
