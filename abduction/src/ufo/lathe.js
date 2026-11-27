// A lathe that keeps its creases: a profile of (radius, height) points swept
// round the Y axis, with each segment's normal its own wherever the profile
// turns by more than a crease angle, and averaged where it bends gently. So
// one profile gives a hull with crisp steps and smooth curves both, which
// three's LatheGeometry (smooth everywhere) cannot. The normal points to the
// right of the direction the profile runs in (outward for a profile that
// runs from the bottom of the axis outward, up the rim and back in over the
// top). Attributes: position, normal, uv (u round, v along the profile in
// metres) and `part`, a number the hull's material reads to tell its pieces
// apart.
import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu';

const CREASE = (35 * Math.PI) / 180;   // radians the profile must turn to make a crease

// profile: [[r, y], ...]; options: segments round, phiStart, phiLength (radians), part.
export function lathe(profile, { segments = 64, phiStart = 0, phiLength = Math.PI * 2, part = 0 } = {}) {
  // Each segment's own normal in the (r, y) plane.
  const segN = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const dr = profile[i + 1][0] - profile[i][0];
    const dy = profile[i + 1][1] - profile[i][1];
    const l = Math.hypot(dr, dy) || 1;
    segN.push([dy / l, -dr / l]);
  }
  // The normal at each end of each segment: shared with the neighbour when
  // the turn between them is gentle.
  const endN = (i, end) => {
    const own = segN[i];
    const j = end === 0 ? i - 1 : i + 1;
    if (j < 0 || j >= segN.length) return own;
    const other = segN[j];
    const turn = Math.acos(Math.max(-1, Math.min(1, own[0] * other[0] + own[1] * other[1])));
    if (turn > CREASE) return own;
    const nr = own[0] + other[0];
    const ny = own[1] + other[1];
    const l = Math.hypot(nr, ny) || 1;
    return [nr / l, ny / l];
  };

  const pos = [];
  const nor = [];
  const uvs = [];
  const parts = [];
  const index = [];
  let along = 0;
  for (let i = 0; i < segN.length; i++) {
    const [r0, y0] = profile[i];
    const [r1, y1] = profile[i + 1];
    const len = Math.hypot(r1 - r0, y1 - y0);
    const n0 = endN(i, 0);
    const n1 = endN(i, 1);
    const base = pos.length / 3;
    for (let s = 0; s <= segments; s++) {
      const f = s / segments;
      const phi = phiStart + f * phiLength;
      const c = Math.cos(phi);
      const sn = Math.sin(phi);
      // three's lathe convention: x = r sin(phi), z = r cos(phi); here x = r cos, z = r sin,
      // so angle 0 is +X, as atan(z, x) in the shaders reads it.
      pos.push(r0 * c, y0, r0 * sn, r1 * c, y1, r1 * sn);
      nor.push(n0[0] * c, n0[1], n0[0] * sn, n1[0] * c, n1[1], n1[0] * sn);
      uvs.push(f, along, f, along + len);
      parts.push(part, part);
    }
    for (let s = 0; s < segments; s++) {
      const a = base + s * 2;
      // Wound so the face's front is on the normal's side.
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    along += len;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setAttribute('part', new Float32BufferAttribute(parts, 1));
  g.setIndex(index);
  return g;
}

// Tags a geometry from three's own builders (boxes, cylinders) with a part
// and drops what the hull's merge does not share, so they merge with lathes.
export function tagged(geo, part) {
  const g = geo;
  const n = g.attributes.position.count;
  g.setAttribute('part', new Float32BufferAttribute(new Array(n).fill(part), 1));
  for (const name of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv', 'part'].includes(name)) g.deleteAttribute(name);
  }
  return g;
}
