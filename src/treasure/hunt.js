// The rules of a treasure hunt, with nothing of the game in them: where a
// hoard is buried and how the map says to find it, counting your paces, and
// what a spade turns up where you dig. No three.js and no game: the tests
// read it.
//
// A hunt starts at an old place you can find on your own map (a cabin, a
// well, a tent someone left), and goes from there in two legs, each so many
// paces on a point of the compass: the first to a mark left on the way (a
// cairn, a post, a pick in the ground), the second to where it's buried.
// The legs run exactly on the bearings they name, so paced out true they
// end on the spot.
//
//   planHunt({ starts, ok, walkable, rnd }) -> a plan, or null
//     starts     [{ id, name, x, z }]: old places to begin at, tried in
//                order; (x, z) is where to stand (before its door)
//     ok(x, z)   whether a mark can stand, or a hoard be buried, there:
//                dry, not too steep, nothing built or growing on it
//     walkable(x, z)  whether you can go that way on foot (not deep water)
//     rnd        () -> 0..1
//
// A plan:
//   name       'the Hollis hoard'
//   start      the old place it begins at: { id, name, x, z }
//   legs       [{ from: { name, x, z }, way, paces, to: { x, z, mark? } }]
//   x, z       where it's buried
//   coins, trinket   what's in the chest

import { SURNAMES } from '../core/names.js';
import { toWorld } from '../world/frame.js';

export const PACE = 0.75; // m: one pace, a walking step
// North is -z, as on the map; the points go round clockwise from it.
export const WAYS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
// How many paces each leg is: the first out to the mark, the second to the spot.
export const LEGS = [
  [36, 64],
  [24, 48],
];
const AWAY = 20; // m: the spot is at least this far from where it began (no doubling back)
const TRIES = 24; // bearings tried from each old place before the next is
const ALONG = 4; // m between looks along a leg for water in the way
// m from the spot that a hole finds it; that turns up loose earth; that
// turns up a sign you're not far off
export const FIND = 3;
export const CLOSE = 8;
export const NEAR = 18;
export const AT_MARK = 3; // m from a mark you're standing at it, and the count starts again
const LEAP = 6; // m moved in one step that isn't walking (set down somewhere): not counted
const DOOR = 1.6; // m out from the front of an old place that a map starts

// What can be left to mark the way, and how it's said.
export const MARKS = {
  cairn: { a: 'a cairn', the: 'the cairn' },
  post: { a: 'a post with a cross cut in it', the: 'the post' },
  pick: { a: 'a rusted pick in the ground', the: 'the pick' },
};
const MARK_IDS = Object.keys(MARKS);

// What else is in the chest, besides the coins.
export const TRINKETS = [
  'a silver pocket watch',
  'a brass spyglass',
  'a gold ring',
  'a string of pearls',
  'a jewelled dagger',
  'a silver snuffbox',
  'an ivory compass',
  'a gold locket',
];
const COINS = [40, 300]; // gold coins in a hoard

// The point of the compass (dx, dz) is nearest: 'north-west'.
export function way(dx, dz) {
  const a = Math.atan2(dx, -dz);
  return WAYS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}

// Which way a point of the compass goes: { x, z }, a unit step.
export function stepOf(w) {
  const i = WAYS.indexOf(w);
  if (i < 0) throw new Error(`no such point of the compass: ${w}`);
  const a = (i * Math.PI) / 4;
  return { x: Math.sin(a), z: -Math.cos(a) };
}

// The way the camera looks, turned to camYaw (it looks along -sin, -cos of
// it): which is the way you walk when you press forward.
export const looking = (camYaw) => way(-Math.sin(camYaw), -Math.cos(camYaw));

// How far the camera, turned to camYaw, looks off the point of the compass
// w (radians): > 0 to the right of it, < 0 to the left.
export function offCourse(camYaw, w) {
  const a = Math.atan2(-Math.sin(camYaw), Math.cos(camYaw));
  const b = (WAYS.indexOf(w) * Math.PI) / 4;
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

const pick = (list, rnd) => list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];
const between = ([lo, hi], rnd) => lo + Math.floor(rnd() * (hi - lo + 1));

// Where a map starts at an old place (a site, as landmarks/sites.js has it):
// out before its front, where its door is. -> { x, z }, or null for one with
// no ground of its own.
/** @param {{ x: number, z: number, yaw: number, plan: number[][] }} site */
export function doorOf(site) {
  if (!site.plan.length) return null;
  const front = Math.max(...site.plan.map((r) => r[3]));
  const at = toWorld(site, 0, front + DOOR);
  return { x: at.x, z: at.z };
}

// Where it's buried, and the way there from one of the old places.
/**
 * @typedef {{ id: string, name: string, x: number, z: number }} Start
 * @param {object} o
 * @param {Start[]} o.starts
 * @param {(x: number, z: number) => boolean} o.ok
 * @param {(x: number, z: number) => boolean} [o.walkable]
 * @param {() => number} [o.rnd]
 */
