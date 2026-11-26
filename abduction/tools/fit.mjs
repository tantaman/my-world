// Fits the camera for a still from points marked by hand: where a known
// place in the set (PLAN.md section 4, src/set/layout.js) is in the
// original's 1440x1080 frame. Prints the camera position, yaw, pitch and
// field of view that put them there through our lens (src/post/pipeline.js),
// for keying src/camera/path.js. Milestone 0's fitting, by numbers.
//
//   node abduction/tools/fit.mjs 01-establishing
//
// The marks are in MARKS below: [x, y, z] in the set, [px, py] in the frame.
import { LENS } from '../src/post/pipeline.js';

const MARKS = {
  '01-establishing': {
    guess: { x: -21, y: 1.5, z: 5, yaw: -10, pitch: 2, fov: 95, k: 0.4, lx: -12, ls: 22, lz: 17 },
    free: ['x', 'z', 'yaw', 'pitch', 'fov', 'lx', 'ls', 'lz'],
    points: [
      [[-3, 4.8, 0.2], [455, 400]],     // canopy fascia where it meets the shop
      [[-3, 4.8, 12], [1100, 398]],     // canopy's front west corner
      [[1.5, 0.25, 8], [860, 615]],     // column A, foot
      [[1.5, 4.5, 8], [858, 450]],      // column A, top
      [[-9, 0, 0], [270, 712]],         // shop's front west corner, foot
      [[-9, 3.4, 0], [272, 408]],       // and top of the wall
      [[-9.15, 2.7, -2.6], [120, 495]], // the west door's lamp
      // Street lamps' heads, from a row whose start, step and line are fitted too.
      [(c) => [c.lx, 5.5, c.lz], [1287, 323]],
      [(c) => [c.lx + c.ls, 5.5, c.lz], [1115, 441]],
      [(c) => [c.lx + 2 * c.ls, 5.5, c.lz], [1048, 486]],
      [(c) => [c.lx + 3 * c.ls, 5.5, c.lz], [1012, 510]],
      [(c) => [c.lx + 4 * c.ls, 5.5, c.lz], [990, 524]],
      [(c) => [c.lx + 5 * c.ls, 5.5, c.lz], [976, 533]],
    ],
  },
  // The saucer overhead. The near street lamp's pole bows: that fits the warp.
  '13-ufo-hover': {
    guess: { x: -2, y: 1.5, z: 15.5, yaw: 85, pitch: 20, fov: 110, k: 0.4, px: -0.5, pz: 16.5 },
    free: ['x', 'z', 'yaw', 'pitch', 'fov', 'px', 'pz'],
    points: [
      [[1, 0, 28], [742, 870]],         // the cow's feet
      [[1, 1.55, 28], [742, 808]],      // its back
      [[4, 0.6, 26.5], [612, 845]],     // a fence post (the nearest left of the cow: +X is left here)
      [[1, 12.4, 28], [716, 420]],      // the saucer's middle
      [[7, 12.4, 28], [508, 412]],      // its rim, left
      [[-5, 12.4, 28], [926, 412]],     // its rim, right
      [(c) => [c.px, 0.6, c.pz], [300, 1070]],   // the near pole, low
      [(c) => [c.px, 2.0, c.pz], [335, 760]],
      [(c) => [c.px, 3.5, c.pz], [385, 400]],
      [(c) => [c.px, 5.0, c.pz], [448, 30]],
    ],
  },
};

const ASPECT = 4 / 3;
const rad = (d) => (d * Math.PI) / 180;

