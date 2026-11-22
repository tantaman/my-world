// Where a waterfall is, from the land it's on.
//
// A hike's card names its falls and says where each is, as a point on its
// stream (world/landform.js: `falls`). The drop itself is the land's: the
// real ground is a cliff there, and the stream's water, which never runs
// uphill, comes down it (Landform.settled). This finds that drop near the
// point the map gives, the steepest stretch of the stream within REACH of it,
// and says where the water leaves the lip and where it lands, so the falling
// water can be drawn between the two. Not every fall is a cliff: some are
// travertine steps the water spills down (Beaver Falls), and those come out
// as a cascade, the water pouring down the slope rather than off an edge.
//
// Pure: it reads a settled Landform (its stream pieces, and its ground) and
// knows nothing of three.js, so it can be tested in Node.

// m: how far along the stream from where the map puts a fall its drop is
// looked for. The map's point and the real cliff can be some way apart.
const REACH = 30;
// rise over run: a stretch of stream this steep is falling off an edge;
// less steep, it's spilling down a cascade. Less than GENTLE, it's running.
const FALLING = 0.6;
const GENTLE = 0.08;
// how much of its steepest a stretch either side has to keep to be part of
// the same fall
const KEEP = 0.4;
// m: a drop less than this is a riffle, not a fall
const LEAST = 0.5;
// m: how finely the ground is read between the stream's own points, to find
// the edge of the lip and the foot of the cliff
const PROBE = 0.25;
// m of stream that pieces are joined across: the end of one is the start
// of the next
const JOIN = 0.01;
// m above the foot where the falling water meets the pool's churn: below
// it, the ground is the bed, not the face
const SPLASH = 0.4;

// The stream pieces near (x, z) joined into runs: [{ P: [[x, z], ...], W: [...],
// s: [...], half: [...] }], each the way it flows, W its water level and half
// its half-width at each point.
function runsNear(land, x, z) {
  const segs = land.segs.filter((g) => g.minX <= x + REACH && g.maxX >= x - REACH && g.minZ <= z + REACH && g.maxZ >= z - REACH);
  const runs = [];
  const used = new Set();
  const first = (g) => [g.pts[0], g.pts[1]];
  const last = (g) => [g.pts[g.count * 2], g.pts[g.count * 2 + 1]];
  const meets = (a, b) => Math.abs(a[0] - b[0]) < JOIN && Math.abs(a[1] - b[1]) < JOIN;
  for (const g of segs) {
    if (used.has(g)) continue;
    // back to the first piece of the run, then forward to its last
    let head = g;
    for (let prev = segs.find((o) => !used.has(o) && o !== head && meets(last(o), first(head))); prev && prev !== g; prev = segs.find((o) => !used.has(o) && o !== head && meets(last(o), first(head)))) head = prev;
    const run = { P: [], W: [], s: [], half: [] };
    let along = 0;
    for (let piece = head; piece && !used.has(piece); piece = segs.find((o) => !used.has(o) && meets(first(o), last(piece)))) {
      used.add(piece);
      for (let i = run.P.length ? 1 : 0; i <= piece.count; i++) {
        const p = [piece.pts[i * 2], piece.pts[i * 2 + 1]];
        if (run.P.length) along += Math.hypot(p[0] - run.P[run.P.length - 1][0], p[1] - run.P[run.P.length - 1][1]);
        run.P.push(p);
        run.W.push(piece.W[i]);
        run.s.push(along);
        run.half.push(piece.w0 + ((piece.w1 - piece.w0) * i) / piece.count);
      }
    }
    if (run.P.length > 1) runs.push(run);
  }
  return runs;
}

