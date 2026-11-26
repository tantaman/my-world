// The treasure map: the country round a hunt drawn in ink on old paper, the
// way whoever buried it would have drawn it. North up, the lie of the land in
// contours, water in a wash of blue-grey, the woods as little trees, the old
// place it begins at with its name, the mark on the way, the legs dotted out
// with their paces, and a red cross. No "you are here": it's a map, not the
// map (M).
//
//   survey(plan, { ground, depth, trees })   what's there, looked at once
//     ground(x, z)                the height of the ground
//     depth(x, z)                 how deep the water is (< 0 on dry land)
//     trees(x0, z0, x1, z1)       [[x, z, kind]] of the trees standing there
//   -> { plan, x0, z0, size, n, h, wet, trees }
//
//   const chart = new Chart({ input })   the panel, closed
//   chart.show(survey, glyph)    drawn, and open: glyph is the old place's,
//                                as the map has it (7 rows of 7, '#' inked)
//   chart.close(), chart.isOpen
//
// draw(ctx, survey, glyph, W) is the drawing alone, on a canvas W across.

import { MARKS, PACE } from './hunt.js';
import { mulberry32 } from '../noise.js';

const PAD = 32; // m of country round the way, on each side
const LEAST = 120; // m across, at least
const CELLS = 56; // squares across the survey
const INK = '#3b2a17';
const RED = '#a3231a';
const PAPER = '#ead8ac';
const PAPER_EDGE = '#b98f55';
const TREES = 420; // drawn at most

// ── Looking at the country ──────────────────────────────────────────────────
/**
 * @param {any} plan
 * @param {object} o
 * @param {(x: number, z: number) => number} o.ground
 * @param {(x: number, z: number) => number} o.depth
 * @param {(x0: number, z0: number, x1: number, z1: number) => Array<[number, number, string]>} [o.trees]
 */
export function survey(plan, { ground, depth, trees = () => [] }) {
  const pts = [plan.start, plan.legs[0].to, plan];
  let x0 = Math.min(...pts.map((p) => p.x)) - PAD;
  let z0 = Math.min(...pts.map((p) => p.z)) - PAD;
  const x1 = Math.max(...pts.map((p) => p.x)) + PAD;
  const z1 = Math.max(...pts.map((p) => p.z)) + PAD;
  const size = Math.max(LEAST, x1 - x0, z1 - z0);
  x0 = (x0 + x1) / 2 - size / 2;
  z0 = (z0 + z1) / 2 - size / 2;
  const n = CELLS;
  const N = n + 1;
  const h = new Float32Array(N * N);
  const wet = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = x0 + (i / n) * size;
      const z = z0 + (j / n) * size;
      let y = 0;
      let d = -1;
      try {
        y = ground(x, z);
        d = depth(x, z);
      } catch {
        // (the land there hasn't come: drawn as it is, flat and dry)
      }
      h[j * N + i] = y;
      wet[j * N + i] = Number.isFinite(d) ? d : -1;
    }
  }
  let found = [];
  try {
    found = trees(x0, z0, x0 + size, z0 + size);
  } catch {
    found = [];
  }
  // thinned evenly, if there are too many to draw
  const every = Math.max(1, Math.ceil(found.length / TREES));
  return { plan, x0, z0, size, n, h, wet, trees: found.filter((_, i) => i % every === 0) };
}

// ── Drawing it ──────────────────────────────────────────────────────────────
// Where (x, z) is on a canvas W across.
const place = (s, W) => (x, z) => [((x - s.x0) / s.size) * W, ((z - s.z0) / s.size) * W];

