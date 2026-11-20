// What you know of where the mounts are, and when the forest tells you more.
//
// You start knowing nothing. A little while in, word comes of the nearest
// one: a wide circle on the map, and which way it is. Walk into that circle
// and you find signs of it (hoofprints, a track in the mud, a feather), and a
// smaller circle shows. See it, and it's on the map where it is. Word of the
// next one comes once you've won the first over, or after a while anyway.
//
// Pure, so it can be tested: the feature says where you are and what you've
// seen, and passes on the news.

import { STAGE, hintArea } from './haunts.js';

// Seconds before the first word comes, and between words after that.
export const FIRST = 20;
export const EVERY = 240;
// Closer than this (m) and you've found it, seen or not.
const FOUND = 35;

export class Hints {
  // haunts: { kind: haunt } (haunts.js); start: where the path starts
  constructor({ haunts, seed, start }) {
    this.haunts = haunts;
    this.seed = seed;
    // nearest first
    this.order = Object.keys(haunts).sort((a, b) => dist(haunts[a], start) - dist(haunts[b], start));
    this.stage = Object.fromEntries(this.order.map((k) => [k, STAGE.NONE]));
    this.tamed = new Set();
    this.wait = FIRST; // seconds until the next word comes
  }

  // What was known, from a save: { kind: stage }.
  load(stages) {
    for (const k of this.order) {
      const s = stages && stages[k];
      if (Number.isInteger(s) && s >= STAGE.NONE && s <= STAGE.SEEN) this.stage[k] = s;
    }
    // a word already out: the next one comes in its own time
    if (this.order.some((k) => this.stage[k] > STAGE.NONE)) this.wait = EVERY;
  }

  save() {
    return { ...this.stage };
  }

  // The circle to look in for one, or null once it's been seen (or before
  // there's been word of it).
  area(kind) {
    return hintArea(this.haunts[kind], this.stage[kind], this.seed);
  }

  // The next one there's been no word of, nearest first; or null.
  get unheard() {
    return this.order.find((k) => this.stage[k] === STAGE.NONE && !this.tamed.has(k)) ?? null;
  }

  // Word of the next one, now. -> its kind, or null if there's none left.
  rumour() {
    const k = this.unheard;
    if (!k) return null;
    this.stage[k] = STAGE.RUMOUR;
    this.wait = EVERY;
    return k;
  }

  // It's yours: there's nothing more to find out, and the next word comes soon.
  won(kind) {
    this.tamed.add(kind);
    this.stage[kind] = STAGE.SEEN;
    this.wait = Math.min(this.wait, FIRST);
  }

  // One frame. you: { x, z }; seen(kind) -> whether it's in sight right now.
  // -> [{ kind, stage }] for each piece of news (a rumour, signs, a sighting)
  update(dt, you, seen) {
    const news = [];
    this.wait -= dt;
    if (this.wait <= 0) {
      const k = this.rumour();
      if (k) news.push({ kind: k, stage: STAGE.RUMOUR });
      else this.wait = EVERY;
    }
    for (const k of this.order) {
      const s = this.stage[k];
      if (s === STAGE.SEEN) continue;
      if (seen(k) || dist(this.haunts[k], you) < FOUND) {
        this.stage[k] = STAGE.SEEN;
        news.push({ kind: k, stage: STAGE.SEEN });
        continue;
      }
      if (s === STAGE.RUMOUR) {
        const a = this.area(k);
        if (a && dist(a, you) < a.r) {
          this.stage[k] = STAGE.SIGNS;
          news.push({ kind: k, stage: STAGE.SIGNS });
        }
      }
    }
    return news;
  }
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
