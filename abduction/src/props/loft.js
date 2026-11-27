// A vehicle's skin as one smooth surface: rounded cross-sections lofted
// along X, each end rounded over and closed by a flat face. A section is a
// floor, two sides that bend at a waist (tucked in below it, leaning in
// above it, with an optional step in for a sedan's shoulder) and a roof,
// every corner a circular fillet. What a section is at each x comes from
// the caller (built from curve()), so one builder makes a van and a saloon.
//
// The skin is cut into parts that are painted apart (each side, the top,
// the floor, the two end faces), each with its own texture coordinates
// from an atlas (props/atlas.js), so windows, seams, livery and dirt are
// painted in metres where they belong. Normals are shared across the cuts,
// so the cuts do not show. Origin on the ground under the middle, nose +X.
import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu';

const STEP = 0.005;          // m: how finely a curve is sampled before it is softened
const SHOULDER_RISE = 0.03;  // m: the height over which a shoulder steps in
const SHOULDER_R = 0.012;    // m: the radius of that step's top edge

// A function of x through [[x, value], ...]: straight between the points,
// softened over `soften` metres (a box filter three times, near a Gaussian),
// level beyond the ends.
export function curve(points, soften = 0) {
  const pad = soften * 2 + STEP;
  const x0 = points[0][0] - pad;
  const x1 = points[points.length - 1][0] + pad;
  const n = Math.ceil((x1 - x0) / STEP) + 1;
  let v = new Float32Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * STEP;
    while (k < points.length - 2 && x > points[k + 1][0]) k++;
    const [xa, va] = points[k];
    const [xb, vb] = points[Math.min(k + 1, points.length - 1)];
    const f = xb > xa ? Math.min(1, Math.max(0, (x - xa) / (xb - xa))) : 0;
    v[i] = va + (vb - va) * f;
  }
  const r = Math.round(soften / STEP);
  for (let pass = 0; r > 0 && pass < 3; pass++) v = boxBlur(v, r);
  return (x) => {
    const f = (x - x0) / STEP;
    const i = Math.max(0, Math.min(n - 2, Math.floor(f)));
    const t = Math.max(0, Math.min(1, f - i));
    return v[i] + (v[i + 1] - v[i]) * t;
  };
}

function boxBlur(v, r) {
  const n = v.length;
  const out = new Float32Array(n);
  let sum = 0;
  const at = (i) => v[Math.max(0, Math.min(n - 1, i))];
  for (let i = -r; i <= r; i++) sum += at(i);
  for (let i = 0; i < n; i++) {
    out[i] = sum / (2 * r + 1);
    sum += at(i + r + 1) - at(i - r);
  }
  return out;
}

// How many points each piece of a half section gets: the same at every
// station, so the rings join up. Straight pieces count their inner points,
// fillets count both ends.
const N = { floor: 4, cornerLow: 6, sideLow: 9, waist: 4, step: 1, shoulder: 3, sideHigh: 9, cornerHigh: 8, roof: 6 };

// The fillet of the corner at q, between the line from p and the line to
// r, as `count` points along a circular arc (a rational quadratic Bezier),
// pushed onto out. The radius shrinks to fit half of either line.
function fillet(p, q, r, radius, count, out) {
  const ax = q[0] - p[0], ay = q[1] - p[1];
  const bx = r[0] - q[0], by = r[1] - q[1];
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  let t = 0;
  let w = 1;
  if (la > 1e-6 && lb > 1e-6 && radius > 0) {
    const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
    const turn = Math.acos(cos);
    if (turn > 1e-4) {
      t = Math.min(radius * Math.tan(turn / 2), la * 0.5, lb * 0.5);
      w = Math.cos(turn / 2);
    }
  }
  const s0 = [q[0] - (ax / (la || 1)) * t, q[1] - (ay / (la || 1)) * t];
  const s1 = [q[0] + (bx / (lb || 1)) * t, q[1] + (by / (lb || 1)) * t];
  for (let i = 0; i < count; i++) {
    const u = count === 1 ? 0.5 : i / (count - 1);
    const a = (1 - u) * (1 - u), b = 2 * u * (1 - u) * w, c = u * u;
    const d = a + b + c;
    out.push([(a * s0[0] + b * q[0] + c * s1[0]) / d, (a * s0[1] + b * q[1] + c * s1[1]) / d]);
  }
}

