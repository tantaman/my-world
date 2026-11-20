// Mounts on the map (M): the circle to look in while you're still looking
// for one, the wild one where you last saw it, and yours where you left it.
// Drawn as a layer over the land (MapView.addLayer).

// 7 × 7 pixel icons, like the marks' ones: a horseshoe, a turtle from above,
// an eagle with its wings out.
const ICONS = {
  horse: ['..###..', '.#...#.', '#.....#', '#.....#', '#.....#', '##...##', '.#...#.'],
  turtle: ['...#...', '..###..', '#.###.#', '.#####.', '.#####.', '#.###.#', '...#...'],
  eagle: ['.......', '#.....#', '##.#.##', '.#####.', '..###..', '...#...', '..#.#..'],
};
const INK = '#15140f';
const FONT = (d) => `${11 * d}px ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;

// list() -> [{ kind, colour, area: { x, z, r } | null, at: { x, z } | null, label }]
export function mountLayer(list) {
  return (pen) => {
    const { ctx, dpr: d } = pen;
    ctx.font = FONT(d);
    ctx.textBaseline = 'middle';
    for (const m of list()) {
      if (m.area) area(pen, m);
      if (m.at) spot(pen, m);
    }
  };
}

// Somewhere in here: a dashed ring, faintly filled, its icon at the top.
function area(pen, m) {
  const { ctx, dpr: d } = pen;
  const { sx, sy } = pen.toScreen(m.area.x, m.area.z);
  const r = m.area.r * pen.scale;
  if (sx < -r || sy < -r || sx > pen.W + r || sy > pen.H + r) return;
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = m.colour;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.setLineDash([5 * d, 4 * d]);
  ctx.lineDashOffset = -pen.t * 6 * d;
  ctx.lineWidth = 2 * d;
  ctx.strokeStyle = m.colour;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  const top = sy - r;
  icon(pen, m.kind, m.colour, sx, Math.max(14 * d, top));
  pen.label(m.label, sx, Math.max(14 * d, top) + 16 * d, m.colour, 'center');
}

// Right here: its icon on a dark tile, and what it is.
function spot(pen, m) {
  const { sx, sy } = pen.toScreen(m.at.x, m.at.z);
  if (sx < -40 || sy < -40 || sx > pen.W + 200 || sy > pen.H + 40) return;
  icon(pen, m.kind, m.colour, sx, sy);
  pen.label(m.label, sx + 10 * pen.dpr + 6 * pen.unit, sy, m.colour, 'left');
}

function icon(pen, kind, colour, cx, cy) {
  const { ctx } = pen;
  const p = pen.unit * 2;
  const rows = ICONS[kind];
  const x0 = Math.round(cx - 4.5 * p);
  const y0 = Math.round(cy - 4.5 * p);
  ctx.fillStyle = 'rgba(10, 12, 8, 0.45)';
  ctx.fillRect(x0 + p, y0 + p, 9 * p, 9 * p);
  ctx.fillStyle = INK;
  ctx.fillRect(x0, y0, 9 * p, 9 * p);
  ctx.fillStyle = colour;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) if (rows[y][x] === '#') ctx.fillRect(x0 + (x + 1) * p, y0 + (y + 1) * p, p, p);
}
