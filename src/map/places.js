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
// A search in Routes (search.js) looks in every source that can say what it
// has (nearest or destinations), in a list or not: a place that's meant to be
// come upon rather than listed (the gate under the hill) can still be looked
// up by name.
//
// A place:
//   id       a string with a ':' in it, so it can't be taken for a mark's
//   x, z     where it is (and where tracking it leads)
//   name     its name ('Hollis cabin'); kind: what it is ('old cabin')
//   note     a line about it
//   words    optional: more it's found by in a search, what it's about
//            ('hell' for the gate, whose name doesn't say so)
//   glyph    7×7 rows of '#' and '.', drawn on its badge
//   visited  whether you've been there
//   shape    optional: polygons [[x, z], ...] in the world, drawn close up
//   ground   optional: polygons of open ground it has (a town's street),
//            drawn under its shapes at every zoom
//   yaw      optional: which way to face when `go here` sets you down at
//            x, z (the way in, say); otherwise the way you were facing

import { ListNearest, MergeNearest, FilterNearest, ReachNearest } from '../core/nearest.js';

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

  // What a search wants (match: search.js), from every source that can say
  // what it has, or from one list: a stream from each (core/nearest.js),
  // nearest to (x, z) first, for the caller to let go at its own pace, so
  // that one whose owner works it out a little each frame (the car
  // dealerships) doesn't hold up the rest. A source without end (nearest)
  // is looked over only as far as `reach` (m), and its stream is `cut` if it
  // stopped there; one that knows all it has (destinations) is looked over
  // to the ends of the earth, so a far place still turns up.
  search(x, z, match, list = null, reach = Infinity) {
    return this.sources
      .filter((s) => (s.nearest || s.destinations) && (!list || s.list === list))
      .map((s) => {
        const keep = (p) => match(p, s.list);
        if (s.nearest) return new ReachNearest(new FilterNearest(s.nearest(x, z), keep), reach);
        return new FilterNearest(new ListNearest(x, z, s.destinations()), keep);
      });
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
