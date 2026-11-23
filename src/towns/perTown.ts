// One of something beside some of the towns: a video store past the last
// houses of a village, a race track outside a western town.
//
// Which towns have one is from the seed and the town alone (`has`, cheap:
// no land looked at); where it stands is looked for the first time it's
// wanted, outright (forTown) or a little at a time (peek, then pump: see
// core/searches.ts). It stands inside its town's own square, so no two of a
// kind meet.
//
// No three.js in here: the tests read what's built on it.

import { Searches, type Search } from '../core/searches.ts';

export interface Town {
  id: string;
  x: number;
  z: number;
}

// The Towns (towns/towns.js), as much as this needs of them.
export interface TownsLike<T extends Town> {
  size: number; // m, the side of the square each town has to itself
  cell(i: number, j: number): T | null;
  peek(i: number, j: number): T | null | undefined;
  within(x0: number, z0: number, x1: number, z1: number, wait?: boolean): T[];
  byId(id: string): T | null;
}

export interface Placed {
  box: number[]; // [x0, z0, x1, z1] in the world
}

export type Square = [number, number, number, number];

export interface PerTownOptions<T extends Town, S extends Placed> {
  towns: TownsLike<T>;
  // What its ids begin with: 'videostore' for 'videostore:town:<i>:<j>'.
  prefix: string;
  // Whether town t has one at all.
  has(t: T): boolean;
  // Look for where it stands, inside its town's `square`. A generator (see
  // core/searches.ts); patient() says whether it may wait for something
  // else to be found rather than have it found there and then.
  grow(t: T, square: Square, patient: () => boolean): Search<S | null>;
  // Told each one as it's found (or that a town turned out to have none).
  found?(site: S | null): void;
  // The furthest (m) one reaches past its town's box. Given, the towns
  // asked about are those whose box comes this near; left out, those of the
  // squares a rectangle touches (cheaper, and enough when one never reaches
  // out of its square).
  reach?: number;
}

export class PerTown<T extends Town, S extends Placed> {
  towns: TownsLike<T>;
  // town id -> what it has, or null
  sites: Map<string, S | null>;
  protected search: Searches<S | null, T>;
  private prefix: string;
  private has: (t: T) => boolean;
  private reach?: number;

  constructor({ towns, prefix, has, grow, found, reach }: PerTownOptions<T, S>) {
    this.towns = towns;
    this.prefix = prefix;
    this.has = has;
    this.reach = reach;
    this.search = new Searches<S | null, T>({
      grow: (_id, t) => {
        const S = towns.size;
        const ci = Math.floor(t.x / S);
        const cj = Math.floor(t.z / S);
        return grow(t, [ci * S, cj * S, (ci + 1) * S, (cj + 1) * S], () => this.search.patient);
      },
      found: found && ((_id, site) => found(site)),
    });
    this.sites = this.search.known;
  }

  // Those asked about and not yet looked for.
  get queue() {
    return this.search.queue;
  }

  // What town t has, or null; looked for now if it hasn't been.
  forTown(t: T): S | null {
    const known = this.peek(t, false);
    return known !== undefined ? known : this.search.get(t.id, t);
  }

  // ...or undefined if it hasn't been, and then (if ask) it's queued for pump().
  peek(t: T, ask = true): S | null | undefined {
    const known = this.sites.get(t.id);
    if (known !== undefined) return known;
    if (!this.has(t)) return this.search.set(t.id, null);
    return this.search.peek(t.id, t, ask);
  }

  // Look for those queued for up to `ms` milliseconds. -> how many are left.
  pump(ms: number): number {
    return this.search.pump(ms);
  }

  // Those whose box overlaps a rectangle of the world. With wait = false,
  // only those already found (and the towns already known).
  within(x0: number, z0: number, x1: number, z1: number, wait = true): S[] {
    const out: S[] = [];
    const take = (t: T | null | undefined) => {
      if (!t) return;
      const s = wait ? this.forTown(t) : this.sites.get(t.id);
      if (s && s.box[0] <= x1 && s.box[2] >= x0 && s.box[1] <= z1 && s.box[3] >= z0) out.push(s);
    };
    if (this.reach !== undefined) {
      const m = this.reach;
      for (const t of this.towns.within(x0 - m, z0 - m, x1 + m, z1 + m, wait)) take(t);
      return out;
    }
    const S = this.towns.size;
    for (let j = Math.floor(z0 / S); j <= Math.floor(z1 / S); j++) {
      for (let i = Math.floor(x0 / S); i <= Math.floor(x1 / S); i++) take(wait ? this.towns.cell(i, j) : this.towns.peek(i, j));
    }
    return out;
  }

  // Ask for those of the towns known within r of (x, z) to be looked for in
  // the background.
  prefetch(x: number, z: number, r: number): void {
    for (const t of this.towns.within(x - r, z - r, x + r, z + r, false)) this.peek(t);
  }

  // The one with this id ('<prefix>:town:<i>:<j>'), or null.
  byId(id: string): S | null {
    const text = String(id);
    const m = text.startsWith(`${this.prefix}:`) && /^town:-?\d+:-?\d+$/.exec(text.slice(this.prefix.length + 1));
    const t = m ? this.towns.byId(m[0]) : null;
    return t ? this.forTown(t) : null;
  }
}
