// Shapes in plan: rings of [x, z, …] points (unclosed), as a real place's
// plan has them (the zoo's, Washington's): their area, what's inside one,
// how far a point is from the edge. Shared by the importers and the game.

// Signed area of a ring of [x, z, …] (unclosed).
export function area(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
}
export function inside(r, x, z) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [ax, az] = r[j];
    const [bx, bz] = r[i];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) c = !c;
  }
  return c;
}
export function centroid(r) {
  let [x, z] = [0, 0];
  for (const p of r) {
    x += p[0];
    z += p[1];
  }
  return [x / r.length, z / r.length];
}
// How far (m) (x, z) is from the edge of a ring.
export function edgeDistance(r, x, z) {
  let best = Infinity;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [ax, az] = r[j];
    const [bx, bz] = r[i];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
