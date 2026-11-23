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
// The first part is always the one whose HUD it is (the tool bar, the
// prompts): the hiker the keyboard and mouse drive too.
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
// Whoever was there before, if nobody else is them now; otherwise the first
// nobody is; and once everybody is somebody, two can be the same: whoever
// was there before (or the first) after all.
/**
 * @param {string[]} ids
 * @param {string[]} taken
 * @param {string | null} [kept]
 * @returns {string}
 */
export function cast(ids, taken, kept = null) {
  const known = kept !== null && ids.includes(kept);
  if (known && !taken.includes(kept)) return kept;
  return ids.find((id) => !taken.includes(id)) ?? (known ? kept : ids[0]);
}

// The next hiker after `id` that nobody else is (round from the end of the
// list), or `id` itself if each of the others is taken.
/**
 * @param {string[]} ids
 * @param {string} id
 * @param {string[]} taken
 * @returns {string}
 */
export function next(ids, id, taken) {
  const at = ids.indexOf(id);
  for (let k = 1; k <= ids.length; k++) {
    const c = ids[(at + k + ids.length) % ids.length];
    if (c !== id && !taken.includes(c)) return c;
  }
  return id;
}
