// What is worth hunting, and what one gives you.
//
// By species (wildlife/species.js): how many cuts of meat a grown one gives,
// and how long (s) it takes to dress it. A young one, or a small one of its
// kind, gives less, by weight (its scale cubed), and takes less time.
// Anything not listed — a chipmunk, a mouse, a snake, a bird — isn't game:
// a shot goes past it as if it weren't there.

export const QUARRY = {
  deer: { cuts: 6, dress: 5 },
  elk: { cuts: 10, dress: 7 },
  moose: { cuts: 14, dress: 8 },
  bear: { cuts: 8, dress: 6 },
  wolf: { cuts: 4, dress: 4 },
  cougar: { cuts: 4, dress: 4 },
  bobcat: { cuts: 2, dress: 3 },
  fox: { cuts: 2, dress: 3 },
  rabbit: { cuts: 1, dress: 2 },
  squirrel: { cuts: 1, dress: 1.5 },
};

// The least time (s) dressing anything takes.
const DRESS_MIN = 1.5;

export const isGame = (kind) => Object.hasOwn(QUARRY, kind);

// What one of `kind` at `scale` gives: -> { cuts, dress } (at least a cut),
// or null if it isn't game.
export function yieldOf(kind, scale = 1) {
  const q = isGame(kind) ? QUARRY[kind] : null;
  if (!q) return null;
  const weight = Math.max(0, scale) ** 3;
  return {
    cuts: Math.max(1, Math.round(q.cuts * weight)),
    dress: Math.max(DRESS_MIN, Math.round(q.dress * Math.min(1, weight) * 10) / 10),
  };
}
