// Places nearest first, from anywhere, found only as far as they're asked for.
//
// What's grown on a grid of squares (the old places, the towns, the launch
// sites) can be anywhere in the world, and there's no end to it. To list it
// nearest first, the squares are looked at in order of how near they come,
// outward from where you are, and a place is let go only once no square
// still to be looked at could hold one nearer. So a list can be scrolled for
// ever, and costs only as much as has been scrolled.
//
// Every stream here, and a merge of streams, answers the same:
//   low      no place still to come is nearer than this (m); Infinity: no more
//   ready    { place, d }, the next one, once it's sure to be next; else null
//   take()   -> that, and move past it
//   work()   look a little further: 'more' (ask again), 'wait' (an owner is
//            still working something out: ask again next frame) or 'done'
//
// A caller pulls for as long as it can spare:
//   while (!stream.ready && stream.work() === 'more') if (late()) break;
//   if (stream.ready) list.push(stream.take());

// The places on a grid. options:
//   size     m, the side of a square
//   spill    m a place may lie outside its own square, at the most
//   origin   { x, z } where square (0, 0) starts (default the world's origin)
//   at(i, j) -> the places in square (i, j): [] for none, or undefined if its
//            owner hasn't looked yet and has been asked to (it'll be asked
//            again)
//   box(i, j) -> optional, and cheap: [x0, z0, x1, z1] its places all lie in,
//            null if it can't have any, undefined if it can't say (the square
//            and its spill). A square that is dear to look in (a launch
//            site's) then holds up the list only as far as its places can be.
//   far      m: nothing further than this
export class GridNearest {
  constructor(x, z, { size, spill = 0, origin = null, at, box = null, far = Infinity }) {
    this.x = x;
    this.z = z;
    this.size = size;
    this.spill = spill;
    this.ox = origin ? origin.x : 0;
    this.oz = origin ? origin.z : 0;
    this.at = at;
    this.box = box;
    this.far = far;
    this.seen = new Set(); // squares put in line to be gone over: "i,j"
    this.line = []; // ...and not yet: { i, j, low }, a heap on how near the square comes
    this.looks = []; // squares gone over and still to look in: a heap on how near their places can be
    this.waiting = []; // those whose owners are still looking
    this.found = []; // { place, d } found and not yet taken, nearest first
    this._queue(Math.floor((x - this.ox) / size), Math.floor((z - this.oz) / size));
  }

  // How near a box comes to where we are.
  _near(x0, z0, x1, z1) {
    const dx = Math.max(0, x0 - this.x, this.x - x1);
    const dz = Math.max(0, z0 - this.z, this.z - z1);
    return Math.hypot(dx, dz);
  }

  // Square (i, j) in line to be gone over, by how near it comes.
  _queue(i, j) {
    const k = `${i},${j}`;
    if (this.seen.has(k)) return;
    this.seen.add(k);
    const x0 = this.ox + i * this.size;
    const z0 = this.oz + j * this.size;
    heapPush(this.line, { i, j, low: Math.max(0, this._near(x0, z0, x0 + this.size, z0 + this.size) - this.spill) });
  }

  // The nearest a place in a square still to be looked in could be.
  get _bound() {
    let b = this.line.length ? this.line[0].low : Infinity;
    if (this.looks.length && this.looks[0].low < b) b = this.looks[0].low;
    for (const c of this.waiting) if (c.low < b) b = c.low;
    return b > this.far ? Infinity : b;
  }

  get low() {
    return Math.min(this.found.length ? this.found[0].d : Infinity, this._bound);
  }

  get ready() {
    const f = this.found[0];
    return f && f.d <= this._bound ? f : null;
  }

  take() {
    return this.ready ? this.found.shift() : null;
  }

  work() {
    const bound = this._bound;
    if (bound === Infinity) return 'done';
    const lineLow = this.line.length ? this.line[0].low : Infinity;
    const lookLow = this.looks.length ? this.looks[0].low : Infinity;
    // The nearest is a square an owner is still looking over: ask again.
    if (this.waiting.length && bound < Math.min(lineLow, lookLow)) {
      const asked = this.waiting;
      this.waiting = [];
      for (const c of asked) this._look(c);
      return this.waiting.length < asked.length ? 'more' : 'wait';
    }
    if (lookLow <= lineLow) this._look(heapPop(this.looks));
    else this._visit(heapPop(this.line));
    return 'more';
  }