export function draw(ctx, s, glyph, W) {
  const plan = s.plan;
  const rnd = mulberry32((Math.floor(plan.x * 31 + plan.z * 17) | 0) >>> 0);
  const at = place(s, W);
  const cell = W / s.n;
  const N = s.n + 1;
  ctx.save();
  ctx.clearRect(0, 0, W, W);

  // The paper: torn round the edges, darker toward them, foxed here and there.
  const edge = [];
  const sides = 36;
  for (let k = 0; k < sides * 4; k++) {
    const side = Math.floor(k / sides);
    const t = (k % sides) / sides;
    const m = 9 + rnd() * 9;
    const p = [
      [m + t * (W - 2 * m), m],
      [W - m, m + t * (W - 2 * m)],
      [W - m - t * (W - 2 * m), W - m],
      [m, W - m - t * (W - 2 * m)],
    ][side];
    edge.push(p);
  }
  ctx.beginPath();
  edge.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  const g = ctx.createRadialGradient(W / 2, W / 2, W * 0.2, W / 2, W / 2, W * 0.72);
  g.addColorStop(0, PAPER);
  g.addColorStop(1, PAPER_EDGE);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(92, 58, 24, 0.75)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.clip();
  for (let k = 0; k < 90; k++) {
    ctx.fillStyle = `rgba(120, 80, 35, ${0.03 + rnd() * 0.06})`;
    ctx.beginPath();
    ctx.arc(rnd() * W, rnd() * W, 2 + rnd() * 14, 0, Math.PI * 2);
    ctx.fill();
  }

  // The lie of the land: shaded from the north-west, then contours.
  const H = (i, j) => s.h[Math.min(s.n, Math.max(0, j)) * N + Math.min(s.n, Math.max(0, i))];
  const step = s.size / s.n;
  for (let j = 0; j < s.n; j++) {
    for (let i = 0; i < s.n; i++) {
      const gx = (H(i + 1, j) - H(i - 1, j)) / (2 * step);
      const gz = (H(i, j + 1) - H(i, j - 1)) / (2 * step);
      const lit = (-gx - gz) * 0.7; // facing the north-west: lit
      ctx.fillStyle = lit < 0 ? `rgba(90, 58, 26, ${Math.min(0.28, -lit * 0.5)})` : `rgba(255, 246, 220, ${Math.min(0.2, lit * 0.4)})`;
      ctx.fillRect(i * cell, j * cell, cell + 0.6, cell + 0.6);
    }
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const y of s.h) {
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  const every = niceStep((hi - lo) / 8);
  for (let level = Math.ceil(lo / every) * every; level <= hi; level += every) {
    const major = Math.round(level / every) % 5 === 0;
    ctx.strokeStyle = major ? 'rgba(95, 60, 28, 0.55)' : 'rgba(110, 72, 35, 0.32)';
    ctx.lineWidth = major ? 1.4 : 0.9;
    contour(ctx, s.h, s.n, level, cell);
  }

  // Water: a wash, and its shore inked in.
  for (let j = 0; j < s.n; j++) {
    for (let i = 0; i < s.n; i++) {
      const d = (s.wet[j * N + i] + s.wet[j * N + i + 1] + s.wet[(j + 1) * N + i] + s.wet[(j + 1) * N + i + 1]) / 4;
      if (d > 0) {
        ctx.fillStyle = `rgba(62, 98, 118, ${Math.min(0.5, 0.2 + d * 0.15)})`;
        ctx.fillRect(i * cell, j * cell, cell + 0.6, cell + 0.6);
      }
    }
  }
  ctx.strokeStyle = 'rgba(40, 70, 92, 0.85)';
  ctx.lineWidth = 1.6;
  contour(ctx, s.wet, s.n, 0, cell);

  // The woods: a little tree for each, a spike for a conifer and a puff for the rest.
  ctx.strokeStyle = 'rgba(58, 42, 22, 0.6)';
  ctx.fillStyle = 'rgba(58, 42, 22, 0.22)';
  ctx.lineWidth = 1;
  for (const [x, z, kind] of s.trees) {
    const [px, py] = at(x, z);
    const r = 3.2 + rnd() * 1.4;
    ctx.beginPath();
    if (kind === 'pine') {
      ctx.moveTo(px, py - r * 1.5);
      ctx.lineTo(px + r * 0.8, py + r * 0.6);
      ctx.lineTo(px - r * 0.8, py + r * 0.6);
      ctx.closePath();
    } else ctx.arc(px, py - r * 0.4, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px, py + r * 0.6);
    ctx.lineTo(px, py + r * 1.2);
    ctx.stroke();
  }

  // The way: dotted from the old place to the mark, and on to the cross.
  const [sx, sy] = at(plan.start.x, plan.start.z);
  const [mx, my] = at(plan.legs[0].to.x, plan.legs[0].to.z);
  const [xx, xy] = at(plan.x, plan.z);
  ctx.setLineDash([2, 6]);
  ctx.lineCap = 'round';
  ctx.strokeStyle = RED;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(mx, my);
  ctx.lineTo(xx, xy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `italic ${Math.round(W / 36)}px Georgia, 'Times New Roman', serif`;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [leg, [ax, ay], [bx, by]] of [
    [plan.legs[0], [sx, sy], [mx, my]],
    [plan.legs[1], [mx, my], [xx, xy]],
  ]) {
    // its paces beside the middle of it, off to one side
    const dx = bx - ax;
    const dy = by - ay;
    const l = Math.hypot(dx, dy) || 1;
    label(ctx, `${leg.paces} paces`, (ax + bx) / 2 - (dy / l) * 16, (ay + by) / 2 + (dx / l) * 16);
  }

  // The old place, as its glyph, and its name.
  ctx.fillStyle = INK;
  const px = 3;
  if (glyph) {
    glyph.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] === '#') ctx.fillRect(sx + (i - 3.5) * px, sy + (j - 3.5) * px, px, px);
    });
  } else ctx.fillRect(sx - 6, sy - 6, 12, 12);
  ctx.font = `italic ${Math.round(W / 30)}px Georgia, 'Times New Roman', serif`;
  label(ctx, plan.start.name, sx, sy + (sy > W * 0.8 ? -24 : 24));

  // The mark on the way.
  markGlyph(ctx, plan.legs[0].to.mark, mx, my);
  ctx.font = `italic ${Math.round(W / 36)}px Georgia, 'Times New Roman', serif`;
  label(ctx, MARKS[plan.legs[0].to.mark].the, mx, my + (my > W * 0.8 ? -20 : 20));

  // X.
  ctx.strokeStyle = RED;
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(xx - 9, xy - 9);
  ctx.lineTo(xx + 9, xy + 9);
  ctx.moveTo(xx + 9, xy - 9);
  ctx.lineTo(xx - 9, xy + 9);
  ctx.stroke();

  // A compass rose, north up; the name of it; a bar of twenty paces.
  rose(ctx, W - W * 0.13, W * 0.14, W * 0.07);
  ctx.textAlign = 'left';
  ctx.font = `italic bold ${Math.round(W / 22)}px Georgia, 'Times New Roman', serif`;
  ctx.fillStyle = INK;
  ctx.fillText(plan.name.replace(/^the /, 'The '), W * 0.07, W * 0.09);
  const bar = ((20 * PACE) / s.size) * W;
  const by = W - W * 0.08;
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(W * 0.07, by);
  ctx.lineTo(W * 0.07 + bar, by);
  ctx.moveTo(W * 0.07, by - 4);
  ctx.lineTo(W * 0.07, by + 4);
  ctx.moveTo(W * 0.07 + bar, by - 4);
  ctx.lineTo(W * 0.07 + bar, by + 4);
  ctx.stroke();
  ctx.font = `italic ${Math.round(W / 40)}px Georgia, 'Times New Roman', serif`;
  ctx.fillText('twenty paces', W * 0.07 + bar + 8, by);
  ctx.restore();
}

