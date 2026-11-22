// Places other features put on the map: an old cabin, a well, a dock. Unlike
// marks they aren't anyone's to move, name or delete — whoever owns them says
// where they are — but you can look one up on the map and track it like a
// mark.
//
//   map.places.addSource({                       // from src/landmarks/index.js
//     within(x0, z0, x1, z1) -> [place],          // what's in that part of the world
//     get(id) -> place | null,
//     list: 'old places',                         // optional: listed in Routes, under this,
//     nearest(x, z) -> stream,                    // ...nearest first and without end (core/nearest.js)
//     destinations() -> [place],                  // ...or, for a few places, all of them
//   });
//
// `within` may answer with only what it knows so far, and know more next
// frame: the map is drawn every frame it's open, so places fill in.
//
// A source can be only a list, without `within` or `get`, of places another
// source puts on the map (the hikes' views, under 'hikes').
//
// Routes lists, for each `list` name, what's in it nearest first, as far as
// it's scrolled. Sources may share a name (the forest's ski runs and the real
// ski resorts are both 'ski'). A stream needn't stop: it's only pulled as far
// as somebody scrolls.
//
// A place:
//   id       a string with a ':' in it, so it can't be taken for a mark's
//   x, z     where it is (and where tracking it leads)
//   name     its name ('Hollis cabin'); kind: what it is ('old cabin')
//   note     a line about it
//   glyph    7×7 rows of '#' and '.', drawn on its badge
//   visited  whether you've been there
//   shape    optional: polygons [[x, z], ...] in the world, drawn close up
//   ground   optional: polygons of open ground it has (a town's street),
//            drawn under its shapes at every zoom
//   yaw      optional: which way to face when `go here` sets you down at
//            x, z (the way in, say); otherwise the way you were facing

import { ListNearest, MergeNearest } from '../core/nearest.js';

export const PLACE_COLOR = '#e9dfc0';

const dress = (p) => ({ color: PLACE_COLOR, ...p });

export class Places {
  constructor() {
    this.sources = [];
  }

  addSource(source) {
    this.sources.push(source);
  }

  within(x0, z0, x1, z1) {
    const out = [];
    for (const s of this.sources) if (s.within) for (const p of s.within(x0, z0, x1, z1)) out.push(dress(p));
    return out;
  }

  // The names of the lists in Routes, in the order they're shown.
  lists() {
    return [...new Set(this.sources.filter((s) => s.list).map((s) => s.list))].sort();
  }

  // What's in a list (or in every list, without one), nearest to (x, z)
  // first: a stream (core/nearest.js).
  around(x, z, list = null) {
    const streams = this.sources
      .filter((s) => s.list && (!list || s.list === list))
      .map((s) => (s.nearest ? s.nearest(x, z) : new ListNearest(x, z, s.destinations ? s.destinations() : [])));
    return new MergeNearest(streams);
  }

  get(id) {
    if (typeof id !== 'string' || !id.includes(':')) return null;
    for (const s of this.sources) {
      const p = s.get && s.get(id);
      if (p) return dress(p);
    }
    return null;
  }

  // Up to n places within r of (x, z), nearest first: [{ place, d }]
  nearest(x, z, r, n) {
    return this.within(x - r, z - r, x + r, z + r)
      .map((place) => ({ place, d: Math.hypot(place.x - x, place.z - z) }))
      .filter(({ d }) => d <= r)
      .sort((a, b) => a.d - b.d)
      .slice(0, n);
  }
}
