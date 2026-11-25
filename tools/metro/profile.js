// How high the Metro's rails run: worked out once, by the importer, for every
// point of every track, from the ground the city stands on and what the map
// says each stretch is (in a tunnel, on a viaduct, on the ground).
//
// The tracks are one graph: a point where two lines' tracks meet is one
// point, so wherever they share a track they share its height. Each point
// says
//
//   f   the lowest the rail may run there (on the ground: over it, on its
//       ballast; on a viaduct: clear of what's under it), or -Infinity
//   c   the highest (in a tunnel: under the ground, with earth over the
//       tube), or Infinity
//   w   where it would like to be (a tunnel: as deep as the map's layer
//       says; a viaduct: well up; on the ground: on it)
//
// and the rail is the closest it can come to w without climbing or falling
// more than GRADE anywhere along the track, never under f, never over c.
// A station's platform is level: its points have f, c and w all its height.
//
// The way to that: the highest that can be (the largest GRADE-steep function
// under every c: `fall`) and the lowest (the smallest one over every f, or
// over that highest where it's lower: `rise`) are each one pass of
// Dijkstra's shortest paths, the cost of a step its length times GRADE. Wanted heights, smoothed along the track, are held
// between the two, and then lowered wherever they climb too steeply: the
// largest GRADE-steep function under them (`fall` again), which still keeps
// over the lowest, since that one is GRADE-steep too. A last light smoothing
// rounds the corners off the grades.
//
// No three.js, no fetching: hand it the graph.

export const GRADE = 0.04; // the steepest the Metro climbs (4 %)

// A graph: n points, and for each its neighbours along the track and how
// far each is (m): adj[i] = [[j, d], ...].

// A min-heap of [key, i], for Dijkstra.
class Heap {
  constructor() {
    this.k = [];
    this.v = [];
  }
  get size() {
    return this.k.length;
  }
  push(key, i) {
    const { k, v } = this;
    let n = k.length;
    k.push(key);
    v.push(i);
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (k[p] <= k[n]) break;
      [k[p], k[n]] = [k[n], k[p]];
      [v[p], v[n]] = [v[n], v[p]];
      n = p;
    }
  }
  pop() {
    const { k, v } = this;
    const top = [k[0], v[0]];
    const lk = k.pop();
    const lv = v.pop();
    if (k.length) {
      k[0] = lk;
      v[0] = lv;
      let n = 0;
      for (;;) {
        const a = 2 * n + 1;
        const b = a + 1;
        let m = n;
        if (a < k.length && k[a] < k[m]) m = a;
        if (b < k.length && k[b] < k[m]) m = b;
        if (m === n) break;
        [k[m], k[n]] = [k[n], k[m]];
        [v[m], v[n]] = [v[n], v[m]];
        n = m;
      }
    }
    return top;
  }
}

// The largest function under h that never changes faster than `grade` per
// metre along the graph: out[i] = min over j of h[j] + grade * dist(i, j).
export function fall(adj, h, grade = GRADE) {
  const n = h.length;
  const out = Float64Array.from(h);
  const heap = new Heap();
  for (let i = 0; i < n; i++) if (Number.isFinite(out[i])) heap.push(out[i], i);
  while (heap.size) {
    const [key, i] = heap.pop();
    if (key > out[i]) continue;
    for (const [j, d] of adj[i]) {
      const k = key + grade * d;
      if (k < out[j]) {
        out[j] = k;
        heap.push(k, j);
      }
    }
  }
  return out;
}

// The smallest function over h that never changes faster than `grade`.
export function rise(adj, h, grade = GRADE) {
  const neg = fall(
    adj,
    Array.from(h, (v) => -v),
    grade,
  );
  return Array.from(neg, (v) => -v);
}

// h averaged along the track, each point with those within about `reach` m
// of it (a Gaussian of that width, by distance along the graph).
export function smooth(adj, h, reach) {
  const n = h.length;
  const out = new Float64Array(n);
  const R = reach * 2;
  const dist = new Map();
  for (let i = 0; i < n; i++) {
    // the points within R of i, by a little Dijkstra of its own
    dist.clear();
    dist.set(i, 0);
    const heap = new Heap();
    heap.push(0, i);
    let sum = 0;
    let wsum = 0;
    while (heap.size) {
      const [d, a] = heap.pop();
      if (d > dist.get(a)) continue;
      const w = Math.exp(-0.5 * (d / reach) ** 2);
      sum += w * h[a];
      wsum += w;
      for (const [b, e] of adj[a]) {
        const db = d + e;
        if (db > R || db >= (dist.get(b) ?? Infinity)) continue;
        dist.set(b, db);
        heap.push(db, b);
      }
    }
    out[i] = sum / wsum;
  }
  return out;
}

// The rails' heights: { h, lo, hi, conflicts } where lo and hi are the
// lowest and highest they could have been, and conflicts the points where
// what's asked can't be had (the lowest over the highest).
// Where the two can't both be had, the highest wins: a tunnel is kept under
// the ground, and the track beside it is buried (the floor lowered to it),
// rather than a tube coming up through a hillside.
export function solveProfile(adj, { f, c, w, pinned, grade = GRADE, reach = 40, round = 25 }) {
  const hi = fall(adj, c, grade);
  const conflicts = [];
  for (let i = 0; i < f.length; i++) if (f[i] > hi[i] + 0.01) conflicts.push(i);
  // (under a GRADE-steep ceiling, the lowest over the floors keeps under it too)
  const lo = rise(
    adj,
    f.map((v, i) => Math.min(v, hi[i])),
    grade,
  );
  const fit = (v, i) => Math.max(lo[i], Math.min(hi[i], v));
  const wanted = smooth(adj, w, reach).map((v, i) => (pinned[i] ? w[i] : fit(v, i)));
  let h = fall(adj, wanted, grade);
  // round the corners off, and keep it where it has to be
  h = smooth(adj, h, round).map((v, i) => (pinned[i] ? w[i] : fit(v, i)));
  return { h, lo, hi, conflicts };
}