// `count` points strictly between the last point of out and `to`.
function between(out, to, count) {
  const from = out[out.length - 1];
  for (let i = 1; i <= count; i++) {
    const u = i / (count + 1);
    out.push([from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u]);
  }
}

// The right half (z >= 0) of a section, from the middle of the floor to the
// middle of the roof, as [z, y] points; d insets it all round (the ends'
// rounding). Also says where the floor gives way to the side and the side
// to the top (the middles of those two fillets).
export function halfSection(s, d = 0) {
  const bot = s.bot + d;
  const top = s.top - d;
  const hw = s.hw - d;
  const waist = Math.min(Math.max(s.waist, bot + 0.02), top - 0.02);
  const shoulderY = Math.min(waist + SHOULDER_RISE, top - 0.01);
  const q = [
    [0, bot],
    [hw - s.tuck, bot],
    [hw, waist],
    [hw - (s.shoulder ?? 0), shoulderY],
    [hw - (s.shoulder ?? 0) - s.lean, top],
    [0, top],
  ];
  const out = [q[0]];
  const firstFillet = (i, radius, count) => {
    const from = out[out.length - 1];
    // Points along the straight piece are placed once the fillet's start is known.
    const arc = [];
    fillet(q[i - 1], q[i], q[i + 1], radius, count, arc);
    return { from, arc };
  };
  const pieces = [
    [1, Math.max(s.rb - d, 0.004), N.floor, N.cornerLow],
    [2, s.rw ?? 0.03, N.sideLow, N.waist],
    [3, SHOULDER_R, N.step, N.shoulder],
    [4, Math.max(s.rt - d, 0.004), N.sideHigh, N.cornerHigh],
  ];
  const marks = {};
  for (const [i, radius, straight, count] of pieces) {
    const { arc } = firstFillet(i, radius, count);
    between(out, arc[0], straight);
    if (i === 1) marks.floor = out.length + (count >> 1);
    if (i === 4) marks.top = out.length + (count >> 1);
    out.push(...arc);
  }
  between(out, q[5], N.roof);
  out.push(q[5]);
  return { points: out, marks };
}

// The z of the skin's side at height y at station x (the right side; the
// left is its mirror), for setting things on it: handles, mirrors, trims.
export function sideZ(section, y) {
  const { points } = halfSection(section);
  let best = 0;
  for (let i = 1; i < points.length; i++) {
    const [z0, y0] = points[i - 1];
    const [z1, y1] = points[i];
    if ((y0 - y) * (y1 - y) <= 0 && y0 !== y1) {
      const z = z0 + ((z1 - z0) * (y - y0)) / (y1 - y0);
      best = Math.max(best, z);
    }
  }
  return best;
}

