// Clearing a site: whatever stands where the building goes and has to come
// out before any stone is set. Standing trees are felled, so that they fall
// away from the site, and bucked into logs for the build; their stumps, and
// any already there, are grubbed out; the brush on the pad (bushes, ferns,
// old fallen logs, small stones) is spaded away. Boulders stay where they
// are, as they do for anyone.
//
// Trees and stumps count if they stand within ZONE of the footprint: close
// enough to be in the way of a footing, a wall, or levelling at a footing.
// The game's obstacles say which things can be cleared (o.clear: 'fell' or
// 'grub', see build/obstacles.js).
//
// Plain arithmetic, like plan.js: handed what is about as lists.

import { grow, inside, crosses } from './plan.js';
import { PAD } from './grade.js';

export const ZONE = PAD + 0.5; // m round the footprint cleared of trees and stumps
export const BRUSH_ZONE = PAD; // m round the footprint cleared of brush: the levelled pad

export const zone = (rect) => grow(rect, ZONE);

// Will this obstacle be cleared off the site before it gets in the way?
export const clearable = (o, rect) => !!o.clear && inside(o, zone(rect));

// Is a felled trunk, from its foot to its top end ({ x, z } each), lying
// on the site?
export function lyingOn(foot, top, rect) {
  const Z = zone(rect);
  return inside(foot, Z) || inside(top, Z) || crosses(foot, top, Z);
}

// What to clear next, from what's about the site:
//   { falling, down, trees, stumps, brush }   lists, each item with x, z
// A tree coming down is watched till it lands; one down on the site is
// bucked away before another is felled; then standing trees, then stumps,
// then brush, nearest `near` first. -> { type: 'wait' | 'buck' | 'fell' |
// 'grub' | 'brush', it } or null when the site is clear
export function nextClearing(about, near) {
  const nearest = (list) => {
    let best = null;
    for (const it of list) if (!best || Math.hypot(it.x - near.x, it.z - near.z) < Math.hypot(best.x - near.x, best.z - near.z)) best = it;
    return best;
  };
  for (const [type, list] of [
    ['wait', about.falling],
    ['buck', about.down],
    ['fell', about.trees],
    ['grub', about.stumps],
    ['brush', about.brush],
  ]) {
    if (list && list.length) return { type, it: nearest(list) };
  }
  return null;
}

// "clearing 2 trees · a stump", or '' if there's none of either.
export function clearingWords(trees, stumps) {
  const say = (n, one, many) => (n === 0 ? null : n === 1 ? `a ${one}` : `${n} ${many}`);
  const parts = [say(trees, 'tree', 'trees'), say(stumps, 'stump', 'stumps')].filter(Boolean);
  return parts.length ? `clearing ${parts.join(' · ')}` : '';
}
