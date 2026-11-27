// Surveys the set from the original's frames: solves where things stand
// (src/set/layout.js) and where the camera was at each marked moment, all
// at once, from points marked by hand in the original's 1440x1080 frames
// (tools/marks.mjs). One still alone can trade the camera's place against
// the set's (tools/fit.mjs does one at a time); many stills seen from
// different places pin both.
//
//   node abduction/tools/survey.mjs                  solve everything, print the layout and cameras
//   node abduction/tools/survey.mjs --only 01,04     only those frames (names or times)
//   node abduction/tools/survey.mjs --hold           the layout as it is in layout.js, cameras only
//   node abduction/tools/survey.mjs --free a,b       only those layout values move
//   node abduction/tools/survey.mjs --from out/s.json  start from an earlier solve (each writes out/survey.json, or --out)
//   node abduction/tools/survey.mjs --free-fov       each frame's field of view free too (checks FOV_TAN)
//   node abduction/tools/survey.mjs --keys           print the cameras as path.js keys
//
// Through our lens (src/post/pipeline.js LENS) and with the field of view
// the overlay reads at that moment (camera/path.js FOV), narrowed as
// the pipeline narrows it (FOV_TAN). Levenberg-Marquardt over every unknown,
// with soft priors that hold what no mark sees where layout.js has it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { LENS, drawnFov } from '../src/post/pipeline.js';
import { FOV } from '../src/camera/path.js';
import { EYE as EYE_SET } from '../src/set/layout.js';
// The camera's height: layout.js's, or --eye to try another (the set scales with it).
const EYE = process.argv.includes('--eye') ? +process.argv[process.argv.indexOf('--eye') + 1] : EYE_SET;
import { FRAMES, POINTS, LAYOUT, pointFn } from './marks.mjs';

const rad = (d) => (d * Math.PI) / 180;
export const overlayAt = (t) => FOV.sample(t, [0])[0];

// Pixels a prior's one sigma is worth, against marks' pixels.
const PRIOR_PX = 6;
// Degrees of roll a frame may have before it costs a prior's sigma.
const ROLL_SIGMA = 1.5;

// Where world point P lands in a 1440x1080 frame through camera c
// ({ x, y, z, yaw, pitch, roll, fov }, degrees; fov the drawn vertical one).
// Roll as main.js applies the hand's: the camera turned about its view axis.
export function project(c, P) {
  const yaw = rad(c.yaw);
  const pitch = rad(c.pitch);
  const f0 = Math.cos(pitch) * Math.cos(yaw), f1 = Math.sin(pitch), f2 = Math.cos(pitch) * Math.sin(yaw);
  const r0 = -Math.sin(yaw), r2 = Math.cos(yaw);
  // u = r x f
  const u0 = -r2 * f1, u1 = r2 * f0 - r0 * f2, u2 = r0 * f1;
  const v0 = P[0] - c.x, v1 = P[1] - c.y, v2 = P[2] - c.z;
  const zc = v0 * f0 + v1 * f1 + v2 * f2;
  if (zc <= 0.05) return null;
  const tanHalf = Math.tan(rad(c.fov) / 2);
  let qx = (v0 * r0 + v2 * r2) / zc / tanHalf;
  let qy = (v0 * u0 + v1 * u1 + v2 * u2) / zc / tanHalf;
  if (c.roll) {
    const a = rad(c.roll), ca = Math.cos(a), sa = Math.sin(a);
    const x = qx * ca + qy * sa;
    qy = -qx * sa + qy * ca;
    qx = x;
  }
  // Undo the warp q = p (1 + k |p|^2) zoom, along the radius.
  const k = LENS.k, zoom = LENS.zoom;
  const rq = Math.hypot(qx, qy) / zoom;
  let rp = rq;
  for (let i = 0; i < 20; i++) rp -= (rp * (1 + k * rp * rp) - rq) / (1 + 3 * k * rp * rp);
  const s = rq > 1e-9 ? rp / rq / zoom : 1 / zoom;
  return [720 + qx * s * 540, 540 - qy * s * 540];
}