// The skin. spec:
//   section(x) -> { bot, top, hw, waist, tuck, lean, rb, rw, rt, shoulder }
//   stations: the x of every ring, rear to front, not counting the ends' rounding
//   rear, front: { x, r } the end faces and the radius they are rounded over by
//   uv: { side(x, y), sideL(x, y), top(x, z), floor(x, z), rear(z, y), front(z, y) } -> [u, v]
export function loftBody(spec) {
  const ROUND = 7;   // rings in each end's rounding
  const rings = [];  // { x, d }
  for (let k = 0; k <= ROUND; k++) {
    const a = (k / ROUND) * Math.PI * 0.5;
    rings.push({ x: spec.rear.x + spec.rear.r * (1 - Math.cos(a)), d: spec.rear.r * (1 - Math.sin(a)) });
  }
  for (const x of spec.stations) {
    if (x > spec.rear.x + spec.rear.r + 1e-3 && x < spec.front.x - spec.front.r - 1e-3) rings.push({ x, d: 0 });
  }
  for (let k = ROUND; k >= 0; k--) {
    const a = (k / ROUND) * Math.PI * 0.5;
    rings.push({ x: spec.front.x - spec.front.r * (1 - Math.cos(a)), d: spec.front.r * (1 - Math.sin(a)) });
  }

  // Every ring, closed: the right half then the left half back down.
  let H = 0;
  let marks = null;
  const P = rings.map(({ x, d }) => {
    const half = halfSection(spec.section(x), d);
    H = half.points.length;
    marks = half.marks;
    const ring = half.points.map(([z, y]) => [x, y, z]);
    for (let j = H - 2; j >= 1; j--) ring.push([x, half.points[j][1], -half.points[j][0]]);
    return ring;
  });
  const R = P[0].length;
  const S = P.length;
  const mirror = (j) => R - j;   // the left side's twin of right-side index j

  // Normals, area-weighted over the whole closed grid, so they agree across the cuts.
  const nrm = P.map((ring) => ring.map(() => [0, 0, 0]));
  const addTri = (a, b, c) => {
    const [ax, ay, az] = P[a[0]][a[1]], [bx, by, bz] = P[b[0]][b[1]], [cx, cy, cz] = P[c[0]][c[1]];
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (const [i, j] of [a, b, c]) { const m = nrm[i][j]; m[0] += n[0]; m[1] += n[1]; m[2] += n[2]; }
  };
  for (let i = 0; i < S - 1; i++) {
    for (let j = 0; j < R; j++) {
      const j1 = (j + 1) % R;
      addTri([i, j], [i + 1, j], [i, j1]);
      addTri([i, j1], [i + 1, j], [i + 1, j1]);
    }
  }
  for (const ring of nrm) for (const m of ring) { const l = Math.hypot(...m) || 1; m[0] /= l; m[1] /= l; m[2] /= l; }

  const pos = [], nor = [], uvs = [], idx = [];
  // A part: ring indices from j0 to j1 (wrapping), every station.
  const part = (j0, j1, uvOf) => {
    const js = [];
    for (let j = j0; ; j = (j + 1) % R) { js.push(j); if (j === j1) break; }
    const base = pos.length / 3;
    for (let i = 0; i < S; i++) {
      for (const j of js) {
        const [x, y, z] = P[i][j];
        pos.push(x, y, z);
        nor.push(...nrm[i][j]);
        uvs.push(...uvOf(x, y, z));
      }
    }
    const w = js.length;
    for (let i = 0; i < S - 1; i++) {
      for (let k = 0; k < w - 1; k++) {
        const a = base + i * w + k, b = a + 1, c = a + w, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
  };
  part(mirror(marks.floor), marks.floor, (x, y, z) => spec.uv.floor(x, z));
  part(marks.floor, marks.top, (x, y) => spec.uv.side(x, y));
  part(marks.top, mirror(marks.top), (x, y, z) => spec.uv.top(x, z));
  part(mirror(marks.top), mirror(marks.floor), (x, y) => spec.uv.sideL(x, y));

  // The end faces: a fan from the middle, flat.
  const cap = (i, sign, uvOf) => {
    const ring = P[i];
    let cy = 0, cz = 0;
    for (const p of ring) { cy += p[1]; cz += p[2]; }
    cy /= R; cz /= R;
    const x = ring[0][0];
    const base = pos.length / 3;
    pos.push(x, cy, cz); nor.push(sign, 0, 0); uvs.push(...uvOf(cz, cy));
    for (const [, y, z] of ring) { pos.push(x, y, z); nor.push(sign, 0, 0); uvs.push(...uvOf(z, y)); }
    for (let j = 0; j < R; j++) {
      const a = base + 1 + j, b = base + 1 + ((j + 1) % R);
      if (sign < 0) idx.push(base, a, b); else idx.push(base, b, a);
    }
  };
  cap(0, -1, spec.uv.rear);
  cap(S - 1, 1, spec.uv.front);

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

// Station x positions: every `step` metres from x0 to x1, and more round each
// wheel arch (centre xc, radius r, axle height yc, above the sill bot) so the
// arch is a clean circle, sorted and with near twins dropped.
export function stations(x0, x1, step, arches = []) {
  const xs = [];
  for (let x = x0; x <= x1 + 1e-6; x += step) xs.push(x);
  for (const { xc, r, yc, bot } of arches) {
    const a0 = Math.asin(Math.max(-1, Math.min(1, (bot - yc) / r)));
    for (let k = 0; k <= 32; k++) {
      const a = a0 + ((Math.PI - 2 * a0) * k) / 32;
      xs.push(xc - r * Math.cos(a));
    }
    xs.push(xc - r * Math.cos(a0) - 0.006, xc + r * Math.cos(a0) + 0.006);
  }
  xs.sort((a, b) => a - b);
  return xs.filter((x, i) => i === 0 || x - xs[i - 1] > 0.004);
}

// The sill raised over a wheel: max of the sill and the arch's circle.
export function archBottom(bot, arches) {
  return (x) => {
    let y = bot;
    for (const { xc, r, yc } of arches) {
      const dx = x - xc;
      if (Math.abs(dx) < r) y = Math.max(y, yc + Math.sqrt(r * r - dx * dx));
    }
    return y;
  };
}
