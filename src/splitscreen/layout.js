// How a split screen is shared out: where each part goes, and who each hiker
// on it is.

// The most people one screen is shared between.
export const MOST = 4;

// Where each of n parts of a screen goes, on a screen this shape (its width
// over its height): [{ x, y, w, h }], fractions of it from its top left.
//
//   1   the whole of it
//   2   side by side; one over the other on a screen taller than it is wide
//   3   the first down one half, the other two one over the other in the
//       other half (on a tall screen: the first across the top half, the
//       other two side by side under it)
//   4   quarters
//
// The first part is always the one with the game's own HUD on it (the tool
// bar, the prompts): the hiker the keyboard and mouse drive too.
export function layout(n, aspect = 16 / 9) {
  const wide = aspect >= 1;
  const rect = (x, y, w, h) => ({ x, y, w, h });
  if (n <= 1) return [rect(0, 0, 1, 1)];
  if (n === 2) return wide ? [rect(0, 0, 0.5, 1), rect(0.5, 0, 0.5, 1)] : [rect(0, 0, 1, 0.5), rect(0, 0.5, 1, 0.5)];
  if (n === 3) {
    return wide
      ? [rect(0, 0, 0.5, 1), rect(0.5, 0, 0.5, 0.5), rect(0.5, 0.5, 0.5, 0.5)]
      : [rect(0, 0, 1, 0.5), rect(0, 0.5, 0.5, 0.5), rect(0.5, 0.5, 0.5, 0.5)];
  }
  return [rect(0, 0, 0.5, 0.5), rect(0.5, 0, 0.5, 0.5), rect(0, 0.5, 0.5, 0.5), rect(0.5, 0.5, 0.5, 0.5)];
}

// Who someone joining is. ids: every hiker's, in the order they're offered
// (player/hikers.js) · taken: the ids already being hiked as · kept: who
// was last on this part of the screen, if anyone.
// Whoever was there before, whether or not somebody else is them now (who
// you are is yours to choose, and two can be the same); for someone new, the
// first nobody is; and once everybody is somebody, the first.
/**
 * @param {string[]} ids
 * @param {string[]} taken
 * @param {string | null} [kept]
 * @returns {string}
 */
export function cast(ids, taken, kept = null) {
  if (kept !== null && ids.includes(kept)) return kept;
  return ids.find((id) => !taken.includes(id)) ?? ids[0];
}

// The hiker `by` places on from `id` in the list (the one before it: -1),
// round from either end: anyone, whoever else is them already.
/**
 * @param {string[]} ids
 * @param {string} id
 * @param {number} [by]
 * @returns {string}
 */
export function next(ids, id, by = 1) {
  const n = ids.length;
  return ids[(((ids.indexOf(id) + by) % n) + n) % n];
}