// ---------------------------------------------------------------- the solve

// Every unknown in one vector: the layout's free values, then each frame's
// camera, then each mark's own (a place along a line, say).
function unknowns(frames, { hold, freeFov, only }) {
  const list = [];
  if (!hold) for (const [name, v] of Object.entries(LAYOUT)) if (v.sigma > 0 && (!only || only.includes(name))) list.push({ kind: 'L', name, v0: v.v, prior: v.prior ?? v.v, sigma: v.sigma, step: v.step ?? 0.01 });
  for (const f of frames) {
    const keys = [...(f.holdXZ ? [] : ['x', 'z']), 'yaw', 'pitch', 'roll', ...(f.freeY ? ['y'] : []), ...(freeFov || f.freeFov ? ['fov'] : [])];
    for (const k of keys) list.push({ kind: 'C', frame: f, name: k, v0: f.guess[k] ?? (k === 'roll' ? 0 : k === 'y' ? EYE : k === 'fov' ? drawnFov(overlayAt(f.t)) : 0), step: k === 'yaw' || k === 'pitch' || k === 'roll' || k === 'fov' ? 0.01 : 0.002 });
    f.marks.forEach((m, i) => { if (m[2] != null) list.push({ kind: 'U', frame: f, mark: i, v0: m[2], step: 0.002 }); });
  }
  return list;
}

function unpack(list, p, frames, layout) {
  const L = Object.fromEntries(Object.entries(LAYOUT).map(([k, v]) => [k, layout?.[k] ?? v.v]));
  const cams = new Map(frames.map((f) => [f, { y: EYE, roll: 0, fov: drawnFov(overlayAt(f.t)), ...(f.holdXZ ? { x: f.guess.x, z: f.guess.z } : {}) }]));
  const us = new Map();
  list.forEach((u, i) => {
    if (u.kind === 'L') L[u.name] = p[i];
    else if (u.kind === 'C') cams.get(u.frame)[u.name] = p[i];
    else us.set(`${frames.indexOf(u.frame)}:${u.mark}`, p[i]);
  });
  return { L, cams, us };
}

const pointOf = (spec, L, u) => (typeof spec === 'string' ? POINTS[spec](L, u) : typeof spec === 'function' ? spec(L, u) : spec);

function residuals(list, p, frames, out, layout) {
  const { L, cams, us } = unpack(list, p, frames, layout);
  let n = 0;
  frames.forEach((f, fi) => {
    const c = cams.get(f);
    f.marks.forEach((m, mi) => {
      const P = pointOf(m[0], L, us.get(`${fi}:${mi}`));
      const q = project(c, P);
      const w = m[3] ?? 1;
      if (!q) { out[n++] = 1000; out[n++] = 1000; return; }
      // A mark with no y (or no x) says only where across (or up) it is.
      out[n++] = m[1][0] == null ? 0 : (q[0] - m[1][0]) * w;
      out[n++] = m[1][1] == null ? 0 : (q[1] - m[1][1]) * w;
    });
    out[n++] = (c.roll / ROLL_SIGMA) * PRIOR_PX;
  });
  list.forEach((u, i) => { if (u.kind === 'L') out[n++] = ((p[i] - u.prior) / u.sigma) * PRIOR_PX; });
  return n;
}

// Solves A x = b for a small dense symmetric system (Gaussian elimination
// with partial pivoting).
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / d;
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / (M[r][r] || 1e-12);
  }
  return x;
}