// Where world point P lands in a 1440x1080 frame through camera c.
export function project(c, P, k = c.k ?? LENS.k) {
  if (typeof P === 'function') P = P(c);
  const yaw = rad(c.yaw);
  const pitch = rad(c.pitch);
  const f = [Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)];
  const r = [-Math.sin(yaw), 0, Math.cos(yaw)];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const v = [P[0] - c.x, P[1] - c.y, P[2] - c.z];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const zc = dot(v, f);
  if (zc <= 0.01) return null;
  const tanHalf = Math.tan(rad(c.fov) / 2);
  const q = [dot(v, r) / zc / tanHalf, dot(v, u) / zc / tanHalf];
  // Undo the warp q = p (1 + k |p|^2) fit, along the radius.
  const fit = 1 / (1 + k * ASPECT * ASPECT);
  const rq = Math.hypot(q[0], q[1]) / fit;
  let rp = rq;
  for (let i = 0; i < 30; i++) rp -= (rp * (1 + k * rp * rp) - rq) / (1 + 3 * k * rp * rp);
  const s = rq > 1e-9 ? rp / rq / fit : 1 / fit;
  return [720 + q[0] * s * 540, 540 - q[1] * s * 540];
}

function error(c, points) {
  let e = 0;
  for (const [P, px] of points) {
    const p = project(c, P);
    if (!p) return 1e12;
    e += (p[0] - px[0]) ** 2 + (p[1] - px[1]) ** 2;
  }
  return e;
}

// Nelder-Mead over the named keys.
function minimise(f, x0, keys, steps) {
  const toObj = (v) => { const o = { ...x0 }; keys.forEach((k, i) => { o[k] = v[i]; }); return o; };
  let simplex = [keys.map((k) => x0[k])];
  keys.forEach((k, i) => { const v = simplex[0].slice(); v[i] += steps[i]; simplex.push(v); });
  let vals = simplex.map((v) => f(toObj(v)));
  for (let it = 0; it < 4000; it++) {
    const order = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
    simplex = order.map((i) => simplex[i]);
    vals = order.map((i) => vals[i]);
    const n = keys.length;
    const c = simplex[0].map((_, j) => simplex.slice(0, n).reduce((s, v) => s + v[j], 0) / n);
    const at = (a) => c.map((cj, j) => cj + a * (simplex[n][j] - cj));
    const xr = at(-1); const fr = f(toObj(xr));
    if (fr < vals[0]) {
      const xe = at(-2); const fe = f(toObj(xe));
      if (fe < fr) { simplex[n] = xe; vals[n] = fe; } else { simplex[n] = xr; vals[n] = fr; }
    } else if (fr < vals[n - 1]) { simplex[n] = xr; vals[n] = fr; } else {
      const xc = at(0.5); const fc = f(toObj(xc));
      if (fc < vals[n]) { simplex[n] = xc; vals[n] = fc; } else {
        for (let i = 1; i <= n; i++) { simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j])); vals[i] = f(toObj(simplex[i])); }
      }
    }
  }
  return { best: toObj(simplex[0]), err: vals[0] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const name = process.argv[2] ?? '01-establishing';
  const m = MARKS[name];
  if (!m) { console.log('no marks for', name, '; have', Object.keys(MARKS).join(', ')); process.exit(1); }
  const keys = m.free ?? ['x', 'z', 'yaw', 'pitch', 'fov'];
  const STEP = { x: 2, y: 0.3, z: 2, yaw: 5, pitch: 3, fov: 8, k: 0.1, lx: 3, ls: 3, lz: 1, px: 1, pz: 1 };
  let run = minimise((c) => error(c, m.points), m.guess, keys, keys.map((k) => STEP[k]));
  for (let i = 0; i < 4; i++) run = minimise((c) => error(c, m.points), run.best, keys, keys.map((k) => STEP[k] * 0.5));
  const { best, err } = run;
  console.log(name, Object.fromEntries(Object.entries(best).map(([k, v]) => [k, +v.toFixed(2)])),
    'rms px', Math.sqrt(err / m.points.length).toFixed(1));
  for (const [P, px] of m.points) {
    const p = project(best, P);
    const at = typeof P === 'function' ? P(best).map((v) => +v.toFixed(1)) : P;
    console.log('  ', JSON.stringify(at).padEnd(20), 'wanted', px.join(','), 'got', p.map((v) => v.toFixed(0)).join(','));
  }
}
