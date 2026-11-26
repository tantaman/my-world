// The land's own triangles, for something laid flat on it.
//
// Close to you the land is drawn a vertex every metre, on whole metres of the
// world, each square split along the diagonal from its (x+1, z) corner to its
// (x, z+1) corner (world/chunks.js, sampleHeight). Anything laid on it a few
// centimetres up (a city's paving, a town's street) follows it exactly only if
// it is cut along the same lines: then each piece lies in the plane of the
// triangle under it, and the land never pokes up through it.
//
//   for (const [a, b, c] of terrainTriangles(polygon, [ox, oz])) ...
//       polygon  [[x, z], ...], convex, in metres from some corner of yours
//       [ox, oz] where the world's whole metres fall in those coordinates
//                (0, 0 if your corner is on a whole metre)
//   clip(polygon, nx, nz, limit)   what of it has nx·x + nz·z <= limit
//
//   const h = gridSurface(height, 1);   the land as it is drawn, a vertex every
//   h(x, z)                             1 (2, 4) m, from heights at those vertices

export type Point = [number, number];

// Cut a convex polygon along the metre squares and their diagonals.
export function* terrainTriangles(points: Point[], [ox, oz]: Point): Generator<[Point, Point, Point]> {
  const zs = points.map((p) => p[1]);
  for (let j = Math.floor(Math.min(...zs) - oz); j < Math.ceil(Math.max(...zs) - oz); j++) {
    const z = j + oz;
    const row = clip(clip(points, 0, -1, -z), 0, 1, z + 1);
    if (row.length < 3) continue;
    const left = Math.floor(Math.min(...row.map((p) => p[0])) - ox);
    const right = Math.ceil(Math.max(...row.map((p) => p[0])) - ox);
    for (let i = left; i < right; i++) {
      const x = i + ox;
      const cell = clip(clip(row, -1, 0, -x), 1, 0, x + 1);
      if (cell.length < 3) continue;
      const diagonal = x + z + 1;
      for (const part of [clip(cell, 1, 1, diagonal), clip(cell, -1, -1, -diagonal)]) {
        for (let k = 2; k < part.length; k++) yield [part[0], part[k - 1], part[k]];
      }
    }
  }
}

// What of a polygon lies on the side of a line where nx·x + nz·z <= limit.
export function clip(poly: Point[], nx: number, nz: number, limit: number): Point[] {
  const out: Point[] = [];
  if (!poly.length) return out;
  let a = poly[poly.length - 1];
  let da = a[0] * nx + a[1] * nz - limit;
  for (const b of poly) {
    const db = b[0] * nx + b[1] * nz - limit;
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    if (db <= 0) out.push(b);
    a = b;
    da = db;
  }
  return out;
}

// The land as it is drawn with a vertex every G m (whole multiples of G in
// the world), split along the same diagonal: from the heights at those
// vertices, each asked once.
export function gridSurface(height: (x: number, z: number) => number, G: number): (x: number, z: number) => number {
  const asked = new Map<string, number>();
  const at = (x: number, z: number) => {
    const key = `${x},${z}`;
    let h = asked.get(key);
    if (h === undefined) asked.set(key, (h = height(x, z)));
    return h;
  };
  return (x, z) => {
    const x0 = Math.floor(x / G) * G;
    const z0 = Math.floor(z / G) * G;
    const u = (x - x0) / G;
    const v = (z - z0) / G;
    const b = at(x0 + G, z0);
    const c = at(x0, z0 + G);
    if (u + v <= 1) {
      const a = at(x0, z0);
      return a + (b - a) * u + (c - a) * v;
    }
    const d = at(x0 + G, z0 + G);
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  };
}