export function survey(frames, opts = {}) {
  const list = unknowns(frames, opts);
  let p = list.map((u) => u.v0);
  const size = frames.reduce((s, f) => s + f.marks.length * 2 + 1, 0) + list.filter((u) => u.kind === 'L').length;
  const r = new Float64Array(size);
  const r2 = new Float64Array(size);
  const lay = opts.layout;
  const cost = (v) => { residuals(list, v, frames, r2, lay); let s = 0; for (const x of r2) s += x * x; return s; };
  let lambda = 1e-2;
  let c0 = cost(p);
  const J = list.map(() => new Float64Array(size));
  for (let it = 0; it < (opts.iterations ?? 60); it++) {
    residuals(list, p, frames, r, lay);
    list.forEach((u, i) => {
      const h = u.step;
      const q = p.slice(); q[i] += h;
      residuals(list, q, frames, r2, lay);
      for (let k = 0; k < size; k++) J[i][k] = (r2[k] - r[k]) / h;
    });
    const n = list.length;
    const A = Array.from({ length: n }, () => new Float64Array(n));
    const g = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const Ji = J[i];
      let s = 0;
      for (let k = 0; k < size; k++) s += Ji[k] * r[k];
      g[i] = -s;
      for (let j = i; j < n; j++) {
        const Jj = J[j];
        let t = 0;
        for (let k = 0; k < size; k++) t += Ji[k] * Jj[k];
        A[i][j] = A[j][i] = t;
      }
    }
    let improved = false;
    for (let tries = 0; tries < 10; tries++) {
      const Ad = A.map((row, i) => { const c = Array.from(row); c[i] += lambda * (row[i] + 1e-6); return c; });
      const d = solve(Ad, Array.from(g));
      const q = p.map((v, i) => v + d[i]);
      const c1 = cost(q);
      if (c1 < c0) { p = q; lambda = Math.max(1e-7, lambda / 3); improved = c0 - c1 > 1e-6 * c0; c0 = c1; break; }
      lambda *= 4;
    }
    if (!improved) break;
  }
  const { L, cams, us } = unpack(list, p, frames, lay);
  return { L, cams, us, list, p, cost: c0 };
}

// Which street lamp is which is a guess where the near ones are out of
// sight: a frame's lamps renumbered by s.
const LAMP = /^(head|foot|pole)\((-?\d+)(.*)\)$/;
export function shifted(f, s) {
  if (!s) return f;
  return { ...f, marks: f.marks.map((m) => {
    const g = LAMP.exec(m[4]);
    if (!g) return m;
    const spec = `${g[1]}(${+g[2] + s}${g[3]})`;
    return [pointFn(spec), m[1], m[2], m[3], spec];
  }) };
}

// Each frame's camera alone, against the layout as it stands, from several
// starts (and lamp numberings): a first guess for the joint solve, which
// from a poor one finds a poor minimum.
export function settle(frames, { shifts = [0], layout } = {}) {
  return frames.map((f) => {
    let best = null;
    for (const s of shifts) {
      for (const dyaw of [0, -20, 20]) {
        for (const [dx, dz] of f.holdXZ ? [[0, 0]] : [[0, 0], [-3, 0], [3, 0], [0, -3], [0, 3]]) {
          const g = { ...f.guess, yaw: f.guess.yaw + dyaw, x: f.guess.x + dx, z: f.guess.z + dz };
          const tf = { ...shifted(f, s), guess: g };
          const r = survey([tf], { hold: true, iterations: 40, layout });
          if (!best || r.cost < best.cost) best = { cost: r.cost, shift: s, frame: { ...tf, guess: { ...r.cams.get(tf) } } };
        }
      }
    }
    return best;
  });
}

// ---------------------------------------------------------------- the command