export function planHunt({ starts, ok, walkable = () => true, rnd = Math.random }) {
  const clearTo = (a, b) => {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(d / ALONG));
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      if (!walkable(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k)) return false;
    }
    return true;
  };
  for (const start of starts) {
    for (let t = 0; t < TRIES; t++) {
      const w1 = Math.floor(rnd() * 8);
      // the second leg turns off the first, but never back the way it came
      const turn = [-3, -2, -1, 1, 2, 3][Math.floor(rnd() * 6)];
      const w2 = (w1 + turn + 8) % 8;
      const p1 = between(LEGS[0], rnd);
      const p2 = between(LEGS[1], rnd);
      const s1 = stepOf(WAYS[w1]);
      const s2 = stepOf(WAYS[w2]);
      const mark = { x: start.x + s1.x * p1 * PACE, z: start.z + s1.z * p1 * PACE };
      const spot = { x: mark.x + s2.x * p2 * PACE, z: mark.z + s2.z * p2 * PACE };
      if (Math.hypot(spot.x - start.x, spot.z - start.z) < AWAY) continue;
      if (!ok(mark.x, mark.z) || !ok(spot.x, spot.z)) continue;
      if (!clearTo(start, mark) || !clearTo(mark, spot)) continue;
      const kind = pick(MARK_IDS, rnd);
      const owner = pick(
        SURNAMES.filter((s) => !start.name.includes(s)),
        rnd,
      );
      return {
        name: `the ${owner} hoard`,
        start: { id: start.id, name: start.name, x: start.x, z: start.z },
        legs: [
          { from: { name: start.name, x: start.x, z: start.z }, way: WAYS[w1], paces: p1, to: { ...mark, mark: kind } },
          { from: { name: MARKS[kind].the, ...mark }, way: WAYS[w2], paces: p2, to: { ...spot } },
        ],
        x: spot.x,
        z: spot.z,
        coins: between(COINS, rnd),
        trinket: pick(TRINKETS, rnd),
      };
    }
  }
  return null;
}

// What a hole dug at (x, z) turns up.
//   -> { found, d, word }   found: it's there; word: what you make of it
export function digAt(plan, x, z) {
  const d = Math.hypot(x - plan.x, z - plan.z);
  if (d <= FIND) return { found: true, d, word: 'your spade strikes wood' };
  if (d <= CLOSE) return { found: false, d, word: 'nothing yet, but the earth is loose here: someone has dug close by' };
  if (d <= NEAR) return { found: false, d, word: 'roots and stones · not far off, though' };
  return { found: false, d, word: 'nothing but roots and stones' };
}

// Counting paces from a mark. The count starts when you stand at it (and
// starts again whenever you're back), and goes up with every pace walked
// from there: walked, not as the crow flies, so a wander off the line
// costs you, as it would with a real map. Only on foot: what carries you
// isn't counted, nor being set down somewhere. Near the mark (AT_MARK) it is
// how far you stand from it, so that the count is from the mark itself and
// not from wherever you were when you stepped out of reach of it.
export class Pacer {
  constructor() {
    this.mark = null; // { x, z }
    this.stood = false; // whether you've stood at it yet
    this.walked = 0; // m on foot since
    this.last = null; // where you were last step
  }

  // Count from here now.
  from(mark) {
    this.mark = { x: mark.x, z: mark.z };
    this.stood = false;
    this.walked = 0;
  }

  // You're at (x, z) this frame; onFoot: walking, not carried or swimming.
  step(x, z, onFoot) {
    const m = this.mark;
    const d = m ? Math.hypot(x - m.x, z - m.z) : Infinity;
    if (d <= AT_MARK) {
      this.stood = true;
      this.walked = d;
    } else if (this.stood && onFoot && this.last) {
      const step = Math.hypot(x - this.last.x, z - this.last.z);
      if (step < LEAP) this.walked += step;
    }
    this.last = { x, z };
  }

  // Paces since you stood at the mark, or null if you haven't yet.
  get paces() {
    return this.stood ? Math.round(this.walked / PACE) : null;
  }
}

// What you've dug up, as it's kept with you: { coins, hoards: [[name, coins,
// trinket]] }, the last few dozen hoards. A save is bytes somebody sent us:
// check the shape.
export const KEPT = 60;
/** @typedef {{ coins: number, hoards: Array<[string, number, string]> }} Finds */
/** @param {any} raw @returns {Finds} */
export function validateFinds(raw) {
  /** @type {Finds} */
  const out = { coins: 0, hoards: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const short = (s) => typeof s === 'string' && s.length > 0 && s.length <= 60;
  if (Array.isArray(raw.hoards)) {
    for (const h of raw.hoards) {
      if (!Array.isArray(h) || h.length !== 3 || !short(h[0]) || !short(h[2]) || !(Number.isFinite(h[1]) && h[1] >= 0)) continue;
      out.hoards.push([h[0], Math.floor(h[1]), h[2]]);
    }
    out.hoards = out.hoards.slice(-KEPT);
  }
  out.coins = Number.isFinite(raw.coins) && raw.coins >= 0 ? Math.floor(raw.coins) : out.hoards.reduce((n, h) => n + h[1], 0);
  return out;
}

// Your finds, as the pack lists them: the coins, and each kind of trinket.
//   -> [{ label, note }]
/** @param {Finds} finds */
export function listFinds(finds) {
  if (!finds.coins && !finds.hoards.length) return [];
  const n = finds.hoards.length;
  const out = [{ label: 'gold coins', note: `${finds.coins} · from ${n === 1 ? 'one hoard' : `${n} hoards`}` }];
  const count = new Map();
  for (const [, , t] of finds.hoards) count.set(t, (count.get(t) || 0) + 1);
  for (const [t, k] of count) out.push({ label: t, note: k > 1 ? `${k} of them` : '' });
  return out;
}