// The fall near (x, z) on settled land `land` (a Landform whose stream
// pieces are made): where its water leaves the lip and where it lands, as
// world x, y, z, which way it falls (dx, dz, along the ground, of length 1),
// how wide the water is at the lip (m), how far it drops (m), and whether it
// is a cascade (spilling down a slope) rather than falling off an edge. Or
// null, if no stretch of stream near there falls far enough to be a fall.
// The edge and the foot are found on the real ground (the land's own, before
// the stream's channel is cut into it).
export function findFall(land, x, z) {
  const ground = (gx, gz) => land.raw(gx, gz) + land.offset;
  let best = null;
  for (const run of runsNear(land, x, z)) {
    const { P, W, s } = run;
    // the steepest step of it within REACH of the map's point
    let k = -1;
    let steep = GENTLE;
    for (let i = 0; i + 1 < P.length; i++) {
      const near = Math.hypot(P[i][0] - x, P[i][1] - z) < REACH || Math.hypot(P[i + 1][0] - x, P[i + 1][1] - z) < REACH;
      const run1 = s[i + 1] - s[i];
      const slope = run1 > 0 ? (W[i] - W[i + 1]) / run1 : 0;
      if (near && slope > steep) [k, steep] = [i, slope];
    }
    if (k < 0) continue;
    // out to either side while it keeps falling
    let a = k;
    let b = k + 1;
    const slopeOf = (i) => (W[i] - W[i + 1]) / Math.max(1e-6, s[i + 1] - s[i]);
    // (but anything steeper than half of falling is the same fall: a cliff
    // that drops sheer for part of the way is no less a fall either side)
    const keep = Math.max(GENTLE, Math.min(steep * KEEP, FALLING / 2));
    while (a > 0 && slopeOf(a - 1) > keep) a--;
    while (b < P.length - 1 && slopeOf(b) > keep) b++;
    const drop = W[a] - W[b];
    if (drop < LEAST || (best && drop <= best.drop)) continue;
    best = { run, a, b, drop, steep };
  }
  if (!best) return null;
  const { run, a, b } = best;
  const { P, W } = run;
  // which way it falls: from the lip to the foot
  let [dx, dz] = [P[b][0] - P[a][0], P[b][1] - P[a][1]];
  const len = Math.hypot(dx, dz) || 1;
  [dx, dz] = [dx / len, dz / len];
  // The stream's points are a few metres apart, and the cliff is between
  // them: read the ground along the line to find the edge it falls from (the
  // last of it still near the top) and its foot (the first of it near the bottom).
  const [top, bottom] = [W[a], W[b]];
  let lip = 0;
  let foot = len;
  for (let t = 0; t <= len; t += PROBE) {
    const g = ground(P[a][0] + dx * t, P[a][1] + dz * t);
    if (g > top - (top - bottom) * 0.15) lip = t;
  }
  for (let t = len; t >= lip; t -= PROBE) {
    const g = ground(P[a][0] + dx * t, P[a][1] + dz * t);
    if (g < bottom + (top - bottom) * 0.15) foot = t;
  }
  const at = (t) => [P[a][0] + dx * t, P[a][1] + dz * t];
  const [lx, lz] = at(lip);
  const [fx, fz] = at(Math.max(foot, lip + PROBE));
  return {
    top: [lx, top, lz],
    foot: [fx, bottom, fz],
    dir: [dx, dz],
    width: 2 * Math.max(run.half[a], run.half[Math.min(a + 1, P.length - 1)], 0.5),
    height: top - bottom,
    // how far (m) from the lip to the foot, along the ground
    run: Math.max(foot, lip + PROBE) - lip,
    cascade: best.steep < FALLING,
  };
}

// The falling water's shape, `rows` + 1 rows of it from the lip down to the
// foot: [[out, y], ...], how far out from the lip (m, the way it falls) it is
// at height y. Thrown out a little way and falling in an arc, or poured down
// the slope of a cascade, and never into the rock: ground(x, z) is the ground
// as it's drawn (the world's, the stream's channel and all).
export function curtain(fall, ground, rows) {
  const [lx, top, lz] = fall.top;
  const [dx, dz] = fall.dir;
  const h = fall.height;
  // thrown out as a jet from the lip: out ∝ √(down), as far as THROW of the drop
  const THROW = 0.12;
  const out = [];
  let clear = 0;
  for (let r = 0; r <= rows; r++) {
    const down = (h * r) / rows;
    // (a cascade's water pours down its slope, from the lip to the foot)
    let o = fall.cascade ? (fall.run * r) / rows : THROW * Math.sqrt(down * h);
    // and clear of the face below the lip: out to where the ground is under
    // the water, with a hand's breadth to spare (down to near the foot,
    // where it lands in the water and the ground is the pool's bed)
    const reach = Math.min(down, h - SPLASH);
    while (!fall.cascade && clear < h * 2 && ground(lx + dx * clear, lz + dz * clear) > top - reach - 0.15) clear += PROBE;
    o = Math.max(o, clear + 0.15, r ? out[r - 1][0] : 0);
    out.push([o, top - down]);
  }
  return out;
}