const fix = (v, n = 2) => +v.toFixed(n);

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const flag = (n) => args.includes(`--${n}`);
  const opt = (n) => { const i = args.indexOf(`--${n}`); return i < 0 ? null : args[i + 1]; };
  const only = opt('only')?.split(',');
  let frames = FRAMES.filter((f) => !only || only.some((o) => f.name.startsWith(o)));
  // --from out/survey.json: start from an earlier solve (its layout, and its cameras where it has them).
  const from = opt('from') ? JSON.parse(readFileSync(opt('from'), 'utf8')) : null;
  if (from) {
    // (Its values are where the solve starts; the priors stay at layout.js's.)
    for (const [k, v] of Object.entries(from.layout)) if (LAYOUT[k]) { LAYOUT[k].prior = LAYOUT[k].v; LAYOUT[k].v = v; }
    frames = frames.map((f) => (from.cams[f.name] ? { ...f, guess: from.cams[f.name] } : f));
  }
  // First each camera alone, then (unless --hold) everything together.
  const settled = settle(frames, { shifts: flag('shift') ? [0, -1, 1, -2, 2] : [0] });
  settled.forEach((b, i) => { if (b.shift) console.log(`${frames[i].name}: lamps renumbered by ${b.shift}`); });
  frames = settled.map((b) => b.frame);
  // --free a,b: only those layout values move.
  const res = flag('hold') ? survey(frames, { hold: true }) : survey(frames, { freeFov: flag('free-fov'), only: opt('free')?.split(',') });
  const { L, cams, us } = res;
  let total = 0, count = 0;
  for (const [fi, f] of frames.entries()) {
    const c = cams.get(f);
    let e = 0;
    const lines = [];
    f.marks.forEach((m, mi) => {
      const P = pointOf(m[0], L, us.get(`${fi}:${mi}`));
      const q = project(c, P) ?? [NaN, NaN];
      const d = Math.hypot(m[1][0] == null ? 0 : q[0] - m[1][0], m[1][1] == null ? 0 : q[1] - m[1][1]);
      e += d * d;
      lines.push(`     ${(typeof m[0] === 'string' ? m[0] : m[4] ?? 'point').padEnd(16)} wanted ${m[1].join(',').padEnd(9)} got ${q.map((v) => v.toFixed(0)).join(',').padEnd(9)} ${d > 12 ? `off ${d.toFixed(0)}` : ''}`);
    });
    total += e; count += f.marks.length;
    const fovNote = flag('free-fov') ? ` (overlay ${overlayAt(f.t).toFixed(1)} -> drawn ${drawnFov(overlayAt(f.t)).toFixed(1)})` : '';
    console.log(`${f.name.padEnd(14)} t ${String(f.t).padEnd(5)} x ${c.x.toFixed(2)} y ${c.y.toFixed(2)} z ${c.z.toFixed(2)} yaw ${c.yaw.toFixed(1)} pitch ${c.pitch.toFixed(1)} roll ${c.roll.toFixed(1)} fov ${c.fov.toFixed(1)}${fovNote}  rms ${Math.sqrt(e / f.marks.length).toFixed(1)} px (${f.marks.length})`);
    if (flag('v')) for (const l of lines) console.log(l);
  }
  console.log(`all: rms ${Math.sqrt(total / count).toFixed(1)} px over ${count} marks`);
  if (!flag('hold')) {
    console.log('layout:');
    for (const [k, v] of Object.entries(LAYOUT)) if (v.sigma > 0) console.log(`  ${k.padEnd(10)} ${fix(L[k]).toString().padEnd(8)} (was ${v.v})`);
  }
  // What this solve found, to start the next from (--from) and for the record.
  const out = opt('out') ?? 'out/survey.json';
  mkdirSync('out', { recursive: true });
  writeFileSync(out, JSON.stringify({
    layout: Object.fromEntries(Object.keys(LAYOUT).map((k) => [k, +L[k].toFixed(4)])),
    cams: Object.fromEntries(frames.map((f) => { const c = cams.get(f); return [f.name, Object.fromEntries(Object.entries(c).map(([k, v]) => [k, +v.toFixed(4)]))]; })),
  }, null, 1));
  if (flag('keys')) {
    for (const f of frames) { const c = cams.get(f); console.log(`  [${f.t}, ${c.x.toFixed(2)}, ${c.z.toFixed(2)}],   [${f.t}, ${c.yaw.toFixed(1)}, ${c.pitch.toFixed(1)}],`); }
  }
}