// Words in ink, with the paper showing round them.
function label(ctx, text, x, y) {
  ctx.save();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(234, 216, 172, 0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = INK;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function markGlyph(ctx, kind, x, y) {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 1.6;
  if (kind === 'cairn') {
    for (const [dy, r] of [
      [3, 5],
      [-4, 4],
      [-9.5, 2.8],
    ]) {
      ctx.beginPath();
      ctx.ellipse(x, y + dy, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (kind === 'post') {
    ctx.fillRect(x - 1.5, y - 12, 3, 16);
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 9);
    ctx.lineTo(x + 4, y - 3);
    ctx.moveTo(x + 4, y - 9);
    ctx.lineTo(x - 4, y - 3);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(x + 6, y - 12);
    ctx.lineTo(x - 2, y + 4);
    ctx.moveTo(x - 8, y + 1);
    ctx.quadraticCurveTo(x - 1, y + 7, x + 5, y + 6);
    ctx.stroke();
  }
  ctx.restore();
}

function rose(ctx, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 8; k++) {
    const long = k % 2 === 0;
    const l = long ? r : r * 0.55;
    const w = long ? r * 0.16 : r * 0.1;
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, -l);
    ctx.lineTo(w, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -l);
    ctx.lineTo(-w, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle = PAPER;
    ctx.fill();
    ctx.stroke();
  }
  ctx.font = `bold ${Math.round(r * 0.5)}px Georgia, 'Times New Roman', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = RED;
  ctx.fillText('N', 0, -r - 2);
  ctx.restore();
}

// A round number near n for the space between contours (m): 1, 2, 5, 10, …
export function niceStep(n) {
  if (!(n > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(n));
  const f = n / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

// The line where a grid of values crosses `level` (marching squares), stroked
// as it is: each square's piece of it, cell px across.
function contour(ctx, vals, n, level, cell) {
  const N = n + 1;
  const pts = [];
  ctx.beginPath();
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = vals[j * N + i];
      const b = vals[j * N + i + 1];
      const c = vals[(j + 1) * N + i + 1];
      const d = vals[(j + 1) * N + i];
      pts.length = 0;
      const cross = (p, q, ip, jp, iq, jq) => {
        if (p < level === q < level) return;
        const t = (level - p) / (q - p);
        pts.push((ip + (iq - ip) * t) * cell, (jp + (jq - jp) * t) * cell);
      };
      cross(a, b, i, j, i + 1, j);
      cross(b, c, i + 1, j, i + 1, j + 1);
      cross(c, d, i + 1, j + 1, i, j + 1);
      cross(d, a, i, j + 1, i, j);
      for (let k = 0; k + 3 < pts.length; k += 4) {
        ctx.moveTo(pts[k], pts[k + 1]);
        ctx.lineTo(pts[k + 2], pts[k + 3]);
      }
    }
  }
  ctx.stroke();
}

// ── The panel ───────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SIDE = 520; // css px across the map

// What the map says to do, a line at a time.
export function directions(plan) {
  const [a, b] = plan.legs;
  return [`Begin at ${plan.start.name}.`, `Thence ${a.paces} paces ${a.way}, to ${MARKS[a.to.mark].a}.`, `From ${MARKS[a.to.mark].the}, ${b.paces} paces ${b.way}, and dig.`];
}

export class Chart {
  constructor({ input }) {
    this.input = input;
    this.isOpen = false;
    const root = document.createElement('div');
    root.id = 'treasure-map';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'The treasure map');
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <div class="tm-head"><h2>THE TREASURE MAP</h2><button type="button" data-act="close" aria-label="Close (Escape)">✕</button></div>
      <canvas width="${SIDE}" height="${SIDE}"></canvas>
      <ol class="tm-words"></ol>
      <p class="tm-note">Paces are walked, not as the crow flies: go straight. Lost count? Go back to the last mark and start again.</p>`;
    (document.getElementById('hud') || document.body).appendChild(root);
    this.root = root;
    this.canvas = root.querySelector('canvas');
    this.words = root.querySelector('.tm-words');
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="close"]')) this.close();
    });
    addEventListener('keydown', (e) => {
      if (this.isOpen && e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
  }

  show(s, glyph) {
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    this.canvas.width = this.canvas.height = Math.round(SIDE * dpr);
    const ctx = this.canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, s, glyph, SIDE);
    }
    this.words.innerHTML = directions(s.plan)
      .map((w) => `<li>${esc(w)}</li>`)
      .join('');
    if (this.isOpen) return;
    this.isOpen = true;
    this.input.setBlocked(true);
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.root.classList.add('open');
    this.root.setAttribute('aria-hidden', 'false');
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('open');
    this.root.setAttribute('aria-hidden', 'true');
    this.input.setBlocked(false);
  }
}
