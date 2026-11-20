// Winning a wild one over. It has to get used to you: its trust grows while
// you stand quietly beside it with a hand held out (hold Z), fades slowly
// when you stop, and drops sharply if you come rushing at it, which also
// sends it off. Full trust, and it's yours.
//
// Pure, so it can be tested on its own.

// Slower than this (m/s) counts as standing quietly.
export const STILL = 0.8;
// Trust lost each second it isn't being calmed, and all at once when it bolts.
const FADE = 0.06;
const SPOOKED = 0.5;

// One frame of it.
//   state  { trust 0..1, mood }  updated in place; mood is what it makes of you:
//          'calm'    you're beside it, hand out
//          'watch'   near enough to keep an eye on
//          'bolt'    you came at it too fast: it's off
//          'ignore'  you're nowhere near
//   you    { d: m away, speed: m/s, holding: whether the hand is out }
//   t      its temperament: { notice, wary, spook, reach, calm } (kinds.js)
// -> state
export function sense(state, you, t, dt) {
  if (you.d < t.wary && you.speed > t.spook) {
    state.trust = Math.max(0, state.trust - SPOOKED);
    state.mood = 'bolt';
    return state;
  }
  if (you.holding && you.d < t.reach) {
    // reaching out while still moving neither counts nor scares it
    if (you.speed < STILL) state.trust = Math.min(1, state.trust + dt / t.calm);
    state.mood = 'calm';
    return state;
  }
  state.trust = Math.max(0, state.trust - FADE * dt);
  state.mood = you.d < t.notice ? 'watch' : 'ignore';
  return state;
}

export const tamed = (state) => state.trust >= 1;
