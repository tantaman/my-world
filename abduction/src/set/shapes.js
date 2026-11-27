// Small geometry helpers the set and the props share: a box with softened
// edges standing where it is told, a wire or hose along points, and a mesh
// that casts and takes shadows. Every geometry keeps position, normal and uv
// only, so set/batch.js can merge it with anything else of its material.
import { Mesh, BoxGeometry, TubeGeometry, CatmullRomCurve3, Vector3 } from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

// A box from (x0, y0, z0) to (x1, y1, z1), its edges rounded by r metres
// (a plain box when r is 0).
export function boxMesh(x0, y0, z0, x1, y1, z1, material, r = 0) {
  const w = x1 - x0;
  const h = y1 - y0;
  const d = z1 - z0;
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const g = rr > 0.001 ? new RoundedBoxGeometry(w, h, d, 2, rr) : new BoxGeometry(w, h, d);
  const mesh = shadowed(new Mesh(g, material));
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return mesh;
}

// A wire, hose or conduit through points ([x, y, z] arrays), radius in metres.
export function tubeMesh(points, radius, material, { segments = 24, sides = 6 } = {}) {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)));
  return shadowed(new Mesh(new TubeGeometry(curve, segments, radius, sides), material));
}

// A wire hung between two points, sagging by `sag` metres in the middle.
export function sagging(a, b, sag, n = 6) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  return pts;
}