  // Go over a square: in line to be looked in, by how near its places can
  // be; and its neighbours in line to be gone over (any square further out
  // is no nearer than one of these).
  _visit(c) {
    const b = this.box ? this.box(c.i, c.j) : undefined;
    if (b !== null) heapPush(this.looks, { i: c.i, j: c.j, low: b ? Math.max(c.low, this._near(...b)) : c.low });
    this._queue(c.i - 1, c.j);
    this._queue(c.i + 1, c.j);
    this._queue(c.i, c.j - 1);
    this._queue(c.i, c.j + 1);
  }

  _look(c) {
    const places = this.at(c.i, c.j);
    if (places === undefined) {
      this.waiting.push(c);
      return;
    }
    for (const place of places) {
      const d = Math.hypot(place.x - this.x, place.z - this.z);
      if (d <= this.far) insert(this.found, { place, d });
    }
  }
}

// A few places, all known: nearest first straight away.
export class ListNearest {
  constructor(x, z, places, far = Infinity) {
    this.found = places.map((place) => ({ place, d: Math.hypot(place.x - x, place.z - z) })).filter((f) => f.d <= far);
    this.found.sort((a, b) => a.d - b.d);
  }
  get low() {
    return this.found.length ? this.found[0].d : Infinity;
  }
  get ready() {
    return this.found[0] || null;
  }
  take() {
    return this.found.shift() || null;
  }
  work() {
    return 'done';
  }
}

// One place whose owner may still be working out where it is (or whether
// there is one). get() -> the place, null for none, or undefined while it's
// still being worked out (asked again on the next work()); low: how near it
// could be meanwhile (m).
export class PendingNearest {
  constructor(x, z, get, low = 0) {
    this.x = x;
    this.z = z;
    this.get = get;
    this.bound = low;
    this.list = null; // a ListNearest, once it's known
  }
  _known() {
    if (!this.list) {
      const place = this.get();
      if (place !== undefined) this.list = new ListNearest(this.x, this.z, place ? [place] : []);
    }
    return this.list;
  }
  get low() {
    return this.list ? this.list.low : this.bound;
  }
  get ready() {
    return this.list ? this.list.ready : null;
  }
  take() {
    return this.list ? this.list.take() : null;
  }
  work() {
    if (this.list) return 'done';
    return this._known() ? 'more' : 'wait';
  }
}

// Several streams as one, nearest first across them all. Whichever stream
// could still hold the nearest is the one asked to look further. A place
// more than one stream holds (by id) is let go once.
export class MergeNearest {
  constructor(streams) {
    this.streams = streams;
    this.seen = new Set();
  }
  _least() {
    let best = null;
    for (const s of this.streams) if (!best || s.low < best.low) best = s;
    return best;
  }
  get low() {
    const s = this._least();
    return s ? s.low : Infinity;
  }
  get ready() {
    this._skipSeen();
    const s = this._least();
    return s && s.ready && s.ready.d <= s.low ? s.ready : null;
  }
  take() {
    const r = this.ready;
    if (!r) return null;
    this._least().take();
    this.seen.add(r.place.id);
    return r;
  }
  work() {
    const s = this._least();
    if (!s || s.low === Infinity) return 'done';
    const r = s.work();
    return r === 'done' ? (this.low === Infinity ? 'done' : 'more') : r;
  }
  _skipSeen() {
    for (const s of this.streams) while (s.ready && this.seen.has(s.ready.place.id)) s.take();
  }
}

// A heap of { low }, least first.
function heapPush(h, c) {
  h.push(c);
  for (let k = h.length - 1; k > 0; ) {
    const up = (k - 1) >> 1;
    if (h[up].low <= h[k].low) break;
    [h[up], h[k]] = [h[k], h[up]];
    k = up;
  }
}
function heapPop(h) {
  const top = h[0];
  const last = h.pop();
  if (h.length) {
    h[0] = last;
    for (let k = 0; ; ) {
      const a = 2 * k + 1;
      const b = a + 1;
      let m = k;
      if (a < h.length && h[a].low < h[m].low) m = a;
      if (b < h.length && h[b].low < h[m].low) m = b;
      if (m === k) break;
      [h[m], h[k]] = [h[k], h[m]];
      k = m;
    }
  }
  return top;
}

function insert(list, f) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].d <= f.d) lo = mid + 1;
    else hi = mid;
  }
  list.splice(lo, 0, f);
}
