// Boats on the map (M): each where it was left, and yours where you are while
// you're out in it. Drawn as a layer over the land (MapView.addLayer).

// 7 × 7 pixel icons, like the marks' ones: a canoe and a raft from above.
const ICONS = {
  canoe: ['...#...', '..###..', '..#.#..', '..#.#..', '..#.#..', '..###..', '...#...'],
  raft: ['.......', '#######', '#.#.#.#', '#######', '#.#.#.#', '#######', '.......'],
};
const INK = '#15140f';
const COLOUR = '#c9a46a';

// list() -> [{ kind, x, z, label }]
export function boatLayer(list) {
  return (pen) => {
    for (const b of list()) {
      const { sx, sy } = pen.toScreen(b.x, b.z);
      if (sx < -40 || sy < -40 || sx > pen.W + 200 || sy > pen.H + 40) continue;
      icon(pen, b.kind, sx, sy);
      pen.label(b.label, sx + 10 * pen.dpr + 6 * pen.unit, sy, COLOUR, 'left');
    }
  };
}

function icon(pen, kind, cx, cy) {
  const { ctx } = pen;
  const p = pen.unit * 2;
  const rows = ICONS[kind] || ICONS.canoe;
  const x0 = Math.round(cx - 4.5 * p);
  const y0 = Math.round(cy - 4.5 * p);
  ctx.fillStyle = 'rgba(10, 12, 8, 0.45)';
  ctx.fillRect(x0 + p, y0 + p, 9 * p, 9 * p);
  ctx.fillStyle = INK;
  ctx.fillRect(x0, y0, 9 * p, 9 * p);
  ctx.fillStyle = COLOUR;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) if (rows[y][x] === '#') ctx.fillRect(x0 + (x + 1) * p, y0 + (y + 1) * p, p, p);
}
